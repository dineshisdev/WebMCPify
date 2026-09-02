import { analyzer } from '@/lib/analyzer-client';
import { getSite, pushProgress, saveSite } from '@/lib/store';

export const maxDuration = 60;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const doc = await getSite(id);
  if (!doc?.manifest) return Response.json({ error: 'manifest not ready' }, { status: 404 });
  if (doc.demo) return Response.json({ error: 'the demo manifest is read-only' }, { status: 400 });
  const body = (await request.json().catch(() => ({}))) as { tools?: string[] };
  const tools = body.tools?.length ? body.tools : doc.manifest.tools.map((t) => t.name);
  try {
    const { jobId } = await analyzer.startVerify(doc.url, doc.manifest, tools);
    doc.verifyJobId = jobId;
    doc.status = 'verifying';
    doc.repairAttempted = doc.repairAttempted ?? [];
    pushProgress(doc, `Re-verifying ${tools.length} tool(s)…`);
    await saveSite(doc);
    return Response.json({ ok: true, jobId });
  } catch (e) {
    return Response.json({ error: `analyzer unavailable: ${(e as Error).message}` }, { status: 502 });
  }
}
