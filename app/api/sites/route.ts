import { createSiteDoc } from '@/lib/pipeline';
import { getSite, listSiteIds, newSiteId, storageKind } from '@/lib/store';

export const maxDuration = 60;

export async function GET() {
  const ids = await listSiteIds();
  const docs = (await Promise.all(ids.map((id) => getSite(id)))).filter(Boolean);
  return Response.json({
    storage: storageKind(),
    sites: docs.map((d) => ({ id: d!.id, url: d!.url, status: d!.status, name: d!.manifest?.name, tools: d!.manifest?.tools.length ?? 0, createdAt: d!.createdAt, demo: !!d!.demo })),
  });
}

export async function POST(request: Request) {
  let body: { url?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'JSON body with {url} required' }, { status: 400 });
  }
  const raw = (body.url ?? '').trim();
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return Response.json({ error: 'Invalid URL' }, { status: 400 });
  }
  if (!/^https?:$/.test(url.protocol)) return Response.json({ error: 'Only http(s) URLs are supported' }, { status: 400 });
  const doc = await createSiteDoc(newSiteId(), url.toString());
  return Response.json({ id: doc.id, status: doc.status, error: doc.error }, { status: 201 });
}
