import { parse } from 'csv-parse/sync';
import Patient from '../models/Patient.js';
import TestOrder from '../models/TestOrder.js';

export const LIS_CSV_HEADERS = [
  'orderId',
  'patientId',
  'patientName',
  'mobile',
  'doctorName',
  'testName',
  'result',
  'unit',
  'referenceMin',
  'referenceMax',
  'status'
];

const ORDER_STATUSES = new Set(['Processing', 'Ready', 'Cancelled']);
const MOBILE_PATTERN = /^[6-9]\d{9}$/;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9._-]{1,100}$/;

export function parseLisCsv(buffer) {
  let rows;
  try {
    rows = parse(buffer, {
      bom: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
      max_record_size: 8192
    });
  } catch (error) {
    throw Object.assign(new Error(`Unable to parse CSV: ${error.message}`), { status: 400 });
  }

  if (!rows.length || !rows[0].length || rows[0].every((cell) => !String(cell).trim())) {
    throw Object.assign(new Error('The CSV file is empty'), { status: 400 });
  }

  const headers = rows.shift().map((header) => String(header).trim());
  const missingHeaders = LIS_CSV_HEADERS.filter((header) => !headers.includes(header));
  const duplicateHeaders = headers.filter((header, index) => headers.indexOf(header) !== index);
  if (missingHeaders.length || duplicateHeaders.length) {
    const details = [
      ...(missingHeaders.length ? [`Missing headers: ${missingHeaders.join(', ')}`] : []),
      ...(duplicateHeaders.length ? [`Duplicate headers: ${[...new Set(duplicateHeaders)].join(', ')}`] : [])
    ];
    throw Object.assign(new Error(details.join('. ')), { status: 400 });
  }
  if (headers.some((header) => !LIS_CSV_HEADERS.includes(header))) {
    throw Object.assign(new Error('The CSV contains unsupported columns'), { status: 400 });
  }
  if (!rows.length) {
    throw Object.assign(new Error('The CSV contains headers but no data rows'), { status: 400 });
  }
  if (rows.length > 5000) {
    throw Object.assign(new Error('CSV files may contain at most 5,000 data rows'), { status: 400 });
  }

  return rows.map((cells, index) => {
    if (cells.length !== headers.length) {
      return { row: index + 2, fields: null, parseError: 'The row has a different number of values than the header' };
    }
    return {
      row: index + 2,
      fields: Object.fromEntries(headers.map((header, column) => [header, String(cells[column] ?? '').trim()]))
    };
  });
}

function parseNumber(value) {
  if (value === '' || !Number.isFinite(Number(value))) return null;
  return Number(value);
}

export async function validateLisRows(rows) {
  const groups = new Map();
  const errors = [];
  const orderIds = [];

  for (const source of rows) {
    if (source.parseError) {
      errors.push({ row: source.row, orderId: '', message: source.parseError });
      continue;
    }

    const fields = source.fields;
    const orderId = fields.orderId;
    const rowErrors = [];
    for (const name of LIS_CSV_HEADERS) {
      if (!fields[name]) rowErrors.push(`${name} is required`);
    }
    if (orderId && !IDENTIFIER_PATTERN.test(orderId)) rowErrors.push('orderId must contain only letters, numbers, dots, underscores or hyphens');
    if (fields.patientId && !IDENTIFIER_PATTERN.test(fields.patientId)) rowErrors.push('patientId must contain only letters, numbers, dots, underscores or hyphens');
    if (fields.mobile && !MOBILE_PATTERN.test(fields.mobile)) rowErrors.push('mobile must be a valid 10-digit Indian mobile number');
    if (fields.patientName.length > 120 || fields.doctorName.length > 120 || fields.testName.length > 120) {
      rowErrors.push('Names and test names must be at most 120 characters');
    }
    if (fields.unit.length > 40) rowErrors.push('unit must be at most 40 characters');
    const result = parseNumber(fields.result);
    const referenceMin = parseNumber(fields.referenceMin);
    const referenceMax = parseNumber(fields.referenceMax);
    if (result === null) rowErrors.push('result must be a number');
    if (referenceMin === null || referenceMax === null) rowErrors.push('referenceMin and referenceMax must be numbers');
    else if (referenceMin > referenceMax) rowErrors.push('referenceMin must not exceed referenceMax');
    if (fields.status && !ORDER_STATUSES.has(fields.status)) rowErrors.push('status must be Processing, Ready or Cancelled');

    if (!orderId) {
      for (const message of rowErrors) errors.push({ row: source.row, orderId: '', message });
      continue;
    }

    let group = groups.get(orderId);
    if (!group) {
      group = {
        orderId,
        patient: { patientId: fields.patientId, fullName: fields.patientName, mobile: fields.mobile },
        doctorName: fields.doctorName,
        tests: [],
        rows: [],
        errors: []
      };
      groups.set(orderId, group);
      orderIds.push(orderId);
    }
    group.rows.push(source.row);
    for (const message of rowErrors) group.errors.push({ row: source.row, orderId, message });

    if (group.patient.patientId !== fields.patientId
      || group.patient.fullName !== fields.patientName
      || group.patient.mobile !== fields.mobile) {
      group.errors.push({ row: source.row, orderId, message: 'All rows for an order must contain the same patient ID, name and mobile' });
    }
    if (group.doctorName !== fields.doctorName) {
      group.errors.push({ row: source.row, orderId, message: 'All rows for an order must contain the same doctor name' });
    }
    if (group.status && group.status !== fields.status) {
      group.errors.push({ row: source.row, orderId, message: 'All rows for an order must contain the same status' });
    } else {
      group.status = fields.status;
    }
    if (fields.testName && group.tests.some((test) => test.testName.toLowerCase() === fields.testName.toLowerCase())) {
      group.errors.push({ row: source.row, orderId, message: 'A test name may appear only once per order' });
    } else if (result !== null && referenceMin !== null && referenceMax !== null) {
      group.tests.push({
        testName: fields.testName,
        result,
        unit: fields.unit,
        referenceMin,
        referenceMax
      });
    }
  }

  const patientIds = [...new Set([...groups.values()].map(({ patient }) => patient.patientId).filter(Boolean))];
  const existingPatients = await Patient.find({ patientId: { $in: patientIds } }).select('patientId fullName mobile').lean();
  const patientsById = new Map(existingPatients.map((patient) => [patient.patientId, patient]));
  const existingOrders = await TestOrder.find({ orderId: { $in: orderIds } }).select('orderId').lean();
  const existingOrderIds = new Set(existingOrders.map((order) => order.orderId));
  const patientGroups = new Map();

  for (const group of groups.values()) {
    if (group.patient.patientId) {
      const relatedGroups = patientGroups.get(group.patient.patientId) ?? [];
      relatedGroups.push(group);
      patientGroups.set(group.patient.patientId, relatedGroups);
      const existing = patientsById.get(group.patient.patientId);
      if (existing && (existing.fullName !== group.patient.fullName || existing.mobile !== group.patient.mobile)) {
        group.errors.push({
          row: group.rows[0],
          orderId: group.orderId,
          message: 'patientId already exists with different name or mobile; existing patient details were not changed'
        });
      }
    }
  }

  for (const [patientId, relatedGroups] of patientGroups) {
    const identities = new Set(relatedGroups.map(({ patient }) => `${patient.fullName}\u0000${patient.mobile}`));
    if (identities.size > 1) {
      for (const group of relatedGroups) {
        group.errors.push({
          row: group.rows[0],
          orderId: group.orderId,
          message: `patientId ${patientId} has conflicting identity details within this file`
        });
      }
    }
  }

  const orders = [];
  const skippedRows = [];
  for (const group of groups.values()) {
    if (group.errors.length) {
      errors.push(...group.errors);
    } else if (existingOrderIds.has(group.orderId)) {
      skippedRows.push(...group.rows);
    } else {
      orders.push({
        orderId: group.orderId,
        patient: group.patient,
        doctorName: group.doctorName,
        tests: group.tests,
        status: group.status,
        rows: group.rows
      });
    }
  }

  return {
    orders,
    errors,
    skippedRows,
    validRowCount: orders.reduce((count, order) => count + order.rows.length, 0),
    invalidRowCount: new Set(errors.map(({ row }) => row)).size,
    invalidOrderCount: [...groups.values()].filter((group) => group.errors.length).length,
    duplicateOrderCount: [...groups.values()].filter((group) => !group.errors.length && existingOrderIds.has(group.orderId)).length
  };
}
