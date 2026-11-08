import rateLimit from 'express-rate-limit';

function rateLimitResponse(req, res) {
  res.status(429).json({ success: false, message: 'Too many report access attempts. Please try again later.' });
}

export const reportAccessOtpRequestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: rateLimitResponse
});

export const reportAccessOtpVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: rateLimitResponse
});
