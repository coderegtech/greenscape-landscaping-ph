import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';

// Short-lived, path-bound preview tokens. The admin app signs; the web app verifies. The shared secret itself
// never appears in a URL or a browser.
const b64 = (b: Buffer) => b.toString('base64url');

export function signPreview(path: string, secret: string, ttlSec = 600) {
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  const sig = b64(createHmac('sha256', secret).update(`${path}.${exp}`).digest());
  return `${exp}.${sig}`;
}

export function verifyPreview(path: string, token: string, secret: string) {
  const [expRaw, sig] = token.split('.');
  const exp = Number(expRaw);
  if (!sig || !Number.isInteger(exp) || exp < Date.now() / 1000) return false;
  const expected = createHmac('sha256', secret).update(`${path}.${exp}`).digest();
  const given = Buffer.from(sig, 'base64url');
  return given.length === expected.length && timingSafeEqual(given, expected);
}
