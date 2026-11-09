// Read-only extraction of the CURRENT site's public content (decision D3 default: public content only).
// Loads each page like a visitor, blocks the site's own analytics and every Firestore write, and records
// the rendered main content as an ordered list of blocks. Output: scripts/migrate/data/public-content.json
// Usage: node scripts/migrate/scrape-public.mjs
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const ORIGIN = 'https://greenscapelandscapingph.com';
const OUT = path.resolve(import.meta.dirname, 'data/public-content.json');
const crawl = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../../docs/audit/raw/crawl.json'), 'utf8'));
const urls = crawl.pages.map((p) => p.desktop.url).filter((u) => !u.includes('/admin/') && !/products(\/|$|\?)/.test(u) && !u.endsWith('/pages/'));

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.route(/visitor-tracker\.js|google-analytics\.com|googletagmanager\.com|Firestore\/Write\/channel/, (r) => r.abort());

const pages = [];
for (const url of urls) {
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: 'load', timeout: 60_000 });
  await page.waitForTimeout(3500); // content arrives from Firestore after load
  await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 800) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 100)); } });
  await page.waitForTimeout(800);
  const data = await page.evaluate(() => {
    const skip = (el) => el.closest('header, footer, nav, .navbar, .mobile-bottom-nav, .bottom-nav, [class*="messag"], [class*="chat"], [class*="modal"], .loading-screen, #loading, script, style');
    const txt = (el) => (el.innerText || el.textContent || '').trim().replace(/\s+\n/g, '\n').replace(/[ \t]+/g, ' ');
    const blocks = [];
    const seen = new Set();
    for (const el of document.body.querySelectorAll('h1,h2,h3,h4,p,li,blockquote,img,iframe,figcaption,time,.date,.author,.rating,[class*="star"]')) {
      if (skip(el)) continue;
      if (el.tagName === 'IMG') {
        const src = el.currentSrc || el.src;
        if (!src || src.startsWith('data:') || seen.has(src) || /logo|favicon|icon/i.test(src)) continue;
        seen.add(src);
        blocks.push({ t: 'img', src, alt: el.getAttribute('alt') || '', w: el.naturalWidth, h: el.naturalHeight, cls: el.className?.toString().slice(0, 60) });
      } else if (el.tagName === 'IFRAME') {
        blocks.push({ t: 'iframe', src: el.src });
      } else {
        if (el.tagName === 'P' && el.closest('li')) continue;
        const v = txt(el);
        if (!v || v.length > 6000) continue;
        const key = el.tagName + v;
        if (seen.has(key)) continue;
        seen.add(key);
        blocks.push({ t: el.tagName.toLowerCase(), v, cls: el.className?.toString().slice(0, 60) || undefined });
      }
    }
    return { title: document.title, description: document.querySelector('meta[name=description]')?.content ?? null, blocks };
  });
  pages.push({ url: url.replace(ORIGIN, ''), ...data });
  console.log(`${data.blocks.length.toString().padStart(4)} blocks  ${url.replace(ORIGIN, '')}`);
  await page.close();
}
await browser.close();
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ scrapedAt: new Date().toISOString(), origin: ORIGIN, pages }, null, 2));
