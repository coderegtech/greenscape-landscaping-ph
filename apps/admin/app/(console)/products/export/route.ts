import { getAccessToken } from '@greenscape/auth/next';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/** Streams the API's CSV export with the staff member's own token (products.read is checked by the API). */
export async function GET() {
  const token = await getAccessToken();
  if (!token) return NextResponse.redirect(new URL('/login', process.env.ADMIN_URL ?? 'http://localhost:3001'));
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/v1/shop-admin/export/products.csv`, { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' });
  if (!res.ok) return new NextResponse('Export not allowed', { status: res.status });
  return new NextResponse(res.body, {
    headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': res.headers.get('content-disposition') ?? 'attachment; filename="products.csv"', 'cache-control': 'no-store' },
  });
}
