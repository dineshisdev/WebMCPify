import { promises as fs } from 'node:fs';
import path from 'node:path';
import { getSite } from '@/lib/store';

async function bridgeSource(origin: string): Promise<string> {
  try {
    return await fs.readFile(path.join(process.cwd(), 'public', 'bridge.js'), 'utf8');
  } catch {
    const res = await fetch(`${origin}/bridge.js`, { cache: 'no-store' });
    if (!res.ok) throw new Error('bridge.js not built');
    return res.text();
  }
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = rawId.replace(/\.js$/, '');
  const url = new URL(request.url);
  const origin = process.env.NEXT_PUBLIC_APP_ORIGIN?.replace(/\/$/, '') || url.origin;
  const doc = await getSite(id);
  const headers = { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'public, max-age=60', 'access-control-allow-origin': '*' };
  if (!doc?.manifest) return new Response(`console.warn('[webmcpify] unknown site ${id}');`, { status: 404, headers });
  let bridge: string;
  try {
    bridge = await bridgeSource(origin);
  } catch (e) {
    return new Response(`console.error('[webmcpify] ${(e as Error).message}');`, { status: 500, headers });
  }
  const prelude = `window.__WEBMCPIFY=${JSON.stringify({ mode: 'snippet', siteId: id, prefix: '', apiBase: origin })};\n`;
  return new Response(prelude + bridge, { headers });
}
