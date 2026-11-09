import { NextResponse } from 'next/server';
import { readCart } from '@/lib/cart';

export const dynamic = 'force-dynamic';

/** Item count for the header badge (per visitor; never cached). */
export async function GET() {
  const cart = await readCart().catch(() => null);
  return NextResponse.json({ count: cart?.itemCount ?? 0 }, { headers: { 'cache-control': 'private, no-store' } });
}
