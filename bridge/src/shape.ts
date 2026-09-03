import type { ToolResult } from '../../lib/manifest';

const TRUNC = '…[truncated]';
const MAX_STR = 120;

function text(t: string, isError?: boolean): ToolResult {
  return isError ? { content: [{ type: 'text', text: t }], isError: true } : { content: [{ type: 'text', text: t }] };
}

function toJson(v: unknown): string {
  try {
    return JSON.stringify(v) ?? 'null';
  } catch {
    return String(v);
  }
}

function clone<T>(v: T): T {
  return JSON.parse(toJson(v)) as T;
}

function largestArray(root: unknown, minLen = 1): { parent: unknown; key: string | number | null; arr: unknown[] } | null {
  let best: { parent: unknown; key: string | number | null; arr: unknown[]; size: number } | null = null;
  const visit = (v: unknown, parent: unknown, key: string | number | null) => {
    if (Array.isArray(v)) {
      const size = toJson(v).length;
      if (v.length >= minLen && (!best || size > best.size)) best = { parent, key, arr: v, size };
      v.forEach((x, i) => visit(x, v, i));
    } else if (v && typeof v === 'object') {
      for (const k of Object.keys(v as Record<string, unknown>)) visit((v as Record<string, unknown>)[k], v, k);
    }
  };
  visit(root, null, null);
  return best;
}

function trimStrings(v: unknown): unknown {
  if (typeof v === 'string') return v.length > MAX_STR ? v.slice(0, MAX_STR - 1) + '…' : v;
  if (Array.isArray(v)) return v.map(trimStrings);
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>)) out[k] = trimStrings((v as Record<string, unknown>)[k]);
    return out;
  }
  return v;
}

export function shapeResult(value: unknown, budget: number): ToolResult {
  if (typeof value === 'string') return text(value.length > budget ? value.slice(0, Math.max(0, budget - TRUNC.length)) + TRUNC : value);
  if (value === undefined) value = null;
  let json = toJson(value);
  if (json.length <= budget) return text(json);

  let work: unknown = clone(value);

  for (let guard = 0; guard < 40; guard++) {
    json = toJson(work);
    if (json.length <= budget) return text(json);
    const hit = largestArray(work, 2);
    if (!hit) break;
    const total = hit.arr.length;
    const shortened = hit.arr.slice(0, Math.max(1, Math.floor(hit.arr.length / 2)));
    if (hit.parent === null) {
      work = { items: shortened, truncated: true, total };
    } else if (Array.isArray(hit.parent)) {
      (hit.parent as unknown[])[hit.key as number] = shortened;
    } else {
      const parent = hit.parent as Record<string, unknown>;
      parent[hit.key as string] = shortened;
      parent.truncated = true;
      parent.total = total;
    }
  }

  work = trimStrings(work);
  json = toJson(work);
  if (json.length <= budget) return text(json);

  if (work && typeof work === 'object' && !Array.isArray(work)) {
    const rec = work as Record<string, unknown>;
    const keys = Object.keys(rec)
      .filter((k) => k !== 'truncated' && k !== 'total')
      .sort((a, b) => toJson(rec[b]).length - toJson(rec[a]).length);
    for (const k of keys) {
      delete rec[k];
      rec.truncated = true;
      json = toJson(work);
      if (json.length <= budget) return text(json);
    }
  }

  return text(toJson({ truncated: true, note: 'result too large to return' }));
}

export const textResult = text;
