import { csv, loadEnv, z } from '@greenscape/config';
import { describe, expect, it } from 'vitest';

describe('loadEnv', () => {
  const schema = z.object({ PORT: z.coerce.number().int(), ORIGINS: csv, URL: z.string().url() });

  it('parses and coerces', () => {
    expect(loadEnv(schema, { PORT: '4000', ORIGINS: 'http://a, http://b,,', URL: 'http://x' })).toEqual({ PORT: 4000, ORIGINS: ['http://a', 'http://b'], URL: 'http://x' });
  });

  it('lists every invalid key in one error', () => {
    expect(() => loadEnv(schema, { PORT: 'abc' })).toThrowError(/PORT[\s\S]*URL/);
  });
});
