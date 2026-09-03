const REQUEST_DROP = new Set([
  'host', 'accept-encoding', 'x-real-ip', 'connection', 'keep-alive', 'te', 'upgrade', 'content-length',
  'transfer-encoding', 'trailer', 'proxy-authorization', 'proxy-connection', 'expect',
]);

export function cleanRequestHeaders(req: Request, targetOrigin: string, prefix: string): Headers {
  const out = new Headers();
  req.headers.forEach((value, name) => {
    const n = name.toLowerCase();
    if (REQUEST_DROP.has(n) || n.startsWith('cf-') || n.startsWith('x-forwarded-')) return;
    if (n === 'origin' || n === 'referer') return;
    out.set(name, value);
  });
  if (req.headers.has('origin')) out.set('origin', targetOrigin);
  const ref = req.headers.get('referer');
  if (ref) out.set('referer', mapReferer(ref, targetOrigin, prefix));
  return out;
}

function mapReferer(ref: string, targetOrigin: string, prefix: string): string {
  try {
    const u = new URL(ref);
    if (u.pathname === prefix || u.pathname.startsWith(prefix + '/')) {
      const rest = u.pathname.slice(prefix.length) || '/';
      return targetOrigin + rest + u.search;
    }
  } catch {}
  return targetOrigin + '/';
}

const RESPONSE_DROP = new Set([
  'content-security-policy',
  'content-security-policy-report-only',
  'x-webkit-csp',
  'x-frame-options',
  'origin-agent-cluster',
  'content-length',
  'content-encoding',
  'transfer-encoding',
  'link',
  'cross-origin-opener-policy',
  'cross-origin-embedder-policy',
  'cross-origin-resource-policy',
  'strict-transport-security',
  'report-to',
  'reporting-endpoints',
  'nel',
  'alt-svc',
  'set-cookie',
]);

export interface ResponseHeaderOpts {
  siteId: string;
  prefix: string;
  workerOrigin: string;
  targetOrigin: string;
}

export function cleanResponseHeaders(res: Response, opts: ResponseHeaderOpts): Headers {
  const out = new Headers();
  res.headers.forEach((value, name) => {
    if (RESPONSE_DROP.has(name.toLowerCase())) return;
    out.set(name, value);
  });

  for (const raw of res.headers.getSetCookie()) {
    out.append('set-cookie', rewriteSetCookie(raw, opts.prefix));
  }

  const loc = res.headers.get('location');
  if (loc) out.set('location', rewriteLocation(loc, opts));

  out.set('origin-agent-cluster', '?1');
  out.set('permissions-policy', 'tools=(self)');
  out.set('x-webmcpify', '1');
  out.set('x-robots-tag', 'noindex, nofollow, noarchive');
  return out;
}

export function rewriteSetCookie(raw: string, path: string): string {
  const parts = raw.split(';').map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return raw;
  let nameValue = parts[0] as string;
  const eq = nameValue.indexOf('=');
  const cookieName = eq === -1 ? nameValue : nameValue.slice(0, eq);
  if (/^__(Host|Secure)-/i.test(cookieName)) {
    nameValue = `wmcp_${nameValue}`;
  }
  const out: string[] = [nameValue];
  let hasPath = false;
  for (const p of parts.slice(1)) {
    const key = (p.split('=')[0] ?? '').trim().toLowerCase();
    if (key === 'domain') continue;
    if (key === 'path') {
      if (!hasPath) out.push(`Path=${path}`);
      hasPath = true;
      continue;
    }
    out.push(p);
  }
  if (!hasPath) out.push(`Path=${path}`);
  return out.join('; ');
}

export function rewriteLocation(loc: string, opts: ResponseHeaderOpts): string {
  const v = loc.trim();
  if (v.startsWith('/') && !v.startsWith('//')) return opts.prefix + v;
  try {
    const u = new URL(v, opts.targetOrigin);
    const t = new URL(opts.targetOrigin);
    if ((u.protocol === 'http:' || u.protocol === 'https:') && u.host === t.host) {
      return opts.workerOrigin + opts.prefix + u.pathname + u.search + u.hash;
    }
  } catch {}
  return loc;
}
