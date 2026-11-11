import { collections, ObjectId } from '@greenscape/content';
import { Prisma } from '@greenscape/database';
import { AssistantSend, AssistantSettings, KnowledgeDocInput, z } from '@greenscape/validation';
import { Router, type Response } from 'express';
import { audit } from '../../lib/audit.ts';
import type { Deps } from '../../lib/deps.ts';
import { AppError } from '../../lib/errors.ts';
import { SETTINGS_TAG } from '../../lib/notify.ts';
import { currentAuth, requireAuth, requirePermission } from '../../middleware/auth.ts';
import { formLimit } from '../../middleware/form-limit.ts';
import { postCustomerMessage } from '../admin/routes.ts';
import { ASSISTANT_SETTING_KEY, KNOWLEDGE_TAG, defaultSettings, loadKnowledge, loadSettings, retrieve, systemPrompt, withAvailability } from './knowledge.ts';
import { createProvider, providerStatus, type ChatTurn } from './providers.ts';

const Id = z.string().uuid();
const HISTORY_TURNS = 20;
const MAX_REPLY_CHARS = 12_000;
const REFUSED = "I can't help with that one. A person from our team can: use “Talk to a person” below.";
const FAILED = "Sorry, I couldn't answer just now. Please try again, or use “Talk to a person” below.";

/** The customer-facing assistant: config, streaming replies, own history, handover to staff. Sign-in required. */
export function assistantRoutes(deps: Deps) {
  const { db, env, redis, log } = deps;
  const r = Router();

  const usable = (s: AssistantSettings) => (s.provider === 'mock' && env.NODE_ENV === 'production' ? null : createProvider(s.provider, env));

  // Public: what the widget shows before sign-in. No personal data, so a short shared cache is fine.
  r.get('/assistant/config', async (_req, res) => {
    const s = await loadSettings(deps);
    res.set('cache-control', 'public, max-age=60').json({ enabled: s.enabled && !!usable(s), greeting: s.greeting, suggestedQuestions: s.suggestedQuestions, dailyLimit: s.dailyMessagesPerUser });
  });

  r.use('/assistant/conversations', requireAuth);
  r.get('/assistant/conversations', async (_req, res) => {
    const rows = await db.assistantConversation.findMany({ where: { userId: currentAuth(res).userId }, orderBy: { updatedAt: 'desc' }, take: 50, select: { id: true, title: true, status: true, updatedAt: true } });
    res.set('cache-control', 'no-store').json(rows.map((c) => ({ ...c, updatedAt: c.updatedAt.toISOString() })));
  });
  const own = async (res: Response, id: unknown) => {
    const c = await db.assistantConversation.findFirst({ where: { id: Id.parse(id), userId: currentAuth(res).userId } });
    if (!c) throw AppError.notFound('Conversation not found'); // same answer for someone else's
    return c;
  };
  r.get('/assistant/conversations/:id', async (req, res) => {
    const c = await own(res, req.params.id);
    const messages = await db.assistantMessage.findMany({ where: { conversationId: c.id }, orderBy: { createdAt: 'asc' }, take: 200, select: { id: true, role: true, content: true, createdAt: true } });
    res.set('cache-control', 'no-store').json({ id: c.id, title: c.title, status: c.status, messages: messages.map((m) => ({ ...m, createdAt: m.createdAt.toISOString() })) });
  });
  r.delete('/assistant/conversations/:id', async (req, res) => {
    const c = await own(res, req.params.id);
    await db.assistantConversation.delete({ where: { id: c.id } });
    res.status(204).end();
  });

  // Hand the conversation to a person: the transcript goes into the customer's Messages thread with staff.
  r.post('/assistant/conversations/:id/escalate', formLimit(deps, 'message', 30), async (req, res) => {
    const auth = currentAuth(res);
    const c = await own(res, req.params.id);
    const turns = await db.assistantMessage.findMany({ where: { conversationId: c.id }, orderBy: { createdAt: 'desc' }, take: 12, select: { role: true, content: true } });
    let transcript = turns.reverse().map((t) => `${t.role === 'user' ? 'Me' : 'AI assistant'}: ${t.content.replace(/\s+/g, ' ').trim()}`).join('\n');
    if (transcript.length > 3600) transcript = `…${transcript.slice(-3600)}`;
    await postCustomerMessage(deps, auth, `I'd like to talk to a person. My chat with the AI assistant so far:\n\n${transcript}`);
    await db.assistantConversation.update({ where: { id: c.id }, data: { status: 'escalated' } });
    res.status(201).json({ ok: true, messagesUrl: '/messages' });
  });

  /**
   * Send a message and stream the reply as server-sent events: `meta` (ids), `delta` (text), then `done` or `error`.
   * Guards, cheapest first: per-user rate limit, one reply at a time per user, a rolling 24-hour quota from the database.
   */
  r.post('/assistant/messages', requireAuth, formLimit(deps, 'assistant', 60), async (req, res) => {
    const auth = currentAuth(res);
    const input = AssistantSend.parse(req.body);
    const settings = await loadSettings(deps);
    const provider = settings.enabled ? usable(settings) : null;
    if (!provider) throw new AppError(503, 'ASSISTANT_UNAVAILABLE', 'The assistant is not available right now. Please use “Talk to a person” or call us on 0917 844 3330.');

    const since = new Date(Date.now() - 86_400_000);
    const used = await db.assistantMessage.count({ where: { role: 'user', createdAt: { gte: since }, conversation: { userId: auth.userId } } });
    if (used >= settings.dailyMessagesPerUser) throw new AppError(429, 'ASSISTANT_QUOTA', `You've reached today's limit of ${settings.dailyMessagesPerUser} messages. Please try again tomorrow, or use “Talk to a person”.`);

    const lockKey = `${env.CACHE_PREFIX}:lock:assistant:${auth.userId}`;
    if (!(await redis.set(lockKey, '1', 'EX', 120, 'NX'))) throw AppError.conflict('Please wait for the current reply to finish.');
    try {
      const conversation = input.conversationId
        ? await own(res, input.conversationId)
        : await db.assistantConversation.create({ data: { userId: auth.userId, title: input.message.replace(/\s+/g, ' ').slice(0, 60) } });
      const history = await db.assistantMessage.findMany({ where: { conversationId: conversation.id, error: null }, orderBy: { createdAt: 'desc' }, take: HISTORY_TURNS, select: { role: true, content: true } });
      const turns: ChatTurn[] = history.reverse().map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content }));
      while (turns[0]?.role === 'assistant') turns.shift(); // providers expect the first turn to be the user's
      turns.push({ role: 'user', content: input.message });
      const userMessage = await db.assistantMessage.create({ data: { conversationId: conversation.id, role: 'user', content: input.message } });

      const lastUserTurns = turns.filter((t) => t.role === 'user').slice(-2).map((t) => t.content).join(' ');
      const snippets = await withAvailability(deps, retrieve(await loadKnowledge(deps, settings.sources), lastUserTurns));
      const name = (await db.user.findUnique({ where: { id: auth.userId }, select: { displayName: true } }))?.displayName ?? null;
      const system = systemPrompt(settings, snippets, name);

      res.status(200).set({ 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', 'x-accel-buffering': 'no', connection: 'keep-alive' });
      res.flushHeaders();
      const send = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      send('meta', { conversationId: conversation.id, userMessageId: userMessage.id, title: conversation.title });

      const abort = new AbortController();
      res.on('close', () => abort.abort()); // the visitor closed the widget or left: stop paying for tokens
      let text = '';
      let outcome: { model?: string; inputTokens?: number; outputTokens?: number; refused?: boolean; error?: string } = {};
      try {
        for await (const ev of provider.stream({ system, messages: turns, model: settings.model, maxOutputTokens: settings.maxOutputTokens, signal: abort.signal })) {
          if (ev.type === 'text') {
            if (text.length >= MAX_REPLY_CHARS) continue;
            text += ev.text;
            send('delta', { text: ev.text });
          } else outcome = { ...outcome, ...ev };
        }
      } catch (err) {
        outcome.error = abort.signal.aborted ? 'aborted' : err instanceof Error ? err.message.slice(0, 300) : 'unknown error';
        if (!abort.signal.aborted) log.error({ err, provider: provider.name, model: settings.model }, 'assistant provider failed');
      }
      const aborted = outcome.error === 'aborted';
      const content = aborted ? text || '(stopped)' : outcome.error ? FAILED : outcome.refused || !text.trim() ? REFUSED : text;
      const saved = await db.assistantMessage.create({
        data: { conversationId: conversation.id, role: 'assistant', content, provider: provider.name, model: outcome.model ?? settings.model, inputTokens: outcome.inputTokens, outputTokens: outcome.outputTokens, error: outcome.error ?? (outcome.refused ? 'refused' : null) },
      });
      await db.assistantConversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } });
      if (!abort.signal.aborted) {
        if (outcome.error) send('error', { message: FAILED, messageId: saved.id });
        else send('done', { messageId: saved.id, replaced: content !== text ? content : undefined });
        res.end();
      }
    } finally {
      await redis.del(lockKey).catch(() => undefined);
    }
  });

  return r;
}

/** Admin: settings, approved knowledge, usage and (personal data, audited) customer conversations. */
export function assistantAdminRoutes(deps: Deps) {
  const { db, env, cache, mongo } = deps;
  const r = Router();
  const knowledge = () => mongo.db.collection(collections.assistantKnowledge);
  const oid = (id: unknown) => {
    if (typeof id !== 'string' || !/^[0-9a-f]{24}$/.test(id)) throw AppError.notFound('Document not found');
    return new ObjectId(id);
  };

  r.get('/settings', requirePermission('assistant.manage'), async (_req, res) => {
    res.set('cache-control', 'no-store').json({ settings: await loadSettings(deps), defaults: defaultSettings(env), providers: providerStatus(env), production: env.NODE_ENV === 'production' });
  });
  r.put('/settings', requirePermission('assistant.manage'), async (req, res) => {
    const value = AssistantSettings.parse(req.body);
    if (!providerStatus(env)[value.provider]) throw AppError.badRequest('That provider has no API key on the server yet. See docs/auth/ai-assistant.md.');
    if (value.provider === 'mock' && env.NODE_ENV === 'production' && value.enabled) throw AppError.badRequest('The offline test assistant cannot answer customers in production. Choose Claude or the OpenAI-compatible provider.');
    const userId = currentAuth(res).userId;
    await db.$transaction(async (tx) => {
      const before = await tx.appSetting.findUnique({ where: { key: ASSISTANT_SETTING_KEY } });
      await tx.appSetting.upsert({ where: { key: ASSISTANT_SETTING_KEY }, create: { key: ASSISTANT_SETTING_KEY, value, updatedById: userId }, update: { value, updatedById: userId } });
      await audit(tx, req, res, { action: 'assistant.settings', entityType: 'AppSetting', entityId: ASSISTANT_SETTING_KEY, before: before?.value, after: value });
    });
    await cache.invalidateTags([SETTINGS_TAG, KNOWLEDGE_TAG]);
    res.json({ settings: value });
  });

  r.get('/knowledge', requirePermission('assistant.manage'), async (_req, res) => {
    const docs = await knowledge().find({}).sort({ updatedAt: -1 }).limit(500).toArray();
    res.set('cache-control', 'no-store').json(docs.map((d) => ({ id: String(d._id), title: d.title, body: d.body, enabled: d.enabled, updatedAt: (d.updatedAt as Date).toISOString() })));
  });
  r.post('/knowledge', requirePermission('assistant.manage'), async (req, res) => {
    const doc = KnowledgeDocInput.parse(req.body);
    const { insertedId } = await knowledge().insertOne({ ...doc, updatedAt: new Date(), updatedBy: currentAuth(res).userId });
    await audit(db, req, res, { action: 'assistant.knowledge.create', entityType: 'AssistantKnowledge', entityId: String(insertedId), after: doc });
    await cache.invalidateTags([KNOWLEDGE_TAG]);
    res.status(201).json({ id: String(insertedId) });
  });
  r.put('/knowledge/:id', requirePermission('assistant.manage'), async (req, res) => {
    const _id = oid(req.params.id);
    const doc = KnowledgeDocInput.parse(req.body);
    const before = await knowledge().findOneAndUpdate({ _id }, { $set: { ...doc, updatedAt: new Date(), updatedBy: currentAuth(res).userId } });
    if (!before) throw AppError.notFound('Document not found');
    await audit(db, req, res, { action: 'assistant.knowledge.update', entityType: 'AssistantKnowledge', entityId: String(_id), before: { title: before.title, body: before.body, enabled: before.enabled }, after: doc });
    await cache.invalidateTags([KNOWLEDGE_TAG]);
    res.json({ ok: true });
  });
  r.delete('/knowledge/:id', requirePermission('assistant.manage'), async (req, res) => {
    const _id = oid(req.params.id);
    const before = await knowledge().findOneAndDelete({ _id });
    if (!before) throw AppError.notFound('Document not found');
    await audit(db, req, res, { action: 'assistant.knowledge.delete', entityType: 'AssistantKnowledge', entityId: String(_id), before: { title: before.title, body: before.body } });
    await cache.invalidateTags([KNOWLEDGE_TAG]);
    res.status(204).end();
  });

  // Usage: counts and tokens per Manila day, no message content.
  r.get('/usage', requirePermission('assistant.read'), async (_req, res) => {
    const days = await db.$queryRaw<{ day: string; messages: bigint; replies: bigint; errors: bigint; input_tokens: bigint | null; output_tokens: bigint | null; users: bigint }[]>(Prisma.sql`
      SELECT to_char(date_trunc('day', m."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Manila'), 'YYYY-MM-DD') AS day,
             count(*) FILTER (WHERE m.role = 'user') AS messages,
             count(*) FILTER (WHERE m.role = 'assistant') AS replies,
             count(*) FILTER (WHERE m.error IS NOT NULL AND m.error NOT IN ('aborted')) AS errors,
             sum(m."inputTokens") AS input_tokens, sum(m."outputTokens") AS output_tokens,
             count(DISTINCT c."userId") AS users
      FROM "AssistantMessage" m JOIN "AssistantConversation" c ON c.id = m."conversationId"
      WHERE m."createdAt" >= now() - interval '30 days'
      GROUP BY 1 ORDER BY 1`);
    const errors = await db.assistantMessage.findMany({ where: { error: { notIn: ['aborted'] }, NOT: { error: null } }, orderBy: { createdAt: 'desc' }, take: 25, select: { id: true, createdAt: true, provider: true, model: true, error: true } });
    const n = (v: bigint | null) => Number(v ?? 0);
    res.set('cache-control', 'no-store').json({
      days: days.map((d) => ({ day: d.day, messages: n(d.messages), replies: n(d.replies), errors: n(d.errors), inputTokens: n(d.input_tokens), outputTokens: n(d.output_tokens), users: n(d.users) })),
      errors: errors.map((e) => ({ ...e, createdAt: e.createdAt.toISOString() })),
    });
  });

  r.get('/conversations', requirePermission('assistant.read'), async (req, res) => {
    const q = z.object({ page: z.coerce.number().int().min(1).max(1000).default(1), status: z.enum(['open', 'escalated']).optional() }).parse(req.query);
    const where = q.status ? { status: q.status } : {};
    const [total, rows] = await Promise.all([
      db.assistantConversation.count({ where }),
      db.assistantConversation.findMany({ where, orderBy: { updatedAt: 'desc' }, skip: (q.page - 1) * 30, take: 30, select: { id: true, title: true, status: true, updatedAt: true, user: { select: { email: true, displayName: true } }, _count: { select: { messages: true } } } }),
    ]);
    res.set('cache-control', 'no-store').json({ total, page: q.page, pageSize: 30, rows: rows.map((c) => ({ id: c.id, title: c.title, status: c.status, updatedAt: c.updatedAt.toISOString(), customer: c.user.displayName ?? c.user.email, email: c.user.email, messages: c._count.messages })) });
  });
  r.get('/conversations/:id', requirePermission('assistant.read'), async (req, res) => {
    const id = Id.parse(req.params.id);
    const c = await db.assistantConversation.findUnique({ where: { id }, include: { user: { select: { email: true, displayName: true } }, messages: { orderBy: { createdAt: 'asc' }, take: 500 } } });
    if (!c) throw AppError.notFound('Conversation not found');
    await audit(db, req, res, { action: 'assistant.conversation.view', entityType: 'AssistantConversation', entityId: id }); // reading a customer's chat is logged
    res.set('cache-control', 'no-store').json({
      id: c.id, title: c.title, status: c.status, customer: c.user.displayName ?? c.user.email, email: c.user.email,
      messages: c.messages.map((m) => ({ id: m.id, role: m.role, content: m.content, provider: m.provider, model: m.model, inputTokens: m.inputTokens, outputTokens: m.outputTokens, error: m.error, createdAt: m.createdAt.toISOString() })),
    });
  });
  return r;
}

/** Deletes assistant conversations untouched for longer than the retention setting. Runs every six hours. */
export function startAssistantJobs(deps: Deps, everyMs = 6 * 3_600_000) {
  const tick = async () => {
    const got = await deps.redis.set(`${deps.env.CACHE_PREFIX}:lock:assistant-retention`, '1', 'PX', Math.min(everyMs - 1000, 600_000), 'NX').catch(() => 'OK');
    if (!got) return;
    const { retentionDays } = await loadSettings(deps);
    const { count } = await deps.db.assistantConversation.deleteMany({ where: { updatedAt: { lt: new Date(Date.now() - retentionDays * 86_400_000) } } });
    if (count) deps.log.info({ deleted: count, retentionDays }, 'old assistant conversations deleted');
  };
  const timer = setInterval(() => void tick().catch((err) => deps.log.error({ err }, 'assistant retention failed')), everyMs);
  timer.unref();
  return { stop: () => clearInterval(timer), tick };
}
