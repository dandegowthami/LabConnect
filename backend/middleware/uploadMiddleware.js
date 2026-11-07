import multer from 'multer';
import rateLimit from 'express-rate-limit';

function uploadRateLimitResponse(req, res) {
  res.status(429).json({ success: false, message: 'Too many PDF uploads. Please try again later.' });
}

export const reportPdfUploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: uploadRateLimitResponse
});

export const uploadReportPdf = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter(req, file, callback) {
    if (!/\.pdf$/i.test(file.originalname) || file.mimetype !== 'application/pdf') {
      callback(Object.assign(new Error('Upload a .pdf file with an application/pdf content type'), { status: 400 }));
      return;
    }
    callback(null, true);
  }
}).single('file');
