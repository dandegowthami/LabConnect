import mongoose from 'mongoose';
import { z } from 'zod';
import Doctor from '../models/Doctor.js';
import Patient from '../models/Patient.js';
import Report from '../models/Report.js';
import ReportAuditEvent from '../models/ReportAuditEvent.js';
import TestOrder from '../models/TestOrder.js';
import { openPrivatePdf } from '../services/pdfService.js';
import { isPdfAvailable } from '../services/reportService.js';

const pageSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20)
});

function getPagination(query) {
  const parsed = pageSchema.safeParse(query);
  return parsed.success ? parsed.data : null;
}

function getDateRange(query) {
  const now = new Date();
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  ninetyDaysAgo.setHours(0, 0, 0, 0);
  const fromInput = query.from ? new Date(query.from) : ninetyDaysAgo;
  const fromIsDateOnly = typeof query.from === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(query.from);
  const isDateOnly = typeof query.to === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(query.to);
  const toInput = query.to ? new Date(query.to) : now;
  const from = fromIsDateOnly ? new Date(fromInput.setHours(0, 0, 0, 0)) : fromInput;
  const toEndOfDay = isDateOnly ? new Date(toInput.getTime() + 24 * 60 * 60 * 1000 - 1) : toInput;
  const to = toEndOfDay > now ? now : toEndOfDay;
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) return null;
  if (from < ninetyDaysAgo || to > now) return null;
  return { $gte: from, $lte: to };
}

function maskMobile(mobile) {
  return mobile ? `${mobile.slice(0, 2)}******${mobile.slice(-2)}` : null;
}

async function getDoctor(req) {
  if (!req.auth.doctorId || !mongoose.isValidObjectId(req.auth.doctorId)) return null;
  return Doctor.findById(req.auth.doctorId).select('doctorId name email registrationNumber').lean();
}

function reportIdentifierFilter(identifier) {
  if (typeof identifier !== 'string' || identifier.length > 110 || !/^[A-Za-z0-9._-]+$/.test(identifier)) return null;
  return mongoose.isValidObjectId(identifier)
    ? { $or: [{ reportId: identifier }, { _id: identifier }] }
    : { reportId: identifier };
}

async function findOwnedReport(req, identifier) {
  const idFilter = reportIdentifierFilter(identifier);
  if (!idFilter) return null;
  const doctor = await getDoctor(req);
  if (!doctor) return null;
  const now = new Date();
  const cutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const report = await Report.findOne(idFilter).select('+pdfStorageKey');
  if (!report) return null;
  const order = await TestOrder.findOne({
    _id: report.orderId,
    patientId: report.patientId,
    referringDoctorId: doctor._id,
    orderDate: { $gte: cutoff, $lte: now }
  }).lean();
  if (!order) return null;
  const patient = await Patient.findOne({ _id: report.patientId, consentStatus: 'granted' })
    .select('patientId fullName mobile').lean();
  if (!patient) return null;
  return { report, order, patient, doctor };
}

function sendMissing(res) {
  res.status(404).json({ success: false, message: 'Report not found or not available to this doctor' });
}

export async function getDoctorMe(req, res, next) {
  try {
    const doctor = await getDoctor(req);
    if (!doctor) {
      res.status(403).json({ success: false, message: 'A linked referring doctor account is required' });
      return;
    }
    res.status(200).json({ success: true, data: { doctor } });
  } catch (error) {
    next(error);
  }
}

async function getDoctorRecords(req, res, { dashboard = false, patientsOnly = false } = {}) {
  const doctor = await getDoctor(req);
  if (!doctor) {
    res.status(403).json({ success: false, message: 'A linked referring doctor account is required' });
    return;
  }
  const pagination = getPagination(req.query);
  const dateRange = getDateRange(req.query);
  const search = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (!pagination || !dateRange || search.length > 100) {
    res.status(400).json({ success: false, message: 'Use dates within the last 90 days and valid search/pagination values' });
    return;
  }

  const patientFilter = { consentStatus: 'granted' };
  let exactOrder = null;
  if (search) {
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'i');
    patientFilter.$or = [{ patientId: search }, { fullName: regex }];
    exactOrder = await TestOrder.findOne({
      referringDoctorId: doctor._id,
      orderDate: dateRange,
      orderId: search
    }).select('_id patientId').lean();
    if (exactOrder) patientFilter.$or.push({ _id: exactOrder.patientId });
  }
  const patients = await Patient.find(patientFilter).select('_id patientId fullName mobile').lean();
  const orderFilter = {
    referringDoctorId: doctor._id,
    orderDate: dateRange,
    ...(patients.length ? { patientId: { $in: patients.map(({ _id }) => _id) } } : {})
  };
  if (search && !patients.length) orderFilter.patientId = null;
  if (exactOrder) orderFilter._id = exactOrder._id;
  const orders = await TestOrder.find(orderFilter).select('orderId patientId orderDate status').sort({ orderDate: -1 }).lean();
  const reports = orders.length
    ? await Report.find({ orderId: { $in: orders.map(({ _id }) => _id) }, patientId: { $in: patients.map(({ _id }) => _id) } })
      .select('reportId orderId patientId reportStatus signedAt criticalReviewStatus +pdfStorageKey').lean()
    : [];
  const ordersById = new Map(orders.map((order) => [String(order._id), order]));
  const patientsById = new Map(patients.map((patient) => [String(patient._id), patient]));
  const rows = reports.map((report) => {
    const order = ordersById.get(String(report.orderId));
    const patient = patientsById.get(String(report.patientId));
    return {
      reportId: report.reportId,
      reportStatus: report.reportStatus,
      criticalReviewStatus: report.criticalReviewStatus,
      signedAt: report.signedAt,
      pdfAvailable: isPdfAvailable(report),
      order: order ? { orderId: order.orderId, orderDate: order.orderDate, status: order.status } : null,
      patient: patient ? {
        patientId: patient.patientId,
        name: patient.fullName,
        mobileMasked: maskMobile(patient.mobile)
      } : null
    };
  }).filter((row) => row.order && row.patient);

  if (patientsOnly) {
    const permittedPatients = new Map();
    for (const row of rows) permittedPatients.set(row.patient.patientId, row.patient);
    const permitted = [...permittedPatients.values()];
    const start = (pagination.page - 1) * pagination.limit;
    res.status(200).json({
      success: true,
      data: {
        patients: permitted.slice(start, start + pagination.limit),
        pagination: { ...pagination, total: permitted.length, pages: Math.ceil(permitted.length / pagination.limit) }
      }
    });
    return;
  }

  const start = dashboard ? 0 : (pagination.page - 1) * pagination.limit;
  const visibleRows = dashboard ? rows.slice(0, 10) : rows.slice(start, start + pagination.limit);
  if (dashboard) {
    const uniquePatients = new Set(rows.map(({ patient }) => patient.patientId));
    const ready = rows.filter(({ reportStatus }) => reportStatus === 'Ready').length;
    res.status(200).json({
      success: true,
      data: {
        doctor: { doctorId: doctor.doctorId, name: doctor.name },
        totalPatients: uniquePatients.size,
        recentReports: rows.length,
        readyReports: ready,
        reports: visibleRows
      }
    });
    return;
  }
  res.status(200).json({
    success: true,
    data: {
      reports: visibleRows,
      pagination: { ...pagination, total: rows.length, pages: Math.ceil(rows.length / pagination.limit) },
      dateRange: { from: dateRange.$gte, to: dateRange.$lte }
    }
  });
}

export async function getDoctorDashboard(req, res, next) {
  try {
    await getDoctorRecords(req, res, { dashboard: true });
  } catch (error) {
    next(error);
  }
}

export async function getDoctorPatients(req, res, next) {
  try {
    await getDoctorRecords(req, res, { patientsOnly: true });
  } catch (error) {
    next(error);
  }
}

export async function getDoctorReports(req, res, next) {
  try {
    await getDoctorRecords(req, res);
  } catch (error) {
    next(error);
  }
}

export async function getDoctorReport(req, res, next) {
  try {
    const authorized = await findOwnedReport(req, req.params.reportId);
    if (!authorized || authorized.report.reportStatus !== 'Ready' || !authorized.report.signedAt) {
      sendMissing(res);
      return;
    }
    res.status(200).json({
      success: true,
      data: {
        report: {
          reportId: authorized.report.reportId,
          reportStatus: authorized.report.reportStatus,
          signedAt: authorized.report.signedAt,
          pdfAvailable: isPdfAvailable(authorized.report),
          orderId: authorized.order.orderId,
          orderDate: authorized.order.orderDate,
          referringDoctor: authorized.doctor.name,
          patient: { patientId: authorized.patient.patientId, name: authorized.patient.fullName },
          tests: authorized.report.parameters.map((parameter) => ({
            testName: parameter.parameterName,
            result: parameter.result,
            unit: parameter.unit,
            referenceMin: parameter.referenceMin,
            referenceMax: parameter.referenceMax
          }))
        }
      }
    });
  } catch (error) {
    next(error);
  }
}

export async function streamDoctorReport(req, res, next) {
  try {
    const authorized = await findOwnedReport(req, req.params.reportId);
    if (!authorized || !isPdfAvailable(authorized.report)) {
      sendMissing(res);
      return;
    }
    const { stream, size } = await openPrivatePdf(authorized.report.pdfStorageKey);
    await ReportAuditEvent.create({
      action: req.pdfDisposition === 'download' ? 'doctor-pdf-downloaded' : 'doctor-pdf-viewed',
      report: authorized.report._id,
      actorId: String(req.auth.sub)
    });
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Length': size,
      'Content-Disposition': `${req.pdfDisposition === 'download' ? 'attachment' : 'inline'}; filename="lab-report.pdf"`,
      'Cache-Control': 'private, no-store',
      'Pragma': 'no-cache',
      'X-Content-Type-Options': 'nosniff'
    });
    stream.on('error', next);
    stream.pipe(res);
  } catch (error) {
    next(error);
  }
}
