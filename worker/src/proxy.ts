import type { Env } from './env';
import { json } from './env';
import { checkOrigin, type ResolvedSite } from './site';
import { cleanRequestHeaders, cleanResponseHeaders } from './headers';
import { buildInjection, createHtmlRewriter, makeCtx, rewriteCss } from './rewrite';

export interface ProxyParams {
  siteId: string;
  prefix: string;
  subpath: string;
  site: ResolvedSite;
}

const BODYLESS = new Set(['GET', 'HEAD', 'OPTIONS', 'TRACE']);

export async function proxy(request: Request, env: Env, params: ProxyParams): Promise<Response> {
  const { siteId, prefix, subpath, site } = params;
  const reqUrl = new URL(request.url);
  const workerOrigin = reqUrl.origin;

  const guard = checkOrigin(site.origin, env);
  if (!guard.ok) return json({ error: 'refused origin', detail: guard.reason }, 502);
  const targetOrigin = guard.url.origin;

  const target = new URL(targetOrigin);
  target.pathname = subpath;
  target.search = reqUrl.search;
  if (target.origin !== targetOrigin) return json({ error: 'bad path' }, 400);

  const headers = cleanRequestHeaders(request, targetOrigin, prefix);
  const init: RequestInit = {
    method: request.method,
    headers,
    redirect: 'manual',
    body: BODYLESS.has(request.method) ? undefined : request.body,
  };

  let upstream: Response;
  try {
    upstream = await fetch(target.toString(), init);
  } catch (err) {
    return json({ error: 'upstream fetch failed', target: target.toString(), detail: String(err) }, 502);
  }

  const outHeaders = cleanResponseHeaders(upstream, { siteId, prefix, workerOrigin, targetOrigin });
  const status = upstream.status;

  if (status >= 300 && status < 400) {
    return new Response(status === 304 ? null : upstream.body, { status, statusText: upstream.statusText, headers: outHeaders });
  }

  const ctype = (upstream.headers.get('content-type') || '').toLowerCase();
  const hasBody = upstream.body !== null && request.method !== 'HEAD';
  if (ctype.includes('text/html')) outHeaders.set('cache-control', 'no-store');

  if (hasBody && ctype.includes('text/html')) {
    const ctx = makeCtx(targetOrigin, prefix);
    const injection = buildInjection({
      siteId,
      prefix,
      apiBase: env.API_BASE || '',
      manifest: site.manifest,
    });
    const rewriter = createHtmlRewriter(ctx, injection);
    return rewriter.transform(new Response(upstream.body, { status, statusText: upstream.statusText, headers: outHeaders }));
  }

  if (hasBody && ctype.includes('text/css')) {
    const css = await upstream.text();
    return new Response(rewriteCss(css, makeCtx(targetOrigin, prefix)), { status, statusText: upstream.statusText, headers: outHeaders });
  }

  return new Response(hasBody ? upstream.body : null, { status, statusText: upstream.statusText, headers: outHeaders });
}
