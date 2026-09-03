import Link from "next/link";
import { AgentTools } from "./components/AgentTools";
import { UrlForm } from "./components/UrlForm";
import { HeroVisual } from "./components/HeroVisual";
import { Card, IconCheck, IconExternal } from "./components/ui";

const STEPS = [
  {
    n: "1",
    title: "Analyze",
    body: "A headless browser opens the site and notes the forms, buttons, and lists.",
  },
  {
    n: "2",
    title: "Generate",
    body: "GPT-5.6 writes a few tools as recipes — click this, fill that — not JavaScript that runs in the page.",
  },
  {
    n: "3",
    title: "Verify",
    body: "We run those recipes on the live site. If one fails, we try to fix it once.",
  },
  {
    n: "4",
    title: "Ship",
    body: "You get a URL agents can use, or one script tag if you own the site. The original UI stays.",
  },
];

const STACK = [
  ["OpenAI GPT-5.6", "writes the tools, and fixes ones that fail"],
  ["Next.js 16", "dashboard and API"],
  ["Cloudflare Workers", "proxy that injects the script"],
  ["Render · Playwright", "crawl and live checks"],
  ["Netlify", "dashboard + the demo store"],
  ["Chrome WebMCP", "document.modelContext and DevTools"],
];

const SAFETY = [
  "GPT never writes code that runs in the browser. Tools are recipes a small script follows.",
  "If a tool would pay, order, delete, or send something, we show a confirm dialog on the page.",
  "ChatGPT and Chrome still apply their own tool warnings. Results are kept small.",
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
            Paste a URL. We look at the site, add{" "}
            <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[15px] text-fg">
              document.modelContext
            </code>{" "}
            tools, check they work, and give you a URL agents can use — without
            rebuilding the site.
          </p>
          <UrlForm />
          <p className="text-sm text-fg-subtle">
            Or open the ready-made demo:{" "}
            <Link
              href="/sites/demo"
              className="inline-flex items-center gap-1 font-medium text-brand transition-opacity hover:opacity-80"
            >
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
            <span className="tabular grid h-7 w-7 place-items-center rounded-lg bg-fg text-xs font-bold text-surface">
              {s.n}
            </span>
            <h2 className="mt-3 font-semibold text-fg">{s.title}</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-fg-muted">
              {s.body}
            </p>
          </Card>
        ))}
      </section>

      <section className="mt-16 grid gap-10 lg:grid-cols-[1.2fr_1fr]">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-fg">
            Why this matters
          </h2>
          <p className="mt-2 max-w-[65ch] text-[15px] leading-relaxed text-fg-muted">
            Most of the web was built for people with a mouse. Shopify can add
            WebMCP to their own stores. Everyone else would have to rebuild.
            That’s not going to happen. WebMCPify sits in the middle: you keep
            the real site, the agent gets named tools, and anything risky still
            needs a human to confirm on the page.
          </p>
          <h3 className="mt-6 text-sm font-semibold text-fg">Safety model</h3>
          <ul className="mt-2 space-y-2">
            {SAFETY.map((s) => (
              <li
                key={s}
                className="flex gap-2.5 text-[13px] leading-relaxed text-fg-muted"
              >
                <IconCheck
                  width={14}
                  height={14}
                  className="mt-0.5 shrink-0 text-ok"
                />
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-fg">
            Built with
          </h2>
          <dl className="mt-3 divide-y">
            {STACK.map(([k, v]) => (
              <div
                key={k}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2.5"
              >
                <dt className="text-[13px] font-medium text-fg">{k}</dt>
                <dd className="text-right text-xs text-fg-subtle">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-xs leading-relaxed text-fg-subtle">
            This dashboard is a WebMCP page too. Open it in Chrome with the flag
            on and you can ask it to analyze a site.
          </p>
        </div>
      </section>
    </div>
  );
}
