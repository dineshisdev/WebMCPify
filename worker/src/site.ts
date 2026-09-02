import { proxyAllowed, type SiteManifest, type ToolDef } from '../../lib/manifest';
import type { Env } from './env';
import { devSites, type ResolvedSite } from './dev-sites';

export type { ResolvedSite } from './dev-sites';

const CACHE_TTL_S = 60;
const API_TIMEOUT_MS = 6000;

function cacheKey(id: string): Request {
  return new Request(`https://webmcpify-cache/site/${encodeURIComponent(id)}`, { method: 'GET' });
}

function isManifest(x: unknown): x is SiteManifest {
  return !!x && typeof x === 'object' && typeof (x as SiteManifest).origin === 'string' && Array.isArray((x as SiteManifest).tools);
}

function publicTools(tools: ToolDef[]): ToolDef[] {
  return tools.filter((t) => t.enabled && t.verification?.status !== 'failed');
}

async function fetchFromApi(id: string, env: Env): Promise<ResolvedSite | null> {
  const base = (env.API_BASE || '').replace(/\/+$/, '');
  if (!base) return null;
  try {
    const res = await fetch(`${base}/api/sites/${encodeURIComponent(id)}/manifest`, {
      headers: { accept: 'application/json', 'user-agent': 'webmcpify-proxy/0.1' },
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as unknown;
    const wrapped = (data as { manifest?: unknown } | null)?.manifest;
    const manifest = isManifest(wrapped) ? wrapped : isManifest(data) ? data : null;
    if (!manifest) return null;
    const origin = new URL(manifest.origin).origin;
    return { origin, manifest: { ...manifest, origin, tools: publicTools(manifest.tools) } };
  } catch {
    return null;
  }
}

export async function getSite(id: string, env: Env, ctx?: ExecutionContext): Promise<ResolvedSite | null> {
  const cache = caches.default;
  const key = cacheKey(id);

  try {
    const hit = await cache.match(key);
    if (hit) return (await hit.json()) as ResolvedSite;
  } catch {}

  const fromApi = await fetchFromApi(id, env);
  if (fromApi) {
    const stored = new Response(JSON.stringify(fromApi), {
      headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${CACHE_TTL_S}` },
    });
    const put = cache.put(key, stored).catch(() => undefined);
    if (ctx) ctx.waitUntil(put);
    else await put;
    return fromApi;
  }

  return devSites(env)[id] ?? null;
}

function isPrivateIPv4(host: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a >= 224
  );
}

function isPrivateIPv6(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, '').toLowerCase();
  return h === '::1' || h === '::' || /^f[cd]/.test(h) || /^fe[89ab]/.test(h) || h.startsWith('::ffff:');
}

export function checkOrigin(origin: string, env: Env): { ok: true; url: URL } | { ok: false; reason: string } {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return { ok: false, reason: 'invalid origin' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return { ok: false, reason: 'origin must be http(s)' };
  if (env.ALLOW_PRIVATE_ORIGINS === '1') return { ok: true, url };
  const host = url.hostname.toLowerCase();
  const isLocalName =
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.endsWith('.home.arpa') ||
    !host.includes('.');
  if (isLocalName || isPrivateIPv4(host) || isPrivateIPv6(host)) {
    return { ok: false, reason: 'private origins are not allowed (set ALLOW_PRIVATE_ORIGINS=1 for local dev)' };
  }
  return { ok: true, url };
}

/**
 * Why this site may not be served through the instant proxy, or null if it may.
 * Proxying re-serves an origin under our domain with its CSP/frame protections
 * stripped, so we refuse sign-in sites outright and honour an optional allowlist.
 */
export function proxyRefusal(site: ResolvedSite, env: Env): string | null {
  if (!proxyAllowed(site.manifest)) {
    return site.manifest.proxy?.reason || 'this site is not eligible for instant proxying';
  }
  const allow = (env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim().replace(/\/$/, ''))
    .filter(Boolean);
  if (allow.length && !allow.includes(site.origin.replace(/\/$/, ''))) {
    return 'this origin is not on the allowlist for instant proxying';
  }
  return null;
}
