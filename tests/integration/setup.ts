import { fileURLToPath } from 'node:url';

// Local runs read the root .env; CI provides env vars directly.
try {
  process.loadEnvFile(fileURLToPath(new URL('../../.env', import.meta.url)));
} catch {
  /* no .env */
}
