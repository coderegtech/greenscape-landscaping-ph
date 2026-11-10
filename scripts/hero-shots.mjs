// Home hero at the top, middle and bottom of its scroll range, at desktop, tablet and phone widths (after the entrance).
// Usage: node scripts/hero-shots.mjs <outDir> [baseUrl]
import { chromium } from '@playwright/test';
import fs from 'node:fs';
const [out = 'docs/screenshots/hero', base = 'http://localhost:3000'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch();
for (const [w, h] of [[1440, 900], [768, 1024], [390, 844]]) {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  await p.goto(`${base}/`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(2600);
  for (const [name, dy] of [['top', 0], ['middle', h * 0.45], ['bottom', h * 0.5]]) {
    if (dy) { await p.mouse.wheel(0, dy); await p.waitForTimeout(700); }
    await p.screenshot({ path: `${out}/hero-${name}-${w}.jpg`, quality: 80 });
  }
  await p.close();
}
await b.close();
console.log('saved to', out);
