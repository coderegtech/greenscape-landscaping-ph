import { z } from 'zod';

/** A message to the AI assistant. Plain text; the conversation is optional (a new one is started without it). */
export const AssistantSend = z.object({
  conversationId: z.string().uuid().optional(),
  message: z.string().trim().min(1, 'Write a message first').max(2000, 'Keep it under 2,000 characters'),
});
export type AssistantSend = z.infer<typeof AssistantSend>;

export const ASSISTANT_PROVIDERS = { anthropic: 'Claude (Anthropic)', openai: 'OpenAI-compatible API', mock: 'Offline test assistant' } as const;
export type AssistantProvider = keyof typeof ASSISTANT_PROVIDERS;

/** Built-in knowledge the assistant may draw on, each switchable by an admin. */
export const ASSISTANT_SOURCES = {
  site: 'Contact details and opening hours',
  services: 'Landscaping services',
  faqs: 'Frequently asked questions',
  products: 'Shop products, prices and availability',
  delivery: 'Delivery areas and fees',
} as const;

/** Assistant settings (admin). API keys are never here: they stay in the API's environment. */
export const AssistantSettings = z.object({
  enabled: z.boolean(),
  greeting: z.string().trim().min(1).max(300),
  instructions: z.string().trim().max(4000),
  provider: z.enum(Object.keys(ASSISTANT_PROVIDERS) as [AssistantProvider, ...AssistantProvider[]]),
  model: z.string().trim().min(1).max(80).regex(/^[\w.:/-]+$/, 'Letters, digits and . : / - _ only'),
  maxOutputTokens: z.coerce.number().int().min(256).max(8000),
  dailyMessagesPerUser: z.coerce.number().int().min(1).max(500),
  retentionDays: z.coerce.number().int().min(7).max(730),
  suggestedQuestions: z.array(z.string().trim().min(3).max(120)).max(6),
  sources: z.object(Object.fromEntries(Object.keys(ASSISTANT_SOURCES).map((k) => [k, z.boolean()])) as Record<keyof typeof ASSISTANT_SOURCES, z.ZodBoolean>),
});
export type AssistantSettings = z.infer<typeof AssistantSettings>;

/** An approved knowledge document written by staff (MongoDB, alongside the CMS). */
export const KnowledgeDocInput = z.object({
  title: z.string().trim().min(3).max(120),
  body: z.string().trim().min(10).max(8000),
  enabled: z.boolean().default(true),
});
export type KnowledgeDocInput = z.infer<typeof KnowledgeDocInput>;
