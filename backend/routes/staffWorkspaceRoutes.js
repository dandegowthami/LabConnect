import { Router } from 'express';
import {
  approveCriticalRule,
  getStaffDashboard,
  getStaffPatient,
  getStaffReportWorkspace,
  issuePatientPortalActivation,
  listCallbackTasks,
  listCriticalRules,
  listReferringDoctors,
  listStaffAssignees,
  proposeCriticalRule,
  provisionDoctorAccount,
  provisionPathologistAccount,
  searchStaffPatients,
  updateCallbackTask,
  updatePatientDoctorConsent
} from '../controllers/staffWorkspaceController.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { privateNoStore } from '../middleware/privateResponseMiddleware.js';
import { allowRoles } from '../middleware/roleMiddleware.js';

const router = Router();

router.use(privateNoStore, authenticate, allowRoles('staff', 'admin', 'pathologist'));
router.get('/dashboard', getStaffDashboard);
router.get('/users', listStaffAssignees);
router.get('/doctors', listReferringDoctors);
router.get('/patients', searchStaffPatients);
router.get('/patients/:patientId', getStaffPatient);
router.post('/patients/:patientId/portal-activation', allowRoles('staff', 'admin'), issuePatientPortalActivation);
router.patch('/patients/:patientId/doctor-consent', allowRoles('staff', 'admin'), updatePatientDoctorConsent);
router.get('/reports/:reportId', getStaffReportWorkspace);
router.get('/callback-tasks', listCallbackTasks);
router.patch('/callback-tasks/:taskId', updateCallbackTask);
router.get('/critical-rules', listCriticalRules);
router.post('/critical-rules', allowRoles('staff', 'admin'), proposeCriticalRule);
router.patch('/critical-rules/:ruleId/approve', allowRoles('pathologist'), approveCriticalRule);
router.post('/doctor-accounts', allowRoles('staff', 'admin'), provisionDoctorAccount);
router.post('/pathologist-accounts', allowRoles('admin'), provisionPathologistAccount);

export default router;
