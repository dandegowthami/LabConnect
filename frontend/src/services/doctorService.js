import api from './api.js';

const doctorService = {
  login: (email, password) => api.post('/auth/doctor/login', { email, password }),
  getMe: () => api.get('/doctor/me'),
  getDashboard: () => api.get('/doctor/dashboard'),
  getPatients: (params) => api.get('/doctor/patients', { params }),
  getReports: (params) => api.get('/doctor/reports', { params }),
  getReport: (reportId) => api.get(`/doctor/reports/${encodeURIComponent(reportId)}`),
  getPdf: (reportId, disposition = 'view') => api.get(
    `/doctor/reports/${encodeURIComponent(reportId)}/${disposition}`,
    { responseType: 'blob' }
  )
};

export default doctorService;
