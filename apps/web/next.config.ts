import type { NextConfig } from 'next';
import { legacyRedirects } from './lib/legacy-redirects';

// One .env at the monorepo root; real deployments inject env vars instead.
try { process.loadEnvFile('../../.env'); } catch { /* no root .env */ }

const origin = (u: string | undefined) => {
  try {
    return u ? new URL(u).origin : '';
  } catch {
    return '';
  }
};
const dev = process.env.NODE_ENV !== 'production';
const api = origin(process.env.NEXT_PUBLIC_API_URL) || 'http://localhost:4000';
const supabase = origin(process.env.NEXT_PUBLIC_SUPABASE_URL);

// Public pages are prerendered (static/ISR), so a per-request nonce isn't possible: Next's inline RSC payload scripts
// need 'unsafe-inline'. Everything else is locked to this site, the API, Supabase and the YouTube embed.
export const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'", // next/image and Radix set style attributes
  `img-src 'self' data: blob: https://i.ytimg.com ${supabase}`.trim(),
  "font-src 'self'",
  `connect-src 'self' ${api} ${supabase}`.trim(),
  'frame-src https://www.youtube-nocookie.com',
  "media-src 'self'",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: contentSecurityPolicy },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  // Browsers ignore HSTS over plain http, so local production builds are unaffected.
  ...(dev ? [] : [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' }]),
];

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ['@greenscape/auth', '@greenscape/ui', '@greenscape/validation'],
  images: {
    formats: ['image/avif', 'image/webp'],
    // The optimiser refuses private addresses (SSRF guard). Only lifted when Supabase itself is local (dev/CI), never in production.
    dangerouslyAllowLocalIP: (() => {
      try {
        return ['127.0.0.1', 'localhost'].includes(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').hostname);
      } catch {
        return false;
      }
    })(),
    // Old Firebase photos: content no longer uses them once `pnpm media:migrate --apply` has run on that environment
    // (`pnpm assets:check` proves it). Remove this entry after the production migration.
    remotePatterns: [
      { protocol: 'https', hostname: 'firebasestorage.googleapis.com', pathname: '/v0/b/greenscape-palawan.firebasestorage.app/**' },
      // CMS media library (Supabase Storage public bucket), from the configured project URL.
      ...(() => {
        try {
          const u = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321');
          return [{ protocol: u.protocol.replace(':', '') as 'http' | 'https', hostname: u.hostname, port: u.port, pathname: '/storage/v1/object/public/**' }];
        } catch {
          return [];
        }
      })(),
    ],
  },
  async redirects() {
    return legacyRedirects;
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default config;
