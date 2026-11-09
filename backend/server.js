import app from './app.js';
import { connectDatabase, disconnectDatabase } from './config/db.js';
import { env } from './config/env.js';

async function stopAfterStartupFailure(error) {
  if (error?.code === 'EADDRINUSE') {
    console.error(`Port ${env.PORT} is already in use. LabConnect may already be running; stop the existing backend or configure another PORT.`);
  } else {
    console.error('Unable to start LabConnect API', error);
  }
  try {
    await disconnectDatabase();
  } catch (disconnectError) {
    console.error('Unable to close MongoDB after startup failure', disconnectError);
  }
  process.exitCode = 1;
}

try {
  await connectDatabase();
  const server = app.listen(env.PORT, () => {
    console.info(`LabConnect API listening on port ${env.PORT}`);
  });
  server.once('error', (error) => {
    void stopAfterStartupFailure(error);
  });
} catch (error) {
  await stopAfterStartupFailure(error);
}
