import { advance } from '@/lib/pipeline';
import { getSite, saveSite } from '@/lib/store';
import type { ToolDef } from '@/lib/manifest';

export const maxDuration = 180;

type Ctx = { params: Promise<{ id: string }> };

function summarize(doc: NonNullable<Awaited<ReturnType<typeof getSite>>>, full: boolean) {
  const { capability, ...rest } = doc;
  return full ? doc : { ...rest, capabilityStats: capability?.stats, capabilitySpa: capability?.spa };
}

export async function GET(request: Request, { params }: Ctx) {
  const { id } = await params;
  let doc = await getSite(id);
  if (!doc) return Response.json({ error: 'not found' }, { status: 404 });
  if (!doc.demo && ['analyzing', 'generating', 'verifying'].includes(doc.status)) doc = await advance(doc);
  const full = new URL(request.url).searchParams.get('full') === '1';
  return Response.json(summarize(doc, full), { headers: { 'cache-control': 'no-store' } });
}

interface PatchBody {
  toolName?: string;
  description?: string;
  enabled?: boolean;
  retry?: boolean;
}

export async function PATCH(request: Request, { params }: Ctx) {
  const { id } = await params;
  const doc = await getSite(id);
  if (!doc) return Response.json({ error: 'not found' }, { status: 404 });
  if (doc.demo) return Response.json({ error: 'the demo manifest is read-only' }, { status: 400 });
  const body = (await request.json().catch(() => ({}))) as PatchBody;

  if (body.retry && doc.status === 'error') {
    doc.status = doc.capability ? (doc.manifest ? 'ready' : 'generating') : 'analyzing';
    doc.error = undefined;
    if (doc.status === 'analyzing' && !doc.analyzerJobId) {
      const { createSiteDoc } = await import('@/lib/pipeline');
      const fresh = await createSiteDoc(doc.id, doc.url);
      return Response.json(summarize(fresh, false));
    }
    await saveSite(doc);
    return Response.json(summarize(doc, false));
  }

  if (body.toolName && doc.manifest) {
    const tool = doc.manifest.tools.find((t: ToolDef) => t.name === body.toolName);
    if (!tool) return Response.json({ error: 'tool not found' }, { status: 404 });
    if (typeof body.description === 'string') tool.description = body.description.slice(0, 500);
    if (typeof body.enabled === 'boolean') tool.enabled = body.enabled;
    tool.source = tool.source === 'generated' ? 'repaired' : tool.source;
    await saveSite(doc);
  }
  return Response.json(summarize(doc, false));
}
