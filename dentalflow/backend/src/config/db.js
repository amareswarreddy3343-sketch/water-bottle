import mongoose from 'mongoose';
import config from './env.js';
import { startEmbeddedMongo, stopEmbeddedMongo } from './embeddedMongo.js';

mongoose.set('strictQuery', true);

/**
 * Connect to MongoDB.
 * - MONGODB_URI set   → use it (local MongoDB, MongoDB Atlas, any hosted MongoDB)
 * - MONGODB_URI empty → start the built-in MongoDB (no install, no Docker)
 */
export async function connectDB(uri = config.mongoUri) {
  const target = uri || (await startEmbeddedMongo());
  await mongoose.connect(target, {
    serverSelectionTimeoutMS: 15000,
    // Addresses without a database name (e.g. Railway's MONGO_URL) would otherwise use "test"
    ...(hasDatabaseName(target) ? {} : { dbName: config.mongoDbName }),
  });
  return mongoose.connection;
}

/** mongodb://user:pw@host:27017/clinic?x=y → true;  mongodb://user:pw@host:27017 → false */
export function hasDatabaseName(uri) {
  const m = /^mongodb(?:\+srv)?:\/\/[^/]+\/([^?#]*)/.exec(uri || '');
  return Boolean(m && m[1]);
}

export async function disconnectDB() {
  await mongoose.disconnect();
  await stopEmbeddedMongo();
}

export default connectDB;
