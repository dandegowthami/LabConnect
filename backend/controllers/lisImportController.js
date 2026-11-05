import { createHash } from 'node:crypto';
import path from 'node:path';
import mongoose from 'mongoose';
import Doctor from '../models/Doctor.js';
import ImportHistory from '../models/ImportHistory.js';
import LISImportBatch from '../models/LISImportBatch.js';
import Patient from '../models/Patient.js';
import Report from '../models/Report.js';
import TestOrder from '../models/TestOrder.js';
import { parseLisCsv, validateLisRows } from '../services/lisImportService.js';

const PREVIEW_TTL_MS = 30 * 60 * 1000;

function safeFileName(fileName) {
  return path.basename(fileName.replaceAll('\\', '/')).slice(0, 255) || 'upload.csv';
}

function doctorIdFor(name) {
  const hash = createHash('sha256').update(name.trim().toLowerCase()).digest('hex').slice(0, 24);
  return `LIS-DOC-${hash}`;
}

function samePatient(patient, identity) {
  return patient.fullName === identity.fullName && patient.mobile === identity.mobile;
}

async function findOrCreatePatient(identity) {
  let patient = await Patient.findOne({ patientId: identity.patientId });
  if (patient) {
    if (!samePatient(patient, identity)) throw new Error('patientId now exists with different identity details');
    return { record: patient, created: false };
  }

  try {
    patient = await Patient.create(identity);
    return { record: patient, created: true };
  } catch (error) {
    if (error.code !== 11000) throw error;
    patient = await Patient.findOne({ patientId: identity.patientId });
  }
  if (!patient || !samePatient(patient, identity)) throw new Error('patientId now exists with different identity details');
  return { record: patient, created: false };
}

async function findOrCreateDoctor(name) {
  const doctorId = doctorIdFor(name);
  const existing = await Doctor.findOne({ doctorId });
  if (existing) return { record: existing, created: false };
  try {
    return { record: await Doctor.create({ doctorId, name }), created: true };
  } catch (error) {
    if (error.code !== 11000) throw error;
    const doctor = await Doctor.findOne({ doctorId });
    if (!doctor) throw error;
    return { record: doctor, created: false };
  }
}

function addOrderFailure(errors, order, message) {
  for (const row of order.rows) errors.push({ row, orderId: order.orderId, message });
}

async function cleanupNewIdentities({ patient, patientCreated, doctor, doctorCreated }) {
  if (patientCreated && !(await TestOrder.exists({ patientId: patient._id }))) {
    await Patient.deleteOne({ _id: patient._id });
  }
  if (doctorCreated && !(await TestOrder.exists({ referringDoctorId: doctor._id }))) {
    await Doctor.deleteOne({ _id: doctor._id });
  }
}

async function importOrder(order) {
  const existingOrder = await TestOrder.exists({ orderId: order.orderId });
  if (existingOrder) return 'skipped';

  const { record: patient, created: patientCreated } = await findOrCreatePatient(order.patient);
  const { record: doctor, created: doctorCreated } = await findOrCreateDoctor(order.doctorName);
  let testOrder;
  try {
    testOrder = await TestOrder.create({
      orderId: order.orderId,
      patientId: patient._id,
      referringDoctorId: doctor._id,
      laboratoryId: 'LIS',
      tests: order.tests.map((test) => ({ ...test, resultStatus: 'Not evaluated' })),
      status: order.status
    });
  } catch (error) {
    await cleanupNewIdentities({ patient, patientCreated, doctor, doctorCreated });
    if (error.code === 11000) return 'skipped';
    throw error;
  }

  try {
    await Report.create({
      reportId: `RPT-${order.orderId}`,
      orderId: testOrder._id,
      patientId: patient._id,
      parameters: order.tests.map((test) => ({
        parameterName: test.testName,
        result: test.result,
        unit: test.unit,
        referenceMin: test.referenceMin,
        referenceMax: test.referenceMax
      })),
      reportStatus: order.status,
      signedAt: null
    });
  } catch (error) {
    await TestOrder.deleteOne({ _id: testOrder._id });
    await cleanupNewIdentities({ patient, patientCreated, doctor, doctorCreated });
    throw error;
  }
  return 'imported';
}

export async function previewLisImport(req, res, next) {
  try {
    if (!req.file) {
      res.status(400).json({ success: false, message: 'A CSV file is required' });
      return;
    }

    const records = parseLisCsv(req.file.buffer);
    const validated = await validateLisRows(records);
    const fileName = safeFileName(req.file.originalname);
    const batch = await LISImportBatch.create({
      fileName,
      importedBy: req.auth.sub,
      totalRows: records.length,
      orders: validated.orders,
      errors: validated.errors,
      skippedRows: validated.skippedRows,
      expiresAt: new Date(Date.now() + PREVIEW_TTL_MS)
    });

    res.status(200).json({
      success: true,
      message: 'CSV preview validated',
      data: {
        previewId: batch.id,
        fileName,
        totalRows: records.length,
        validRecords: validated.validRowCount,
        validOrders: validated.orders.length,
        invalidRecords: validated.invalidRowCount,
        invalidOrders: validated.invalidOrderCount,
        duplicateRecords: validated.skippedRows.length,
        duplicateOrders: validated.duplicateOrderCount,
        groupedOrders: validated.orders,
        rowErrors: validated.errors,
        skippedRows: validated.skippedRows.length,
        expiresAt: batch.expiresAt
      }
    });
  } catch (error) {
    next(error);
  }
}

export async function commitLisImport(req, res, next) {
  try {
    const { previewId } = req.body ?? {};
    if (!mongoose.isValidObjectId(previewId)) {
      res.status(400).json({ success: false, message: 'A valid previewId is required' });
      return;
    }

    const batch = await LISImportBatch.findOneAndUpdate(
      {
        _id: previewId,
        importedBy: req.auth.sub,
        status: 'previewed',
        expiresAt: { $gt: new Date() }
      },
      { $set: { status: 'committing' } },
      { new: true }
    ).lean();

    if (!batch) {
      res.status(409).json({ success: false, message: 'Preview is unavailable, expired, already committed, or belongs to another staff account' });
      return;
    }
    let importedRows = 0;
    let skippedRows = batch.skippedRows.length;
    const errors = [...batch.errors];
    for (const order of batch.orders) {
      try {
        const result = await importOrder(order);
        if (result === 'imported') importedRows += order.rows.length;
        else skippedRows += order.rows.length;
      } catch (error) {
        console.error(`LIS import failed for order ${order.orderId}`, error);
        addOrderFailure(errors, order, 'The order could not be saved; no report was created');
      }
    }

    const failedRows = new Set(errors.map(({ row }) => row)).size;
    const status = failedRows === 0 && skippedRows === 0
      ? 'completed'
      : importedRows === 0 && failedRows > 0
        ? 'failed'
        : 'partial';
    const history = await ImportHistory.create({
      fileName: batch.fileName,
      totalRows: batch.totalRows,
      importedRows,
      skippedRows,
      failedRows,
      importedBy: req.auth.sub,
      status,
      errors
    });
    await LISImportBatch.updateOne({ _id: batch._id, status: 'committing' }, { $set: { status: 'committed' } });

    res.status(200).json({
      success: true,
      message: 'LIS import finished',
      data: {
        importId: history.id,
        totalRows: history.totalRows,
        importedRows: history.importedRows,
        skippedRows: history.skippedRows,
        failedRows: history.failedRows,
        status: history.status,
        errors: history.errors
      }
    });
  } catch (error) {
    next(error);
  }
}

export async function getImportHistory(req, res, next) {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 10));
    const [history, total] = await Promise.all([
      ImportHistory.find()
        .sort({ importedAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('importedBy', 'name email')
        .select('fileName totalRows importedRows skippedRows failedRows importedBy status importedAt')
        .lean(),
      ImportHistory.countDocuments()
    ]);

    res.status(200).json({
      success: true,
      data: {
        imports: history.map((entry) => ({
          id: String(entry._id),
          fileName: entry.fileName,
          totalRows: entry.totalRows,
          importedRows: entry.importedRows,
          skippedRows: entry.skippedRows,
          failedRows: entry.failedRows,
          importedBy: entry.importedBy ? { name: entry.importedBy.name, email: entry.importedBy.email } : null,
          status: entry.status,
          importedAt: entry.importedAt
        })),
        pagination: { page, limit, total, pages: Math.ceil(total / limit) }
      }
    });
  } catch (error) {
    next(error);
  }
}

export async function getImportDetails(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      res.status(400).json({ success: false, message: 'Invalid import ID' });
      return;
    }
    const entry = await ImportHistory.findById(req.params.id)
      .populate('importedBy', 'name email')
      .select('-__v')
      .lean();
    if (!entry) {
      res.status(404).json({ success: false, message: 'Import was not found' });
      return;
    }
    res.status(200).json({
      success: true,
      data: {
        id: String(entry._id),
        fileName: entry.fileName,
        totalRows: entry.totalRows,
        importedRows: entry.importedRows,
        skippedRows: entry.skippedRows,
        failedRows: entry.failedRows,
        importedBy: entry.importedBy ? { name: entry.importedBy.name, email: entry.importedBy.email } : null,
        status: entry.status,
        importedAt: entry.importedAt,
        errors: entry.errors
      }
    });
  } catch (error) {
    next(error);
  }
}
