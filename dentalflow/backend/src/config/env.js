import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// backend/ folder (two levels up from src/config)
export const BACKEND_DIR = path.resolve(__dirname, '..', '..');

dotenv.config({ path: path.join(BACKEND_DIR, '.env') });

const list = (value, fallback) =>
  (value ?? fallback)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

const int = (value, fallback) => {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
};

const NODE_ENV = process.env.NODE_ENV || 'development';
const isProduction = NODE_ENV === 'production';
const isTest = NODE_ENV === 'test';

/** Running on Railway (railway.com)? Railway sets these variables on every deployment. */
export const onRailway = Boolean(
  process.env.RAILWAY_ENVIRONMENT_ID || process.env.RAILWAY_PROJECT_ID || process.env.RAILWAY_SERVICE_ID,
);

/**
 * Persistent disk attached by the host (Railway volume). When present, uploaded files,
 * the login-token secret and the first admin password are kept there, so they survive
 * redeploys without any extra settings.
 */
export const VOLUME_DIR = (process.env.RAILWAY_VOLUME_MOUNT_PATH || '').trim() || null;

/** Where generated secrets are kept: the volume if there is one, otherwise backend/data */
export const DATA_DIR = VOLUME_DIR || path.join(BACKEND_DIR, 'data');

/** mongodb:// or mongodb+srv:// address from MONGODB_URI (or Railway's MONGO_URL) */
function resolveMongoUri() {
  const candidates = [process.env.MONGODB_URI, process.env.MONGO_URL, process.env.DATABASE_URL];
  for (const value of candidates) {
    const v = (value || '').trim();
    if (/^mongodb(\+srv)?:\/\//.test(v)) return v;
  }
  return '';
}

/**
 * Secret for signing login tokens. If JWT_SECRET is not configured, a random secret is
 * generated once and saved in backend/data/.jwt-secret so it survives restarts —
 * no manual setup needed. (Set JWT_SECRET explicitly when running several servers.)
 */
function resolveSecret() {
  const fromEnv = process.env.JWT_SECRET || process.env.SECRET_KEY;
  if (fromEnv) return fromEnv;
  if (isTest) return 'test-secret';
  const file = path.join(DATA_DIR, '.jwt-secret');
  try {
    const saved = fs.readFileSync(file, 'utf8').trim();
    if (saved) return saved;
  } catch {
    // not created yet
  }
  const secret = crypto.randomBytes(48).toString('hex');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, secret, { mode: 0o600 });
  // eslint-disable-next-line no-console
  console.log(`🔑 Generated a login-token secret in ${file}`);
  return secret;
}

const SECRET_KEY = resolveSecret();

export const config = {
  env: NODE_ENV,
  isProduction,
  isTest,
  port: int(process.env.PORT, 8000),
  host: process.env.HOST || '0.0.0.0',

  // Empty → use the built-in MongoDB (see src/config/embeddedMongo.js)
  mongoUri: resolveMongoUri(),
  // Database name used when the address does not include one (e.g. Railway's MONGO_URL)
  mongoDbName: (process.env.MONGODB_DB || 'dentalflow').trim(),

  jwt: {
    secret: SECRET_KEY,
    // Same lifetimes as the original Django SIMPLE_JWT settings
    accessTtlSeconds: int(process.env.JWT_ACCESS_TTL_SECONDS, 8 * 60 * 60), // 8 hours
    refreshTtlSeconds: int(process.env.JWT_REFRESH_TTL_SECONDS, 7 * 24 * 60 * 60), // 7 days
    rotateRefreshTokens: (process.env.JWT_ROTATE_REFRESH_TOKENS ?? 'true') !== 'false',
  },

  corsAllowedOrigins: list(
    process.env.CORS_ALLOWED_ORIGINS,
    'http://localhost:5173,http://localhost:3000',
  ),

  // Clinic time zone — used for "today" (appointments, registered today, default treatment date)
  timeZone: process.env.TIME_ZONE || 'Asia/Kolkata',

  // Uploaded files: MEDIA_ROOT, else the attached volume, else backend/mediafiles
  mediaRoot: path.resolve(
    BACKEND_DIR,
    process.env.MEDIA_ROOT || (VOLUME_DIR ? path.join(VOLUME_DIR, 'mediafiles') : 'mediafiles'),
  ),
  mediaUrl: '/media/',
  maxUploadBytes: int(process.env.MAX_UPLOAD_MB, 10) * 1024 * 1024,

  loginRateLimit: {
    windowMs: int(process.env.LOGIN_RATE_LIMIT_WINDOW_MINUTES, 15) * 60 * 1000,
    max: int(process.env.LOGIN_RATE_LIMIT_MAX, 100),
  },

  // Serve the built React app (frontend/dist) from Express when it exists
  serveFrontend: (process.env.SERVE_FRONTEND ?? 'true') !== 'false',
  frontendDist: path.resolve(BACKEND_DIR, process.env.FRONTEND_DIST || '../frontend/dist'),

  // Mirrors the old Django "runserver" helper that wrote frontend/.env.local with the LAN IP
  autoUpdateFrontendEnv: (process.env.AUTO_UPDATE_FRONTEND_ENV ?? 'false') === 'true',

  logRequests: (process.env.LOG_REQUESTS ?? (isTest ? 'false' : 'true')) === 'true',

  // Behind a proxy that terminates HTTPS (Railway, nginx, Caddy …) file links must use https
  trustProxy: process.env.TRUST_PROXY ? (process.env.TRUST_PROXY === 'true' ? true : process.env.TRUST_PROXY) : onRailway,

  onRailway,
  volumeDir: VOLUME_DIR,
  dataDir: DATA_DIR,
};

export default config;
