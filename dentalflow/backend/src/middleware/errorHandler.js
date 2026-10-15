import mongoose from 'mongoose';
import multer from 'multer';
import config from '../config/env.js';
import { HttpError } from '../utils/errors.js';

/** 404 for unknown routes (DRF/Django style body) */
export function notFoundHandler(req, res) {
  res.status(404).json({ detail: 'Not found.' });
}

/** 405 for known paths called with an unsupported method */
export function methodNotAllowed(req, res) {
  res.status(405).json({ detail: `Method "${req.method}" not allowed.` });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  if (res.headersSent) {
    return;
  }

  if (err instanceof HttpError) {
    res.status(err.status).json(err.body);
    return;
  }

  // Malformed JSON body
  if (err.type === 'entity.parse.failed') {
    res.status(400).json({ detail: `JSON parse error - ${err.message}` });
    return;
  }
  if (err.type === 'entity.too.large') {
    res.status(413).json({ detail: 'Request body is too large.' });
    return;
  }

  // File upload problems
  if (err instanceof multer.MulterError) {
    const mb = Math.round(config.maxUploadBytes / (1024 * 1024));
    const message =
      err.code === 'LIMIT_FILE_SIZE'
        ? `File too large. Maximum size is ${mb}MB.`
        : err.code === 'LIMIT_UNEXPECTED_FILE'
          ? `Unexpected file field "${err.field}". Use "file".`
          : err.message;
    res.status(400).json({ error: message });
    return;
  }

  if (err instanceof mongoose.Error.ValidationError) {
    const errors = {};
    for (const [field, e] of Object.entries(err.errors)) {
      errors[field] = [e.message];
    }
    res.status(400).json({ error: errors });
    return;
  }

  if (err instanceof mongoose.Error.CastError) {
    res.status(400).json({ error: `Invalid value for ${err.path}.` });
    return;
  }

  if (err?.code === 11000) {
    res.status(400).json({ error: 'A record with these details already exists.' });
    return;
  }

  // eslint-disable-next-line no-console
  console.error(err);
  res.status(500).json({
    error: config.isProduction ? 'Internal server error.' : `Server error: ${err.message}`,
  });
}
