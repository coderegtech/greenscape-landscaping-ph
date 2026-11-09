import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';

const VALID = /^[\w-]{8,64}$/;

/** Honour a sane incoming X-Request-Id (from the Next.js server or a proxy), else mint one. */
export const requestId: RequestHandler = (req, res, next) => {
  const incoming = req.get('x-request-id');
  const id = incoming && VALID.test(incoming) ? incoming : randomUUID();
  res.locals.requestId = id;
  res.setHeader('x-request-id', id);
  next();
};
