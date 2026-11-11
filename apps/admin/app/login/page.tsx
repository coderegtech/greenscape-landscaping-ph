import { SignInFormView } from '@greenscape/ui/auth-forms';
import { AuthCard, Notice } from '@greenscape/ui/form';
import { safeNext } from '@greenscape/validation';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Sign in' };

const ERRORS: Record<string, string> = {
  link: 'That link is invalid or has expired.',
  password: 'Staff tools need a sign-in with your work email and password (Google sign-in is for the website only).',
};

export default async function AdminLoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  const to = safeNext(next, '/');
  return (
    <AuthCard title="Greenscape Admin" footer="Staff accounts are created by an administrator.">
      {error && ERRORS[error] && <Notice tone="error">{ERRORS[error]}</Notice>}
      <SignInFormView next={to} forgotHref={`${process.env.WEB_URL ?? 'http://localhost:3000'}/auth/forgot-password`} />
    </AuthCard>
  );
}
