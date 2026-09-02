import type { CapabilityModel, PageModel, PageRegion } from '../../lib/capability';
import { estimateTokens, fitBudget } from '../../lib/capability';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEX_RE = /^[0-9a-f]{8,}$/i;
const NUMERIC_RE = /^\d{2,}$/;
const SLUG_DIGITS_RE = /^(?=.*\d)[a-z0-9]+(?:[-_.][a-z0-9]+)*$/i;
const FILE_LIKE_RE = /^(index|default)\.(html?|php|aspx?)$/i;

export function isVariableSegment(seg: string): boolean {
  if (!seg) return false;
  if (NUMERIC_RE.test(seg) || UUID_RE.test(seg) || HEX_RE.test(seg)) return true;
  if (SLUG_DIGITS_RE.test(seg) && !FILE_LIKE_RE.test(seg)) {
    return true;
  }
  return false;
}

export function templatePath(pathname: string): string {
  const parts = pathname.split('/');
  const out = parts.map((seg) => (isVariableSegment(decodeURIComponentSafe(seg)) ? ':id' : seg));
  const joined = out.join('/') || '/';
  return joined.startsWith('/') ? joined : '/' + joined;
}

export function decodeURIComponentSafe(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

export function parentDir(pathname: string): string {
  const idx = pathname.lastIndexOf('/');
  return idx <= 0 ? '/' : pathname.slice(0, idx);
}

export function lastSegment(pathname: string): string {
  const parts = pathname.split('/').filter(Boolean);
  return parts[parts.length - 1] ?? '';
}

export function collapseSiblingPaths(paths: string[]): Map<string, string> {
  const groups = new Map<string, Set<string>>();
  for (const p of paths) {
    const dir = parentDir(p);
    if (dir === '/' || dir === '') continue;
    const seg = lastSegment(p);
    if (!seg || FILE_LIKE_RE.test(seg)) continue;
    if (!groups.has(dir)) groups.set(dir, new Set());
    groups.get(dir)!.add(seg);
  }
  const out = new Map<string, string>();
  for (const [dir, segs] of groups) {
    if (segs.size < 3) continue;
    for (const seg of segs) out.set(`${dir}/${seg}`, `${dir}/:id`);
  }
  return out;
}

export function classifyRegion(page: Pick<PageModel, 'url' | 'urlTemplate' | 'headings' | 'forms' | 'lists'>, startUrl: string): PageRegion {
  const path = safePath(page.url).toLowerCase();
  if (/\/(cart|basket|bag)(\/|$|\.)/.test(path)) return 'cart';
  if (/checkout|payment|place-order/.test(path)) return 'checkout';
  const isStart = stripTrailing(page.url) === stripTrailing(startUrl);
  if (isStart && (/^\/?$/.test(path) || FILE_LIKE_RE.test(lastSegment(path)) || path.endsWith('/'))) return 'home';
  const bigList = page.lists.some((l) => l.count >= 6);
  const hasSearch = page.forms.some((f) => f.purpose === 'search');
  if (bigList || hasSearch) return isStart ? 'home' : 'listing';
  const h1s = page.headings.length;
  if (page.urlTemplate.includes(':id') && h1s >= 1 && page.lists.length <= 1) return 'detail';
  if (page.forms.some((f) => f.fields.length >= 3) && page.lists.length === 0) return 'form';
  if (isStart) return 'home';
  return 'other';
}

function safePath(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

function stripTrailing(url: string): string {
  return url.replace(/[#?].*$/, '').replace(/\/+$/, '');
}

export interface AssembleInput {
  url: string;
  origin: string;
  siteTitle: string;
  spa: boolean;
  pages: PageModel[];
  endpoints: CapabilityModel['endpoints'];
  boundaries: CapabilityModel['boundaries'];
}

export function assembleModel(input: AssembleInput, maxTokens = 25_000): CapabilityModel {
  const model: CapabilityModel = {
    version: 1,
    url: input.url,
    origin: input.origin,
    siteTitle: input.siteTitle,
    spa: input.spa,
    crawledAt: new Date().toISOString(),
    pages: input.pages.slice(0, 6),
    endpoints: input.endpoints.slice(0, 12),
    boundaries: {
      auth: input.boundaries.auth.slice(0, 10),
      skipped: input.boundaries.skipped.slice(0, 10),
    },
    stats: {
      pagesVisited: input.pages.length,
      controls: input.pages.reduce((n, p) => n + p.controls.length, 0),
      forms: input.pages.reduce((n, p) => n + p.forms.length, 0),
      lists: input.pages.reduce((n, p) => n + p.lists.length, 0),
      endpoints: input.endpoints.length,
    },
  };
  return fitBudget(model, maxTokens);
}

export { estimateTokens };
