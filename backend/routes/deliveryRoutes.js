import { Router } from 'express';
import {
  generateReportDelivery,
  getDeliveryLogs,
  requestReportAccessOtp,
  resendReportDelivery,
  revokeReportDelivery,
  streamReportWithAccessGrant,
  verifyReportAccessOtp
} from '../controllers/deliveryController.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { reportAccessOtpRequestLimiter, reportAccessOtpVerifyLimiter } from '../middleware/deliveryRateLimiters.js';
import { privateNoStore } from '../middleware/privateResponseMiddleware.js';
import { allowRoles } from '../middleware/roleMiddleware.js';

const router = Router();

router.use(privateNoStore);
router.post('/reports/:reportId/generate', authenticate, allowRoles('staff', 'admin'), generateReportDelivery);
router.post('/reports/:reportId/resend', authenticate, allowRoles('staff', 'admin'), resendReportDelivery);
router.post('/reports/:reportId/revoke', authenticate, allowRoles('staff', 'admin'), revokeReportDelivery);
router.get('/logs', authenticate, allowRoles('staff', 'admin'), getDeliveryLogs);

router.post('/access/request-otp', reportAccessOtpRequestLimiter, requestReportAccessOtp);
router.post('/access/verify-otp', reportAccessOtpVerifyLimiter, verifyReportAccessOtp);
router.get('/access/report', (req, res, next) => {
  req.pdfDisposition = 'view';
  streamReportWithAccessGrant(req, res, next);
});
router.get('/access/report/download', (req, res, next) => {
  req.pdfDisposition = 'download';
  streamReportWithAccessGrant(req, res, next);
});

export default router;
