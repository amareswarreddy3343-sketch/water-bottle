/**
 * Restore the database from a backup file made by the app.
 *
 *   npm run restore -- <path to icare32-backup-....jsonl.gz>          (shows what is inside)
 *   npm run restore -- <path to icare32-backup-....jsonl.gz> --yes    (replaces the current data)
 *
 * Stop the server first. A backup of the CURRENT data is taken before anything is replaced,
 * so a restore can itself be undone. Uploaded files are copied back from the backup's
 * "media" folder (files that already exist are left alone).
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import mongoose from 'mongoose';
import config from '../src/config/env.js';
import { connectDB, disconnectDB } from '../src/config/db.js';
import { audit } from '../src/utils/audit.js';
import { readBackup, runBackup } from '../src/utils/backup.js';

const file = process.argv.slice(2).find((a) => !a.startsWith('--'));
const confirmed = process.argv.includes('--yes');

async function copyMediaBack(fromDir) {
  let copied = 0;
  async function walk(rel) {
    const entries = await fsp.readdir(path.join(fromDir, rel), { withFileTypes: true }).catch(() => []);
    for (const e of entries) {
      const childRel = path.join(rel, e.name);
      if (e.isDirectory()) await walk(childRel);
      else if (e.isFile()) {
        const dst = path.join(config.mediaRoot, childRel);
        if (!fs.existsSync(dst)) {
          await fsp.mkdir(path.dirname(dst), { recursive: true });
          await fsp.copyFile(path.join(fromDir, childRel), dst);
          copied += 1;
        }
      }
    }
  }
  await walk('');
  return copied;
}

async function main() {
  if (!file || !fs.existsSync(file)) {
    console.error('Usage: npm run restore -- <backup file> [--yes]');
    process.exit(1);
  }
  const { header, collections } = await readBackup(file);
  console.log(`Backup from ${header.created_at}`);
  const listed = [...new Set([...Object.keys(header.counts || {}), ...Object.keys(collections)])].sort();
  for (const name of listed) console.log(`  ${name.padEnd(22)} ${(collections[name] || []).length}`);
  if (!confirmed) {
    console.log('\nNothing changed. Add --yes to replace the current data with this backup.');
    return;
  }

  await connectDB();
  console.log('\nBacking up the current data first…');
  const safety = await runBackup({ reason: 'before restore' });
  console.log(`  saved ${safety.file}`);

  const { db } = mongoose.connection;
  // every collection that was in the backup — including ones that were empty then
  const names = [...new Set([...Object.keys(header.counts || {}), ...Object.keys(collections)])];
  for (const name of names) {
    const docs = collections[name] || [];
    const col = db.collection(name);
    await col.deleteMany({});
    for (let i = 0; i < docs.length; i += 500) await col.insertMany(docs.slice(i, i + 500), { ordered: false });
    console.log(`  restored ${name} (${docs.length})`);
  }
  const mediaDir = path.join(path.dirname(path.resolve(file)), 'media');
  if (fs.existsSync(mediaDir)) console.log(`  copied back ${await copyMediaBack(mediaDir)} uploaded files`);
  await audit(null, {
    action: 'backup.restore',
    summary: `Data restored from ${path.basename(file)} (made ${header.created_at}). The data before it was saved as ${safety.file}.`,
  });
  console.log('\n✅ Restore complete. Start the server again.');
}

main()
  .catch((err) => {
    console.error(`❌ ${err.message}`);
    process.exitCode = 1;
  })
  .finally(() => disconnectDB().catch(() => {}));
