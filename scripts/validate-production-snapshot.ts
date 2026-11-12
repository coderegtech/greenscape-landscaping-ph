// Checks a generated production snapshot (docs/deployment/production-branch.md): only manifest-approved files, no
// symlinks, no secrets, the required paths, intact workspace dependencies and complete Docker build contexts.
// Node built-ins only, so it runs without an install:
//   node scripts/validate-production-snapshot.ts <snapshot dir>
import fs from 'node:fs';
import path from 'node:path';

export type Manifest = { include: string[]; exclude: string[]; required: string[] };
export const METADATA_FILE = 'PRODUCTION.json';

/** `**` crosses folders, `*` stays inside one; dotfiles match like any other name. */
export function globToRegExp(glob: string): RegExp {
  const body = glob
    .split(/(\*\*\/|\*\*|\*)/)
    .map((part) => (part === '**/' ? '(?:.*/)?' : part === '**' ? '.*' : part === '*' ? '[^/]*' : part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')))
    .join('');
  return new RegExp(`^${body}$`);
}

/** Patterns are repository-relative POSIX paths; anything that could point outside the repository is refused. */
export function parseManifest(json: string): Manifest {
  const m = JSON.parse(json) as Manifest;
  for (const key of ['include', 'exclude', 'required'] as const) {
    if (!Array.isArray(m[key]) || m[key].some((p) => typeof p !== 'string' || !p)) throw new Error(`manifest.${key} must be a list of paths`);
    for (const p of m[key]) {
      if (p.startsWith('/') || p.includes('\\') || /^[A-Za-z]:/.test(p) || p.split('/').includes('..')) throw new Error(`manifest.${key}: "${p}" escapes the repository root`);
    }
  }
  return m;
}

export function matcher(manifest: Manifest): (file: string) => boolean {
  const inc = manifest.include.map(globToRegExp);
  const exc = manifest.exclude.map(globToRegExp);
  return (file) => inc.some((r) => r.test(file)) && !exc.some((r) => r.test(file));
}

// File names that must never ship, whatever the manifest says (.env.example and docker/prod.env.example are templates).
const FORBIDDEN_NAME = /(^|\/)(\.env(\.(?!example$)[^/]*)?|id_(rsa|dsa|ecdsa|ed25519)|signing_keys\.json)$|\.(pem|key|p12|pfx|jks)$/;
// High-signal credential shapes only; CI also runs Gitleaks over the snapshot with the full rule set.
const SECRET_PATTERNS: [string, RegExp][] = [
  ['private key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['Stripe key', /\b[sr]k_(live|test)_[0-9A-Za-z]{24,}/],
  ['Stripe webhook secret', /\bwhsec_[0-9A-Za-z]{24,}/],
  ['Supabase secret key', /\bsb_secret_[0-9A-Za-z_-]{20,}/],
  ['JWT (service-role or session token)', /\beyJ[0-9A-Za-z_-]{16,}\.eyJ[0-9A-Za-z_-]{16,}\.[0-9A-Za-z_-]{16,}/],
  ['Anthropic API key', /\bsk-ant-[0-9A-Za-z_-]{20,}/],
  ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/],
];

function walk(dir: string, rel = ''): { file: string; symlink: boolean }[] {
  return fs.readdirSync(path.join(dir, rel), { withFileTypes: true }).flatMap((e) => {
    const file = rel ? `${rel}/${e.name}` : e.name;
    if (file === '.git') return [];
    if (e.isSymbolicLink()) return [{ file, symlink: true }];
    return e.isDirectory() ? walk(dir, file) : [{ file, symlink: false }];
  });
}

/** Returns the list of problems; empty means the snapshot is fit to publish. */
export function validateSnapshot(dir: string, manifest: Manifest): string[] {
  const problems: string[] = [];
  const allowed = matcher(manifest);
  const exists = (p: string) => fs.existsSync(path.join(dir, p));
  const entries = walk(dir);

  for (const { file, symlink } of entries) {
    if (symlink) { problems.push(`${file}: symbolic link`); continue; }
    if (file !== METADATA_FILE && !allowed(file)) problems.push(`${file}: not permitted by the manifest`);
    if (FORBIDDEN_NAME.test(file)) problems.push(`${file}: forbidden file name (credentials)`);
    const abs = path.join(dir, file);
    if (fs.statSync(abs).size > 2_000_000) continue; // images and other large binaries
    const text = fs.readFileSync(abs, 'latin1');
    for (const [label, re] of SECRET_PATTERNS) if (re.test(text)) problems.push(`${file}: looks like a ${label}`);
  }

  for (const p of manifest.required) if (!exists(p)) problems.push(`${p}: required path is missing`);

  try {
    const meta = JSON.parse(fs.readFileSync(path.join(dir, METADATA_FILE), 'utf8'));
    if (!/^[0-9a-f]{40}$/.test(meta.sourceCommit)) problems.push(`${METADATA_FILE}: sourceCommit is not a full commit SHA`);
  } catch {
    problems.push(`${METADATA_FILE}: missing or not JSON`);
  }

  // Workspace: every `workspace:` dependency must resolve to a package that is in the snapshot.
  const manifests = entries.map((e) => e.file).filter((f) => /^(package\.json|(apps|packages)\/[^/]+\/package\.json)$/.test(f));
  const pkgs = manifests.flatMap((f) => {
    try { return [{ f, json: JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) }]; } catch { problems.push(`${f}: not valid JSON`); return []; }
  });
  const names = new Set(pkgs.map((p) => p.json.name));
  for (const { f, json } of pkgs) {
    for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
      for (const [dep, range] of Object.entries<string>(json[field] ?? {})) {
        if (range.startsWith('workspace:') && !names.has(dep)) problems.push(`${f}: workspace dependency ${dep} is not in the snapshot`);
      }
    }
  }

  // Docker: files a Dockerfile copies from the build context (the repository root) and files compose bind-mounts.
  for (const { file } of entries) {
    if (/(^|\/|\.)Dockerfile$/.test(file)) {
      for (const line of fs.readFileSync(path.join(dir, file), 'utf8').split('\n')) {
        const args = line.trim().split(/\s+/);
        if (args[0] !== 'COPY' || args.some((a) => a.startsWith('--from='))) continue;
        for (const src of args.slice(1, -1).filter((a) => !a.startsWith('--') && a !== '.' && !/[$*?]/.test(a))) {
          if (!exists(src)) problems.push(`${file}: COPY source ${src} is not in the snapshot`);
        }
      }
    }
    if (/(^|\/)compose[^/]*\.ya?ml$/.test(file)) {
      for (const [, src = ''] of fs.readFileSync(path.join(dir, file), 'utf8').matchAll(/^\s*-\s+(\.\.?\/[^:\s]+):/gm)) {
        if (!exists(path.posix.join(path.posix.dirname(file), src))) problems.push(`${file}: mounted file ${src} is not in the snapshot`);
      }
    }
  }
  return problems;
}

if (import.meta.main) {
  const dir = process.argv[2];
  if (!dir) throw new Error('usage: node scripts/validate-production-snapshot.ts <snapshot dir>');
  const manifest = parseManifest(fs.readFileSync(path.join(import.meta.dirname, '../config/production-files.json'), 'utf8'));
  const problems = validateSnapshot(path.resolve(dir), manifest);
  if (problems.length) {
    console.error(`production snapshot is NOT valid (${problems.length} problems):\n${problems.map((p) => `  - ${p}`).join('\n')}`);
    process.exit(1);
  }
  console.log('production snapshot is valid');
}
