// For the owner (D3), once read access is granted: copies the private Firestore collections to a local folder in the
// format `pnpm data:import` reads. GET requests only; Firebase is never written to.
//
//   gcloud auth login                         # an account with read access to project greenscape-palawan
//   node scripts/migrate/extract-firestore.mjs --out ../greenscape-export --token "$(gcloud auth print-access-token)"
//   firebase auth:export ../greenscape-export/auth-users.json --format=json --project greenscape-palawan
//
// Keep the folder off the repository and off shared drives: it holds personal data (RA 10173). Delete it after import.
import fs from 'node:fs';
import path from 'node:path';

const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : undefined; };
const out = arg('--out');
const token = arg('--token');
if (!out || !token) {
  console.error('Usage: node scripts/migrate/extract-firestore.mjs --out <folder outside the repo> --token <access token>');
  process.exit(2);
}
if (path.resolve(out).startsWith(path.resolve(import.meta.dirname, '../..'))) {
  console.error('Refusing to write personal data inside the repository. Choose a folder outside it.');
  process.exit(2);
}
const BASE = 'https://firestore.googleapis.com/v1/projects/greenscape-palawan/databases/(default)/documents';

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
async function list(collectionPath) {
  const docs = [];
  let pageToken = '';
  do {
    const r = await fetch(`${BASE}/${collectionPath}?pageSize=300${pageToken ? `&pageToken=${pageToken}` : ''}`, { headers: { authorization: `Bearer ${token}` } });
    if (!r.ok) throw new Error(`${collectionPath}: ${r.status} ${await r.text()}`);
    const j = await r.json();
    for (const d of j.documents ?? []) docs.push({ id: d.name.split('/').pop(), createTime: d.createTime, updateTime: d.updateTime, ...decode({ mapValue: { fields: d.fields ?? {} } }) });
    pageToken = j.nextPageToken ?? '';
  } while (pageToken);
  return docs;
}

fs.mkdirSync(out, { recursive: true });
const write = (file, data) => { fs.writeFileSync(path.join(out, file), JSON.stringify(data, null, 1)); console.log(`${file.padEnd(30)} ${data.length}`); };
for (const [file, coll] of [['quotations.json', 'quotations'], ['employees.json', 'employees'], ['timeLogs.json', 'timeLogs'], ['leaveRequests.json', 'leaveRequests'], ['testimonials.json', 'testimonials'], ['announcements.json', 'announcements']]) {
  write(file, await list(coll));
}
const conversations = await list('conversations');
write('conversations.json', conversations);
const messages = [];
for (const c of conversations) for (const m of await list(`conversations/${c.id}/messages`)) messages.push({ ...m, conversationId: c.id });
write('conversations.messages.json', messages);
console.log(`Done. Next: firebase auth:export ${path.join(out, 'auth-users.json')} --format=json, then pnpm data:import --dir ${out}`);
