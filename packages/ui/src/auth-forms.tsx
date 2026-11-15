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

/** `divider` adds an "or" rule above, for when the button follows a form. */
export function GoogleButton({ next, divider = false }: { next: string; divider?: boolean }) {
  if (process.env.NEXT_PUBLIC_AUTH_GOOGLE !== 'true') return null;
  return (
    <>
      {divider && (
        <p className="flex items-center gap-3 text-sm text-ink-2 before:h-px before:flex-1 before:bg-rule after:h-px after:flex-1 after:bg-rule">or</p>
      )}
      {/* Neutral outline, not brand green: Google's mark keeps its own colours. */}
      <Button variant="secondary" className="border-rule-strong text-ink hover:bg-paper-3" onClick={() => createSupabaseBrowserClient().auth.signInWithOAuth({ provider: 'google', options: { redirectTo: callback(next) } })}>
        <svg viewBox="0 0 18 18" aria-hidden className="size-[18px]">
          <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" />
          <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" />
          <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" />
          <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" />
        </svg>
        Continue with Google
      </Button>
    </>
  );
}

function ShowPassword({ shown, toggle }: { shown: boolean; toggle: () => void }) {
  return (
    <button type="button" onClick={toggle} aria-pressed={shown} className="-mt-2 mb-2 self-start text-sm text-ink-2 underline underline-offset-[0.2em]">
      {shown ? 'Hide password' : 'Show password'}
    </button>
  );
}

export function SignInFormView({ next, forgotHref = '/auth/forgot-password' }: { next: string; forgotHref?: string }) {
  const [error, setError] = useState<string>();
  const [shown, setShown] = useState(false);
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
      <Field label="Password" type={shown ? 'text' : 'password'} autoComplete="current-password" error={formState.errors.password?.message} {...register('password')} />
      <ShowPassword shown={shown} toggle={() => setShown((s) => !s)} />
      <Link href={forgotHref} className="-mt-2 mb-3 self-start text-sm text-ink underline decoration-signal underline-offset-[0.2em] hover:decoration-2">Forgot password?</Link>
      <SubmitButton pending={formState.isSubmitting}>Sign in</SubmitButton>
    </form>
  );
}

export function SignUpFormView({ next = '/account' }: { next?: string } = {}) {
  const [sentTo, setSentTo] = useState<string>();
  const [error, setError] = useState<string>();
  const { register, handleSubmit, formState } = useForm<z.input<typeof SignUpForm>, unknown, z.output<typeof SignUpForm>>({ resolver: zodResolver(SignUpForm) });

  const onSubmit = handleSubmit(async ({ name, email, password }) => {
    setError(undefined);
    const { error } = await createSupabaseBrowserClient().auth.signUp({
      email,
      password,
      options: { emailRedirectTo: callback(next), data: { display_name: name } },
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
    await createSupabaseBrowserClient().auth.resetPasswordForEmail(email, { redirectTo: callback('/auth/reset-password') });
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
 * First sign-in with an administrator-issued temporary password: `save` is a server action that sends the new password
 * to the API (POST /v1/auth/password), which sets it at Supabase and lifts the restriction.
 */
export function TemporaryPasswordFormView({ save, next, email }: { save: (password: string) => Promise<{ ok: true } | { ok: false; error: string }>; next: string; email: string }) {
  const [error, setError] = useState<string>();
  const [shown, setShown] = useState(false);
  const { register, handleSubmit, formState } = useForm<z.input<typeof ResetPasswordForm>, unknown, z.output<typeof ResetPasswordForm>>({ resolver: zodResolver(ResetPasswordForm) });
  const onSubmit = handleSubmit(async ({ password }) => {
    setError(undefined);
    const res = await save(password);
    if (!res.ok) return setError(res.error);
    // Supabase ends existing sessions when a password is set server-side: sign in again with the new one.
    const { error } = await createSupabaseBrowserClient().auth.signInWithPassword({ email, password });
    if (error) return setError('Password saved. Please sign in again with your new password.');
    window.location.assign(next);
  });
  return (
    <form method="post" onSubmit={onSubmit} noValidate className="flex flex-col gap-2">
      {error && <Notice tone="error">{error}</Notice>}
      <Field label="New password" type={shown ? 'text' : 'password'} autoComplete="new-password" hint="At least 8 characters with upper- and lowercase letters and a number." error={formState.errors.password?.message} {...register('password')} />
      <Field label="Confirm new password" type={shown ? 'text' : 'password'} autoComplete="new-password" error={formState.errors.confirm?.message} {...register('confirm')} />
      <ShowPassword shown={shown} toggle={() => setShown((s) => !s)} />
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
