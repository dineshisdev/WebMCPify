import Link from 'next/link';
import { AgentTools } from './components/AgentTools';
import { UrlForm } from './components/UrlForm';
import { HeroVisual } from './components/HeroVisual';
import { Card, IconCheck, IconExternal } from './components/ui';

const STEPS = [
  { n: '1', title: 'Analyze', body: 'A headless browser crawls the site: forms, controls, repeated lists, same-origin JSON endpoints, SPA behaviour.' },
  { n: '2', title: 'Generate', body: 'GPT-5.6 turns that capability model into a handful of task-level tools with JSON schemas, risk tiers and executable recipes — never generated JavaScript.' },
  { n: '3', title: 'Verify', body: 'Every read tool runs against the live site in Playwright. Failures get one repair pass, then re-check. Sensitive tools are dry-run.' },
  { n: '4', title: 'Ship', body: 'Take an agent-ready URL from the edge proxy, or paste one line into your own site. Humans keep the UI; agents get the tools.' },
];

const STACK = [
  ['OpenAI GPT-5.6', 'tool generation & repair (AI SDK structured outputs)'],
  ['Next.js 16', 'dashboard, API, pipeline state machine'],
  ['Cloudflare Workers · HTMLRewriter', 'edge proxy that injects the bridge'],
  ['Render · Playwright', 'analyzer & live verification service'],
  ['Netlify', 'hosts the dashboard and the demo “legacy” store'],
  ['Chrome WebMCP · use-webmcp-tool', 'the standard, the hook, the DevTools panel'],
];

const SAFETY = [
  'Tools are declarative recipes interpreted by a 39 KB bridge (15 KB gzipped) — the model never writes code that runs in your browser.',
  'Code, not the model, decides risk: anything that clicks pay, order, delete or send becomes sensitive and gets an on-page confirmation.',
  'readOnlyHint and untrustedContentHint are set on every tool, so ChatGPT and Chrome apply their own guardrails. Outputs are capped at 1.5 KB.',
];

export default function Home() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-14">
      <AgentTools />

      <section className="grid min-w-0 items-center gap-10 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="flex min-w-0 flex-col items-start gap-6">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-subtle px-3 py-1 text-xs font-semibold text-brand ring-1 ring-inset ring-brand-border">
          Built for the OpenAI WebMCP Challenge
        </span>
        <h1 className="max-w-3xl text-balance text-4xl font-semibold leading-[1.1] tracking-tight text-fg sm:text-5xl">
          Give any website an agent interface.
        </h1>
        <p className="max-w-2xl text-lg leading-relaxed text-fg-muted">
          Paste a URL. WebMCPify discovers what the site can do, generates{' '}
          <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[15px] text-fg">document.modelContext</code> tools, verifies them
          against the live site, and hands you an agent-ready URL — without rebuilding anything.
        </p>
        <UrlForm />
        <p className="text-sm text-fg-subtle">
          Or open the ready-made demo:{' '}
          <Link href="/sites/demo" className="inline-flex items-center gap-1 font-medium text-brand transition-opacity hover:opacity-80">
            Stride Legacy Store <IconExternal width={12} height={12} />
          </Link>
        </p>
        </div>
        <div className="min-w-0 lg:pl-2">
          <HeroVisual />
        </div>
      </section>

      <section className="mt-16 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((s) => (
          <Card key={s.n} className="p-4">
            <span className="tabular grid h-7 w-7 place-items-center rounded-lg bg-fg text-xs font-bold text-surface">{s.n}</span>
            <h2 className="mt-3 font-semibold text-fg">{s.title}</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-fg-muted">{s.body}</p>
          </Card>
        ))}
      </section>

      <section className="mt-16 grid gap-10 lg:grid-cols-[1.2fr_1fr]">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-fg">Why this matters</h2>
          <p className="mt-2 max-w-[65ch] text-[15px] leading-relaxed text-fg-muted">
            Shopify ships WebMCP tools on every storefront. Cloudflare can inject fixed tool packs for sites it already hosts. Everyone else — the
            long tail of shops, booking sites, portals and internal apps — was built for people with a mouse, and nobody is going to rebuild them.
            WebMCPify is the compatibility layer: the human keeps the real UI, the agent gets typed tools, and the site owner keeps control through
            risk tiers and in-page confirmations.
          </p>
          <h3 className="mt-6 text-sm font-semibold text-fg">Safety model</h3>
          <ul className="mt-2 space-y-2">
            {SAFETY.map((s) => (
              <li key={s} className="flex gap-2.5 text-[13px] leading-relaxed text-fg-muted">
                <IconCheck width={14} height={14} className="mt-0.5 shrink-0 text-ok" />
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-fg">Built with</h2>
          <dl className="mt-3 divide-y">
            {STACK.map(([k, v]) => (
              <div key={k} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2.5">
                <dt className="text-[13px] font-medium text-fg">{k}</dt>
                <dd className="text-right text-xs text-fg-subtle">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-xs leading-relaxed text-fg-subtle">
            This dashboard is itself agent-ready — open it in a WebMCP browser and ask it to make a site agent-ready.
          </p>
        </div>
      </section>
    </div>
  );
}
