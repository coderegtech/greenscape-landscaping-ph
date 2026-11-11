import 'server-only';
import { ApiError, api } from '@greenscape/auth/api';
import { MeResponse } from '@greenscape/validation';
import { redirect } from 'next/navigation';
import { cache } from 'react';

/** The signed-in person as the API sees them. A pending temporary password always goes to /password first. */
export const getMe = cache(async (opts: { allowPasswordChange?: boolean } = {}) => {
  try {
    const me = await api('/v1/auth/me', MeResponse);
    if (me.passwordChangeRequired && !opts.allowPasswordChange) redirect('/password');
    return me;
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) redirect('/login');
    if (err instanceof ApiError && err.status === 403) return null; // suspended
    throw err;
  }
});
