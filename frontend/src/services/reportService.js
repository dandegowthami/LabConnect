import api from './api.js';

const reportService = {
  getReport: (reportId) => api.get(`/reports/${encodeURIComponent(reportId)}`),
  getReportPdf: (reportId, disposition = 'view') => api.get(
    `/reports/${encodeURIComponent(reportId)}/${disposition}`,
    { responseType: 'blob' }
  ),
  getStaffReports: (params) => api.get('/staff/reports', { params }),
  uploadPdf: (reportId, file, onUploadProgress) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post(`/staff/reports/${encodeURIComponent(reportId)}/upload-pdf`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress
    });
  },
  confirmSigned: (reportId) => api.post(`/staff/reports/${encodeURIComponent(reportId)}/confirm-signed`)
};

export default reportService;
