import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { env } from '../config/env.js';
import AccessToken from '../models/AccessToken.js';
import DeliveryLog from '../models/DeliveryLog.js';
import OTP from '../models/OTP.js';
import Patient from '../models/Patient.js';
import Report from '../models/Report.js';
import ReportAccessGrant from '../models/ReportAccessGrant.js';
import ReportAuditEvent from '../models/ReportAuditEvent.js';
import { openPrivatePdf } from '../services/pdfService.js';
import { compareOtp, deliverOtp, generateOtp, hashOtp, OTP_MAX_ATTEMPTS, OTP_TTL_MS } from '../services/otpService.js';
import { maskMobile } from '../services/notificationService.js';
import { sendReportDelivery } from '../services/deliveryService.js';
import {
  findActiveSecureLink,
  hashSecureToken,
  REPORT_ACCESS_GRANT_TTL_MS,
  revokeSecureReportLinks,
  validateReportAccessGrant
} from '../services/secureLinkService.js';
import { findReportByIdentifier } from '../services/reportService.js';

const accessRequestSchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/, 'A valid report access link is required')
});
const verifyOtpSchema = accessRequestSchema.extend({
  otp: z.string().regex(/^\d{6}$/, 'OTP must contain six digits')
});
const channelSchema = z.object({ channel: z.enum(['SMS', 'WhatsApp']).default('SMS') });
const LOG_STATUSES = new Set(['Pending', 'Sent', 'Failed']);
const LOG_CHANNELS = new Set(['SMS', 'WhatsApp']);
const MAX_OTP_REQUESTS_PER_LINK = 3;
const OTP_REQUEST_WINDOW_MS = 15 * 60 * 1000;

function reportNotFound(res) {
  res.status(404).json({ success: false, message: 'Report not found' });
}

function sendLinkStatus(res, status) {
  if (status === 'expired') {
    res.status(410).json({ success: false, message: 'This report access link has expired. Contact the laboratory for a new link.' });
    return;
  }
  if (status === 'revoked') {
    res.status(410).json({ success: false, message: 'This report access link has been revoked. Contact the laboratory for a new link.' });
    return;
  }
  if (status === 'used') {
    res.status(410).json({ success: false, message: 'This report access link has already been used. Contact the laboratory for a new link.' });
    return;
  }
  res.status(404).json({ success: false, message: 'This report access link is invalid' });
}

async function getReadyReport(identifier) {
  const report = await findReportByIdentifier(identifier);
  if (!report) return null;
  if (report.reportStatus !== 'Ready' || !report.signedAt || !report.pdfStorageKey || !report.pdfMetadata) {
    throw Object.assign(new Error('Only signed Ready reports with a valid PDF can be delivered'), { status: 409 });
  }
  return report;
}

async function handleDelivery(req, res, next, isResend) {
  try {
    const parsed = channelSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ success: false, message: 'Invalid notification channel', errors: parsed.error.flatten().fieldErrors });
      return;
    }

    const report = await getReadyReport(req.params.reportId);
    if (!report) {
      reportNotFound(res);
      return;
    }
    let channel = parsed.data.channel;
    if (isResend && req.body?.channel === undefined) {
      const previous = await DeliveryLog.findOne({ reportId: report._id }).sort({ createdAt: -1 }).select('channel').lean();
      if (previous) channel = previous.channel;
    }

    const delivery = await sendReportDelivery({
      reportId: report._id,
      channel,
      createdBy: req.auth.sub
    });

    res.status(isResend ? 200 : 201).json({
      success: true,
      message: delivery.status === 'Sent'
        ? 'Notification simulated successfully; no real message was sent'
        : 'The report is Ready, but notification delivery failed. You can retry it.',
      data: {
        reportId: report.reportId,
        delivery: {
          channel: delivery.channel,
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

export function generateReportDelivery(req, res, next) {
  return handleDelivery(req, res, next, false);
}

export function resendReportDelivery(req, res, next) {
  return handleDelivery(req, res, next, true);
}

export async function revokeReportDelivery(req, res, next) {
  try {
    const report = await findReportByIdentifier(req.params.reportId);
    if (!report) {
      reportNotFound(res);
      return;
    }
    const revokedCount = await revokeSecureReportLinks(report._id);
    await ReportAuditEvent.create({
      action: 'delivery-link-revoked',
      report: report._id,
      actorId: req.auth.sub
    });
    res.status(200).json({
      success: true,
      message: revokedCount ? 'Active report access links were revoked' : 'There were no active report access links',
      data: { reportId: report.reportId, revokedCount }
    });
  } catch (error) {
    next(error);
  }
}

export async function getDeliveryLogs(req, res, next) {
  try {
    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 20);
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 50) {
      res.status(400).json({ success: false, message: 'Page must be positive and limit must be between 1 and 50' });
      return;
    }
    if (req.query.status && !LOG_STATUSES.has(req.query.status)) {
      res.status(400).json({ success: false, message: 'Status must be Pending, Sent or Failed' });
      return;
    }
    if (req.query.channel && !LOG_CHANNELS.has(req.query.channel)) {
      res.status(400).json({ success: false, message: 'Channel must be SMS or WhatsApp' });
      return;
    }

    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.channel) filter.channel = req.query.channel;
    if (req.query.from || req.query.to) {
      const dateFilter = {};
      if (req.query.from) {
        const from = new Date(req.query.from);
        const fromIsDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(req.query.from);
        if (Number.isNaN(from.getTime()) || (fromIsDateOnly && from.toISOString().slice(0, 10) !== req.query.from)) {
          res.status(400).json({ success: false, message: 'from must be a valid date' });
          return;
        }
        dateFilter.$gte = from;
      }
      if (req.query.to) {
        const to = new Date(req.query.to);
        const toIsDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(req.query.to);
        if (Number.isNaN(to.getTime()) || (toIsDateOnly && to.toISOString().slice(0, 10) !== req.query.to)) {
          res.status(400).json({ success: false, message: 'to must be a valid date' });
          return;
        }
        if (toIsDateOnly) {
          dateFilter.$lt = new Date(to.getTime() + 24 * 60 * 60 * 1000);
        } else {
          dateFilter.$lte = to;
        }
      }
      if (dateFilter.$gte && dateFilter.$lte && dateFilter.$gte > dateFilter.$lte) {
        res.status(400).json({ success: false, message: 'from must be earlier than to' });
        return;
      }
      filter.createdAt = dateFilter;
    }

    const [total, logs] = await Promise.all([
      DeliveryLog.countDocuments(filter),
      DeliveryLog.find(filter)
        .select('reportId patientId channel destinationMasked status providerMessageId sentAt failureReason createdBy createdAt')
        .populate({ path: 'reportId', select: 'reportId' })
        .populate({ path: 'patientId', select: 'fullName' })
        .populate({ path: 'createdBy', select: 'name email' })
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
    ]);

    res.status(200).json({
      success: true,
      data: {
        logs: logs.map((log) => ({
          id: String(log._id),
          reportId: log.reportId?.reportId ?? null,
          patientName: log.patientId?.fullName ?? 'Unavailable',
          destinationMasked: log.destinationMasked,
          channel: log.channel,
          status: log.status,
          providerMessageId: log.providerMessageId,
          sentAt: log.sentAt,
          failureReason: log.failureReason,
          createdBy: log.createdBy?.name ?? null,
          createdAt: log.createdAt
        })),
        pagination: { page, limit, total, pages: Math.ceil(total / limit) }
      }
    });
  } catch (error) {
    next(error);
  }
}

export async function requestReportAccessOtp(req, res, next) {
  try {
    const parsed = accessRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, message: 'A valid report access link is required' });
      return;
    }

    const linkResult = await findActiveSecureLink(parsed.data.token);
    if (linkResult.status !== 'active') {
      sendLinkStatus(res, linkResult.status);
      return;
    }
    let { record } = linkResult;
    if (record.verificationAttempts >= OTP_MAX_ATTEMPTS) {
      res.status(429).json({ success: false, message: 'Too many incorrect OTP attempts. Contact the laboratory for a new link.' });
      return;
    }

    const now = new Date();
    const windowStart = new Date(now.getTime() - OTP_REQUEST_WINDOW_MS);
    const allowed = await AccessToken.findOneAndUpdate(
      {
        _id: record._id,
        usedAt: null,
        revokedAt: null,
        expiresAt: { $gt: now },
        verificationAttempts: { $lt: OTP_MAX_ATTEMPTS },
        $or: [
          { otpRequestsWindowStartedAt: null },
          { otpRequestsWindowStartedAt: { $lte: windowStart } },
          {
            otpRequestsWindowStartedAt: { $gt: windowStart },
            otpRequestsInWindow: { $lt: MAX_OTP_REQUESTS_PER_LINK }
          }
        ]
      },
      [
        {
          $set: {
            otpRequestsInWindow: {
              $cond: [
                { $lte: [{ $ifNull: ['$otpRequestsWindowStartedAt', new Date(0)] }, windowStart] },
                1,
                { $add: [{ $ifNull: ['$otpRequestsInWindow', 0] }, 1] }
              ]
            },
            otpRequestsWindowStartedAt: {
              $cond: [
                { $lte: [{ $ifNull: ['$otpRequestsWindowStartedAt', new Date(0)] }, windowStart] },
                now,
                '$otpRequestsWindowStartedAt'
              ]
            }
          }
        }
      ],
      { new: true }
    );
    if (!allowed) {
      res.status(429).json({ success: false, message: 'Too many OTP requests for this link. Please try again later.' });
      return;
    }
    record = allowed;

    const [patient, report] = await Promise.all([
      Patient.findById(record.patientId).select('mobile').lean(),
      Report.findOne({
        _id: record.reportId,
        patientId: record.patientId,
        reportStatus: 'Ready',
        signedAt: { $ne: null }
      }).select('_id').lean()
    ]);
    if (!patient || !report) {
      res.status(410).json({ success: false, message: 'This report access link is no longer available' });
      return;
    }

    const otp = generateOtp();
    const otpRecord = await OTP.create({
      mobile: patient.mobile,
      hashedOTP: await hashOtp(otp),
      purpose: 'report-access',
      accessTokenId: record._id,
      expiresAt: new Date(Date.now() + OTP_TTL_MS)
    });
    let delivery;
    try {
      delivery = await deliverOtp(patient.mobile, otp);
    } catch (error) {
      await OTP.deleteOne({ _id: otpRecord._id });
      throw error;
    }

    res.status(200).json({
      success: true,
      message: 'An OTP was sent to the mobile number registered for this report',
      data: {
        destinationMasked: maskMobile(patient.mobile),
        expiresInSeconds: OTP_TTL_MS / 1000,
        ...(delivery.developmentOtp && env.NODE_ENV !== 'production'
          ? { developmentOtp: delivery.developmentOtp }
          : {})
      }
    });
  } catch (error) {
    next(error);
  }
}

export async function verifyReportAccessOtp(req, res, next) {
  let grant;
  try {
    const parsed = verifyOtpSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, message: 'Enter the valid report access link and six-digit OTP' });
      return;
    }

    const linkResult = await findActiveSecureLink(parsed.data.token);
    if (linkResult.status !== 'active') {
      sendLinkStatus(res, linkResult.status);
      return;
    }
    const { record } = linkResult;
    const patient = await Patient.findById(record.patientId).select('mobile').lean();
    const report = await Report.findOne({
      _id: record.reportId,
      patientId: record.patientId,
      reportStatus: 'Ready',
      signedAt: { $ne: null }
    }).select('_id').lean();
    if (!patient || !report) {
      res.status(410).json({ success: false, message: 'This report access link is no longer available' });
      return;
    }

    const otpRecord = await OTP.findOne({
      mobile: patient.mobile,
      purpose: 'report-access',
      accessTokenId: record._id,
      verifiedAt: null,
      expiresAt: { $gt: new Date() }
    }).sort({ createdAt: -1 }).select('+hashedOTP');

    if (!otpRecord || otpRecord.attempts >= OTP_MAX_ATTEMPTS) {
      res.status(otpRecord ? 429 : 400).json({
        success: false,
        message: otpRecord ? 'Too many incorrect OTP attempts. Request a new report link.' : 'OTP is invalid, expired or already used'
      });
      return;
    }

    const matches = await compareOtp(parsed.data.otp, otpRecord.hashedOTP);
    if (!matches) {
      const attempt = await OTP.findOneAndUpdate(
        { _id: otpRecord._id, verifiedAt: null, attempts: { $lt: OTP_MAX_ATTEMPTS }, expiresAt: { $gt: new Date() } },
        { $inc: { attempts: 1 } },
        { new: true }
      );
      const linkAttempt = await AccessToken.findOneAndUpdate(
        { _id: record._id, revokedAt: null, usedAt: null, verificationAttempts: { $lt: OTP_MAX_ATTEMPTS } },
        { $inc: { verificationAttempts: 1 } },
        { new: true }
      );
      const attemptsExhausted = attempt?.attempts >= OTP_MAX_ATTEMPTS
        || linkAttempt?.verificationAttempts >= OTP_MAX_ATTEMPTS
        || !linkAttempt;
      res.status(attemptsExhausted ? 429 : 400).json({
        success: false,
        message: attemptsExhausted
          ? 'Too many incorrect OTP attempts. Request a new report link.'
          : 'OTP is incorrect or expired'
      });
      return;
    }

    const now = new Date();
    const rawGrant = randomBytes(32).toString('base64url');
    grant = await ReportAccessGrant.create({
      tokenHash: hashSecureToken(rawGrant),
      accessTokenId: record._id,
      patientId: record.patientId,
      reportId: record.reportId,
      expiresAt: new Date(now.getTime() + REPORT_ACCESS_GRANT_TTL_MS)
    });

    const verifiedOtp = await OTP.findOneAndUpdate(
      { _id: otpRecord._id, verifiedAt: null, attempts: { $lt: OTP_MAX_ATTEMPTS }, expiresAt: { $gt: now } },
      { $set: { verifiedAt: now } },
      { new: true }
    );
    if (!verifiedOtp) {
      await ReportAccessGrant.deleteOne({ _id: grant._id });
      grant = null;
      res.status(400).json({ success: false, message: 'OTP is invalid, expired or already used' });
      return;
    }

    const consumedLink = await AccessToken.findOneAndUpdate(
      { _id: record._id, patientId: record.patientId, reportId: record.reportId, usedAt: null, revokedAt: null, expiresAt: { $gt: now } },
      { $set: { usedAt: now } },
      { new: true }
    );
    if (!consumedLink) {
      await ReportAccessGrant.deleteOne({ _id: grant._id });
      grant = null;
      res.status(410).json({ success: false, message: 'This report access link is no longer available' });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'Report access verified',
      data: { accessGrant: rawGrant, expiresAt: grant.expiresAt }
    });
  } catch (error) {
    if (grant) await ReportAccessGrant.deleteOne({ _id: grant._id });
    next(error);
  }
}

export async function streamReportWithAccessGrant(req, res, next) {
  try {
    const result = await validateReportAccessGrant(req.get('x-report-access-grant'));
    if (result.status !== 'active') {
      res.status(result.status === 'expired' || result.status === 'revoked' ? 410 : 401).json({
        success: false,
        message: result.status === 'expired'
          ? 'Report access has expired. Verify a new report link to continue.'
          : result.status === 'revoked'
            ? 'Report access has been revoked'
            : 'A valid report access grant is required'
      });
      return;
    }

    const { grant, link, report } = result;
    if (!report.pdfStorageKey) {
      res.status(404).json({ success: false, message: 'The signed report PDF is unavailable' });
      return;
    }
    const { stream, size } = await openPrivatePdf(report.pdfStorageKey);
    const now = new Date();
    await Promise.all([
      ReportAccessGrant.updateOne({ _id: grant._id, revokedAt: null }, { $set: { lastAccessedAt: now } }),
      AccessToken.updateOne({ _id: link._id, revokedAt: null }, { $set: { lastAccessedAt: now } }),
      ReportAuditEvent.create({
        action: req.pdfDisposition === 'download' ? 'delivery-pdf-downloaded' : 'delivery-pdf-viewed',
        report: report._id,
        actorId: `report-access:${String(grant._id)}`
      })
    ]);

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
