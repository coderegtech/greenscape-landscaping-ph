'use server';
// AI assistant settings and knowledge. The API checks assistant.manage and audits every change.
import { api, attempt } from '@greenscape/auth/api';
import { z } from '@greenscape/validation';
import { revalidatePath } from 'next/cache';

const Any = z.any();
const DocId = z.string().regex(/^[0-9a-f]{24}$/);
const json = (method: string, body?: unknown) => ({ method, body: body === undefined ? undefined : JSON.stringify(body) });

export async function saveAssistantSettings(input: unknown) {
  return attempt(async () => {
    const out = await api('/v1/admin/assistant/settings', Any, json('PUT', input));
    revalidatePath('/assistant');
    return out;
  });
}
export async function saveKnowledge(id: string | null, input: unknown) {
  return attempt(async () => {
    const out = id ? await api(`/v1/admin/assistant/knowledge/${DocId.parse(id)}`, Any, json('PUT', input)) : await api('/v1/admin/assistant/knowledge', Any, json('POST', input));
    revalidatePath('/assistant/knowledge');
    return out;
  });
}
export async function deleteKnowledge(id: string) {
  return attempt(async () => {
    await api(`/v1/admin/assistant/knowledge/${DocId.parse(id)}`, z.unknown(), json('DELETE'));
    revalidatePath('/assistant/knowledge');
    return true;
  });
}
