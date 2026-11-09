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

// ── Auth & users ──
export const UserStatus = z.enum(['ACTIVE', 'SUSPENDED', 'DELETED']);

export const MeResponse = z.object({
  user: z.object({ id: z.string().uuid(), email: z.string().email(), displayName: z.string().nullable(), status: UserStatus }),
  roles: z.array(z.string()),
  permissions: z.array(z.string()),
});
export type MeResponse = z.infer<typeof MeResponse>;

export const UserSummary = z.object({
  id: z.string().uuid(),
  email: z.string(),
  displayName: z.string().nullable(),
  status: UserStatus,
  roles: z.array(z.string()),
  createdAt: z.string(),
  lastLoginAt: z.string().nullable(),
});
export type UserSummary = z.infer<typeof UserSummary>;

export const UsersQuery = PageQuery.extend({
  q: z.string().trim().max(100).optional(),
  role: z.string().max(40).optional(),
});
export const SetRolesBody = z.object({ roles: z.array(z.string().max(40)).max(10) });
export const SetStatusBody = z.object({ status: z.enum(['ACTIVE', 'SUSPENDED']) });

export const RoleSummary = z.object({ key: z.string(), name: z.string(), permissions: z.array(z.string()) });

// ── Auth forms (client + server). Password rules mirror supabase/config.toml. ──
export const Email = z.string().trim().toLowerCase().email('Enter a valid email address');
export const Password = z
  .string()
  .min(8, 'Use at least 8 characters')
  .max(72, 'Use at most 72 characters')
  .regex(/[a-z]/, 'Add a lowercase letter')
  .regex(/[A-Z]/, 'Add an uppercase letter')
  .regex(/\d/, 'Add a number');

export const SignInForm = z.object({ email: Email, password: z.string().min(1, 'Enter your password') });
export const SignUpForm = z
  .object({
    name: z.string().trim().min(1, 'Enter your name').max(80),
    email: Email,
    password: Password,
    confirm: z.string(),
    consent: z.literal(true, { error: 'Please accept the Privacy Notice to continue' }),
  })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Passwords do not match' });
export const ForgotPasswordForm = z.object({ email: Email });
export const ResetPasswordForm = z
  .object({ password: Password, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Passwords do not match' });

/** Only same-site relative paths are allowed as post-auth redirects (blocks open redirects). */
export function safeNext(next: string | null | undefined, fallback = '/') {
  return next && /^\/(?![/\\])[\w\-/?=&%.#]*$/.test(next) ? next : fallback;
}
