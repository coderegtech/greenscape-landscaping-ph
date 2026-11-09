import { createStorage } from './index.ts';

try { process.loadEnvFile('../../.env'); } catch { /* CI env */ }
await createStorage(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!).ensureBuckets();
console.log('storage buckets ensured');
