import { createHash, timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { env } from '../config/env.js';
import OTP from '../models/OTP.js';
import Patient from '../models/Patient.js';
import PatientAuditEvent from '../models/PatientAuditEvent.js';
import PatientContactSession from '../models/PatientContactSession.js';
import PatientPortalActivation from '../models/PatientPortalActivation.js';
import User from '../models/User.js';
import { compareOtp, deliverOtp, generateOtp, hashOtp, OTP_MAX_ATTEMPTS, OTP_TTL_MS } from '../services/otpService.js';

const mobileSchema = z.string().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number');
const requestOtpSchema = z.object({ mobile: mobileSchema });
const verifyOtpSchema = z.object({
  mobile: mobileSchema,
  otp: z.string().regex(/^\d{6}$/, 'OTP must contain six digits')
});
const staffLoginSchema = z.object({
  email: z.string().email().transform((email) => email.trim().toLowerCase()),
  password: z.string().min(1, 'Password is required')
});
const patientIdentitySchema = z.object({
  patientId: z.string().trim().min(1).max(100),
  password: z.string().min(8).max(128),
  activationCode: z.string().regex(/^[A-Za-z0-9_-]{43}$/).optional(),
  portalConsentAccepted: z.literal(true).optional()
}).strict();
const ACTIVATION_CODE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_IDENTITY_ATTEMPTS = 5;
const PORTAL_CONSENT_VERSION = 'portal-privacy-v1';

function issueToken(payload) {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN });
}

function jwtLifetimeMs() {
  const [, amount, unit] = env.JWT_EXPIRES_IN.match(/^(\d+)(s|m|h|d)$/);
  const multipliers = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return Number(amount) * multipliers[unit];
}

function hashActivationCode(code) {
  return createHash('sha256').update(code).digest();
}

function activationCodeMatches(code, storedHash) {
  if (!storedHash || !/^[a-f\d]{64}$/i.test(storedHash)) return false;
  return timingSafeEqual(hashActivationCode(code), Buffer.from(storedHash, 'hex'));
}

function issuePatientIdentityToken(patient, contactSession) {
  return issueToken({
    sub: `patient-contact:${contactSession.id}`,
    role: 'patient',
    contactVerified: true,
    contactSessionId: String(contactSession._id),
    patientId: String(patient._id)
  });
}

function maskMobile(mobile) {
  return `${mobile.slice(0, 2)}******${mobile.slice(-2)}`;
}

export async function requestPatientOtp(req, res, next) {
  try {
    const parsed = requestOtpSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, message: 'Invalid request', errors: parsed.error.flatten().fieldErrors });
      return;
    }

    const { mobile } = parsed.data;
    const patientExists = await Patient.exists({ mobile });
    if (!patientExists) {
      res.status(200).json({
        success: true,
        message: 'If this number is registered, an OTP has been sent',
        data: { expiresInSeconds: OTP_TTL_MS / 1000 }
      });
      return;
    }

    const otp = generateOtp();
    const hashedOTP = await hashOtp(otp);
    const expiresAt = new Date(Date.now() + OTP_TTL_MS);
    await OTP.create({ mobile, hashedOTP, purpose: 'patient-login', expiresAt });

    const delivery = await deliverOtp(mobile, otp);
    res.status(200).json({
      success: true,
      message: 'If this number is registered, an OTP has been sent',
      data: {
        expiresInSeconds: OTP_TTL_MS / 1000,
        ...(delivery.developmentOtp ? { developmentOtp: delivery.developmentOtp } : {})
      }
    });
  } catch (error) {
    next(error);
  }
}

export async function verifyPatientOtp(req, res, next) {
  try {
    const parsed = verifyOtpSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, message: 'Invalid request', errors: parsed.error.flatten().fieldErrors });
      return;
    }

    const { mobile, otp } = parsed.data;
    const record = await OTP.findOne({
      mobile,
      purpose: 'patient-login',
      verifiedAt: null,
      expiresAt: { $gt: new Date() }
    }).sort({ createdAt: -1 }).select('+hashedOTP');

    if (!record || record.attempts >= OTP_MAX_ATTEMPTS) {
      res.status(400).json({ success: false, message: 'OTP is invalid, expired, or already used' });
      return;
    }

    const matches = await compareOtp(otp, record.hashedOTP);
    if (!matches) {
      await OTP.updateOne(
        { _id: record._id, verifiedAt: null, attempts: { $lt: OTP_MAX_ATTEMPTS } },
        { $inc: { attempts: 1 } }
      );
      res.status(400).json({ success: false, message: 'OTP is incorrect or expired' });
      return;
    }

    const used = await OTP.findOneAndUpdate(
      {
        _id: record._id,
        verifiedAt: null,
        attempts: { $lt: OTP_MAX_ATTEMPTS },
        expiresAt: { $gt: new Date() }
      },
      { $set: { verifiedAt: new Date() } },
      { new: true }
    );

    if (!used) {
      res.status(400).json({ success: false, message: 'OTP is invalid, expired, or already used' });
      return;
    }

    const contactSession = await PatientContactSession.create({
      mobile,
      expiresAt: new Date(Date.now() + jwtLifetimeMs())
    });
    const token = issueToken({
      sub: `patient-contact:${contactSession.id}`,
      role: 'patient',
      contactVerified: true,
      contactSessionId: String(contactSession._id)
    });
    res.status(200).json({
      success: true,
      message: 'Mobile number verified',
      data: {
        token,
        patient: { role: 'patient', contactVerified: true, mobile: maskMobile(mobile) }
      }
    });
  } catch (error) {
    next(error);
  }
}

export async function identifyPatientPortalAccount(req, res, next) {
  try {
    const parsed = patientIdentitySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: 'Enter your patient ID, a password of at least eight characters, and required activation details'
      });
      return;
    }

    if (!req.auth.contactSessionId) {
      res.status(401).json({ success: false, message: 'Verify your mobile number again to continue' });
      return;
    }
    const contactSession = await PatientContactSession.findOne({
      _id: req.auth.contactSessionId,
      expiresAt: { $gt: new Date() }
    });
    if (!contactSession || contactSession.identityAttempts >= MAX_IDENTITY_ATTEMPTS) {
      res.status(401).json({ success: false, message: 'Your verification session expired. Request a new mobile code.' });
      return;
    }

    const patient = await Patient.findOne({ patientId: parsed.data.patientId }).select('+portalPasswordHash');
    const validPatientContact = patient && patient.mobile === contactSession.mobile;
    if (!validPatientContact) {
      await PatientContactSession.updateOne(
        { _id: contactSession._id, identityAttempts: { $lt: MAX_IDENTITY_ATTEMPTS } },
        { $inc: { identityAttempts: 1 } }
      );
      res.status(403).json({ success: false, message: 'Patient ID or account verification details are incorrect' });
      return;
    }

    if (contactSession.identityPatientId && !contactSession.identityPatientId.equals(patient._id)) {
      res.status(403).json({ success: false, message: 'This verification session is already linked to another patient' });
      return;
    }

    if (patient.portalPasswordHash) {
      const passwordMatches = await bcrypt.compare(parsed.data.password, patient.portalPasswordHash);
      if (!passwordMatches) {
        await PatientContactSession.updateOne(
          { _id: contactSession._id, identityAttempts: { $lt: MAX_IDENTITY_ATTEMPTS } },
          { $inc: { identityAttempts: 1 } }
        );
        res.status(403).json({ success: false, message: 'Patient ID or account verification details are incorrect' });
        return;
      }
    } else {
      if (!parsed.data.activationCode || parsed.data.portalConsentAccepted !== true) {
        res.status(400).json({
          success: false,
          message: 'A clinic-issued activation code and acceptance of the patient portal privacy notice are required'
        });
        return;
      }

      const activation = await PatientPortalActivation.findOne({
        patientId: patient._id,
        consumedAt: null,
        revokedAt: null,
        expiresAt: { $gt: new Date() },
        attempts: { $lt: MAX_IDENTITY_ATTEMPTS }
      }).select('+codeHash');
      if (!activation || !activationCodeMatches(parsed.data.activationCode, activation.codeHash)) {
        if (activation) {
          await PatientPortalActivation.updateOne(
            { _id: activation._id, attempts: { $lt: MAX_IDENTITY_ATTEMPTS }, consumedAt: null },
            { $inc: { attempts: 1 } }
          );
        }
        await PatientContactSession.updateOne(
          { _id: contactSession._id, identityAttempts: { $lt: MAX_IDENTITY_ATTEMPTS } },
          { $inc: { identityAttempts: 1 } }
        );
        res.status(403).json({ success: false, message: 'Patient ID or account verification details are incorrect' });
        return;
      }

      const consumed = await PatientPortalActivation.findOneAndUpdate(
        {
          _id: activation._id,
          consumedAt: null,
          revokedAt: null,
          expiresAt: { $gt: new Date() },
          attempts: { $lt: MAX_IDENTITY_ATTEMPTS }
        },
        { $set: { consumedAt: new Date() } },
        { new: true }
      );
      if (!consumed) {
        res.status(403).json({ success: false, message: 'This activation code is no longer available' });
        return;
      }

      const portalPasswordHash = await bcrypt.hash(parsed.data.password, 12);
      const activatedAt = new Date();
      const activated = await Patient.findOneAndUpdate(
        { _id: patient._id, portalPasswordHash: null },
        {
          $set: {
            portalPasswordHash,
            portalActivatedAt: activatedAt,
            portalConsentRecordedAt: activatedAt,
            portalConsentVersion: PORTAL_CONSENT_VERSION
          }
        },
        { new: true }
      );
      if (!activated) {
        res.status(409).json({ success: false, message: 'This patient portal account was already activated. Sign in with its password.' });
        return;
      }
      await PatientAuditEvent.create({
        patientId: patient._id,
        action: 'portal-account-activated',
        actorId: String(req.auth.sub)
      });
    }

    contactSession.identityPatientId = patient._id;
    await contactSession.save();
    if (patient.portalPasswordHash) {
      await PatientAuditEvent.create({
        patientId: patient._id,
        action: 'portal-identity-authenticated',
        actorId: String(req.auth.sub)
      });
    }
    res.status(200).json({
      success: true,
      message: 'Patient identity verified',
      data: {
        token: issuePatientIdentityToken(patient, contactSession),
        patient: { id: String(patient._id), patientId: patient.patientId, role: 'patient', identityVerified: true }
      }
    });
  } catch (error) {
    next(error);
  }
}

export async function loginStaff(req, res, next) {
  try {
    const parsed = staffLoginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, message: 'Invalid request', errors: parsed.error.flatten().fieldErrors });
      return;
    }

    const user = await User.findOne({ email: parsed.data.email }).select('+passwordHash');
    const passwordMatches = user ? await bcrypt.compare(parsed.data.password, user.passwordHash) : false;
    if (!user || !passwordMatches || !user.isActive || user.role === 'doctor') {
      res.status(401).json({ success: false, message: 'Email or password is incorrect' });
      return;
    }

    const token = issueToken({ sub: user.id, role: user.role });
    res.status(200).json({
      success: true,
      message: 'Signed in successfully',
      data: {
        token,
        user: { id: user.id, name: user.name, email: user.email, role: user.role }
      }
    });
  } catch (error) {
    next(error);
  }
}

export async function loginDoctor(req, res, next) {
  try {
    const parsed = staffLoginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, message: 'Invalid request', errors: parsed.error.flatten().fieldErrors });
      return;
    }

    const user = await User.findOne({ email: parsed.data.email, role: 'doctor' }).select('+passwordHash');
    const passwordMatches = user ? await bcrypt.compare(parsed.data.password, user.passwordHash) : false;
    if (!user || !passwordMatches || !user.isActive || !user.doctorId) {
      res.status(401).json({ success: false, message: 'Email or password is incorrect' });
      return;
    }

    const token = issueToken({ sub: user.id, role: user.role });
    res.status(200).json({
      success: true,
      message: 'Signed in successfully',
      data: {
        token,
        user: { id: user.id, name: user.name, email: user.email, role: user.role }
      }
    });
  } catch (error) {
    next(error);
  }
}

export function getCurrentUser(req, res) {
  const profile = req.auth.role === 'patient'
    ? {
      role: 'patient',
      contactVerified: true,
      ...(req.auth.patientId ? { patientId: req.auth.patientId, identityVerified: true } : {})
    }
    : {
      id: req.auth.user.id,
      name: req.auth.user.name,
      email: req.auth.user.email,
      role: req.auth.user.role,
      ...(req.auth.user.doctorId ? { doctorId: String(req.auth.user.doctorId) } : {})
    };

  res.status(200).json({ success: true, data: { user: profile } });
}

export function logout(req, res) {
  res.status(200).json({
    success: true,
    message: 'Signed out on this client. Remove the JWT locally; this token remains valid until it expires.'
  });
}
