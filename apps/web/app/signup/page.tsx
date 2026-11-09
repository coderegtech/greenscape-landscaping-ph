import type { Metadata } from 'next';
import Link from 'next/link';
import { GoogleButton, SignUpFormView } from '@greenscape/ui/auth-forms';
import { AuthCard } from '@greenscape/ui/form';

export const metadata: Metadata = { title: 'Create an account', robots: { index: false } };

export default function SignUpPage() {
  return (
    <AuthCard title="Create an account" footer={<>Already have an account? <Link href="/login" className="font-medium text-ink">Sign in</Link></>}>
      <GoogleButton next="/account" />
      <SignUpFormView />
    </AuthCard>
  );
}
