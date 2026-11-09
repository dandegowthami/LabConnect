import api from './api.js';

const staffWorkspaceService = {
  getDashboard: () => api.get('/staff/dashboard'),
  searchPatients: (params) => api.get('/staff/patients', { params }),
  getPatient: (patientId) => api.get(`/staff/patients/${encodeURIComponent(patientId)}`),
  issuePatientPortalActivation: (patientId) => api.post(
    `/staff/patients/${encodeURIComponent(patientId)}/portal-activation`,
    { identityVerified: true }
  ),
  setDoctorConsent: (patientId, consentStatus) => api.patch(
    `/staff/patients/${encodeURIComponent(patientId)}/doctor-consent`,
    { consentStatus, consentConfirmed: true }
  ),
  getReport: (reportId) => api.get(`/staff/reports/${encodeURIComponent(reportId)}`),
  getCallbackTasks: (params) => api.get('/staff/callback-tasks', { params }),
  updateCallbackTask: (taskId, data) => api.patch(`/staff/callback-tasks/${taskId}`, data),
  getUsers: () => api.get('/staff/users'),
  getDoctors: () => api.get('/staff/doctors'),
  getCriticalRules: () => api.get('/staff/critical-rules'),
  proposeCriticalRule: (data) => api.post('/staff/critical-rules', data),
  approveCriticalRule: (ruleId, approvalNote) => api.patch(
    `/staff/critical-rules/${ruleId}/approve`,
    { approvalNote }
  ),
  provisionDoctorAccount: (data) => api.post('/staff/doctor-accounts', data),
  provisionPathologistAccount: (data) => api.post('/staff/pathologist-accounts', data)
};

export default staffWorkspaceService;
