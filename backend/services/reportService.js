import mongoose from 'mongoose';
import Report from '../models/Report.js';
import TestOrder from '../models/TestOrder.js';

function invalidRequest(message) {
  return Object.assign(new Error(message), { status: 400 });
}

function paginationFromQuery(query) {
  const page = Number(query.page ?? 1);
  const limit = Number(query.limit ?? 20);
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 50) {
    throw invalidRequest('Page must be positive and limit must be between 1 and 50');
  }
  return { page, limit };
}

export function isPdfAvailable(report) {
  return report.reportStatus === 'Ready' && Boolean(report.signedAt && report.pdfStorageKey);
}

export async function findReportByIdentifier(identifier, filter = {}) {
  if (typeof identifier !== 'string' || identifier.length > 110 || !/^[A-Za-z0-9._-]+$/.test(identifier)) {
    throw invalidRequest('A valid report ID is required');
  }

  const alternatives = [{ reportId: identifier }];
  if (mongoose.isValidObjectId(identifier)) alternatives.push({ _id: identifier });
  const report = await Report.findOne({ ...filter, $or: alternatives }).select('+pdfStorageKey');
  if (report && filter.patientId) {
    const matchingOrder = await TestOrder.exists({ _id: report.orderId, patientId: filter.patientId });
    if (!matchingOrder) return null;
  }
  return report;
}

export async function getPatientOrders(patientId, query) {
  const { page, limit } = paginationFromQuery(query);
  const sortDirection = query.sort === 'oldest' ? 1 : query.sort === undefined || query.sort === 'newest' ? -1 : null;
  if (sortDirection === null) throw invalidRequest('Sort must be newest or oldest');

  const filter = { patientId };
  const [total, orders] = await Promise.all([
    TestOrder.countDocuments(filter),
    TestOrder.find(filter)
      .select('orderId orderDate tests.testName laboratoryId status')
      .sort({ orderDate: sortDirection, _id: sortDirection })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean()
  ]);
  const reportRecords = await Report.find({ patientId, orderId: { $in: orders.map(({ _id }) => _id) } })
    .select('reportId orderId reportStatus signedAt +pdfStorageKey')
    .lean();
  const reportsByOrder = new Map(reportRecords.map((report) => [String(report.orderId), report]));

  return {
    orders: orders.map((order) => {
      const report = reportsByOrder.get(String(order._id));
      const reportAvailable = report ? isPdfAvailable(report) : false;
      return {
        orderId: order.orderId,
        orderDate: order.orderDate,
        testNames: order.tests.map(({ testName }) => testName),
        laboratory: order.laboratoryId,
        status: order.status,
        reportAvailable,
        reportId: reportAvailable ? report.reportId : null
      };
    }),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) }
  };
}

export async function getPatientReports(patientId, query) {
  const { page, limit } = paginationFromQuery(query);
  const filter = { patientId };
  const [total, reports, readyReports, processingReports] = await Promise.all([
    Report.countDocuments(filter),
    Report.find(filter)
      .select('reportId orderId parameters reportStatus signedAt +pdfStorageKey')
      .populate({ path: 'orderId', select: 'orderId orderDate' })
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Report.countDocuments({ ...filter, reportStatus: 'Ready', signedAt: { $ne: null }, pdfStorageKey: { $ne: null } }),
    Report.countDocuments({ ...filter, reportStatus: 'Processing' })
  ]);

  return {
    reports: reports.map((report) => ({
      reportId: report.reportId,
      orderId: report.orderId?.orderId ?? null,
      reportStatus: report.reportStatus,
      signedAt: report.signedAt,
      testNames: report.parameters.map(({ parameterName }) => parameterName),
      pdfAvailable: isPdfAvailable(report)
    })),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    summary: { readyReports, processingReports }
  };
}

export async function getReportDetails(identifier, filter = {}) {
  const report = await findReportByIdentifier(identifier, filter);
  if (!report) return null;
  const order = await TestOrder.findById(report.orderId).select('orderId orderDate tests.testName patientId').lean();
  if (filter.patientId && (!order || String(order.patientId) !== String(filter.patientId))) return null;
  return {
    reportId: report.reportId,
    orderId: order?.orderId ?? null,
    tests: report.parameters.map((parameter) => ({
      testName: parameter.parameterName,
      result: parameter.result,
      unit: parameter.unit,
      referenceMin: parameter.referenceMin,
      referenceMax: parameter.referenceMax
    })),
    reportStatus: report.reportStatus,
    signedAt: report.signedAt,
    pdfAvailable: isPdfAvailable(report)
  };
}

export async function listStaffReports(query) {
  const { page, limit } = paginationFromQuery(query);
  if (query.search !== undefined && typeof query.search !== 'string') {
    throw invalidRequest('Search must be a text value');
  }
  const search = query.search?.trim() ?? '';
  if (search.length > 100) throw invalidRequest('Search must be at most 100 characters');
  const filter = search ? { reportId: { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } } : {};
  const [total, reports] = await Promise.all([
    Report.countDocuments(filter),
    Report.find(filter)
      .select('reportId orderId patientId reportStatus signedAt pdfMetadata +pdfStorageKey')
      .populate({ path: 'patientId', select: 'patientId fullName' })
      .populate({ path: 'orderId', select: 'orderId orderDate tests.testName' })
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean()
  ]);

  return {
    reports: reports.map((report) => ({
      reportId: report.reportId,
      patient: report.patientId ? { patientId: report.patientId.patientId, name: report.patientId.fullName } : null,
      orderId: report.orderId?.orderId ?? null,
      orderDate: report.orderId?.orderDate ?? null,
      testNames: report.orderId?.tests.map(({ testName }) => testName) ?? [],
      reportStatus: report.reportStatus,
      pdfUploaded: Boolean(report.pdfStorageKey),
      pdfAvailable: isPdfAvailable(report),
      signedAt: report.signedAt
    })),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) }
  };
}
