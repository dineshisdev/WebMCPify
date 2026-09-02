import { chromium, type Browser, type BrowserContext } from 'playwright';

let browserPromise: Promise<Browser> | undefined;

export const DESKTOP_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = chromium
      .launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
      .then((b) => {
        b.on('disconnected', () => {
          browserPromise = undefined;
        });
        return b;
      })
      .catch((e) => {
        browserPromise = undefined;
        throw e;
      });
  }
  return browserPromise;
}

export async function newContext(browser: Browser, extra: Parameters<Browser['newContext']>[0] = {}): Promise<BrowserContext> {
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent: DESKTOP_UA,
    locale: 'en-IN',
    ignoreHTTPSErrors: true,
    serviceWorkers: 'block',
    ...extra,
  });
  ctx.setDefaultTimeout(10_000);
  ctx.setDefaultNavigationTimeout(25_000);
  return ctx;
}

export async function closeBrowser(): Promise<void> {
  if (!browserPromise) return;
  const b = await browserPromise.catch(() => undefined);
  browserPromise = undefined;
  await b?.close().catch(() => {});
}
