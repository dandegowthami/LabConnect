import mongoose from 'mongoose';
import path from 'node:path';
import Report from '../models/Report.js';
import ReportAuditEvent from '../models/ReportAuditEvent.js';
import TestOrder from '../models/TestOrder.js';
import { deletePrivatePdf, openPrivatePdf, storePrivatePdf, validatePdf, validateStoredPdf } from '../services/pdfService.js';
import { findReportByIdentifier, getReportDetails, isPdfAvailable, listStaffReports } from '../services/reportService.js';
import { sendReportDelivery } from '../services/deliveryService.js';
import DeliveryLog from '../models/DeliveryLog.js';

function notFound(res) {
  res.status(404).json({ success: false, message: 'Report not found' });
}

async function reportHasMatchingOrder(report) {
  return Boolean(await TestOrder.exists({ _id: report.orderId, patientId: report.patientId }));
}

export async function getReport(req, res, next) {
  try {
    const filter = req.auth.role === 'patient' ? { patientId: req.patientId } : {};
    const report = await getReportDetails(req.params.reportId, filter);
    if (!report) {
      notFound(res);
      return;
    }
    if (req.auth.role === 'patient' && !report.pdfAvailable) {
      res.status(409).json({ success: false, message: 'The signed report is not ready for viewing' });
      return;
    }
    res.status(200).json({ success: true, data: { report } });
  } catch (error) {
    next(error);
  }
}

export async function getStaffReports(req, res, next) {
  try {
    const data = await listStaffReports(req.query);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function uploadSignedPdf(req, res, next) {
  let storageKey;
  let auditEvent;
  let savedReport;
  let report;
  try {
    if (!req.file) {
      res.status(400).json({ success: false, message: 'A PDF file is required' });
      return;
    }
    await validatePdf(req.file.buffer);

    report = await findReportByIdentifier(req.params.reportId);
    if (!report) {
      notFound(res);
      return;
    }
    if (!(await reportHasMatchingOrder(report))) {
      res.status(409).json({ success: false, message: 'The report and order are not associated with the same patient' });
      return;
    }
    if (report.reportStatus === 'Cancelled') {
      res.status(409).json({ success: false, message: 'A cancelled report cannot receive a signed PDF' });
      return;
    }
    if (report.pdfStorageKey || report.signedAt) {
      res.status(409).json({ success: false, message: 'A PDF already exists for this report; it cannot be overwritten' });
      return;
    }

    storageKey = await storePrivatePdf(req.file.buffer);
    const originalFilename = path.posix.basename(req.file.originalname.replaceAll('\\', '/'))
      .replace(/[\u0000-\u001f\u007f]/g, '')
      .slice(0, 255) || 'report.pdf';
    auditEvent = await ReportAuditEvent.create({
      action: 'pdf-uploaded',
      report: report._id,
      actorId: req.auth.sub
    });
    savedReport = await Report.findOneAndUpdate(
      { _id: report._id, pdfStorageKey: null, signedAt: null, reportStatus: { $ne: 'Cancelled' } },
      {
        $set: {
          pdfStorageKey: storageKey,
          pdfMetadata: {
            originalFilename,
            mimeType: 'application/pdf',
            fileSize: req.file.size,
            uploadedAt: new Date(),
            uploadedBy: new mongoose.Types.ObjectId(req.auth.sub)
          }
        }
      },
      { new: true, runValidators: true }
    ).select('-pdfStorageKey');

    if (!savedReport) {
      await ReportAuditEvent.deleteOne({ _id: auditEvent._id });
      auditEvent = null;
      await deletePrivatePdf(storageKey);
      storageKey = null;
      res.status(409).json({ success: false, message: 'A PDF already exists or this report is no longer available for upload' });
      return;
    }

    res.status(201).json({
      success: true,
      message: 'PDF uploaded securely. Confirm the report is signed before making it available to patients.',
      data: {
        reportId: savedReport.reportId,
        pdfUploaded: true,
        reportStatus: savedReport.reportStatus,
        pdfAvailable: false
      }
    });
  } catch (error) {
    const cleanupErrors = [];
    if (storageKey) {
      if (savedReport) {
        try {
          await Report.updateOne({ _id: report._id, pdfStorageKey: storageKey }, {
            $set: { pdfStorageKey: null, pdfMetadata: null }
          });
        } catch (cleanupError) {
          cleanupErrors.push(cleanupError);
        }
      }
      try {
        await deletePrivatePdf(storageKey);
      } catch (cleanupError) {
        cleanupErrors.push(cleanupError);
      }
    }
    if (auditEvent) {
      try {
        await ReportAuditEvent.deleteOne({ _id: auditEvent._id });
      } catch (cleanupError) {
        cleanupErrors.push(cleanupError);
      }
    }
    next(cleanupErrors.length
      ? new AggregateError([error, ...cleanupErrors], 'PDF upload failed and cleanup was incomplete')
      : error);
  }
}

export async function confirmReportSigned(req, res, next) {
  try {
    const report = await findReportByIdentifier(req.params.reportId);
    if (!report) {
      notFound(res);
      return;
    }
    if (!(await reportHasMatchingOrder(report))) {
      res.status(409).json({ success: false, message: 'The report and order are not associated with the same patient' });
      return;
    }
    if (!report.pdfStorageKey || !report.pdfMetadata) {
      res.status(409).json({ success: false, message: 'Upload a valid PDF before confirming the report' });
      return;
    }
    if (report.reportStatus === 'Cancelled') {
      res.status(409).json({ success: false, message: 'A cancelled report cannot be marked Ready' });
      return;
    }
    if (report.signedAt && report.reportStatus === 'Ready') {
      const delivery = await DeliveryLog.findOne({ reportId: report._id })
        .sort({ createdAt: -1 })
        .select('channel destinationMasked status sentAt failureReason createdAt')
        .lean();
      res.status(200).json({
        success: true,
        message: 'This report was already signed and marked Ready; no duplicate notification was sent',
        data: {
          reportId: report.reportId,
          reportStatus: report.reportStatus,
          signedAt: report.signedAt,
          alreadyReady: true,
          delivery
        }
      });
      return;
    }
    if (report.signedAt) {
      res.status(409).json({ success: false, message: 'This report has already been signed' });
      return;
    }
    await validateStoredPdf(report.pdfStorageKey);

    const order = await TestOrder.findById(report.orderId).select('status');
    if (!order || order.status === 'Cancelled') {
      res.status(409).json({ success: false, message: 'The associated order is unavailable or cancelled' });
      return;
    }

    const signedAt = new Date();
    const auditEvent = await ReportAuditEvent.create({
      action: 'signed-confirmed',
      report: report._id,
      actorId: req.auth.sub
    });
    let updatedReport;
    try {
      updatedReport = await Report.findOneAndUpdate(
        { _id: report._id, pdfStorageKey: report.pdfStorageKey, signedAt: null, reportStatus: { $ne: 'Cancelled' } },
        { $set: { reportStatus: 'Ready', signedAt } },
        { new: true }
      ).select('-pdfStorageKey');
      if (!updatedReport) {
        await ReportAuditEvent.deleteOne({ _id: auditEvent._id });
        res.status(409).json({ success: false, message: 'The report changed and could not be confirmed' });
        return;
      }

      const orderUpdate = await TestOrder.updateOne(
        { _id: report.orderId, status: order.status },
        { $set: { status: 'Ready' } }
      );
      if (!orderUpdate.matchedCount) {
        await Report.updateOne({ _id: report._id, reportStatus: 'Ready', signedAt }, {
          $set: { reportStatus: report.reportStatus, signedAt: null }
        });
        await ReportAuditEvent.deleteOne({ _id: auditEvent._id });
        res.status(409).json({ success: false, message: 'The associated order changed and could not be marked Ready' });
        return;
      }
    } catch (error) {
      const cleanupErrors = [];
      if (updatedReport) {
        try {
          await Report.updateOne({ _id: report._id, reportStatus: 'Ready', signedAt }, {
            $set: { reportStatus: report.reportStatus, signedAt: null }
          });
        } catch (cleanupError) {
          cleanupErrors.push(cleanupError);
        }
      }
      try {
        await ReportAuditEvent.deleteOne({ _id: auditEvent._id });
      } catch (cleanupError) {
        cleanupErrors.push(cleanupError);
      }
      next(cleanupErrors.length
        ? new AggregateError([error, ...cleanupErrors], 'Sign-off failed and cleanup was incomplete')
        : error);
      return;
    }

    let delivery;
    try {
      delivery = await sendReportDelivery({
        reportId: report._id,
        channel: 'SMS',
        createdBy: req.auth.sub
      });
    } catch {
      delivery = { status: 'Failed', failureReason: 'The notification could not be prepared; staff can retry delivery' };
    }

    res.status(200).json({
      success: true,
      message: delivery.status === 'Sent'
        ? 'Report marked signed and Ready. Notification was simulated; no real message was sent.'
        : 'Report marked signed and Ready, but notification failed. Staff can retry delivery.',
      data: {
        reportId: updatedReport.reportId,
        reportStatus: updatedReport.reportStatus,
        signedAt,
        delivery: {
          channel: delivery.channel || 'SMS',
          destinationMasked: delivery.destinationMasked,
          status: delivery.status,
          sentAt: delivery.sentAt,
          failureReason: delivery.failureReason
        }
      }
    });
  } catch (error) {
    next(error);
  }
}

export async function streamReportPdf(req, res, next) {
  try {
    const filter = req.auth.role === 'patient' ? { patientId: req.patientId } : {};
    const report = await findReportByIdentifier(req.params.reportId, filter);
    if (!report) {
      notFound(res);
      return;
    }
    if (!isPdfAvailable(report)) {
      res.status(409).json({ success: false, message: 'The signed report is not ready for viewing or download' });
      return;
    }

    const { stream, size } = await openPrivatePdf(report.pdfStorageKey);
    await ReportAuditEvent.create({
      action: req.pdfDisposition === 'download' ? 'pdf-downloaded' : 'pdf-viewed',
      report: report._id,
      actorId: req.auth.sub
    });

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Length': size,
      'Content-Disposition': `${req.pdfDisposition === 'download' ? 'attachment' : 'inline'}; filename="lab-report.pdf"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff'
    });
    stream.on('error', next);
    stream.pipe(res);
  } catch (error) {
    next(error);
  }
}
