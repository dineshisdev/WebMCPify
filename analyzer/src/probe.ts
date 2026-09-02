import type { Page } from 'playwright';
import type { ProbeResult } from '../../lib/capability';
import type { ExtractedPage } from './inpage';

const DANGER = /buy|pay|checkout|order|delete|remove|send|submit|subscribe|sign|login|book|reserve|cancel/i;

export async function runProbes(page: Page, extracted: ExtractedPage): Promise<ProbeResult[]> {
  const probes: ProbeResult[] = [];
  const before = page.url();

  const search = extracted.forms.find((f) => f.purpose === 'search');
  const qField = search?.fields.find((f) => /search|q\b|query/i.test(`${f.name} ${f.label} ${f.type}`)) ?? search?.fields[0];
  if (qField?.locator.css) {
    try {
      const loc = page.locator(qField.locator.css).first();
      await loc.fill('black');
      await loc.press('Enter');
      await page.waitForLoadState('domcontentloaded').catch(() => undefined);
      await page.waitForTimeout(400);
      probes.push({
        kind: 'search',
        target: qField.locator,
        value: 'black',
        effects: {
          urlAfter: page.url(),
          pushState: page.url() !== before && !(await page.evaluate(() => performance.getEntriesByType('navigation').length > 1)),
          fullLoad: page.url() !== before,
          endpointsHit: [],
        },
      });
    } catch {}
  }

  const selects = extracted.controls.filter((c) => c.kind === 'select' && c.region === 'main').slice(0, 4);
  for (const s of selects) {
    try {
      const handle = page.locator(s.locator.css).first();
      const options = await handle.locator('option:not([disabled])').all();
      if (options.length < 2) continue;
      const value = (await options[Math.min(1, options.length - 1)].getAttribute('value')) || (await options[1].innerText());
      await handle.selectOption({ value: value.trim() }).catch(async () => {
        await handle.selectOption({ label: value.trim() });
      });
      await page.waitForTimeout(250);
      probes.push({
        kind: 'select',
        target: s.locator,
        value: value.trim(),
        effects: { urlAfter: page.url(), pushState: false, fullLoad: false, endpointsHit: [] },
      });
    } catch {}
  }

  const list = extracted.lists[0];
  const linkCss = list?.fields.link?.css;
  if (list && linkCss && !DANGER.test(JSON.stringify(list))) {
    try {
      const urlBefore = page.url();
      const countBefore = list.count;
      await page.locator(list.root.css).locator(linkCss).first().click({ timeout: 2000 });
      await page.waitForTimeout(500);
      const urlAfter = page.url();
      probes.push({
        kind: 'linkClick',
        target: { css: `${list.root.css} ${linkCss}` },
        value: '',
        effects: {
          urlAfter,
          pushState: urlAfter !== urlBefore,
          fullLoad: urlAfter !== urlBefore,
          listCountBefore: countBefore,
          endpointsHit: [],
        },
      });
      if (urlAfter !== urlBefore) {
        await page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => undefined);
        await page.waitForTimeout(200);
      }
    } catch {}
  }

  return probes;
}
