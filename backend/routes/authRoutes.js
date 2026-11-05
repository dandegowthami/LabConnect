import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { getCurrentUser, loginStaff, logout, requestPatientOtp, verifyPatientOtp } from '../controllers/authController.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { allowRoles } from '../middleware/roleMiddleware.js';

const router = Router();

function rateLimitResponse(req, res) {
  res.status(429).json({ success: false, message: 'Too many authentication attempts. Please try again later.' });
}

export const requestOtpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: rateLimitResponse
});

export const verifyOtpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: rateLimitResponse
});

export const staffLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: rateLimitResponse
});

router.post('/patient/request-otp', requestOtpLimiter, requestPatientOtp);
router.post('/patient/verify-otp', verifyOtpLimiter, verifyPatientOtp);
router.post('/staff/login', staffLoginLimiter, loginStaff);
router.get('/me', authenticate, getCurrentUser);
router.post('/logout', authenticate, logout);

export default router;
