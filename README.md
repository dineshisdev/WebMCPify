# WebMCPify

Paste a website URL. Get a version of that site that agents can actually use.

The site still looks the same. Agents get real tools they can call — search, add to cart, checkout — instead of guessing which button to click.

Built for the [OpenAI WebMCP Challenge](https://webmcp.devpost.com).

## Try it

Turn on `chrome://flags/#enable-webmcp-testing` in Chrome 149+ and relaunch.

**Agent-ready shop:** https://webmcpify-proxy.dineshisdev.workers.dev/s/demo/

DevTools → Application → WebMCP. 8 tools. Run `search_products` with `{ "query": "black" }`. Or click the **Agent-ready** badge: *find black sneakers under ₹10k in size 9, compare the top 3, add the cheapest to cart*.

No flag: click the badge, or `window.__webmcpify.call('search_products', { query: 'black' })`.

**Paste any public URL:** https://webmcpify.netlify.app

**Original shop (no tools):** https://stride-legacy.netlify.app/

The shop never had WebMCP. WebMCPify adds:

`search_products` · `filter_products` · `get_product` · `compare_products` · `add_to_cart` · `get_cart` · `proceed_to_checkout` · `place_order`

`place_order` asks a human to click Confirm on the page before it submits.

ChatGPT desktop: same agent-ready URL in the in-app browser if site tools are on.

### If you own the site

Each site gets its own script. After you paste a URL, the dashboard copies it:

```html
<script src="https://webmcpify.netlify.app/w/<siteId>.js"></script>
```

Drop that tag on the matching origin. Same tools, no proxy.

## How it works

1. A headless browser crawls the site (forms, buttons, lists).
2. GPT-5.6 writes a few tools as **recipes** — “click this, fill that, return this JSON.” It does not write JavaScript that runs on the page.
3. We run those recipes on the live site. If one fails, we try to fix it once.
4. A small script registers them with `document.modelContext.registerTool`.

Two ways to get the tools onto the page:

- **Proxy URL** — a Cloudflare Worker serves the site and injects the script. No change to the original site.
- **One script tag** — if you can edit the site.

If a tool would pay, order, delete, or send something, we mark it sensitive and show a confirm dialog. Tool results are kept small (1.5 KB).

## Built with

| Tech | What I used it for |
|---|---|
| OpenAI GPT-5.6 | Generating tools (`gpt-5.6-sol`) and fixing ones that fail (`gpt-5.6-terra`) |
| Next.js 16 on Netlify | Dashboard and API |
| Cloudflare Workers | Proxy that injects the script |
| Render | Playwright crawl + verify |
| Netlify | Dashboard + the demo store (two sites, one repo) |
| Chrome WebMCP | `document.modelContext.registerTool`, DevTools, and `use-webmcp-tool` on the dashboard |

## Limits

Logins, captchas, sites that block bots, and WebSockets are out of scope. Public pages.

## How to run this

```bash
cp .env.example .env.local   # optional; file-store is used if Upstash is unset
npm install
npm run build:bridge
npm run dev                  # Next.js dashboard :3000
npm run dev:demo             # Stride store :8080
npm run dev:worker           # Cloudflare Worker proxy :8787
npm run dev:analyzer         # Playwright analyzer :10000 (needs `cd analyzer && npm install && npx playwright install chromium`)
```

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