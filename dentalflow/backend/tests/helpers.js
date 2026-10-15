import mongoose from 'mongoose';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.BCRYPT_ROUNDS = process.env.BCRYPT_ROUNDS || '4';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.MEDIA_ROOT = process.env.MEDIA_ROOT || 'mediafiles_test';

let memoryServer = null;

/** MONGODB_URI_TEST if given, otherwise a throw-away in-memory MongoDB (nothing to install) */
async function testUri() {
  if (process.env.MONGODB_URI_TEST) return process.env.MONGODB_URI_TEST;
  const { MongoMemoryServer } = await import('mongodb-memory-server-core');
  memoryServer = await MongoMemoryServer.create();
  return memoryServer.getUri('dentalflow_test');
}

/** Connect to a fresh test database, seed the default users, build the app */
export async function setup() {
  const TEST_URI = await testUri();
  const { connectDB } = await import('../src/config/db.js');
  const { createApp } = await import('../src/app.js');
  const { seed } = await import('../scripts/seed.js');
  const models = await import('../src/models/index.js');

  await connectDB(TEST_URI);
  await mongoose.connection.dropDatabase();
  // Build indexes (unique constraints matter for the tests). Some MongoDB-compatible
  // servers lack TTL indexes — that only affects automatic clean-up, so ignore it.
  const results = await Promise.allSettled(
    Object.values(models).filter((m) => m?.syncIndexes).map((m) => m.syncIndexes()),
  );
  for (const r of results) {
    if (r.status === 'rejected' && !/expireAfterSeconds/.test(r.reason?.message)) throw r.reason;
  }
  await seed({ quiet: true });

  const app = createApp();
  return { app, models };
}

export async function teardown() {
  const fs = await import('node:fs/promises');
  const { default: config } = await import('../src/config/env.js');
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  if (memoryServer) await memoryServer.stop();
  await fs.rm(config.mediaRoot, { recursive: true, force: true });
}

export async function login(app, email, password = 'Admin@123') {
  const res = await request(app).post('/api/auth/login/').send({ email, password });
  if (res.status !== 200) throw new Error(`login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.tokens;
}

/** supertest agent bound to a bearer token */
export function as(app, token) {
  const wrap = (method) => (url) => request(app)[method](url).set('Authorization', `Bearer ${token}`);
  return { get: wrap('get'), post: wrap('post'), patch: wrap('patch'), delete: wrap('delete'), put: wrap('put') };
}
