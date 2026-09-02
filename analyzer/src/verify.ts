import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from 'playwright';
import type { PageModel } from '../../lib/capability';
import type { SiteManifest, ToolDef, ToolResult } from '../../lib/manifest';
import { getBrowser, newContext } from './browser';
import { extractPage } from './inpage';
import { fnSource, truncate } from './util';

export interface VerifyToolOut {
  tool: string;
  status: 'passed' | 'failed' | 'skipped';
  output?: string;
  error?: string;
  failedStep?: number;
  durationMs: number;
  pageModelAtFailure?: Pick<PageModel, 'url' | 'forms' | 'controls' | 'lists'>;
}

export interface VerifyOut {
  results: VerifyToolOut[];
}

const TOOL_TIMEOUT_MS = 35_000;

async function loadBridge(): Promise<string> {
  const url = process.env.BRIDGE_URL;
  if (url) {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`BRIDGE_URL ${url} → ${res.status}`);
    return res.text();
  }
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(here, '../../public/bridge.js'),
    path.resolve(here, '../../worker/public/bridge.js'),
  ];
  for (const p of candidates) {
    try {
      return await readFile(p, 'utf8');
    } catch {}
  }
  throw new Error('bridge.js not found; build it with `npm run build:bridge` or set BRIDGE_URL');
}

async function snapshot(page: Page): Promise<Pick<PageModel, 'url' | 'forms' | 'controls' | 'lists'>> {
  try {
    const extracted = (await page.evaluate(`(${fnSource(extractPage)})()`)) as Awaited<ReturnType<typeof extractPage>>;
    return { url: page.url(), forms: extracted.forms, controls: extracted.controls, lists: extracted.lists };
  } catch {
    return { url: page.url(), forms: [], controls: [], lists: [] };
  }
}

function parseFailedStep(text: string): number | undefined {
  const m = /at step (\d+)/.exec(text);
  return m ? Number(m[1]) : undefined;
}

export async function verify(url: string, manifest: SiteManifest, names?: string[]): Promise<VerifyOut> {
  const bridge = await loadBridge();
  const tools = manifest.tools.filter((t) => t.enabled && (!names?.length || names.includes(t.name)));
  const browser = await getBrowser();
  const results: VerifyToolOut[] = [];

  for (const tool of tools) {
    results.push(await verifyOne(browser, url, manifest, tool, bridge));
  }
  return { results };
}

async function verifyOne(
  browser: Awaited<ReturnType<typeof getBrowser>>,
  url: string,
  manifest: SiteManifest,
  tool: ToolDef,
  bridge: string,
): Promise<VerifyToolOut> {
  const t0 = Date.now();
  const ctx = await newContext(browser);
  const page = await ctx.newPage();
  const dryRun = tool.risk === 'sensitive';
  const cfg = {
    mode: 'verify' as const,
    siteId: manifest.siteId,
    prefix: '',
    apiBase: '',
    manifest,
    dryRun,
  };
  await page.addInitScript({ content: `window.__WEBMCPIFY=${JSON.stringify(cfg)};` });
  await page.addInitScript({ content: bridge });
  if (tool.name === 'proceed_to_checkout' || tool.name === 'place_order' || tool.name === 'get_cart') {
    await page.addInitScript({
      content: `try{localStorage.setItem('cart',JSON.stringify([{id:'sn-014',size:'9',qty:1}]));}catch(e){}`,
    });
  }

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25_000 });
    await page.waitForTimeout(400);
    const ready = await page.waitForFunction(() => !!(window as Window & { __webmcpify?: { call: (name: string, input?: unknown) => Promise<unknown> } }).__webmcpify, null, { timeout: 8000 }).catch(() => null);
    if (!ready) {
      return { tool: tool.name, status: 'failed', error: 'bridge did not boot on the page', durationMs: Date.now() - t0, pageModelAtFailure: await snapshot(page) };
    }
    const sample = tool.samples[0] ?? {};
    const result = (await Promise.race([
      page.evaluate(
        async ({ name, input }) => {
          const api = (window as unknown as { __webmcpify: { call: (n: string, i: unknown) => Promise<unknown> } }).__webmcpify;
          return api.call(name, input);
        },
        { name: tool.name, input: sample },
      ),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('tool timed out')), TOOL_TIMEOUT_MS)),
    ])) as ToolResult;

    const text = result?.content?.map((c) => c.text).join('\n') ?? '';
    const durationMs = Date.now() - t0;
    if (dryRun) {
      return { tool: tool.name, status: 'skipped', output: truncate(text, 1500), durationMs };
    }
    if (result?.isError) {
      return {
        tool: tool.name,
        status: 'failed',
        error: truncate(text, 500),
        failedStep: parseFailedStep(text),
        output: truncate(text, 1500),
        durationMs,
        pageModelAtFailure: await snapshot(page),
      };
    }
    return { tool: tool.name, status: 'passed', output: truncate(text, 1500), durationMs };
  } catch (e) {
    return {
      tool: tool.name,
      status: 'failed',
      error: e instanceof Error ? e.message : String(e),
      durationMs: Date.now() - t0,
      pageModelAtFailure: await snapshot(page).catch(() => undefined),
    };
  } finally {
    await ctx.close().catch(() => undefined);
  }
}
