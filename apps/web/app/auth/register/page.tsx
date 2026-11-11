import type { Metadata } from 'next';
import Link from 'next/link';
import { GoogleButton, SignUpFormView } from '@greenscape/ui/auth-forms';
import { AuthCard } from '@greenscape/ui/form';
import { safeNext } from '@greenscape/validation';

export const metadata: Metadata = { title: 'Create an account', robots: { index: false } };

export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const to = safeNext((await searchParams).next, '/account');
  const q = to === '/account' ? '' : `?next=${encodeURIComponent(to)}`;
  return (
    <AuthCard title="Create an account" footer={<>Already have an account? <Link href={`/auth/login${q}`} className="font-medium text-ink">Sign in</Link></>}>
      <GoogleButton next={to} />
      <SignUpFormView next={to} />
    </AuthCard>
  );
}
