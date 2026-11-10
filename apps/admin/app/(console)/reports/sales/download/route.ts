import { clientHeaders } from '@greenscape/auth/api';
import { getAccessToken } from '@greenscape/auth/next';
import { NextResponse, type NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

/** Streams the CSV/XLSX report with the staff member's own token (reports.sales is checked by the API). */
export async function GET(req: NextRequest) {
  const token = await getAccessToken();
  if (!token) return NextResponse.redirect(new URL('/login', req.url));
  const q = new URLSearchParams({ from: req.nextUrl.searchParams.get('from') ?? '', to: req.nextUrl.searchParams.get('to') ?? '', format: req.nextUrl.searchParams.get('format') === 'csv' ? 'csv' : 'xlsx' });
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/v1/admin/reports/sales?${q}`, { headers: { ...(await clientHeaders()), authorization: `Bearer ${token}` }, cache: 'no-store' });
  if (!res.ok) return new NextResponse('Report not available', { status: res.status });
  return new NextResponse(res.body, { headers: { 'content-type': res.headers.get('content-type') ?? 'application/octet-stream', 'content-disposition': res.headers.get('content-disposition') ?? 'attachment', 'cache-control': 'no-store' } });
}
