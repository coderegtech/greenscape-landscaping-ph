// Read-only fetch of the product catalogue the CURRENT public shop page reads (`products.js`: getDocs(collection(db, 'products'))),
// via Firestore's public REST API with the site's own public web API key. No writes; the `likes` subcollection
// (visitor ids) is never requested. Only catalogue fields are kept; the free-text `payment` field is dropped.
// Output: scripts/migrate/data/products-public.json
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'https://firestore.googleapis.com/v1/projects/greenscape-palawan/databases/(default)/documents';
const OUT = path.resolve(import.meta.dirname, 'data/products-public.json');

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

const KEEP = ['name', 'scientificName', 'nativeName', 'category', 'plantType', 'price', 'originalPrice', 'sizes', 'colors', 'dimension', 'wateringFrequency', 'careInstructions', 'description', 'isNew', 'isFeatured', 'isBestSeller', 'imageUrl', 'imageUrls'];
const products = [];
let token = '';
do {
  const r = await fetch(`${BASE}/products?key=${KEY}&pageSize=300${token ? `&pageToken=${token}` : ''}`);
  if (!r.ok) throw new Error(`products: ${r.status} ${await r.text()}`);
  const j = await r.json();
  for (const d of j.documents ?? []) {
    const f = decode({ mapValue: { fields: d.fields ?? {} } });
    products.push({ id: d.name.split('/').pop(), createTime: d.createTime, updateTime: d.updateTime, ...Object.fromEntries(KEEP.filter((k) => f[k] !== undefined).map((k) => [k, f[k]])) });
  }
  token = j.nextPageToken ?? '';
} while (token);

fs.writeFileSync(OUT, JSON.stringify({ fetchedAt: new Date().toISOString(), products }, null, 2));
console.log(`products: ${products.length} docs`);
