// Import an authorised Firestore + Firebase Auth export (see docs/migration-plan.md, "Private data").
//   pnpm data:import --dir <export folder>            dry run: counts, checksums, rejects; writes nothing
//   pnpm data:import --dir <export folder> --apply    write (idempotent)
// Report: <export folder>/import-report.md (kept next to the export, which holds personal data and must stay private).
import fs from 'node:fs';
import path from 'node:path';
import { connectContentDb } from '@greenscape/content';
import { createPrismaClient } from '@greenscape/database';
import { createClient } from '@supabase/supabase-js';
import { reportMarkdown, runImport } from './lib/load.ts';

try { process.loadEnvFile(path.resolve(import.meta.dirname, '../../.env')); } catch { /* CI env */ }
const arg = (name: string) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
const dir = arg('--dir');
if (!dir || !fs.existsSync(dir)) {
  console.error('Usage: pnpm data:import --dir <export folder> [--apply]');
  process.exit(2);
}
const apply = process.argv.includes('--apply');
const db = createPrismaClient(process.env.DATABASE_URL!);
const mongo = await connectContentDb(process.env.MONGODB_URL!, process.env.MONGODB_DB ?? 'greenscape');
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
try {
  const report = await runImport({ dir: path.resolve(dir), apply, db, mongo: mongo.db, supabase });
  const out = path.join(path.resolve(dir), 'import-report.md');
  fs.writeFileSync(out, reportMarkdown(report));
  fs.writeFileSync(path.join(path.resolve(dir), 'import-report.json'), JSON.stringify(report, null, 2));
  for (const [k, s] of Object.entries(report.sections)) if (s.provided) console.log(`${k.padEnd(14)} in ${s.input}, valid ${s.valid}, ${apply ? 'created' : 'would create'} ${s.created}, existing ${s.existing}, rejected ${s.rejected.length}`);
  console.log(`${report.mode}. Report: ${out}`);
} finally {
  await db.$disconnect();
  await mongo.client.close();
}
