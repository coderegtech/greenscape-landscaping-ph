// RFC 6238 TOTP (SHA-1, 6 digits, 30 s), the scheme Supabase uses, so tests can complete MFA like an authenticator app.
import { createHmac } from 'node:crypto';

function base32(secret: string) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of secret.replace(/=+$/, '').toUpperCase()) {
    const v = alphabet.indexOf(c);
    if (v < 0) throw new Error('not base32');
    bits += v.toString(2).padStart(5, '0');
  }
  return Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
}

export function totp(secret: string, at = Date.now()) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)));
  const h = createHmac('sha1', base32(secret)).update(counter).digest();
  const o = h[h.length - 1]! & 0xf;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

// Self-check against the RFC 6238 test vector (secret "12345678901234567890", T = 59 s → 287082).
if (totp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', 59_000) !== '287082') throw new Error('totp self-check failed');
