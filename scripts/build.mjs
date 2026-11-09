// Production build of the Next.js apps. The web app pre-renders pages from the CMS, so the API must be
// reachable during the build: start it (unless one is already answering), build, then stop what we started.
// Usage: pnpm build
import { spawn } from 'node:child_process';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const up = () => fetch(`${API}/v1/health/live`).then((r) => r.ok).catch(() => false);
const run = (cmd, args) =>
  new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: 'inherit', shell: true });
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(' ')} exited ${code}`))));
  });

let api = null;
if (!(await up())) {
  console.log('starting API for the build…');
  api = spawn('pnpm', ['--filter', '@greenscape/api', 'start'], { stdio: 'ignore', shell: true, detached: process.platform !== 'win32' });
  for (let i = 0; i < 120 && !(await up()); i++) await new Promise((r) => setTimeout(r, 500));
  if (!(await up())) throw new Error(`API did not come up at ${API} (are Postgres, Mongo, Redis and Supabase running?)`);
}

try {
  await run('pnpm', ['--filter', '@greenscape/api', 'build']);
  await run('pnpm', ['--filter', '@greenscape/web', '--filter', '@greenscape/admin', 'build']);
} finally {
  if (api) {
    if (process.platform === 'win32') spawn('taskkill', ['/pid', String(api.pid), '/T', '/F'], { stdio: 'ignore' });
    else process.kill(-api.pid, 'SIGTERM');
  }
}
