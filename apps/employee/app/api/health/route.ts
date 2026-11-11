// Container/load-balancer probe for the employee portal itself (dependency health lives on the API).
export const dynamic = 'force-dynamic';
export function GET() {
  return Response.json({ status: 'ok' });
}
