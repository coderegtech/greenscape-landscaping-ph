// Request/response contracts shared by the API (runtime validation) and Next.js apps (types).
// OpenAPI is generated from these in apps/api.
import { z } from 'zod';

export { z };
import { Email, PhPhone } from './primitives.ts';
export { Email, PhPhone };

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
  /** Staff member whose session hasn't completed MFA: staff permissions are withheld until it does. */
  mfaRequired: z.boolean().default(false),
  aal: z.enum(['aal1', 'aal2']).optional(),
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

// ── Public forms: quote, contact, testimonial ──
export const QUOTE_SERVICES = {
  'garden-design': 'Garden design',
  landscaping: 'Landscaping',
  'garden-maintenance': 'Garden maintenance',
  'garden-essentials': 'Plants and garden supplies',
  other: 'Something else',
} as const;
export const PROPERTY_TYPES = { residential: 'Home', commercial: 'Business or office', resort: 'Resort or hotel', public: 'Public or institutional', other: 'Other' } as const;
export const BUDGETS = { 'under-50k': 'Under ₱50,000', '50k-150k': '₱50,000 to ₱150,000', '150k-500k': '₱150,000 to ₱500,000', 'over-500k': 'Over ₱500,000', 'not-sure': 'Not sure yet' } as const;
export const BEST_TIMES = { morning: 'Morning (8–12)', afternoon: 'Afternoon (12–5)', evening: 'Evening (5–8)', anytime: 'Any time' } as const;
const keys = <T extends Record<string, string>>(o: T) => Object.keys(o) as [keyof T & string, ...(keyof T & string)[]];

export const ATTACHMENT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'] as const;
export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
export const ATTACHMENT_MAX_COUNT = 5;
export const AttachmentRequest = z.object({
  filename: z.string().trim().min(1).max(200),
  contentType: z.enum(ATTACHMENT_TYPES, { error: 'Photos (JPG, PNG, WebP, HEIC) or PDF only' }),
  size: z.number().int().positive().max(ATTACHMENT_MAX_BYTES, 'Files must be 10 MB or smaller'),
});
export const AttachmentSlot = z.object({ id: z.string().uuid(), uploadUrl: z.string().url(), token: z.string(), path: z.string() });

const notPast = (d: string) => d >= new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10); // Manila "today"
const consent = z.literal(true, { error: 'Please accept the Privacy Notice to continue' });
/** Hidden field real people leave empty. Bots that fill it are accepted silently and dropped. */
const honeypot = z.string().max(500).optional();

// Step schemas (the form validates step by step; the API validates the whole request).
export const QuoteStepServices = z.object({
  services: z.array(z.enum(keys(QUOTE_SERVICES))).min(1, 'Choose at least one service'),
});
export const QuoteStepProject = z.object({
  propertyType: z.enum(keys(PROPERTY_TYPES), { error: 'Choose the type of property' }),
  projectLocation: z.string().trim().min(2, 'Where is the property?').max(160),
  areaSqm: z.coerce.number().int().positive().max(1_000_000).optional().or(z.literal('').transform(() => undefined)),
  budgetRange: z.enum(keys(BUDGETS)).optional(),
  preferredDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(notPast, 'Choose today or a later date').optional().or(z.literal('').transform(() => undefined)),
  details: z.string().trim().min(20, 'Tell us a little more (at least 20 characters)').max(3000),
  attachments: z.array(z.string().uuid()).max(ATTACHMENT_MAX_COUNT).default([]),
});
export const QuoteStepContact = z.object({
  name: z.string().trim().min(2, 'Enter your name').max(80),
  email: Email,
  phone: PhPhone,
  bestTimeToTalk: z.enum(keys(BEST_TIMES)).optional(),
  consent,
  website: honeypot,
});
export const QuoteRequest = QuoteStepServices.merge(QuoteStepProject).merge(QuoteStepContact);
export type QuoteRequest = z.infer<typeof QuoteRequest>;
export type QuoteRequestInput = z.input<typeof QuoteRequest>;

export const QUOTATION_STATUSES = ['NEW', 'CONTACTED', 'SITE_VISIT', 'QUOTED', 'WON', 'LOST', 'ARCHIVED'] as const;
export const QUOTATION_STATUS_LABELS: Record<(typeof QUOTATION_STATUSES)[number], string> = {
  NEW: 'Received',
  CONTACTED: 'We have contacted you',
  SITE_VISIT: 'Site visit scheduled',
  QUOTED: 'Quote sent',
  WON: 'Accepted',
  LOST: 'Closed',
  ARCHIVED: 'Closed',
};
export const QuoteReceipt = z.object({ number: z.string(), status: z.enum(QUOTATION_STATUSES), submittedAt: z.string() });
export const MyQuotation = QuoteReceipt.extend({ services: z.array(z.string()), projectLocation: z.string().nullable() });
export const QuotationListQuery = PageQuery.extend({ status: z.enum(QUOTATION_STATUSES).optional(), q: z.string().trim().max(100).optional() });
export const QuotationUpdate = z.object({ status: z.enum(QUOTATION_STATUSES).optional(), assignedToId: z.string().uuid().nullable().optional() }).refine((v) => v.status !== undefined || v.assignedToId !== undefined, 'Nothing to update');
export const QuotationNoteBody = z.object({ body: z.string().trim().min(1).max(4000) });

export const ContactRequest = z.object({
  name: z.string().trim().min(2, 'Enter your name').max(80),
  email: Email,
  phone: PhPhone.optional().or(z.literal('').transform(() => undefined)),
  subject: z.string().trim().max(120).optional(),
  message: z.string().trim().min(10, 'Write at least 10 characters').max(3000),
  consent,
  website: honeypot,
});
export type ContactRequest = z.infer<typeof ContactRequest>;

export const TestimonialRequest = z.object({
  projectType: z.string().trim().max(60).optional(),
  rating: z.coerce.number().int().min(1, 'Choose a rating').max(5),
  text: z.string().trim().min(20, 'Write at least 20 characters').max(1000),
  consent: z.literal(true, { error: 'Please agree so we can publish your feedback' }),
});
export type TestimonialRequest = z.infer<typeof TestimonialRequest>;

export * from './shop.ts';
export * from './hr.ts';
export * from './admin.ts';
