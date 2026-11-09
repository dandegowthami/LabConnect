import { createHash, randomBytes } from 'node:crypto';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import AIExplanation from '../models/AIExplanation.js';
import CallbackTask from '../models/CallbackTask.js';
import CriticalThresholdRule from '../models/CriticalThresholdRule.js';
import DeliveryLog from '../models/DeliveryLog.js';
import Doctor from '../models/Doctor.js';
import Patient from '../models/Patient.js';
import PatientAuditEvent from '../models/PatientAuditEvent.js';
import PatientPortalActivation from '../models/PatientPortalActivation.js';
import Report from '../models/Report.js';
import ReportAuditEvent from '../models/ReportAuditEvent.js';
import TestOrder from '../models/TestOrder.js';
import User from '../models/User.js';
import { refreshCriticalReviewStatus } from '../services/criticalReviewService.js';
import { findReportByIdentifier } from '../services/reportService.js';

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20)
});
const statusValues = ['Pending', 'In Progress', 'Resolved'];
const callbackUpdateSchema = z.object({
  status: z.enum(statusValues).optional(),
  assignedTo: z.string().regex(/^[a-f\d]{24}$/i).nullable().optional(),
  resolutionNotes: z.string().trim().max(2000).optional()
}).strict();
const criticalRuleSchema = z.object({
  parameterName: z.string().trim().min(1).max(120),
  unit: z.string().trim().min(1).max(40),
  criticalLow: z.number().finite().nullable().optional(),
  criticalHigh: z.number().finite().nullable().optional()
}).strict().refine(
  (rule) => rule.criticalLow !== undefined && rule.criticalLow !== null
    || rule.criticalHigh !== undefined && rule.criticalHigh !== null,
  'At least one critical threshold is required'
).refine(
  (rule) => rule.criticalLow == null || rule.criticalHigh == null || rule.criticalLow < rule.criticalHigh,
  'The low threshold must be less than the high threshold'
);
const consentSchema = z.object({
  consentStatus: z.enum(['granted', 'withdrawn']),
  consentConfirmed: z.literal(true)
}).strict();
const patientPortalActivationSchema = z.object({
  identityVerified: z.literal(true)
}).strict();
const PATIENT_PORTAL_ACTIVATION_TTL_MS = 24 * 60 * 60 * 1000;

function sendInvalid(res, message) {
  res.status(400).json({ success: false, message });
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function maskedMobile(mobile) {
  return mobile ? `${mobile.slice(0, 2)}******${mobile.slice(-2)}` : null;
}

function parsePage(query) {
  const parsed = paginationSchema.safeParse(query);
  return parsed.success ? parsed.data : null;
}

export async function getStaffDashboard(req, res, next) {
  try {
    const [
      totalPatients,
      totalOrders,
      processingReports,
      readyReports,
      deliveredReports,
      failedNotifications,
      criticalCallbacks,
      flaggedSummaries
    ] = await Promise.all([
      Patient.countDocuments(),
      TestOrder.countDocuments(),
      Report.countDocuments({ reportStatus: 'Processing' }),
      Report.countDocuments({ reportStatus: 'Ready' }),
      DeliveryLog.distinct('reportId', { status: 'Sent' }).then((ids) => ids.length),
      DeliveryLog.countDocuments({ status: 'Failed' }),
      CallbackTask.countDocuments({ severity: 'Critical', status: { $ne: 'Resolved' } }),
      AIExplanation.countDocuments({ flaggedByPatient: true })
    ]);
    res.status(200).json({
      success: true,
      data: {
        totalPatients,
        totalOrders,
        processingReports,
        readyReports,
        deliveredReports,
        failedNotifications,
        criticalCallbackTasks: criticalCallbacks,
        patientFlaggedSummaries: flaggedSummaries
      }
    });
  } catch (error) {
    next(error);
  }
}

export async function listStaffAssignees(req, res, next) {
  try {
    const users = await User.find({
      isActive: true,
      role: { $in: ['staff', 'admin', 'pathologist'] }
    }).select('name email role').sort({ name: 1 }).lean();
    res.status(200).json({
      success: true,
      data: {
        users: users.map((user) => ({
          id: String(user._id),
          name: user.name,
          email: user.email,
          role: user.role
        }))
      }
    });
  } catch (error) {
    next(error);
  }
}

export async function listReferringDoctors(req, res, next) {
  try {
    const doctors = await Doctor.find().select('doctorId name email').sort({ name: 1 }).limit(200).lean();
    res.status(200).json({ success: true, data: { doctors } });
  } catch (error) {
    next(error);
  }
}

export async function searchStaffPatients(req, res, next) {
  try {
    const pagination = parsePage(req.query);
    const search = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (!pagination || search.length > 100) {
      sendInvalid(res, 'Provide a search value up to 100 characters and valid pagination');
      return;
    }

    const filter = {};
    if (search) {
      const regex = new RegExp(escapeRegex(search), 'i');
      const order = await TestOrder.findOne({ orderId: search }).select('patientId').lean();
      filter.$or = [
        { patientId: search },
        { fullName: regex },
        { mobile: search },
        ...(order ? [{ _id: order.patientId }] : [])
      ];
    }
    const [total, patients] = await Promise.all([
      Patient.countDocuments(filter),
      Patient.find(filter)
        .select('patientId fullName mobile consentStatus')
        .sort({ fullName: 1, _id: 1 })
        .skip((pagination.page - 1) * pagination.limit)
        .limit(pagination.limit)
        .lean()
    ]);
    const patientIds = patients.map(({ _id }) => _id);
    const orders = patientIds.length
      ? await TestOrder.find({ patientId: { $in: patientIds } })
        .select('orderId patientId orderDate status')
        .sort({ orderDate: -1 })
        .lean()
      : [];
    const reports = patientIds.length
      ? await Report.find({ patientId: { $in: patientIds } }).select('reportId patientId reportStatus criticalReviewStatus').lean()
      : [];
    const ordersByPatient = new Map();
    for (const order of orders) {
      const key = String(order.patientId);
      const list = ordersByPatient.get(key) || [];
      if (list.length < 5) list.push(order);
      ordersByPatient.set(key, list);
    }
    const reportsByPatient = new Map();
    for (const report of reports) {
      const key = String(report.patientId);
      const list = reportsByPatient.get(key) || [];
      list.push(report);
      reportsByPatient.set(key, list);
    }
    res.status(200).json({
      success: true,
      data: {
        patients: patients.map((patient) => ({
          patientId: patient.patientId,
          name: patient.fullName,
          mobileMasked: maskedMobile(patient.mobile),
          consentStatus: patient.consentStatus,
          orders: (ordersByPatient.get(String(patient._id)) || []).map((order) => ({
            orderId: order.orderId,
            orderDate: order.orderDate,
            status: order.status
          })),
          reports: (reportsByPatient.get(String(patient._id)) || []).map((report) => ({
            reportId: report.reportId,
            status: report.reportStatus,
            criticalReviewStatus: report.criticalReviewStatus
          }))
        })),
        pagination: { ...pagination, total, pages: Math.ceil(total / pagination.limit) }
      }
    });
  } catch (error) {
    next(error);
  }
}

export async function getStaffPatient(req, res, next) {
  try {
    const patient = await Patient.findOne({
      $or: [
        { patientId: req.params.patientId },
        ...(mongoose.isValidObjectId(req.params.patientId) ? [{ _id: req.params.patientId }] : [])
      ]
    }).select('patientId fullName mobile consentStatus portalActivatedAt').lean();
    if (!patient) {
      res.status(404).json({ success: false, message: 'Patient not found' });
      return;
    }
    const orders = await TestOrder.find({ patientId: patient._id })
      .select('orderId orderDate status referringDoctorId')
      .populate({ path: 'referringDoctorId', select: 'doctorId name' })
      .sort({ orderDate: -1 }).limit(50).lean();
    const reports = await Report.find({ patientId: patient._id })
      .select('reportId orderId reportStatus signedAt criticalReviewStatus')
      .populate({ path: 'orderId', select: 'orderId' })
      .sort({ createdAt: -1 }).lean();
    const orderNames = new Map(orders.map((order) => [String(order._id), order.orderId]));
    res.status(200).json({
      success: true,
      data: {
        patient: {
          patientId: patient.patientId,
          name: patient.fullName,
          mobileMasked: maskedMobile(patient.mobile),
          consentStatus: patient.consentStatus,
          portalActivated: Boolean(patient.portalActivatedAt)
        },
        orders: orders.map((order) => ({
          orderId: order.orderId,
          orderDate: order.orderDate,
          status: order.status,
          referringDoctor: order.referringDoctorId?.name ?? null
        })),
        reports: reports.map((report) => ({
          reportId: report.reportId,
          orderId: report.orderId?.orderId ?? orderNames.get(String(report.orderId)) ?? 'Unavailable',
          status: report.reportStatus,
          signedAt: report.signedAt,
          criticalReviewStatus: report.criticalReviewStatus
        }))
      }
    });
  } catch (error) {
    next(error);
  }
}

export async function issuePatientPortalActivation(req, res, next) {
  try {
    const parsed = patientPortalActivationSchema.safeParse(req.body);
    if (!parsed.success) {
      sendInvalid(res, 'Confirm that the patient identity was verified in person before issuing an activation code');
      return;
    }

    const patient = await Patient.findOne({
      $or: [
        { patientId: req.params.patientId },
        ...(mongoose.isValidObjectId(req.params.patientId) ? [{ _id: req.params.patientId }] : [])
      ]
    }).select('patientId portalActivatedAt').lean();
    if (!patient) {
      res.status(404).json({ success: false, message: 'Patient not found' });
      return;
    }
    if (patient.portalActivatedAt) {
      res.status(409).json({ success: false, message: 'This patient already has an activated portal account' });
      return;
    }

    const activationCode = randomBytes(32).toString('base64url');
    const now = new Date();
    await PatientPortalActivation.findOneAndUpdate(
      { patientId: patient._id },
      {
        $set: {
          codeHash: createHash('sha256').update(activationCode).digest('hex'),
          expiresAt: new Date(now.getTime() + PATIENT_PORTAL_ACTIVATION_TTL_MS),
          attempts: 0,
          consumedAt: null,
          revokedAt: null,
          issuedBy: req.auth.sub
        }
      },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
    );
    await PatientAuditEvent.create({
      patientId: patient._id,
      action: 'portal-activation-issued',
      actorId: String(req.auth.sub)
    });

    res.status(201).json({
      success: true,
      message: 'Give this one-time code directly to the identity-verified patient. It expires in 24 hours.',
      data: { activationCode, expiresAt: new Date(now.getTime() + PATIENT_PORTAL_ACTIVATION_TTL_MS) }
    });
  } catch (error) {
    next(error);
  }
}

export async function getStaffReportWorkspace(req, res, next) {
  try {
    const report = await findReportByIdentifier(req.params.reportId);
    if (!report) {
      res.status(404).json({ success: false, message: 'Report not found' });
      return;
    }
    const [patient, order, deliveryLogs, deliveryAttempts, accessEvents] = await Promise.all([
      Patient.findById(report.patientId).select('patientId fullName mobile consentStatus').lean(),
      TestOrder.findById(report.orderId).select('orderId orderDate status referringDoctorId')
        .populate({ path: 'referringDoctorId', select: 'doctorId name' }).lean(),
      DeliveryLog.find({ reportId: report._id }).select('channel destinationMasked status sentAt failureReason createdAt')
        .sort({ createdAt: -1 }).limit(50).lean(),
      DeliveryLog.countDocuments({ reportId: report._id }),
      ReportAuditEvent.find({
        report: report._id,
        action: { $in: ['pdf-viewed', 'pdf-downloaded', 'delivery-pdf-viewed', 'delivery-pdf-downloaded', 'doctor-pdf-viewed', 'doctor-pdf-downloaded'] }
      }).select('action createdAt').sort({ createdAt: -1 }).limit(100).lean()
    ]);
    res.status(200).json({
      success: true,
      data: {
        report: {
          reportId: report.reportId,
          status: report.reportStatus,
          criticalReviewStatus: report.criticalReviewStatus,
          signedAt: report.signedAt,
          pdfAttached: Boolean(report.pdfMetadata),
          patient: patient ? {
            patientId: patient.patientId,
            name: patient.fullName,
            mobileMasked: maskedMobile(patient.mobile),
            consentStatus: patient.consentStatus
          } : null,
          order: order ? {
            orderId: order.orderId,
            orderDate: order.orderDate,
            status: order.status,
            referringDoctor: order.referringDoctorId?.name ?? null
          } : null
        },
        deliveryHistory: deliveryLogs,
        deliveryAttempts,
        accessHistory: accessEvents
      }
    });
  } catch (error) {
    next(error);
  }
}

export async function listCallbackTasks(req, res, next) {
  try {
    const pagination = parsePage(req.query);
    if (!pagination) {
      sendInvalid(res, 'Page must be positive and limit must be between 1 and 50');
      return;
    }
    const filter = {};
    if (req.query.status && statusValues.includes(req.query.status)) filter.status = req.query.status;
    else if (req.query.status) {
      sendInvalid(res, 'Status must be Pending, In Progress or Resolved');
      return;
    }
    if (req.query.severity && !['Critical', 'Patient flagged summary'].includes(req.query.severity)) {
      sendInvalid(res, 'Severity is invalid');
      return;
    }
    if (req.query.severity) filter.severity = req.query.severity;
    if (req.query.flagged === 'true') filter.severity = 'Patient flagged summary';

    const [total, tasks] = await Promise.all([
      CallbackTask.countDocuments(filter),
      CallbackTask.find(filter)
        .populate({ path: 'reportId', select: 'reportId reportStatus criticalReviewStatus' })
        .populate({ path: 'patientId', select: 'patientId fullName mobile' })
        .populate({ path: 'assignedTo', select: 'name email role' })
        .sort({ createdAt: -1 })
        .skip((pagination.page - 1) * pagination.limit)
        .limit(pagination.limit)
        .lean()
    ]);
    const flaggedSummaryReportIds = tasks
      .filter(({ severity }) => severity === 'Patient flagged summary')
      .map(({ reportId }) => reportId?._id).filter(Boolean);
    const flags = flaggedSummaryReportIds.length
      ? await AIExplanation.find({ reportId: { $in: flaggedSummaryReportIds }, flaggedByPatient: true })
        .select('reportId language flagReason generatedAt status').lean()
      : [];
    const flagByReportLanguage = new Map(flags.map((flag) => [`${flag.reportId}:${flag.language}`, flag]));

    res.status(200).json({
      success: true,
      data: {
        tasks: tasks.map((task) => {
          const language = task.parameterName.match(/\((en|te|hi)\)$/)?.[1];
          const flag = language && task.reportId
            ? flagByReportLanguage.get(`${task.reportId._id}:${language}`)
            : null;
          return {
            id: String(task._id),
            reportId: task.reportId?.reportId ?? null,
            patient: task.patientId ? {
              patientId: task.patientId.patientId,
              name: task.patientId.fullName,
              mobileMasked: maskedMobile(task.patientId.mobile)
            } : null,
            parameterName: task.parameterName,
            severity: task.severity,
            assignedTo: task.assignedTo ? {
              id: String(task.assignedTo._id),
              name: task.assignedTo.name,
              email: task.assignedTo.email,
              role: task.assignedTo.role
            } : null,
            status: task.status,
            resolutionNotes: task.resolutionNotes,
            createdAt: task.createdAt,
            resolvedAt: task.resolvedAt,
            flagReason: flag?.flagReason ?? null,
            flaggedLanguage: flag?.language ?? null
          };
        }),
        pagination: { ...pagination, total, pages: Math.ceil(total / pagination.limit) }
      }
    });
  } catch (error) {
    next(error);
  }
}

export async function updateCallbackTask(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.taskId)) {
      sendInvalid(res, 'A valid callback task ID is required');
      return;
    }
    const parsed = callbackUpdateSchema.safeParse(req.body);
    if (!parsed.success || !Object.keys(parsed.data || {}).length) {
      sendInvalid(res, 'Provide a valid status, assignment or resolution note');
      return;
    }
    const task = await CallbackTask.findById(req.params.taskId);
    if (!task) {
      res.status(404).json({ success: false, message: 'Callback task not found' });
      return;
    }
    const { status, assignedTo, resolutionNotes } = parsed.data;
    if (status === 'Resolved' && !resolutionNotes?.trim()) {
      sendInvalid(res, 'Resolution notes are required before resolving a callback task');
      return;
    }
    if (assignedTo) {
      const assignee = await User.findOne({
        _id: assignedTo,
        isActive: true,
        role: { $in: ['staff', 'admin', 'pathologist'] }
      }).select('_id');
      if (!assignee) {
        sendInvalid(res, 'Assign the task to an active staff member or pathologist');
        return;
      }
    }
    if (assignedTo !== undefined) task.assignedTo = assignedTo;
    if (status) task.status = status;
    if (resolutionNotes !== undefined) task.resolutionNotes = resolutionNotes;
    if (status === 'Resolved') task.resolvedAt = new Date();
    else if (status) task.resolvedAt = null;
    await task.save();
    if (task.severity === 'Critical' && status === 'Resolved') {
      await ReportAuditEvent.create({
        action: 'critical-review-resolved',
        report: task.reportId,
        actorId: String(req.auth.sub)
      });
      await refreshCriticalReviewStatus(task.reportId);
    }
    res.status(200).json({ success: true, message: 'Callback task updated', data: { id: String(task._id), status: task.status } });
  } catch (error) {
    next(error);
  }
}

export async function listCriticalRules(req, res, next) {
  try {
    const rules = await CriticalThresholdRule.find()
      .populate({ path: 'proposedBy', select: 'name email role' })
      .populate({ path: 'approvedBy', select: 'name email role' })
      .sort({ createdAt: -1 }).limit(100).lean();
    res.status(200).json({ success: true, data: { rules } });
  } catch (error) {
    next(error);
  }
}

export async function proposeCriticalRule(req, res, next) {
  try {
    const parsed = criticalRuleSchema.safeParse(req.body);
    if (!parsed.success) {
      sendInvalid(res, 'Provide a parameter, unit and at least one valid critical threshold');
      return;
    }
    const rule = await CriticalThresholdRule.create({
      ...parsed.data,
      status: 'Pending approval',
      proposedBy: req.auth.sub
    });
    res.status(201).json({
      success: true,
      message: 'Rule saved as pending; it cannot classify results until approved by a pathologist',
      data: { id: String(rule._id), status: rule.status }
    });
  } catch (error) {
    next(error);
  }
}

export async function approveCriticalRule(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.ruleId)) {
      sendInvalid(res, 'A valid critical rule ID is required');
      return;
    }
    const approvalNote = z.string().trim().min(3).max(1000).safeParse(req.body?.approvalNote ?? '');
    if (!approvalNote.success) {
      sendInvalid(res, 'A pathologist approval note of 3 to 1000 characters is required');
      return;
    }
    let rule;
    try {
      rule = await CriticalThresholdRule.findOneAndUpdate(
        { _id: req.params.ruleId, status: 'Pending approval' },
        {
          $set: {
            status: 'Approved',
            approvedBy: req.auth.sub,
            approvedAt: new Date(),
            approvalNote: approvalNote.data
          }
        },
        { new: true, runValidators: true }
      );
    } catch (error) {
      if (error.code === 11000) {
        res.status(409).json({ success: false, message: 'An approved threshold already exists for this parameter and unit' });
        return;
      }
      throw error;
    }
    if (!rule) {
      res.status(404).json({ success: false, message: 'Pending critical rule not found' });
      return;
    }
    res.status(200).json({ success: true, message: 'Critical rule approved by pathologist', data: { id: String(rule._id), status: rule.status } });
  } catch (error) {
    next(error);
  }
}

export async function provisionDoctorAccount(req, res, next) {
  try {
    const parsed = z.object({
      doctorId: z.string().regex(/^[a-f\d]{24}$/i),
      email: z.string().email().transform((email) => email.trim().toLowerCase()),
      password: z.string().min(12).max(128)
    }).strict().safeParse(req.body);
    if (!parsed.success) {
      sendInvalid(res, 'Provide a linked doctor record, valid email and password of at least 12 characters');
      return;
    }
    const doctor = await Doctor.findById(parsed.data.doctorId).select('name').lean();
    if (!doctor) {
      res.status(404).json({ success: false, message: 'Referring doctor record not found' });
      return;
    }
    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    const user = await User.create({
      name: doctor.name,
      email: parsed.data.email,
      passwordHash,
      role: 'doctor',
      doctorId: parsed.data.doctorId,
      isActive: true
    });
    res.status(201).json({
      success: true,
      message: 'Doctor account provisioned by authorized administrator',
      data: { id: String(user._id), name: user.name, email: user.email, role: user.role }
    });
  } catch (error) {
    if (error.code === 11000) {
      res.status(409).json({ success: false, message: 'An account already uses this email or doctor record' });
      return;
    }
    next(error);
  }
}

export async function provisionPathologistAccount(req, res, next) {
  try {
    const parsed = z.object({
      name: z.string().trim().min(1).max(120),
      email: z.string().email().transform((email) => email.trim().toLowerCase()),
      password: z.string().min(12).max(128)
    }).strict().safeParse(req.body);
    if (!parsed.success) {
      sendInvalid(res, 'Provide a name, valid email and password of at least 12 characters');
      return;
    }
    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    const user = await User.create({
      name: parsed.data.name,
      email: parsed.data.email,
      passwordHash,
      role: 'pathologist',
      isActive: true
    });
    res.status(201).json({
      success: true,
      message: 'Pathologist account provisioned by authorized administrator',
      data: { id: String(user._id), name: user.name, email: user.email, role: user.role }
    });
  } catch (error) {
    if (error.code === 11000) {
      res.status(409).json({ success: false, message: 'An account already uses this email' });
      return;
    }
    next(error);
  }
}

export async function updatePatientDoctorConsent(req, res, next) {
  try {
    const parsed = consentSchema.safeParse(req.body);
    if (!parsed.success) {
      sendInvalid(res, 'Explicitly confirm documented patient consent and choose granted or withdrawn');
      return;
    }
    const patient = await Patient.findOneAndUpdate(
      {
        $or: [
          { patientId: req.params.patientId },
          ...(mongoose.isValidObjectId(req.params.patientId) ? [{ _id: req.params.patientId }] : [])
        ]
      },
      { $set: {
        consentStatus: parsed.data.consentStatus,
        consentRecordedAt: new Date(),
        consentRecordedBy: req.auth.sub
      } },
      { new: true }
    ).select('patientId consentStatus');
    if (!patient) {
      res.status(404).json({ success: false, message: 'Patient not found' });
      return;
    }
    res.status(200).json({
      success: true,
      message: 'Doctor report consent status recorded; proceed only from documented patient authorization',
      data: { patientId: patient.patientId, consentStatus: patient.consentStatus }
    });
  } catch (error) {
    next(error);
  }
}
