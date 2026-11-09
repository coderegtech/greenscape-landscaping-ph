// Read-only fetch of the documents the CURRENT public pages read, via Firestore's public REST API with the
// site's own public web API key (the same unauthenticated reads every visitor's browser makes).
// No writes, no view counters touched. Only data the public pages display:
//   projects, stories, gallery, faqs, services/*, settings/{hero,policies,pageCovers,gardenEssentials}, pageContent/about-greenscape,
//   gardenDesignTransformations, maintenance-packages, landscaping-content (header + sections/items),
//   testimonials WHERE status == "approved" (filtered by the server, so pending submissions are never downloaded).
// Output: scripts/migrate/data/firestore-public.json
import fs from 'node:fs';
import path from 'node:path';

const PROJECT = 'greenscape-palawan';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const OUT = path.resolve(import.meta.dirname, 'data/firestore-public.json');

// The key is public by design (shipped in the site's JS); read it from there rather than storing it here.
const cfg = await fetch('https://greenscapelandscapingph.com/assets/js/firebase-config.js').then((r) => r.text());
const KEY = cfg.match(/apiKey:\s*"([^"]+)"/)?.[1];
if (!KEY) throw new Error('could not read public API key');

function decode(v) {
  if (!v || typeof v !== 'object') return v;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('nullValue' in v) return null;
  if ('arrayValue' in v) return (v.arrayValue.values ?? []).map(decode);
  if ('mapValue' in v) return Object.fromEntries(Object.entries(v.mapValue.fields ?? {}).map(([k, x]) => [k, decode(x)]));
  return v;
}
const docOut = (d) => ({ id: d.name.split('/').pop(), createTime: d.createTime, updateTime: d.updateTime, ...decode({ mapValue: { fields: d.fields ?? {} } }) });

async function list(collection) {
  const out = [];
  let token = '';
  do {
    const r = await fetch(`${BASE}/${collection}?key=${KEY}&pageSize=300${token ? `&pageToken=${token}` : ''}`);
    if (!r.ok) throw new Error(`${collection}: ${r.status} ${await r.text()}`);
    const j = await r.json();
    out.push(...(j.documents ?? []).map(docOut));
    token = j.nextPageToken ?? '';
  } while (token);
  return out;
}
async function get(docPath) {
  const r = await fetch(`${BASE}/${docPath}?key=${KEY}`);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`${docPath}: ${r.status}`);
  return docOut(await r.json());
}
async function approvedTestimonials() {
  const r = await fetch(`${BASE}:runQuery?key=${KEY}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'testimonials' }], where: { fieldFilter: { field: { fieldPath: 'status' }, op: 'EQUAL', value: { stringValue: 'approved' } } } } }),
  });
  if (!r.ok) throw new Error(`testimonials: ${r.status}`);
  return (await r.json()).filter((x) => x.document).map((x) => docOut(x.document));
}

const out = {
  fetchedAt: new Date().toISOString(),
  projects: await list('projects'),
  stories: (await list('stories')).map(({ uploadedBy: _u, likes: _l, ...s }) => s), // drop uploader + liker identities
  gallery: await list('gallery'),
  faqs: await list('faqs'),
  services: await list('services'),
  hero: await get('settings/hero'),
  policies: await get('settings/policies'),
  about: await get('pageContent/about-greenscape'),
  pageCovers: await get('settings/pageCovers'),
  gardenEssentials: await get('settings/gardenEssentials'),
  transformations: await list('gardenDesignTransformations'),
  maintenancePackages: await list('maintenance-packages'),
  landscapingHeader: await get('landscaping-content/header'),
  landscapingSteps: await list('landscaping-content/sections/items'),
  testimonials: (await approvedTestimonials()).map(({ userPhoto: _drop, userEmail: _drop2, email: _drop3, userId: _drop4, ...t }) => t), // no personal photos/emails/ids
};
// Strip identity fields wherever they appear (uploader name/email, user ids, avatars, likers).
const DROP = new Set(['uploadedBy', 'email', 'userEmail', 'userPhoto', 'userId', 'likes', 'likedBy', 'uid']);
const scrub = (v) => (Array.isArray(v) ? v.map(scrub) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).filter(([k]) => !DROP.has(k)).map(([k, x]) => [k, scrub(x)])) : v);
fs.writeFileSync(OUT, JSON.stringify(scrub(out), null, 2));
for (const [k, v] of Object.entries(out)) if (k !== 'fetchedAt') console.log(k.padEnd(13), Array.isArray(v) ? `${v.length} docs` : v ? 'doc' : 'missing');
