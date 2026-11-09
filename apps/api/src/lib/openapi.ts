// Minimal OpenAPI 3.1 builder on Zod 4's native JSON Schema output (OpenAPI 3.1 = JSON Schema 2020-12).
import { ErrorBody } from '@greenscape/validation';
import { z } from 'zod';

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';
interface PathSpec {
  method: Method;
  path: string; // OpenAPI style: /v1/products/{id}
  summary: string;
  tags?: string[];
  auth?: boolean;
  query?: z.ZodType;
  body?: z.ZodType;
  responses: Record<number, { description: string; schema?: z.ZodType }>;
}

const specs: PathSpec[] = [];
const json = (s: z.ZodType, io: 'input' | 'output') => z.toJSONSchema(s, { target: 'draft-2020-12', io, unrepresentable: 'any' });

/** Modules call this next to their route definitions; /v1/openapi.json renders everything registered. */
export const registry = { registerPath: (spec: PathSpec) => void specs.push(spec) };

export function openApiDocument(serverUrl: string, version: string) {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const s of specs) {
    const queryProps = s.query ? ((json(s.query, 'input') as { properties?: Record<string, unknown>; required?: string[] })) : undefined;
    (paths[s.path] ??= {})[s.method] = {
      summary: s.summary,
      tags: s.tags,
      ...(s.auth ? { security: [{ bearerAuth: [] }] } : {}),
      parameters: [
        ...[...s.path.matchAll(/\{(\w+)\}/g)].map((m) => ({ name: m[1], in: 'path', required: true, schema: { type: 'string' } })),
        ...Object.entries(queryProps?.properties ?? {}).map(([name, schema]) => ({ name, in: 'query', required: queryProps?.required?.includes(name) ?? false, schema })),
      ],
      ...(s.body ? { requestBody: { required: true, content: { 'application/json': { schema: json(s.body, 'input') } } } } : {}),
      responses: Object.fromEntries(
        Object.entries(s.responses).map(([code, r]) => [code, { description: r.description, ...(r.schema ? { content: { 'application/json': { schema: json(r.schema, 'output') } } } : {}) }]),
      ),
    };
  }
  return {
    openapi: '3.1.0',
    info: { title: 'Greenscape API', version, description: 'REST API for the Greenscape platform. All errors use the ErrorBody schema.' },
    servers: [{ url: serverUrl }],
    paths,
    components: {
      schemas: { ErrorBody: json(ErrorBody, 'output') },
      securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'Supabase JWT' } },
    },
  };
}
