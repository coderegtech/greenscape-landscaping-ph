// Full-page screenshots of public pages at the redesign's check widths (390, 768, 1024, 1440).
// Usage: node scripts/screenshots.mjs <outDir> [baseUrl] [paths,comma,separated] [widths,comma,separated]
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const [out = 'screenshots', base = 'http://localhost:3000', only, w] = process.argv.slice(2);
const pages = only ? only.split(',') : ['/', '/projects', '/gallery', '/services', '/stories', '/shop', '/about', '/contact'];
const widths = w ? w.split(',').map(Number) : [390, 768, 1024, 1440];
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
for (const width of widths) {
  const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
  for (const p of pages) {
    await page.goto(base + p, { waitUntil: 'networkidle' });
    const name = `${(p === '/' ? 'home' : p.slice(1).replace(/\//g, '_'))}-${width}.jpg`;
    await page.screenshot({ path: path.join(out, name), fullPage: true, quality: 70 });
  }
  await page.close();
}
await browser.close();
console.log('saved to', out);
