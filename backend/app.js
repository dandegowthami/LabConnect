import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env.js';
import { errorHandler, notFoundHandler } from './middleware/errorMiddleware.js';
import authRoutes from './routes/authRoutes.js';

const app = express();

app.disable('x-powered-by');
app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    if (!origin || origin === env.FRONTEND_URL) {
      callback(null, true);
      return;
    }

    callback(Object.assign(new Error('Origin is not allowed by CORS'), { status: 403 }));
  },
  credentials: true
}));
app.use(express.json({ limit: '16kb' }));
app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'));

app.get('/api/health', (req, res) => {
  res.status(200).json({ success: true, message: 'LabConnect API is running' });
});
app.use('/api/auth', authRoutes);
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
