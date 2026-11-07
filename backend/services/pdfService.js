import { PDFDocument } from 'pdf-lib';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { assertPrivateStorageConfigured, getPrivateStorageDirectory } from '../config/storage.js';

const STORAGE_KEY_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.pdf$/;

function invalidPdfError() {
  return Object.assign(new Error('The uploaded file is not a valid PDF document'), { status: 400 });
}

export async function validatePdf(buffer) {
  const contents = Buffer.isBuffer(buffer) ? buffer.toString('latin1') : '';
  if (!Buffer.isBuffer(buffer)
    || !/^%PDF-\d\.\d/.test(buffer.subarray(0, 8).toString('ascii'))
    || !/startxref\s+\d+\s+%%EOF\s*$/.test(contents.slice(-2048))) {
    throw invalidPdfError();
  }

  try {
    const document = await PDFDocument.load(buffer, { ignoreEncryption: false, updateMetadata: false });
    if (document.getPageCount() < 1) throw invalidPdfError();
  } catch {
    throw invalidPdfError();
  }
}

function resolveStoragePath(storageKey) {
  if (typeof storageKey !== 'string' || !STORAGE_KEY_PATTERN.test(storageKey)) {
    throw Object.assign(new Error('Invalid private storage key'), { status: 400 });
  }

  const root = getPrivateStorageDirectory();
  const filePath = path.resolve(root, storageKey);
  const relativePath = path.relative(root, filePath);
  if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw Object.assign(new Error('Invalid private storage key'), { status: 400 });
  }
  return filePath;
}

export async function storePrivatePdf(buffer) {
  assertPrivateStorageConfigured();
  const storageKey = `${randomUUID()}.pdf`;
  const filePath = resolveStoragePath(storageKey);
  await mkdir(getPrivateStorageDirectory(), { recursive: true, mode: 0o700 });
  await writeFile(filePath, buffer, { flag: 'wx', mode: 0o600 });
  return storageKey;
}

export async function openPrivatePdf(storageKey) {
  assertPrivateStorageConfigured();
  const filePath = resolveStoragePath(storageKey);
  let buffer;
  try {
    buffer = await readFile(filePath);
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw Object.assign(new Error('The signed PDF is unavailable'), { status: 404 });
    }
    throw error;
  }
  await validatePdf(buffer);
  return { stream: createReadStream(filePath), size: buffer.length };
}

export async function validateStoredPdf(storageKey) {
  assertPrivateStorageConfigured();
  let buffer;
  try {
    buffer = await readFile(resolveStoragePath(storageKey));
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw Object.assign(new Error('The signed PDF is unavailable'), { status: 404 });
    }
    throw error;
  }
  await validatePdf(buffer);
}

export async function deletePrivatePdf(storageKey) {
  assertPrivateStorageConfigured();
  try {
    await unlink(resolveStoragePath(storageKey));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
