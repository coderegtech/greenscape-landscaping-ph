// Lighthouse (mobile, simulated throttling) against a running build. Each page is visited once first so the
// image optimiser's first-request resize isn't measured. Writes docs/lighthouse/<label>.json and prints a table.
// Usage: node scripts/lighthouse.mjs <label> [baseUrl]
import fs from 'node:fs';
import path from 'node:path';
import * as chromeLauncher from '../scripts/audit/node_modules/chrome-launcher/dist/index.js';
import lighthouse from '../scripts/audit/node_modules/lighthouse/core/index.js';

const [label = 'current', base = 'http://localhost:3000'] = process.argv.slice(2);
const PAGES = ['/', '/services/garden-maintenance', '/projects/sustainable-landscaping-in-action', '/stories/a-new-digital-home-greenscape-unveils-official-website', '/quote'];
const out = path.resolve(import.meta.dirname, '../docs/lighthouse');
fs.mkdirSync(out, { recursive: true });

for (const p of PAGES) await fetch(base + p).then((r) => r.text()); // warm ISR + data cache
const chrome = await chromeLauncher.launch({ chromeFlags: ['--headless=new'] });
const rows = [];
for (const p of PAGES) {
  await lighthouse(base + p, { port: chrome.port, output: 'json', logLevel: 'error' }); // warm images
  const { lhr } = await lighthouse(base + p, { port: chrome.port, output: 'json', logLevel: 'error' });
  const a = lhr.audits;
  const s = Object.fromEntries(Object.entries(lhr.categories).map(([k, v]) => [k, Math.round(v.score * 100)]));
  rows.push({ page: p, ...s, lcp: a['largest-contentful-paint'].displayValue, cls: a['cumulative-layout-shift'].displayValue, tbt: a['total-blocking-time'].displayValue, weight: a['total-byte-weight'].displayValue, failing: Object.values(lhr.categories).flatMap((c) => c.auditRefs.filter((r) => r.weight > 0 && a[r.id].score !== null && a[r.id].score < 0.9).map((r) => a[r.id].title)) });
  console.log(p.padEnd(72), JSON.stringify(s));
}
await chrome.kill();
fs.writeFileSync(path.join(out, `${label}.json`), JSON.stringify({ ranAt: new Date().toISOString(), base, rows }, null, 2));
