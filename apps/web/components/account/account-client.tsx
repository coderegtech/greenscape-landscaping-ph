'use client';
import { Button } from '@greenscape/ui/components/button';
import { Field, Notice } from '@greenscape/ui/form';
import { AddressInput, ProfileUpdate } from '@greenscape/validation';
import { Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { useAuth } from '../auth/auth-context';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/** Calls the account API with the session token, then refreshes the server-rendered page. */
function useAccountApi() {
  const { accessToken } = useAuth();
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const call = async (path: string, method: string, body?: unknown) => {
    setBusy(true);
    setError(undefined);
    try {
      const token = await accessToken();
      const res = await fetch(`${API}/v1${path}`, { method, headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
      if (!res.ok) {
        setError((await res.json().catch(() => null))?.error?.message ?? 'That did not save. Please try again.');
        return false;
      }
      router.refresh();
      return true;
    } finally {
      setBusy(false);
    }
  };
  return { call, error, busy };
}

/** Field errors from a zod result, one message per field. */
const errorsOf = (r: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }) =>
  Object.fromEntries((r.error?.issues ?? []).map((i) => [String(i.path[0]), i.message])) as Record<string, string>;

export function ProfileForm({ displayName, phone }: { displayName: string | null; phone: string | null }) {
  const { call, error, busy } = useAccountApi();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaved(false);
    const r = ProfileUpdate.safeParse(Object.fromEntries(new FormData(e.currentTarget)));
    setErrors(errorsOf(r));
    if (r.success && (await call('/me/profile', 'PATCH', r.data))) setSaved(true);
  };
  return (
    <form onSubmit={submit} noValidate className="grid grid-cols-1 gap-x-6 sm:grid-cols-2" data-testid="profile-form">
      <Field label="Name" name="displayName" defaultValue={displayName ?? ''} autoComplete="name" error={errors.displayName} />
      <Field label="Mobile number" name="phone" type="tel" defaultValue={phone ?? ''} autoComplete="tel" hint="For delivery updates" error={errors.phone} />
      <div className="flex flex-col gap-3 sm:col-span-2">
        {error && <Notice tone="error">{error}</Notice>}
        {saved && <Notice tone="success">Your details are saved.</Notice>}
        <Button type="submit" loading={busy} className="self-start">Save details</Button>
      </div>
    </form>
  );
}

export interface SavedAddress { id: string; label: string | null; recipient: string; phone: string; line1: string; line2: string | null; barangay: string | null; city: string; province: string; postalCode: string | null; isDefault: boolean }

export function Addresses({ addresses }: { addresses: SavedAddress[] }) {
  const { call, error, busy } = useAccountApi();
  const [editing, setEditing] = useState<SavedAddress | 'new' | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const r = AddressInput.safeParse({ ...Object.fromEntries(form), isDefault: form.get('isDefault') === 'on' });
    setErrors(errorsOf(r));
    if (!r.success) return;
    const ok = editing === 'new' ? await call('/me/addresses', 'POST', r.data) : await call(`/me/addresses/${(editing as SavedAddress).id}`, 'PUT', r.data);
    if (ok) setEditing(null);
  };
  const a = editing && editing !== 'new' ? editing : null;
  return (
    <div className="flex flex-col gap-4">
      {addresses.length > 0 && (
        <ul className="border-t border-rule" data-testid="my-addresses">
          {addresses.map((x) => (
            <li key={x.id} className="flex flex-wrap items-start justify-between gap-4 border-b border-rule py-4">
              <div className="flex min-w-0 flex-col">
                <span className="text-lg text-ink">{x.label ?? x.recipient}{x.isDefault && <span className="text-sm text-ink-2">, default</span>}</span>
                <span className="text-sm text-ink-2">{[x.recipient, x.line1, x.line2, x.barangay, x.city, x.province, x.postalCode].filter(Boolean).join(', ')}. {x.phone}</span>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => { setErrors({}); setEditing(x); }}>Edit<span className="sr-only"> {x.label ?? x.line1}</span></Button>
                <Button size="icon-sm" variant="ghost" disabled={busy} onClick={() => void call(`/me/addresses/${x.id}`, 'DELETE')}><Trash2 aria-hidden className="size-4" /><span className="sr-only">Remove {x.label ?? x.line1}</span></Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {!addresses.length && !editing && <p className="text-base text-ink-2">No saved addresses yet.</p>}
      {editing ? (
        <form key={a?.id ?? 'new'} onSubmit={submit} noValidate className="grid grid-cols-1 gap-x-6 rounded-[var(--radius-card)] border border-rule p-5 sm:grid-cols-2" aria-label={a ? 'Edit address' : 'New address'}>
          <Field label="Label (optional)" name="label" defaultValue={a?.label ?? ''} placeholder="Home, office" error={errors.label} />
          <Field label="Recipient" name="recipient" defaultValue={a?.recipient ?? ''} autoComplete="name" error={errors.recipient} />
          <Field label="Mobile number" name="phone" type="tel" defaultValue={a?.phone ?? ''} autoComplete="tel" error={errors.phone} />
          <Field label="Street, building or sitio" name="line1" defaultValue={a?.line1 ?? ''} autoComplete="address-line1" error={errors.line1} />
          <Field label="More details (optional)" name="line2" defaultValue={a?.line2 ?? ''} autoComplete="address-line2" error={errors.line2} />
          <Field label="Barangay (optional)" name="barangay" defaultValue={a?.barangay ?? ''} error={errors.barangay} />
          <Field label="City or municipality" name="city" defaultValue={a?.city ?? 'Puerto Princesa'} autoComplete="address-level2" error={errors.city} />
          <Field label="Province" name="province" defaultValue={a?.province ?? 'Palawan'} autoComplete="address-level1" error={errors.province} />
          <Field label="Postal code (optional)" name="postalCode" inputMode="numeric" defaultValue={a?.postalCode ?? ''} autoComplete="postal-code" error={errors.postalCode} />
          <label className="flex min-h-11 items-center gap-2 text-base text-ink sm:col-span-2">
            <input type="checkbox" name="isDefault" defaultChecked={a?.isDefault ?? !addresses.length} className="size-5 accent-[var(--color-primary)]" /> Use this address by default
          </label>
          {error && <div className="sm:col-span-2"><Notice tone="error">{error}</Notice></div>}
          <div className="mt-2 flex gap-3 sm:col-span-2">
            <Button type="submit" loading={busy}>Save address</Button>
            <Button type="button" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
          </div>
        </form>
      ) : (
        addresses.length < 10 && <Button variant="secondary" size="sm" className="self-start" onClick={() => { setErrors({}); setEditing('new'); }}>Add an address</Button>
      )}
    </div>
  );
}

export function RemoveButton({ path, label }: { path: string; label: string }) {
  const { call, busy } = useAccountApi();
  return (
    <Button size="icon-sm" variant="ghost" disabled={busy} onClick={() => void call(path, 'DELETE')}>
      <Trash2 aria-hidden className="size-4" /><span className="sr-only">{label}</span>
    </Button>
  );
}

/** Irreversible: the person types DELETE. Afterwards the session is ended and they land on the home page. */
export function DeleteAccount() {
  const { call, error, busy } = useAccountApi();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!(await call('/me', 'DELETE', { confirm: typed }))) return;
    const { createSupabaseBrowserClient } = await import('@greenscape/auth/browser');
    await createSupabaseBrowserClient().auth.signOut().catch(() => undefined);
    window.location.assign(`${window.location.origin}/`); // a full reload drops every cached signed-in view
  };
  if (!open) return <Button variant="secondary" size="sm" className="self-start" onClick={() => setOpen(true)}>Delete my account</Button>;
  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-danger p-5" data-testid="delete-account">
      <p className="text-base text-ink">
        This removes your sign-in, saved addresses, wishlist and chats, and takes your name and contact details off your past orders and messages. Order records stay for our accounts, without your details. It cannot be undone.
      </p>
      <Field label="Type DELETE to confirm" name="confirm" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
      {error && <Notice tone="error">{error}</Notice>}
      <div className="flex gap-3">
        <Button type="submit" variant="danger" loading={busy} disabled={typed !== 'DELETE'}>Delete my account</Button>
        <Button type="button" variant="ghost" onClick={() => { setOpen(false); setTyped(''); }}>Keep my account</Button>
      </div>
    </form>
  );
}
