import type { AssistantProvider } from '@greenscape/validation';
import type { Env } from '../../config/env.ts';
import { anthropicProvider } from './provider-anthropic.ts';
import { openAiCompatibleProvider } from './provider-openai-compatible.ts';

/** One turn of a conversation as every provider sees it. */
export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}
export interface ProviderRequest {
  system: string;
  messages: ChatTurn[];
  model: string;
  maxOutputTokens: number;
  signal?: AbortSignal;
}
export type ProviderEvent =
  | { type: 'text'; text: string }
  | { type: 'done'; model: string; inputTokens?: number; outputTokens?: number; refused?: boolean };

/** The provider-independent interface the assistant talks to. Adapters live in their own files. */
export interface ChatProvider {
  name: AssistantProvider;
  stream(req: ProviderRequest): AsyncIterable<ProviderEvent>;
}

/** Which providers have credentials in this environment (shown in the admin; keys themselves are never sent). */
export const providerStatus = (env: Env) => ({
  anthropic: !!env.ANTHROPIC_API_KEY,
  openai: !!(env.OPENAI_COMPAT_BASE_URL && env.OPENAI_COMPAT_API_KEY),
  mock: true,
});

export function createProvider(name: AssistantProvider, env: Env): ChatProvider | null {
  if (name === 'anthropic') return env.ANTHROPIC_API_KEY ? anthropicProvider(env.ANTHROPIC_API_KEY) : null;
  if (name === 'openai') return env.OPENAI_COMPAT_BASE_URL && env.OPENAI_COMPAT_API_KEY ? openAiCompatibleProvider(env.OPENAI_COMPAT_BASE_URL, env.OPENAI_COMPAT_API_KEY) : null;
  return mockProvider();
}

/**
 * Offline assistant for local development and automated tests: answers from the knowledge it was given (the first
 * snippet), never calls a network service and never costs anything. Its replies say they come from the test assistant.
 */
export function mockProvider(): ChatProvider {
  return {
    name: 'mock',
    async *stream({ system, messages, signal }) {
      const question = messages.at(-1)?.content ?? '';
      const first = /<source title="([^"]+)"[^>]*>\n?([\s\S]*?)<\/source>/.exec(system);
      const answer = first
        ? `(Test assistant) From "${first[1]}": ${first[2]!.trim().replace(/\s+/g, ' ').slice(0, 280)}`
        : `(Test assistant) I don't have that in our information yet. You asked: "${question.slice(0, 120)}". Please contact the team.`;
      for (const word of answer.split(/(?<=\s)/)) {
        if (signal?.aborted) return;
        yield { type: 'text', text: word };
        await new Promise((r) => setTimeout(r, 8));
      }
      yield { type: 'done', model: 'mock', inputTokens: Math.ceil(system.length / 4), outputTokens: Math.ceil(answer.length / 4) };
    },
  };
}
