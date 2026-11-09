import { verifyPreview } from '@greenscape/auth/preview';
import { safeNext } from '@greenscape/validation';
import { draftMode } from 'next/headers';
import { type NextRequest, NextResponse } from 'next/server';

// Entry point for CMS preview links from the admin: /api/preview?path=/services/landscaping&token=…
// The token is HMAC-signed for that path and expires after 10 minutes.
export async function GET(request: NextRequest) {
  const path = safeNext(request.nextUrl.searchParams.get('path'), '');
  const token = request.nextUrl.searchParams.get('token') ?? '';
  const secret = process.env.PREVIEW_SECRET;
  if (!secret || !path || !verifyPreview(path, token, secret)) {
    return new NextResponse('This preview link is invalid or has expired. Open preview again from the admin.', { status: 401 });
  }
  (await draftMode()).enable();
  return NextResponse.redirect(new URL(path, request.url));
}
