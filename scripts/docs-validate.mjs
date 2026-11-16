// Documentation checks (`pnpm docs:validate`, also in CI): relative links and images in every Markdown file resolve,
// screenshots in the manifest exist at the capture sizes, docs/video/scenes.json matches its JSON schema and only
// claims assets that exist, and no secret-shaped string or non-synthetic email address is in the docs.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';

// zod is a dependency of the validation package, not of the repo root (pnpm keeps them apart).
const { z } = createRequire(resolve('packages/validation/package.json'))('zod');

const errors = [];
const fail = (m) => errors.push(m);
const walk = (dir) => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? (['raw', 'node_modules'].includes(n) ? [] : walk(p)) : [p];
});
const mdFiles = ['README.md', ...walk('docs').filter((f) => f.endsWith('.md'))];

// 1. Links and images.
const anchorsOf = new Map();
const slug = (h) => h.trim().toLowerCase().replace(/<[^>]+>/g, '').replace(/[^\w\s-]/g, '').replace(/\s/g, '-');
const anchors = (file) => {
  if (!anchorsOf.has(file)) {
    const text = readFileSync(file, 'utf8');
    anchorsOf.set(file, new Set([...text.matchAll(/^#{1,6} (.+)$/gm)].map((m) => slug(m[1])).concat([...text.matchAll(/<a id="([^"]+)"/g)].map((m) => m[1]))));
  }
  return anchorsOf.get(file);
};
for (const file of mdFiles) {
  const text = readFileSync(file, 'utf8').replace(/```[\s\S]*?```/g, ''); // links inside code blocks are examples
  for (const [, target] of text.matchAll(/!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    if (/^(https?:|mailto:|#terminal|tel:)/.test(target)) continue;
    const [path, hash] = target.split('#');
    const abs = path ? join(dirname(file), decodeURIComponent(path)) : file;
    if (!existsSync(abs)) { fail(`${file}: broken link ${target}`); continue; }
    if (hash && abs.endsWith('.md') && !anchors(abs).has(hash)) fail(`${file}: missing anchor ${target}`);
  }
}

// 2. Screenshots: files exist, PNG sizes match the capture viewports.
const png = (f) => { const b = readFileSync(f); return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) }; };
const SIZES = { desktop: [1440, 900], mobile: [390, 844], tablet: [768, 1024], fullhd: [1920, 1080] };
const manifestPath = 'docs/assets/screenshots/manifest.json';
const shots = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')).shots : [];
for (const s of shots) for (const f of s.files) {
  if (!existsSync(f)) { fail(`manifest: missing ${f}`); continue; }
  const kind = f.match(/-(desktop|mobile|tablet|fullhd|fullpage)\.png$/)?.[1];
  const { w, h } = png(f);
  if (kind === 'fullpage' ? w !== 1440 : SIZES[kind] && (w !== SIZES[kind][0] || h !== SIZES[kind][1])) fail(`${f}: ${w}×${h}, expected ${kind}`);
}

// 3. Video manifest against its schema; claimed assets must exist.
const scenesPath = 'docs/video/scenes.json';
if (existsSync(scenesPath)) {
  const schema = z.fromJSONSchema(JSON.parse(readFileSync('docs/video/scenes.schema.json', 'utf8')));
  const data = JSON.parse(readFileSync(scenesPath, 'utf8'));
  const r = schema.safeParse(data);
  if (!r.success) for (const i of r.error.issues) fail(`scenes.json: ${i.path.join('.')} ${i.message}`);
  const ids = new Set((data.scenes ?? []).map((s) => s.id));
  if (ids.size !== (data.scenes ?? []).length) fail('scenes.json: duplicate scene ids');
  for (const s of data.scenes ?? []) {
    for (const k of ['screenshot', 'recording', 'audio']) if (s[k] && !existsSync(s[k])) fail(`scenes.json ${s.id}: ${k} ${s[k]} does not exist`);
    if (['recorded', 'final'].includes(s.status) && !s.recording) fail(`scenes.json ${s.id}: status ${s.status} without a recording`);
    if (s.status === 'final' && !s.audio) fail(`scenes.json ${s.id}: final without audio`);
    if (s.status === 'blocked' && !s.blockedReason) fail(`scenes.json ${s.id}: blocked without a reason`);
  }
  for (const p of data.presentations ?? []) {
    if (p.export && !existsSync(p.export)) fail(`scenes.json ${p.id}: export ${p.export} does not exist`);
    if (p.status === 'published' && !p.url) fail(`scenes.json ${p.id}: published without a url`);
    for (const id of p.sceneIds ?? []) {
      if (!ids.has(id)) fail(`scenes.json ${p.id}: unknown scene ${id}`);
      else if (data.scenes.find((s) => s.id === id).status === 'blocked') fail(`scenes.json ${p.id}: uses blocked scene ${id}`);
    }
  }
}

// 4. Secrets and personal data in the docs.
const SECRET = /sk_live_[\w]{8,}|sk_test_[\w]{16,}|whsec_[\w]{16,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|eyJ[\w-]{20,}\.eyJ[\w-]{20,}\.[\w-]{10,}|xi-api-key:\s*\w{16,}/;
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const SAFE_EMAIL = /@([\w-]+\.)*(local|example\.(com|org)|anthropic\.com)$|^greenscapepalawan@gmail\.com$/i; // the business's public address
for (const file of [...mdFiles, scenesPath, 'docs/video/shot-list.csv'].filter(existsSync)) {
  const text = readFileSync(file, 'utf8');
  if (SECRET.test(text)) fail(`${file}: secret-shaped string`);
  for (const [m] of text.matchAll(EMAIL)) if (!SAFE_EMAIL.test(m) && !/\.(png|jpe?g|svg|webp)$/i.test(m) && !m.includes('@greenscape/')) fail(`${file}: non-synthetic email address`);
}

for (const e of errors) console.error(`✗ ${e}`);
console.log(`${mdFiles.length} Markdown files, ${shots.reduce((n, s) => n + s.files.length, 0)} screenshots checked: ${errors.length ? `${errors.length} problem(s)` : 'all good'}`);
process.exit(errors.length ? 1 : 0);
