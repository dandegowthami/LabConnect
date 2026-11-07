import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from './env.js';

const backendDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function getPrivateStorageDirectory() {
  return path.resolve(process.env.PDF_STORAGE_DIR || path.join(backendDirectory, 'private-storage'));
}

export function assertPrivateStorageConfigured() {
  if (env.NODE_ENV === 'production') {
    throw Object.assign(new Error('Private production PDF storage is not configured'), { status: 503 });
  }
}
