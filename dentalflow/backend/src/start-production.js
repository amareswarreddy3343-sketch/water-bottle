// Production launcher: `npm run start:prod` (works the same on Windows, macOS and Linux)
process.env.NODE_ENV = process.env.NODE_ENV || 'production';
await import('./server.js');
