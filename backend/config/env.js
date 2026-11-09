import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const schema = z.object({
  PORT: z.coerce.number().int().positive().default(5000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().regex(/^\d+(s|m|h|d)$/, 'Use a duration such as 30m or 1h').default('1h'),
  FRONTEND_URL: z.string().url().default('http://localhost:5173'),
  OTP_PROVIDER: z.enum(['mock', 'sms']).default('mock'),
  AI_PROVIDER: z.enum(['openai-compatible']).optional(),
  AI_API_KEY: z.string().min(1).optional(),
  AI_MODEL: z.string().min(1).optional(),
  AI_API_BASE_URL: z.string().url().refine((value) => {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  }, 'AI_API_BASE_URL must use HTTPS and must not include credentials').optional(),
  AI_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60000).default(15000),
  DEMO_STAFF_EMAIL: z.string().email().optional(),
  DEMO_STAFF_PASSWORD: z.string().min(12).optional(),
  DEMO_STAFF_ROLE: z.enum(['staff', 'admin', 'pathologist']).default('staff')
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
  throw new Error(`Invalid environment configuration: ${details}`);
}

if (parsed.data.NODE_ENV === 'production' && parsed.data.OTP_PROVIDER === 'mock') {
  throw new Error('OTP_PROVIDER=mock is not allowed in production');
}

export const env = parsed.data;
