import { clientHeaders } from '@greenscape/auth/api';
import { getAccessToken } from '@greenscape/auth/next';
import { NextResponse, type NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

/** Analytics as CSV with the staff member's own token (analytics.read is checked by the API). */
export async function GET(req: NextRequest) {
  const token = await getAccessToken();
  if (!token) return NextResponse.redirect(new URL('/login', req.url));
  const days = ['7', '30', '90'].includes(req.nextUrl.searchParams.get('days') ?? '') ? req.nextUrl.searchParams.get('days')! : '30';
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/v1/admin/analytics?days=${days}&format=csv`, { headers: { ...(await clientHeaders()), authorization: `Bearer ${token}` }, cache: 'no-store' });
  if (!res.ok) return new NextResponse('Report not available', { status: res.status });
  return new NextResponse(res.body, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': res.headers.get('content-disposition') ?? 'attachment', 'cache-control': 'no-store' } });
}
