import fs from 'node:fs';
import path from 'node:path';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import config from './config/env.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import apiRouter from './routes/index.js';

// File types that a browser could execute as active content — always served as downloads
const ACTIVE_CONTENT_EXT = new Set(['.html', '.htm', '.xhtml', '.svg', '.xml', '.js', '.mjs']);

export function createApp() {
  const app = express();

  app.set('case sensitive routing', true);
  app.set('jwtRotateRefresh', config.jwt.rotateRefreshTokens);
  app.disable('x-powered-by');
  if (config.trustProxy) {
    app.set('trust proxy', config.trustProxy);
  }

  app.use(
    helmet({
      // Uploaded reports are opened from the React app (different origin)
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      // CSP is handled by the frontend host; the API only returns JSON / files
      contentSecurityPolicy: false,
    }),
  );

  app.use(
    cors({
      origin(origin, cb) {
        // Allow non-browser clients (no Origin header) and configured origins
        if (!origin || config.corsAllowedOrigins.includes(origin) || config.corsAllowedOrigins.includes('*')) {
          cb(null, true);
        } else {
          cb(null, false);
        }
      },
      credentials: true,
    }),
  );

  if (config.logRequests) {
    app.use(morgan(config.isProduction ? 'combined' : 'dev'));
  }

  app.use(express.json({ limit: '5mb' }));
  app.use(express.urlencoded({ extended: true, limit: '5mb' }));

  // Uploaded files (report X-rays, prescriptions, ...)
  fs.mkdirSync(config.mediaRoot, { recursive: true });
  app.use(
    config.mediaUrl,
    express.static(config.mediaRoot, {
      index: false,
      dotfiles: 'deny',
      setHeaders(res, filePath) {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        if (ACTIVE_CONTENT_EXT.has(path.extname(filePath).toLowerCase())) {
          res.setHeader('Content-Disposition', 'attachment');
          res.setHeader('Content-Security-Policy', 'sandbox');
        }
      },
    }),
  );

  app.use('/api', apiRouter);

  // Optionally serve the built React app (frontend/dist) from the same server
  const indexHtml = path.join(config.frontendDist, 'index.html');
  if (config.serveFrontend && fs.existsSync(indexHtml)) {
    app.set('servesFrontend', true);
    app.use(express.static(config.frontendDist, { index: false }));
    app.get(/^(?!\/(api|media)(\/|$)).*/, (req, res) => res.sendFile(indexHtml));
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export default createApp;
