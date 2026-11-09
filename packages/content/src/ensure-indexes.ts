import { connectContentDb, ensureIndexes } from './client.ts';

try { process.loadEnvFile('../../.env'); } catch { /* CI provides env */ }
const { client, db } = await connectContentDb(process.env.MONGODB_URL!, process.env.MONGODB_DB ?? 'greenscape');
await ensureIndexes(db);
console.log('content indexes ensured on', db.databaseName);
await client.close();
