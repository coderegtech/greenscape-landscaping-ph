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
import { authenticate } from './middleware/auth.ts';
import { authRoutes } from './modules/auth/routes.ts';
import { cmsAdminRoutes } from './modules/cms-admin/routes.ts';
import { cmsRoutes } from './modules/cms/routes.ts';
import { healthRoutes } from './modules/health/routes.ts';
import { mediaRoutes } from './modules/media/routes.ts';
import { inquiryRoutes } from './modules/inquiries/routes.ts';
import { quotationRoutes } from './modules/quotations/routes.ts';
import { userRoutes } from './modules/users/routes.ts';
import { shopAdminRoutes } from './modules/shop/admin-routes.ts';
import { hrRoutes } from './modules/attendance/admin-routes.ts';
import { attendanceSelfRoutes } from './modules/attendance/routes.ts';
import { adminRoutes, customerMessageRoutes } from './modules/admin/routes.ts';
import { catalogRoutes, shopRoutes, webhookRoutes } from './modules/shop/routes.ts';

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
  // Public CMS reads: cached, read-only, low-cardinality params; mounted before the per-IP limiter because the
  // web server renders (and builds) every page through them from one IP. Writes are all behind the limiter.
  app.use('/v1/cms', cmsRoutes(deps));
  app.use('/v1/shop', catalogRoutes(deps));
  // Provider webhooks: raw body (signature check), never throttled, no session.
  app.use('/v1/payments/webhooks', webhookRoutes(deps));
  app.use('/v1', apiRateLimit(deps.redis, env.CACHE_PREFIX, env.RATE_LIMIT_PER_MIN, env.INTERNAL_API_KEY));
  app.use(express.json({ limit: '1mb' }));

  const doc = openApiDocument(env.API_PUBLIC_URL, env.APP_VERSION);
  app.get('/v1/openapi.json', (_req, res) => { res.json(doc); });
  // Swagger UI ships inline scripts; relax CSP for this route only.
  app.use('/v1/docs', helmet({ contentSecurityPolicy: false }), swaggerUi.serve, swaggerUi.setup(doc));

  // Everything below may see a signed-in user; routes decide whether one is required.
  app.use('/v1', authenticate(deps));
  app.use('/v1/auth', authRoutes(deps));
  app.use('/v1', userRoutes(deps));
  app.use('/v1/quotations', quotationRoutes(deps));
  app.use('/v1/cms-admin', cmsAdminRoutes(deps));
  app.use('/v1/media', mediaRoutes(deps));
  app.use('/v1', inquiryRoutes(deps));
  app.use('/v1/shop-admin', shopAdminRoutes(deps));
  app.use('/v1/hr', hrRoutes(deps));
  app.use('/v1', attendanceSelfRoutes(deps));
  app.use('/v1/admin', adminRoutes(deps));
  app.use('/v1', customerMessageRoutes(deps));
  app.use('/v1', shopRoutes(deps));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
