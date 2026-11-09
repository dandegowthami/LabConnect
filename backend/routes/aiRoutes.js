import { Router } from 'express';
import {
  flagReportExplanation,
  generateReportExplanation,
  getReportExplanation
} from '../controllers/aiController.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { requirePatientIdentity } from '../middleware/patientIdentityMiddleware.js';
import { privateNoStore } from '../middleware/privateResponseMiddleware.js';
import { allowRoles } from '../middleware/roleMiddleware.js';

const router = Router();

router.use(privateNoStore, authenticate, allowRoles('patient', 'staff', 'admin', 'pathologist'), requirePatientIdentity);
router.post('/reports/:reportId/explain', generateReportExplanation);
router.get('/reports/:reportId/summary', getReportExplanation);
router.post('/reports/:reportId/flag-summary', allowRoles('patient'), flagReportExplanation);

export default router;
