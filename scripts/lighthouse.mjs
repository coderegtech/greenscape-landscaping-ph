// Lighthouse (mobile, simulated throttling) against a running build, median of 3 runs per page (LH_RUNS). Each page is visited once first so the
// image optimiser's first-request resize isn't measured. Writes docs/lighthouse/<label>.json and prints a table.
// Usage: node scripts/lighthouse.mjs <label> [baseUrl]
import fs from 'node:fs';
import path from 'node:path';
import * as chromeLauncher from '../scripts/audit/node_modules/chrome-launcher/dist/index.js';
import lighthouse from '../scripts/audit/node_modules/lighthouse/core/index.js';

const [label = 'current', base = 'http://localhost:3000', only] = process.argv.slice(2);
const PAGES = ['/', '/services/garden-maintenance', '/projects', '/projects/sustainable-landscaping-in-action', '/stories/a-new-digital-home-greenscape-unveils-official-website', '/shop', '/shop/golden-pothos', '/quote', '/contact'];
const out = path.resolve(import.meta.dirname, '../docs/lighthouse');
fs.mkdirSync(out, { recursive: true });

const pages = only ? only.split(',') : PAGES;
const RUNS = Number(process.env.LH_RUNS ?? 3);
for (const p of pages) await fetch(base + p).then((r) => r.text()); // warm ISR + data cache
const chrome = await chromeLauncher.launch({ chromeFlags: ['--headless=new'] });
const rows = [];
for (const p of pages) {
  await lighthouse(base + p, { port: chrome.port, output: 'json', logLevel: 'error' }); // warm images
  // Median of RUNS (by performance score): single runs swing by 10+ points on a busy machine.
  const runs = [];
  for (let i = 0; i < RUNS; i++) runs.push((await lighthouse(base + p, { port: chrome.port, output: 'json', logLevel: 'error' })).lhr);
  runs.sort((x, y) => x.categories.performance.score - y.categories.performance.score);
  const lhr = runs[Math.floor(runs.length / 2)];
  const spread = runs.map((r) => Math.round(r.categories.performance.score * 100)).join('/');
  const a = lhr.audits;
  const s = Object.fromEntries(Object.entries(lhr.categories).map(([k, v]) => [k, Math.round(v.score * 100)]));
  rows.push({ page: p, ...s, spread, lcp: a['largest-contentful-paint'].displayValue, cls: a['cumulative-layout-shift'].displayValue, tbt: a['total-blocking-time'].displayValue, weight: a['total-byte-weight'].displayValue, lcpElement: JSON.stringify(a['largest-contentful-paint-element']?.details?.items?.[0]?.items?.[0]?.node?.snippet ?? '').slice(0, 160), lcpPhases: (a['largest-contentful-paint-element']?.details?.items?.[1]?.items ?? a['lcp-breakdown-insight']?.details?.items ?? []).map((x) => `${x.phase ?? x.subpart ?? x.label}:${Math.round(x.timing ?? x.duration ?? 0)}ms`).join(' '), failing: Object.values(lhr.categories).flatMap((c) => c.auditRefs.filter((r) => r.weight > 0 && a[r.id].score !== null && a[r.id].score < 0.9).map((r) => a[r.id].title)) });
  console.log(p.padEnd(72), JSON.stringify(s), `perf runs ${spread}`);
}
await chrome.kill();
fs.writeFileSync(path.join(out, `${label}.json`), JSON.stringify({ ranAt: new Date().toISOString(), base, rows }, null, 2));
