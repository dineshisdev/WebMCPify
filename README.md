# WebMCPify

Paste a URL → crawl the site → generate WebMCP tools → get an **agent-ready URL**. Humans keep the original UI. Agents call `document.modelContext.registerTool` tools on the same page.

Built for the [OpenAI WebMCP Challenge](https://webmcp.devpost.com).

## Demo

**Stride Legacy Store** is a fake sneaker shop (search, filter, product, cart, checkout) with **no native WebMCP**. WebMCPify gives it eight task-level tools:

`search_products` · `filter_products` · `get_product` · `compare_products` · `add_to_cart` · `get_cart` · `proceed_to_checkout` · `place_order`

`place_order` is **sensitive**: the bridge shows an in-page confirm before the committing click.

Open the dashboard demo page (`/sites/demo`) for the agent-ready URL and a one-line snippet.

## Test instructions

### Chrome 149+ (guaranteed path)

1. Enable `chrome://flags/#enable-webmcp-testing` and relaunch.
2. Open the **agent-ready URL** (`https://<worker>/s/demo/`).
3. DevTools → **Application → WebMCP** lists the tools. Run `search_products` with `{ "query": "black" }` — the shop UI updates and the tool returns compact JSON.
4. Optional: Chrome's *Model Context Tool Inspector* extension to chat with the page.
5. Ask: *find black sneakers under ₹10k in size 9, compare the top 3, add the best to cart*. `place_order` must show the in-page confirm.

Any browser: click the **Agent-ready** badge and run a sample. `window.__webmcpify.call('search_products', { query: 'black' })` works without the flag.

### ChatGPT desktop (when site tools are enabled on the account)

Open the agent-ready URL in the in-app browser. A site-tools arrow appears in the address bar. Same multi-step prompt as above.

### Snippet mode (site-owner install)

```html
<script src="https://<app>/w/demo.js"></script>
```

Same bridge, no proxy. The page origin must match the manifest. Serve `Origin-Agent-Cluster: ?1` and `Permissions-Policy: tools=(self)` (the demo store's `netlify.toml` already does).

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

Snippet against the local store: add `<script src="http://localhost:3000/w/demo.js"></script>` to `demo-site/index.html` (set `DEMO_STORE_ORIGIN=http://localhost:8080`).

## Architecture

```
Next.js 16 on Netlify (GitHub)  ──►  Analyzer on Render (GitHub)  ──►  GPT-5.6 via the OpenAI API
  landing + dashboard                   /analyze → CapabilityModel           generate SiteManifest
  /api/sites/*  (Upstash Redis)         /verify  → per-tool pass/fail        repair failed tools
        │
        ├──► Cloudflare Worker (GitHub)  /s/<siteId>/…   HTMLRewriter injects the bridge
        └──► Snippet                     /w/<siteId>.js  same bridge on the real origin

Demo store: second Netlify site from the same GitHub repo (base = demo-site/)
```

Tools are a **declarative recipe DSL** interpreted by a ~39 KB IIFE (15 KB gzipped). The LLM never writes JavaScript that runs in the page. Risk is enforced in code: pay/order/delete/send clicks become `sensitive` and get a `confirm` step.

The proxy is path-based (`/s/<id>/…`) with runtime `fetch` / `history` patches. Analyzer runs against the **origin**, not the proxy.

## Sponsor tech

| Piece | Used for |
|---|---|
| OpenAI GPT-5.6 | Tool generation (`gpt-5.6-sol`) and repair (`gpt-5.6-terra`), called directly on the OpenAI API with the AI SDK (`@ai-sdk/openai`, structured outputs) |
| Next.js 16 on Netlify | Dashboard + API, deployed from GitHub |
| Cloudflare Workers + HTMLRewriter | Same-origin reverse proxy + bridge injection (GitHub → Workers) |
| Render | Playwright analyzer/verifier (Docker, GitHub Blueprint) |
| Netlify | Dashboard and the demo store (two sites, one GitHub repo) |
| Chrome WebMCP | `document.modelContext.registerTool`, DevTools panel, `use-webmcp-tool` on the dashboard itself |

Shopify-compatible names (`get_product`, `get_cart`, `proceed_to_checkout`) so agents that already know Shopify stores work unchanged.

Credits: [MCP-B](https://mcp-b.ai) / Alex Nahas for the WebMCP precursor. AbortSignal lifecycle and `CallToolResult` shapes follow that lineage.

## Not supported

Third-party logins/sessions, bot-challenged sites, WebSockets/SSE, service workers, strict-`Origin` CORS APIs, SPA routers that hardcode `/` with no basename. Public pages, best-effort. The demo store is the reliability floor.

## Security model

- Recipes only. No `eval`, no generated page JS.
- `readOnlyHint` / `untrustedContentHint` set on every tool.
- Outputs capped at 1.5 KB.
- Sensitive tools require an in-page human confirm (and the agent's own confirmation policy).
- Snippet mode refuses to run if `manifest.origin !== location.origin`.

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

## Deploy (all from GitHub — no CLI required after connect)

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

Devpost copy and the video shot list: [`SUBMISSION.md`](SUBMISSION.md).

## License

MIT
