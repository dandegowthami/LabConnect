import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env.js';
import { errorHandler, notFoundHandler } from './middleware/errorMiddleware.js';
import authRoutes from './routes/authRoutes.js';
import importRoutes from './routes/importRoutes.js';
import deliveryRoutes from './routes/deliveryRoutes.js';
import patientRoutes from './routes/patientRoutes.js';
import reportRoutes from './routes/reportRoutes.js';
import aiRoutes from './routes/aiRoutes.js';
import doctorRoutes from './routes/doctorRoutes.js';
import staffWorkspaceRoutes from './routes/staffWorkspaceRoutes.js';

const app = express();

function isAllowedOrigin(origin) {
  if (!origin || origin === env.FRONTEND_URL) return true;
  if (env.NODE_ENV !== 'production') {
    return /^http:\/\/(?:localhost|127\.0\.0\.1):\d{1,5}$/.test(origin);
  }
  return false;
}

app.disable('x-powered-by');
app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    if (isAllowedOrigin(origin)) {
      callback(null, true);
      return;
    }

    callback(Object.assign(new Error('Origin is not allowed by CORS'), { status: 403 }));
  },
  credentials: true
}));
app.use(express.json({ limit: '16kb' }));
app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev', {
  skip(req) {
    const requestPath = req.originalUrl.split('?')[0];
    return requestPath.startsWith('/api/patients/me')
      || requestPath.startsWith('/api/reports/')
      || requestPath.startsWith('/api/staff/')
      || requestPath.startsWith('/api/delivery/')
      || requestPath.startsWith('/api/ai/')
      || requestPath.startsWith('/api/doctor/');
  }
}));

app.get('/api/health', (req, res) => {
  res.status(200).json({ success: true, message: 'LabConnect API is running' });
});
app.use('/api/auth', authRoutes);
app.use('/api/patients', patientRoutes);
app.use('/api/delivery', deliveryRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/staff', staffWorkspaceRoutes);
app.use('/api/doctor', doctorRoutes);
app.use('/api', reportRoutes);
app.use('/api/import', importRoutes);
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
