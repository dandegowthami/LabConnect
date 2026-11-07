import { Router } from 'express';
import {
  confirmReportSigned,
  getReport,
  getStaffReports,
  streamReportPdf,
  uploadSignedPdf
} from '../controllers/reportController.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { requirePatientIdentity } from '../middleware/patientIdentityMiddleware.js';
import { privateNoStore } from '../middleware/privateResponseMiddleware.js';
import { allowRoles } from '../middleware/roleMiddleware.js';
import { reportPdfUploadLimiter, uploadReportPdf } from '../middleware/uploadMiddleware.js';

const router = Router();

router.use(privateNoStore);
router.get('/staff/reports', authenticate, allowRoles('staff', 'admin'), getStaffReports);
router.post('/staff/reports/:reportId/upload-pdf', authenticate, allowRoles('staff', 'admin'), reportPdfUploadLimiter, uploadReportPdf, uploadSignedPdf);
router.post('/staff/reports/:reportId/confirm-signed', authenticate, allowRoles('staff', 'admin'), confirmReportSigned);
router.get('/reports/:reportId/view', authenticate, allowRoles('patient', 'staff', 'admin'), requirePatientIdentity, streamReportPdf);
router.get('/reports/:reportId/download', authenticate, allowRoles('patient', 'staff', 'admin'), requirePatientIdentity, (req, res, next) => {
  req.pdfDisposition = 'download';
  streamReportPdf(req, res, next);
});
router.get('/reports/:reportId', authenticate, allowRoles('patient', 'staff', 'admin'), requirePatientIdentity, getReport);

export default router;
