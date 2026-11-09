'use client';
import { createSupabaseBrowserClient } from '@greenscape/auth/browser';
import { ForgotPasswordForm, ResetPasswordForm, SignInForm, SignUpForm } from '@greenscape/validation';
import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { Button } from './components/button';
import { Field, Notice, SubmitButton } from './form.tsx';

const callback = (next: string) => `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

function friendly(message: string) {
  if (/invalid login credentials/i.test(message)) return 'Email or password is incorrect.';
  if (/email not confirmed/i.test(message)) return 'Please confirm your email first — check your inbox for the link.';
  if (/already registered/i.test(message)) return 'An account with this email already exists. Try signing in.';
  if (/rate limit|too many/i.test(message)) return 'Too many attempts. Please wait a minute and try again.';
  return message;
}

export function GoogleButton({ next }: { next: string }) {
  if (process.env.NEXT_PUBLIC_AUTH_GOOGLE !== 'true') return null;
  return (
    <Button variant="secondary" onClick={() => createSupabaseBrowserClient().auth.signInWithOAuth({ provider: 'google', options: { redirectTo: callback(next) } })}>
      Continue with Google
    </Button>
  );
}

export function SignInFormView({ next, forgotHref = '/forgot-password' }: { next: string; forgotHref?: string }) {
  const [error, setError] = useState<string>();
  const { register, handleSubmit, formState } = useForm<z.input<typeof SignInForm>, unknown, z.output<typeof SignInForm>>({ resolver: zodResolver(SignInForm) });

  const onSubmit = handleSubmit(async ({ email, password }) => {
    setError(undefined);
    const { error } = await createSupabaseBrowserClient().auth.signInWithPassword({ email, password });
    if (error) return setError(friendly(error.message));
     
    window.location.assign(next); // full load: server renders with the new session cookie
  });

  return (
    <form method="post" onSubmit={onSubmit} noValidate className="flex flex-col gap-2">
      {error && <Notice tone="error">{error}</Notice>}
      <Field label="Email" type="email" autoComplete="email" error={formState.errors.email?.message} {...register('email')} />
      <Field label="Password" type="password" autoComplete="current-password" error={formState.errors.password?.message} {...register('password')} />
      <Link href={forgotHref} className="-mt-2 mb-3 self-start text-sm text-ink underline decoration-signal underline-offset-[0.2em] hover:decoration-2">Forgot password?</Link>
      <SubmitButton pending={formState.isSubmitting}>Sign in</SubmitButton>
    </form>
  );
}

export function SignUpFormView() {
  const [sentTo, setSentTo] = useState<string>();
  const [error, setError] = useState<string>();
  const { register, handleSubmit, formState } = useForm<z.input<typeof SignUpForm>, unknown, z.output<typeof SignUpForm>>({ resolver: zodResolver(SignUpForm) });

  const onSubmit = handleSubmit(async ({ name, email, password }) => {
    setError(undefined);
    const { error } = await createSupabaseBrowserClient().auth.signUp({
      email,
      password,
      options: { emailRedirectTo: callback('/account'), data: { display_name: name } },
    });
    if (error) return setError(friendly(error.message));
    setSentTo(email);
  });

  if (sentTo) {
    return (
      <Notice tone="success">
        We sent a confirmation link to <strong>{sentTo}</strong>. Open it to activate your account.
      </Notice>
    );
  }
  return (
    <form method="post" onSubmit={onSubmit} noValidate className="flex flex-col gap-2">
      {error && <Notice tone="error">{error}</Notice>}
      <Field label="Full name" autoComplete="name" error={formState.errors.name?.message} {...register('name')} />
      <Field label="Email" type="email" autoComplete="email" error={formState.errors.email?.message} {...register('email')} />
      <Field label="Password" type="password" autoComplete="new-password" hint="At least 8 characters with upper- and lowercase letters and a number." error={formState.errors.password?.message} {...register('password')} />
      <Field label="Confirm password" type="password" autoComplete="new-password" error={formState.errors.confirm?.message} {...register('confirm')} />
      <label className="flex cursor-pointer items-start gap-3 py-2 text-sm text-ink-2">
        <input type="checkbox" className="mt-0.5 size-5 shrink-0 accent-[var(--gs-signal)]" aria-invalid={formState.errors.consent ? true : undefined} {...register('consent')} />
        <span>
          I have read the <Link href="/privacy" className="text-ink underline decoration-signal">Privacy Notice</Link> and agree to Greenscape processing my details to manage my account and orders.
        </span>
      </label>
      {formState.errors.consent && <p className="-mt-2 mb-2 text-sm text-danger">{formState.errors.consent.message}</p>}
      <SubmitButton pending={formState.isSubmitting}>Create account</SubmitButton>
    </form>
  );
}

export function ForgotPasswordFormView() {
  const [sent, setSent] = useState(false);
  const { register, handleSubmit, formState } = useForm<z.input<typeof ForgotPasswordForm>, unknown, z.output<typeof ForgotPasswordForm>>({ resolver: zodResolver(ForgotPasswordForm) });
  const onSubmit = handleSubmit(async ({ email }) => {
    // Same response whether or not the account exists (no account enumeration).
    await createSupabaseBrowserClient().auth.resetPasswordForEmail(email, { redirectTo: callback('/reset-password') });
    setSent(true);
  });
  if (sent) return <Notice tone="success">If an account exists for that email, a reset link is on its way.</Notice>;
  return (
    <form method="post" onSubmit={onSubmit} noValidate className="flex flex-col gap-2">
      <Field label="Email" type="email" autoComplete="email" error={formState.errors.email?.message} {...register('email')} />
      <SubmitButton pending={formState.isSubmitting}>Send reset link</SubmitButton>
    </form>
  );
}

export function ResetPasswordFormView() {
  const [error, setError] = useState<string>();
  const { register, handleSubmit, formState } = useForm<z.input<typeof ResetPasswordForm>, unknown, z.output<typeof ResetPasswordForm>>({ resolver: zodResolver(ResetPasswordForm) });
  const onSubmit = handleSubmit(async ({ password }) => {
    setError(undefined);
    const { error } = await createSupabaseBrowserClient().auth.updateUser({ password });
    if (error) return setError(friendly(error.message));
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full load on purpose: router.replace+refresh raced in Next 16 (docs/progress.md)
    window.location.assign('/account?reset=1');
  });
  return (
    <form method="post" onSubmit={onSubmit} noValidate className="flex flex-col gap-2">
      {error && <Notice tone="error">{error}</Notice>}
      <Field label="New password" type="password" autoComplete="new-password" error={formState.errors.password?.message} {...register('password')} />
      <Field label="Confirm new password" type="password" autoComplete="new-password" error={formState.errors.confirm?.message} {...register('confirm')} />
      <SubmitButton pending={formState.isSubmitting}>Save password</SubmitButton>
    </form>
  );
}

/**
 * Plain form POST to the app's /auth/signout route: works before (or without) JavaScript, so a quick click on a
 * slow phone is never lost. The route ends the Supabase session server-side and redirects.
 */
export function SignOutButton() {
  return (
    <form method="post" action="/auth/signout">
      <Button type="submit" variant="secondary" size="sm">
        Sign out
      </Button>
    </form>
  );
}
