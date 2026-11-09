// Captures representative pages at the four review widths into docs/screenshots/<label>/.
// Usage: node scripts/screenshots.mjs <label> [url ...]   (servers must be running)
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const [label = 'current', ...urls] = process.argv.slice(2);
const targets = urls.length ? urls : ['http://localhost:3000/design', 'http://localhost:3000/', 'http://localhost:3000/login', 'http://localhost:3000/signup', 'http://localhost:3001/login'];
const widths = [390, 768, 1024, 1440];
const out = path.resolve(import.meta.dirname, '../docs/screenshots', label);
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
for (const url of targets) {
  for (const width of widths) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' }); // end states, no mid-animation frames
    const errors = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await page.goto(url, { waitUntil: 'load', timeout: 60_000 });
    await page.waitForFunction(() => [...document.images].every((i) => i.complete), null, { timeout: 60_000 }).catch(() => {});
    await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 700) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); } window.scrollTo(0, 0); });
    await page.waitForTimeout(400);
    const u = new URL(url);
    const name = `${u.port === '3001' ? 'admin' : 'web'}${u.pathname.replace(/\/$/, '').replace(/\//g, '_') || '_home'}--${width}.png`;
    await page.screenshot({ path: path.join(out, name), fullPage: true });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    console.log(`${name}${overflow ? '  ⚠ horizontal overflow' : ''}${errors.length ? `  ⚠ console: ${errors.join(' | ').slice(0, 200)}` : ''}`);
    await page.close();
  }
}
await browser.close();
