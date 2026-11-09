// Container/load-balancer probe for the web app itself (dependency health lives on the API).
export const dynamic = 'force-dynamic';
export function GET() {
  return Response.json({ status: 'ok' });
}
