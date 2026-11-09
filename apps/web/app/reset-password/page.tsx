import { createSupabaseServerClient } from '@greenscape/auth/next';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ResetPasswordFormView } from '@greenscape/ui/auth-forms';
import { AuthCard } from '@greenscape/ui/form';

export const metadata: Metadata = { title: 'Choose a new password', robots: { index: false } };

export default async function ResetPasswordPage() {
  // Reached via the recovery link, which signs the user in through /auth/callback.
  const { data } = await (await createSupabaseServerClient()).auth.getUser();
  if (!data.user) redirect('/login?error=link');
  return (
    <AuthCard title="Choose a new password">
      <ResetPasswordFormView />
    </AuthCard>
  );
}
