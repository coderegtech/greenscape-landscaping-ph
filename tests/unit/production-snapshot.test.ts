import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { globToRegExp, matcher, parseManifest, validateSnapshot } from '../../scripts/validate-production-snapshot.ts';

const manifest = parseManifest(fs.readFileSync('config/production-files.json', 'utf8'));

describe('production snapshot manifest', () => {
  it('matches globs: ** crosses folders, * does not, dotfiles included', () => {
    expect(globToRegExp('apps/**').test('apps/web/app/page.tsx')).toBe(true);
    expect(globToRegExp('**/*.test.*').test('x.test.ts')).toBe(true);
    expect(globToRegExp('**/*.test.*').test('apps/api/src/x.test.ts')).toBe(true);
    expect(globToRegExp('docs/*').test('docs/audit/raw.md')).toBe(false);
    expect(globToRegExp('package.json').test('packageXjson')).toBe(false);
    expect(globToRegExp('**/.env').test('apps/web/.env')).toBe(true);
  });

  it('refuses patterns that leave the repository', () => {
    for (const bad of ['../secrets/**', '/etc/passwd', 'C:\\Users\\x', 'apps/../../x']) {
      expect(() => parseManifest(JSON.stringify({ include: [bad], exclude: [], required: [] }))).toThrow(/escapes/);
    }
  });

  it('selects what a build needs and nothing else', () => {
    const allowed = matcher(manifest);
    for (const f of ['pnpm-lock.yaml', 'apps/api/src/server.ts', 'packages/database/prisma/migrations/20261109121123_init/migration.sql', 'apps/web/Dockerfile', 'docker/compose.prod.yml', '.env.example', 'apps/web/postcss.config.mjs']) expect(allowed(f), f).toBe(true);
    for (const f of ['.env', 'apps/web/.env.local', 'apps/web/node_modules/x/index.js', 'apps/web/.next/server.js', 'tests/e2e/auth.spec.ts', 'docs/audit/report.md', '.github/workflows/ci.yml', 'docker/compose.dev.yml', 'supabase/signing_keys.json', 'packages/ui/src/button.test.tsx', 'apps/web/app/design/page.tsx']) expect(allowed(f), f).toBe(false);
  });

  it('reports secrets, stray files and missing required paths', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'snapshot-test-'));
    try {
      fs.mkdirSync(path.join(dir, 'apps/api'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'apps/api/.env'), 'X=1');
      fs.writeFileSync(path.join(dir, 'apps/api/key.ts'), `const k = '-----BEGIN RSA ${'PRIVATE'} KEY-----';`);
      fs.writeFileSync(path.join(dir, 'apps/api/package.json'), JSON.stringify({ name: '@greenscape/api', dependencies: { '@greenscape/gone': 'workspace:*' } }));
      fs.writeFileSync(path.join(dir, 'notes.txt'), 'draft');
      const problems = validateSnapshot(dir, manifest).join('\n');
      expect(problems).toMatch(/apps\/api\/\.env: forbidden file name/);
      expect(problems).toMatch(/apps\/api\/key\.ts: looks like a private key/);
      expect(problems).toMatch(/notes\.txt: not permitted/);
      expect(problems).toMatch(/workspace dependency @greenscape\/gone/);
      expect(problems).toMatch(/pnpm-lock\.yaml: required path is missing/);
      expect(problems).toMatch(/PRODUCTION\.json: missing/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
