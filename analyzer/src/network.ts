import type { Page } from 'playwright';
import type { EndpointModel } from '../../lib/capability';
import { templatePath } from './model';
import { truncate } from './util';

export interface NetCapture {
  endpoints: EndpointModel[];
  note(res: { url: string; method: string; status: number; contentType: string; body: unknown; triggeredBy?: string }): void;
}

function summarize(value: unknown, budget = 600): string {
  try {
    const json = JSON.stringify(value, (_k, v) => {
      if (Array.isArray(v) && v.length > 3) return v.slice(0, 3).concat({ _more: v.length - 3 });
      if (typeof v === 'string' && v.length > 80) return v.slice(0, 79) + '…';
      return v;
    });
    return truncate(json ?? 'null', budget);
  } catch {
    return truncate(String(value), budget);
  }
}

export function attachNetwork(page: Page, origin: string): NetCapture {
  const byKey = new Map<string, EndpointModel>();

  const note: NetCapture['note'] = (res) => {
    let url: URL;
    try {
      url = new URL(res.url);
    } catch {
      return;
    }
    if (url.origin !== origin) return;
    const method = res.method.toUpperCase();
    const templ = templatePath(url.pathname);
    const key = `${method} ${templ}`;
    if (byKey.size >= 12 && !byKey.has(key)) return;
    const queryParams = [...url.searchParams.keys()].slice(0, 12);
    byKey.set(key, {
      method,
      urlTemplate: templ + (queryParams.length ? '{?' + queryParams.join(',') + '}' : ''),
      queryParams,
      contentType: res.contentType.slice(0, 80),
      status: res.status,
      responseShape: summarize(res.body),
      triggeredBy: res.triggeredBy,
    });
  };

  page.on('response', (response) => {
    const ctype = (response.headers()['content-type'] || '').toLowerCase();
    if (!ctype.includes('json')) return;
    const req = response.request();
    const url = response.url();
    void response
      .json()
      .then((body) => note({ url, method: req.method(), status: response.status(), contentType: ctype, body }))
      .catch(() => undefined);
  });

  return {
    get endpoints() {
      return [...byKey.values()];
    },
    note,
  };
}
