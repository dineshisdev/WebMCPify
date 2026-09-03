import type { Env } from './env';
import { SITE_ID_RE, json } from './env';
import { getSite, proxyRefusal } from './site';
import { proxy } from './proxy';

const ROUTE_RE = /^\/s\/([^/]+)(\/.*)?$/;

async function serveBridge(request: Request, env: Env): Promise<Response> {
  const assetUrl = new URL('/bridge.js', request.url);
  const res = await env.ASSETS.fetch(new Request(assetUrl.toString(), { method: 'GET', headers: request.headers }));
  const headers = new Headers();
  headers.set('content-type', 'text/javascript; charset=utf-8');
  headers.set('cache-control', res.ok ? 'public, max-age=300' : 'no-store');
  headers.set('access-control-allow-origin', '*');
  headers.set('x-webmcpify', '1');
  const etag = res.headers.get('etag');
  if (etag) headers.set('etag', etag);
  if (!res.ok) {
    return new Response(`console.error('[webmcpify] bridge.js missing from worker/public (status ${res.status})');\n`, { status: 200, headers });
  }
  return new Response(request.method === 'HEAD' ? null : res.body, { status: res.status, headers });
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === '/') {
      return Response.redirect(env.DASHBOARD_URL || 'https://webmcpify.netlify.app', 302);
    }

    const m = ROUTE_RE.exec(path);
    if (!m) return json({ error: 'not found', hint: 'use /s/<siteId>/<path>' }, 404);

    const raw = m[1] as string;
    const rest = m[2];
    if (!SITE_ID_RE.test(raw)) return json({ error: 'unknown site' }, 404);
    const id = raw;
    const prefix = `/s/${id}`;

    if (rest === undefined) {
      return Response.redirect(`${url.origin}${prefix}/${url.search}`, 302);
    }

    if (rest.startsWith('/__webmcpify/')) {
      if (rest === '/__webmcpify/bridge.js') return serveBridge(request, env);
      if (rest === '/__webmcpify/manifest.json') {
        const site = await getSite(id, env, ctx);
        if (!site) return json({ error: 'unknown site' }, 404);
        return json(site.manifest, 200, { 'access-control-allow-origin': '*' });
      }
      return json({ error: 'not found' }, 404);
    }

    const site = await getSite(id, env, ctx);
    if (!site) return json({ error: 'unknown site' }, 404);

    const refusal = proxyRefusal(site, env);
    if (refusal) return refusedPage(site, refusal, env);

    try {
      return await proxy(request, env, { siteId: id, prefix, subpath: rest, site });
    } catch (err) {
      return json({ error: 'proxy error', detail: err instanceof Error ? err.message : String(err) }, 502);
    }
  },
} satisfies ExportedHandler<Env>;

function esc(v: string): string {
  return v.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}

function refusedPage(site: { origin: string; manifest: { siteId: string } }, reason: string, env: Env): Response {
  const dash = (env.DASHBOARD_URL || '').replace(/\/$/, '');
  const body = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Instant proxy unavailable</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0a0c11;color:#e8ebf1;
font:15px/1.6 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
.c{max-width:34rem;padding:2rem}h1{font-size:1.25rem;margin:0 0 .5rem}p{color:#a3adbd;margin:.5rem 0}
code{background:#171b25;padding:.1rem .35rem;border-radius:4px;font-size:13px}
a{color:#8b8bf0}</style></head><body><div class="c">
<h1>Instant proxy unavailable for this site</h1>
<p>WebMCPify will not re-host <code>${esc(site.origin)}</code> because ${esc(reason)}.</p>
<p>Proxying serves a site under our domain with its own frame and content-security
protections removed. We refuse that for anything with a sign-in, so the proxy can't be
used to host a copy of a login page.</p>
<p><strong>The tools were still generated.</strong> Install them on the site itself with one line —
snippet mode has no such restriction, and your sessions and logins keep working:</p>
<p><code>&lt;script src="${esc(dash)}/w/${esc(site.manifest.siteId)}.js"&gt;&lt;/script&gt;</code></p>
${dash ? `<p><a href="${esc(dash)}/sites/${esc(site.manifest.siteId)}">Open the dashboard →</a></p>` : ''}
</div></body></html>`;
  return new Response(body, {
    status: 403,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow' },
  });
}
