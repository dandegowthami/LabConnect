import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { PDFDocument } from 'pdf-lib';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import app from '../app.js';
import AccessToken from '../models/AccessToken.js';
import DeliveryLog from '../models/DeliveryLog.js';
import Doctor from '../models/Doctor.js';
import OTP from '../models/OTP.js';
import Patient from '../models/Patient.js';
import Report from '../models/Report.js';
import ReportAccessGrant from '../models/ReportAccessGrant.js';
import ReportAuditEvent from '../models/ReportAuditEvent.js';
import TestOrder from '../models/TestOrder.js';
import User from '../models/User.js';
import { env } from '../config/env.js';
import { getPrivateStorageDirectory } from '../config/storage.js';
import { reportAccessOtpRequestLimiter, reportAccessOtpVerifyLimiter } from '../middleware/deliveryRateLimiters.js';
import { notificationService } from '../services/notificationService.js';
import { storePrivatePdf } from '../services/pdfService.js';
import { generateSecureReportLink, hashSecureToken, SECURE_LINK_TTL_MS } from '../services/secureLinkService.js';

let patient;
let staff;
let doctor;
let report;
let order;
let storageDirectory;

const staffToken = () => jwt.sign({ sub: staff.id, role: staff.role }, env.JWT_SECRET);

function resetLimiter(limiter) {
  limiter.resetKey('::ffff:127.0.0.1');
  limiter.resetKey('127.0.0.1');
}

async function createPdf() {
  const document = await PDFDocument.create();
  document.addPage();
  const bytes = Buffer.from(await document.save());
  const pdfStorageKey = await storePrivatePdf(bytes);
  return { bytes, pdfStorageKey };
}

async function prepareReport(status = 'Ready') {
  const { pdfStorageKey, bytes } = await createPdf();
  order = await TestOrder.create({
    orderId: `ORD-DELIVERY-${Date.now()}`,
    patientId: patient._id,
    referringDoctorId: doctor._id,
    tests: [{ testName: 'Synthetic test', result: 5, unit: 'u', referenceMin: 1, referenceMax: 10 }],
    status
  });
  report = await Report.create({
    reportId: `RPT-DELIVERY-${Date.now()}`,
    orderId: order._id,
    patientId: patient._id,
    parameters: [{ parameterName: 'Synthetic test', result: 5, unit: 'u', referenceMin: 1, referenceMax: 10 }],
    reportStatus: status,
    signedAt: status === 'Ready' ? new Date() : null,
    pdfStorageKey,
    pdfMetadata: {
      originalFilename: 'synthetic.pdf',
      mimeType: 'application/pdf',
      fileSize: bytes.length,
      uploadedAt: new Date(),
      uploadedBy: staff._id
    }
  });
  return bytes;
}

beforeAll(async () => {
  await Promise.all([
    AccessToken.init(),
    DeliveryLog.init(),
    Doctor.init(),
    OTP.init(),
    Patient.init(),
    Report.init(),
    ReportAccessGrant.init(),
    ReportAuditEvent.init(),
    TestOrder.init(),
    User.init()
  ]);
});

beforeEach(async () => {
  storageDirectory = await mkdtemp(path.join(os.tmpdir(), 'labconnect-delivery-test-'));
  process.env.PDF_STORAGE_DIR = storageDirectory;
  delete process.env.LABCONNECT_MOCK_NOTIFICATION_FAILURE;
  resetLimiter(reportAccessOtpRequestLimiter);
  resetLimiter(reportAccessOtpVerifyLimiter);
  await Promise.all([
    AccessToken.deleteMany({}),
    DeliveryLog.deleteMany({}),
    ReportAccessGrant.deleteMany({}),
    ReportAuditEvent.deleteMany({}),
    OTP.deleteMany({}),
    Report.deleteMany({}),
    TestOrder.deleteMany({}),
    Doctor.deleteMany({}),
    Patient.deleteMany({}),
    User.deleteMany({})
  ]);
  staff = await User.create({
    name: 'Delivery Staff',
    email: `delivery-${Date.now()}@test.demo`,
    passwordHash: await bcrypt.hash('DemoPassword123', 4),
    role: 'staff'
  });
  patient = await Patient.create({
    patientId: `PAT-DELIVERY-${Date.now()}`,
    fullName: 'Synthetic Delivery Patient',
    mobile: '9000000042'
  });
  doctor = await Doctor.create({ doctorId: `DOC-DELIVERY-${Date.now()}`, name: 'Dr. Synthetic' });
});

afterEach(async () => {
  vi.restoreAllMocks();
  delete process.env.PDF_STORAGE_DIR;
  delete process.env.LABCONNECT_MOCK_NOTIFICATION_FAILURE;
  if (storageDirectory) await rm(storageDirectory, { recursive: true, force: true });
});

afterAll(async () => {
  delete process.env.PDF_STORAGE_DIR;
});

describe('secure report links', () => {
  it('stores only a SHA-256 token hash and expires links after 72 hours', async () => {
    await prepareReport();
    const before = Date.now();
    const result = await generateSecureReportLink({
      reportId: report._id,
      patientId: patient._id,
      createdBy: staff._id
    });
    const saved = await AccessToken.findById(result.record._id).select('+tokenHash');

    expect(result.rawToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(result.link).toBe(`http://localhost:5173/report-access/#${result.rawToken}`);
    expect(saved.tokenHash).toBe(hashSecureToken(result.rawToken));
    expect(saved.tokenHash).not.toContain(result.rawToken);
    expect(result.rawToken).not.toContain(saved.tokenHash);
    expect(saved.expiresAt.getTime()).toBeGreaterThanOrEqual(before + SECURE_LINK_TTL_MS - 1000);
    expect(saved.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + SECURE_LINK_TTL_MS + 1000);
  });

  it('rejects invalid and Processing reports, and revokes older links and grants when regenerated', async () => {
    await prepareReport('Processing');
    await expect(generateSecureReportLink({
      reportId: report._id,
      patientId: patient._id,
      createdBy: staff._id
    })).rejects.toMatchObject({ status: 409 });
    await expect(generateSecureReportLink({
      reportId: report._id,
      patientId: new Patient()._id,
      createdBy: staff._id
    })).rejects.toMatchObject({ status: 404 });

    report.reportStatus = 'Ready';
    report.signedAt = new Date();
    await report.save();
    const first = await generateSecureReportLink({ reportId: report._id, patientId: patient._id, createdBy: staff._id });
    await ReportAccessGrant.create({
      tokenHash: hashSecureToken('A'.repeat(43)),
      accessTokenId: first.record._id,
      patientId: patient._id,
      reportId: report._id,
      expiresAt: new Date(Date.now() + 60_000)
    });
    const second = await generateSecureReportLink({ reportId: report._id, patientId: patient._id, createdBy: staff._id });
    expect((await AccessToken.findById(first.record._id)).revokedAt).toBeInstanceOf(Date);
    expect((await ReportAccessGrant.findOne({ accessTokenId: first.record._id })).revokedAt).toBeInstanceOf(Date);
    expect((await AccessToken.findById(second.record._id)).revokedAt).toBeNull();
  });
});

describe('OTP verification and report-specific grants', () => {
  it('requires OTP before PDF access and grants access only to the linked report', async () => {
    const pdfBytes = await prepareReport();
    const otherPatient = await Patient.create({
      patientId: `PAT-OTHER-${Date.now()}`,
      fullName: 'Another Synthetic Patient',
      mobile: patient.mobile
    });
    const otherOrder = await TestOrder.create({
      orderId: `ORD-OTHER-${Date.now()}`,
      patientId: otherPatient._id,
      referringDoctorId: doctor._id,
      tests: [{ testName: 'Other test', result: 1, unit: 'u', referenceMin: 0, referenceMax: 2 }],
      status: 'Ready'
    });
    const otherReport = await Report.create({
      reportId: `RPT-OTHER-${Date.now()}`,
      orderId: otherOrder._id,
      patientId: otherPatient._id,
      parameters: [{ parameterName: 'Other test', result: 1, unit: 'u', referenceMin: 0, referenceMax: 2 }],
      reportStatus: 'Ready',
      signedAt: new Date(),
      pdfStorageKey: report.pdfStorageKey,
      pdfMetadata: report.pdfMetadata
    });
    const link = await generateSecureReportLink({ reportId: report._id, patientId: patient._id, createdBy: staff._id });

    const beforeOtp = await request(app).get('/api/delivery/access/report').set('X-Report-Access-Grant', link.rawToken);
    expect(beforeOtp.status).toBe(401);

    const otpResponse = await request(app).post('/api/delivery/access/request-otp').send({ token: link.rawToken });
    expect(otpResponse.status).toBe(200);
    expect(otpResponse.body.data.destinationMasked).toBe('90******42');
    expect(otpResponse.body.data.developmentOtp).toMatch(/^\d{6}$/);
    expect(otpResponse.body).not.toHaveProperty('data.report');
    expect(JSON.stringify(await OTP.findOne({ accessTokenId: link.record._id }).select('+hashedOTP')))
      .not.toContain(otpResponse.body.data.developmentOtp);

    const invalidOtp = await request(app).post('/api/delivery/access/verify-otp')
      .send({ token: link.rawToken, otp: '111111' });
    expect(invalidOtp.status).toBe(400);

    const verified = await request(app).post('/api/delivery/access/verify-otp')
      .send({ token: link.rawToken, otp: otpResponse.body.data.developmentOtp });
    expect(verified.status).toBe(200);
    expect(verified.body.data.accessGrant).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const storedGrant = await ReportAccessGrant.findOne({ accessTokenId: link.record._id }).select('+tokenHash');
    expect(storedGrant.tokenHash).toBe(hashSecureToken(verified.body.data.accessGrant));
    expect(JSON.stringify(storedGrant)).not.toContain(verified.body.data.accessGrant);

    const view = await request(app).get('/api/delivery/access/report')
      .set('X-Report-Access-Grant', verified.body.data.accessGrant);
    expect(view.status).toBe(200);
    expect(view.headers['cache-control']).toBe('private, no-store');
    expect(Buffer.from(view.body)).toEqual(pdfBytes);

    const download = await request(app).get('/api/delivery/access/report/download')
      .set('X-Report-Access-Grant', verified.body.data.accessGrant);
    expect(download.status).toBe(200);
    expect(download.headers['content-disposition']).toMatch(/^attachment;/);
    expect(Buffer.from(download.body)).toEqual(pdfBytes);

    const wrongReportLink = await generateSecureReportLink({
      reportId: otherReport._id,
      patientId: otherPatient._id,
      createdBy: staff._id
    });
    const crossGrant = await request(app).get('/api/delivery/access/report')
      .set('X-Report-Access-Grant', wrongReportLink.rawToken);
    expect(crossGrant.status).toBe(401);

    const replay = await request(app).post('/api/delivery/access/verify-otp')
      .send({ token: link.rawToken, otp: otpResponse.body.data.developmentOtp });
    expect(replay.status).toBe(410);
    expect(await AccessToken.findById(link.record._id).then((saved) => saved.usedAt)).toBeInstanceOf(Date);
  });

  it('rejects expired, revoked, invalid and already consumed links', async () => {
    await prepareReport();
    const link = await generateSecureReportLink({ reportId: report._id, patientId: patient._id, createdBy: staff._id });
    const expired = await AccessToken.findById(link.record._id);
    expired.expiresAt = new Date(Date.now() - 1000);
    await expired.save();
    expect((await request(app).post('/api/delivery/access/request-otp').send({ token: link.rawToken })).status).toBe(410);
    expect((await request(app).post('/api/delivery/access/request-otp').send({ token: 'bad-token' })).status).toBe(400);

    const revokedLink = await generateSecureReportLink({ reportId: report._id, patientId: patient._id, createdBy: staff._id });
    await AccessToken.updateOne({ _id: revokedLink.record._id }, { $set: { revokedAt: new Date() } });
    expect((await request(app).post('/api/delivery/access/request-otp').send({ token: revokedLink.rawToken })).status).toBe(410);
  });

  it('expires OTPs, enforces attempts and OTP request rate limits', async () => {
    await prepareReport();
    const link = await generateSecureReportLink({ reportId: report._id, patientId: patient._id, createdBy: staff._id });
    const firstOtp = await request(app).post('/api/delivery/access/request-otp').send({ token: link.rawToken });
    const otpRecord = await OTP.findOne({ accessTokenId: link.record._id });
    otpRecord.expiresAt = new Date(Date.now() - 1000);
    await otpRecord.save();
    expect((await request(app).post('/api/delivery/access/verify-otp')
      .send({ token: link.rawToken, otp: firstOtp.body.data.developmentOtp })).status).toBe(400);

    await OTP.deleteMany({ accessTokenId: link.record._id });
    const freshOtp = await request(app).post('/api/delivery/access/request-otp').send({ token: link.rawToken });
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await request(app).post('/api/delivery/access/verify-otp').send({ token: link.rawToken, otp: '111111' });
    }
    expect((await request(app).post('/api/delivery/access/verify-otp')
      .send({ token: link.rawToken, otp: freshOtp.body.data.developmentOtp })).status).toBe(429);
    expect((await request(app).post('/api/delivery/access/request-otp').send({ token: link.rawToken })).status).toBe(429);

    resetLimiter(reportAccessOtpRequestLimiter);
    const secondLink = await generateSecureReportLink({ reportId: report._id, patientId: patient._id, createdBy: staff._id });
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await request(app).post('/api/delivery/access/request-otp').send({ token: secondLink.rawToken });
      if (attempt < 3) expect(response.status).toBe(200);
      else expect(response.status).toBe(429);
    }

    resetLimiter(reportAccessOtpRequestLimiter);
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const newLink = await generateSecureReportLink({ reportId: report._id, patientId: patient._id, createdBy: staff._id });
      const response = await request(app).post('/api/delivery/access/request-otp').send({ token: newLink.rawToken });
      expect(response.status).toBe(attempt < 5 ? 200 : 429);
    }
  });
});

describe('notifications and staff controls', () => {
  it.each(['SMS', 'WhatsApp'])('simulates %s notifications without storing links or report contents', async (channel) => {
    await prepareReport();
    const providerSend = vi.spyOn(notificationService.providers[channel], 'send');
    const response = await request(app)
      .post(`/api/delivery/reports/${report.reportId}/generate`)
      .set('Authorization', `Bearer ${staffToken()}`)
      .send({ channel });

    expect(response.status).toBe(201);
    expect(response.body.message).toMatch(/no real message was sent/i);
    expect(response.body.data.delivery).toMatchObject({
      channel,
      destinationMasked: '90******42',
      status: 'Sent'
    });
    const logs = await DeliveryLog.find({ reportId: report._id }).lean();
    expect(logs).toHaveLength(1);
    expect(logs[0].destinationMasked).toBe('90******42');
    expect(JSON.stringify(logs)).not.toMatch(/report-access|[A-Za-z0-9_-]{43}/);
    expect(JSON.stringify(response.body)).not.toMatch(/report-access|[A-Za-z0-9_-]{43}/);
    expect(await AccessToken.countDocuments({ reportId: report._id })).toBe(1);
    const notification = providerSend.mock.calls[0][0];
    expect(notification.destination).toBe(patient.mobile);
    expect(notification.message).toMatch(/OTP verification is required/);
    expect(notification.message).not.toContain(patient.fullName);
    expect(notification.message).not.toContain('Synthetic test');
    expect(notification.message).not.toContain('5 u');
  });

  it('records notification failures and preserves Ready reports', async () => {
    await prepareReport();
    process.env.LABCONNECT_MOCK_NOTIFICATION_FAILURE = 'true';
    const response = await request(app)
      .post(`/api/delivery/reports/${report.reportId}/generate`)
      .set('Authorization', `Bearer ${staffToken()}`)
      .send({ channel: 'SMS' });

    expect(response.status).toBe(201);
    expect(response.body.data.delivery.status).toBe('Failed');
    expect((await Report.findById(report._id)).reportStatus).toBe('Ready');
    expect(await AccessToken.countDocuments({ reportId: report._id, revokedAt: { $ne: null } })).toBe(1);
    expect((await DeliveryLog.findOne({ reportId: report._id })).failureReason).toMatch(/simulated a delivery failure/i);
  });

  it('requires staff for delivery controls, supports filtered logs, resend and revocation', async () => {
    await prepareReport();
    const generated = await request(app).post(`/api/delivery/reports/${report.reportId}/generate`)
      .set('Authorization', `Bearer ${staffToken()}`).send({ channel: 'WhatsApp' });
    expect(generated.status).toBe(201);

    const noAuth = await request(app).get('/api/delivery/logs');
    expect(noAuth.status).toBe(401);
    const patientAuth = jwt.sign({ sub: 'contact-session', role: 'patient' }, env.JWT_SECRET);
    expect((await request(app).get('/api/delivery/logs').set('Authorization', `Bearer ${patientAuth}`)).status).toBe(403);

    const logs = await request(app).get('/api/delivery/logs?channel=WhatsApp&status=Sent&page=1&limit=5')
      .set('Authorization', `Bearer ${staffToken()}`);
    expect(logs.status).toBe(200);
    expect(logs.body.data.logs[0]).toMatchObject({
      reportId: report.reportId,
      patientName: patient.fullName,
      destinationMasked: '90******42',
      channel: 'WhatsApp',
      status: 'Sent'
    });
    const today = new Date().toISOString().slice(0, 10);
    const sameDayLogs = await request(app)
      .get(`/api/delivery/logs?from=${today}&to=${today}`)
      .set('Authorization', `Bearer ${staffToken()}`);
    expect(sameDayLogs.status).toBe(200);
    expect(sameDayLogs.body.data.pagination.total).toBe(1);

    const resent = await request(app).post(`/api/delivery/reports/${report.reportId}/resend`)
      .set('Authorization', `Bearer ${staffToken()}`).send({});
    expect(resent.status).toBe(200);
    expect(resent.body.data.delivery.channel).toBe('WhatsApp');
    expect(await DeliveryLog.countDocuments({ reportId: report._id })).toBe(2);
    expect(await AccessToken.countDocuments({ reportId: report._id, revokedAt: null })).toBe(1);

    const revoked = await request(app).post(`/api/delivery/reports/${report.reportId}/revoke`)
      .set('Authorization', `Bearer ${staffToken()}`);
    expect(revoked.status).toBe(200);
    expect(revoked.body.data.revokedCount).toBe(1);
    expect((await AccessToken.findOne({ reportId: report._id, revokedAt: { $ne: null } })).revokedAt).toBeInstanceOf(Date);
  });

  it('automatically notifies on sign-off once and does not duplicate on a repeated confirmation', async () => {
    await prepareReport('Processing');
    await order.updateOne({ $set: { status: 'Processing' } });
    const { pdfStorageKey, pdfMetadata } = report;
    await Report.updateOne({ _id: report._id }, {
      $set: { pdfStorageKey, pdfMetadata }
    });
    const firstConfirmation = await request(app)
      .post(`/api/staff/reports/${report.reportId}/confirm-signed`)
      .set('Authorization', `Bearer ${staffToken()}`);
    expect(firstConfirmation.status).toBe(200);
    expect(firstConfirmation.body.data.delivery.status).toBe('Sent');
    expect(await DeliveryLog.countDocuments({ reportId: report._id })).toBe(1);

    const repeatedConfirmation = await request(app)
      .post(`/api/staff/reports/${report.reportId}/confirm-signed`)
      .set('Authorization', `Bearer ${staffToken()}`);
    expect(repeatedConfirmation.status).toBe(200);
    expect(repeatedConfirmation.body.data.alreadyReady).toBe(true);
    expect(await DeliveryLog.countDocuments({ reportId: report._id })).toBe(1);
  });

  it('rejects requests from expired or invalid access grants and streams no missing files', async () => {
    await prepareReport();
    const link = await generateSecureReportLink({ reportId: report._id, patientId: patient._id, createdBy: staff._id });
    await AccessToken.updateOne({ _id: link.record._id }, { $set: { usedAt: new Date() } });
    const rawGrant = 'B'.repeat(43);
    await ReportAccessGrant.create({
      tokenHash: hashSecureToken(rawGrant),
      accessTokenId: link.record._id,
      patientId: patient._id,
      reportId: report._id,
      expiresAt: new Date(Date.now() - 1000)
    });
    expect((await request(app).get('/api/delivery/access/report').set('X-Report-Access-Grant', rawGrant)).status).toBe(410);

    const newGrant = 'C'.repeat(43);
    await ReportAccessGrant.create({
      tokenHash: hashSecureToken(newGrant),
      accessTokenId: link.record._id,
      patientId: patient._id,
      reportId: report._id,
      expiresAt: new Date(Date.now() + 60_000)
    });
    await Report.updateOne({ _id: report._id }, { $set: { pdfStorageKey: '00000000-0000-4000-8000-000000000000.pdf' } });
    expect((await request(app).get('/api/delivery/access/report').set('X-Report-Access-Grant', newGrant)).status).toBe(404);
    expect(getPrivateStorageDirectory()).toBe(storageDirectory);
  });
});
