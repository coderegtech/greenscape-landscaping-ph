import type { ChatProvider } from './providers.ts';

/**
 * Any chat-completions API that speaks the OpenAI wire format (base URL + key + model from the environment and the
 * admin). Streams server-sent events and reads token usage from the final chunk when the server sends it.
 */
export function openAiCompatibleProvider(baseUrl: string, apiKey: string): ChatProvider {
  const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
  return {
    name: 'openai',
    async *stream({ system, messages, model, maxOutputTokens, signal }) {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, stream: true, stream_options: { include_usage: true }, max_tokens: maxOutputTokens, messages: [{ role: 'system', content: system }, ...messages] }),
        signal: signal ?? AbortSignal.timeout(60_000),
      });
      if (!res.ok || !res.body) throw new Error(`provider returned ${res.status}`);
      let usage: { prompt_tokens?: number; completion_tokens?: number } | undefined;
      let usedModel = model;
      let buffer = '';
      const decoder = new TextDecoder();
      for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
        buffer += decoder.decode(chunk, { stream: true });
        let nl: number;
        while ((nl = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim();
          if (data === '[DONE]') continue;
          let json: { model?: string; usage?: typeof usage; choices?: { delta?: { content?: string } }[] };
          try {
            json = JSON.parse(data);
          } catch {
            continue; // a keep-alive or partial line
          }
          if (json.model) usedModel = json.model;
          if (json.usage) usage = json.usage;
          const text = json.choices?.[0]?.delta?.content;
          if (text) yield { type: 'text', text };
        }
      }
      yield { type: 'done', model: usedModel, inputTokens: usage?.prompt_tokens, outputTokens: usage?.completion_tokens };
    },
  };
}
