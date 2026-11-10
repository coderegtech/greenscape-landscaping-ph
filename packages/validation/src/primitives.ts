import { z } from 'zod';

// In the browser, skip Zod's compiled fast path: it probes `new Function`, which the site CSP (no 'unsafe-eval') reports.
if ('window' in globalThis) z.config({ jitless: true });

export const Email = z.string().trim().toLowerCase().email('Enter a valid email address');

/** Philippine mobile or landline: 09XX XXX XXXX, +63 9XX…, or (0XX) XXX XXXX. Stored normalised to +63… */
export const PhPhone = z
  .string()
  .trim()
  .transform((s) => s.replace(/[\s\-().]/g, ''))
  .refine((s) => /^(\+63|0)\d{9,10}$/.test(s), 'Enter a Philippine number, e.g. 0917 844 3330')
  .transform((s) => (s.startsWith('0') ? `+63${s.slice(1)}` : s));
