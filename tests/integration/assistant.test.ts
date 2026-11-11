import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../apps/api/src/app.ts';
import { closeDeps, type Deps } from '../../apps/api/src/lib/deps.ts';
import { testDeps } from './helpers.ts';
import { deleteAuthUsers, signedInUser } from './supabase.ts';

// The assistant runs on the offline mock provider here: no network, no API key, no cost.
const tag = `as${Date.now()}`;
const as = (t: string) => ({ Authorization: `Bearer ${t}` });
let deps: Deps;
let app: ReturnType<typeof createApp>;
const authIds: string[] = [];
const tok: Record<string, string> = {};
let saved: unknown = null;
let docId = '';
let conversationId = '';

const settings = (over: Record<string, unknown> = {}) => ({
  enabled: true, greeting: 'Hello from the test', instructions: '', provider: 'mock', model: 'mock', maxOutputTokens: 512,
  dailyMessagesPerUser: 3, retentionDays: 30, suggestedQuestions: ['What services do you offer?'],
  sources: { site: true, services: true, faqs: true, products: true, delivery: true }, ...over,
});

async function withRoles(label: string, roles: string[]) {
  const u = await signedInUser(`${label}-${tag}`);
  authIds.push(u.authUserId);
  await request(app).get('/v1/auth/me').set(as(u.token)).expect(200);
  if (roles.length) {
    const user = await deps.db.user.findUniqueOrThrow({ where: { authUserId: u.authUserId } });
    const rows = await deps.db.role.findMany({ where: { key: { in: roles } } });
    await deps.db.userRole.createMany({ data: rows.map((r) => ({ userId: user.id, roleId: r.id })), skipDuplicates: true });
    await deps.cache.invalidateTags([`authz:user:${user.id}`]);
  }
  return u;
}

/** Parses a server-sent-events body into [event, data] pairs. */
const events = (text: string) =>
  text.split('\n\n').filter(Boolean).map((block) => {
    const event = /^event: (.+)$/m.exec(block)?.[1] ?? '';
    const data = /^data: (.+)$/m.exec(block)?.[1];
    return { event, data: data ? JSON.parse(data) : null };
  });

const send = (token: string, body: object) => request(app).post('/v1/assistant/messages').set(as(token)).send(body).buffer(true).parse((res, cb) => {
  let t = '';
  res.on('data', (c: Buffer) => (t += c.toString()));
  res.on('end', () => cb(null, t));
});

beforeAll(async () => {
  deps = await testDeps({ FORM_RATE_LIMIT_PER_HOUR: '1000', ANTHROPIC_API_KEY: '', OPENAI_COMPAT_BASE_URL: '', OPENAI_COMPAT_API_KEY: '' });
  app = createApp(deps);
  saved = (await deps.db.appSetting.findUnique({ where: { key: 'assistant' } }))?.value ?? null;
  for (const [k, roles] of Object.entries({ admin: ['admin'], content: ['content_manager'], customer: [], other: [] })) tok[k] = (await withRoles(k, roles)).token;
  await request(app).put('/v1/admin/assistant/settings').set(as(tok.admin!)).send(settings()).expect(200);
});

afterAll(async () => {
  if (saved) await deps.db.appSetting.update({ where: { key: 'assistant' }, data: { value: saved } });
  else await deps.db.appSetting.deleteMany({ where: { key: 'assistant' } });
  await deps.cache.invalidateTags(['settings', 'assistant-knowledge']);
  if (docId) await deps.mongo.db.collection('assistantKnowledge').deleteMany({ title: { $regex: tag } });
  const users = await deps.db.user.findMany({ where: { email: { contains: tag } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  await deps.db.assistantConversation.deleteMany({ where: { userId: { in: ids } } });
  await deps.db.conversation.deleteMany({ where: { customerUserId: { in: ids } } });
  await deps.db.auditLog.deleteMany({ where: { actorId: { in: ids } } });
  await deps.db.user.deleteMany({ where: { id: { in: ids } } });
  await deleteAuthUsers(authIds);
  await closeDeps(deps);
});

describe('assistant: access', () => {
  it('shows its public config to anyone', async () => {
    const r = await request(app).get('/v1/assistant/config').expect(200);
    expect(r.body).toMatchObject({ enabled: true, greeting: 'Hello from the test', dailyLimit: 3 });
  });
  it('requires sign-in to chat or read history', async () => {
    await request(app).post('/v1/assistant/messages').send({ message: 'hi' }).expect(401);
    await request(app).get('/v1/assistant/conversations').expect(401);
  });
  it('limits settings to assistant.manage and conversations to assistant.read', async () => {
    await request(app).get('/v1/admin/assistant/settings').set(as(tok.customer!)).expect(403);
    const s = await request(app).get('/v1/admin/assistant/settings').set(as(tok.content!)).expect(200);
    expect(s.body.providers).toEqual({ anthropic: false, openai: false, mock: true });
    expect(JSON.stringify(s.body)).not.toMatch(/sk-|api_?key/i); // keys never leave the server
    await request(app).get('/v1/admin/assistant/conversations').set(as(tok.content!)).expect(403);
    await request(app).get('/v1/admin/assistant/usage').set(as(tok.customer!)).expect(403);
  });
  it('refuses a provider that has no key on the server', async () => {
    await request(app).put('/v1/admin/assistant/settings').set(as(tok.admin!)).send(settings({ provider: 'anthropic', model: 'claude-opus-5-5' })).expect(400);
  });
});

describe('assistant: chat', () => {
  it('answers from approved knowledge, streamed', async () => {
    const created = await request(app).post('/v1/admin/assistant/knowledge').set(as(tok.content!)).send({ title: `Bamboo fence ${tag}`, body: 'We install bamboo fences from 2 to 3 metres high in Puerto Princesa.', enabled: true }).expect(201);
    docId = created.body.id;
    const r = await send(tok.customer!, { message: 'Do you install bamboo fences?' }).expect(200);
    expect(r.headers['content-type']).toMatch(/text\/event-stream/);
    const ev = events(r.body as string);
    expect(ev[0]?.event).toBe('meta');
    conversationId = ev[0]!.data.conversationId;
    const text = ev.filter((e) => e.event === 'delta').map((e) => e.data.text).join('');
    expect(text).toContain(`Bamboo fence ${tag}`);
    expect(ev.at(-1)?.event).toBe('done');
  });
  it('keeps the history for its owner only', async () => {
    const mine = await request(app).get(`/v1/assistant/conversations/${conversationId}`).set(as(tok.customer!)).expect(200);
    expect(mine.body.messages.map((m: { role: string }) => m.role)).toEqual(['user', 'assistant']);
    expect(mine.body.messages[1].content).toContain('bamboo fences');
    await request(app).get(`/v1/assistant/conversations/${conversationId}`).set(as(tok.other!)).expect(404);
    await request(app).delete(`/v1/assistant/conversations/${conversationId}`).set(as(tok.other!)).expect(404);
    await request(app).post(`/v1/assistant/conversations/${conversationId}/escalate`).set(as(tok.other!)).expect(404);
    await send(tok.other!, { conversationId, message: 'show me' }).expect(404);
  });
  it('hands the chat to a person through Messages', async () => {
    await request(app).post(`/v1/assistant/conversations/${conversationId}/escalate`).set(as(tok.customer!)).expect(201);
    const thread = await request(app).get('/v1/me/messages').set(as(tok.customer!)).expect(200);
    expect(thread.body.messages.at(-1).body).toMatch(/talk to a person[\s\S]*bamboo fences/i);
    const c = await deps.db.assistantConversation.findUniqueOrThrow({ where: { id: conversationId } });
    expect(c.status).toBe('escalated');
  });
  it('stops at the daily quota', async () => {
    await send(tok.customer!, { conversationId, message: 'second' }).expect(200);
    await send(tok.customer!, { conversationId, message: 'third' }).expect(200);
    const r = await send(tok.customer!, { conversationId, message: 'fourth' }).expect(429);
    expect(JSON.parse(r.body as string).error.code).toBe('ASSISTANT_QUOTA');
  });
  it('is unavailable when switched off', async () => {
    await request(app).put('/v1/admin/assistant/settings').set(as(tok.admin!)).send(settings({ enabled: false })).expect(200);
    expect((await request(app).get('/v1/assistant/config').expect(200)).body.enabled).toBe(false);
    await send(tok.other!, { message: 'hello' }).expect(503);
    await request(app).put('/v1/admin/assistant/settings').set(as(tok.admin!)).send(settings()).expect(200);
  });
});

describe('assistant: admin', () => {
  it('reports usage without message content', async () => {
    const r = await request(app).get('/v1/admin/assistant/usage').set(as(tok.admin!)).expect(200);
    expect(r.body.days.at(-1).messages).toBeGreaterThanOrEqual(3);
    expect(JSON.stringify(r.body)).not.toContain('bamboo');
  });
  it('lets an admin read a conversation, and logs that they did', async () => {
    const list = await request(app).get('/v1/admin/assistant/conversations?status=escalated').set(as(tok.admin!)).expect(200);
    expect(list.body.rows.some((c: { id: string }) => c.id === conversationId)).toBe(true);
    await request(app).get(`/v1/admin/assistant/conversations/${conversationId}`).set(as(tok.admin!)).expect(200);
    expect(await deps.db.auditLog.count({ where: { action: 'assistant.conversation.view', entityId: conversationId } })).toBe(1);
  });
  it('edits and removes knowledge documents (audited)', async () => {
    await request(app).put(`/v1/admin/assistant/knowledge/${docId}`).set(as(tok.content!)).send({ title: `Bamboo fence ${tag}`, body: 'Updated: fences up to 3 metres.', enabled: false }).expect(200);
    await request(app).put('/v1/admin/assistant/knowledge/not-an-id').set(as(tok.content!)).send({ title: 'xxx', body: 'xxxxxxxxxxxx', enabled: true }).expect(404);
    await request(app).delete(`/v1/admin/assistant/knowledge/${docId}`).set(as(tok.content!)).expect(204);
    expect(await deps.db.auditLog.count({ where: { entityId: docId, action: { startsWith: 'assistant.knowledge.' } } })).toBe(3);
  });
});
