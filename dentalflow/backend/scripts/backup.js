/**
 * Back up the database (and uploaded files) right now.
 *
 *   npm run backup
 *
 * Works while the server is running. The file is written to BACKUP_DIR
 * (default: backend/data/backups). Restore with:  npm run restore -- <file> --yes
 */
import { connectDB, disconnectDB } from '../src/config/db.js';
import { backupDir, runBackup } from '../src/utils/backup.js';

async function main() {
  await connectDB();
  const result = await runBackup({ reason: 'from the command line' });
  console.log(`\n✅ Backup saved in ${backupDir()}`);
  console.log(`   ${result.file} (${Math.round(result.size / 1024)} KB)`);
  for (const [name, n] of Object.entries(result.counts)) console.log(`   ${name.padEnd(22)} ${n}`);
}

main()
  .catch((err) => {
    console.error(`❌ Backup failed: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(() => disconnectDB().catch(() => {}));
