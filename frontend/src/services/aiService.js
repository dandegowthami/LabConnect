import api from './api.js';

const aiService = {
  getSummary: (reportId, language) => api.get(
    `/ai/reports/${encodeURIComponent(reportId)}/summary`,
    { params: { language } }
  ),
  generate: (reportId, language) => api.post(
    `/ai/reports/${encodeURIComponent(reportId)}/explain`,
    { language }
  ),
  flag: (reportId, language, reason) => api.post(
    `/ai/reports/${encodeURIComponent(reportId)}/flag-summary`,
    { language, reason }
  )
};

export default aiService;
