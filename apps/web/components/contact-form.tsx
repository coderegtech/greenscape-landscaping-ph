'use client';
import { Button } from '@greenscape/ui/components/button';
import { Textarea } from '@greenscape/ui/components/textarea';
import { Field, Notice } from '@greenscape/ui/form';
import { ContactRequest } from '@greenscape/validation';
import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export function ContactForm({ subject }: { subject?: string }) {
  const [sent, setSent] = useState(false);
  const [serverError, setServerError] = useState<string>();
  const { register, handleSubmit, formState } = useForm<z.input<typeof ContactRequest>, unknown, z.output<typeof ContactRequest>>({ resolver: zodResolver(ContactRequest), defaultValues: { website: '', subject: subject?.slice(0, 120) } });
  const e = formState.errors;

  const onSubmit = handleSubmit(async (values) => {
    setServerError(undefined);
    const res = await fetch(`${API}/v1/contact`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(values) });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return setServerError(body?.error?.message ?? 'Your message did not send. Please try again or call 0917 844 3330.');
    }
    setSent(true);
  });

  if (sent) return <Notice tone="success">Thank you. Your message reached the team and we will reply by email.</Notice>;
  return (
    <form method="post" onSubmit={onSubmit} noValidate className="flex flex-col gap-1">
      <div aria-hidden className="absolute -left-[9999px] h-0 overflow-clip">
        <label>Leave this empty <input tabIndex={-1} autoComplete="off" {...register('website')} /></label>
      </div>
      <div className="grid grid-cols-1 gap-x-6 md:grid-cols-2">
        <Field label="Full name" autoComplete="name" error={e.name?.message} {...register('name')} />
        <Field label="Email" type="email" autoComplete="email" error={e.email?.message} {...register('email')} />
        <Field label="Phone (optional)" type="tel" inputMode="tel" autoComplete="tel" error={e.phone?.message} {...register('phone')} />
        <Field label="Subject (optional)" error={e.subject?.message} {...register('subject')} />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="message" className="text-sm font-medium text-ink">Message</label>
        <Textarea id="message" aria-invalid={e.message ? true : undefined} aria-describedby={e.message ? 'message-e' : undefined} {...register('message')} />
        <div className="min-h-[1lh] pb-2 text-sm">{e.message && <p id="message-e" className="text-danger">{e.message.message}</p>}</div>
      </div>
      <label className="flex cursor-pointer items-start gap-3 py-2 text-base text-ink-2">
        <input type="checkbox" className="mt-1 size-5 shrink-0 accent-[var(--gs-signal)]" aria-invalid={e.consent ? true : undefined} {...register('consent')} />
        <span>
          I agree that Greenscape may use these details to answer my message, as described in the <Link href="/privacy" className="text-ink">Privacy Notice</Link>.
        </span>
      </label>
      {e.consent && <p className="text-sm text-danger" role="alert">{e.consent.message}</p>}
      {serverError && <Notice tone="error">{serverError}</Notice>}
      <div className="mt-4">
        <Button type="submit" loading={formState.isSubmitting}>
          Send message
        </Button>
      </div>
    </form>
  );
}
