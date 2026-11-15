// Socket.IO on the API's own HTTP server. The channel is server → client only: REST stays the one way to change
// data, and a socket only hears about changes after they are committed. Delivery is best effort; anything that must
// not be lost is a Postgres row (notifications) or is re-fetched by the client after every (re)connect.
//
// Rooms are assigned by the server from the verified account, never asked for by the client:
//   user:{userId}            every socket of a person (revocation, their own live changes)
//   session:{sessionId}      one sign-in session (sign-out closes it)
//   inbox:{app}:{userId}     notification events for one portal
//   perm:{permission}        admin sockets that hold a topic's read permission (live dashboards)
// The Redis adapter carries room broadcasts and disconnects across API instances.
import { randomUUID } from 'node:crypto';
import type { Server as HttpServer } from 'node:http';
import { createAdapter } from '@socket.io/redis-adapter';
import type { Redis } from '@greenscape/cache';
import { NOTIFICATION_APPS, REALTIME_PATH, type LiveSignal, type LiveTopic, type NotificationApp, type RealtimeServerEvents } from '@greenscape/validation';
import { Server } from 'socket.io';
import type { Deps } from '../lib/deps.ts';
import { AppError } from '../lib/errors.ts';
import type { Logger } from '../lib/logger.ts';
import { resolveAuth } from '../middleware/auth.ts';

/** Which permission an admin socket needs to hear a topic. Employees hear only changes to their own records. */
export const TOPIC_PERMISSION: Record<LiveTopic, string> = {
  attendance: 'attendance.read',
  corrections: 'attendance.read',
  leave: 'leave.read',
  schedule: 'employees.read',
  employees: 'employees.read',
  users: 'users.read',
  orders: 'orders.read',
  inventory: 'inventory.read',
  products: 'products.read',
  quotations: 'quotations.read',
  messages: 'messages.read',
  cms: 'cms.read',
};
/** Who may open a socket for each portal: the same gate the portal itself uses. */
const APP_PERMISSION: Record<NotificationApp, string | null> = { web: null, admin: 'admin.access', employee: 'attendance.self' };
const MAX_PER_USER = 10; // tabs and devices; protects the process from a runaway client

export interface HubEvent {
  userId: string;
  app: NotificationApp;
  /** created | read | read_all | deleted | cleared */
  event: string;
  data: unknown;
}
interface SocketData { userId: string; app: NotificationApp; sessionId?: string }

/** Rooms for a verified connection. Pure, so the permission → room rule is unit-tested. */
export function roomsFor(a: { userId: string; app: NotificationApp; sessionId?: string; permissions: ReadonlySet<string> }) {
  const staff = a.app === 'admin' ? [...new Set(Object.values(TOPIC_PERMISSION))].filter((p) => a.permissions.has(p)).map((p) => `perm:${p}`) : [];
  return [`user:${a.userId}`, `inbox:${a.app}:${a.userId}`, ...(a.sessionId ? [`session:${a.sessionId}`] : []), ...staff];
}

/** The client address, as Express sees it with `trust proxy` = 1 (the last X-Forwarded-For hop). */
const addressOf = (h: { headers: Record<string, string | string[] | undefined>; address: string }) => {
  const xff = h.headers['x-forwarded-for'];
  return (typeof xff === 'string' ? xff.split(',').at(-1)?.trim() : undefined) || h.address;
};

export function createRealtime({ env, log, redis }: { env: Deps['env']; log: Logger; redis: Redis }) {
  const io = new Server<Record<string, never>, RealtimeServerEvents, Record<string, never>, SocketData>({
    path: REALTIME_PATH,
    serveClient: false,
    maxHttpBufferSize: 4096, // clients send nothing but the handshake
    pingInterval: 25_000, // keeps proxies from idling the connection out
    pingTimeout: 20_000,
    connectTimeout: 10_000,
    cors: { origin: env.CORS_ORIGINS, credentials: false },
    // CORS binds only polling; the Origin check here covers the WebSocket upgrade too. No Origin = a server-side client.
    allowRequest: (req, cb) => cb(null, !req.headers.origin || env.CORS_ORIGINS.includes(req.headers.origin)),
  });

  // Pub/sub connections of their own. Publishing never throws or queues while Redis is away: delivery falls back to this
  // instance's clients, and every client re-fetches on reconnect.
  const pub = redis.duplicate({ lazyConnect: true, enableOfflineQueue: false });
  const sub = redis.duplicate({ lazyConnect: true, enableOfflineQueue: true, maxRetriesPerRequest: null });
  const publish = pub.publish.bind(pub) as (channel: string, message: string | Buffer) => Promise<number>;
  (pub as unknown as { publish: typeof publish }).publish = (channel, message) => publish(channel, message).catch(() => 0);
  for (const [name, c] of [['pub', pub], ['sub', sub]] as const) c.on('error', (err) => log.warn({ err: err.message, conn: name }, 'realtime redis error'));
  io.adapter(createAdapter(pub, sub, { key: `${env.CACHE_PREFIX}:sio` })); // subscribing connects `sub`
  void pub.connect().catch(() => undefined); // ioredis keeps retrying in the background

  let attached = false;
  const perUser = new Map<string, number>();
  const signal = (topic: LiveTopic, kind: string, ref?: string): LiveSignal => ({ v: 1, id: randomUUID(), topic, kind, ...(ref ? { ref } : {}), at: new Date().toISOString() });

  async function connectAllowed(address: string) {
    try {
      const key = `${env.CACHE_PREFIX}:rt:conn:${address}`;
      const n = await redis.incr(key);
      if (n === 1) await redis.expire(key, 60);
      return n <= env.RATE_LIMIT_PER_MIN; // same per-address budget as REST requests
    } catch {
      return true; // Redis down: the per-user cap still applies
    }
  }

  /** Registers authentication and the connection handler. Needs the full deps (token verification, Postgres). */
  function start(deps: Deps) {
    io.use(async (socket, next) => {
      try {
        const { token, app } = (socket.handshake.auth ?? {}) as { token?: unknown; app?: unknown };
        if (typeof token !== 'string' || !token) throw AppError.unauthorized('Sign in to connect');
        if (!NOTIFICATION_APPS.includes(app as NotificationApp)) throw AppError.badRequest('Unknown app');
        if (!(await connectAllowed(addressOf(socket.handshake)))) throw new AppError(429, 'TOO_MANY_CONNECTIONS', 'Too many connection attempts. Try again in a minute.');
        const auth = await resolveAuth(deps, token); // signature, expiry, sign-out, suspension, current permissions
        const need = APP_PERMISSION[app as NotificationApp];
        if (need && !auth.permissions.has(need)) throw AppError.forbidden('This account cannot use this portal');
        if ((perUser.get(auth.userId) ?? 0) >= MAX_PER_USER) throw new AppError(429, 'TOO_MANY_STREAMS', 'Too many open connections for this account');
        socket.data = { userId: auth.userId, app: app as NotificationApp, sessionId: auth.sessionId };
        socket.join(roomsFor({ userId: auth.userId, app: app as NotificationApp, sessionId: auth.sessionId, permissions: auth.permissions }));
        // Access tokens are short-lived. At expiry the socket is closed; the client reconnects with a fresh token,
        // which re-checks the account and its permissions.
        const ttl = Math.min(2 ** 31 - 1, Math.max(1000, auth.expiresAt * 1000 - Date.now()));
        const timer = setTimeout(() => socket.disconnect(true), ttl);
        socket.on('disconnect', () => clearTimeout(timer));
        next();
      } catch (err) {
        const known = err instanceof AppError ? err : null;
        if (!known) log.error({ err }, 'realtime handshake failed');
        // Safe message and code only; never the token or internals.
        next(Object.assign(new Error(known?.message ?? 'Could not connect'), { data: { code: known?.code ?? 'INTERNAL', status: known?.status ?? 500 } }));
      }
    });

    io.on('connection', (socket) => {
      const { userId, app } = socket.data;
      perUser.set(userId, (perUser.get(userId) ?? 0) + 1);
      // Server → client only: a client that sends anything is not one of ours.
      socket.onAny(() => socket.disconnect(true));
      socket.on('disconnect', (reason) => {
        const n = (perUser.get(userId) ?? 1) - 1;
        if (n > 0) perUser.set(userId, n);
        else perUser.delete(userId);
        log.debug({ event: 'realtime.disconnected', userId, app, reason }, 'realtime.disconnected');
      });
      log.debug({ event: 'realtime.connected', userId, app }, 'realtime.connected');
    });
  }

  return {
    io,
    start,
    attach: (server: HttpServer) => { attached = true; return io.attach(server); },
    /** For health checks: is the socket server on the API's HTTP server, and how many sockets are open on this instance. */
    status: () => ({ attached, connections: io.of('/').sockets.size }),
    /** Notification inbox events (the notification service is the only caller). */
    publish: (e: HubEvent) => io.to(`inbox:${e.app}:${e.userId}`).emit('notification', { event: e.event, data: e.data }),
    /** "Topic changed" to the staff who may read it, and to the given people (their own records). */
    live(topic: LiveTopic, kind: string, opts: { ref?: string; userIds?: (string | null | undefined)[] } = {}) {
      const rooms = [`perm:${TOPIC_PERMISSION[topic]}`, ...(opts.userIds ?? []).filter((u): u is string => !!u).map((u) => `user:${u}`)];
      io.to(rooms).emit('live', signal(topic, kind, opts.ref));
    },
    /** Closes every socket of a person (access changed) or of one session (signed out). They reconnect only if still allowed. */
    disconnectUser: (userId: string) => io.in(`user:${userId}`).disconnectSockets(true),
    disconnectSession: (sessionId: string) => io.in(`session:${sessionId}`).disconnectSockets(true),
    /** Open sockets on this instance. */
    connections: () => io.of('/').sockets.size,
    async close() {
      await io.close().catch(() => undefined); // also closes the attached HTTP server
      pub.disconnect(); // not quit(): with Redis unreachable a queued QUIT would wait forever
      sub.disconnect();
    },
  };
}
export type Realtime = ReturnType<typeof createRealtime>;
