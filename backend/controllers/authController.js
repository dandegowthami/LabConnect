import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { env } from '../config/env.js';
import OTP from '../models/OTP.js';
import Patient from '../models/Patient.js';
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

function issueToken(payload) {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN });
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

    const token = issueToken({ sub: `patient-contact:${randomUUID()}`, role: 'patient', contactVerified: true });
    res.status(200).json({
      success: true,
      message: 'Mobile number verified',
      data: {
        token,
        patient: { contactVerified: true, mobile: maskMobile(mobile) }
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
    if (!user || !passwordMatches || !user.isActive) {
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
    ? { role: 'patient', contactVerified: true }
    : {
      id: req.auth.user.id,
      name: req.auth.user.name,
      email: req.auth.user.email,
      role: req.auth.user.role
    };

  res.status(200).json({ success: true, data: { user: profile } });
}

export function logout(req, res) {
  res.status(200).json({
    success: true,
    message: 'Signed out on this client. Remove the JWT locally; this token remains valid until it expires.'
  });
}
