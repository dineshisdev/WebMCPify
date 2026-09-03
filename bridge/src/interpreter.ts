import type { BridgeMode, FieldSpec, Locator, SiteManifest, Step, ToolDef, ToolResult, Where } from '../../lib/manifest';
import { currentPath } from './config';
import {
  fireChange,
  fireInput,
  focusEl,
  isVisible,
  keyEvent,
  normText,
  pollUntil,
  pressKey,
  scrollCenter,
  setNativeChecked,
  setNativeValue,
  sleep,
  throwIfAborted,
  waitForDomIdle,
} from './dom';
import { RecipeError, isRecipeError, toRecipeError } from './errors';
import { describe, locate, locateSync } from './locate';
import { shapeResult, textResult } from './shape';
import { evalRef, evalWhen, getPath, isEmpty, resolveDeep, resolveRegexString, stringify, type PageInfo, type TemplateCtx } from './template';
import { validateInput } from './validate';

export interface RunCtx {
  mode: BridgeMode;
  prefix: string;
  dryRun: boolean;
  signal?: AbortSignal;
  settings: Partial<SiteManifest['settings']> | undefined;
  confirm(title: string, message: string, details: string[], signal?: AbortSignal): Promise<boolean>;
}

type Done = { done: true; result: ToolResult };
type StepOut = { value: unknown } | Done | undefined;

const SKIP_KEYS: ReadonlySet<string> = new Set(['op', 'as', 'when', 'urlPattern', 'pattern']);

const str = (v: unknown): string => stringify(v);

export function pageInfo(prefix: string): PageInfo {
  return { url: location.href, path: currentPath(prefix), origin: location.origin, title: document.title };
}

export async function runRecipe(tool: ToolDef, rawInput: unknown, ctx: RunCtx): Promise<ToolResult> {
  const input = validateInput(tool.inputSchema, rawInput);
  const vars: Record<string, unknown> = {};
  const budget = ctx.settings?.outputBudget || 1500;
  const steps = tool.recipe ?? [];
  const env = new StepEnv(ctx, input, vars, budget);

  for (let i = 0; i < steps.length; i++) {
    const raw = steps[i];
    throwIfAborted(ctx.signal);
    const tctx: TemplateCtx = { input, vars, page: pageInfo(ctx.prefix) };
    if (raw.when !== undefined && raw.when !== '' && !evalWhen(raw.when, tctx)) continue;
    const step = resolveDeep(raw, tctx, SKIP_KEYS);
    const as = (step as { as?: string }).as;
    try {
      const out = await env.run(step);
      if (out && 'done' in out) return out.result;
      if (as) vars[as] = out && 'value' in out ? out.value : undefined;
    } catch (e) {
      const err = toRecipeError(e);
      if (step.optional && (err.code === 'TARGET_NOT_FOUND' || err.code === 'TIMEOUT')) {
        if (as) vars[as] = null;
        continue;
      }
      if (err.step === undefined) {
        err.step = i + 1;
        err.op = step.op;
      }
      if (step.errorHint) err.hint = str(step.errorHint);
      throw err;
    }
  }
  return shapeResult({ ok: true }, budget);
}

class StepEnv {
  constructor(
    private ctx: RunCtx,
    private input: Record<string, unknown>,
    private vars: Record<string, unknown>,
    private budget: number,
  ) {}

  private get signal(): AbortSignal | undefined {
    return this.ctx.signal;
  }

  private path(): string {
    return currentPath(this.ctx.prefix);
  }

  private tctx(): TemplateCtx {
    return { input: this.input, vars: this.vars, page: pageInfo(this.ctx.prefix) };
  }

  private withPrefix(p: string): string {
    if (/^[a-z][a-z0-9+.-]*:/i.test(p)) return p;
    return this.ctx.prefix + (p.startsWith('/') ? p : '/' + p);
  }

  private loc(target: Locator, timeoutMs?: number): Promise<Element> {
    return locate(target, { timeoutMs: timeoutMs ?? 2000, signal: this.signal, path: this.path() });
  }

  private done(value: unknown): Done {
    return { done: true, result: shapeResult(value, this.budget) };
  }

  private pushPath(target: string, replace = false): void {
    history[replace ? 'replaceState' : 'pushState']({}, '', this.withPrefix(target));
    window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
  }

  private navigate(target: string): Done {
    const url = this.withPrefix(target);
    let resolved: URL;
    try {
      resolved = new URL(url, location.href);
    } catch {
      throw new RecipeError('VALIDATION', `Not a valid URL: ${url}`);
    }
    if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') {
      throw new RecipeError('VALIDATION', `Refusing to navigate to a ${resolved.protocol} URL`);
    }
    if (resolved.origin !== location.origin) {
      throw new RecipeError('VALIDATION', `Refusing to navigate off-origin to ${resolved.origin}`);
    }
    if (!this.ctx.dryRun) setTimeout(() => location.assign(resolved.href), 30);
    return this.done({ navigating_to: target, next: 'Call the matching get_* tool after the page loads' });
  }

  async run(s: Step): Promise<StepOut> {
    const dry = this.ctx.dryRun;
    switch (s.op) {
      case 'ensurePage': {
        const re = safeRegex(resolveRegexString(str(s.urlPattern), this.tctx()));
        if (!re) throw new RecipeError('VALIDATION', `Invalid urlPattern: ${str(s.urlPattern)}`);
        if (re.test(this.path())) return;
        const target = str(s.path);
        if (s.mode === 'navigate') return this.navigate(target);
        this.pushPath(target);
        const timeout = s.timeoutMs ?? 4000;
        try {
          if (s.waitFor) await this.loc(s.waitFor, timeout);
          else await waitForDomIdle(300, timeout, this.signal);
        } catch (e) {
          if (isRecipeError(e) && e.code === 'TARGET_NOT_FOUND') {
            throw new RecipeError('NAVIGATION_REQUIRED', `Could not open ${target} in-page: ${describe(s.waitFor as Locator)} did not appear`);
          }
          throw e;
        }
        return;
      }

      case 'navigate':
        return this.navigate(str(s.path));

      case 'fill': {
        const el = await this.loc(s.target, s.timeoutMs);
        if (dry) return;
        this.fillEl(el, str(s.value), s.target);
        return;
      }

      case 'type': {
        const el = await this.loc(s.target, s.timeoutMs);
        if (dry) return;
        focusEl(el);
        const value = str(s.value);
        setNativeValue(el, '');
        fireInput(el);
        let acc = '';
        for (const ch of value) {
          throwIfAborted(this.signal);
          const downOk = el.dispatchEvent(keyEvent('keydown', ch));
          const pressOk = el.dispatchEvent(keyEvent('keypress', ch));
          if (downOk && pressOk) {
            acc += ch;
            setNativeValue(el, acc);
            fireInput(el, ch);
          }
          el.dispatchEvent(keyEvent('keyup', ch));
        }
        fireChange(el);
        if (s.pressEnter) this.pressOn(el, 'Enter');
        return;
      }

      case 'press': {
        const el = s.target ? await this.loc(s.target, s.timeoutMs) : document.activeElement ?? document.body;
        if (dry) return;
        focusEl(el);
        this.pressOn(el, s.key);
        return;
      }

      case 'click': {
        const el = await this.loc(s.target, s.timeoutMs);
        if (dry) return;
        scrollCenter(el);
        focusEl(el);
        clickEl(el);
        return;
      }

      case 'select': {
        const el = await this.loc(s.target, s.timeoutMs);
        if (dry) return;
        if (el instanceof HTMLSelectElement) selectOption(el, str(s.value), s.target);
        else this.fillEl(el, str(s.value), s.target);
        return;
      }

      case 'check': {
        const el = await this.loc(s.target, s.timeoutMs);
        if (dry) return;
        const input = el as HTMLInputElement;
        const want = !!s.checked;
        if (input.checked !== want) {
          clickEl(el);
          if (input.checked !== want) {
            setNativeChecked(el, want);
            fireInput(el);
            fireChange(el);
          }
        }
        return;
      }

      case 'scrollIntoView': {
        scrollCenter(await this.loc(s.target, s.timeoutMs));
        return;
      }

      case 'waitFor': {
        const timeout = s.timeoutMs ?? 4000;
        const state = s.state;
        const check = (): boolean => {
          const el = locateSync(s.target);
          switch (state) {
            case 'attached':
              return !!el;
            case 'detached':
              return !el;
            case 'visible':
              return !!el && isVisible(el);
            default:
              return !el || !isVisible(el);
          }
        };
        const ok = await pollUntil(check, timeout, this.signal);
        if (!ok) throw new RecipeError('TIMEOUT', `Timed out after ${timeout} ms waiting for ${describe(s.target)} to be ${state}`);
        return;
      }

      case 'waitForDomIdle':
        await waitForDomIdle(s.quietMs ?? 300, s.timeoutMs ?? 4000, this.signal);
        return;

      case 'waitForUrl': {
        const re = safeRegex(resolveRegexString(str(s.pattern), this.tctx()));
        if (!re) throw new RecipeError('VALIDATION', `Invalid pattern: ${str(s.pattern)}`);
        const timeout = s.timeoutMs ?? 4000;
        const ok = await pollUntil(() => re.test(this.path()), timeout, this.signal);
        if (!ok) throw new RecipeError('TIMEOUT', `Timed out after ${timeout} ms waiting for the URL to match ${s.pattern} (now ${this.path()})`);
        return;
      }

      case 'wait':
        await sleep(Math.min(Math.max(0, Number(s.ms) || 0), 3000), this.signal);
        return;

      case 'assert': {
        if (s.state === 'exists') {
          let el = locateSync(s.target);
          if (!el) {
            await pollUntil(() => !!(el = locateSync(s.target)), s.timeoutMs ?? 1000, this.signal);
          }
          if (!el) throw new RecipeError('PRECONDITION', str(s.message));
        } else {
          const el = locateSync(s.target);
          if (el && isVisible(el)) throw new RecipeError('PRECONDITION', str(s.message));
        }
        return;
      }

      case 'extractText': {
        const el = await this.loc(s.target, s.timeoutMs);
        return { value: readField(el, { attr: s.attr, regex: s.regex, type: s.type }) };
      }

      case 'extractFields': {
        const root: Element | Document = s.root ? await this.loc(s.root, s.timeoutMs) : document;
        return { value: readFields(root, s.fields ?? {}) };
      }

      case 'extractList': {
        const root: Element | Document = s.root ? await this.loc(s.root, s.timeoutMs) : document;
        let items: Element[];
        try {
          items = Array.from(root.querySelectorAll(str(s.item)));
        } catch {
          items = [];
        }
        const limit = s.limit && s.limit > 0 ? s.limit : 20;
        return { value: items.slice(0, limit).map((it) => readFields(it, s.fields ?? {})) };
      }

      case 'fetchJson': {
        const url = str(s.url);
        let abs: URL;
        try {
          abs = new URL(url, location.href);
        } catch {
          throw new RecipeError('NETWORK', `Invalid URL ${url}`);
        }
        if (abs.origin !== location.origin) throw new RecipeError('NETWORK', `Cross-origin request blocked: ${abs.origin}`);
        const method = s.method === 'POST' ? 'POST' : 'GET';
        const init: RequestInit = { method, credentials: 'same-origin', signal: this.signal, headers: { accept: 'application/json' } };
        if (method === 'POST') {
          init.headers = { accept: 'application/json', 'content-type': 'application/json' };
          init.body = JSON.stringify(s.body ?? {});
        }
        let res: Response;
        try {
          res = await fetch(abs.href, init);
        } catch (e) {
          if (e instanceof Error && e.name === 'AbortError') throw e;
          throw new RecipeError('NETWORK', `${method} ${url} failed: ${e instanceof Error ? e.message : String(e)}`);
        }
        if (!res.ok) throw new RecipeError('NETWORK', `${method} ${url} returned HTTP ${res.status}`);
        let data: unknown;
        try {
          data = await res.json();
        } catch {
          throw new RecipeError('NETWORK', `${method} ${url} did not return JSON`);
        }
        return { value: s.pick ? getPath(data, str(s.pick)) : data };
      }

      case 'readStorage': {
        let raw: string | null = null;
        try {
          raw = localStorage.getItem(str(s.key));
        } catch {
          raw = null;
        }
        if (raw === null) return { value: null };
        if (s.parse === 'json') {
          try {
            return { value: JSON.parse(raw) as unknown };
          } catch {
            return { value: null };
          }
        }
        return { value: raw };
      }

      case 'filterList': {
        const src: unknown = typeof s.from === 'string' ? evalRef(s.from, this.tctx()) : s.from;
        let list: unknown[] = Array.isArray(src) ? src.slice() : src && typeof src === 'object' ? Object.values(src as Record<string, unknown>) : [];
        for (const w of s.where ?? []) list = applyWhere(list, w);
        if (s.sortBy) {
          const key = str(s.sortBy);
          const dir = s.order === 'desc' ? -1 : 1;
          list.sort((a, b) => compare(getPath(a, key), getPath(b, key)) * dir);
        }
        if (s.limit && s.limit > 0) list = list.slice(0, s.limit);
        if (s.pick && s.pick.length) {
          const keys = s.pick.map(str);
          list = list.map((item) => {
            const out: Record<string, unknown> = {};
            for (const k of keys) out[k] = getPath(item, k);
            return out;
          });
        }
        return { value: list };
      }

      case 'setUrlState': {
        const [curPath, curQs] = this.path().split('?');
        let basePath = curPath;
        let params = new URLSearchParams(curQs ?? '');
        if (s.path !== undefined) {
          const [p, q] = str(s.path).split('?');
          basePath = p || '/';
          params = new URLSearchParams(q ?? '');
        }
        if (s.params) {
          for (const k of Object.keys(s.params)) {
            const v = str((s.params as Record<string, unknown>)[k]);
            if (v === '') params.delete(k);
            else params.set(k, v);
          }
        }
        const qs = params.toString();
        this.pushPath(basePath + (qs ? '?' + qs : ''), !!s.replace);
        return;
      }

      case 'confirm': {
        if (dry) return this.done({ dryRun: true, stoppedAt: 'confirm', message: 'locators resolved' });
        const details = Array.isArray(s.details) ? s.details.map(str).filter((d) => d !== '') : [];
        const title = str(s.title) || 'Confirm action';
        const ok = await this.ctx.confirm(title, str(s.message), details, this.signal);
        if (!ok) throw new RecipeError('DECLINED', `The user declined "${title}"`);
        return;
      }

      case 'fail':
        throw new RecipeError('PRECONDITION', str(s.message) || 'Precondition failed');

      case 'return': {
        if (s.ifEmpty) {
          const name = str(s.ifEmpty.var).replace(/^vars\./, '');
          if (isEmpty(getPath(this.vars, name))) return { done: true, result: textResult(str(s.ifEmpty.message)) };
        }
        return this.done(s.value);
      }

      default:
        throw new RecipeError('INTERNAL', `Unknown op "${(s as { op: string }).op}"`);
    }
  }

  private fillEl(el: Element, value: string, target: Locator): void {
    if (el instanceof HTMLSelectElement) {
      selectOption(el, value, target);
      return;
    }
    focusEl(el);
    if ((el as HTMLElement).isContentEditable) {
      el.textContent = value;
      fireInput(el, value);
      return;
    }
    setNativeValue(el, value);
    fireInput(el, value);
    fireChange(el);
  }

  private pressOn(el: Element, key: string): void {
    const prevented = pressKey(el, key);
    if (key !== 'Enter' || prevented) return;
    const tag = el.tagName;
    if (tag === 'BUTTON' || tag === 'A') {
      clickEl(el);
      return;
    }
    const form = (el as HTMLInputElement).form;
    if (form && (tag === 'INPUT' || tag === 'SELECT')) {
      if (typeof form.requestSubmit === 'function') form.requestSubmit();
      else if (form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))) form.submit();
    }
  }
}

function clickEl(el: Element): void {
  if (typeof (el as HTMLElement).click === 'function') (el as HTMLElement).click();
  else el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true }));
}

function selectOption(el: HTMLSelectElement, value: string, target: Locator): void {
  const opts = Array.from(el.options);
  const want = value.trim();
  const lower = want.toLowerCase();
  const opt =
    opts.find((o) => o.value === want) ??
    opts.find((o) => o.value.toLowerCase() === lower) ??
    opts.find((o) => normText(o.textContent).toLowerCase() === lower);
  if (!opt) {
    const avail = opts
      .filter((o) => !o.disabled)
      .slice(0, 30)
      .map((o) => {
        const label = normText(o.textContent);
        return label && label.toLowerCase() !== o.value.toLowerCase() && o.value !== '' ? `${o.value} (${label})` : o.value || label;
      })
      .join(', ');
    throw new RecipeError('VALIDATION', `No option "${value}" in ${describe(target)}. Available: ${avail || 'none'}`);
  }
  if (opt.disabled) throw new RecipeError('PRECONDITION', `Option "${value}" is not available (disabled) in ${describe(target)}`);
  focusEl(el);
  setNativeValue(el, opt.value);
  if (el.value !== opt.value) opt.selected = true;
  fireInput(el);
  fireChange(el);
}

function safeRegex(src: string): RegExp | null {
  try {
    return new RegExp(src);
  } catch {
    return null;
  }
}

export function parseNumber(raw: string): number | null {
  const m = /-?\d+(?:\.\d+)?/.exec(raw.replace(/[,\s]/g, ''));
  if (!m) return null;
  const n = parseFloat(m[0]);
  return isNaN(n) ? null : n;
}

export function readField(el: Element, spec: FieldSpec): unknown {
  const attr = spec.attr ?? 'text';
  let raw: string | null;
  switch (attr) {
    case 'text':
      raw = normText(el.textContent);
      break;
    case 'html':
      raw = el.innerHTML;
      break;
    case 'value': {
      const v = (el as HTMLInputElement).value;
      raw = typeof v === 'string' ? v : el.getAttribute('value');
      break;
    }
    case 'href':
    case 'src': {
      const v = (el as unknown as Record<string, unknown>)[attr];
      raw = typeof v === 'string' && v !== '' ? v : el.getAttribute(attr);
      break;
    }
    default:
      raw = el.getAttribute(attr);
  }
  if (raw === null || raw === undefined) return spec.type === 'boolean' ? false : null;
  if (spec.regex) {
    const re = safeRegex(spec.regex);
    const m = re ? re.exec(raw) : null;
    if (!m) return spec.type === 'boolean' ? false : null;
    raw = m[1] !== undefined ? m[1] : m[0];
  }
  switch (spec.type) {
    case 'number':
      return parseNumber(raw);
    case 'boolean': {
      const t = raw.trim();
      return t !== '' && !/^(false|0|no|off|null)$/i.test(t);
    }
    default:
      return attr === 'text' ? raw : raw.trim();
  }
}

export function readFields(root: Element | Document, fields: Record<string, FieldSpec>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(fields)) {
    const spec = fields[k] ?? {};
    let el: Element | null = null;
    if (spec.css) {
      try {
        el = root.querySelector(spec.css);
      } catch {
        el = null;
      }
    } else {
      el = root instanceof Document ? root.documentElement : root;
    }
    out[k] = el ? readField(el, spec) : spec.type === 'boolean' ? false : null;
  }
  return out;
}

function isNumLike(v: unknown): boolean {
  return typeof v === 'number' || (typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v)));
}

function eq(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (isNumLike(a) && isNumLike(b)) return Number(a) === Number(b);
  if (typeof a === 'boolean' || typeof b === 'boolean') return String(a) === String(b).toLowerCase();
  return stringify(a).toLowerCase() === stringify(b).toLowerCase();
}

function compare(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return 1;
  if (b === null || b === undefined) return -1;
  if (isNumLike(a) && isNumLike(b)) return Number(a) - Number(b);
  return stringify(a).localeCompare(stringify(b), undefined, { sensitivity: 'base', numeric: true });
}

function toList(v: unknown): unknown[] {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') return v.split(',').map((x) => x.trim()).filter((x) => x !== '');
  return [v];
}

function applyWhere(list: unknown[], w: Where): unknown[] {
  const value = w.value;
  if (isEmpty(value)) return list;
  const field = str(w.field);
  return list.filter((item) => {
    const a = getPath(item, field);
    switch (w.op) {
      case 'eq':
        return Array.isArray(a) ? a.some((x) => eq(x, value)) : eq(a, value);
      case 'neq':
        return Array.isArray(a) ? !a.some((x) => eq(x, value)) : !eq(a, value);
      case 'lt':
        return isNumLike(a) && isNumLike(value) ? Number(a) < Number(value) : compare(a, value) < 0;
      case 'lte':
        return isNumLike(a) && isNumLike(value) ? Number(a) <= Number(value) : compare(a, value) <= 0;
      case 'gt':
        return isNumLike(a) && isNumLike(value) ? Number(a) > Number(value) : compare(a, value) > 0;
      case 'gte':
        return isNumLike(a) && isNumLike(value) ? Number(a) >= Number(value) : compare(a, value) >= 0;
      case 'contains':
        if (Array.isArray(a)) return a.some((x) => eq(x, value));
        return stringify(a).toLowerCase().indexOf(stringify(value).toLowerCase()) !== -1;
      case 'in': {
        const set = toList(value);
        return Array.isArray(a) ? a.some((x) => set.some((y) => eq(x, y))) : set.some((y) => eq(a, y));
      }
      default:
        return true;
    }
  });
}
