// Request/response contracts shared by the API (runtime validation) and Next.js apps (types).
// OpenAPI is generated from these in apps/api.
import { z } from 'zod';

export { z };

export const ErrorBody = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string().optional(),
    details: z.unknown().optional(),
  }),
});
export type ErrorBody = z.infer<typeof ErrorBody>;

export const DependencyStatus = z.object({ ok: z.boolean(), latencyMs: z.number().optional(), error: z.string().optional() });
export const HealthResponse = z.object({
  status: z.enum(['ok', 'degraded', 'down']),
  version: z.string(),
  uptimeSec: z.number(),
  checks: z.object({ postgres: DependencyStatus, mongo: DependencyStatus, redis: DependencyStatus }),
});
export type HealthResponse = z.infer<typeof HealthResponse>;

export const PageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type PageQuery = z.infer<typeof PageQuery>;

export function paginated<T extends z.ZodType>(item: T) {
  return z.object({ items: z.array(item), page: z.number().int(), pageSize: z.number().int(), total: z.number().int() });
}
