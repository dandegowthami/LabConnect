import CallbackTask from '../models/CallbackTask.js';
import Report from '../models/Report.js';
import ReportAuditEvent from '../models/ReportAuditEvent.js';
import { classifyParameters } from './abnormalDetectionService.js';

export async function evaluateCriticalResults(report, actorId) {
  const classifications = await classifyParameters(report.parameters);
  const evaluatedAt = new Date();
  const classifiedParameters = report.parameters.map((parameter, index) => ({
    ...(typeof parameter.toObject === 'function' ? parameter.toObject() : parameter),
    classification: classifications[index].classification,
    classificationEvaluatedAt: evaluatedAt,
    criticalThresholdRuleId: classifications[index].classification === 'Critical'
      ? classifications[index].criticalThresholdRuleId
      : null
  }));
  const critical = classifications.filter(({ classification }) => classification === 'Critical');
  report.parameters = classifiedParameters;
  report.criticalReviewStatus = critical.length ? 'Urgent review' : 'Not required';
  await Report.updateOne(
    { _id: report._id },
    { $set: { parameters: classifiedParameters, criticalReviewStatus: report.criticalReviewStatus } }
  );
  if (!critical.length) return classifications;

  for (const result of critical) {
    await CallbackTask.updateOne(
      { reportId: report._id, parameterName: result.parameterName, severity: 'Critical' },
      {
        $setOnInsert: {
          reportId: report._id,
          patientId: report.patientId,
          parameterName: result.parameterName,
          severity: 'Critical',
          status: 'Pending'
        }
      },
      { upsert: true, runValidators: true }
    );
    await ReportAuditEvent.updateOne(
      { report: report._id, action: 'critical-result-detected', actorId: `critical:${result.parameterName}` },
      { $setOnInsert: { report: report._id, action: 'critical-result-detected', actorId: `critical:${result.parameterName}` } },
      { upsert: true }
    );
  }

  return classifications;
}

export async function refreshCriticalReviewStatus(reportId) {
  const openCriticalTasks = await CallbackTask.countDocuments({
    reportId,
    severity: 'Critical',
    status: { $ne: 'Resolved' }
  });
  if (!openCriticalTasks) {
    await Report.updateOne({ _id: reportId }, { $set: { criticalReviewStatus: 'Not required' } });
  }
}
