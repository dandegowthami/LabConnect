import app from './app.js';
import { connectDatabase } from './config/db.js';
import { env } from './config/env.js';

try {
  await connectDatabase();
  app.listen(env.PORT, () => {
    console.info(`LabConnect API listening on port ${env.PORT}`);
  });
} catch (error) {
  console.error('Unable to start LabConnect API', error);
  process.exitCode = 1;
}
