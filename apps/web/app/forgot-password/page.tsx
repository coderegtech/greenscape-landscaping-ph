import type { Metadata } from 'next';
import Link from 'next/link';
import { ForgotPasswordFormView } from '@greenscape/ui/auth-forms';
import { AuthCard } from '@greenscape/ui/form';

export const metadata: Metadata = { title: 'Reset your password', robots: { index: false } };

export default function ForgotPasswordPage() {
  return (
    <AuthCard title="Reset your password" footer={<Link href="/login" className="font-medium text-forest-700 underline">Back to sign in</Link>}>
      <p className="text-neutral-700">Enter your account email and we&apos;ll send you a link to choose a new password.</p>
      <ForgotPasswordFormView />
    </AuthCard>
  );
}
