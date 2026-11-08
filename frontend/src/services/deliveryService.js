import api from './api.js';

const deliveryService = {
  requestOtp: (token) => api.post('/delivery/access/request-otp', { token }),
  verifyOtp: (token, otp) => api.post('/delivery/access/verify-otp', { token, otp }),
  getReportPdf: (grant, disposition = 'view') => api.get(
    `/delivery/access/report${disposition === 'download' ? '/download' : ''}`,
    {
      responseType: 'blob',
      headers: { 'X-Report-Access-Grant': grant }
    }
  ),
  getLogs: (params) => api.get('/delivery/logs', { params }),
  generate: (reportId, channel) => api.post(`/delivery/reports/${encodeURIComponent(reportId)}/generate`, { channel }),
  resend: (reportId, channel) => api.post(`/delivery/reports/${encodeURIComponent(reportId)}/resend`, { channel }),
  revoke: (reportId) => api.post(`/delivery/reports/${encodeURIComponent(reportId)}/revoke`)
};

export default deliveryService;
