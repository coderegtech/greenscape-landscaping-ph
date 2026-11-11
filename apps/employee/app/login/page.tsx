import { SignInFormView } from '@greenscape/ui/auth-forms';
import { AuthCard, Notice } from '@greenscape/ui/form';
import { safeNext } from '@greenscape/validation';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Sign in' };

const ERRORS: Record<string, string> = { link: 'That link is invalid or has expired.' };

// Work email and password only: no Google button and no sign-up. HR creates every employee login.
export default async function EmployeeLoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  return (
    <AuthCard title="Greenscape Employees" footer="No login yet? HR creates employee accounts and gives you a temporary password.">
      {error && ERRORS[error] && <Notice tone="error">{ERRORS[error]}</Notice>}
      <SignInFormView next={safeNext(next, '/')} forgotHref={`${process.env.WEB_URL ?? 'http://localhost:3000'}/auth/forgot-password`} />
    </AuthCard>
  );
}
