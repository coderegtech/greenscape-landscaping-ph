import { safeNext } from '@greenscape/validation';
import { draftMode } from 'next/headers';
import { type NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  (await draftMode()).disable();
  return NextResponse.redirect(new URL(safeNext(request.nextUrl.searchParams.get('path'), '/'), request.url));
}
