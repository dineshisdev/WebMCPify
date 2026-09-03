# WebMCPify

Paste a website URL. Get a version of that site that agents can actually use.

The site still looks the same. Agents get real tools they can call — search, add to cart, checkout — instead of guessing which button to click.

Built for the [OpenAI WebMCP Challenge](https://webmcp.devpost.com).

## Try this (not a random URL)

**Agent-ready shop:** https://webmcpify-proxy.dineshisdev.workers.dev/s/demo/

**Dashboard:** https://webmcpify.netlify.app/sites/demo

**Original shop (no tools):** https://stride-legacy.netlify.app/

That’s a fake sneaker store I made. It has no WebMCP of its own. WebMCPify adds eight tools:

`search_products` · `filter_products` · `get_product` · `compare_products` · `add_to_cart` · `get_cart` · `proceed_to_checkout` · `place_order`

`place_order` asks a human to click Confirm on the page before it submits.

### Chrome 149+ (this is the reliable path)

1. Turn on `chrome://flags/#enable-webmcp-testing` and relaunch.
2. Open the agent-ready URL above.
3. DevTools → Application → WebMCP. You should see 8 tools.
4. Run `search_products` with `{ "query": "black" }`. The shop filters and you get JSON back.
5. Or click the **Agent-ready** badge on the page and chat: *find black sneakers under ₹10k in size 9, compare the top 3, add the cheapest to cart*.

Any browser, no flag: click the badge, or in the console:

```js
window.__webmcpify.call('search_products', { query: 'black' })
```

### ChatGPT desktop

If site tools are on for your account: open the same agent-ready URL in the in-app browser. Use the same prompt.

### If you own the site

```html
<script src="https://webmcpify.netlify.app/w/demo.js"></script>
```

Same tools, no proxy. Origin has to match.

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

| Piece | What I used it for |
|---|---|
| OpenAI GPT-5.6 | Generating tools (`gpt-5.6-sol`) and fixing ones that fail (`gpt-5.6-terra`) |
| Next.js 16 on Netlify | Dashboard and API |
| Cloudflare Workers | Proxy that injects the script |
| Render | Playwright crawl + verify |
| Netlify | Dashboard + the demo store (two sites, one repo) |
| Chrome WebMCP | `document.modelContext.registerTool`, DevTools, and `use-webmcp-tool` on the dashboard |

Tool names match Shopify where it made sense (`get_product`, `get_cart`, `proceed_to_checkout`), so agents that already know those still work.

Thanks to [MCP-B](https://mcp-b.ai) / Alex Nahas for the earlier WebMCP work.

## What doesn’t work

Logins, captchas, sites that block bots, WebSockets, a lot of SPAs. Random public pages are best-effort. The sneaker demo is what you should judge.

## Local dev

```bash
cp .env.example .env.local   # optional; file-store is used if Upstash is unset
npm install
npm run build:bridge
npm run dev                  # Next.js dashboard :3000
npm run dev:demo             # Stride store :8080
npm run dev:worker           # Cloudflare Worker proxy :8787
npm run dev:analyzer         # Playwright analyzer :10000 (needs `cd analyzer && npm install && npx playwright install chromium`)
```

Dashboard: http://localhost:3000 — paste `http://localhost:8080` or open `/sites/demo`.

Agent-ready (proxy): http://localhost:8787/s/demo/

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

## Deploy (all from GitHub)

Push `main`, then connect **this repo** in each dashboard:

1. **Netlify site A — dashboard**  
   Import GitHub repo · base directory = repo root · uses root `netlify.toml`.  
   Env: `OPENAI_API_KEY`, `GEN_MODEL`, `REPAIR_MODEL`, `UPSTASH_REDIS_REST_URL/TOKEN`, `ANALYZER_URL`, `ANALYZER_TOKEN`, `WORKER_ORIGIN`, `NEXT_PUBLIC_APP_ORIGIN`, `DEMO_STORE_ORIGIN`.  
   Target hostname: `https://webmcpify.netlify.app` (or whatever Netlify assigns — then patch `worker/wrangler.toml` `API_BASE` / `DASHBOARD_URL` and `demo-site/index.html` snippet).

2. **Netlify site B — Stride store**  
   Import the **same** repo · base directory = `demo-site` · publish `.` · `demo-site/netlify.toml`.  
   Prefer `https://stride-legacy.netlify.app`.

3. **Cloudflare Worker**  
   Workers → Create → Connect Git → this repo, root `worker/`. Production vars: `API_BASE` + `DASHBOARD_URL` = the dashboard Netlify URL.

4. **Render analyzer**  
   New → Blueprint → this repo → `render.yaml`. Set `BRIDGE_URL=https://<dashboard>/bridge.js` and `ANALYZER_TOKEN` (same as Netlify).

Every push to `main` redeploys. After Devpost submit: freeze the repo.

## License

MIT
