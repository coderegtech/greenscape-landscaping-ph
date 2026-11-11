import { ApiError, api, attempt } from '@greenscape/auth/api';
import { TemporaryPasswordFormView } from '@greenscape/ui/auth-forms';
import { AuthCard } from '@greenscape/ui/form';
import { MeResponse, NewPasswordBody, z } from '@greenscape/validation';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

export const metadata: Metadata = { title: 'Set your password' };
export const dynamic = 'force-dynamic';

async function save(password: string) {
  'use server';
  return attempt(() => api('/v1/auth/password', z.undefined(), { method: 'POST', body: JSON.stringify(NewPasswordBody.parse({ password })) }));
}

// First sign-in with a temporary password from a super admin / admin (lib/session.ts sends staff here).
export default async function PasswordPage() {
  const me = await api('/v1/auth/me', MeResponse).catch((err) => {
    if (err instanceof ApiError && err.status === 401) redirect('/login');
    throw err;
  });
  if (!me.passwordChangeRequired) redirect('/');
  return (
    <AuthCard title="Set your password" footer="Your temporary password stops working once you save a new one.">
      <TemporaryPasswordFormView save={save} next="/" email={me.user.email} />
    </AuthCard>
  );
}
