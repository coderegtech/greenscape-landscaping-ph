import { api } from '@greenscape/auth/api';
import { z } from '@greenscape/validation';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { type Zone, ZonesEditor } from '@/components/zones-editor';
import { can, getStaff } from '@/lib/session';

export const metadata: Metadata = { title: 'Delivery areas' };
export const dynamic = 'force-dynamic';

export default async function DeliveryPage() {
  const me = await getStaff();
  if (!me || !can(me, 'settings.read')) redirect('/');
  const zones = await api('/v1/shop-admin/zones', z.array(z.custom<Zone>()));
  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-3xl">Delivery areas</h2>
      <p className="max-w-2xl text-ink-2">Customers can only check out to areas that are on and have a fee. Changes apply to new orders straight away and are recorded in the audit log.</p>
      <ZonesEditor zones={zones} canManage={can(me, 'settings.manage')} />
    </div>
  );
}
