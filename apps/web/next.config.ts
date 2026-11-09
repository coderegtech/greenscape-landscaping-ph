import type { NextConfig } from 'next';
import { legacyRedirects } from './lib/legacy-redirects';

// One .env at the monorepo root; real deployments inject env vars instead.
try { process.loadEnvFile('../../.env'); } catch { /* no root .env */ }

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ['@greenscape/auth', '@greenscape/ui', '@greenscape/validation'],
  images: {
    formats: ['image/avif', 'image/webp'],
    // Current site's public photos until migration moves them to Supabase Storage (Phase 11).
    remotePatterns: [
      { protocol: 'https', hostname: 'firebasestorage.googleapis.com', pathname: '/v0/b/greenscape-palawan.firebasestorage.app/**' },
      { protocol: 'http', hostname: '127.0.0.1', port: '54321', pathname: '/storage/v1/object/public/**' },
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
