'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { SiteManifest, ToolDef } from '@/lib/manifest';
import type { SiteDoc } from '@/lib/store';
import { AgentTools } from './AgentTools';
import { CopyButton } from './CopyButton';
import { ToolCard } from './ToolCard';
import { Card, IconExternal, IconSpark } from './ui';

type Stats = { pagesVisited: number; controls: number; forms: number; lists: number; endpoints: number };
type Doc = Omit<SiteDoc, 'capability'> & { capabilityStats?: Stats; capabilitySpa?: boolean };

const STATUS: Record<SiteDoc['status'], { label: string; cls: string }> = {
  analyzing: { label: 'Analyzing site', cls: 'bg-brand-subtle text-brand ring-brand-border' },
  generating: { label: 'Generating tools', cls: 'bg-brand-subtle text-brand ring-brand-border' },
  verifying: { label: 'Verifying tools', cls: 'bg-brand-subtle text-brand ring-brand-border' },
  ready: { label: 'Ready', cls: 'bg-ok-subtle text-ok ring-ok-border' },
  error: { label: 'Error', cls: 'bg-danger-subtle text-danger ring-danger-border' },
};

export function SiteDashboard({ id, workerOrigin, appOrigin }: { id: string; workerOrigin: string; appOrigin: string }) {
  const [doc, setDoc] = useState<Doc | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<'proxy' | 'snippet'>('proxy');

  const [tick, setTick] = useState(0);
  const [fails, setFails] = useState(0);
  const refresh = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    const ac = new AbortController();
    void (async () => {
      try {
        const res = await fetch(`/api/sites/${id}`, { cache: 'no-store', signal: ac.signal });
        const text = await res.text();
        let body: unknown = null;
        try {
          body = text ? JSON.parse(text) : null;
        } catch {
          body = null;
        }
        if (!res.ok || body === null) {
          const detail = (body as { error?: string } | null)?.error;
          throw new Error(detail || `${res.status}${res.statusText ? ' ' + res.statusText : ''}` || 'empty response');
        }
        if (ac.signal.aborted) return;
        setDoc(body as Doc);
        setErr(null);
        setFails(0);
      } catch (e) {
        if (ac.signal.aborted || (e as Error).name === 'AbortError') return;
        setErr((e as Error).message);
        setFails((f) => f + 1);
      }
    })();
    return () => ac.abort();
  }, [id, tick]);

  useEffect(() => {
    if (fails === 0 || fails > 8) return;
    const t = setTimeout(() => setTick((n) => n + 1), Math.min(2000 * fails, 8000));
    return () => clearTimeout(t);
  }, [fails]);

  useEffect(() => {
    if (!doc || !['analyzing', 'generating', 'verifying'].includes(doc.status)) return;
    const t = setTimeout(refresh, doc.status === 'generating' ? 5000 : 2500);
    return () => clearTimeout(t);
  }, [doc, refresh]);

  if (err && !doc && fails > 3) {
    return (
      <Card className="p-4 text-sm">
        <p className="text-danger">Could not load this site: {err}</p>
        <button
          onClick={() => {
            setFails(0);
            setErr(null);
            refresh();
          }}
          className="mt-3 cursor-pointer rounded-lg bg-fg px-3 py-1.5 text-xs font-semibold text-surface transition-opacity hover:opacity-90"
        >
          Try again
        </button>
      </Card>
    );
  }
  if (!doc) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Loading site">
        <div className="h-8 w-1/3 animate-pulse rounded-lg bg-surface-2" />
        <div className="h-24 animate-pulse rounded-xl bg-surface-2" />
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="h-44 animate-pulse rounded-xl bg-surface-2" />
          <div className="h-44 animate-pulse rounded-xl bg-surface-2" />
        </div>
      </div>
    );
  }

  const manifest: SiteManifest | undefined = doc.manifest;
  const agentUrl = `${workerOrigin}/s/${id}/`;
  const snippet = `<script src="${appOrigin}/w/${id}.js"></script>`;
  const busy = ['analyzing', 'generating', 'verifying'].includes(doc.status);
  const tools = manifest?.tools ?? [];
  const enabled = tools.filter((t) => t.enabled);
  const passed = tools.filter((t) => t.verification.status === 'passed').length;
  const st = STATUS[doc.status];
  const s = doc.capabilityStats;
  const fail = doc.error ? humanizeError(doc.error) : null;

  function updateTool(t: ToolDef) {
    if (!manifest) return;
    setDoc({ ...doc!, manifest: { ...manifest, tools: manifest.tools.map((x) => (x.name === t.name ? t : x)) } });
  }

  async function reverify() {
    await fetch(`/api/sites/${id}/verify`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    refresh();
  }

  async function retry() {
    await fetch(`/api/sites/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ retry: true }) });
    refresh();
  }

  return (
    <div className="min-w-0 space-y-5">
      <AgentTools siteId={id} manifest={manifest} agentUrl={agentUrl} />

      <header className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="min-w-0 truncate text-[26px] font-semibold leading-tight tracking-tight text-fg">
            {manifest?.name ?? doc.origin}
          </h1>
          <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${st.cls}`}>
            {busy && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />}
            {st.label}
          </span>
          {err && (
            <span className="text-[11px] text-fg-subtle" role="status">
              reconnecting…
            </span>
          )}
        </div>
        <a
          href={doc.url}
          target="_blank"
          rel="noreferrer"
          className="mt-1 inline-flex max-w-full items-center gap-1 truncate text-sm text-fg-subtle transition-colors hover:text-brand"
        >
          <span className="truncate">{doc.url}</span>
          <IconExternal width={12} height={12} className="shrink-0" />
        </a>

        {(manifest || s) && (
          <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-2 border-t pt-3">
            {manifest && <Stat label="Type" value={`${manifest.category} · ${manifest.spa ? 'SPA' : 'multi-page'}`} />}
            {s && <Stat label="Pages crawled" value={s.pagesVisited} />}
            {s && <Stat label="Controls" value={s.controls} />}
            {s && <Stat label="Lists" value={s.lists} />}
            {s && <Stat label="Endpoints" value={s.endpoints} />}
            {tools.length > 0 && <Stat label="Tools" value={`${enabled.length} of ${tools.length} enabled`} />}
          </dl>
        )}
      </header>

      {manifest && (
        <section className="min-w-0 rounded-xl border border-brand-border bg-brand-subtle p-4">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold text-fg">
              <IconSpark width={14} height={14} className="text-brand" />
              Agent-ready URL
            </h2>
            <div role="tablist" className="ml-auto flex gap-0.5 rounded-lg bg-surface p-0.5">
              {(['proxy', 'snippet'] as const).map((t) => (
                <button
                  key={t}
                  role="tab"
                  aria-selected={tab === t}
                  onClick={() => setTab(t)}
                  className={`cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium transition-colors duration-150 ${
                    tab === t ? 'bg-brand text-brand-fg' : 'text-fg-subtle hover:text-fg'
                  }`}
                >
                  {t === 'proxy' ? 'Instant proxy' : 'Install on your site'}
                </button>
              ))}
            </div>
          </div>

          {tab === 'proxy' ? (
            <>
              <div className="mt-3 flex min-w-0 flex-wrap items-center gap-2">
                <a
                  id="agent-ready-url"
                  href={agentUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="scroll-x min-w-0 flex-1 rounded-lg border bg-surface px-3 py-2 font-mono text-[13px] whitespace-nowrap text-brand transition-colors hover:border-brand-border"
                >
                  {agentUrl}
                </a>
                <CopyButton text={agentUrl} />
                <a
                  href={agentUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-xs font-semibold text-brand-fg transition-colors hover:bg-brand-hover"
                >
                  Open <IconExternal width={12} height={12} />
                </a>
              </div>
              <p className="mt-2 max-w-[70ch] text-xs leading-relaxed text-fg-muted">
                The same site and the same UI, plus {enabled.length} WebMCP tools registered on the top-level page. Open it in the{' '}
                <strong className="font-semibold text-fg">ChatGPT desktop app&apos;s browser</strong> (site tools appear in the address bar) or{' '}
                <strong className="font-semibold text-fg">Chrome 149+</strong> with <code className="rounded bg-surface px-1 py-px font-mono text-[11px]">chrome://flags/#enable-webmcp-testing</code>.
              </p>
            </>
          ) : (
            <>
              <div className="mt-3 flex min-w-0 flex-wrap items-center gap-2">
                <code className="scroll-x min-w-0 flex-1 rounded-lg border bg-surface px-3 py-2 font-mono text-[13px] whitespace-nowrap text-fg-muted">
                  {snippet}
                </code>
                <CopyButton text={snippet} />
              </div>
              <p className="mt-2 max-w-[70ch] text-xs leading-relaxed text-fg-muted">
                Add one line to your <code className="rounded bg-surface px-1 py-px font-mono text-[11px]">&lt;head&gt;</code>, like an analytics tag. Same bridge, no proxy — so sessions and logins keep working. Serve{' '}
                <code className="rounded bg-surface px-1 py-px font-mono text-[11px]">Origin-Agent-Cluster: ?1</code> and{' '}
                <code className="rounded bg-surface px-1 py-px font-mono text-[11px]">Permissions-Policy: tools=(self)</code>.
              </p>
            </>
          )}
        </section>
      )}

      {(busy || doc.status === 'error') && (
        <Card className="overflow-hidden p-4">
          <div className="mb-3 flex items-center gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">Pipeline</h2>
            {busy && (
              <span className="text-[11px] text-fg-subtle">running…</span>
            )}
            {doc.status === 'error' && (
              <button
                onClick={retry}
                className="ml-auto cursor-pointer rounded-lg bg-fg px-3 py-1.5 text-xs font-semibold text-surface transition-opacity hover:opacity-90"
              >
                Retry
              </button>
            )}
          </div>
          <ol className="max-h-52 space-y-1.5 overflow-y-auto overflow-x-hidden pr-1 font-mono text-[12px] leading-relaxed text-fg-muted [scrollbar-width:thin]">
            {doc.progress.map((p, i) => (
              <li key={i} className="break-words">
                {p}
              </li>
            ))}
          </ol>
          {fail && (
            <div className="mt-3 rounded-lg bg-danger-subtle p-3 ring-1 ring-inset ring-danger-border" role="alert">
              <p className="text-sm font-semibold text-danger">{fail.title}</p>
              <p className="mt-1 text-[13px] leading-relaxed break-words text-danger/90">{fail.detail}</p>
            </div>
          )}
        </Card>
      )}

      {manifest && (
        <section className="min-w-0">
          <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="text-lg font-semibold tracking-tight text-fg">Generated tools</h2>
            <p className="text-sm text-fg-subtle">
              <span className="tabular">{tools.length}</span> tools · <span className="tabular">{passed}</span> verified on the live site
            </p>
            {!doc.demo && (
            <button
              onClick={reverify}
              disabled={busy}
              className="ml-auto cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-medium text-fg-muted transition-colors hover:border-border-strong hover:text-fg disabled:cursor-not-allowed disabled:opacity-50"
            >
              Re-verify all
            </button>
            )}
          </div>
          <div className="grid min-w-0 items-start gap-3 lg:grid-cols-2">
            {tools.map((t) => (
              <ToolCard key={t.name} tool={t} siteId={id} onChange={updateTool} readOnly={!!doc.demo} />
            ))}
          </div>
        </section>
      )}

      {doc.status === 'ready' && tools.length > 0 && (
        <Card className="p-4">
        <h2 className="text-sm font-semibold text-fg">How to test</h2>
        <ol className="mt-2 space-y-2 text-[13px] leading-relaxed text-fg-muted">
          <li className="flex gap-2.5">
            <Step n={1} />
            <span>
              <strong className="font-semibold text-fg">Chrome 149+</strong> — turn on <code className="rounded bg-surface-2 px-1 py-px font-mono text-[11px]">chrome://flags/#enable-webmcp-testing</code>, open the agent-ready URL, then DevTools → Application → WebMCP. Run <code className="rounded bg-surface-2 px-1 py-px font-mono text-[11px]">{tools[0]?.name ?? 'a tool'}</code>
              {tools[0]?.samples[0] ? (
                <>
                  {' '}with <code className="rounded bg-surface-2 px-1 py-px font-mono text-[11px]">{JSON.stringify(tools[0].samples[0])}</code>
                </>
              ) : (
                '.'
              )}
            </span>
          </li>
          <li className="flex gap-2.5">
            <Step n={2} />
            <span>
              <strong className="font-semibold text-fg">ChatGPT desktop</strong> — same URL in the in-app browser, site-tools arrow in the address bar. Ask it to use the tools on this page.
            </span>
          </li>
          <li className="flex gap-2.5">
            <Step n={3} />
            <span>
              <strong className="font-semibold text-fg">Any browser</strong> — click the “Agent-ready” badge on the page to run any tool with its sample input.
            </span>
          </li>
        </ol>
        <p className="mt-3 border-t pt-3 text-xs text-fg-subtle">
          Sensitive tools always ask a human to confirm on the page.
        </p>
      </Card>
      )}

      <p className="text-xs">
        <Link href="/" className="text-fg-subtle transition-colors hover:text-brand">
          ← Analyze another site
        </Link>
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-fg-subtle">{label}</dt>
      <dd className="tabular mt-0.5 text-sm font-medium text-fg">{value}</dd>
    </div>
  );
}

function humanizeError(raw: string): { title: string; detail: string } {
  const msg = raw.replace(/^Error:\s*/, '').trim();
  if (/not supported with the .+ model|Unsupported value/i.test(msg)) {
    return { title: 'Couldn’t generate tools', detail: 'The model rejected a generation setting. Retry — this is fixed.' };
  }
  if (/OPENAI_API_KEY/i.test(msg)) {
    return { title: 'Missing OpenAI API key', detail: 'Add OPENAI_API_KEY on the host, then retry.' };
  }
  if (/Analyzer unreachable/i.test(msg)) {
    return { title: 'Analyzer is down', detail: msg };
  }
  if (/tool generation failed/i.test(msg)) {
    return { title: 'Tool generation failed', detail: msg };
  }
  if (/no tools generated/i.test(msg)) {
    return { title: 'No tools generated', detail: 'The model didn’t produce any usable tools for this site. Retry, or try a different URL.' };
  }
  return { title: 'Something went wrong', detail: msg };
}

function Step({ n }: { n: number }) {
  return (
    <span className="tabular mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[11px] font-semibold text-fg-muted">
      {n}
    </span>
  );
}
