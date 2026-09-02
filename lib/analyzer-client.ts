import type { CapabilityModel, PageModel } from './capability';
import type { SiteManifest } from './manifest';

export interface AnalyzerJob<T = unknown> {
  status: 'queued' | 'running' | 'done' | 'error';
  progress?: string[];
  result?: T;
  error?: string;
  startedAt?: string;
  finishedAt?: string;
}

export interface VerifyToolResult {
  tool: string;
  status: 'passed' | 'failed' | 'skipped';
  output?: string;
  error?: string;
  failedStep?: number;
  durationMs: number;
  pageModelAtFailure?: Pick<PageModel, 'url' | 'forms' | 'controls' | 'lists'>;
}

export interface VerifyResult {
  results: VerifyToolResult[];
}

function base(): string {
  return (process.env.ANALYZER_URL || 'http://localhost:10000').replace(/\/$/, '');
}

function headers(): Record<string, string> {
  const h: Record<string, string> = { 'content-type': 'application/json' };
  if (process.env.ANALYZER_TOKEN) h.authorization = `Bearer ${process.env.ANALYZER_TOKEN}`;
  return h;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(base() + path, { ...init, headers: { ...headers(), ...(init?.headers as Record<string, string>) }, cache: 'no-store' });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`analyzer ${path} → ${res.status} ${text.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

export const analyzer = {
  health: () => call<{ ok: boolean }>('/health'),
  startAnalyze: (url: string) => call<{ jobId: string }>('/analyze', { method: 'POST', body: JSON.stringify({ url }) }),
  analyzeSync: (url: string) => call<CapabilityModel>('/analyze/sync', { method: 'POST', body: JSON.stringify({ url }) }),
  job: <T>(id: string) => call<AnalyzerJob<T>>(`/jobs/${encodeURIComponent(id)}`),
  startVerify: (url: string, manifest: SiteManifest, tools?: string[]) =>
    call<{ jobId: string }>('/verify', { method: 'POST', body: JSON.stringify({ url, manifest, tools }) }),
};
