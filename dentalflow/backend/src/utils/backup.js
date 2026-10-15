/**
 * Automatic backups — so the clinic never loses data if the computer fails.
 *
 * Once a day (and whenever the admin taps "Back up now") the whole database is written to
 * BACKUP_DIR as one compressed file, and uploaded photos/reports are copied to
 * BACKUP_DIR/media (only new or changed files). Point BACKUP_DIR at a OneDrive / Google Drive
 * folder or a USB drive so a copy also exists outside this computer.
 *
 * Restore with:  npm run restore -- <backup file>
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import zlib from 'node:zlib';
import mongoose from 'mongoose';
import config, { DATA_DIR } from '../config/env.js';
import { localDateString } from './dates.js';

const { EJSON } = mongoose.mongo.BSON;

export const BACKUP_FORMAT = 'icare32-backup';
const FILE_RE = /^icare32-backup-\d{4}-\d{2}-\d{2}_\d{4}(-\d+)?\.jsonl\.gz$/;
// one-time reset links are not worth keeping
const SKIP_COLLECTIONS = new Set(['password_resets']);
const KEEP_FILES = Number.parseInt(process.env.BACKUP_KEEP || '60', 10) || 60;

export const backupDir = () => path.resolve(process.env.BACKUP_DIR || path.join(DATA_DIR, 'backups'));
export const isBackupFileName = (name) => FILE_RE.test(name);

const state = { running: false, last: null, lastError: null, timer: null };

function stamp(date = new Date()) {
  const day = localDateString(date);
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: config.timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
    .format(date)
    .replace(':', '');
  return `${day}_${time}`;
}

/** Write every collection to one gzip'd JSON-lines file */
async function dumpDatabase(file) {
  const { db } = mongoose.connection;
  const collections = (await db.listCollections({}, { nameOnly: true }).toArray())
    .map((c) => c.name)
    .filter((n) => !n.startsWith('system.') && !SKIP_COLLECTIONS.has(n))
    .sort();
  const counts = {};
  for (const name of collections) counts[name] = await db.collection(name).countDocuments();

  async function* lines() {
    yield `${JSON.stringify({ format: BACKUP_FORMAT, version: 1, created_at: new Date().toISOString(), counts })}\n`;
    for (const name of collections) {
      for await (const doc of db.collection(name).find({})) {
        yield `${EJSON.stringify({ c: name, d: doc }, { relaxed: false })}\n`;
      }
    }
  }
  const tmp = `${file}.part`;
  await pipeline(Readable.from(lines()), zlib.createGzip({ level: 6 }), fs.createWriteStream(tmp));
  await fsp.rename(tmp, file);
  return counts;
}

/** Copy uploaded files that are new or changed into BACKUP_DIR/media */
async function mirrorMedia(dest) {
  let copied = 0;
  let total = 0;
  async function walk(rel) {
    const from = path.join(config.mediaRoot, rel);
    let entries;
    try {
      entries = await fsp.readdir(from, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const childRel = path.join(rel, e.name);
      if (e.isDirectory()) {
        await walk(childRel);
      } else if (e.isFile()) {
        total += 1;
        const src = path.join(config.mediaRoot, childRel);
        const dst = path.join(dest, childRel);
        const [s, d] = await Promise.all([fsp.stat(src), fsp.stat(dst).catch(() => null)]);
        if (!d || d.size !== s.size) {
          await fsp.mkdir(path.dirname(dst), { recursive: true });
          await fsp.copyFile(src, dst);
          copied += 1;
        }
      }
    }
  }
  await walk('');
  return { copied, total };
}

async function prune(dir) {
  const files = (await fsp.readdir(dir)).filter(isBackupFileName).sort();
  const extra = files.length - KEEP_FILES;
  for (let i = 0; i < extra; i += 1) await fsp.unlink(path.join(dir, files[i])).catch(() => {});
}

/** Run one backup now. Returns { file, size, counts, media } */
export async function runBackup({ reason = 'manual' } = {}) {
  if (state.running) throw new Error('A backup is already running. Try again in a minute.');
  state.running = true;
  try {
    const dir = backupDir();
    await fsp.mkdir(dir, { recursive: true });
    let name = `icare32-backup-${stamp()}.jsonl.gz`;
    for (let i = 2; fs.existsSync(path.join(dir, name)); i += 1) name = `icare32-backup-${stamp()}-${i}.jsonl.gz`;
    const file = path.join(dir, name);
    const counts = await dumpDatabase(file);
    const media = await mirrorMedia(path.join(dir, 'media'));
    await prune(dir);
    const size = (await fsp.stat(file)).size;
    state.last = { file: name, size, at: new Date().toISOString(), reason, counts, media };
    state.lastError = null;
    console.log(`💾 Backup saved: ${file} (${Math.round(size / 1024)} KB, ${media.copied} new files copied)`);
    return state.last;
  } catch (err) {
    state.lastError = { at: new Date().toISOString(), message: err.message };
    console.error(`❌ Backup failed: ${err.message}`);
    throw err;
  } finally {
    state.running = false;
  }
}

export async function listBackups() {
  const dir = backupDir();
  const names = (await fsp.readdir(dir).catch(() => [])).filter(isBackupFileName).sort().reverse();
  const files = [];
  for (const name of names) {
    const st = await fsp.stat(path.join(dir, name)).catch(() => null);
    if (st) files.push({ name, size: st.size, created_at: st.mtime.toISOString() });
  }
  return files;
}

export function backupState() {
  return { running: state.running, last: state.last, last_error: state.lastError };
}

/** Daily automatic backup: checks every hour whether today's backup exists */
export function startBackupSchedule() {
  if (config.isTest || process.env.BACKUP_DISABLED === 'true') return;
  const check = async () => {
    try {
      const today = localDateString();
      const files = await listBackups();
      if (!files.some((f) => f.name.startsWith(`icare32-backup-${today}`))) await runBackup({ reason: 'daily' });
    } catch {
      // reported by runBackup; tried again next hour
    }
  };
  setTimeout(check, 60 * 1000).unref();
  state.timer = setInterval(check, 60 * 60 * 1000);
  state.timer.unref();
}

/** Read a backup file → { header, collections: { name: [docs] } } */
export async function readBackup(file) {
  const text = zlib.gunzipSync(await fsp.readFile(file)).toString('utf8');
  const lines = text.split('\n').filter(Boolean);
  const header = JSON.parse(lines.shift());
  if (header.format !== BACKUP_FORMAT) throw new Error('This is not an iCare 32 backup file.');
  const collections = {};
  for (const line of lines) {
    const { c, d } = EJSON.parse(line, { relaxed: false });
    (collections[c] ||= []).push(d);
  }
  return { header, collections };
}
