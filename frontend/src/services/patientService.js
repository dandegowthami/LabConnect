import api from './api.js';

const patientService = {
  getProfile: () => api.get('/patients/me'),
  getOrders: (params) => api.get('/patients/me/orders', { params }),
  getReports: (params) => api.get('/patients/me/reports', { params })
};

export default patientService;
