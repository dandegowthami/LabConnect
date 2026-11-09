import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import app from '../app.js';
import AIExplanation from '../models/AIExplanation.js';
import CallbackTask from '../models/CallbackTask.js';
import CriticalThresholdRule from '../models/CriticalThresholdRule.js';
import Doctor from '../models/Doctor.js';
import Patient from '../models/Patient.js';
import Report from '../models/Report.js';
import ReportAuditEvent from '../models/ReportAuditEvent.js';
import TestOrder from '../models/TestOrder.js';
import User from '../models/User.js';
import { env } from '../config/env.js';
import { AIExplanationService } from '../services/aiExplanationService.js';
import { classifyParameters } from '../services/abnormalDetectionService.js';
import { evaluateCriticalResults } from '../services/criticalReviewService.js';

let staff;
let pathologist;
let doctor;
let doctorRecord;
let patient;
let report;
let order;

const authToken = (user) => jwt.sign({ sub: String(user._id), role: user.role }, env.JWT_SECRET);
const makeTestValue = (parameterName = 'Synthetic analyte', result = 5, referenceMin = 3, referenceMax = 8, unit = 'demo-unit') => ({
  parameterName,
  result,
  referenceMin,
  referenceMax,
  unit
});

async function createReportFor(patientRecord, referringDoctor = doctorRecord, {
  reportId = `RPT-MODULE-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
  orderId = `ORD-MODULE-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
  orderDate = new Date(),
  result = 5
} = {}) {
  const savedOrder = await TestOrder.create({
    orderId,
    patientId: patientRecord._id,
    referringDoctorId: referringDoctor._id,
    tests: [{ ...makeTestValue('Synthetic analyte', result), testName: 'Synthetic analyte' }],
    orderDate,
    status: 'Ready'
  });
  const savedReport = await Report.create({
    reportId,
    orderId: savedOrder._id,
    patientId: patientRecord._id,
    parameters: [makeTestValue('Synthetic analyte', result)],
    reportStatus: 'Ready',
    signedAt: new Date(),
    pdfStorageKey: 'opaque-test-storage-key',
    pdfMetadata: {
      originalFilename: 'synthetic.pdf',
      mimeType: 'application/pdf',
      fileSize: 10,
      uploadedAt: new Date(),
      uploadedBy: staff._id
    }
  });
  return { order: savedOrder, report: savedReport };
}

beforeAll(async () => {
  await Promise.all([
    AIExplanation.init(),
    CallbackTask.init(),
    CriticalThresholdRule.init(),
    Doctor.init(),
    Patient.init(),
    Report.init(),
    ReportAuditEvent.init(),
    TestOrder.init(),
    User.init()
  ]);
});

beforeEach(async () => {
  await Promise.all([
    AIExplanation.deleteMany({}),
    CallbackTask.deleteMany({}),
    CriticalThresholdRule.deleteMany({}),
    ReportAuditEvent.deleteMany({}),
    Report.deleteMany({}),
    TestOrder.deleteMany({}),
    Doctor.deleteMany({}),
    Patient.deleteMany({}),
    User.deleteMany({})
  ]);
  staff = await User.create({
    name: 'Module Staff',
    email: `module-staff-${Date.now()}@test.demo`,
    passwordHash: await bcrypt.hash('ModulePassword123', 4),
    role: 'staff'
  });
  pathologist = await User.create({
    name: 'Module Pathologist',
    email: `module-pathologist-${Date.now()}@test.demo`,
    passwordHash: await bcrypt.hash('PathologistPass123', 4),
    role: 'pathologist'
  });
  doctorRecord = await Doctor.create({ doctorId: `DOC-MODULE-${Date.now()}`, name: 'Dr Synthetic', email: 'doctor@test.demo' });
  patient = await Patient.create({
    patientId: `PAT-MODULE-${Date.now()}`,
    fullName: 'Synthetic Patient',
    mobile: '9000000042',
    consentStatus: 'granted'
  });
  ({ report, order } = await createReportFor(patient));
  doctor = await User.create({
    name: doctorRecord.name,
    email: `linked-doctor-${Date.now()}@test.demo`,
    passwordHash: await bcrypt.hash('DoctorPassword123', 4),
    role: 'doctor',
    doctorId: doctorRecord._id
  });
});

describe('rule-based abnormal classification and AI provider', () => {
  it('classifies below, normal, above and missing ranges without assuming thresholds', async () => {
    const values = await classifyParameters([
      makeTestValue('Below', 2, 3, 8),
      makeTestValue('Normal', 5, 3, 8),
      makeTestValue('Above', 9, 3, 8),
      makeTestValue('Missing', 5, null, null)
    ]);
    expect(values.map(({ classification }) => classification)).toEqual([
      'Below reference range',
      'Normal',
      'Above reference range',
      'Reference range unavailable'
    ]);
  });

  it('uses only approved critical thresholds and creates an urgent callback without changing results', async () => {
    report.parameters[0].result = 9;
    await report.save();
    const before = report.parameters[0].result;
    await CriticalThresholdRule.create({
      parameterName: 'Synthetic analyte',
      unit: 'demo-unit',
      criticalHigh: 7,
      status: 'Approved',
      proposedBy: staff._id,
      approvedBy: pathologist._id,
      approvedAt: new Date(),
      approvalNote: 'Approved test fixture only'
    });
    const classifications = await evaluateCriticalResults(report, staff.id);
    expect(classifications[0].classification).toBe('Critical');
    const saved = await Report.findById(report._id);
    expect(saved.criticalReviewStatus).toBe('Urgent review');
    expect(saved.parameters[0].classification).toBe('Critical');
    expect(saved.parameters[0].result).toBe(before);
    expect(await CallbackTask.countDocuments({ reportId: report._id, severity: 'Critical', status: 'Pending' })).toBe(1);
    expect(await ReportAuditEvent.countDocuments({ report: report._id, action: 'critical-result-detected' })).toBe(1);
  });

  it('does not classify a proposed, unapproved threshold as critical', async () => {
    await CriticalThresholdRule.create({
      parameterName: 'Synthetic analyte',
      unit: 'demo-unit',
      criticalHigh: 7,
      status: 'Pending approval',
      proposedBy: staff._id
    });
    const [classification] = await classifyParameters([makeTestValue('Synthetic analyte', 9)]);
    expect(classification.classification).toBe('Above reference range');
    expect(classification.criticalRuleApproved).toBe(false);
  });

  it.each(['en', 'te', 'hi'])('validates structured %s provider output', async (language) => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: JSON.stringify({ summary: `Validated ${language} explanation` }) } }] })
    });
    const service = new AIExplanationService({
      config: {
        AI_PROVIDER: 'openai-compatible',
        AI_API_KEY: 'test-key',
        AI_MODEL: 'test-model',
        AI_API_BASE_URL: 'https://llm.example.invalid/v1',
        AI_TIMEOUT_MS: 1000
      },
      fetchImpl
    });
    const generated = await service.generate({ language, classifications: [makeTestValue()] });
    expect(generated).toEqual({ summary: `Validated ${language} explanation`, model: 'test-model' });
    const requestBody = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(requestBody.response_format).toEqual({ type: 'json_object' });
    expect(requestBody.messages[1].content).toContain('Synthetic analyte');
    expect(requestBody.messages[1].content).not.toContain('patient');
  });

  it('returns an unavailable error for missing configuration and invalid provider output', async () => {
    const unconfigured = new AIExplanationService({ config: {}, fetchImpl: vi.fn() });
    await expect(unconfigured.generate({ language: 'en', classifications: [] }))
      .rejects.toMatchObject({ status: 503, code: 'AI_UNAVAILABLE' });
    const invalid = new AIExplanationService({
      config: {
        AI_PROVIDER: 'openai-compatible',
        AI_API_KEY: 'test-key',
        AI_MODEL: 'test-model',
        AI_API_BASE_URL: 'https://llm.example.invalid/v1',
        AI_TIMEOUT_MS: 1000
      },
      fetchImpl: vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [{ message: { content: '{"summary":""}' } }] })
      })
    });
    await expect(invalid.generate({ language: 'en', classifications: [] }))
      .rejects.toMatchObject({ status: 502, code: 'AI_INVALID_OUTPUT' });
    const failed = new AIExplanationService({
      config: {
        AI_PROVIDER: 'openai-compatible',
        AI_API_KEY: 'test-key',
        AI_MODEL: 'test-model',
        AI_API_BASE_URL: 'https://llm.example.invalid/v1',
        AI_TIMEOUT_MS: 1000
      },
      fetchImpl: vi.fn().mockRejectedValue(new Error('network unavailable'))
    });
    await expect(failed.generate({ language: 'en', classifications: [] }))
      .rejects.toMatchObject({ status: 503, code: 'AI_PROVIDER_FAILURE' });
  });

  it('rejects insecure AI endpoints before sending credentials or report data', async () => {
    const fetchImpl = vi.fn();
    const service = new AIExplanationService({
      config: {
        AI_PROVIDER: 'openai-compatible',
        AI_API_KEY: 'test-key',
        AI_MODEL: 'test-model',
        AI_API_BASE_URL: 'http://llm.example.invalid/v1',
        AI_TIMEOUT_MS: 1000
      },
      fetchImpl
    });
    await expect(service.generate({ language: 'en', classifications: [makeTestValue()] }))
      .rejects.toMatchObject({ status: 503, code: 'AI_INSECURE_ENDPOINT' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('does not call AI for critical reports and withholds explanations from other patients', async () => {
    report.parameters[0].result = 9;
    await report.save();
    await CriticalThresholdRule.create({
      parameterName: 'Synthetic analyte',
      unit: 'demo-unit',
      criticalHigh: 7,
      status: 'Approved',
      proposedBy: staff._id,
      approvedBy: pathologist._id,
      approvedAt: new Date(),
      approvalNote: 'Approved test fixture only'
    });
    const { aiExplanationService } = await import('../services/aiExplanationService.js');
    const generateSpy = vi.spyOn(aiExplanationService, 'generate');
    const critical = await request(app)
      .post(`/api/ai/reports/${report.reportId}/explain`)
      .set('Authorization', `Bearer ${authToken(staff)}`)
      .send({ language: 'en' });
    expect(critical.status).toBe(409);
    expect(critical.body.status).toBe('Critical review required');
    expect(generateSpy).not.toHaveBeenCalled();

    await AIExplanation.create({
      reportId: report._id,
      patientId: patient._id,
      language: 'en',
      summary: 'Synthetic validated explanation',
      model: 'test-model',
      generatedAt: new Date(),
      promptVersion: 'test-v1',
      sourceFingerprint: 'a'.repeat(64)
    });
    const otherPatient = await Patient.create({
      patientId: `PAT-OTHER-${Date.now()}`,
      fullName: 'Other Synthetic Patient',
      mobile: '9000000099',
      consentStatus: 'granted'
    });
    const otherToken = jwt.sign({ sub: 'other-patient', role: 'patient', patientId: String(otherPatient._id) }, env.JWT_SECRET);
    const denied = await request(app)
      .get(`/api/ai/reports/${report.reportId}/summary?language=en`)
      .set('Authorization', `Bearer ${otherToken}`);
    expect(denied.status).toBe(404);
    generateSpy.mockRestore();
  });

  it('returns an unavailable AI status instead of a fabricated explanation', async () => {
    const response = await request(app)
      .post(`/api/ai/reports/${report.reportId}/explain`)
      .set('Authorization', `Bearer ${authToken(staff)}`)
      .send({ language: 'te' });
    expect(response.status).toBe(503);
    expect(response.body.status).toBe('Unavailable');
    expect(await AIExplanation.countDocuments({ reportId: report._id })).toBe(0);
  });

  it('allows an identity-bound patient to flag only their saved explanation', async () => {
    await AIExplanation.create({
      reportId: report._id,
      patientId: patient._id,
      language: 'te',
      summary: 'Synthetic Telugu explanation',
      model: 'test-model',
      generatedAt: new Date(),
      promptVersion: 'test-v1',
      sourceFingerprint: 'b'.repeat(64)
    });
    const token = jwt.sign({
      sub: 'verified-patient-session',
      role: 'patient',
      patientId: String(patient._id)
    }, env.JWT_SECRET);
    const flagged = await request(app)
      .post(`/api/ai/reports/${report.reportId}/flag-summary`)
      .set('Authorization', `Bearer ${token}`)
      .send({ language: 'te', reason: 'The wording is confusing to me.' });
    expect(flagged.status).toBe(200);
    expect((await AIExplanation.findOne({ reportId: report._id, language: 'te' })).status).toBe('Flagged');
    const tasks = await request(app).get('/api/staff/callback-tasks?flagged=true')
      .set('Authorization', `Bearer ${authToken(staff)}`);
    expect(tasks.status).toBe(200);
    expect(tasks.body.data.tasks[0].flagReason).toBe('The wording is confusing to me.');
  });
});

describe('staff callback, dashboard and referring doctor authorization', () => {
  it('aggregates dashboard data and denies patient and doctor access to staff APIs', async () => {
    await DeliveryLogForTest();
    const dashboard = await request(app).get('/api/staff/dashboard')
      .set('Authorization', `Bearer ${authToken(staff)}`);
    expect(dashboard.status).toBe(200);
    expect(dashboard.body.data.totalPatients).toBe(1);
    expect(dashboard.body.data.totalOrders).toBe(1);
    expect(dashboard.body.data.readyReports).toBe(1);
    const patientToken = jwt.sign({ sub: 'contact-session', role: 'patient' }, env.JWT_SECRET);
    expect((await request(app).get('/api/staff/dashboard').set('Authorization', `Bearer ${patientToken}`)).status).toBe(403);
    expect((await request(app).get('/api/staff/dashboard').set('Authorization', `Bearer ${authToken(doctor)}`)).status).toBe(403);
  });

  it('searches patients by order and exposes only masked mobile numbers', async () => {
    const response = await request(app)
      .get(`/api/staff/patients?q=${order.orderId}&page=1&limit=10`)
      .set('Authorization', `Bearer ${authToken(staff)}`);
    expect(response.status).toBe(200);
    expect(response.body.data.patients[0]).toMatchObject({
      patientId: patient.patientId,
      mobileMasked: '90******42'
    });
    expect(JSON.stringify(response.body)).not.toContain(patient.mobile);
  });

  it('requires resolution notes and allows documented task assignment and resolution', async () => {
    const task = await CallbackTask.create({
      reportId: report._id,
      patientId: patient._id,
      parameterName: 'Synthetic analyte',
      severity: 'Critical'
    });
    const endpoint = `/api/staff/callback-tasks/${task.id}`;
    const missingNotes = await request(app).patch(endpoint)
      .set('Authorization', `Bearer ${authToken(staff)}`)
      .send({ status: 'Resolved' });
    expect(missingNotes.status).toBe(400);
    const resolved = await request(app).patch(endpoint)
      .set('Authorization', `Bearer ${authToken(staff)}`)
      .send({ status: 'Resolved', assignedTo: String(pathologist._id), resolutionNotes: 'Reviewed with the laboratory supervisor.' });
    expect(resolved.status).toBe(200);
    expect(await CallbackTask.findById(task._id).select('status assignedTo resolutionNotes resolvedAt'))
      .toMatchObject({ status: 'Resolved', assignedTo: pathologist._id, resolutionNotes: 'Reviewed with the laboratory supervisor.' });
  });

  it('requires pathologist approval before a critical rule becomes active', async () => {
    const proposed = await request(app).post('/api/staff/critical-rules')
      .set('Authorization', `Bearer ${authToken(staff)}`)
      .send({ parameterName: 'Synthetic analyte', unit: 'demo-unit', criticalLow: 1 });
    expect(proposed.status).toBe(201);
    expect((await CriticalThresholdRule.findById(proposed.body.data.id)).status).toBe('Pending approval');
    const rejectedApproval = await request(app).patch(`/api/staff/critical-rules/${proposed.body.data.id}/approve`)
      .set('Authorization', `Bearer ${authToken(staff)}`)
      .send({ approvalNote: 'Not authorized' });
    expect(rejectedApproval.status).toBe(403);
    const approved = await request(app).patch(`/api/staff/critical-rules/${proposed.body.data.id}/approve`)
      .set('Authorization', `Bearer ${authToken(pathologist)}`)
      .send({ approvalNote: 'Threshold verified against laboratory policy.' });
    expect(approved.status).toBe(200);
    expect((await CriticalThresholdRule.findById(proposed.body.data.id)).status).toBe('Approved');
  });

  it('provisions doctor accounts privately and restricts doctors to consented reports referred by them', async () => {
    const provisionedDoctorRecord = await Doctor.create({
      doctorId: `DOC-PROVISIONED-${Date.now()}`,
      name: 'Dr Provisioned',
      email: 'provisioned-doctor@test.demo'
    });
    const provisionedReport = await createReportFor(patient, provisionedDoctorRecord);
    const provisioned = await request(app).post('/api/staff/doctor-accounts')
      .set('Authorization', `Bearer ${authToken(staff)}`)
      .send({
        doctorId: String(provisionedDoctorRecord._id),
        email: 'provisioned-doctor@test.demo',
        password: 'ProvisionedDoctor123'
      });
    expect(provisioned.status).toBe(201);
    const login = await request(app).post('/api/auth/doctor/login')
      .send({ email: 'provisioned-doctor@test.demo', password: 'ProvisionedDoctor123' });
    expect(login.status).toBe(200);
    const doctorToken = `Bearer ${login.body.data.token}`;
    const reports = await request(app).get('/api/doctor/reports').set('Authorization', doctorToken);
    expect(reports.status).toBe(200);
    expect(reports.body.data.reports.map(({ reportId }) => reportId)).toContain(provisionedReport.report.reportId);
    expect(reports.body.data.reports.map(({ reportId }) => reportId)).not.toContain(report.reportId);
    expect((await request(app).get(`/api/doctor/reports/${provisionedReport.report.reportId}`).set('Authorization', doctorToken)).status).toBe(200);

    const otherDoctorRecord = await Doctor.create({ doctorId: `DOC-OTHER-${Date.now()}`, name: 'Dr Other' });
    const otherPatient = await Patient.create({
      patientId: `PAT-DOCTOR-OTHER-${Date.now()}`,
      fullName: 'Other Patient',
      mobile: '9000000088',
      consentStatus: 'granted'
    });
    const unrelated = await createReportFor(otherPatient, otherDoctorRecord);
    expect((await request(app).get(`/api/doctor/reports/${unrelated.report.reportId}`).set('Authorization', doctorToken)).status).toBe(404);
    await patient.updateOne({ $set: { consentStatus: 'withdrawn' } });
    expect((await request(app).get(`/api/doctor/reports/${report.reportId}`).set('Authorization', doctorToken)).status).toBe(404);
  });

  it('filters doctor reports to the last 90 days', async () => {
    const old = await createReportFor(patient, doctorRecord, {
      reportId: `RPT-OLD-${Date.now()}`,
      orderId: `ORD-OLD-${Date.now()}`,
      orderDate: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000)
    });
    const response = await request(app).get('/api/doctor/reports').set('Authorization', `Bearer ${authToken(doctor)}`);
    expect(response.status).toBe(200);
    const visibleIds = response.body.data.reports.map(({ reportId }) => reportId);
    expect(visibleIds).toContain(report.reportId);
    expect(visibleIds).not.toContain(old.report.reportId);
  });
});

async function DeliveryLogForTest() {
  const DeliveryLog = (await import('../models/DeliveryLog.js')).default;
  await DeliveryLog.create({
    reportId: report._id,
    patientId: patient._id,
    channel: 'SMS',
    destinationMasked: '90******42',
    status: 'Sent',
    createdBy: staff._id
  });
}

afterAll(() => {
  vi.restoreAllMocks();
});
