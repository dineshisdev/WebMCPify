export interface Env {
  ASSETS: Fetcher;
  API_BASE: string;
  DASHBOARD_URL: string;
  DEMO_ORIGIN?: string;
  ALLOW_PRIVATE_ORIGINS?: string;
  ALLOWED_ORIGINS?: string;
}

export const SITE_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra },
  });
}
