import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { PDFDocument } from 'pdf-lib';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import app from '../app.js';
import { env } from '../config/env.js';
import Doctor from '../models/Doctor.js';
import Patient from '../models/Patient.js';
import Report from '../models/Report.js';
import ReportAuditEvent from '../models/ReportAuditEvent.js';
import TestOrder from '../models/TestOrder.js';
import User from '../models/User.js';
import { getPrivateStorageDirectory } from '../config/storage.js';

let staff;
let doctor;
let storageDirectory;

const staffToken = () => jwt.sign({ sub: staff.id, role: staff.role }, env.JWT_SECRET);
const patientToken = (patientId) => jwt.sign({
  sub: 'verified-patient-session',
  role: 'patient',
  ...(patientId ? { patientId } : {})
}, env.JWT_SECRET);

async function createPatient(patientId, fullName) {
  return Patient.create({ patientId, fullName, mobile: '9000000011', consentStatus: 'granted' });
}

async function createReport(patient, {
  orderId = `ORD-${patient.patientId}`,
  reportId = `RPT-${patient.patientId}`,
  status = 'Processing',
  signedAt = null
} = {}) {
  const order = await TestOrder.create({
    orderId,
    patientId: patient._id,
    referringDoctorId: doctor._id,
    tests: [{
      testName: 'Example test',
      result: 12.5,
      unit: 'mg/L',
      referenceMin: 2,
      referenceMax: 20
    }],
    status
  });
  const report = await Report.create({
    reportId,
    orderId: order._id,
    patientId: patient._id,
    parameters: [{
      parameterName: 'Example test',
      result: 12.5,
      unit: 'mg/L',
      referenceMin: 2,
      referenceMax: 20
    }],
    reportStatus: status,
    signedAt
  });
  return { order, report };
}

async function validPdf() {
  const document = await PDFDocument.create();
  document.addPage();
  return Buffer.from(await document.save());
}

function upload(token, reportId, contents, filename = 'signed-report.pdf', contentType = 'application/pdf') {
  return request(app)
    .post(`/api/staff/reports/${encodeURIComponent(reportId)}/upload-pdf`)
    .set('Authorization', `Bearer ${token}`)
    .attach('file', contents, { filename, contentType });
}

beforeAll(async () => {
  await Promise.all([
    Doctor.init(),
    Patient.init(),
    Report.init(),
    ReportAuditEvent.init(),
    TestOrder.init(),
    User.init()
  ]);
});

beforeEach(async () => {
  storageDirectory = await mkdtemp(path.join(os.tmpdir(), 'labconnect-report-test-'));
  process.env.PDF_STORAGE_DIR = storageDirectory;
  await Promise.all([
    ReportAuditEvent.deleteMany({}),
    Report.deleteMany({}),
    TestOrder.deleteMany({}),
    Doctor.deleteMany({}),
    Patient.deleteMany({}),
    User.deleteMany({})
  ]);
  staff = await User.create({
    name: 'Report Staff',
    email: `reports-${Date.now()}@test.demo`,
    passwordHash: await bcrypt.hash('DemoPassword123', 4),
    role: 'staff'
  });
  doctor = await Doctor.create({ doctorId: `DOC-${Date.now()}`, name: 'Dr. Example' });
});

afterAll(async () => {
  delete process.env.PDF_STORAGE_DIR;
});

afterEach(async () => {
  if (storageDirectory) await rm(storageDirectory, { recursive: true, force: true });
});

describe('patient record APIs', () => {
  it('requires a patient identity claim beyond verified phone contact', async () => {
    const response = await request(app)
      .get('/api/patients/me')
      .set('Authorization', `Bearer ${patientToken()}`);
    expect(response.status).toBe(403);
    expect(response.body.message).toMatch(/identity verification is required/i);
  });

  it('returns a safe profile and only orders and reports owned by the verified patient ID', async () => {
    const firstPatient = await createPatient('PAT-FIRST', 'First Synthetic Patient');
    const secondPatient = await createPatient('PAT-SECOND', 'Second Synthetic Patient');
    const firstRecords = await createReport(firstPatient);
    const secondRecords = await createReport(secondPatient);
    const token = patientToken(firstPatient.id);

    const profile = await request(app).get('/api/patients/me').set('Authorization', `Bearer ${token}`);
    expect(profile.status).toBe(200);
    expect(profile.headers['cache-control']).toBe('private, no-store');
    expect(profile.body.data.patient).toEqual({ name: 'First Synthetic Patient', mobile: '90******11' });
    expect(JSON.stringify(profile.body)).not.toContain(firstPatient.id);

    const orders = await request(app).get('/api/patients/me/orders?page=1&limit=1').set('Authorization', `Bearer ${token}`);
    expect(orders.status).toBe(200);
    expect(orders.body.data.orders).toHaveLength(1);
    expect(orders.body.data.orders[0]).toMatchObject({
      orderId: firstRecords.order.orderId,
      testNames: ['Example test'],
      reportAvailable: false,
      reportId: null
    });
    expect(orders.body.data.orders.some(({ orderId }) => orderId === secondRecords.order.orderId)).toBe(false);
    expect(orders.body.data.pagination).toMatchObject({ page: 1, limit: 1, total: 1 });

    const reports = await request(app).get('/api/patients/me/reports').set('Authorization', `Bearer ${token}`);
    expect(reports.status).toBe(200);
    expect(reports.body.data.reports.map(({ reportId }) => reportId)).toEqual([firstRecords.report.reportId]);
    expect(JSON.stringify(reports.body)).not.toContain('pdfStorageKey');
  });

  it('rejects unauthenticated access and invalid pagination', async () => {
    const patient = await createPatient('PAT-PAGE', 'Pagination Patient');
    expect((await request(app).get('/api/patients/me/orders')).status).toBe(401);
    const invalid = await request(app).get('/api/patients/me/orders?page=0&limit=200')
      .set('Authorization', `Bearer ${patientToken(patient.id)}`);
    expect(invalid.status).toBe(400);
  });

  it('withholds processing report details from patients and hides other patients reports', async () => {
    const firstPatient = await createPatient('PAT-OWN', 'Own Patient');
    const secondPatient = await createPatient('PAT-OTHER', 'Other Patient');
    const own = await createReport(firstPatient);
    const other = await createReport(secondPatient);
    const token = patientToken(firstPatient.id);

    const ownReport = await request(app).get(`/api/reports/${own.report.reportId}`).set('Authorization', `Bearer ${token}`);
    expect(ownReport.status).toBe(409);
    const otherReport = await request(app).get(`/api/reports/${other.report.reportId}`).set('Authorization', `Bearer ${token}`);
    expect(otherReport.status).toBe(404);
    expect((await request(app).get('/api/reports/invalid$id').set('Authorization', `Bearer ${token}`)).status).toBe(400);
    expect((await request(app).get(`/api/reports/${own.report.reportId}`)).status).toBe(401);
    expect((await request(app).get('/api/reports/%2E%2E%2Fsecret/view')
      .set('Authorization', `Bearer ${token}`)).status).toBe(400);

    const staffReport = await request(app).get(`/api/reports/${own.report.reportId}`).set('Authorization', `Bearer ${staffToken()}`);
    expect(staffReport.status).toBe(200);
    expect(staffReport.body.data.report.tests[0]).toMatchObject({
      testName: 'Example test',
      result: 12.5,
      unit: 'mg/L',
      referenceMin: 2,
      referenceMax: 20
    });
  });
});

describe('staff PDF management', () => {
  it('requires staff authentication and rejects non-staff upload requests', async () => {
    const patient = await createPatient('PAT-UPLOAD-AUTH', 'Upload Patient');
    const { report } = await createReport(patient);
    const pdf = await validPdf();
    expect((await upload('', report.reportId, pdf)).status).toBe(401);
    expect((await upload(patientToken(patient.id), report.reportId, pdf)).status).toBe(403);
    expect((await request(app).post('/api/staff/reports/missing/upload-pdf')
      .set('Authorization', `Bearer ${staffToken()}`)).status).toBe(400);
  });

  it('rejects non-PDF content, corrupted documents and files over 10 MB', async () => {
    const patient = await createPatient('PAT-UPLOAD-VALIDATION', 'Validation Patient');
    const { report } = await createReport(patient);
    expect((await upload(staffToken(), report.reportId, Buffer.from('not pdf'), 'note.txt', 'text/plain')).status).toBe(400);
    expect((await upload(staffToken(), report.reportId, Buffer.from('%PDF-1.7\nbroken\n%%EOF'))).status).toBe(400);
    const oversized = Buffer.alloc(10 * 1024 * 1024 + 1, 97);
    expect((await upload(staffToken(), report.reportId, oversized)).status).toBe(413);
    expect((await Report.findById(report._id).select('+pdfStorageKey')).pdfStorageKey).toBeNull();
  });

  it('uploads privately, requires explicit sign-off and authorizes private PDF access', async () => {
    const owner = await createPatient('PAT-PDF-OWNER', 'PDF Owner');
    const otherPatient = await createPatient('PAT-PDF-OTHER', 'PDF Other');
    const { report, order } = await createReport(owner, { status: 'Processing' });
    const other = await createReport(otherPatient);
    const token = staffToken();
    const pdf = await validPdf();

    const uploadResponse = await upload(token, report.reportId, pdf, 'signed-final.pdf');
    expect(uploadResponse.status).toBe(201);
    expect(uploadResponse.body.data).toMatchObject({ pdfUploaded: true, reportStatus: 'Processing', pdfAvailable: false });
    expect(JSON.stringify(uploadResponse.body)).not.toMatch(/storageKey|private-storage|pdfStorageKey/i);

    const saved = await Report.findById(report._id).select('+pdfStorageKey');
    expect(saved.pdfMetadata).toMatchObject({
      originalFilename: 'signed-final.pdf',
      mimeType: 'application/pdf',
      fileSize: pdf.length,
      uploadedBy: staff._id
    });
    expect(saved.pdfStorageKey).toMatch(/^[a-f0-9-]+\.pdf$/);
    expect(getPrivateStorageDirectory()).toBe(storageDirectory);

    const patientTokenForOwner = patientToken(owner.id);
    expect((await request(app).get(`/api/reports/${report.reportId}/view`).set('Authorization', `Bearer ${patientTokenForOwner}`)).status).toBe(409);
    expect((await request(app).get(`/api/reports/${other.report.reportId}/view`).set('Authorization', `Bearer ${patientTokenForOwner}`)).status).toBe(404);

    const confirmResponse = await request(app)
      .post(`/api/staff/reports/${report.reportId}/confirm-signed`)
      .set('Authorization', `Bearer ${token}`);
    expect(confirmResponse.status).toBe(200);
    expect(confirmResponse.body.data.reportStatus).toBe('Ready');
    expect((await TestOrder.findById(order._id)).status).toBe('Ready');

    const view = await request(app).get(`/api/reports/${report.reportId}/view`).set('Authorization', `Bearer ${patientTokenForOwner}`);
    expect(view.status).toBe(200);
    expect(view.headers['content-type']).toMatch(/application\/pdf/);
    expect(view.headers['content-disposition']).toMatch(/^inline;/);
    expect(view.headers['cache-control']).toBe('private, no-store');
    expect(Buffer.from(view.body)).toEqual(pdf);
    const details = await request(app).get(`/api/reports/${report.reportId}`).set('Authorization', `Bearer ${patientTokenForOwner}`);
    expect(details.status).toBe(200);
    expect(details.body.data.report).toMatchObject({
      reportId: report.reportId,
      pdfAvailable: true,
      tests: [{ result: 12.5 }]
    });

    const download = await request(app).get(`/api/reports/${report.reportId}/download`).set('Authorization', `Bearer ${patientTokenForOwner}`);
    expect(download.status).toBe(200);
    expect(download.headers['content-disposition']).toMatch(/^attachment;/);
    expect(Buffer.from(download.body)).toEqual(pdf);
    expect((await ReportAuditEvent.find({ report: report._id }).select('action')).map(({ action }) => action))
      .toEqual(expect.arrayContaining(['pdf-uploaded', 'signed-confirmed', 'pdf-viewed', 'pdf-downloaded']));

    const staffList = await request(app).get('/api/staff/reports').set('Authorization', `Bearer ${token}`);
    expect(staffList.status).toBe(200);
    expect(staffList.body.data.reports.find(({ reportId }) => reportId === report.reportId))
      .toMatchObject({ pdfUploaded: true, pdfAvailable: true, patient: { name: 'PDF Owner' } });
  });

  it('does not silently overwrite an uploaded PDF or confirm a report without a file', async () => {
    const patient = await createPatient('PAT-PDF-ONCE', 'Single Upload Patient');
    const { report } = await createReport(patient);
    const token = staffToken();
    const pdf = await validPdf();
    expect((await request(app).post(`/api/staff/reports/${report.reportId}/confirm-signed`).set('Authorization', `Bearer ${token}`)).status).toBe(409);
    expect((await upload(token, report.reportId, pdf)).status).toBe(201);
    expect((await upload(token, report.reportId, pdf)).status).toBe(409);
  });

  it('does not expose an imported Ready status without a signed PDF', async () => {
    const patient = await createPatient('PAT-READY-NO-PDF', 'Unsigned Patient');
    const { report } = await createReport(patient, { status: 'Ready', signedAt: null });
    const token = patientToken(patient.id);
    const details = await request(app).get(`/api/reports/${report.reportId}`).set('Authorization', `Bearer ${token}`);
    expect(details.status).toBe(409);
    const response = await request(app).get(`/api/reports/${report.reportId}/download`).set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(409);
  });
});
