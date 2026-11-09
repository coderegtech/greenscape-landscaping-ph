import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import swaggerUi from 'swagger-ui-express';
import type { Deps } from './lib/deps.ts';
import { openApiDocument } from './lib/openapi.ts';
import { errorHandler, notFound } from './middleware/error-handler.ts';
import { apiRateLimit } from './middleware/rate-limit.ts';
import { requestId } from './middleware/request-id.ts';
import { healthRoutes } from './modules/health/routes.ts';

export function createApp(deps: Deps) {
  const { env, log } = deps;
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // one proxy/CDN hop in front of the API

  app.use(requestId);
  app.use(
    pinoHttp({
      logger: log,
      genReqId: (_req, res) => res.getHeader('x-request-id') as string,
      autoLogging: { ignore: (req) => req.url?.startsWith('/v1/health') ?? false },
      serializers: {
        req: (req: { id: string; method: string; url: string }) => ({ id: req.id, method: req.method, url: req.url }),
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
      },
    }),
  );
  app.use(helmet());
  app.use(
    cors({
      origin: (origin, cb) => cb(null, !origin || env.CORS_ORIGINS.includes(origin)), // no Origin = server-to-server
      credentials: true,
      maxAge: 600,
    }),
  );

  // Health is mounted before the rate limiter so probes are never throttled.
  app.use('/v1/health', healthRoutes(deps));
  app.use('/v1', apiRateLimit(deps.redis, env.CACHE_PREFIX, env.RATE_LIMIT_PER_MIN));
  app.use(express.json({ limit: '1mb' }));

  const doc = openApiDocument(env.API_PUBLIC_URL, env.APP_VERSION);
  app.get('/v1/openapi.json', (_req, res) => { res.json(doc); });
  // Swagger UI ships inline scripts; relax CSP for this route only.
  app.use('/v1/docs', helmet({ contentSecurityPolicy: false }), swaggerUi.serve, swaggerUi.setup(doc));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
