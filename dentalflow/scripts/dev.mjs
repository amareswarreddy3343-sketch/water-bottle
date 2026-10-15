// `npm run dev` from the project root — starts the API (port 8000) and the React dev
// server (port 5173) together in one terminal. Ctrl+C stops both.
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const isWindows = process.platform === 'win32';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const procs = [
  ['api', 'backend', ['run', 'dev'], '\x1b[36m'],
  ['web', 'frontend', ['run', 'dev', '--', '--host'], '\x1b[35m'],
].map(([name, dir, args, color]) => {
  const child = isWindows
    ? spawn('npm', args, { cwd: path.join(root, dir), shell: true, env: process.env })
    // own process group, so the whole tree (npm → node → database) can be stopped together
    : spawn('npm', args, { cwd: path.join(root, dir), detached: true, env: process.env });
  const prefix = `${color}[${name}]\x1b[0m `;
  const pipe = (stream, out) => stream.on('data', (d) => {
    for (const line of String(d).split(/\r?\n/)) if (line.trim()) out.write(prefix + line + '\n');
  });
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  child.on('exit', (code) => {
    console.log(`${prefix}exited (${code})`);
    shutdown();
  });
  return child;
});

let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  for (const p of procs) {
    if (p.exitCode !== null) continue;
    try {
      if (isWindows) spawnSync('taskkill', ['/pid', String(p.pid), '/T', '/F']);
      else process.kill(-p.pid, 'SIGINT'); // the API stops its built-in MongoDB cleanly
    } catch {
      // already gone
    }
  }
  setTimeout(() => process.exit(0), 6000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
