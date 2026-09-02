import type { Locator } from '../../lib/manifest';
import { RecipeError } from './errors';
import { isVisible, normText, pollUntil } from './dom';

export interface LocateOpts {
  timeoutMs?: number;
  signal?: AbortSignal;
  path: string;
  root?: ParentNode;
}

function queryAll(root: ParentNode, css: string): Element[] {
  try {
    return Array.from(root.querySelectorAll(css));
  } catch {
    return [];
  }
}

export function candidates(loc: Locator, root: ParentNode = document): Element[] {
  let scope: ParentNode = root;
  if (loc.within) {
    const w = locateSync(loc.within, root);
    if (!w) return [];
    scope = w;
  }
  let els = queryAll(scope, loc.css);
  if (loc.text !== undefined && loc.text !== '') {
    const needle = normText(loc.text).toLowerCase();
    els = els.filter((el) => {
      const t = normText(el.textContent).toLowerCase();
      return loc.exact ? t === needle : t.indexOf(needle) !== -1;
    });
  }
  if (els.length > 1) {
    const vis: Element[] = [];
    const hid: Element[] = [];
    for (const el of els) (isVisible(el) ? vis : hid).push(el);
    els = vis.concat(hid);
  }
  return els;
}

export function locateSync(loc: Locator, root: ParentNode = document): Element | null {
  const els = candidates(loc, root);
  const el = els[loc.nth ?? 0] ?? null;
  if (el) return el;
  if (loc.alternates) {
    for (const alt of loc.alternates) {
      const r = locateSync(alt, root);
      if (r) return r;
    }
  }
  return null;
}

export function describe(loc: Locator): string {
  let s = loc.css;
  if (loc.text) s += ` "${loc.text}"`;
  if (loc.within) s += ` within ${describe(loc.within)}`;
  return s;
}

export async function locate(loc: Locator, opts: LocateOpts): Promise<Element> {
  const root = opts.root ?? document;
  let found: Element | null = locateSync(loc, root);
  if (!found) {
    const ok = await pollUntil(
      () => {
        found = locateSync(loc, root);
        return !!found;
      },
      opts.timeoutMs ?? 2000,
      opts.signal,
    );
    if (!ok || !found) throw new RecipeError('TARGET_NOT_FOUND', `No element for ${describe(loc)} on ${opts.path}`);
  }
  return found;
}
