'use client';
import { createSupabaseBrowserClient } from '@greenscape/auth/browser';
import { Button } from '@greenscape/ui/components/button';
import { Textarea } from '@greenscape/ui/components/textarea';
import { Field, Notice } from '@greenscape/ui/form';
import { TestimonialRequest } from '@greenscape/validation';
import { zodResolver } from '@hookform/resolvers/zod';
import { Star } from 'lucide-react';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import type { z } from 'zod';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/** Signed-in customers share feedback; it is published only after a content manager approves it. */
export function FeedbackForm() {
  const [sent, setSent] = useState(false);
  const [serverError, setServerError] = useState<string>();
  const { register, handleSubmit, control, formState } = useForm<z.input<typeof TestimonialRequest>, unknown, z.output<typeof TestimonialRequest>>({ resolver: zodResolver(TestimonialRequest) });
  const e = formState.errors;
  const rating = Number(useWatch({ control, name: 'rating' }) ?? 0);

  const onSubmit = handleSubmit(async (values) => {
    setServerError(undefined);
    const { data } = await createSupabaseBrowserClient().auth.getSession();
    const res = await fetch(`${API}/v1/testimonials`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(data.session ? { authorization: `Bearer ${data.session.access_token}` } : {}) },
      body: JSON.stringify(values),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return setServerError(body?.error?.message ?? 'Your feedback did not send. Please try again.');
    }
    setSent(true);
  });

  if (sent) return <Notice tone="success">Thank you. Your feedback will appear here once our team has reviewed it.</Notice>;
  return (
    <form method="post" onSubmit={onSubmit} noValidate className="flex flex-col gap-1">
      <fieldset className="mb-4">
        <legend className="mb-2 text-sm font-medium text-ink">Your rating</legend>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <label key={n} className="cursor-pointer p-1 text-signal has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus">
              <input type="radio" value={n} className="sr-only" {...register('rating')} />
              <span className="sr-only">{n} star{n > 1 ? 's' : ''}</span>
              <Star aria-hidden className={`size-7 ${n <= rating ? 'fill-current' : 'opacity-40'}`} />
            </label>
          ))}
        </div>
        {e.rating && <p className="mt-1 text-sm text-danger" role="alert">{e.rating.message}</p>}
      </fieldset>
      <Field label="Project (optional)" placeholder="e.g. Residential garden in Puerto Princesa" error={e.projectType?.message} {...register('projectType')} />
      <div className="flex flex-col gap-1">
        <label htmlFor="feedback" className="text-sm font-medium text-ink">Your feedback</label>
        <Textarea id="feedback" aria-invalid={e.text ? true : undefined} aria-describedby={e.text ? 'feedback-e' : undefined} {...register('text')} />
        <div className="min-h-[1lh] pb-2 text-sm">{e.text && <p id="feedback-e" className="text-danger">{e.text.message}</p>}</div>
      </div>
      <label className="flex cursor-pointer items-start gap-3 py-2 text-base text-ink-2">
        <input type="checkbox" className="mt-1 size-5 shrink-0 accent-[var(--gs-signal)]" aria-invalid={e.consent ? true : undefined} {...register('consent')} />
        <span>Greenscape may publish this feedback on its website with my first name and last initial.</span>
      </label>
      {e.consent && <p className="text-sm text-danger" role="alert">{e.consent.message}</p>}
      {serverError && <Notice tone="error">{serverError}</Notice>}
      <div className="mt-4">
        <Button type="submit" loading={formState.isSubmitting}>Send feedback</Button>
      </div>
    </form>
  );
}
