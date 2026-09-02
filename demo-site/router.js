const BASE_RE = /^\/s\/[^/]+/;

export const base = (() => {
  const m = location.pathname.match(BASE_RE);
  return m ? m[0] : '';
})();

export function stripBase(pathname) {
  if (base && (pathname === base || pathname.startsWith(base + '/'))) {
    return pathname.slice(base.length) || '/';
  }
  return pathname;
}

export function withBase(path) {
  return base + path;
}

function compile(pattern) {
  const keys = [];
  const source = pattern.replace(/\/:([^/]+)/g, (_, key) => {
    keys.push(key);
    return '/([^/]+)';
  });
  return { re: new RegExp('^' + source + '/?$'), keys };
}

export class Router {
  constructor() {
    this.routes = [];
    this.fallback = null;
  }

  on(pattern, handler) {
    this.routes.push({ ...compile(pattern), handler });
    return this;
  }

  otherwise(handler) {
    this.fallback = handler;
    return this;
  }

  currentPath() {
    return stripBase(location.pathname);
  }

  navigate(to, { replace = false } = {}) {
    const url = new URL(to, location.origin);
    const target = withBase(url.pathname) + url.search + url.hash;
    if (replace) history.replaceState(null, '', target);
    else history.pushState(null, '', target);
    this.render();
  }

  replaceQuery(params) {
    const qs = params.toString();
    history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '') + location.hash);
  }

  render() {
    const path = this.currentPath();
    const query = new URLSearchParams(location.search);
    for (const route of this.routes) {
      const m = path.match(route.re);
      if (!m) continue;
      const params = {};
      route.keys.forEach((key, i) => {
        try { params[key] = decodeURIComponent(m[i + 1]); } catch { params[key] = m[i + 1]; }
      });
      return route.handler(params, query);
    }
    if (this.fallback) return this.fallback({}, query);
  }

  start() {
    window.addEventListener('popstate', () => this.render());
    document.addEventListener('click', (e) => this.handleClick(e));
    this.render();
  }

  handleClick(e) {
    if (e.defaultPrevented || e.button !== 0) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest('a[href]');
    if (!a) return;
    if (a.target && a.target !== '_self') return;
    if (a.hasAttribute('download') || a.getAttribute('rel') === 'external') return;
    const href = a.getAttribute('href');
    if (/^(mailto:|tel:|javascript:)/i.test(href)) return;
    const url = new URL(href, location.href);
    if (url.origin !== location.origin) return;
    e.preventDefault();
    this.navigate(stripBase(url.pathname) + url.search + url.hash);
  }
}
