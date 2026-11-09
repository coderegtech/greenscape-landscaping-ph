'use client';
import { Button } from '@greenscape/ui/components/button';
import { fieldClass } from '@greenscape/ui/components/input';
import { Textarea } from '@greenscape/ui/components/textarea';
import { Field, Notice } from '@greenscape/ui/form';
import { cn } from '@greenscape/ui/lib/utils';
import {
  ATTACHMENT_MAX_BYTES, ATTACHMENT_MAX_COUNT, ATTACHMENT_TYPES, AttachmentSlot, BEST_TIMES, BUDGETS, PROPERTY_TYPES, QUOTE_SERVICES,
  QuoteReceipt, QuoteRequest, type QuoteRequestInput,
} from '@greenscape/validation';
import { zodResolver } from '@hookform/resolvers/zod';
import { Check, FileText, ImageIcon, Paperclip, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import { useForm, type FieldPath } from 'react-hook-form';
import type { z } from 'zod';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
type Values = z.output<typeof QuoteRequest>;
type Upload = { key: string; name: string; size: number; type: string; progress: number; id?: string; error?: string };

const STEPS: { title: string; fields: FieldPath<QuoteRequestInput>[] }[] = [
  { title: 'What do you need?', fields: ['services'] },
  { title: 'About the property', fields: ['propertyType', 'projectLocation', 'areaSqm', 'budgetRange', 'preferredDate', 'details'] },
  { title: 'How do we reach you?', fields: ['name', 'email', 'phone', 'bestTimeToTalk', 'consent'] },
];

async function authHeader(): Promise<Record<string, string>> {
  // Loaded on demand: the Supabase client is the heaviest part of this page and only needed to attach a token.
  const { createSupabaseBrowserClient } = await import('@greenscape/auth/browser');
  const { data } = await createSupabaseBrowserClient().auth.getSession();
  return data.session ? { authorization: `Bearer ${data.session.access_token}` } : {};
}

/** PUT to the signed storage URL with real progress (fetch can't report upload progress). */
function putWithProgress(url: string, file: File, onProgress: (p: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('content-type', file.type);
    xhr.setRequestHeader('x-upsert', 'false');
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status})`)));
    xhr.onerror = () => reject(new Error('Upload failed: check your connection'));
    xhr.send(file);
  });
}

const prettySize = (b: number) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

function ChoiceCard({ type, label, ...input }: React.InputHTMLAttributes<HTMLInputElement> & { label: string; type: 'checkbox' | 'radio' }) {
  return (
    <label className="group relative flex min-h-14 cursor-pointer items-center gap-3 border border-muted bg-paper-2 px-4 py-3 text-base text-ink transition-colors duration-(--dur-short) hover:border-ink-2 has-[:checked]:border-signal has-[:checked]:bg-paper-3 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus">
      <input type={type} className="peer sr-only" {...input} />
      <span aria-hidden className={cn('grid size-5 shrink-0 place-items-center border border-muted text-signal-ink peer-checked:border-signal peer-checked:bg-signal', type === 'radio' && 'rounded-pill')}>
        <Check className="size-3.5 opacity-0 group-has-[:checked]:opacity-100" strokeWidth={3} />
      </span>
      {label}
    </label>
  );
}

function Select({ label, error, options, placeholder, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { label: string; error?: string; options: Record<string, string>; placeholder: string }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-ink">{label}</label>
      <select id={id} aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-e` : undefined} className={cn(fieldClass, 'h-12 appearance-none bg-[length:1rem] bg-[right_0.75rem_center] bg-no-repeat pr-10')} style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%27%23c6cdb6%27 stroke-width=%272%27%3E%3Cpath d=%27m6 9 6 6 6-6%27/%3E%3C/svg%3E")' }} {...props}>
        <option value="">{placeholder}</option>
        {Object.entries(options).map(([k, v]) => (
          <option key={k} value={k}>{v}</option>
        ))}
      </select>
      <div className="min-h-[1lh] pb-2 text-sm">{error && <p id={`${id}-e`} className="text-danger">{error}</p>}</div>
    </div>
  );
}

export function QuoteForm({ signedIn }: { signedIn: boolean }) {
  const [step, setStep] = useState(0);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [receipt, setReceipt] = useState<z.infer<typeof QuoteReceipt> | null>(null);
  const [serverError, setServerError] = useState<string>();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);
  const { register, handleSubmit, trigger, setValue, getValues, formState } = useForm<QuoteRequestInput, unknown, Values>({
    resolver: zodResolver(QuoteRequest),
    defaultValues: { services: [], attachments: [], website: '' },
    mode: 'onTouched',
  });
  const e = formState.errors;

  // Move focus to the new step's heading so screen readers and keyboards land in the right place.
  useEffect(() => {
    if (firstRender.current) return void (firstRender.current = false);
    headingRef.current?.focus();
  }, [step, receipt]);

  const uploading = uploads.some((u) => !u.id && !u.error);
  useEffect(() => setValue('attachments', uploads.filter((u) => u.id).map((u) => u.id!)), [uploads, setValue]);

  async function addFiles(files: FileList | null) {
    if (!files) return;
    const room = ATTACHMENT_MAX_COUNT - uploads.filter((u) => !u.error).length;
    for (const file of [...files].slice(0, Math.max(0, room))) {
      const key = crypto.randomUUID();
      const base: Upload = { key, name: file.name, size: file.size, type: file.type, progress: 0 };
      const fail = (error: string) => setUploads((u) => [...u.filter((x) => x.key !== key), { ...base, error }]);
      if (!(ATTACHMENT_TYPES as readonly string[]).includes(file.type)) { fail('Photos (JPG, PNG, WebP, HEIC) or PDF only'); continue; }
      if (file.size > ATTACHMENT_MAX_BYTES) { fail('Larger than 10 MB'); continue; }
      setUploads((u) => [...u, base]);
      try {
        const res = await fetch(`${API}/v1/quotations/attachments`, { method: 'POST', headers: { 'content-type': 'application/json', ...(await authHeader()) }, body: JSON.stringify({ filename: file.name, contentType: file.type, size: file.size }) });
        const body = await res.json();
        if (!res.ok) throw new Error(body?.error?.message ?? 'Could not start the upload');
        const slot = AttachmentSlot.parse(body);
        await putWithProgress(slot.uploadUrl, file, (p) => setUploads((u) => u.map((x) => (x.key === key ? { ...x, progress: p } : x))));
        setUploads((u) => u.map((x) => (x.key === key ? { ...x, progress: 100, id: slot.id } : x)));
      } catch (err) {
        setUploads((u) => u.map((x) => (x.key === key ? { ...x, error: (err as Error).message } : x)));
      }
    }
  }

  async function next() {
    if (await trigger(STEPS[step]!.fields, { shouldFocus: true })) setStep((s) => s + 1);
  }

  const onSubmit = handleSubmit(async (values) => {
    setServerError(undefined);
    const res = await fetch(`${API}/v1/quotations`, { method: 'POST', headers: { 'content-type': 'application/json', ...(await authHeader()) }, body: JSON.stringify(values) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return setServerError(body?.error?.message === 'Invalid request' ? 'Some details need another look. Please check each step.' : (body?.error?.message ?? 'We could not send your request. Please try again or call 0917 844 3330.'));
    setReceipt(QuoteReceipt.parse(body));
  });

  if (receipt) {
    return (
      <div className="flex max-w-[40rem] flex-col gap-6" role="status">
        <h2 ref={headingRef} tabIndex={-1} className="text-display-s outline-none">Thank you. We have your request.</h2>
        <p className="text-lg">
          Your reference is <strong className="figure text-2xl text-ink" data-testid="quote-number">{receipt.number}</strong>. We sent a copy to your email and will contact you within one working day.
        </p>
        <p className="text-base text-ink-2">
          {signedIn ? (
            <>You can follow its progress in <Link href="/account">your account</Link>.</>
          ) : (
            <><Link href="/signup">Create an account</Link> with the same email to follow its progress.</>
          )}
        </p>
      </div>
    );
  }

  const v = getValues();
  return (
    <form method="post" onSubmit={onSubmit} noValidate className="flex flex-col gap-10">
      <ol className="grid grid-cols-3 gap-2" aria-label="Steps">
        {STEPS.map((s, i) => (
          <li key={s.title} aria-current={i === step ? 'step' : undefined} className={cn('border-t-2 pt-3 text-sm', i < step ? 'border-signal text-ink-2' : i === step ? 'border-signal font-medium text-ink' : 'border-rule text-muted')}>
            <span className="sr-only">Step {i + 1} of 3: </span>
            <span aria-hidden className="tabular mr-1 text-muted">{i + 1}.</span>
            <span className="hidden sm:inline">{s.title}</span>
          </li>
        ))}
      </ol>

      {/* Honeypot: hidden from people and assistive tech; bots fill it. */}
      <div aria-hidden className="absolute -left-[9999px] h-0 overflow-clip">
        <label>Leave this empty <input tabIndex={-1} autoComplete="off" {...register('website')} /></label>
      </div>

      <section key={step} aria-labelledby="step-title" className="flex animate-in flex-col gap-6 fade-in slide-in-from-right-2 duration-(--dur-long)">
        <h2 id="step-title" ref={headingRef} tabIndex={-1} className="text-3xl outline-none">{STEPS[step]!.title}</h2>

        {step === 0 && (
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-3 text-base text-ink-2">Choose all that apply.</legend>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {Object.entries(QUOTE_SERVICES).map(([k, label]) => (
                <ChoiceCard key={k} type="checkbox" value={k} label={label} {...register('services')} />
              ))}
            </div>
            {e.services && <p className="text-sm text-danger" role="alert">{e.services.message}</p>}
          </fieldset>
        )}

        {step === 1 && (
          <div className="flex flex-col gap-2">
            <fieldset className="mb-4 flex flex-col gap-3">
              <legend className="mb-3 text-sm font-medium text-ink">Type of property</legend>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {Object.entries(PROPERTY_TYPES).map(([k, label]) => (
                  <ChoiceCard key={k} type="radio" value={k} label={label} {...register('propertyType')} />
                ))}
              </div>
              {e.propertyType && <p className="text-sm text-danger" role="alert">{e.propertyType.message}</p>}
            </fieldset>
            <div className="grid grid-cols-1 gap-x-6 md:grid-cols-2">
              <Field label="Location" placeholder="Barangay and town, e.g. San Jose, Puerto Princesa" autoComplete="address-level2" error={e.projectLocation?.message} {...register('projectLocation')} />
              <Field label="Approximate area (sqm, optional)" inputMode="numeric" error={e.areaSqm?.message} {...register('areaSqm')} />
              <Select label="Budget (optional)" placeholder="Choose a range" options={BUDGETS} error={e.budgetRange?.message} {...register('budgetRange', { setValueAs: (x) => x || undefined })} />
              <Field label="Preferred start date (optional)" type="date" error={e.preferredDate?.message} {...register('preferredDate')} />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="details" className="text-sm font-medium text-ink">About the project</label>
              <Textarea id="details" placeholder="Size, sun and shade, what you would like to grow or fix, anything we should know about access" aria-invalid={e.details ? true : undefined} aria-describedby={e.details ? 'details-e' : undefined} {...register('details')} />
              <div className="min-h-[1lh] pb-2 text-sm">{e.details && <p id="details-e" className="text-danger">{e.details.message}</p>}</div>
            </div>

            <div className="flex flex-col gap-3">
              <span id="files-label" className="text-sm font-medium text-ink">Photos or plans (optional, up to {ATTACHMENT_MAX_COUNT}, 10 MB each)</span>
              <label className="inline-flex h-12 w-fit cursor-pointer items-center gap-2 rounded-pill border-[1.5px] border-signal px-6 text-sm font-bold text-signal transition-colors duration-(--dur-short) hover:bg-signal/10 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus">
                <Paperclip className="size-4" aria-hidden /> Add files
                <input type="file" multiple accept={ATTACHMENT_TYPES.join(',')} className="sr-only" aria-labelledby="files-label" onChange={(ev) => { void addFiles(ev.target.files); ev.target.value = ''; }} disabled={uploads.filter((u) => !u.error).length >= ATTACHMENT_MAX_COUNT} />
              </label>
              {uploads.length > 0 && (
                <ul className="flex flex-col border-t border-rule" aria-live="polite">
                  {uploads.map((u) => (
                    <li key={u.key} className="flex items-center gap-3 border-b border-rule py-3 text-sm">
                      {u.type === 'application/pdf' ? <FileText aria-hidden className="size-4 shrink-0 text-muted" /> : <ImageIcon aria-hidden className="size-4 shrink-0 text-muted" />}
                      <span className="min-w-0 flex-1 truncate text-ink">{u.name}</span>
                      <span className="tabular text-muted">{prettySize(u.size)}</span>
                      <span className={cn('w-28 text-right', u.error ? 'text-danger' : u.id ? 'text-signal' : 'text-ink-2')}>
                        {u.error ?? (u.id ? 'Uploaded' : `${u.progress}%`)}
                      </span>
                      {!u.id && !u.error && (
                        <span aria-hidden className="h-1 w-16 overflow-clip bg-paper-3">
                          <span className="block h-full origin-left bg-signal transition-transform" style={{ transform: `scaleX(${u.progress / 100})` }} />
                        </span>
                      )}
                      <Button variant="ghost" size="icon-sm" aria-label={`Remove ${u.name}`} onClick={() => setUploads((x) => x.filter((y) => y.key !== u.key))}>
                        <X />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-1 gap-x-6 md:grid-cols-2">
              <Field label="Full name" autoComplete="name" error={e.name?.message} {...register('name')} />
              <Field label="Mobile or phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="0917 844 3330" error={e.phone?.message} {...register('phone')} />
              <Field label="Email" type="email" autoComplete="email" error={e.email?.message} {...register('email')} />
              <Select label="Best time to call (optional)" placeholder="Any time" options={BEST_TIMES} {...register('bestTimeToTalk', { setValueAs: (x) => x || undefined })} />
            </div>
            <label className="flex cursor-pointer items-start gap-3 py-2 text-base text-ink-2">
              <input type="checkbox" className="mt-1 size-5 shrink-0 accent-[var(--gs-signal)]" aria-invalid={e.consent ? true : undefined} {...register('consent')} />
              <span>
                I agree that Greenscape may use these details to prepare my quote and contact me about it, as described in the <Link href="/privacy" className="text-ink">Privacy Notice</Link>.
              </span>
            </label>
            {e.consent && <p className="text-sm text-danger" role="alert">{e.consent.message}</p>}

            <dl className="mt-6 grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)] gap-x-6 gap-y-2 border-t border-rule pt-6 text-base" aria-label="Your request">
              <dt className="text-muted">Services</dt>
              <dd className="text-ink">{(v.services ?? []).map((s) => QUOTE_SERVICES[s as keyof typeof QUOTE_SERVICES]).join(', ')}</dd>
              <dt className="text-muted">Property</dt>
              <dd className="text-ink">{v.propertyType ? PROPERTY_TYPES[v.propertyType as keyof typeof PROPERTY_TYPES] : ''}{v.projectLocation ? `, ${v.projectLocation}` : ''}</dd>
              <dt className="text-muted">Files</dt>
              <dd className="text-ink">{uploads.filter((u) => u.id).length || 'None'}</dd>
            </dl>
          </div>
        )}
      </section>

      {serverError && <Notice tone="error">{serverError}</Notice>}

      <div className="flex flex-wrap items-center gap-3 border-t border-rule pt-6">
        {step > 0 && (
          <Button variant="ghost" onClick={() => setStep((s) => s - 1)}>
            Back
          </Button>
        )}
        {step < STEPS.length - 1 ? (
          <Button onClick={next} disabled={uploading}>
            {uploading ? 'Waiting for uploads' : 'Continue'}
          </Button>
        ) : (
          <Button type="submit" loading={formState.isSubmitting}>
            Send request
          </Button>
        )}
      </div>
    </form>
  );
}
