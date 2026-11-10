'use client';
import { createSupabaseBrowserClient } from '@greenscape/auth/browser';
import { Field, Notice, SubmitButton } from '@greenscape/ui/form';
import { useEffect, useState } from 'react';

type Step = { kind: 'loading' } | { kind: 'enrol'; factorId: string; qr: string; secret: string } | { kind: 'verify'; factorId: string } | { kind: 'failed'; message: string };

/**
 * Staff multi-factor step (H-2). First time: enrol an authenticator app (QR code, or the key typed in by hand) and
 * confirm with a code. After that: enter the current code. Success upgrades the Supabase session to aal2; the API
 * only grants staff permissions to aal2 sessions.
 */
export function MfaForm({ next }: { next: string }) {
  const [step, setStep] = useState<Step>({ kind: 'loading' });
  const [code, setCode] = useState('');
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    void (async () => {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) return setStep({ kind: 'failed', message: 'Could not load your sign-in settings. Reload the page to try again.' });
      const verified = data.totp.find((f) => f.status === 'verified');
      if (verified) return setStep({ kind: 'verify', factorId: verified.id });
      // A half-finished enrolment from an earlier visit can't be completed (its key was never shown again): start over.
      for (const f of data.all.filter((f) => f.factor_type === 'totp' && f.status === 'unverified')) await supabase.auth.mfa.unenroll({ factorId: f.id });
      const res = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `Greenscape admin ${new Date().toISOString().slice(0, 10)}` });
      if (res.error) return setStep({ kind: 'failed', message: 'Could not start authenticator setup. Reload the page to try again.' });
      setStep({ kind: 'enrol', factorId: res.data.id, qr: res.data.totp.qr_code, secret: res.data.totp.secret });
    })();
  }, []);

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (step.kind !== 'enrol' && step.kind !== 'verify') return;
    if (!/^\d{6}$/.test(code.trim())) return setError('Enter the 6-digit code from your authenticator app.');
    setError(undefined);
    setPending(true);
    const { error } = await createSupabaseBrowserClient().auth.mfa.challengeAndVerify({ factorId: step.factorId, code: code.trim() });
    if (error) {
      setPending(false);
      return setError('That code did not work. Codes change every 30 seconds; enter the one showing now.');
    }
    window.location.assign(next); // full load: the server renders with the upgraded session
  };

  if (step.kind === 'loading') return <p className="text-ink-2" role="status">Loading…</p>;
  if (step.kind === 'failed') return <Notice tone="error">{step.message}</Notice>;
  return (
    <form method="post" onSubmit={submit} noValidate className="flex flex-col gap-4" data-testid={`mfa-${step.kind}`}>
      {error && <Notice tone="error">{error}</Notice>}
      {step.kind === 'enrol' ? (
        <>
          <p className="text-ink-2">Staff accounts need a second step at sign-in. Scan this code with an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password…), then enter the 6-digit code it shows.</p>
          {/* Supabase returns the QR code as an SVG data URL. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={step.qr} alt="QR code for your authenticator app" width={192} height={192} className="border border-rule bg-white p-2" />
          <p className="text-sm text-ink-2">
            Can&apos;t scan? Enter this key instead: <code data-testid="mfa-secret" className="break-all font-mono text-ink">{step.secret}</code>
          </p>
        </>
      ) : (
        <p className="text-ink-2">Enter the 6-digit code from your authenticator app.</p>
      )}
      <Field label="Code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} />
      <SubmitButton pending={pending}>{step.kind === 'enrol' ? 'Turn on and continue' : 'Continue'}</SubmitButton>
    </form>
  );
}
