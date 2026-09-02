import type { BridgeConfig } from '../../lib/manifest';

declare global {
  interface Window {
    __WEBMCPIFY?: Partial<BridgeConfig>;
  }
}

const PROXY_RE = /\/s\/([^/]+)\/__webmcpify\/bridge\.js(?:[?#]|$)/;
const SNIPPET_RE = /\/w\/([^/]+)\.js(?:[?#]|$)/;

export function resolveConfig(script: HTMLScriptElement | null): BridgeConfig | null {
  const given = window.__WEBMCPIFY;
  if (given && given.mode && given.siteId) {
    return {
      mode: given.mode,
      siteId: given.siteId,
      prefix: normalizePrefix(given.prefix ?? (given.mode === 'proxy' ? `/s/${given.siteId}` : '')),
      apiBase: stripSlash(given.apiBase ?? ''),
      manifest: given.manifest,
      dryRun: !!given.dryRun,
    };
  }
  const src = script?.src ?? '';
  let origin = '';
  try {
    origin = src ? new URL(src, location.href).origin : '';
  } catch {}
  const proxy = PROXY_RE.exec(src);
  if (proxy) {
    return { mode: 'proxy', siteId: proxy[1], prefix: `/s/${proxy[1]}`, apiBase: stripSlash(given?.apiBase ?? ''), dryRun: false };
  }
  const snippet = SNIPPET_RE.exec(src);
  if (snippet) {
    return { mode: 'snippet', siteId: snippet[1], prefix: '', apiBase: origin, dryRun: false };
  }
  const dataSite = script?.getAttribute('data-site');
  if (dataSite) {
    return { mode: 'snippet', siteId: dataSite, prefix: '', apiBase: script?.getAttribute('data-api') || origin, dryRun: false };
  }
  return null;
}

function normalizePrefix(p: string): string {
  if (!p) return '';
  let s = p.startsWith('/') ? p : '/' + p;
  s = s.replace(/\/+$/, '');
  return s;
}

function stripSlash(s: string): string {
  return s.replace(/\/+$/, '');
}

export function currentPath(prefix: string): string {
  let p = location.pathname;
  if (prefix && (p === prefix || p.startsWith(prefix + '/'))) p = p.slice(prefix.length) || '/';
  return p + location.search;
}
