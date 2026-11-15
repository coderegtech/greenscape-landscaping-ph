import { safeNext } from '@greenscape/validation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { GoogleButton, SignInFormView } from '@greenscape/ui/auth-forms';
import { AuthCard, Notice } from '@greenscape/ui/form';

export const metadata: Metadata = { title: 'Sign in', robots: { index: false } };

const ERRORS: Record<string, string> = { link: 'That link is invalid or has expired. Please request a new one.' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  const to = safeNext(next, '/account');
  return (
    <AuthCard title="Sign in" footer={<>New to Greenscape? <Link href={to === '/account' ? '/auth/register' : `/auth/register?next=${encodeURIComponent(to)}`} className="font-medium text-ink">Create an account</Link></>}>
      {error && ERRORS[error] && <Notice tone="error">{ERRORS[error]}</Notice>}
      <SignInFormView next={to} />
      <GoogleButton next={to} divider />
    </AuthCard>
  );
}
