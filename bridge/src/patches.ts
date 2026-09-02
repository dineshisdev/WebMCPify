type HistoryMethod = (data: unknown, unused: string, url?: string | URL | null) => void;

export function installPatches(prefix: string): void {
  if (!prefix) return;

  const rewrite = (input: string): string => {
    try {
      const abs = new URL(input, location.href);
      if (abs.origin !== location.origin) return input;
      if (abs.pathname === prefix || abs.pathname.startsWith(prefix + '/')) return input;
      abs.pathname = prefix + (abs.pathname.startsWith('/') ? '' : '/') + abs.pathname;
      return /^[a-z][a-z0-9+.-]*:/i.test(input) || input.startsWith('//') ? abs.href : abs.pathname + abs.search + abs.hash;
    } catch {
      return input;
    }
  };

  const origFetch = window.fetch;
  if (typeof origFetch === 'function') {
    window.fetch = function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
      let next: RequestInfo | URL = input;
      if (typeof input === 'string') next = rewrite(input);
      else if (input instanceof URL) next = rewrite(input.href);
      else if (typeof Request !== 'undefined' && input instanceof Request) {
        const url = rewrite(input.url);
        if (url !== input.url) next = new Request(url, input);
      }
      return origFetch.call(window, next, init);
    };
  }

  const xhrOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, method: string, url: string | URL, ...rest: unknown[]) {
    const u = typeof url === 'string' ? rewrite(url) : url instanceof URL ? rewrite(url.href) : url;
    return (xhrOpen as unknown as (...a: unknown[]) => void).call(this, method, u, ...rest);
  } as typeof XMLHttpRequest.prototype.open;

  const wrapHistory = (name: 'pushState' | 'replaceState') => {
    const orig = history[name] as HistoryMethod;
    history[name] = function (this: History, data: unknown, unused: string, url?: string | URL | null) {
      let u = url;
      if (typeof url === 'string') u = rewrite(url);
      else if (url instanceof URL) u = rewrite(url.href);
      return orig.call(this, data, unused, u);
    } as History['pushState'];
  };
  wrapHistory('pushState');
  wrapHistory('replaceState');

  try {
    const sw = navigator.serviceWorker;
    if (sw) {
      Object.defineProperty(sw, 'register', {
        configurable: true,
        value: () => new Promise<never>(() => undefined),
      });
    }
  } catch {}
}

export function hookHistory(onChange: () => void): void {
  const wrap = (name: 'pushState' | 'replaceState') => {
    const orig = history[name] as HistoryMethod;
    history[name] = function (this: History, data: unknown, unused: string, url?: string | URL | null) {
      const r = orig.call(this, data, unused, url);
      try {
        onChange();
      } catch {}
      return r;
    } as History['pushState'];
  };
  wrap('pushState');
  wrap('replaceState');
  window.addEventListener('popstate', onChange);
  window.addEventListener('hashchange', onChange);
}
