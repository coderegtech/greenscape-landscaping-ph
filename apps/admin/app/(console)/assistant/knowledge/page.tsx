import { api } from '@greenscape/auth/api';
import { z } from '@greenscape/validation';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { KnowledgeManager } from '@/components/knowledge-manager';
import { can, getStaff } from '@/lib/session';

export const metadata: Metadata = { title: 'Assistant knowledge' };
export const dynamic = 'force-dynamic';

const Doc = z.object({ id: z.string(), title: z.string(), body: z.string(), enabled: z.boolean(), updatedAt: z.string() });

export default async function KnowledgePage() {
  const me = await getStaff();
  if (!me || !can(me, 'assistant.manage')) redirect('/');
  const docs = await api('/v1/admin/assistant/knowledge', z.array(Doc));
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-3xl">Assistant knowledge</h2>
        <p className="text-ink-2">
          Facts the assistant may quote besides the published site and the shop: policies, service areas, care advice. Write them as you would tell a customer. Only switched-on entries are used, and changes apply within a minute.
        </p>
      </div>
      <KnowledgeManager docs={docs} />
    </div>
  );
}
