import { z } from 'zod';
import AIExplanation from '../models/AIExplanation.js';
import Report from '../models/Report.js';
import ReportAuditEvent from '../models/ReportAuditEvent.js';
import TestOrder from '../models/TestOrder.js';
import CallbackTask from '../models/CallbackTask.js';
import { classifyParameters } from '../services/abnormalDetectionService.js';
import { aiExplanationService, AI_PROMPT_VERSION, explanationFingerprint } from '../services/aiExplanationService.js';
import { evaluateCriticalResults } from '../services/criticalReviewService.js';
import { findReportByIdentifier } from '../services/reportService.js';

const languageSchema = z.enum(['en', 'te', 'hi']);
const flagSchema = z.object({
  language: languageSchema,
  reason: z.string().trim().min(3).max(1000)
}).strict();

function parseLanguage(value) {
  const parsed = languageSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

async function loadAuthorizedReport(req, reportIdentifier) {
  if (req.auth.role === 'patient' && !req.patientId) {
    throw Object.assign(new Error('Patient identity verification is required'), { status: 403 });
  }
  const filter = req.auth.role === 'patient' ? { patientId: req.patientId } : {};
  const report = await findReportByIdentifier(reportIdentifier, filter);
  if (!report) return null;
  const orderMatches = await TestOrder.exists({ _id: report.orderId, patientId: report.patientId });
  if (!orderMatches) return null;
  if (report.reportStatus !== 'Ready' || !report.signedAt || !report.pdfStorageKey) {
    throw Object.assign(new Error('Explanations are available only for signed Ready reports'), { status: 409 });
  }
  return report;
}

function criticalResponse(res) {
  res.status(409).json({
    success: false,
    status: 'Critical review required',
    message: 'A laboratory-approved critical threshold was met. Contact the laboratory or your doctor; no AI explanation is available.'
  });
}

function publicClassifications(classifications) {
  return classifications.map(({
    parameterName,
    result,
    unit,
    referenceMin,
    referenceMax,
    classification,
    criticalRuleApproved
  }) => ({
    parameterName,
    result,
    unit,
    referenceMin,
    referenceMax,
    classification,
    criticalRuleApproved
  }));
}

export async function generateReportExplanation(req, res, next) {
  try {
    const language = parseLanguage(req.body?.language);
    if (!language) {
      res.status(400).json({ success: false, message: 'Language must be en, te or hi' });
      return;
    }
    const report = await loadAuthorizedReport(req, req.params.reportId);
    if (!report) {
      res.status(404).json({ success: false, message: 'Report not found' });
      return;
    }
    const classifications = await classifyParameters(report.parameters);
    if (classifications.some(({ classification }) => classification === 'Critical')) {
      await evaluateCriticalResults(report, req.auth.sub);
      criticalResponse(res);
      return;
    }

    const fingerprint = explanationFingerprint(classifications, aiExplanationService.config.AI_MODEL || 'unconfigured');
    const cached = await AIExplanation.findOne({
      reportId: report._id,
      language,
      sourceFingerprint: fingerprint
    }).lean();
    if (cached) {
      res.status(200).json({
        success: true,
        data: { status: cached.status, explanation: cached, classifications: publicClassifications(classifications) }
      });
      return;
    }

    let generated;
    try {
      generated = await aiExplanationService.generate({ language, classifications });
    } catch (error) {
      if (error.code?.startsWith('AI_')) {
        res.status(error.status || 503).json({
          success: false,
          status: 'Unavailable',
          message: error.message
        });
        return;
      }
      throw error;
    }

    const explanation = await AIExplanation.findOneAndUpdate(
      { reportId: report._id, language },
      {
        $set: {
          patientId: report.patientId,
          summary: generated.summary,
          model: generated.model,
          generatedAt: new Date(),
          status: 'Generated',
          promptVersion: AI_PROMPT_VERSION,
          sourceFingerprint: explanationFingerprint(classifications, generated.model),
          flaggedByPatient: false,
          flagReason: ''
        }
      },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
    ).lean();
    await ReportAuditEvent.create({
      action: 'ai-summary-generated',
      report: report._id,
      actorId: String(req.auth.sub)
    });
    res.status(200).json({
      success: true,
      data: { status: explanation.status, explanation, classifications: publicClassifications(classifications) }
    });
  } catch (error) {
    next(error);
  }
}

export async function getReportExplanation(req, res, next) {
  try {
    const language = parseLanguage(req.query.language ?? 'en');
    if (!language) {
      res.status(400).json({ success: false, message: 'Language must be en, te or hi' });
      return;
    }
    const report = await loadAuthorizedReport(req, req.params.reportId);
    if (!report) {
      res.status(404).json({ success: false, message: 'Report not found' });
      return;
    }
    const classifications = await classifyParameters(report.parameters);
    if (classifications.some(({ classification }) => classification === 'Critical')) {
      await evaluateCriticalResults(report, req.auth.sub);
      criticalResponse(res);
      return;
    }
    const fingerprint = explanationFingerprint(classifications, aiExplanationService.config.AI_MODEL || 'unconfigured');
    const explanation = await AIExplanation.findOne({
      reportId: report._id,
      patientId: report.patientId,
      language,
      sourceFingerprint: fingerprint
    }).lean();
    if (!explanation) {
      res.status(200).json({
        success: true,
        data: { status: 'Unavailable', explanation: null, classifications: publicClassifications(classifications) }
      });
      return;
    }
    res.status(200).json({
      success: true,
      data: { status: explanation.status, explanation, classifications: publicClassifications(classifications) }
    });
  } catch (error) {
    next(error);
  }
}

export async function flagReportExplanation(req, res, next) {
  try {
    if (req.auth.role !== 'patient') {
      res.status(403).json({ success: false, message: 'Only the verified patient can flag this explanation' });
      return;
    }
    if (!req.patientId) {
      res.status(403).json({ success: false, message: 'Patient identity verification is required' });
      return;
    }
    const parsed = flagSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, message: 'Provide a supported language and a reason of 3 to 1000 characters' });
      return;
    }
    const report = await loadAuthorizedReport(req, req.params.reportId);
    if (!report) {
      res.status(404).json({ success: false, message: 'Report not found' });
      return;
    }
    const explanation = await AIExplanation.findOneAndUpdate(
      { reportId: report._id, patientId: req.patientId, language: parsed.data.language },
      { $set: { flaggedByPatient: true, flagReason: parsed.data.reason, status: 'Flagged' } },
      { new: true, runValidators: true }
    );
    if (!explanation) {
      res.status(404).json({ success: false, message: 'There is no generated explanation to flag' });
      return;
    }
    const parameterName = `Patient-flagged summary (${explanation.language})`;
    const task = await CallbackTask.findOneAndUpdate(
      { reportId: report._id, parameterName, severity: 'Patient flagged summary', status: { $ne: 'Resolved' } },
      {
        $setOnInsert: {
          reportId: report._id,
          patientId: report.patientId,
          parameterName,
          severity: 'Patient flagged summary',
          status: 'Pending'
        }
      },
      { upsert: true, new: true, runValidators: true }
    );
    await ReportAuditEvent.create({ action: 'ai-summary-flagged', report: report._id, actorId: String(req.auth.sub) });
    res.status(200).json({ success: true, message: 'Your feedback was sent to the laboratory team', data: { taskId: task.id } });
  } catch (error) {
    next(error);
  }
}
