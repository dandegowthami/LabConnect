import { randomInt, timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';

export const OTP_TTL_MS = 5 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;

export function generateOtp() {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

export async function hashOtp(otp) {
  return bcrypt.hash(otp, 10);
}

export async function compareOtp(otp, hash) {
  const valid = await bcrypt.compare(otp, hash);
  const candidate = Buffer.from(otp);
  const normalized = Buffer.from(valid ? otp : '000000');
  return timingSafeEqual(candidate, normalized) && valid;
}

export async function deliverOtp(mobile, otp) {
  if (env.OTP_PROVIDER === 'mock' && env.NODE_ENV !== 'production') {
    return { developmentOtp: otp };
  }

  if (env.OTP_PROVIDER === 'sms') {
    throw Object.assign(new Error('SMS provider is not configured'), { status: 503 });
  }

  throw Object.assign(new Error('OTP delivery is unavailable'), { status: 503 });
}
