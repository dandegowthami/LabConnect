import { Router } from 'express';
import {
  getDoctorDashboard,
  getDoctorMe,
  getDoctorPatients,
  getDoctorReport,
  getDoctorReports,
  streamDoctorReport
} from '../controllers/doctorController.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { privateNoStore } from '../middleware/privateResponseMiddleware.js';
import { allowRoles } from '../middleware/roleMiddleware.js';

const router = Router();

router.use(privateNoStore, authenticate, allowRoles('doctor'));
router.get('/me', getDoctorMe);
router.get('/dashboard', getDoctorDashboard);
router.get('/patients', getDoctorPatients);
router.get('/reports', getDoctorReports);
router.get('/reports/:reportId', getDoctorReport);
router.get('/reports/:reportId/view', (req, res, next) => {
  req.pdfDisposition = 'view';
  streamDoctorReport(req, res, next);
});
router.get('/reports/:reportId/download', (req, res, next) => {
  req.pdfDisposition = 'download';
  streamDoctorReport(req, res, next);
});

export default router;
