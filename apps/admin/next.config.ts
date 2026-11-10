import path from 'node:path';
import type { NextConfig } from 'next';

// One .env at the monorepo root; real deployments inject env vars instead.
try { process.loadEnvFile('../../.env'); } catch { /* no root .env */ }

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  // Browsers ignore HSTS over plain http, so local production builds are unaffected.
  ...(process.env.NODE_ENV === 'production' ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' }] : []),
];

const config: NextConfig = {
  // Container images (docker/*.Dockerfile) build a self-contained server; local `next start` keeps the default.
  ...(process.env.NEXT_OUTPUT === 'standalone' ? { output: 'standalone' as const, outputFileTracingRoot: path.join(process.cwd(), '../..') } : {}),
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ['@greenscape/auth', '@greenscape/ui', '@greenscape/validation'],
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default config;
