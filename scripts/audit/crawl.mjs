// Read-only crawl of the live site. Never submits forms; blocks the site's own visitor tracker + GA
// so the audit doesn't pollute production analytics.
// Usage: node crawl.mjs [maxPages]   -> writes ../../docs/audit/raw/*.json and screenshots
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
import path from 'node:path';

const ORIGIN = 'https://greenscapelandscapingph.com';
const MAX = Number(process.argv[2] || 120);
const OUT = path.resolve(import.meta.dirname, '../../docs/audit');
const SHOTS = path.join(OUT, 'screenshots');
fs.mkdirSync(path.join(OUT, 'raw'), { recursive: true });
fs.mkdirSync(SHOTS, { recursive: true });

const VIEWPORTS = { desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } };
const STATIC = /\.(png|jpe?g|webp|gif|svg|avif|ico|css|js|woff2?|ttf|otf|mp4|webm)(\?|$)/i;

// Normalise: drop hash, treat /index.html and / as same, keep query (story ids, product categories).
function norm(u) {
  try {
    const url = new URL(u, ORIGIN);
    if (url.origin !== ORIGIN) return null;
    url.hash = '';
    url.pathname = url.pathname.replace(/\/index\.html$/, '/');
    if (STATIC.test(url.pathname) && !/\.html$/.test(url.pathname)) return null;
    return url.toString();
  } catch { return null; }
}
// Firebase cleanUrls serves /x.html and /x (and /dir/ and /dir) as the same page; crawl one, record the aliases.
const canon = (u) => { const url = new URL(u); url.pathname = url.pathname.replace(/\.html$/, '').replace(/\/$/, '') || '/'; return url.toString(); };
const aliases = {};
const slug = (u) => (new URL(u).pathname + new URL(u).search).replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'home';

const browser = await chromium.launch();
const results = [];
// Product detail is reached by a JS click handler (no <a href>), and the admin login page is unlinked, so seed them.
const queue = ['/', '/pages/services/products/product-detail?id=BvHTmJmXMrxWSk7XxUjz', '/admin/login.html', '/pages/services/products'].map((p) => norm(ORIGIN + p));
const seen = new Set(queue.map(canon));

async function visit(url, vpName) {
  const ctx = await browser.newContext({ viewport: VIEWPORTS[vpName], userAgent: undefined });
  // Story pages bump a view counter via Firestore Write/channel on load; block all client writes too.
  await ctx.route(/visitor-tracker\.js|google-analytics\.com|googletagmanager\.com|Firestore\/Write\/channel/, (r) => r.abort());
  const page = await ctx.newPage();
  const consoleMsgs = [], failed = [], apiCalls = [], badStatus = [];
  page.on('console', (m) => ['error', 'warning'].includes(m.type()) && consoleMsgs.push(`${m.type()}: ${m.text().slice(0, 300)}`));
  page.on('pageerror', (e) => consoleMsgs.push(`pageerror: ${e.message.slice(0, 300)}`));
  page.on('requestfailed', (r) => !/visitor-tracker|google-analytics|googletagmanager/.test(r.url()) && failed.push(`${r.failure()?.errorText} ${r.url()}`));
  page.on('response', (r) => {
    const u = r.url();
    if (r.status() >= 400) badStatus.push(`${r.status()} ${u}`);
    const t = r.request().resourceType();
    if (t === 'xhr' || t === 'fetch') apiCalls.push(`${r.request().method()} ${u.split('?')[0]} -> ${r.status()}`);
  });
  await page.addInitScript(() => {
    window.__lcp = 0; window.__cls = 0;
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
  });
  let status = 0, error = null;
  try {
    const resp = await page.goto(url, { waitUntil: 'load', timeout: 45000 });
    status = resp?.status() ?? 0;
    await page.waitForTimeout(3000); // Firestore content renders after load
    // scroll to trigger lazy images / reveal animations
    await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)); } window.scrollTo(0, 0); });
    await page.waitForTimeout(800);
  } catch (e) { error = e.message.slice(0, 300); }

  const data = error ? {} : await page.evaluate(() => {
    const txt = (el) => (el?.textContent || '').trim().replace(/\s+/g, ' ');
    const nav = performance.getEntriesByType('navigation')[0] || {};
    const res = performance.getEntriesByType('resource');
    const labelled = (el) => el.labels?.length || el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.title;
    return {
      title: document.title,
      lang: document.documentElement.lang,
      metaDescription: document.querySelector('meta[name=description]')?.content || null,
      canonical: document.querySelector('link[rel=canonical]')?.href || null,
      ogImage: document.querySelector('meta[property="og:image"]')?.content || null,
      viewportMeta: document.querySelector('meta[name=viewport]')?.content || null,
      headings: [...document.querySelectorAll('h1,h2,h3,h4')].map((h) => `${h.tagName}: ${txt(h).slice(0, 100)}`),
      links: [...document.querySelectorAll('a[href]')].map((a) => ({ text: txt(a).slice(0, 60) || a.getAttribute('aria-label') || '', href: a.href })),
      buttons: [...document.querySelectorAll('button,[role=button]')].map((b) => txt(b).slice(0, 40) || b.getAttribute('aria-label') || '(unnamed)'),
      forms: [...document.querySelectorAll('form')].map((f) => ({
        id: f.id, action: f.getAttribute('action'), method: f.method,
        fields: [...f.querySelectorAll('input,select,textarea')].filter((e) => e.type !== 'hidden').map((e) => ({
          tag: e.tagName.toLowerCase(), type: e.type, name: e.name || e.id, required: e.required, labelled: !!labelled(e), placeholder: e.placeholder || null,
          options: e.tagName === 'SELECT' ? [...e.options].map((o) => o.text).slice(0, 20) : undefined,
        })),
      })),
      images: [...document.images].map((i) => ({ src: i.currentSrc || i.src, alt: i.getAttribute('alt'), w: i.naturalWidth, h: i.naturalHeight, dw: i.width, loading: i.loading, complete: i.complete })),
      iframes: [...document.querySelectorAll('iframe')].map((f) => f.src),
      scripts: [...document.scripts].map((s) => s.src).filter(Boolean),
      stylesheets: [...document.querySelectorAll('link[rel=stylesheet]')].map((l) => l.href),
      dialogs: [...document.querySelectorAll('dialog,[role=dialog],.modal')].map((d) => d.id || d.className).slice(0, 20),
      timing: {
        ttfb: Math.round(nav.responseStart - nav.requestStart), dcl: Math.round(nav.domContentLoadedEventEnd), load: Math.round(nav.loadEventEnd),
        lcp: Math.round(window.__lcp), cls: +window.__cls.toFixed(3),
        requests: res.length, transferKB: Math.round(res.reduce((s, r) => s + (r.transferSize || 0), 0) / 1024),
        imageKB: Math.round(res.filter((r) => r.initiatorType === 'img' || /\.(png|jpe?g|webp|gif|avif)/i.test(r.name)).reduce((s, r) => s + (r.transferSize || r.encodedBodySize || 0), 0) / 1024),
        domNodes: document.getElementsByTagName('*').length,
      },
      docHeight: document.body.scrollHeight,
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
    };
  });

  let axe = null;
  if (!error && vpName === 'desktop') {
    try {
      const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
      axe = r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, count: v.nodes.length, sample: v.nodes[0]?.target?.join(' ') }));
    } catch (e) { axe = [{ id: 'axe-error', help: e.message.slice(0, 200) }]; }
  }

  const shot = `${slug(url)}--${vpName}.png`;
  if (!error) {
    // cap very long pages so screenshots stay reviewable
    const h = Math.min(data.docHeight || 4000, vpName === 'mobile' ? 9000 : 7000);
    await page.screenshot({ path: path.join(SHOTS, shot), clip: { x: 0, y: 0, width: VIEWPORTS[vpName].width, height: h }, fullPage: true }).catch(() => {});
  }
  await ctx.close();
  return { url, viewport: vpName, status, error, ...data, axe, console: consoleMsgs, failedRequests: failed, badStatus, apiCalls: [...new Set(apiCalls)], screenshot: error ? null : `screenshots/${shot}` };
}

while (queue.length && results.length < MAX) {
  const url = queue.shift();
  process.stdout.write(`[${results.length + 1}] ${url}\n`);
  const d = await visit(url, 'desktop');
  const m = await visit(url, 'mobile');
  results.push({ desktop: d, mobile: m });
  for (const l of d.links || []) {
    const n = norm(l.href);
    if (!n) continue;
    const c = canon(n);
    (aliases[c] ??= new Set()).add(n);
    if (!seen.has(c)) { seen.add(c); queue.push(n); }
  }
  save();
}
function save() {
  fs.writeFileSync(path.join(OUT, 'raw', 'crawl.json'), JSON.stringify({ crawledAt: new Date().toISOString(), origin: ORIGIN, pages: results, unvisited: queue,
    aliases: Object.fromEntries(Object.entries(aliases).map(([k, v]) => [k, [...v]]).filter(([, v]) => v.length > 1)) }, null, 2));
}
save();
console.log(`done: ${results.length} pages, ${queue.length} left in queue`);
await browser.close();
