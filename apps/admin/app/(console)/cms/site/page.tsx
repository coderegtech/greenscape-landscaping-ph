import { api } from '@greenscape/auth/api';
import { z } from '@greenscape/validation';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { SiteSettings } from '@/components/site-settings';
import { can, getStaff } from '@/lib/session';

export const metadata: Metadata = { title: 'Site settings' };
export const dynamic = 'force-dynamic';

const Site = z.object({ config: z.record(z.string(), z.unknown()).nullable(), nav: z.record(z.string(), z.array(z.unknown())) });

export default async function SitePage() {
  const me = await getStaff();
  if (!me || !can(me, 'cms.read')) redirect('/');
  const site = await api('/v1/cms-admin/site', Site);
  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-3xl">Site settings</h2>
      <SiteSettings config={site.config} nav={site.nav} canPublish={can(me, 'cms.publish')} />
    </div>
  );
}
