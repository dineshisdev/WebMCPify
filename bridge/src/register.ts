import type { BridgeConfig, SiteManifest, ToolDef, ToolResult } from '../../lib/manifest';
import { formatError, isRecipeError, RecipeError, toRecipeError } from './errors';
import { runRecipe, type RunCtx } from './interpreter';
import { currentPath } from './config';
import { textResult } from './shape';
import type { Ui } from './ui';

interface ModelContext {
  registerTool(
    tool: {
      name: string;
      description: string;
      inputSchema: unknown;
      annotations?: { readOnlyHint?: boolean; untrustedContentHint?: boolean };
      execute: (input: unknown, extras: { signal?: AbortSignal }) => Promise<ToolResult> | ToolResult;
    },
    opts?: { signal?: AbortSignal },
  ): void;
}

declare global {
  interface Document {
    modelContext?: ModelContext;
  }
  interface Navigator {
    modelContext?: ModelContext;
  }
}

function getModelContext(): ModelContext | null {
  const mc = document.modelContext ?? navigator.modelContext;
  return mc && typeof mc.registerTool === 'function' ? mc : null;
}

export function hasWebMCP(): boolean {
  return !!getModelContext();
}

export interface BridgeApi {
  call(name: string, input?: unknown, signal?: AbortSignal): Promise<ToolResult>;
  tools(): { name: string; description: string; risk: string; enabled: boolean }[];
  manifest: SiteManifest;
  version: string;
  onNav: () => void;
  openPanel: (tab?: 'tools' | 'chat') => void;
  ask: (goal: string) => Promise<void>;
}

let lock: Promise<unknown> | null = null;
let registered: AbortController | null = null;
let lastKey = '';

export function createRuntime(cfg: BridgeConfig, manifest: SiteManifest, ui: Ui | null): BridgeApi {
  const ctxBase = (tool: ToolDef, signal?: AbortSignal): RunCtx => ({
    mode: cfg.mode,
    prefix: cfg.prefix,
    dryRun: !!cfg.dryRun || (cfg.mode === 'verify' && tool.risk === 'sensitive'),
    signal,
    settings: manifest.settings,
    confirm: async (title, message, details, sig) => {
      if (cfg.mode === 'verify') return false;
      if (!ui) return false;
      return ui.confirm(title, message, details, manifest.settings.confirmTimeoutMs || 60_000, sig);
    },
  });

  async function runTool(tool: ToolDef, input: unknown, signal?: AbortSignal): Promise<ToolResult> {
    if (lock) throw new RecipeError('BUSY', 'Another tool is already running');
    const work = (async () => {
      ui?.setBusy(true, `Running ${tool.name}…`);
      try {
        return await runRecipe(tool, input, ctxBase(tool, signal));
      } catch (e) {
        const err = toRecipeError(e);
        return textResult(formatError(err, currentPath(cfg.prefix)), true);
      } finally {
        ui?.setBusy(false);
      }
    })();
    lock = work;
    try {
      return (await work) as ToolResult;
    } finally {
      lock = null;
    }
  }

  const api: BridgeApi = {
    async call(name, input, signal) {
      const tool = manifest.tools.find((t) => t.name === name && t.enabled);
      if (!tool) throw new RecipeError('VALIDATION', `Unknown or disabled tool "${name}"`);
      return runTool(tool, input ?? {}, signal);
    },
    tools() {
      return manifest.tools.filter((t) => t.enabled).map((t) => ({ name: t.name, description: t.description, risk: t.risk, enabled: t.enabled }));
    },
    manifest,
    version: '0.1.0',
    onNav: () => undefined,
    openPanel: (tab) => ui?.openPanel(tab),
    ask: (goal) => ui?.ask(goal) ?? Promise.resolve(),
  };

  function matching(path: string): ToolDef[] {
    return manifest.tools.filter((t) => {
      if (!t.enabled) return false;
      if (!t.scope?.urlPattern) return true;
      try {
        return new RegExp(t.scope.urlPattern).test(path);
      } catch {
        return false;
      }
    });
  }

  function registerScoped(): void {
    const path = currentPath(cfg.prefix);
    const tools = matching(path);
    const key = tools.map((t) => t.name).join(',');
    if (key === lastKey && registered) {
      ui?.setTools(tools);
      return;
    }
    lastKey = key;
    registered?.abort();
    const ac = new AbortController();
    registered = ac;
    const mc = getModelContext();
    if (mc) {
      for (const t of tools) {
        const def = {
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
          annotations: t.annotations,
          execute: (input: unknown, extras: { signal?: AbortSignal }) => runTool(t, input, extras?.signal ?? ac.signal),
        };
        try {
          mc.registerTool(def, { signal: ac.signal });
        } catch {
          try {
            mc.registerTool(def);
          } catch {}
        }
      }
    }
    ui?.setTools(tools);
  }

  let debounce: ReturnType<typeof setTimeout> | undefined;
  const onNav = () => {
    if (debounce !== undefined) clearTimeout(debounce);
    debounce = setTimeout(registerScoped, 100);
  };

  api.onNav = onNav;
  registerScoped();
  return api;
}

export function errorResult(e: unknown, path: string): ToolResult {
  const err = isRecipeError(e) ? e : toRecipeError(e);
  return textResult(formatError(err, path), true);
}
