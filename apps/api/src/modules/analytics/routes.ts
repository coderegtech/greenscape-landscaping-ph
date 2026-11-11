// Cookieless, first-party website analytics. Only daily counters are stored (AnalyticsDaily). Unique visitors are
// counted in a Redis HyperLogLog of a keyed hash of (day, address, browser): the hash is never stored or logged, the
// key rotates daily, and the HyperLogLog cannot give the hashes back. Business numbers (orders, revenue, sign-ups,
// quotations, publishing) come from the records the system already keeps, never from the browser.
import { createHmac } from 'node:crypto';
import { collections } from '@greenscape/content';
import { Prisma } from '@greenscape/database';
import { z } from '@greenscape/validation';
import { Router, type Request } from 'express';
import type { Deps } from '../../lib/deps.ts';
import { AppError } from '../../lib/errors.ts';
import { registry } from '../../lib/openapi.ts';
import { currentAuth, requirePermission } from '../../middleware/auth.ts';
import { clientAddress, isInternal } from '../../middleware/client.ts';
import { addDays, manilaDate, manilaInstant } from '../attendance/time.ts';

registry.registerPath({ method: 'post', path: '/v1/analytics/pageview', tags: ['analytics'], summary: 'Count a website page view (website server only: needs the internal key). No cookies or ids stored.', responses: { 204: { description: 'counted or ignored' } } });
registry.registerPath({ method: 'get', path: '/v1/admin/analytics', tags: ['analytics'], auth: true, summary: 'Traffic and conversion summary for ?days=7|30|90 with the previous period (analytics.read; revenue needs reports.sales).', responses: { 200: { description: 'summary' } } });

const BOT = /bot|crawl|spider|slurp|preview|headless|lighthouse|pingdom|uptime|monitor|curl|wget|python|axios|node-fetch/i;
const SKIP = /^\/(api|auth\/callback|_next)(\/|$)/;

/** `/shop/golden-pothos?x=1#y` → `/shop/golden-pothos`; anything odd (or not a page) → null. */
export function cleanPath(raw: unknown) {
  if (typeof raw !== 'string') return null;
  const p = raw.split(/[?#]/)[0]!.replace(/\/+$/, '') || '/';
  return p.length <= 120 && /^\/[A-Za-z0-9\-_/.]*$/.test(p) && !SKIP.test(p) ? p : null;
}
export const deviceOf = (ua: string) => (/ipad|tablet|kindle|silk/i.test(ua) ? 'tablet' : /mobi|android|iphone|ipod/i.test(ua) ? 'mobile' : 'desktop');
/** External referrer host (www. dropped), or "direct". Our own hosts count as direct. */
export function sourceOf(referrer: unknown, ownHosts: string[]) {
  try {
    const host = new URL(String(referrer)).hostname.replace(/^www\./, '');
    return host && !ownHosts.includes(host) ? host.slice(0, 80) : 'direct';
  } catch {
    return 'direct';
  }
}

const PageView = z.object({ path: z.string().max(400), referrer: z.string().max(1000).optional(), ua: z.string().max(400).optional(), country: z.string().optional() });

async function bump(db: Deps['db'], day: string, rows: [string, string][]) {
  const values = Prisma.join(rows.map(([m, k]) => Prisma.sql`(${day}::date, ${m}, ${k}, 1)`));
  await db.$executeRaw`INSERT INTO "AnalyticsDaily" ("day", "metric", "key", "count") VALUES ${values}
    ON CONFLICT ("day", "metric", "key") DO UPDATE SET "count" = "AnalyticsDaily"."count" + 1`;
}

/** Server-side business event (e.g. add to cart). Never throws: analytics must not break the action it counts. */
export async function recordEvent({ db, log }: Pick<Deps, 'db' | 'log'>, metric: 'add_to_cart', key = '') {
  await bump(db, manilaDate(new Date()), [[metric, key]]).catch((err) => log.warn({ err: (err as Error).message }, 'analytics.event_failed'));
}

export function analyticsCollectRoutes(deps: Deps) {
  const { db, redis, env, log } = deps;
  const own = [env.WEB_URL, env.ADMIN_URL, env.EMPLOYEE_URL].map((u) => new URL(u).hostname.replace(/^www\./, ''));
  const secret = env.INTERNAL_API_KEY ?? env.SUPABASE_SECRET_KEY;
  const r = Router();
  r.post('/pageview', async (req: Request, res) => {
    // Only the website's own server reports page views (it vouches for the visitor's address with the internal key).
    if (!isInternal(req, env.INTERNAL_API_KEY)) throw AppError.forbidden('Not accepted');
    const b = PageView.safeParse(req.body);
    const path = b.success ? cleanPath(b.data.path) : null;
    const ua = (b.success && b.data.ua) || '';
    if (!b.success || !path || !ua || BOT.test(ua)) return void res.status(204).end();
    const day = manilaDate(new Date());
    const rows: [string, string][] = [['pageview', path]];
    try {
      const hash = createHmac('sha256', secret).update(`${day}|${clientAddress(req, env.INTERNAL_API_KEY)}|${ua}`).digest('base64url');
      const key = `${env.CACHE_PREFIX}:an:uv:${day}`;
      const isNew = (await redis.pfadd(key, hash)) === 1; // 1 = estimate grew: a visitor not seen today (approximate)
      if (isNew) {
        await redis.expire(key, 2 * 86_400);
        rows.push(['visitor', ''], ['source', sourceOf(b.data.referrer, own)], ['device', deviceOf(ua)]);
        const cc = b.data.country?.toUpperCase();
        if (cc && /^[A-Z]{2}$/.test(cc) && cc !== 'XX') rows.push(['country', cc]);
      }
    } catch (err) {
      log.warn({ err: (err as Error).message }, 'analytics.visitors_unavailable'); // Redis down: page views still count
    }
    await bump(db, day, rows);
    res.status(204).end();
  });
  return r;
}

const SOLD = ['PAID', 'COMPLETED', 'PARTIALLY_REFUNDED', 'REFUNDED'] as const;
type Row = { day: Date; metric: string; key: string; count: number };
const top = (rows: Row[], metric: string, match: (k: string) => boolean = () => true, n = 10) => {
  const m = new Map<string, number>();
  for (const x of rows) if (x.metric === metric && match(x.key)) m.set(x.key, (m.get(x.key) ?? 0) + x.count);
  return [...m].sort((a, b) => b[1] - a[1]).slice(0, n).map(([key, count]) => ({ key, count }));
};
const sum = (rows: Row[], metric: string, match: (k: string) => boolean = () => true) => rows.reduce((n, x) => n + (x.metric === metric && match(x.key) ? x.count : 0), 0);
const isProduct = (k: string) => /^\/shop\/[^/]+$/.test(k);
const isService = (k: string) => /^\/services\/[^/]+$/.test(k);

export function analyticsReportRoutes({ db, mongo }: Deps) {
  const r = Router();
  r.get('/', requirePermission('analytics.read'), async (req, res) => {
    const days = z.coerce.number().pipe(z.union([z.literal(7), z.literal(30), z.literal(90)])).catch(30).parse(req.query.days);
    const to = manilaDate(new Date());
    const from = addDays(to, -(days - 1));
    const prevFrom = addDays(from, -days);
    const date = (ymd: string) => new Date(`${ymd}T00:00:00Z`);
    const all = await db.analyticsDaily.findMany({ where: { day: { gte: date(prevFrom), lte: date(to) } } });
    const ymd = (d: Date) => d.toISOString().slice(0, 10);
    const cur = all.filter((x) => ymd(x.day) >= from);
    const prev = all.filter((x) => ymd(x.day) < from);
    const canSales = currentAuth(res).permissions.has('reports.sales');

    const period = async (rows: Row[], a: string, b: string) => {
      const range = { gte: manilaInstant(a, '00:00'), lt: manilaInstant(addDays(b, 1), '00:00') };
      const [orders, registrations, quotations, publishes] = await Promise.all([
        db.order.findMany({ where: { status: { in: [...SOLD] }, placedAt: range }, select: { total: true, payments: { select: { isTest: true } } } }),
        db.user.count({ where: { createdAt: range } }),
        db.quotation.count({ where: { submittedAt: range } }),
        mongo.db.collection(collections.pageRevisions).countDocuments({ note: 'published', createdAt: { $gte: range.gte, $lt: range.lt } }),
      ]);
      return {
        visitors: sum(rows, 'visitor'),
        pageviews: sum(rows, 'pageview'),
        productViews: sum(rows, 'pageview', isProduct),
        addToCart: sum(rows, 'add_to_cart'),
        checkoutStarts: sum(rows, 'pageview', (k) => k === '/checkout'),
        orders: orders.length,
        ...(canSales ? { revenue: orders.reduce((n, o) => n + Number(o.total), 0).toFixed(2), testOrders: orders.filter((o) => o.payments.some((p) => p.isTest)).length } : {}),
        registrations,
        quotations,
        publishes,
      };
    };
    const daily = [];
    for (let d = from; d <= to; d = addDays(d, 1)) {
      const rows = cur.filter((x) => ymd(x.day) === d);
      daily.push({ date: d, visitors: sum(rows, 'visitor'), pageviews: sum(rows, 'pageview') });
    }
    const [totals, previous] = await Promise.all([period(cur, from, to), period(prev, prevFrom, addDays(from, -1))]);
    res.json({
      from, to, days, totals, previous, daily,
      pages: top(cur, 'pageview'),
      products: top(cur, 'pageview', isProduct, 5),
      services: top(cur, 'pageview', isService, 5),
      sources: top(cur, 'source'),
      devices: top(cur, 'device'),
      countries: top(cur, 'country'),
    });
  });
  return r;
}
