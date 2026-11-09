'use client';
import { createSupabaseBrowserClient } from '@greenscape/auth/browser';
import { ForgotPasswordForm, ResetPasswordForm, SignInForm, SignUpForm } from '@greenscape/validation';
import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
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
    <button
      type="button"
      onClick={() => createSupabaseBrowserClient().auth.signInWithOAuth({ provider: 'google', options: { redirectTo: callback(next) } })}
      className="inline-flex h-11 items-center justify-center rounded-md border border-neutral-300 bg-white font-medium hover:bg-neutral-50"
    >
      Continue with Google
    </button>
  );
}

export function SignInFormView({ next }: { next: string }) {
  const [error, setError] = useState<string>();
  const { register, handleSubmit, formState } = useForm<z.input<typeof SignInForm>, unknown, z.output<typeof SignInForm>>({ resolver: zodResolver(SignInForm) });

  const onSubmit = handleSubmit(async ({ email, password }) => {
    setError(undefined);
    const { error } = await createSupabaseBrowserClient().auth.signInWithPassword({ email, password });
    if (error) return setError(friendly(error.message));
    window.location.assign(next); // full load: server renders with the new session cookie
  });

  return (
    <form method="post" onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {error && <Notice tone="error">{error}</Notice>}
      <Field label="Email" type="email" autoComplete="email" error={formState.errors.email?.message} {...register('email')} />
      <Field label="Password" type="password" autoComplete="current-password" error={formState.errors.password?.message} {...register('password')} />
      <Link href="/forgot-password" className="self-end text-sm text-forest-700 underline-offset-2 hover:underline">Forgot password?</Link>
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
    <form method="post" onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {error && <Notice tone="error">{error}</Notice>}
      <Field label="Full name" autoComplete="name" error={formState.errors.name?.message} {...register('name')} />
      <Field label="Email" type="email" autoComplete="email" error={formState.errors.email?.message} {...register('email')} />
      <Field label="Password" type="password" autoComplete="new-password" hint="At least 8 characters with upper- and lowercase letters and a number." error={formState.errors.password?.message} {...register('password')} />
      <Field label="Confirm password" type="password" autoComplete="new-password" error={formState.errors.confirm?.message} {...register('confirm')} />
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" className="mt-1 size-4 accent-forest-900" aria-invalid={formState.errors.consent ? true : undefined} {...register('consent')} />
        <span>
          I have read the <Link href="/privacy" className="text-forest-700 underline">Privacy Notice</Link> and agree to Greenscape processing my details to manage my account and orders.
        </span>
      </label>
      {formState.errors.consent && <p className="-mt-2 text-sm text-red-700">{formState.errors.consent.message}</p>}
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
    <form method="post" onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
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
    window.location.assign('/account?reset=1');
  });
  return (
    <form method="post" onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {error && <Notice tone="error">{error}</Notice>}
      <Field label="New password" type="password" autoComplete="new-password" error={formState.errors.password?.message} {...register('password')} />
      <Field label="Confirm new password" type="password" autoComplete="new-password" error={formState.errors.confirm?.message} {...register('confirm')} />
      <SubmitButton pending={formState.isSubmitting}>Save password</SubmitButton>
    </form>
  );
}

export function SignOutButton() {
  const [pending, setPending] = useState(false);
  return (
    <button
      type="button"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        await createSupabaseBrowserClient().auth.signOut();
        window.location.assign('/');
      }}
      className="inline-flex h-10 items-center rounded-md border border-neutral-300 px-4 text-sm font-medium hover:bg-neutral-50 disabled:opacity-60"
    >
      {pending ? 'Signing out…' : 'Sign out'}
    </button>
  );
}
