// Greenscape brand assets from one geometry: logo SVGs (packages/branding) and the Admin/Employee app icons (PNG).
// Run after changing the artwork: node scripts/brand-assets.mjs
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = path.join(import.meta.dirname, '..');
// "Greenscape" (Manrope 700) and "LANDSCAPING PH" (Manrope 500) as outlines at 100px, so no font is needed to render.
const wordmark = JSON.parse(await readFile(path.join(root, 'packages/branding/wordmark.json'), 'utf8'));

export const COLOR = { botanical: '#315C3B', forest: '#193C2B', sage: '#8CA68A', lime: '#C9E64A', white: '#FFFFFF', soft: '#F8FAF7', fresh: '#368A5B' };

const n = (v) => +v.toFixed(2);
const at = (deg, r, cx = 256, cy = 256) => [n(cx + r * Math.cos((deg * Math.PI) / 180)), n(cy + r * Math.sin((deg * Math.PI) / 180))];

/** A leaf standing on the origin, tip at (0, -L), with the midrib cut out (even-odd). */
function leaf(L, W, rib = L * 0.075) {
  const h = rib / 2;
  const blade = `M0 0C${n(-W)} ${n(-L * 0.28)} ${n(-W * 0.86)} ${n(-L * 0.76)} 0 ${n(-L)}C${n(W * 0.86)} ${n(-L * 0.76)} ${n(W)} ${n(-L * 0.28)} 0 0Z`;
  const slot = `M${n(-h)} ${n(-L * 0.16)}L${n(-h)} ${n(-L * 0.6)}A${n(h)} ${n(h)} 0 0 1 ${n(h)} ${n(-L * 0.6)}L${n(h)} ${n(-L * 0.16)}A${n(h)} ${n(h)} 0 0 1 ${n(-h)} ${n(-L * 0.16)}Z`;
  return blade + slot;
}
const leafAt = (x, y, deg, L, W, fill) => `<path fill="${fill}" fill-rule="evenodd" transform="translate(${x} ${y}) rotate(${deg})" d="${leaf(L, W)}"/>`;

/** The brand mark: a G drawn as an open ring, with a leaf growing out of its bar. Lives in a 512 box. */
function mark(ring, leafFill) {
  const r = 164, sw = 54;
  const [sx, sy] = at(-72, r), [ex, ey] = at(0, r);
  return `<path fill="none" stroke="${ring}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" d="M${sx} ${sy}A${r} ${r} 0 1 0 ${ex} ${ey}L286 256"/>`
    + leafAt(274, 244, 40, 226, 70, leafFill);
}

/** Admin emblem: the leaf inside a gear (management). */
function adminEmblem(line, leafFill) {
  const r = 146, sw = 30;
  const teeth = Array.from({ length: 8 }, (_, i) => `<rect x="-21" y="${-(r + sw / 2 + 22)}" width="42" height="34" rx="9" transform="rotate(${i * 45 + 22.5})"/>`).join('');
  return `<g fill="${line}" transform="translate(256 256)">${teeth}</g><circle cx="256" cy="256" r="${r}" fill="none" stroke="${line}" stroke-width="${sw}"/>`
    + leafAt(206, 322, 37, 172, 60, leafFill);
}

/** Employee emblem: the leaf as the hand of a clock (attendance). */
function employeeEmblem(line, leafFill) {
  const r = 158, sw = 30;
  const ticks = [0, 90, 180, 270].map((a) => { const [x1, y1] = at(a, r - 30), [x2, y2] = at(a, r - 52); return `M${x1} ${y1}L${x2} ${y2}`; }).join('');
  return `<circle cx="256" cy="256" r="${r}" fill="none" stroke="${line}" stroke-width="${sw}"/>`
    + `<path d="${ticks}" stroke="${line}" stroke-width="14" stroke-linecap="round" opacity=".75"/>`
    + `<path d="M256 256L256 168" stroke="${line}" stroke-width="24" stroke-linecap="round"/>`
    + leafAt(256, 256, 60, 134, 52, leafFill)
    + `<circle cx="256" cy="256" r="17" fill="${line}"/>`;
}

const svg = (w, h, body, box = `0 0 ${w} ${h}`) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box}" width="${w}" height="${h}">${body}</svg>\n`;

const APPS = {
  admin: { from: '#255039', to: COLOR.forest, emblem: adminEmblem },
  employee: { from: '#41996A', to: '#2C7A4E', emblem: employeeEmblem },
};
/** App icon. `corner`: radius of the tile (0 = full bleed, for maskable and Apple). `scale`: emblem size inside it. */
function appIcon(app, corner, scale) {
  const a = APPS[app];
  return svg(512, 512,
    `<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a.from}"/><stop offset="1" stop-color="${a.to}"/></linearGradient></defs>`
    + `<rect width="512" height="512" rx="${corner}" fill="url(#bg)"/>`
    + `<g transform="translate(256 256) scale(${scale}) translate(-256 -256)">${a.emblem(COLOR.white, COLOR.lime)}</g>`);
}

const MARK_BOX = '52 52 408 408'; // the mark without the 512 box's padding
const text = (key, x, baseline, size, fill) => `<path fill="${fill}" transform="translate(${x} ${baseline}) scale(${size / 100})" d="${wordmark[key].d}"/>`;
const width = (key, size) => (wordmark[key].w * size) / 100;

function horizontal(ring, leafFill, name, tag) {
  return svg(506, 112, `<svg x="0" y="0" width="112" height="112" viewBox="${MARK_BOX}">${mark(ring, leafFill)}</svg>${text('name', 138, 66, 64, name)}${text('tag', 139, 98, 19, tag)}`);
}
function stacked(ring, leafFill, name, tag) {
  const w = 360, c = (key, size) => n((w - width(key, size)) / 2);
  return svg(w, 290, `<svg x="100" y="0" width="160" height="160" viewBox="${MARK_BOX}">${mark(ring, leafFill)}</svg>${text('name', c('name', 58), 232, 58, name)}${text('tag', c('tag', 18), 268, 18, tag)}`);
}

const light = [COLOR.botanical, COLOR.sage, COLOR.forest, COLOR.botanical];
const dark = [COLOR.white, COLOR.lime, COLOR.white, COLOR.lime];
const mono = ['currentColor', 'currentColor', 'currentColor', 'currentColor'];

export const files = {
  'packages/branding/logos/greenscape-mark.svg': svg(512, 512, mark(light[0], light[1]), MARK_BOX),
  'packages/branding/logos/greenscape-mark-dark.svg': svg(512, 512, mark(dark[0], dark[1]), MARK_BOX),
  'packages/branding/logos/greenscape-mark-mono.svg': svg(512, 512, mark(mono[0], mono[1]), MARK_BOX),
  'packages/branding/logos/greenscape-horizontal.svg': horizontal(...light),
  'packages/branding/logos/greenscape-horizontal-dark.svg': horizontal(...dark),
  'packages/branding/logos/greenscape-horizontal-mono.svg': horizontal(...mono),
  'packages/branding/logos/greenscape-stacked.svg': stacked(...light),
  'packages/branding/logos/greenscape-stacked-dark.svg': stacked(...dark),
  'packages/branding/logos/greenscape-stacked-mono.svg': stacked(...mono),
};
for (const app of Object.keys(APPS)) {
  files[`packages/branding/icons/${app}.svg`] = appIcon(app, 116, 1); // vector master
  files[`packages/branding/icons/${app}-maskable.svg`] = appIcon(app, 0, 0.8); // emblem inside the 80% safe circle
  files[`packages/branding/icons/${app}-apple.svg`] = appIcon(app, 0, 0.92); // iOS rounds the corners itself
}
// Android status-bar badge: only the alpha channel is used, so white on transparent.
files['packages/branding/icons/badge.svg'] = svg(512, 512, mark(COLOR.white, COLOR.white), MARK_BOX);

const png = (file, size) => sharp(Buffer.from(files[file]), { density: 300 }).resize(size, size).png({ compressionLevel: 9 }).toBuffer();
/** [output, source svg, size] */
export const rasters = Object.keys(APPS).flatMap((app) => {
  const i = (kind) => `packages/branding/icons/${app}${kind}.svg`;
  return [
    [`apps/${app}/public/icons/${app}-192.png`, i(''), 192],
    [`apps/${app}/public/icons/${app}-512.png`, i(''), 512],
    [`apps/${app}/public/icons/${app}-maskable-512.png`, i('-maskable'), 512],
    [`apps/${app}/public/icons/badge-96.png`, 'packages/branding/icons/badge.svg', 96],
    [`apps/${app}/app/apple-icon.png`, i('-apple'), 180],
    [`apps/${app}/app/icon.png`, i(''), 32],
    [`packages/branding/icons/png/${app}-1024.png`, i(''), 1024],
  ];
});

if (process.argv[1] === import.meta.filename) {
  const write = async (file, data) => { const f = path.join(root, file); await mkdir(path.dirname(f), { recursive: true }); await writeFile(f, data); };
  for (const [file, data] of Object.entries(files)) await write(file, data);
  for (const [out, src, size] of rasters) await write(out, await png(src, size));
  // A contact sheet to review the set at a glance (docs/branding/preview.png).
  const tile = (file, x, y, w, h, bg) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${bg}"/><image x="${x + 20}" y="${y + 20}" width="${w - 40}" height="${h - 40}" href="data:image/svg+xml;base64,${Buffer.from(files[file].replaceAll('currentColor', COLOR.forest)).toString('base64')}"/>`;
  const L = 'packages/branding/logos/greenscape-', I = 'packages/branding/icons/';
  const round = (file, x, y, s) => `<clipPath id="c${x}"><circle cx="${x + s / 2}" cy="${y + s / 2}" r="${s / 2}"/></clipPath><image clip-path="url(#c${x})" x="${x}" y="${y}" width="${s}" height="${s}" href="data:image/svg+xml;base64,${Buffer.from(files[file]).toString('base64')}"/>`;
  const sheet = svg(1200, 900, `<rect width="1200" height="900" fill="#E9EEE8"/>`
    + tile(`${L}horizontal.svg`, 0, 0, 600, 180, COLOR.soft) + tile(`${L}horizontal-dark.svg`, 600, 0, 600, 180, COLOR.forest)
    + tile(`${L}stacked.svg`, 0, 180, 300, 280, COLOR.white) + tile(`${L}stacked-dark.svg`, 300, 180, 300, 280, COLOR.botanical)
    + tile(`${L}stacked-mono.svg`, 600, 180, 300, 280, COLOR.white) + tile(`${L}mark.svg`, 900, 180, 150, 140, COLOR.soft) + tile(`${L}mark-dark.svg`, 1050, 180, 150, 140, COLOR.forest)
    + tile(`${L}mark-mono.svg`, 900, 320, 150, 140, COLOR.white) + tile(`${I}badge.svg`, 1050, 320, 150, 140, '#555')
    + tile(`${I}admin.svg`, 0, 460, 300, 300, '#E9EEE8') + tile(`${I}employee.svg`, 300, 460, 300, 300, '#E9EEE8')
    + round(`${I}admin-maskable.svg`, 640, 500, 220) + round(`${I}employee-maskable.svg`, 920, 500, 220)
    + [192, 96, 48, 32].map((s, k) => `<image x="${40 + [0, 210, 320, 380][k]}" y="${780}" width="${s / 2}" height="${s / 2}" href="data:image/svg+xml;base64,${Buffer.from(files[`${I}admin.svg`]).toString('base64')}"/><image x="${640 + [0, 210, 320, 380][k]}" y="780" width="${s / 2}" height="${s / 2}" href="data:image/svg+xml;base64,${Buffer.from(files[`${I}employee.svg`]).toString('base64')}"/>`).join(''));
  await write('docs/branding/preview.png', await sharp(Buffer.from(sheet), { density: 144 }).png().toBuffer());
  console.log(`${Object.keys(files).length} SVG, ${rasters.length} PNG written`);
}
