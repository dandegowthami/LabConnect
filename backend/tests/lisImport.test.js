import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import app from '../app.js';
import { env } from '../config/env.js';
import Doctor from '../models/Doctor.js';
import ImportHistory from '../models/ImportHistory.js';
import LISImportBatch from '../models/LISImportBatch.js';
import OTP from '../models/OTP.js';
import Patient from '../models/Patient.js';
import Report from '../models/Report.js';
import TestOrder from '../models/TestOrder.js';
import User from '../models/User.js';
import { seedLisDemo } from '../services/lisDemoSeedService.js';
import { LIS_CSV_HEADERS } from '../services/lisImportService.js';

let testStaff;
const staffToken = () => jwt.sign({ sub: testStaff.id, role: 'staff' }, env.JWT_SECRET);
const makeCsv = (rows, headers = LIS_CSV_HEADERS) => [
  headers.join(','),
  ...rows.map((row) => headers.map((header) => row[header] ?? '').join(','))
].join('\n');

function row(overrides = {}) {
  return {
    orderId: 'ORD-TEST-001',
    patientId: 'PAT-TEST-001',
    patientName: 'Synthetic Patient',
    mobile: '9000000011',
    doctorName: 'Dr. Example',
    testName: 'Example Test',
    result: '12.5',
    unit: 'mg/L',
    referenceMin: '2',
    referenceMax: '20',
    status: 'Ready',
    ...overrides
  };
}

function uploadCsv(token, csv, { filename = 'lab.csv', contentType = 'text/csv' } = {}) {
  return request(app)
    .post('/api/import/lis/preview')
    .set('Authorization', `Bearer ${token}`)
    .attach('file', Buffer.isBuffer(csv) ? csv : Buffer.from(csv), { filename, contentType });
}

beforeAll(async () => {
  await Promise.all([Doctor.init(), TestOrder.init(), Report.init(), ImportHistory.init(), LISImportBatch.init()]);
});

beforeEach(async () => {
  await Promise.all([
    OTP.deleteMany({}),
    Patient.deleteMany({}),
    User.deleteMany({}),
    Doctor.deleteMany({}),
    TestOrder.deleteMany({}),
    Report.deleteMany({}),
    ImportHistory.deleteMany({}),
    LISImportBatch.deleteMany({})
  ]);
  testStaff = await User.create({
    name: 'Test Staff',
    email: 'lis-import@test.demo',
    passwordHash: await bcrypt.hash('DemoPassword123', 4),
    role: 'staff'
  });
});

describe('LIS CSV preview', () => {
  it('previews valid records without creating business records and groups tests by order', async () => {
    const csv = makeCsv([
      row(),
      row({ testName: 'Second Test', result: '3.2', unit: 'mmol/L', referenceMin: '1', referenceMax: '5' })
    ]);
    const response = await uploadCsv(staffToken(), csv);

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ totalRows: 2, validRecords: 2, validOrders: 1, invalidRecords: 0 });
    expect(response.body.data.groupedOrders[0].tests).toHaveLength(2);
    expect(await Patient.countDocuments()).toBe(0);
    expect(await Doctor.countDocuments()).toBe(0);
    expect(await TestOrder.countDocuments()).toBe(0);
    expect(await Report.countDocuments()).toBe(0);
    expect(await LISImportBatch.countDocuments()).toBe(1);
  });

  it('rejects missing headers and empty CSVs', async () => {
    const token = staffToken();
    expect((await uploadCsv(token, 'orderId,patientId\n1,2')).status).toBe(400);
    expect((await uploadCsv(token, '')).status).toBe(400);
  });

  it('counts malformed CSV data rows as invalid records', async () => {
    const response = await uploadCsv(staffToken(), `${LIS_CSV_HEADERS.join(',')}\n${row().orderId},PAT-TEST-001`);
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ totalRows: 1, validRecords: 0, invalidRecords: 1 });
    expect(response.body.data.rowErrors[0].row).toBe(2);
  });

  it('rejects invalid extension, MIME type and oversized files', async () => {
    const token = staffToken();
    expect((await uploadCsv(token, makeCsv([row()]), { filename: 'lab.txt' })).status).toBe(400);
    expect((await uploadCsv(token, makeCsv([row()]), { contentType: 'application/json' })).status).toBe(400);
    const oversized = Buffer.alloc(2 * 1024 * 1024 + 1, 97);
    const response = await uploadCsv(token, oversized);
    expect(response.status).toBe(413);
  });

  it.each([
    [{ mobile: '123' }, /mobile must be a valid/],
    [{ result: 'not-a-number' }, /result must be a number/],
    [{ referenceMin: '10', referenceMax: '2' }, /referenceMin must not exceed referenceMax/],
    [{ status: 'Unknown' }, /status must be Processing, Ready or Cancelled/]
  ])('returns row-level validation errors for invalid values', async (overrides, message) => {
    const response = await uploadCsv(staffToken(), makeCsv([row(overrides)]));
    expect(response.status).toBe(200);
    expect(response.body.data.invalidRecords).toBe(1);
    expect(response.body.data.rowErrors.map(({ message: detail }) => detail)).toEqual(expect.arrayContaining([expect.stringMatching(message)]));
  });

  it('rejects conflicting identities for an existing patient ID', async () => {
    await Patient.create({ patientId: 'PAT-TEST-001', fullName: 'Different Synthetic Patient', mobile: '9000000012' });
    const response = await uploadCsv(staffToken(), makeCsv([row()]));
    expect(response.body.data.invalidRecords).toBe(1);
    expect(response.body.data.rowErrors[0].message).toMatch(/different name or mobile/);
  });

  it('treats multiple tests under one order as a group and skips existing order IDs', async () => {
    const patient = await Patient.create({ patientId: 'PAT-TEST-001', fullName: 'Synthetic Patient', mobile: '9000000011' });
    const doctor = await Doctor.create({ doctorId: 'DOC-TEST-001', name: 'Dr. Existing' });
    await TestOrder.create({
      orderId: 'ORD-TEST-001',
      patientId: patient._id,
      referringDoctorId: doctor._id,
      tests: [{ testName: 'Existing', result: 1, unit: 'u', referenceMin: 0, referenceMax: 2 }],
      status: 'Ready'
    });
    const response = await uploadCsv(staffToken(), makeCsv([row(), row({ testName: 'Second Test' })]));
    expect(response.body.data).toMatchObject({ validRecords: 0, duplicateRecords: 2, duplicateOrders: 1, skippedRows: 2 });
  });

  it('requires staff authentication and blocks patient access', async () => {
    const csv = Buffer.from(makeCsv([row()]));
    expect((await request(app).post('/api/import/lis/preview').attach('file', csv, 'lab.csv')).status).toBe(401);
    const patientToken = jwt.sign({ sub: 'patient-contact:test', role: 'patient' }, env.JWT_SECRET);
    expect((await uploadCsv(patientToken, makeCsv([row()]))).status).toBe(403);
    expect((await request(app).get('/api/import/history').set('Authorization', `Bearer ${patientToken}`)).status).toBe(403);
  });
});

describe('LIS import commit and history', () => {
  it('commits validated records with correct patient, doctor, order and report references', async () => {
    const token = staffToken();
    const preview = await uploadCsv(token, makeCsv([
      row(),
      row({ testName: 'Second Test', result: '9', referenceMin: '1', referenceMax: '10' })
    ]));
    const commit = await request(app).post('/api/import/lis/commit')
      .set('Authorization', `Bearer ${token}`)
      .send({ previewId: preview.body.data.previewId });

    expect(commit.status).toBe(200);
    expect(commit.body.data).toMatchObject({ totalRows: 2, importedRows: 2, skippedRows: 0, failedRows: 0, status: 'completed' });
    const patient = await Patient.findOne({ patientId: 'PAT-TEST-001' });
    const order = await TestOrder.findOne({ orderId: 'ORD-TEST-001' }).populate('patientId referringDoctorId');
    const report = await Report.findOne({ reportId: 'RPT-ORD-TEST-001' }).populate('orderId patientId');
    expect(order.patientId.id).toBe(patient.id);
    expect(order.referringDoctorId.name).toBe('Dr. Example');
    expect(order.tests).toHaveLength(2);
    expect(order.tests[0].resultStatus).toBe('Not evaluated');
    expect(report.orderId.id).toBe(order.id);
    expect(report.patientId.id).toBe(patient.id);
    expect(report.parameters).toHaveLength(2);
    expect(report.signedAt).toBeNull();
  });

  it('prevents repeated commits and logs the import', async () => {
    const token = staffToken();
    const preview = await uploadCsv(token, makeCsv([row()]));
    const body = { previewId: preview.body.data.previewId };
    expect((await request(app).post('/api/import/lis/commit').set('Authorization', `Bearer ${token}`).send(body)).status).toBe(200);
    expect((await request(app).post('/api/import/lis/commit').set('Authorization', `Bearer ${token}`).send(body)).status).toBe(409);
    expect(await TestOrder.countDocuments()).toBe(1);
    expect(await ImportHistory.countDocuments()).toBe(1);
  });

  it('skips records from a new preview when the same orders were already imported', async () => {
    const token = staffToken();
    const firstPreview = await uploadCsv(token, makeCsv([row()]));
    await request(app).post('/api/import/lis/commit')
      .set('Authorization', `Bearer ${token}`)
      .send({ previewId: firstPreview.body.data.previewId });

    const secondPreview = await uploadCsv(token, makeCsv([row()]));
    expect(secondPreview.body.data).toMatchObject({ validRecords: 0, duplicateRecords: 1 });
    const secondCommit = await request(app).post('/api/import/lis/commit')
      .set('Authorization', `Bearer ${token}`)
      .send({ previewId: secondPreview.body.data.previewId });
    expect(secondCommit.body.data).toMatchObject({ importedRows: 0, skippedRows: 1, failedRows: 0 });
    expect(await TestOrder.countDocuments({ orderId: 'ORD-TEST-001' })).toBe(1);
  });

  it('enforces unique database keys for imported orders and reports', async () => {
    const patient = await Patient.create({ patientId: 'PAT-UNIQUE', fullName: 'Unique Demo', mobile: '9000000014' });
    const doctor = await Doctor.create({ doctorId: 'DOC-UNIQUE', name: 'Dr. Unique' });
    const order = await TestOrder.create({
      orderId: 'ORD-UNIQUE',
      patientId: patient._id,
      referringDoctorId: doctor._id,
      tests: [{ testName: 'Test', result: 1, unit: 'u', referenceMin: 0, referenceMax: 2 }],
      status: 'Ready'
    });
    await expect(TestOrder.create({
      orderId: 'ORD-UNIQUE',
      patientId: patient._id,
      referringDoctorId: doctor._id,
      tests: [{ testName: 'Test', result: 1, unit: 'u', referenceMin: 0, referenceMax: 2 }],
      status: 'Ready'
    })).rejects.toMatchObject({ code: 11000 });

    await Report.create({
      reportId: 'RPT-UNIQUE',
      orderId: order._id,
      patientId: patient._id,
      parameters: [{ parameterName: 'Test', result: 1, unit: 'u', referenceMin: 0, referenceMax: 2 }],
      reportStatus: 'Ready'
    });
    await expect(Report.create({
      reportId: 'RPT-UNIQUE-2',
      orderId: order._id,
      patientId: patient._id,
      parameters: [{ parameterName: 'Test', result: 1, unit: 'u', referenceMin: 0, referenceMax: 2 }],
      reportStatus: 'Ready'
    })).rejects.toMatchObject({ code: 11000 });
  });

  it('records history when a preview contains no valid orders', async () => {
    const token = staffToken();
    const preview = await uploadCsv(token, makeCsv([row({ status: 'Invalid' })]));
    const response = await request(app).post('/api/import/lis/commit')
      .set('Authorization', `Bearer ${token}`)
      .send({ previewId: preview.body.data.previewId });
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ importedRows: 0, failedRows: 1, status: 'failed' });
    expect(await ImportHistory.countDocuments()).toBe(1);
  });

  it('reports partial failures without losing valid orders', async () => {
    const token = staffToken();
    const preview = await uploadCsv(token, makeCsv([
      row({ orderId: 'ORD-VALID', patientId: 'PAT-VALID' }),
      row({ orderId: 'ORD-CONFLICT', patientId: 'PAT-CONFLICT' })
    ]));
    await Patient.create({ patientId: 'PAT-CONFLICT', fullName: 'Another Person', mobile: '9000000012' });
    const response = await request(app).post('/api/import/lis/commit')
      .set('Authorization', `Bearer ${token}`)
      .send({ previewId: preview.body.data.previewId });
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ importedRows: 1, failedRows: 1, status: 'partial' });
    expect(await TestOrder.countDocuments()).toBe(1);
  });

  it('returns paginated import history and row-level details', async () => {
    const staff = await User.create({
      name: 'Demo Staff',
      email: 'staff@test.demo',
      passwordHash: await bcrypt.hash('DemoPassword123', 4),
      role: 'staff'
    });
    const token = jwt.sign({ sub: staff.id, role: 'staff' }, env.JWT_SECRET);
    const preview = await uploadCsv(token, makeCsv([
      row(),
      row({ orderId: 'ORD-INVALID', patientId: 'PAT-INVALID', status: 'Invalid' })
    ]));
    const result = await request(app).post('/api/import/lis/commit')
      .set('Authorization', `Bearer ${token}`)
      .send({ previewId: preview.body.data.previewId });
    const history = await request(app).get('/api/import/history?page=1&limit=5')
      .set('Authorization', `Bearer ${token}`);

    expect(history.status).toBe(200);
    expect(history.body.data.pagination).toMatchObject({ page: 1, limit: 5, total: 1 });
    expect(history.body.data.imports[0].importedBy).toMatchObject({ name: 'Demo Staff', email: 'staff@test.demo' });
    expect(JSON.stringify(history.body)).not.toContain('passwordHash');
    const detail = await request(app).get(`/api/import/${result.body.data.importId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(detail.body.data.errors[0].row).toBe(3);
  });
});

describe('LIS seed data', () => {
  it('is idempotent and creates three linked synthetic demo sets', async () => {
    await seedLisDemo();
    await seedLisDemo();
    expect(await Patient.countDocuments({ patientId: /^DEMO-LIS-PAT-/ })).toBe(3);
    expect(await Doctor.countDocuments({ doctorId: /^DEMO-LIS-DOC-/ })).toBe(3);
    expect(await TestOrder.countDocuments({ orderId: /^ORD-712/ })).toBe(3);
    expect(await Report.countDocuments({ reportId: /^RPT-ORD-712/ })).toBe(3);
  });
});
