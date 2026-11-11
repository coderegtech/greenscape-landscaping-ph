import { api } from '@greenscape/auth/api';
import { AssistantSettings, z } from '@greenscape/validation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AssistantSettingsForm } from '@/components/assistant-settings-form';
import { can, getStaff } from '@/lib/session';

export const metadata: Metadata = { title: 'AI assistant' };
export const dynamic = 'force-dynamic';

const Response = z.object({ settings: AssistantSettings, providers: z.record(z.string(), z.boolean()), production: z.boolean() });

export default async function AssistantPage() {
  const me = await getStaff();
  if (!me || !can(me, 'assistant.manage')) redirect('/');
  const { settings, providers, production } = await api('/v1/admin/assistant/settings', Response);
  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h2 className="text-3xl">AI assistant</h2>
        <p className="text-ink-2">
          The chat on the website answers signed-in customers from the published site, the shop and the <Link href="/assistant/knowledge">knowledge you approve</Link>.
          {can(me, 'assistant.read') && <> See <Link href="/assistant/conversations">chats and usage</Link>.</>}
        </p>
      </div>
      <AssistantSettingsForm settings={settings} providers={providers} production={production} />
    </div>
  );
}
