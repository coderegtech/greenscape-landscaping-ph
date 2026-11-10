import 'server-only';
import { ApiError, api } from '@greenscape/auth/api';
import { MeResponse } from '@greenscape/validation';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';

/**
 * The signed-in staff member, resolved by the API (roles and permissions never come from the browser).
 * Returns null when the user is signed in but lacks admin.access. Cached per request.
 */
export const getStaff = cache(async () => {
  try {
    const me = await api('/v1/auth/me', MeResponse);
    if (me.mfaRequired) redirect(`/mfa?next=${encodeURIComponent((await headers()).get('x-pathname') ?? '/')}`); // staff permissions are withheld until MFA
    return me.permissions.includes('admin.access') ? me : null;
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) redirect('/login');
    if (err instanceof ApiError && err.status === 403) return null; // suspended
    throw err;
  }
});

export function can(me: MeResponse, permission: string) {
  return me.permissions.includes(permission);
}
