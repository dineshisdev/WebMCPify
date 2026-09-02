import { publicManifest } from '@/lib/manifest';
import { getSite } from '@/lib/store';

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, OPTIONS', 'access-control-allow-headers': '*' };

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const doc = await getSite(id);
  if (!doc?.manifest) return Response.json({ error: 'manifest not ready' }, { status: 404, headers: CORS });
  return Response.json(publicManifest(doc.manifest), { headers: { ...CORS, 'cache-control': 'public, max-age=15' } });
}
