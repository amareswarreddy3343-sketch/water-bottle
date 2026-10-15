/**
 * Report file uploads (multer) — stores files the same way Django's FileField
 * did: MEDIA_ROOT/reports/<YYYY>/<MM>/<sanitized original name>, adding a short
 * random suffix if a file with the same name already exists.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import config from '../config/env.js';
import { localDateString } from '../utils/dates.js';

const ALNUM = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const randomSuffix = (len = 7) => Array.from({ length: len }, () => ALNUM[crypto.randomInt(ALNUM.length)]).join('');

/** Busboy decodes header filenames as latin1 — restore UTF-8 names */
function decodeOriginalName(name) {
  try {
    const decoded = Buffer.from(name, 'latin1').toString('utf8');
    return decoded.includes('�') ? name : decoded;
  } catch {
    return name;
  }
}

/** Same rules as Django's get_valid_filename(): spaces → "_", drop anything not [-\w.] */
export function getValidFilename(name) {
  const base = path.basename(String(name || '').replace(/\\/g, '/')).trim().replace(/ /g, '_');
  let cleaned = base.replace(/[^-\p{L}\p{N}_.]/gu, '');
  if (!cleaned || cleaned === '.' || cleaned === '..') cleaned = 'file';
  // Keep names to a sane length (Django FileField max_length=100 incl. folders)
  if (cleaned.length > 80) {
    const ext = path.extname(cleaned).slice(0, 10);
    cleaned = cleaned.slice(0, 80 - ext.length) + ext;
  }
  return cleaned;
}

const storage = multer.diskStorage({
  destination(req, _file, cb) {
    const [year, month] = localDateString().split('-');
    const relDir = path.posix.join('reports', year, month);
    const absDir = path.join(config.mediaRoot, relDir);
    fs.mkdir(absDir, { recursive: true }, (err) => {
      req.uploadRelDir = relDir;
      cb(err, absDir);
    });
  },
  filename(req, file, cb) {
    const original = decodeOriginalName(file.originalname);
    file.originalname = original;
    const valid = getValidFilename(original);
    const absDir = path.join(config.mediaRoot, req.uploadRelDir);
    let candidate = valid;
    const ext = path.extname(valid);
    const stem = valid.slice(0, valid.length - ext.length);
    while (fs.existsSync(path.join(absDir, candidate))) {
      candidate = `${stem}_${randomSuffix()}${ext}`;
    }
    file.relativePath = path.posix.join(req.uploadRelDir, candidate);
    cb(null, candidate);
  },
});

export const reportUpload = multer({
  storage,
  limits: { fileSize: config.maxUploadBytes, files: 1, fields: 20 },
});

/** Remove an uploaded file (used when the request fails validation) */
export async function removeUploadedFile(file) {
  if (file?.path) {
    await fs.promises.unlink(file.path).catch(() => {});
  }
}
