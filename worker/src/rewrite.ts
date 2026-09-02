export interface RewriteCtx {
  targetOrigin: string;
  targetHost: string;
  prefix: string;
}

export function makeCtx(targetOrigin: string, prefix: string): RewriteCtx {
  return { targetOrigin, targetHost: new URL(targetOrigin).host.toLowerCase(), prefix };
}

const SKIP_RE = /^(?:#|data:|blob:|javascript:|mailto:|tel:|about:|sms:|ws:|wss:)/i;

export function rewriteUrl(raw: string, ctx: RewriteCtx): string {
  const v = raw.trim();
  if (!v || SKIP_RE.test(v)) return raw;
  if (v.startsWith('/')) {
    if (!v.startsWith('//')) return ctx.prefix + v;
    return rewriteAbsolute(v, ctx) ?? raw;
  }
  if (/^https?:\/\//i.test(v)) return rewriteAbsolute(v, ctx) ?? raw;
  return raw;
}

function rewriteAbsolute(v: string, ctx: RewriteCtx): string | null {
  try {
    const u = new URL(v, ctx.targetOrigin);
    if ((u.protocol === 'http:' || u.protocol === 'https:') && u.host.toLowerCase() === ctx.targetHost) {
      return ctx.prefix + u.pathname + u.search + u.hash;
    }
  } catch {}
  return null;
}

export function rewriteSrcset(raw: string, ctx: RewriteCtx): string {
  if (!raw.includes('/')) return raw;
  const out: string[] = [];
  let i = 0;
  while (i < raw.length) {
    while (i < raw.length && (/\s/.test(raw[i] as string) || raw[i] === ',')) i++;
    if (i >= raw.length) break;
    const urlStart = i;
    while (i < raw.length && !/\s/.test(raw[i] as string)) i++;
    let url = raw.slice(urlStart, i);
    let trailingComma = false;
    while (url.endsWith(',')) {
      url = url.slice(0, -1);
      trailingComma = true;
    }
    let desc = '';
    if (!trailingComma) {
      const descStart = i;
      while (i < raw.length && raw[i] !== ',') i++;
      desc = raw.slice(descStart, i).trimEnd();
    }
    const rewritten = /^(data|blob):/i.test(url) ? url : rewriteUrl(url, ctx);
    out.push(desc ? `${rewritten}${desc}` : rewritten);
  }
  return out.join(', ');
}

const CSS_URL_RE = /url\(\s*(["']?)([^"')\s]+)\1\s*\)/gi;
const CSS_IMPORT_RE = /@import\s+(["'])([^"']+)\1/gi;

export function rewriteCss(css: string, ctx: RewriteCtx): string {
  if (!css.includes('/')) return css;
  return css
    .replace(CSS_URL_RE, (m, q: string, url: string) => {
      const nu = rewriteUrl(url, ctx);
      return nu === url ? m : `url(${q}${nu}${q})`;
    })
    .replace(CSS_IMPORT_RE, (m, q: string, url: string) => {
      const nu = rewriteUrl(url, ctx);
      return nu === url ? m : `@import ${q}${nu}${q}`;
    });
}

export function jsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

export interface InjectOpts {
  siteId: string;
  prefix: string;
  apiBase: string;
  manifest: unknown;
}

export function buildInjection(o: InjectOpts): string {
  const cfg = { mode: 'proxy', siteId: o.siteId, prefix: o.prefix, apiBase: o.apiBase, manifest: o.manifest };
  return (
    `<script data-webmcpify="bootstrap">window.__WEBMCPIFY=${jsonForScript(cfg)};</script>` +
    `<script type="application/json" id="__webmcpify_manifest">${jsonForScript(o.manifest)}</script>` +
    `<script src="${o.prefix}/__webmcpify/bridge.js" data-webmcpify="bridge"></script>`
  );
}

const URL_ATTRS: Array<[selector: string, attr: string, kind: 'url' | 'srcset']> = [
  ['a[href]', 'href', 'url'],
  ['area[href]', 'href', 'url'],
  ['link[href]', 'href', 'url'],
  ['script[src]', 'src', 'url'],
  ['img[src]', 'src', 'url'],
  ['img[srcset]', 'srcset', 'srcset'],
  ['source[src]', 'src', 'url'],
  ['source[srcset]', 'srcset', 'srcset'],
  ['video[src]', 'src', 'url'],
  ['video[poster]', 'poster', 'url'],
  ['audio[src]', 'src', 'url'],
  ['iframe[src]', 'src', 'url'],
  ['embed[src]', 'src', 'url'],
  ['form[action]', 'action', 'url'],
  ['use[href]', 'href', 'url'],
  ['image[href]', 'href', 'url'],
  ['object[data]', 'data', 'url'],
];

export function createHtmlRewriter(ctx: RewriteCtx, injection: string): HTMLRewriter {
  const rw = new HTMLRewriter();
  let injected = false;
  const inject = (el: Element) => {
    if (injected) return;
    injected = true;
    el.prepend(injection, { html: true });
  };
  rw.on('head', { element: inject });
  rw.on('body', { element: inject });
  rw.onDocument({
    end(end) {
      if (!injected) end.append(injection, { html: true });
    },
  });

  for (const [selector, attr, kind] of URL_ATTRS) {
    rw.on(selector, {
      element(el) {
        const v = el.getAttribute(attr);
        if (v == null) return;
        const nv = kind === 'srcset' ? rewriteSrcset(v, ctx) : rewriteUrl(v, ctx);
        if (nv !== v) el.setAttribute(attr, nv);
      },
    });
  }

  rw.on('base', {
    element(el) {
      el.remove();
    },
  });
  rw.on('meta[http-equiv]', {
    element(el) {
      const he = (el.getAttribute('http-equiv') || '').trim().toLowerCase();
      if (he === 'content-security-policy' || he === 'x-webkit-csp') el.remove();
    },
  });

  rw.on('[style]', {
    element(el) {
      const s = el.getAttribute('style');
      if (s && /url\(/i.test(s)) {
        const ns = rewriteCss(s, ctx);
        if (ns !== s) el.setAttribute('style', ns);
      }
    },
  });

  let cssBuf = '';
  rw.on('style', {
    element() {
      cssBuf = '';
    },
    text(chunk) {
      cssBuf += chunk.text;
      if (chunk.lastInTextNode) {
        const out = rewriteCss(cssBuf, ctx);
        cssBuf = '';
        chunk.replace(out, { html: true });
      } else {
        chunk.remove();
      }
    },
  });

  return rw;
}
