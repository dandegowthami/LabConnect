import { Router } from 'express';
import { getPatientOrdersList, getPatientProfile, getPatientReportsList } from '../controllers/patientController.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { requirePatientIdentity } from '../middleware/patientIdentityMiddleware.js';
import { privateNoStore } from '../middleware/privateResponseMiddleware.js';
import { allowRoles } from '../middleware/roleMiddleware.js';

const router = Router();

router.use(privateNoStore, authenticate, allowRoles('patient'), requirePatientIdentity);
router.get('/me', getPatientProfile);
router.get('/me/orders', getPatientOrdersList);
router.get('/me/reports', getPatientReportsList);

export default router;
