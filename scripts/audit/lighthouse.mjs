// Lighthouse baseline (mobile + desktop) for representative pages. Blocks the site's visitor tracker + GA.
// Usage: node lighthouse.mjs  -> docs/audit/raw/lighthouse.json
import lighthouse from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';
import fs from 'node:fs';
import path from 'node:path';

const B = 'https://greenscapelandscapingph.com';
const PAGES = ['/', '/pages/services/landscaping/', '/pages/services/products/', '/pages/gallery.html', '/pages/our-story/', '/pages/get-a-quote/', '/pages/contact/'];
const OUT = path.resolve(import.meta.dirname, '../../docs/audit/raw/lighthouse.json');
const chrome = await chromeLauncher.launch({ chromeFlags: ['--headless=new'] });
const results = [];
for (const p of PAGES) {
  for (const preset of ['mobile', 'desktop']) {
    const flags = { port: chrome.port, output: 'json', logLevel: 'error', blockedUrlPatterns: ['*visitor-tracker*', '*google-analytics.com*', '*googletagmanager.com*'] };
    const config = preset === 'desktop' ? (await import('lighthouse/core/config/desktop-config.js')).default : undefined;
    try {
      const { lhr } = await lighthouse(B + p, flags, config);
      const a = lhr.audits;
      const fails = (cat) => lhr.categories[cat].auditRefs.filter((r) => r.weight > 0 && a[r.id].score !== null && a[r.id].score < 0.9).map((r) => a[r.id].title);
      results.push({
        url: p, preset,
        scores: Object.fromEntries(Object.entries(lhr.categories).map(([k, v]) => [k, Math.round(v.score * 100)])),
        lcp: a['largest-contentful-paint'].displayValue, fcp: a['first-contentful-paint'].displayValue, tbt: a['total-blocking-time'].displayValue,
        cls: a['cumulative-layout-shift'].displayValue, si: a['speed-index'].displayValue, weight: a['total-byte-weight'].displayValue,
        opportunities: Object.values(a).filter((x) => x.details?.type === 'opportunity' && x.score !== null && x.score < 0.9).map((x) => `${x.title}${x.displayValue ? ' — ' + x.displayValue : ''}`),
        failingA11y: fails('accessibility'), failingSeo: fails('seo'), failingBestPractices: fails('best-practices'),
      });
      console.log(p, preset, results.at(-1).scores);
    } catch (e) { results.push({ url: p, preset, error: e.message }); console.log(p, preset, 'ERR', e.message); }
  }
}
await chrome.kill();
fs.writeFileSync(OUT, JSON.stringify({ ranAt: new Date().toISOString(), results }, null, 2));
