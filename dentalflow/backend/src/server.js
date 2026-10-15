import dgram from 'node:dgram';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import createApp from './app.js';
import { connectDB, disconnectDB } from './config/db.js';
import config, { BACKEND_DIR } from './config/env.js';
import { backupDir, startBackupSchedule } from './utils/backup.js';
import { ensureInitialAdmin, upgradeData } from './utils/bootstrap.js';
import { isEmailEnabled } from './utils/mailer.js';

/** LAN IP of the outbound interface (same trick as the old Django helper), with fallbacks */
function getLocalIp() {
  return new Promise((resolve) => {
    const fallback = () => {
      for (const addresses of Object.values(os.networkInterfaces())) {
        for (const addr of addresses || []) {
          if (addr.family === 'IPv4' && !addr.internal) return addr.address;
        }
      }
      return '127.0.0.1';
    };
    const socket = dgram.createSocket('udp4');
    const done = (ip) => {
      try { socket.close(); } catch { /* already closed */ }
      resolve(ip);
    };
    socket.on('error', () => done(fallback()));
    socket.connect(80, '8.8.8.8', (err) => {
      if (err) return done(fallback());
      try {
        return done(socket.address().address);
      } catch {
        return done(fallback());
      }
    });
  });
}

/** Same as the old Django runserver helper: write frontend/.env.local with the LAN API URL */
function updateFrontendEnv(ip) {
  try {
    const frontendDir = path.resolve(BACKEND_DIR, '..', 'frontend');
    if (!fs.existsSync(frontendDir)) return;
    const content = `# Local network access - Auto-updated\nVITE_API_BASE_URL=http://${ip}:${config.port}/api\n`;
    fs.writeFileSync(path.join(frontendDir, '.env.local'), content);
    console.log(`✅ Updated frontend/.env.local → API: http://${ip}:${config.port}/api`);
  } catch (err) {
    console.warn(`⚠️  Could not update frontend .env: ${err.message}`);
  }
}

function printBanner(ip, servingApp) {
  const line = '='.repeat(60);
  console.log(`\n${line}\n🚀 DENTALFLOW SERVER (${config.env})\n${line}`);
  if (config.onRailway) {
    const domain = process.env.RAILWAY_PUBLIC_DOMAIN;
    console.log(
      domain
        ? `\n📍 OPEN THE APP:  https://${domain}`
        : '\n📍 Running on Railway. Add a public domain: service → Settings → Networking → Generate Domain.',
    );
    console.log(`\n${line}\n`);
    return;
  }
  if (servingApp) {
    console.log('\n📍 OPEN THE APP:\n');
    console.log(`   • On this computer:  http://localhost:${config.port}`);
    console.log(`   • From other devices on the network:  http://${ip}:${config.port}`);
  } else {
    console.log('\n📍 SERVER URLS:\n');
    console.log(`   • API:       http://${ip}:${config.port}/api`);
    console.log(`   • Frontend:  http://${ip}:5173   (run "npm run dev" in frontend/)`);
    console.log(`   • Localhost: http://127.0.0.1:${config.port}`);
  }
  console.log(`\n${line}\n`);
}

/** Safety checks for cloud hosting, where the container's own disk is wiped on every deploy */
function checkHosting() {
  if (!config.onRailway) return;
  if (!config.mongoUri) {
    throw new Error(
      'No database configured. On Railway, add a MongoDB service and set this variable on the app service: '
        + 'MONGODB_URI=${{MongoDB.MONGO_URL}}  (otherwise patient data would be lost on every deploy).',
    );
  }
  if (!config.volumeDir && !process.env.MEDIA_ROOT) {
    console.warn(
      '⚠️  No volume attached: uploaded photos and reports will be LOST on the next deploy. '
        + 'In Railway, right-click the app service → Attach volume (mount path /data).',
    );
  } else {
    console.log(`📁 Uploaded files are stored in ${config.mediaRoot}`);
  }
  if (!isEmailEnabled()) {
    console.log('✉️  Email is off: staff who forget a password are reset by the admin (Admin → Team).');
  }
  if (!process.env.JWT_SECRET && !config.volumeDir) {
    console.warn('⚠️  JWT_SECRET is not set: everyone will be signed out after each deploy.');
  }
}

/** Reminders for a clinic computer: where backups go, and a test date left switched on */
function clinicNotes() {
  if (process.env.CLINIC_FAKE_TODAY) {
    console.warn(`⚠️  CLINIC_FAKE_TODAY=${process.env.CLINIC_FAKE_TODAY} — the app thinks today is that day. Remove it from .env for real use.`);
  }
  if (config.isTest || process.env.BACKUP_DISABLED === 'true') return;
  console.log(`💾 Daily backups are saved in ${backupDir()}`);
  if (!process.env.BACKUP_DIR && !config.onRailway) {
    console.log('   Tip: set BACKUP_DIR in backend/.env to a OneDrive / Google Drive folder or a USB drive,');
    console.log('   so a copy is kept even if this computer fails.');
  }
}

async function main() {
  checkHosting();
  await connectDB();
  console.log('✅ Connected to MongoDB');
  await ensureInitialAdmin();
  await upgradeData();
  startBackupSchedule();
  clinicNotes();

  const app = createApp();
  const server = app.listen(config.port, config.host, async () => {
    const ip = await getLocalIp();
    if (config.autoUpdateFrontendEnv) updateFrontendEnv(ip);
    printBanner(ip, app.get('servesFrontend'));
  });
  server.on('error', async (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(
        `\n❌ Port ${config.port} is already in use — iCare 32 is probably already running on this computer `
          + '(look for its other window), or another program uses this port (set PORT in backend/.env).',
      );
    } else {
      console.error(`❌ Server error: ${err.message}`);
    }
    await disconnectDB().catch(() => {});
    process.exit(1);
  });

  const shutdown = async (signal) => {
    console.log(`\n${signal} received — shutting down...`);
    server.close(async () => {
      await disconnectDB(); // also stops the built-in MongoDB cleanly
      process.exit(0);
    });
    server.closeAllConnections?.();
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('❌ Failed to start server:', err.message);
  process.exit(1);
});
