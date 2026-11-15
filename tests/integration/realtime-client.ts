// A real Socket.IO client, connected the way the portals connect (token in the handshake, never in the URL).
import { REALTIME_PATH, type LiveSignal, type RealtimeServerEvents } from '@greenscape/validation';
import { io, type Socket } from 'socket.io-client';
import { expect, vi } from 'vitest';

export type Refusal = Error & { code?: string };

/** Resolves once connected; rejects with the server's refusal code (e.g. FORBIDDEN) when the handshake is refused. */
export async function openSocket(base: string, token: string | undefined, app: string) {
  const socket: Socket<RealtimeServerEvents> = io(base, { path: REALTIME_PATH, transports: ['websocket'], auth: { token, app }, reconnection: false, forceNew: true });
  const events: { event: string; data: Record<string, any> }[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any
  const live: LiveSignal[] = [];
  const disconnects: string[] = [];
  socket.on('connect', () => events.push({ event: 'ready', data: {} }));
  socket.on('notification', (e) => events.push(e as (typeof events)[number]));
  socket.on('live', (s) => live.push(s));
  socket.on('disconnect', (r) => disconnects.push(r));
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', () => resolve());
    socket.once('connect_error', (err) => { socket.close(); reject(Object.assign(err, { code: (err as { data?: { code?: string } }).data?.code })); });
  });
  const until = <T>(fn: () => T) => vi.waitFor(fn, { timeout: 5000, interval: 25 });
  return {
    socket, events, live, disconnects,
    waitFor: (event: string, n = 1) => until(() => { const m = events.filter((e) => e.event === event); expect(m.length).toBeGreaterThanOrEqual(n); return m; }),
    waitLive: (topic: string, kind?: string) => until(() => { const m = live.filter((s) => s.topic === topic && (!kind || s.kind === kind)); expect(m.length).toBeGreaterThan(0); return m; }),
    waitDisconnect: () => until(() => { expect(disconnects.length).toBeGreaterThan(0); return disconnects; }),
    close: () => socket.close(),
  };
}

/** The refusal code of a handshake that must fail. */
export const refusal = (p: Promise<unknown>) => p.then(() => 'CONNECTED', (e: Refusal) => e.code ?? e.message);
