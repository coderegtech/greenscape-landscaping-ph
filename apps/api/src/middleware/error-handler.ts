import * as Sentry from '@sentry/node';
import type { ErrorBody } from '@greenscape/validation';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../lib/errors.ts';

type Mapped = { status: number; code: string; message: string; details?: unknown };

function map(err: unknown): Mapped {
  if (err instanceof AppError) return { status: err.status, code: err.code, message: err.message, details: err.details };
  if (err instanceof ZodError) return { status: 400, code: 'VALIDATION_ERROR', message: 'Invalid request', details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) };
  const e = err as { type?: string; status?: number; code?: string; meta?: unknown };
  // body-parser
  if (e?.type === 'entity.parse.failed') return { status: 400, code: 'INVALID_JSON', message: 'Malformed JSON body' };
  if (e?.type === 'entity.too.large') return { status: 413, code: 'PAYLOAD_TOO_LARGE', message: 'Request body too large' };
  // Prisma known request errors
  // No Prisma `meta`: it names tables, columns and constraints (security audit L-2).
  if (e?.code === 'P2002') return { status: 409, code: 'CONFLICT', message: 'A record with these values already exists' };
  if (e?.code === 'P2025') return { status: 404, code: 'NOT_FOUND', message: 'Record not found' };
  if (e?.code === 'P2003') return { status: 409, code: 'CONFLICT', message: 'Related record constraint failed' };
  return { status: 500, code: 'INTERNAL', message: 'Something went wrong' };
}

export const notFound: RequestHandler = (req, _res, next) => next(AppError.notFound(`No route for ${req.method} ${req.path}`));

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const m = map(err);
  const requestId = res.locals.requestId as string | undefined;
  if (m.status >= 500) {
    req.log?.error({ err }, 'unhandled error');
    Sentry.captureException(err, { tags: { requestId } });
  }
  const body: ErrorBody = { error: { code: m.code, message: m.message, requestId, ...(m.details !== undefined ? { details: m.details } : {}) } };
  res.status(m.status).json(body);
};
