import Anthropic from '@anthropic-ai/sdk';
import type { ChatProvider } from './providers.ts';

// Models that accept the server-side refusal fallback and the effort setting used below.
const FALLBACK_MODELS = new Set(['claude-fable-5-2', 'claude-fable-5-1', 'claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5']);
const EFFORT_MODEL = /^claude-(opus|sonnet|haiku|fable|mythos)-5/;

/**
 * Claude through the official Anthropic SDK, streamed. Default model: claude-opus-5-5 (set in the admin).
 * - effort "low": a chat widget answers short questions from supplied knowledge; low effort keeps replies quick.
 * - server-side refusal fallback ("default" routing) on models that support it; a refusal that survives it is
 *   reported as `refused` so the route can answer politely instead of showing nothing.
 * - Thinking is left at the model default (adaptive); its blocks are not shown to customers.
 */
export function anthropicProvider(apiKey: string): ChatProvider {
  const client = new Anthropic({ apiKey, maxRetries: 2, timeout: 60_000 });
  return {
    name: 'anthropic',
    async *stream({ system, messages, model, maxOutputTokens, signal }) {
      const stream = client.beta.messages.stream(
        {
          model,
          max_tokens: maxOutputTokens,
          system,
          messages,
          ...(EFFORT_MODEL.test(model) ? { output_config: { effort: 'low' as const } } : {}),
          ...(FALLBACK_MODELS.has(model) ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
        },
        { signal },
      );
      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') yield { type: 'text', text: event.delta.text };
      }
      const final = await stream.finalMessage();
      yield { type: 'done', model: final.model, inputTokens: final.usage.input_tokens, outputTokens: final.usage.output_tokens, refused: final.stop_reason === 'refusal' };
    },
  };
}
