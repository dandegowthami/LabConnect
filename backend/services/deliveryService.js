import DeliveryLog from '../models/DeliveryLog.js';
import Patient from '../models/Patient.js';
import Report from '../models/Report.js';
import ReportAuditEvent from '../models/ReportAuditEvent.js';
import { maskMobile, notificationService } from './notificationService.js';
import { generateSecureReportLink } from './secureLinkService.js';

function safeFailureReason(error) {
  if (error.status === 503) return 'Private storage or notification provider is unavailable';
  return 'The report notification could not be delivered';
}

export async function sendReportDelivery({ reportId, channel, createdBy }) {
  const report = await Report.findById(reportId);
  if (!report || report.reportStatus !== 'Ready' || !report.signedAt) {
    throw Object.assign(new Error('Only signed Ready reports can be delivered'), { status: 409 });
  }
  const patient = await Patient.findById(report.patientId).select('mobile');
  const delivery = await DeliveryLog.create({
    reportId: report._id,
    patientId: report.patientId,
    channel,
    destinationMasked: patient ? maskMobile(patient.mobile) : 'Unavailable',
    status: 'Pending',
    createdBy
  });

  let linkRecord;
  try {
    if (!patient) throw Object.assign(new Error('The report patient was not found'), { status: 404 });
    linkRecord = await generateSecureReportLink({
      reportId: report._id,
      patientId: report.patientId,
      createdBy
    });
    const result = await notificationService.send({
      channel,
      destination: patient.mobile,
      secureLink: linkRecord.link
    });

    if (result.status !== 'Sent') {
      await linkRecord.record.updateOne({ $set: { revokedAt: new Date() } });
      await delivery.updateOne({
        $set: {
          status: 'Failed',
          failureReason: result.failureReason || 'The notification provider reported a failure'
        }
      });
    } else {
      await delivery.updateOne({
        $set: {
          status: 'Sent',
          sentAt: result.sentAt,
          providerMessageId: result.providerMessageId
        }
      });
      await ReportAuditEvent.create({
        action: 'delivery-link-generated',
        report: report._id,
        actorId: String(createdBy)
      });
    }
  } catch (error) {
    if (linkRecord) await linkRecord.record.updateOne({ $set: { revokedAt: new Date() } });
    await delivery.updateOne({
      $set: { status: 'Failed', failureReason: safeFailureReason(error) }
    });
  }

  return DeliveryLog.findById(delivery._id)
    .select('channel destinationMasked status providerMessageId sentAt failureReason createdAt')
    .lean();
}
