import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.ts';

export * from './generated/prisma/client.ts';

/** One client per process. Pass the URL explicitly so callers control env loading. */
export function createPrismaClient(connectionString: string) {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

export type Db = ReturnType<typeof createPrismaClient>;
