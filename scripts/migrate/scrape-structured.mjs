// Targeted, read-only extraction of structured content (projects, stories, gallery, testimonials, FAQ, home).
// Same safety as scrape-public.mjs: analytics and all Firestore writes are blocked; nothing is submitted.
// Output: scripts/migrate/data/structured-content.json
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const O = 'https://greenscapelandscapingph.com';
const OUT = path.resolve(import.meta.dirname, 'data/structured-content.json');
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.route(/visitor-tracker\.js|google-analytics\.com|googletagmanager\.com|Firestore\/Write\/channel/, (r) => r.abort());

async function open(url) {
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: 'load', timeout: 60_000 });
  await page.waitForTimeout(4500);
  return page;
}

/** Every project card on a page, clicking through each image carousel to collect all photos. */
async function projectCards(page) {
  const count = await page.locator('.project-card').count();
  const cards = [];
  for (let i = 0; i < count; i++) {
    const card = page.locator('.project-card').nth(i);
    const images = [];
    for (let k = 0; k < 25; k++) {
      const src = await card.locator('img.project-image').first().getAttribute('src').catch(() => null);
      if (!src || images.includes(src)) break;
      images.push(src);
      const next = card.locator('.project-image-nav.next, [data-direction="next"]').first();
      if (!(await next.count())) break;
      await next.click({ force: true }).catch(() => {});
      await page.waitForTimeout(150);
    }
    const info = await card.evaluate((el) => {
      const t = (s) => el.querySelector(s)?.textContent?.trim().replace(/\s+/g, ' ') ?? null;
      const lines = [...el.querySelectorAll('span, .project-meta *, [class*=location], [class*=date], [class*=category], [class*=tag]')]
        .map((e) => ({ cls: e.className?.toString() ?? '', v: e.textContent.trim().replace(/\s+/g, ' ') }))
        .filter((x) => x.v && x.v.length < 80);
      return { title: t('.project-title, h3'), description: t('.project-description, p'), meta: lines };
    });
    cards.push({ ...info, images });
  }
  return cards;
}

const result = {};

// Home
{
  const page = await open(`${O}/`);
  result.home = await page.evaluate(() => {
    const bg = (s) => s?.match(/url\(["']?(.*?)["']?\)/)?.[1] ?? null;
    const hero = document.querySelector('[class*=hero]');
    return {
      heroSlides: [...document.querySelectorAll('.hero-bg-slide')].map((e) => bg(e.getAttribute('style'))),
      heroHeadline: hero?.querySelector('h1')?.textContent.trim() ?? null,
      heroSub: hero?.querySelector('p')?.textContent.trim() ?? null,
      services: [...document.querySelectorAll('.service-card')].map((e) => ({
        cls: e.className,
        href: e.getAttribute('data-href'),
        image: bg(e.getAttribute('style')),
        badge: e.querySelector('.service-badge')?.textContent.trim() ?? null,
        title: e.querySelector('h3')?.textContent.trim() ?? null,
        text: e.querySelector('p')?.textContent.trim() ?? null,
        points: [...e.querySelectorAll('li')].map((l) => l.textContent.trim()),
      })),
    };
  });
  result.home.featuredProjects = await projectCards(page);
  await page.close();
}

// Project categories
result.projects = {};
for (const cat of ['residential-garden', 'commercial-landscaping', 'indoor-landscaping', 'landscape-rehabilitation']) {
  const page = await open(`${O}/pages/projects/${cat}.html`);
  result.projects[cat] = await projectCards(page);
  console.log(`projects/${cat}: ${result.projects[cat].length} cards, ${result.projects[cat].reduce((n, c) => n + c.images.length, 0)} images`);
  await page.close();
}

// Stories: list then each story (textContent: the page keeps the body hidden while its blocked view-count write is pending)
{
  const page = await open(`${O}/pages/our-story/`);
  const list = await page.evaluate(() =>
    [...document.querySelectorAll('a.story-card')].map((a) => ({
      id: new URL(a.href).searchParams.get('id'),
      title: a.querySelector('.story-card-title, h3')?.textContent.trim(),
      image: a.querySelector('img')?.src ?? null,
      excerpt: a.querySelector('p')?.textContent.trim() ?? null,
    })),
  );
  await page.close();
  result.stories = [];
  for (const s of list) {
    const sp = await open(`${O}/pages/our-story/story.html?id=${s.id}`);
    const detail = await sp.evaluate(() => {
      const t = (q) => document.querySelector(q)?.textContent.trim().replace(/\s+/g, ' ') ?? null;
      const body = document.querySelector('.story-body');
      return {
        title: t('.story-title'),
        excerpt: t('.story-excerpt'),
        author: t('.author-byline'),
        authorRole: t('.author-role-inline'),
        date: t('.story-date'),
        bodyHtml: body?.innerHTML ?? null,
        images: [...document.querySelectorAll('.story-wrapper img, .story-container img')].map((i) => i.src).filter((s) => !/googleusercontent/.test(s)),
        youtube: [...document.querySelectorAll('iframe')].map((f) => f.src).filter((s) => /youtube/.test(s)),
      };
    });
    result.stories.push({ ...s, ...detail });
    console.log(`story ${s.id}: ${detail.title} (${(detail.bodyHtml ?? '').length} chars body)`);
    await sp.close();
  }
}

// Gallery
{
  const page = await open(`${O}/pages/gallery.html`);
  result.gallery = await page.evaluate(() => [...document.querySelectorAll('.gallery-item img')].map((i) => ({ src: i.src, alt: i.alt })));
  console.log(`gallery: ${result.gallery.length}`);
  await page.close();
}

// Testimonials (approved ones the public page shows). Avatars are reviewers' personal photos: not kept.
{
  const page = await open(`${O}/pages/testimonials.html`);
  result.testimonials = await page.evaluate(() =>
    [...document.querySelectorAll('.testimonial-text')].map((p) => {
      const card = p.closest('[class*=testimonial-card], .testimonial, div[class]') ?? p.parentElement;
      let c = p;
      for (let i = 0; i < 4 && c.parentElement && !c.querySelector('h3'); i++) c = c.parentElement;
      return {
        text: p.textContent.trim(),
        name: c.querySelector('h3')?.textContent.trim() ?? null,
        role: [...c.querySelectorAll('p')].map((x) => x.textContent.trim()).find((x) => x && x !== p.textContent.trim()) ?? null,
        rating: c.querySelectorAll('.fa-star.fas, .fas.fa-star, [class*=star].filled, .star.active').length || null,
        cardCls: card?.className?.toString().slice(0, 40),
      };
    }),
  );
  console.log(`testimonials: ${result.testimonials.length}`);
  await page.close();
}

// FAQ
{
  const page = await open(`${O}/pages/contact/faq.html`);
  result.faq = await page.evaluate(() =>
    [...document.querySelectorAll('.faq-question')].map((q) => {
      const item = q.closest('[class*=faq-item]') ?? q.parentElement?.parentElement;
      return { question: q.textContent.trim().replace(/\s+/g, ' '), answer: item?.querySelector('.faq-answer-content')?.textContent.trim() ?? null };
    }),
  );
  console.log(`faq: ${result.faq.length}`);
  await page.close();
}

await browser.close();
fs.writeFileSync(OUT, JSON.stringify({ scrapedAt: new Date().toISOString(), origin: O, ...result }, null, 2));
console.log('wrote', OUT);
