import type { CapabilityModel } from '../capability';
import {
  EXTRACT_OPS,
  LIMITS,
  SENSITIVE_TEXT_RE,
  TOOL_NAME_RE,
  type FieldSpec,
  type JsonSchemaObject,
  type JsonSchemaProperty,
  type Locator,
  type Risk,
  type Step,
  type ToolDef,
} from '../manifest';
import type { GeneratedStep, GeneratedTool } from './schema';

export interface PostprocessResult {
  tool: ToolDef;
  warnings: string[];
  unknownLocators: string[];
}

function clean<T extends object>(o: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) if (v !== null && v !== undefined) out[k] = v;
  return out as T;
}

function loc(l: { css: string; text?: string | null; nth?: number | null } | null | undefined): Locator | null {
  if (!l?.css) return null;
  return clean({ css: l.css, text: l.text ?? undefined, nth: l.nth ?? undefined });
}

function fields(arr: { name: string; css?: string | null; attr?: string | null; regex?: string | null; type?: string | null }[]): Record<string, FieldSpec> {
  const out: Record<string, FieldSpec> = {};
  for (const f of arr) out[f.name] = clean({ css: f.css ?? undefined, attr: f.attr ?? undefined, regex: f.regex ?? undefined, type: (f.type ?? undefined) as FieldSpec['type'] });
  return out;
}

function parseJson(s: string | null | undefined, fallback: unknown): unknown {
  if (!s) return fallback;
  try {
    return JSON.parse(s);
  } catch {
    return fallback;
  }
}

function drop(op: string, reason: string, warnings: string[]): null {
  warnings.push(`${op} dropped: ${reason}`);
  return null;
}

function toStep(g: GeneratedStep, warnings: string[]): Step | null {
  const base = clean({ when: g.when ?? undefined, optional: g.optional ?? undefined, errorHint: g.errorHint ?? undefined });
  switch (g.op) {
    case 'ensurePage':
      if (!g.urlPattern || !g.path) return drop(g.op, 'urlPattern and path required', warnings);
      return { ...base, op: 'ensurePage', urlPattern: g.urlPattern, path: g.path, ...(g.waitForCss ? { waitFor: { css: g.waitForCss } } : {}) };
    case 'navigate':
      if (!g.path) return drop(g.op, 'path required', warnings);
      return { ...base, op: 'navigate', path: g.path };
    case 'fill': {
      const target = loc(g.target);
      if (!target || g.value == null) return drop(g.op, 'target.css and value required', warnings);
      return { ...base, op: 'fill', target, value: g.value };
    }
    case 'type': {
      const target = loc(g.target);
      if (!target || g.value == null) return drop(g.op, 'target.css and value required', warnings);
      return { ...base, op: 'type', target, value: g.value, ...(g.pressEnter ? { pressEnter: true } : {}) };
    }
    case 'press':
      if (!g.key) return drop(g.op, 'key required', warnings);
      return { ...base, op: 'press', key: g.key, ...(loc(g.target) ? { target: loc(g.target)! } : {}) };
    case 'click': {
      const target = loc(g.target);
      if (!target) return drop(g.op, 'target.css required', warnings);
      return { ...base, op: 'click', target };
    }
    case 'select': {
      const target = loc(g.target);
      if (!target || g.value == null) return drop(g.op, 'target.css and value required', warnings);
      return { ...base, op: 'select', target, value: g.value };
    }
    case 'check': {
      const target = loc(g.target);
      if (!target || g.checked == null) return drop(g.op, 'target.css and checked required', warnings);
      return { ...base, op: 'check', target, checked: g.checked };
    }
    case 'waitFor': {
      const target = loc(g.target);
      if (!target || !g.state || g.state === 'exists' || g.state === 'notExists') {
        return drop(g.op, 'target.css and state visible|hidden|attached|detached required', warnings);
      }
      return { ...base, op: 'waitFor', target, state: g.state, ...(g.timeoutMs ? { timeoutMs: g.timeoutMs } : {}) };
    }
    case 'waitForDomIdle':
      return { ...base, op: 'waitForDomIdle' };
    case 'waitForUrl':
      if (!g.pattern) return drop(g.op, 'pattern required', warnings);
      return { ...base, op: 'waitForUrl', pattern: g.pattern };
    case 'assert': {
      const target = loc(g.target);
      if (!target || (g.state !== 'exists' && g.state !== 'notExists') || !g.message) {
        return drop(g.op, 'target.css, state exists|notExists, and message required', warnings);
      }
      return { ...base, op: 'assert', target, state: g.state, message: g.message };
    }
    case 'extractText': {
      const target = loc(g.target);
      if (!target || !g.as) return drop(g.op, 'target.css and as required', warnings);
      return { ...base, op: 'extractText', target, as: g.as, ...clean({ attr: g.attr ?? undefined, regex: g.regex ?? undefined, type: g.type === 'boolean' ? undefined : (g.type ?? undefined) }) };
    }
    case 'extractFields':
      if (!g.as || !g.fields?.length) return drop(g.op, 'fields[] and as required', warnings);
      return { ...base, op: 'extractFields', ...(g.rootCss ? { root: { css: g.rootCss } } : {}), fields: fields(g.fields), as: g.as };
    case 'extractList':
      if (!g.as || !g.item || !g.fields?.length) return drop(g.op, 'item, fields[] and as required', warnings);
      return { ...base, op: 'extractList', ...(g.rootCss ? { root: { css: g.rootCss } } : {}), item: g.item, fields: fields(g.fields), as: g.as, limit: Math.min(g.limit ?? 12, 20) };
    case 'fetchJson':
      if (!g.url || !g.as) return drop(g.op, 'url and as required', warnings);
      return { ...base, op: 'fetchJson', url: g.url, as: g.as, ...clean({ method: g.method ?? undefined, body: g.bodyJson ? parseJson(g.bodyJson, undefined) : undefined, pick: g.pick ?? undefined }) };
    case 'readStorage':
      if (!g.storageKey || !g.as) return drop(g.op, 'storageKey and as required', warnings);
      return { ...base, op: 'readStorage', key: g.storageKey, as: g.as, ...(g.parseJson ? { parse: 'json' as const } : {}) };
    case 'filterList':
      if (!g.from || !g.as) return drop(g.op, 'from and as required', warnings);
      return {
        ...base,
        op: 'filterList',
        from: g.from,
        as: g.as,
        ...clean({
          where: g.where ? g.where.map((w) => ({ field: w.field, op: w.op, value: w.value })) : undefined,
          sortBy: g.sortBy ?? undefined,
          order: g.order ?? undefined,
          limit: g.limit ?? undefined,
          pick: g.pickFields ?? undefined,
        }),
      };
    case 'setUrlState':
      return { ...base, op: 'setUrlState', ...clean({ path: g.path ?? undefined, params: g.paramsJson ? (parseJson(g.paramsJson, undefined) as Record<string, string> | undefined) : undefined }) };
    case 'confirm':
      if (!g.title || !g.message) return drop(g.op, 'title and message required', warnings);
      return { ...base, op: 'confirm', title: g.title, message: g.message, ...(g.details ? { details: g.details } : {}) };
    case 'return': {
      let value = parseJson(g.valueJson, undefined);
      if (value === undefined) {
        warnings.push(`return.valueJson was not valid JSON; wrapped as text`);
        value = { result: g.valueJson };
      }
      return { ...base, op: 'return', value, ...(g.ifEmptyVar && g.ifEmptyMessage ? { ifEmpty: { var: g.ifEmptyVar, message: g.ifEmptyMessage } } : {}) };
    }
  }
}

function toInputSchema(params: GeneratedTool['params']): JsonSchemaObject {
  const properties: Record<string, JsonSchemaProperty> = {};
  const required: string[] = [];
  for (const p of params) {
    const name = p.name.replace(/[^a-z0-9_]/gi, '_').slice(0, LIMITS.paramName);
    properties[name] = clean({
      type: p.type,
      description: p.description.slice(0, LIMITS.paramDescription),
      enum: p.enumValues && p.enumValues.length ? p.enumValues : undefined,
      items: p.type === 'array' ? { type: p.itemsType ?? 'string' } : undefined,
      minimum: p.minimum ?? undefined,
      maximum: p.maximum ?? undefined,
    });
    if (p.required) required.push(name);
  }
  return { type: 'object', properties, ...(required.length ? { required } : {}) };
}

export function sanitizeToolName(name: string): string {
  const s = name.toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').replace(/^[0-9]+/, '');
  const out = (s || 'tool').slice(0, LIMITS.toolName);
  return TOOL_NAME_RE.test(out) ? out : 'tool_' + out.replace(/^[^a-z]+/, '').slice(0, LIMITS.toolName - 5);
}

function trimAtSentence(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const idx = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('; '));
  return (idx > max * 0.5 ? cut.slice(0, idx + 1) : cut.trimEnd()).trim();
}

function selectorsIn(step: Step): string[] {
  const out: string[] = [];
  const s = step as unknown as Record<string, unknown>;
  const l = s.target as Locator | undefined;
  if (l?.css) out.push(l.css);
  const r = s.root as Locator | undefined;
  if (r?.css) out.push(r.css);
  const w = s.waitFor as Locator | undefined;
  if (w?.css) out.push(w.css);
  if (typeof s.item === 'string') out.push(s.item);
  return out;
}

const MUTATING_OPS = new Set(['click', 'fill', 'type', 'press', 'select', 'check', 'setUrlState']);

function isCommitting(st: Step): boolean {
  if (st.op === 'click') return true;
  if (st.op === 'press' && st.key === 'Enter') return true;
  if (st.op === 'type' && st.pressEnter) return true;
  if (st.op === 'fetchJson' && st.method === 'POST') return true;
  return false;
}

function mutates(steps: Step[]): boolean {
  return steps.some((st) => MUTATING_OPS.has(st.op) || (st.op === 'fetchJson' && st.method === 'POST'));
}

/**
 * Attribute selectors are stripped before the keyword test: `button[type="submit"]`
 * would otherwise match \bsubmit\b and force every ordinary search form to sensitive.
 */
function selectorWords(css: string): string {
  return css.replace(/\[[^\]]*\]/g, ' ').replace(/[-_#.]/g, ' ');
}

function stepsAreSensitive(steps: Step[], model: CapabilityModel | null): boolean {
  const sensitiveCss = new Set<string>();
  if (model) for (const p of model.pages) for (const c of p.controls) if (c.riskHint === 'sensitive') sensitiveCss.add(c.locator.css);
  for (const st of steps) {
    if (!isCommitting(st)) continue;
    if (st.op === 'fetchJson') {
      if (SENSITIVE_TEXT_RE.test(st.url)) return true;
      continue;
    }
    const target = 'target' in st ? st.target : undefined;
    if (!target) continue;
    if (sensitiveCss.has(target.css)) return true;
    if (target.text && SENSITIVE_TEXT_RE.test(target.text)) return true;
    if (SENSITIVE_TEXT_RE.test(selectorWords(target.css))) return true;
  }
  return false;
}

/** Trim to the step budget while preserving the final `return` step. */
function capRecipe(steps: Step[]): Step[] {
  if (steps.length <= LIMITS.maxSteps) return steps;
  const last = steps[steps.length - 1]!;
  if (last.op === 'return') return [...steps.slice(0, LIMITS.maxSteps - 1), last];
  return steps.slice(0, LIMITS.maxSteps);
}

export function postprocessTool(g: GeneratedTool, model: CapabilityModel | null, source: ToolDef['source'] = 'generated'): PostprocessResult {
  const warnings: string[] = [];
  const steps = g.recipe.map((s) => toStep(s, warnings)).filter((s): s is Step => s !== null);
  if (!steps.length) {
    warnings.push('recipe was empty after dropping incomplete steps');
    steps.push({ op: 'return', value: { ok: false, error: 'empty recipe' } });
  }

  let risk: Risk = g.risk;
  if (risk !== 'sensitive' && stepsAreSensitive(steps, model)) {
    warnings.push('risk raised to sensitive (commits a sensitive action)');
    risk = 'sensitive';
  }
  // readOnlyHint tells the agent it may call the tool without asking, so a recipe
  // that mutates anything can never stay `read`.
  if (risk === 'read' && mutates(steps)) {
    warnings.push('risk raised to reversible (recipe mutates the page)');
    risk = 'reversible';
  }
  if (risk === 'sensitive' && !steps.some((s) => s.op === 'confirm')) {
    let commitAt = -1;
    for (let i = steps.length - 1; i >= 0; i--) {
      if (isCommitting(steps[i]!)) {
        commitAt = i;
        break;
      }
    }
    if (commitAt === -1) commitAt = steps.findIndex((s) => MUTATING_OPS.has(s.op));
    const confirm: Step = { op: 'confirm', title: 'Confirm this action?', message: `An agent wants to run ${sanitizeToolName(g.name)} with {{input | json}}.` };
    steps.splice(commitAt >= 0 ? commitAt : 0, 0, confirm);
    warnings.push('inserted confirm step before the committing action');
  }
  if (steps.some((s) => s.op === 'navigate')) {
    const idx = steps.findIndex((s) => s.op === 'navigate');
    if (idx !== steps.length - 1) {
      steps.splice(idx + 1);
      warnings.push('steps after navigate were dropped (navigate must be last)');
    }
  }

  const unknownLocators: string[] = [];
  if (model) {
    const modelJson = JSON.stringify(model);
    for (const st of steps) for (const css of selectorsIn(st)) {
      const probe = css.split(',')[0].trim();
      if (!modelJson.includes(JSON.stringify(probe).slice(1, -1))) unknownLocators.push(css);
    }
  }

  const samples = g.samplesJson.map((s) => parseJson(s, {})).filter((s) => s && typeof s === 'object') as Record<string, unknown>[];

  const tool: ToolDef = {
    name: sanitizeToolName(g.name),
    description: trimAtSentence(g.description.trim(), LIMITS.toolDescription),
    inputSchema: toInputSchema(g.params),
    annotations: { readOnlyHint: risk === 'read', untrustedContentHint: steps.some((s) => EXTRACT_OPS.has(s.op)) },
    risk,
    ...(g.scopeUrlPattern ? { scope: { urlPattern: g.scopeUrlPattern } } : {}),
    recipe: capRecipe(steps),
    samples: samples.length ? samples : [{}],
    verification: { status: 'unverified' },
    enabled: true,
    source,
    rationale: g.rationale?.slice(0, 200),
  };
  return { tool, warnings, unknownLocators };
}

export function finalizeTools(tools: ToolDef[]): ToolDef[] {
  const seen = new Set<string>();
  const out: ToolDef[] = [];
  for (const t of tools) {
    let name = t.name;
    let i = 2;
    while (seen.has(name)) name = `${t.name.slice(0, LIMITS.toolName - 2)}_${i++}`;
    seen.add(name);
    out.push({ ...t, name });
  }
  const rank: Record<Risk, number> = { read: 0, reversible: 1, sensitive: 2 };
  return out.sort((a, b) => rank[a.risk] - rank[b.risk]).slice(0, LIMITS.maxTools);
}
