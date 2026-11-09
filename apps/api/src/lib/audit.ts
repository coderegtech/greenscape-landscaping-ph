import type { Request, Response } from 'express';
import type { Deps } from './deps.ts';

type Tx = Pick<Deps['db'], 'auditLog'>;

/** Append-only record of a sensitive action. Pass the transaction client so it commits with the change. */
export function audit(db: Tx, req: Request, res: Response, entry: { action: string; entityType: string; entityId: string; before?: unknown; after?: unknown }) {
  return db.auditLog.create({
    data: {
      actorId: res.locals.auth?.userId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      before: entry.before as object | undefined,
      after: entry.after as object | undefined,
      ip: req.ip,
      userAgent: req.get('user-agent')?.slice(0, 300),
    },
  });
}
