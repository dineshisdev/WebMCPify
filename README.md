# WebMCPify

Paste a website URL. Get a version of that site that agents can actually use.

The site still looks the same. Agents get real tools they can call — search, add to cart, checkout — instead of guessing which button to click.

Built for the [OpenAI WebMCP Challenge](https://webmcp.devpost.com).

## Try it

**https://webmcpify.netlify.app** — paste any public URL. It crawls the site, writes a few tools, checks each one on the live page, and hands back a URL agents can use. About a minute.

### Or try the demo

**Agent-ready shop:** https://webmcpify-proxy.dineshisdev.workers.dev/s/demo/

**Original shop (no tools):** https://stride-legacy.netlify.app/

It never had WebMCP. Now it has `search_products` · `filter_products` · `get_product` · `compare_products` · `add_to_cart` · `get_cart` · `proceed_to_checkout` · `place_order`.

Click the **Agent-ready** badge and type *find black sneakers under ₹10k in size 9, compare the top 3, add the cheapest to cart* — or call one yourself with `window.__webmcpify.call('search_products', { query: 'black' })`. `place_order` asks a human to click Confirm first; that dialog belongs to the page, not the agent.

To see them the way an agent does: `chrome://flags/#enable-webmcp-testing` in Chrome 149+, then DevTools → Application → WebMCP. Or ChatGPT desktop's in-app browser.

### If you own the site

```html
<script src="https://webmcpify.netlify.app/w/<siteId>.js"></script>
```

The dashboard hands you that after it generates. Same tools, no proxy, logins keep working.

## How it works

1. A headless browser crawls the site (forms, buttons, lists).
2. GPT-5.6 plans a few tools, then writes each one as a **recipe** — "click this, fill that, return this JSON." It does not write JavaScript that runs on the page.
3. We run those recipes on the live site. If one fails, we try to fix it once and re-check.
4. A ~40 KB script registers the survivors with `document.modelContext.registerTool`.

Two ways to get the tools onto the page:

- **Proxy URL** — a Cloudflare Worker serves the site and injects the script. Nothing changes on the original site.
- **One script tag** — if you can edit the site.

If a tool would pay, order, delete, or send something, code marks it sensitive and adds a confirm dialog. That decision is not left to the model. Tool results are capped at 1.5 KB, and every tool is registered with `readOnlyHint` / `untrustedContentHint` so ChatGPT and Chrome can apply their own rules.

## Built with

| Tech | What I used it for |
|---|---|
| OpenAI GPT-5.6 | `terra` plans and writes tools, `luna` repairs the ones that fail |
| Next.js 16 on Netlify | Dashboard and API |
| Cloudflare Workers | Proxy that injects the script |
| Render | Playwright crawl + verify |
| Netlify | Dashboard + the demo store (two sites, one repo) |
| Chrome WebMCP | `document.modelContext.registerTool`, DevTools, and `use-webmcp-tool` on the dashboard |

## Limits

Public pages only. Logins, captchas, bot-blockers and WebSockets are out of scope.

The proxy **refuses any site with a sign-in form**. Re-serving a login page under my domain with its security headers stripped is how you build a phishing page. Those sites still get tools — use the script tag instead.

Big sites are slow, and generation runs inside the request, so it can take a couple of polls. The dashboard handles that. The demo store is the reliable path; a pasted URL only gets tools the crawler can actually see.

## How to run this

```bash
cp .env.example .env.local
npm install
npm run build:bridge
npm run dev                  # Next.js dashboard :3000
npm run dev:demo             # Stride store :8080
npm run dev:worker           # Cloudflare Worker proxy :8787
npm run dev:analyzer         # Playwright analyzer :10000
```

The analyzer needs `cd analyzer && npm install && npx playwright install chromium` first.

Set `OPENAI_API_KEY` in `.env.local` if you want to generate tools for a new URL. Everything else works without it — the demo store ships with a hand-written manifest. Upstash is optional too; without it the store falls back to JSON files under `.data/`.

## Repo layout

```
app/          Next.js dashboard + /api/sites + /w/:id snippet
lib/          Shared manifest, capability model, LLM, store, pipeline
bridge/       Vanilla TS → public/bridge.js (committed artifact)
worker/       Cloudflare Worker proxy
analyzer/     Playwright crawl + verify (Fastify)
demo-site/    Stride Legacy Store (static; second Netlify site)
netlify.toml  Dashboard Netlify build (repo root)
```

MIT licensed.
