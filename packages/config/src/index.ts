import { z } from 'zod';

export { z };

/**
 * Parse process.env with a Zod schema and fail fast with a readable message.
 * Every app calls this once at boot; nothing reads process.env directly after that.
 */
export function loadEnv<S extends z.ZodType>(schema: S, source: Record<string, string | undefined> = process.env): z.infer<S> {
  const result = schema.safeParse(source);
  if (!result.success) {
    const lines = result.error.issues.map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`);
    throw new Error(`Invalid environment configuration:\n${lines.join('\n')}`);
  }
  return result.data;
}

/** Comma-separated list → string[] (empty entries dropped). */
export const csv = z
  .string()
  .default('')
  .transform((s) => s.split(',').map((x) => x.trim()).filter(Boolean));

export const nodeEnv = z.enum(['development', 'test', 'production']).default('development');
