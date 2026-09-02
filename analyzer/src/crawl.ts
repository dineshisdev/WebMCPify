import type { Page } from 'playwright';
import type { CapabilityModel, PageModel } from '../../lib/capability';
import { getBrowser, newContext } from './browser';
import { extractPage, dismissCookieBanner, type ExtractedPage } from './inpage';
import { assembleModel, classifyRegion, collapseSiblingPaths, templatePath } from './model';
import { attachNetwork } from './network';
import { runProbes } from './probe';
import { errorMessage, fnSource, normalizeStartUrl, withTimeout } from './util';

const MAX_PAGES = 6;
const MAX_MS = 60_000;

export interface CrawlProgress {
  (line: string): void;
}

function sameOrigin(href: string, origin: string): boolean {
  try {
    return new URL(href).origin === origin;
  } catch {
    return false;
  }
}

async function evalFn<T>(page: Page, fn: () => T): Promise<T> {
  return page.evaluate(`(${fnSource(fn)})()`) as Promise<T>;
}

async function waitIdle(page: Page): Promise<void> {
  await page.waitForLoadState('domcontentloaded').catch(() => undefined);
  await Promise.race([page.waitForLoadState('networkidle'), page.waitForTimeout(8000)]).catch(() => undefined);
}

export async function crawl(start: string, onProgress: CrawlProgress = () => undefined): Promise<CapabilityModel> {
  const url = normalizeStartUrl(start);
  const origin = new URL(url).origin;
  const browser = await getBrowser();
  const ctx = await newContext(browser);
  const page = await ctx.newPage();
  const net = attachNetwork(page, origin);
  const spaFlag = { current: false };

  await page.addInitScript(() => {
    const w = window as Window & { __webmcpify_spa?: boolean };
    const wrap = (name: 'pushState' | 'replaceState') => {
      const orig = history[name];
      history[name] = function (this: History, ...args: unknown[]) {
        w.__webmcpify_spa = true;
        return orig.apply(this, args as [unknown, string, string | URL | null | undefined]);
      };
    };
    wrap('pushState');
    wrap('replaceState');
  });

  const pages: PageModel[] = [];
  const visited = new Set<string>();
  const visitedTemplate = new Set<string>();
  const queue: { href: string; score: number }[] = [{ href: url, score: 10 }];
  const boundaries = { auth: [] as string[], skipped: [] as string[] };
  const t0 = Date.now();
  let siteTitle = '';

  try {
    while (queue.length && pages.length < MAX_PAGES && Date.now() - t0 < MAX_MS) {
      queue.sort((a, b) => b.score - a.score);
      const next = queue.shift()!;
      let target: URL;
      try {
        target = new URL(next.href, origin);
      } catch {
        continue;
      }
      if (target.origin !== origin) continue;
      target.hash = '';
      const href = target.toString();
      const path = target.pathname;
      const templ = templatePath(path);
      if (visited.has(href) || visitedTemplate.has(templ)) continue;
      visited.add(href);
      visitedTemplate.add(templ);

      onProgress(`Crawling ${path || '/'}`);
      try {
        await page.goto(href, { waitUntil: 'domcontentloaded', timeout: 20_000 });
        await waitIdle(page);
        await evalFn(page, dismissCookieBanner).catch(() => undefined);
        await page.waitForTimeout(200);
      } catch (e) {
        boundaries.skipped.push(`${path}: ${errorMessage(e)}`);
        continue;
      }

      const extracted: ExtractedPage = await evalFn(page, extractPage);
      if (!siteTitle) siteTitle = extracted.title;
      spaFlag.current = spaFlag.current || !!(await page.evaluate('!!window.__webmcpify_spa'));

      if (extracted.auth) {
        boundaries.auth.push(href);
        onProgress(`Auth wall at ${path} — not probing`);
      }

      const pageModel: PageModel = {
        url: page.url(),
        urlTemplate: templ,
        title: extracted.title,
        headings: extracted.headings,
        textExcerpt: extracted.textExcerpt,
        auth: extracted.auth,
        region: 'other',
        forms: extracted.forms,
        controls: extracted.controls,
        lists: extracted.lists,
        urlState: { params: extracted.urlState.params, changedByProbe: false },
        storageKeys: extracted.storageKeys,
        probes: [],
      };
      pageModel.region = classifyRegion(pageModel, url);

      if (!extracted.auth && pages.length === 0) {
        try {
          pageModel.probes = await runProbes(page, extracted);
          pageModel.urlState.changedByProbe = pageModel.probes.some((p) => p.effects.urlAfter !== href);
        } catch {}
      }

      pages.push(pageModel);

      for (const link of extracted.links) {
        if (!sameOrigin(link.href, origin)) continue;
        try {
          const u = new URL(link.href);
          const t = templatePath(u.pathname);
          if (visited.has(u.toString()) || visitedTemplate.has(t)) continue;
          if (MINUS_PATH.test(u.pathname)) {
            boundaries.skipped.push(u.pathname);
            continue;
          }
          queue.push({ href: u.toString(), score: link.score });
        } catch {}
      }
    }
  } finally {
    await ctx.close().catch(() => undefined);
  }

  const sibling = collapseSiblingPaths(pages.map((p) => {
    try {
      return new URL(p.url).pathname;
    } catch {
      return p.url;
    }
  }));
  for (const p of pages) {
    try {
      const path = new URL(p.url).pathname;
      const t = sibling.get(path);
      if (t) p.urlTemplate = t;
    } catch {}
  }

  const spa = spaFlag.current || pages.some((p) => p.probes.some((pr) => pr.effects.pushState));
  onProgress(`Done: ${pages.length} pages, ${net.endpoints.length} endpoints, spa=${spa}`);
  return assembleModel({
    url,
    origin,
    siteTitle: siteTitle || origin,
    spa,
    pages,
    endpoints: net.endpoints,
    boundaries,
  });
}

const MINUS_PATH = /\/(login|signin|sign-in|privacy|terms|cookies?|legal|careers)(\/|$)/i;

export { withTimeout };
