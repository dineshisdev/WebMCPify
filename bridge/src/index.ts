import type { BridgeConfig, SiteManifest } from '../../lib/manifest';
import { resolveConfig } from './config';
import { hookHistory, installPatches } from './patches';
import { createRuntime, hasWebMCP, type BridgeApi } from './register';
import { mountUi } from './ui';

declare global {
  interface Window {
    __webmcpify?: BridgeApi;
  }
}

function boot(): void {
  if (window.__webmcpify) return;

  const script = document.currentScript as HTMLScriptElement | null;
  const cfg = resolveConfig(script);
  if (!cfg) {
    console.warn('[webmcpify] no site id; set window.__WEBMCPIFY or use /w/<id>.js');
    return;
  }

  if (cfg.mode === 'proxy') installPatches(cfg.prefix);

  void start(cfg);
}

async function start(cfg: BridgeConfig): Promise<void> {
  const manifest = await loadManifest(cfg);
  if (!manifest) return;

  if (cfg.mode === 'snippet') {
    try {
      const expected = new URL(manifest.origin).origin;
      if (expected !== location.origin) {
        console.warn(`[webmcpify] origin mismatch: manifest is ${expected}, page is ${location.origin}`);
        return;
      }
    } catch {
      console.warn('[webmcpify] manifest.origin is not a valid URL; refusing to boot in snippet mode');
      return;
    }
  }

  const hideUi = cfg.mode === 'verify' || manifest.settings.badge === false;
  const ui = hideUi
    ? null
    : mountUi({
        hidden: false,
        proxied: cfg.mode === 'proxy',
        apiBase: cfg.apiBase,
        onCall: (name, input) => {
          const api = window.__webmcpify;
          if (!api) return Promise.reject(new Error('bridge not ready'));
          return api.call(name, input);
        },
      });

  const runtime = createRuntime(cfg, manifest, ui);
  window.__webmcpify = runtime;
  hookHistory(runtime.onNav);

  if (!hasWebMCP() && cfg.mode !== 'verify') {
    console.info('[webmcpify] document.modelContext missing — tools still runnable via the badge and window.__webmcpify.call. Enable chrome://flags/#enable-webmcp-testing or use ChatGPT desktop.');
  }
}

async function loadManifest(cfg: BridgeConfig): Promise<SiteManifest | null> {
  if (cfg.manifest && Array.isArray(cfg.manifest.tools)) return cfg.manifest;
  const tag = document.getElementById('__webmcpify_manifest');
  if (tag?.textContent) {
    try {
      return JSON.parse(tag.textContent) as SiteManifest;
    } catch {}
  }
  if (!cfg.apiBase && !cfg.siteId) return null;
  const url = `${cfg.apiBase || ''}/api/sites/${encodeURIComponent(cfg.siteId)}/manifest`;
  try {
    const res = await fetch(url, { credentials: 'omit', cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as SiteManifest;
  } catch (e) {
    console.error('[webmcpify] failed to load manifest', e);
    return null;
  }
}

boot();
