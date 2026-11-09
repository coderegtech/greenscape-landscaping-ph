// Copies the running local Supabase's URL and keys into the root .env (creates it from .env.example if missing).
// Usage: pnpm supabase:env   (after `supabase start`)
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const raw = execSync('supabase status -o json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
const s = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
const values = {
  SUPABASE_URL: s.API_URL,
  SUPABASE_PUBLISHABLE_KEY: s.PUBLISHABLE_KEY,
  SUPABASE_SECRET_KEY: s.SECRET_KEY,
  NEXT_PUBLIC_SUPABASE_URL: s.API_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: s.PUBLISHABLE_KEY,
  MAILPIT_URL: s.MAILPIT_URL,
};
if (!fs.existsSync('.env')) fs.copyFileSync('.env.example', '.env');
let env = fs.readFileSync('.env', 'utf8');
for (const [k, v] of Object.entries(values)) {
  const line = `${k}=${v}`;
  env = new RegExp(`^${k}=.*$`, 'm').test(env) ? env.replace(new RegExp(`^${k}=.*$`, 'm'), line) : `${env.trimEnd()}\n${line}\n`;
}
fs.writeFileSync('.env', env);
console.log(`wrote ${Object.keys(values).join(', ')} to .env`);
