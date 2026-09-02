export interface PageInfo {
  url: string;
  path: string;
  origin: string;
  title: string;
}

export interface TemplateCtx {
  input: Record<string, unknown>;
  vars: Record<string, unknown>;
  page: PageInfo;
}

const TEMPLATE_RE = /\{\{\s*([^{}]+?)\s*\}\}/g;
const SINGLE_RE = /^\{\{\s*([^{}]+?)\s*\}\}$/;

export function getPath(root: unknown, path: string): unknown {
  if (!path) return root;
  const parts = path
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .filter((p) => p !== '');
  let cur: unknown = root;
  for (const part of parts) {
    if (cur === null || cur === undefined) return undefined;
    if (part === 'length' && (typeof cur === 'string' || Array.isArray(cur))) {
      cur = cur.length;
      continue;
    }
    if (typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

function parseLiteral(raw: string): unknown {
  const s = raw.trim();
  if (s === '') return '';
  if ((s.startsWith("'") && s.endsWith("'")) || (s.startsWith('"') && s.endsWith('"'))) return s.slice(1, -1);
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

export function evalExpr(expr: string, ctx: TemplateCtx): unknown {
  const segments = expr.split('|').map((s) => s.trim());
  const path = segments.shift() ?? '';
  let value = getPath(ctx, path);
  for (const f of segments) {
    if (f.startsWith('default:')) {
      if (isEmpty(value)) value = parseLiteral(f.slice('default:'.length));
    } else if (f === 'json') {
      value = JSON.stringify(value ?? null);
    } else if (f === 'lower') {
      value = String(stringify(value)).toLowerCase();
    } else if (f === 'upper') {
      value = String(stringify(value)).toUpperCase();
    }
  }
  return value;
}

export function stringify(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return v.map((x) => (typeof x === 'object' && x !== null ? JSON.stringify(x) : stringify(x))).join(', ');
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

export function resolveString(s: string, ctx: TemplateCtx): unknown {
  if (s.indexOf('{{') === -1) return s;
  const single = SINGLE_RE.exec(s);
  if (single) return evalExpr(single[1], ctx);
  return s.replace(TEMPLATE_RE, (_m, expr: string) => stringify(evalExpr(expr, ctx)));
}

export function resolveDeep<T>(value: T, ctx: TemplateCtx, skipKeys?: ReadonlySet<string>): T {
  if (typeof value === 'string') return resolveString(value, ctx) as unknown as T;
  if (Array.isArray(value)) return value.map((v) => resolveDeep(v, ctx)) as unknown as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>)) {
      const v = (value as Record<string, unknown>)[k];
      out[k] = skipKeys && skipKeys.has(k) ? v : resolveDeep(v, ctx);
    }
    return out as T;
  }
  return value;
}

const RE_META = /[.*+?^${}()|[\]\\]/g;

export function resolveRegexString(s: string, ctx: TemplateCtx): string {
  if (s.indexOf('{{') === -1) return s;
  return s.replace(TEMPLATE_RE, (_m, expr: string) => stringify(evalExpr(expr, ctx)).replace(RE_META, '\\$&'));
}

export function isEmpty(v: unknown): boolean {
  return v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);
}

export function evalWhen(when: string, ctx: TemplateCtx): boolean {
  const v = when.indexOf('{{') !== -1 ? resolveString(when, ctx) : evalExpr(when, ctx);
  return !(isEmpty(v) || v === false);
}

export function evalRef(ref: string, ctx: TemplateCtx): unknown {
  return ref.indexOf('{{') !== -1 ? resolveString(ref, ctx) : evalExpr(ref, ctx);
}
