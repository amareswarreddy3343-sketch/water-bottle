/**
 * Built-in MongoDB — lets DentalFlow run with NO separate database install and NO Docker.
 *
 * Used automatically when MONGODB_URI is empty. On first start the official MongoDB
 * server binary for this operating system is downloaded once (~100 MB) into
 * backend/data/mongodb-binaries, and the database files are kept in backend/data/db,
 * so all data survives restarts. Back up the backend/data/db folder like any database.
 *
 * For cloud hosting, set MONGODB_URI instead (e.g. a free MongoDB Atlas cluster).
 */
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { BACKEND_DIR } from './env.js';

let server = null;

/** Is something already listening on the port? (e.g. the API server's built-in DB) */
function portInUse(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port });
    socket.setTimeout(1000);
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('timeout', () => { socket.destroy(); resolve(false); });
    socket.once('error', () => resolve(false));
  });
}

export async function startEmbeddedMongo() {
  const port = parseInt(process.env.EMBEDDED_DB_PORT || '27018', 10);

  // Already running (started by the API server)? Then just connect to it —
  // lets `npm run seed` / `npm run create-admin` work while the server is up.
  if (await portInUse(port)) {
    return `mongodb://127.0.0.1:${port}/dentalflow`;
  }

  let MongoMemoryServer;
  try {
    ({ MongoMemoryServer } = await import('mongodb-memory-server-core'));
  } catch {
    throw new Error(
      'MONGODB_URI is not set and the built-in database package is missing. '
        + 'Run "npm install" in backend/, or set MONGODB_URI in backend/.env.',
    );
  }

  const dataDir = path.resolve(BACKEND_DIR, process.env.EMBEDDED_DB_PATH || 'data/db');
  const binDir = path.resolve(BACKEND_DIR, process.env.EMBEDDED_MONGO_BIN_DIR || 'data/mongodb-binaries');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(binDir, { recursive: true });

  const firstRun = !fs.readdirSync(binDir).length && !process.env.MONGOMS_SYSTEM_BINARY;
  console.log(
    firstRun
      ? '⏳ Starting built-in MongoDB — downloading the database engine (first start only, ~100 MB)...'
      : '⏳ Starting built-in MongoDB...',
  );

  server = await MongoMemoryServer.create({
    instance: {
      dbPath: dataDir,
      storageEngine: 'wiredTiger', // persistent on-disk storage
      port,
      ip: '127.0.0.1', // only reachable from this computer
      launchTimeout: 60000, // slow disks / antivirus scans on first start
    },
    binary: {
      downloadDir: binDir,
      ...(process.env.EMBEDDED_MONGO_VERSION ? { version: process.env.EMBEDDED_MONGO_VERSION } : {}),
    },
  });

  console.log(`✅ Built-in MongoDB running on 127.0.0.1:${port} (data folder: ${dataDir})`);
  return server.getUri('dentalflow');
}

export async function stopEmbeddedMongo() {
  if (server) {
    // doCleanup=false keeps the data folder — this is a persistent database
    await server.stop({ doCleanup: false });
    server = null;
  }
}
