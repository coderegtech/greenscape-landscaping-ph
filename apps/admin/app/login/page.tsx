import { GoogleButton, SignInFormView } from '@greenscape/ui/auth-forms';
import { AuthCard, Notice } from '@greenscape/ui/form';
import { safeNext } from '@greenscape/validation';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Sign in' };

const ERRORS: Record<string, string> = { link: 'That link is invalid or has expired.' };

export default async function AdminLoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  const to = safeNext(next, '/');
  return (
    <AuthCard title="Greenscape Admin" footer="Staff accounts are created by an administrator.">
      {error && ERRORS[error] && <Notice tone="error">{ERRORS[error]}</Notice>}
      <GoogleButton next={to} />
      <SignInFormView next={to} forgotHref={`${process.env.WEB_URL ?? 'http://localhost:3000'}/forgot-password`} />
    </AuthCard>
  );
}
