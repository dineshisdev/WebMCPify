import type { ToolDef } from '../../lib/manifest';
import { planTurn, rememberFromOutput, resolveInput, suggestion, type Plan, type PlanMemory } from './plan';

export interface Ui {
  setBusy(on: boolean, label?: string): void;
  setTools(tools: ToolDef[]): void;
  openPanel(tab?: 'tools' | 'chat'): void;
  ask(goal: string): Promise<void>;
  confirm(title: string, message: string, details: string[], timeoutMs: number, signal?: AbortSignal): Promise<boolean>;
  destroy(): void;
}

const CSS = `
.proxynote{position:fixed;left:0;right:0;bottom:0;background:#7c2d12;color:#fff;
  font:600 12px/1.5 ui-sans-serif,system-ui,-apple-system,sans-serif;text-align:center;
  padding:6px 12px;letter-spacing:.01em;pointer-events:none;}

:host { all: initial; }
* { box-sizing: border-box; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif; }
.wrap { position: fixed; z-index: 2147483647; inset: auto 16px 16px auto; pointer-events: none; color: #0f172a; }
.wrap.proxied { bottom: 44px; }
.wrap * { pointer-events: auto; }
.badge {
  display: inline-flex; align-items: center; gap: 8px;
  background: #0f172a; color: #f8fafc; border: 0; border-radius: 999px;
  padding: 8px 12px 8px 10px; font-size: 12.5px; font-weight: 650;
  box-shadow: 0 10px 30px -12px rgba(15,23,42,.7); cursor: pointer;
}
.badge:hover { background: #1e293b; }
.badge .dot { width: 8px; height: 8px; border-radius: 50%; background: #34d399; }
.badge.busy .dot { background: #818cf8; animation: pulse 1s ease-in-out infinite; }
@keyframes pulse { 50% { opacity: .35; transform: scale(.7); } }
.panel {
  display: none; position: absolute; right: 0; bottom: 46px; width: min(380px, calc(100vw - 32px));
  background: #fff; color: #0f172a; border-radius: 14px; overflow: hidden;
  box-shadow: 0 20px 50px -20px rgba(15,23,42,.55), 0 0 0 1px rgba(15,23,42,.08);
}
.panel.open { display: flex; flex-direction: column; max-height: min(520px, 70vh); }
.head { padding: 12px 14px 8px; border-bottom: 1px solid #e2e8f0; }
.head strong { display: block; font-size: 13px; }
.head span { font-size: 11px; color: #64748b; }
.tabs { display: flex; gap: 4px; padding: 8px 10px 0; }
.tabs button { flex: 1; border: 0; background: #f1f5f9; border-radius: 8px 8px 0 0; padding: 7px; font-size: 12px; font-weight: 650; cursor: pointer; color: #475569; }
.tabs button.on { background: #fff; color: #0f172a; box-shadow: 0 -1px 0 #fff; }
.list { max-height: 240px; overflow: auto; }
.row { display: grid; grid-template-columns: 1fr auto; gap: 8px; align-items: start; padding: 10px 14px; border-bottom: 1px solid #f1f5f9; }
.row code { font: 600 12px ui-monospace, Menlo, monospace; }
.row p { margin: 2px 0 0; font-size: 11.5px; color: #475569; line-height: 1.4; }
.row button, .go {
  background: #eef2ff; color: #3730a3; border: 0; border-radius: 8px;
  padding: 5px 8px; font-size: 11px; font-weight: 650; cursor: pointer;
}
.out { display: none; margin: 0; padding: 10px 14px; background: #0f172a; color: #e2e8f0;
  font: 11px/1.45 ui-monospace, Menlo, monospace; max-height: 120px; overflow: auto; white-space: pre-wrap; }
.out.show { display: block; }
.chat { display: none; flex-direction: column; min-height: 220px; }
.chat.on { display: flex; }
.msgs { flex: 1; overflow: auto; padding: 10px 12px; display: flex; flex-direction: column; gap: 8px; max-height: 240px; }
.bubble { font-size: 12.5px; line-height: 1.4; padding: 8px 10px; border-radius: 10px; max-width: 92%; }
.bubble.user { align-self: flex-end; background: #4f46e5; color: #fff; }
.bubble.bot { align-self: flex-start; background: #f1f5f9; color: #0f172a; }
.bubble pre { margin: 6px 0 0; font: 10.5px/1.4 ui-monospace, Menlo, monospace; white-space: pre-wrap; max-height: 90px; overflow: auto; }
.composer { display: flex; gap: 6px; padding: 8px; border-top: 1px solid #e2e8f0; }
.composer input { flex: 1; border: 1px solid #cbd5e1; border-radius: 8px; padding: 8px 10px; font-size: 13px; }
.scrim { display: none; position: fixed; inset: 0; background: rgba(15,23,42,.45); z-index: 2147483646; pointer-events: auto; }
.scrim.open { display: block; }
.modal {
  position: fixed; z-index: 2147483647; left: 50%; top: 50%; transform: translate(-50%,-50%);
  width: min(420px, calc(100vw - 32px)); background: #fff; border-radius: 16px; padding: 20px;
  box-shadow: 0 30px 80px -24px rgba(15,23,42,.7); pointer-events: auto; color: #0f172a;
}
.modal h2 { margin: 0 0 8px; font-size: 16px; }
.modal p { margin: 0 0 10px; font-size: 13.5px; color: #334155; line-height: 1.45; }
.modal ul { margin: 0 0 16px; padding-left: 18px; font-size: 12.5px; color: #475569; }
.actions { display: flex; gap: 8px; justify-content: flex-end; }
.actions button { border: 0; border-radius: 10px; padding: 8px 14px; font-size: 13px; font-weight: 650; cursor: pointer; }
.decline { background: #f1f5f9; color: #0f172a; }
.ok { background: #4f46e5; color: #fff; }
`;

export function mountUi(opts: {
  hidden: boolean;
  proxied?: boolean;
  apiBase: string;
  onCall: (name: string, input: Record<string, unknown>) => Promise<unknown>;
}): Ui {
  const host = document.createElement('webmcpify-ui');
  host.setAttribute('data-webmcpify', 'ui');
  host.style.cssText = 'all:initial;position:fixed;z-index:2147483647;';
  const shadow = host.attachShadow({ mode: 'closed' });
  shadow.innerHTML = `<style>${CSS}</style>
    <div class="scrim"></div>
    <div class="wrap">
      <div class="panel" role="dialog" aria-label="WebMCPify agent">
        <div class="head"><strong>Human + agent, same page</strong><span>Chat runs tools on this UI. Agents can also use document.modelContext.</span></div>
        <div class="tabs">
          <button type="button" class="on" data-tab="tools">Tools</button>
          <button type="button" data-tab="chat">Chat</button>
        </div>
        <div data-pane="tools">
          <div class="list"></div>
          <pre class="out"></pre>
        </div>
        <div class="chat" data-pane="chat">
          <div class="msgs"></div>
          <form class="composer">
            <input name="q" placeholder="what should the agent do?" autocomplete="off">
            <button class="go" type="submit">Go</button>
          </form>
        </div>
      </div>
      <button type="button" class="badge" aria-expanded="false"><span class="dot"></span><span class="label">Agent-ready</span></button>
      <div class="proxynote" hidden>Proxied by WebMCPify — not the original site</div>
    </div>`;
  const wrap = shadow.querySelector('.wrap') as HTMLElement;
  const badge = shadow.querySelector('.badge') as HTMLButtonElement;
  const labelEl = shadow.querySelector('.label') as HTMLElement;
  const panel = shadow.querySelector('.panel') as HTMLElement;
  const list = shadow.querySelector('.list') as HTMLElement;
  const out = shadow.querySelector('.out') as HTMLElement;
  const scrim = shadow.querySelector('.scrim') as HTMLElement;
  const msgs = shadow.querySelector('.msgs') as HTMLElement;
  const form = shadow.querySelector('.composer') as HTMLFormElement;
  const input = form.querySelector('input') as HTMLInputElement;

  if (opts.hidden) wrap.style.display = 'none';
  const attach = () => (document.documentElement || document.body)?.appendChild(host);
  if (document.documentElement || document.body) attach();
  else document.addEventListener('DOMContentLoaded', attach, { once: true });

  let tools: ToolDef[] = [];
  let busy = false;
  const memory: PlanMemory = { lastIds: [], lastQuery: '' };

  if (opts.proxied) {
    (shadow.querySelector('.proxynote') as HTMLElement).hidden = false;
    wrap.classList.add('proxied');
  }

  const setLabel = (n: number, extra?: string) => {
    labelEl.textContent = extra || (n ? `Agent-ready · ${n} tool${n === 1 ? '' : 's'}` : 'Agent-ready');
  };

  badge.addEventListener('click', () => {
    const open = !panel.classList.contains('open');
    panel.classList.toggle('open', open);
    badge.setAttribute('aria-expanded', String(open));
  });

  shadow.querySelectorAll('[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = (btn as HTMLElement).dataset.tab;
      shadow.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('on', (b as HTMLElement).dataset.tab === tab));
      (shadow.querySelector('[data-pane="tools"]') as HTMLElement).style.display = tab === 'tools' ? 'block' : 'none';
      (shadow.querySelector('[data-pane="chat"]') as HTMLElement).classList.toggle('on', tab === 'chat');
      if (tab === 'chat' && msgs.childElementCount === 0) {
        addBubble('bot', suggestion(tools));
      }
    });
  });

  function renderList() {
    list.innerHTML = tools
      .map(
        (t) => `<div class="row"><div><code>${escapeHtml(t.name)}</code><p>${escapeHtml(t.description.slice(0, 140))}${t.description.length > 140 ? '…' : ''}</p></div>
          <button type="button" data-run="${escapeHtml(t.name)}">Run</button></div>`,
      )
      .join('');
  }

  list.addEventListener('click', async (e) => {
    const btn = (e.target as HTMLElement).closest('[data-run]') as HTMLElement | null;
    if (!btn) return;
    const name = btn.getAttribute('data-run');
    if (!name) return;
    const t = tools.find((x) => x.name === name);
    if (!t) return;
    out.classList.add('show');
    out.textContent = `running ${name}…`;
    try {
      const result = await opts.onCall(name, (t.samples[0] ?? {}) as Record<string, unknown>);
      const text = resultText(result);
      out.textContent = text;
      rememberFromOutput(text, memory);
    } catch (err) {
      out.textContent = err instanceof Error ? err.message : String(err);
    }
  });

  function addBubble(who: 'user' | 'bot', text: string, dump?: string) {
    const el = document.createElement('div');
    el.className = `bubble ${who}`;
    el.textContent = text;
    if (dump) {
      const pre = document.createElement('pre');
      pre.textContent = dump.slice(0, 800);
      el.appendChild(pre);
    }
    msgs.appendChild(el);
    msgs.scrollTop = msgs.scrollHeight;
  }

  async function llmPlan(goal: string): Promise<Plan | null> {
    if (!opts.apiBase) return null;
    try {
      const res = await fetch(`${opts.apiBase}/api/agent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          goal,
          tools: tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
        }),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { tool?: string; input?: Record<string, unknown>; say?: string };
      if (data.say && !data.tool) return { say: data.say };
      if (data.tool) return { steps: [{ name: data.tool, input: data.input ?? {}, note: data.say || `Running ${data.tool}` }] };
    } catch {}
    return null;
  }

  async function runGoal(goal: string): Promise<void> {
    if (!goal || busy) return;
    addBubble('user', goal);
    const planned = (await llmPlan(goal)) ?? planTurn(goal, tools, memory);
    if ('say' in planned) {
      addBubble('bot', planned.say);
      return;
    }
    memory.lastQuery = goal;
    for (const step of planned.steps) {
      const args = resolveInput(step.input, memory);
      if (step.name === 'compare_products') {
        const ids = args.product_ids;
        if (!Array.isArray(ids) || ids.length < 2) {
          addBubble('bot', 'I need at least two products from search first.');
          break;
        }
      }
      if (step.name === 'add_to_cart' && !args.product_id) {
        addBubble('bot', 'Search first, or give a product id like sn-014.');
        break;
      }
      addBubble('bot', step.note);
      try {
        const result = await opts.onCall(step.name, args);
        const text = resultText(result);
        rememberFromOutput(text, memory);
        addBubble('bot', `✓ ${step.name}`, text);
      } catch (err) {
        addBubble('bot', err instanceof Error ? err.message : String(err));
        break;
      }
    }
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const goal = input.value.trim();
    input.value = '';
    void runGoal(goal);
  });

  return {
    setBusy(on, extra) {
      busy = on;
      badge.classList.toggle('busy', on);
      if (extra) setLabel(tools.length, extra);
      else if (!on) setLabel(tools.length);
    },
    setTools(next) {
      tools = next;
      if (!busy) setLabel(tools.length);
      renderList();
    },
    openPanel(tab) {
      panel.classList.add('open');
      badge.setAttribute('aria-expanded', 'true');
      if (tab) {
        shadow.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('on', (b as HTMLElement).dataset.tab === tab));
        (shadow.querySelector('[data-pane="tools"]') as HTMLElement).style.display = tab === 'tools' ? 'block' : 'none';
        (shadow.querySelector('[data-pane="chat"]') as HTMLElement).classList.toggle('on', tab === 'chat');
        if (tab === 'chat' && msgs.childElementCount === 0) {
          addBubble('bot', suggestion(tools));
        }
      }
    },
    ask(goal) {
      this.openPanel('chat');
      return runGoal(goal.trim());
    },
    confirm(title, message, details, timeoutMs, signal) {
      return new Promise((resolve) => {
        scrim.classList.add('open');
        scrim.innerHTML = `<div class="modal" role="alertdialog" aria-modal="true">
          <h2>${escapeHtml(title)}</h2>
          <p>${escapeHtml(message)}</p>
          ${details.length ? `<ul>${details.map((d) => `<li>${escapeHtml(d)}</li>`).join('')}</ul>` : ''}
          <div class="actions">
            <button type="button" class="decline">Decline</button>
            <button type="button" class="ok">Confirm</button>
          </div>
        </div>`;
        const done = (ok: boolean) => {
          clearTimeout(timer);
          signal?.removeEventListener('abort', onAbort);
          scrim.classList.remove('open');
          scrim.innerHTML = '';
          resolve(ok);
        };
        const onAbort = () => done(false);
        const timer = setTimeout(() => done(false), Math.max(1000, timeoutMs || 60_000));
        signal?.addEventListener('abort', onAbort, { once: true });
        scrim.querySelector('.ok')?.addEventListener('click', () => done(true));
        scrim.querySelector('.decline')?.addEventListener('click', () => done(false));
        scrim.addEventListener('click', (ev) => {
          if (ev.target === scrim) done(false);
        });
      });
    },
    destroy() {
      host.remove();
    },
  };
}

function resultText(r: unknown): string {
  if (r && typeof r === 'object' && 'content' in (r as { content?: { text: string }[] })) {
    return ((r as { content: { text: string }[] }).content ?? []).map((c) => c.text).join('\n');
  }
  try {
    return JSON.stringify(r, null, 2);
  } catch {
    return String(r);
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}
