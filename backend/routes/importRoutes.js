import { Router } from 'express';
import multer from 'multer';
import { commitLisImport, getImportDetails, getImportHistory, previewLisImport } from '../controllers/lisImportController.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { allowRoles } from '../middleware/roleMiddleware.js';

const router = Router();
const allowedMimeTypes = new Set(['text/csv', 'application/csv', 'application/vnd.ms-excel']);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
  fileFilter(req, file, callback) {
    const hasCsvExtension = /\.csv$/i.test(file.originalname);
    if (!hasCsvExtension || !allowedMimeTypes.has(file.mimetype)) {
      callback(Object.assign(new Error('Upload a .csv file with a CSV content type'), { status: 400 }));
      return;
    }
    callback(null, true);
  }
});

router.use(authenticate, allowRoles('staff', 'admin'));
router.post('/lis/preview', upload.single('file'), previewLisImport);
router.post('/lis/commit', commitLisImport);
router.get('/history', getImportHistory);
router.get('/:id', getImportDetails);

export default router;
