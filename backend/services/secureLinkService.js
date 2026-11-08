import { createHash, randomBytes } from 'node:crypto';
import AccessToken from '../models/AccessToken.js';
import ReportAccessGrant from '../models/ReportAccessGrant.js';
import Report from '../models/Report.js';
import TestOrder from '../models/TestOrder.js';
import { env } from '../config/env.js';
import { validateStoredPdf } from './pdfService.js';

export const SECURE_LINK_TTL_MS = 72 * 60 * 60 * 1000;
export const REPORT_ACCESS_GRANT_TTL_MS = 15 * 60 * 1000;

export function hashSecureToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

function assertTokenFormat(token) {
  return typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token);
}

export async function findActiveSecureLink(token) {
  if (!assertTokenFormat(token)) return { status: 'invalid' };
  const record = await AccessToken.findOne({ tokenHash: hashSecureToken(token) });
  if (!record) return { status: 'invalid' };
  if (record.revokedAt) return { status: 'revoked' };
  if (record.expiresAt <= new Date()) return { status: 'expired' };
  if (record.usedAt) return { status: 'used' };
  return { status: 'active', record };
}

export async function generateSecureReportLink({ reportId, patientId, createdBy }) {
  const report = await Report.findById(reportId).select('+pdfStorageKey');
  if (!report || String(report.patientId) !== String(patientId)) {
    throw Object.assign(new Error('Report not found for this patient'), { status: 404 });
  }
  if (report.reportStatus !== 'Ready' || !report.signedAt || !report.pdfStorageKey || !report.pdfMetadata) {
    throw Object.assign(new Error('A signed Ready report with a valid PDF is required'), { status: 409 });
  }

  const matchingOrder = await TestOrder.exists({ _id: report.orderId, patientId: report.patientId });
  if (!matchingOrder) {
    throw Object.assign(new Error('The report and order are not associated with the same patient'), { status: 409 });
  }
  await validateStoredPdf(report.pdfStorageKey);

  const now = new Date();
  const rawToken = randomBytes(32).toString('base64url');
  const record = await AccessToken.create({
    tokenHash: hashSecureToken(rawToken),
    patientId: report.patientId,
    reportId: report._id,
    expiresAt: new Date(now.getTime() + SECURE_LINK_TTL_MS),
    createdBy
  });

  try {
    const previousLinks = await AccessToken.find({
      reportId: report._id,
      _id: { $ne: record._id },
      revokedAt: null,
      expiresAt: { $gt: now }
    }).select('_id').lean();
    const previousIds = previousLinks.map(({ _id }) => _id);
    if (previousIds.length) {
      await AccessToken.updateMany({ _id: { $in: previousIds }, revokedAt: null }, { $set: { revokedAt: now } });
      await ReportAccessGrant.updateMany(
        { accessTokenId: { $in: previousIds }, revokedAt: null },
        { $set: { revokedAt: now } }
      );
    }
  } catch (error) {
    await AccessToken.deleteOne({ _id: record._id });
    throw error;
  }

  const frontendBaseUrl = env.FRONTEND_URL.replace(/\/+$/, '');
  return {
    record,
    rawToken,
    link: `${frontendBaseUrl}/report-access/#${rawToken}`
  };
}

export async function revokeSecureReportLinks(reportId) {
  const now = new Date();
  const activeLinks = await AccessToken.find({ reportId, revokedAt: null, expiresAt: { $gt: now } })
    .select('_id').lean();
  const linkIds = activeLinks.map(({ _id }) => _id);
  if (!linkIds.length) return 0;

  await AccessToken.updateMany({ _id: { $in: linkIds }, revokedAt: null }, { $set: { revokedAt: now } });
  await ReportAccessGrant.updateMany(
    { accessTokenId: { $in: linkIds }, revokedAt: null },
    { $set: { revokedAt: now } }
  );
  return linkIds.length;
}

export async function validateReportAccessGrant(rawGrant) {
  if (!assertTokenFormat(rawGrant)) return { status: 'invalid' };
  const grant = await ReportAccessGrant.findOne({ tokenHash: hashSecureToken(rawGrant) });
  if (!grant) return { status: 'invalid' };
  if (grant.revokedAt) return { status: 'revoked' };
  if (grant.expiresAt <= new Date()) return { status: 'expired' };

  const link = await AccessToken.findOne({
    _id: grant.accessTokenId,
    patientId: grant.patientId,
    reportId: grant.reportId,
    revokedAt: null,
    usedAt: { $ne: null },
    expiresAt: { $gt: new Date() }
  });
  if (!link) return { status: 'revoked' };

  const report = await Report.findOne({
    _id: grant.reportId,
    patientId: grant.patientId,
    reportStatus: 'Ready',
    signedAt: { $ne: null }
  }).select('+pdfStorageKey');
  if (!report || String(report.patientId) !== String(link.patientId)) return { status: 'invalid' };
  if (!(await TestOrder.exists({ _id: report.orderId, patientId: grant.patientId }))) return { status: 'invalid' };
  return { status: 'active', grant, link, report };
}
