import type { ControlModel, FieldModel, FormModel, ListModel } from '../../lib/capability';
import type { Locator } from '../../lib/manifest';

export interface ExtractedPage {
  title: string;
  headings: string[];
  textExcerpt: string;
  auth: boolean;
  forms: FormModel[];
  controls: ControlModel[];
  lists: ListModel[];
  urlState: { params: string[] };
  storageKeys: string[];
  links: { href: string; text: string; score: number }[];
}

export function extractPage(): ExtractedPage {
  const GEN = /^(?:[:]|radix|headlessui|mui|react|ember)|(?:\w*\d{3,}$)/i;
  const SENS = /\b(buy|pay|checkout|order|delete|remove|send|submit|subscribe|sign|login|log in|book|reserve|cancel|place order|purchase)\b/i;
  const PLUSK = /\b(shop|product|search|pricing|price|book|cart|checkout|catalog|store|menu|docs|guide|help|account|dashboard)\b/i;
  const MINUSK = /\b(login|sign in|privacy|terms|cookie|legal|careers|instagram|facebook|twitter|linkedin)\b/i;

  const norm = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();
  const visible = (el: Element) => {
    if (!(el as HTMLElement).getClientRects || (el as HTMLElement).getClientRects().length === 0) return false;
    const st = getComputedStyle(el);
    return st.display !== 'none' && st.visibility !== 'hidden';
  };

  const cssEscape = (s: string) => {
    if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(s);
    return s.replace(/[^a-zA-Z0-9_-]/g, (c) => '\\' + c);
  };

  const unique = (css: string, root: ParentNode = document): boolean => {
    try {
      return root.querySelectorAll(css).length === 1;
    } catch {
      return false;
    }
  };

  const attrLoc = (el: Element): Locator | null => {
    for (const a of ['data-testid', 'data-test', 'data-cy', 'data-id', 'data-product-id'] as const) {
      const v = el.getAttribute(a);
      if (v) {
        const css = `[${a}="${cssEscape(v)}"]`;
        if (unique(css)) return { css };
      }
    }
    if (el.id && !GEN.test(el.id)) {
      const css = `#${cssEscape(el.id)}`;
      if (unique(css)) return { css };
    }
    const name = el.getAttribute('name');
    if (name) {
      const form = el.closest('form');
      const css = `${el.tagName.toLowerCase()}[name="${cssEscape(name)}"]`;
      if (form && form.id) return { css, within: { css: `#${cssEscape(form.id)}` } };
      if (unique(css)) return { css };
    }
    for (const a of ['aria-label', 'placeholder', 'title'] as const) {
      const v = el.getAttribute(a);
      if (v && v.length <= 60) {
        const css = `${el.tagName.toLowerCase()}[${a}="${cssEscape(v)}"]`;
        if (unique(css)) return { css };
      }
    }
    return null;
  };

  const stableClass = (el: Element): string => {
    const cls = [...el.classList].filter((c) => c.length < 40 && !GEN.test(c) && !/^[a-z]?[A-Z0-9_-]{10,}$/.test(c) && !/\d{3,}/.test(c));
    return cls[0] ? el.tagName.toLowerCase() + '.' + cssEscape(cls[0]) : el.tagName.toLowerCase();
  };

  const locatorFor = (el: Element): Locator => {
    const hit = attrLoc(el);
    if (hit) return hit;
    const text = norm(el.textContent).slice(0, 40);
    if (text && text.length >= 2 && (el.tagName === 'BUTTON' || el.tagName === 'A' || el.tagName === 'LABEL')) {
      const css = el.tagName.toLowerCase();
      const alts = [...document.querySelectorAll(css)].filter((x) => norm(x.textContent).slice(0, 40) === text);
      if (alts.length <= 3) return { css, text, exact: true };
    }
    const parts: string[] = [];
    let cur: Element | null = el;
    for (let i = 0; i < 3 && cur && cur !== document.body && cur !== document.documentElement; i++) {
      parts.unshift(stableClass(cur));
      cur = cur.parentElement;
    }
    const css = parts.join(' > ');
    const matches = [...document.querySelectorAll(css)];
    const nth = matches.indexOf(el);
    if (nth > 0) return { css, nth };
    return { css };
  };

  const regionOf = (el: Element): ControlModel['region'] => {
    if (el.closest('header, [role="banner"]')) return 'header';
    if (el.closest('nav, [role="navigation"]')) return 'nav';
    if (el.closest('footer, [role="contentinfo"]')) return 'footer';
    if (el.closest('aside, [role="complementary"]')) return 'aside';
    return 'main';
  };

  const headings = [...document.querySelectorAll('h1,h2,h3')]
    .map((h) => norm(h.textContent))
    .filter(Boolean)
    .slice(0, 10);

  const textExcerpt = norm(document.body?.innerText || '').slice(0, 400);
  const auth = !!document.querySelector('input[type="password"]');

  const forms: FormModel[] = [...document.querySelectorAll('form')].slice(0, 8).map((form) => {
    const fields: FieldModel[] = [...form.querySelectorAll('input,select,textarea')]
      .filter((el) => {
        const t = (el as HTMLInputElement).type;
        return t !== 'hidden' && t !== 'submit' && t !== 'button' && visible(el);
      })
      .slice(0, 15)
      .map((el) => {
        const input = el as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
        const label = norm(form.querySelector(`label[for="${input.id}"]`)?.textContent) ||
          norm((input.closest('label') as HTMLElement | null)?.textContent);
        const options =
          input instanceof HTMLSelectElement
            ? [...input.options].slice(0, 20).map((o) => ({ value: o.value, label: norm(o.textContent) }))
            : undefined;
        const type =
          input instanceof HTMLSelectElement
            ? 'select'
            : input instanceof HTMLTextAreaElement
              ? 'textarea'
              : (input as HTMLInputElement).type || 'text';
        return {
          locator: locatorFor(el),
          name: input.name || undefined,
          label: label || undefined,
          type,
          placeholder: (input as HTMLInputElement).placeholder || undefined,
          required: !!input.required,
          options,
          currentValue: 'value' in input ? String(input.value).slice(0, 80) : undefined,
        };
      });
    const submitEl = form.querySelector('[type="submit"], button:not([type]), button[type="submit"]');
    const action = form.getAttribute('action') || undefined;
    const method = (form.getAttribute('method') || 'get').toLowerCase();
    const blob = (norm(form.textContent) + ' ' + fields.map((f) => f.name || f.label || '').join(' ')).toLowerCase();
    let purpose: FormModel['purpose'] = 'unknown';
    if (/search|q\b|query/.test(blob) || fields.some((f) => f.type === 'search')) purpose = 'search';
    else if (/filter|sort|category/.test(blob)) purpose = 'filter';
    else if (/password|sign in|log in/.test(blob)) purpose = 'login';
    else if (/checkout|payment|place order|shipping/.test(blob)) purpose = 'checkout';
    else if (/email|newsletter|subscribe/.test(blob) && fields.length <= 2) purpose = 'newsletter';
    else if (/message|contact/.test(blob)) purpose = 'contact';
    return {
      locator: locatorFor(form),
      action,
      method,
      purpose,
      fields,
      submit: submitEl ? { locator: locatorFor(submitEl), text: norm(submitEl.textContent).slice(0, 60) } : undefined,
    };
  });

  const controls: ControlModel[] = [];
  const seen = new Set<Element>();
  for (const el of document.querySelectorAll('button, a[href], select, input[type="checkbox"], input[type="radio"], [role="button"]')) {
    if (!visible(el) || seen.has(el)) continue;
    seen.add(el);
    if (controls.length >= 40) break;
    const text = norm(el.textContent || (el as HTMLInputElement).value || el.getAttribute('aria-label')).slice(0, 60);
    const href = el instanceof HTMLAnchorElement ? el.getAttribute('href') || undefined : undefined;
    const kind: ControlModel['kind'] =
      el.tagName === 'SELECT' ? 'select' : el.tagName === 'A' ? 'link' : (el as HTMLInputElement).type === 'checkbox' ? 'toggle' : el.tagName === 'INPUT' ? 'input' : 'button';
    const region = regionOf(el);
    const riskHint = SENS.test(text) || SENS.test(href || '') ? ('sensitive' as const) : undefined;
    controls.push({ locator: locatorFor(el), kind, text, href, region, riskHint });
  }

  const lists: ListModel[] = [];
  const scored: { root: Element; itemSel: string; items: Element[]; score: number }[] = [];
  for (const parent of document.querySelectorAll('ul, ol, div, section, main')) {
    const kids = [...parent.children].filter((c) => visible(c));
    if (kids.length < 3) continue;
    const sig = (el: Element) => el.tagName + '.' + (el.classList[0] || '');
    const counts = new Map<string, Element[]>();
    for (const k of kids) {
      const s = sig(k);
      if (!counts.has(s)) counts.set(s, []);
      counts.get(s)!.push(k);
    }
    let best: { s: string; els: Element[] } | null = null;
    for (const [s, els] of counts) if (els.length / kids.length >= 0.6 && (!best || els.length > best.els.length)) best = { s, els };
    if (!best || best.els.length < 3) continue;
    const sample = best.els[0];
    const hasLink = !!sample.querySelector('a[href]');
    const enoughText = norm(sample.textContent).length >= 15;
    if (!hasLink && !enoughText) continue;
    const itemSel = stableClass(sample);
    const pricey = /[₹$€£]\s?\d/.test(sample.textContent || '');
    const img = !!sample.querySelector('img, svg');
    const score = best.els.length * (hasLink ? 2 : 1) * (pricey ? 1.5 : 1) * (img ? 1.2 : 1);
    scored.push({ root: parent, itemSel, items: best.els, score });
  }
  scored.sort((a, b) => b.score - a.score);
  const used = new Set<Element>();
  for (const s of scored) {
    if (lists.length >= 5) break;
    if ([...used].some((u) => u.contains(s.root) || s.root.contains(u))) continue;
    used.add(s.root);
    const first = s.items[0];
    const fields: ListModel['fields'] = {};
    const leaves = [...first.querySelectorAll('a, img, span, p, h1, h2, h3, h4, strong, time, [data-product-id], [class*="price"], [class*="name"], [class*="title"], [class*="rating"]')];
    const classify = (el: Element) => {
      const t = norm(el.textContent);
      const href = el.getAttribute('href') || '';
      const src = (el as HTMLImageElement).src || el.getAttribute('src') || '';
      const id = el.getAttribute('data-product-id') || (el as HTMLElement).dataset.productId;
      if (id) return { name: 'id', kind: 'id' as const, sample: id, attr: 'data-product-id', css: el === first ? undefined : stableClass(el) };
      if (/[₹$€£]\s?\d/.test(t) || /price/i.test(el.className)) return { name: 'price', kind: 'price' as const, sample: t.slice(0, 40), css: stableClass(el) };
      if (/stars?|rating|★|☆/.test(t) || /rating/i.test(el.className)) return { name: 'rating', kind: 'rating' as const, sample: t.slice(0, 40), css: stableClass(el) };
      if (el.tagName === 'IMG' || src) return { name: 'image', kind: 'image' as const, sample: src.slice(0, 80), attr: 'src', css: stableClass(el) };
      if (el.tagName === 'A' && href) return { name: 'link', kind: 'link' as const, sample: href.slice(0, 80), attr: 'href', css: stableClass(el) };
      if (/name|title/i.test(el.className) && t.length >= 3) return { name: 'title', kind: 'title' as const, sample: t.slice(0, 60), css: stableClass(el) };
      return null;
    };
    for (const el of leaves) {
      const c = classify(el);
      if (c && !fields[c.name]) fields[c.name] = { css: c.css, attr: c.attr, kind: c.kind, sample: c.sample };
    }
    if (!fields.title) {
      const t = norm(first.querySelector('h1,h2,h3,h4,a')?.textContent).slice(0, 60);
      if (t) fields.title = { css: stableClass(first.querySelector('h1,h2,h3,h4,a') || first), kind: 'title', sample: t };
    }
    const sampleItems = s.items.slice(0, 2).map((it) => {
      const row: Record<string, string> = {};
      for (const [k, f] of Object.entries(fields)) {
        const el = f.css ? it.querySelector(f.css) : it;
        row[k] = f.attr && f.attr !== 'text' ? el?.getAttribute(f.attr) || '' : norm(el?.textContent).slice(0, 80);
      }
      return row;
    });
    const link = first.querySelector('a[href]') as HTMLAnchorElement | null;
    lists.push({
      root: locatorFor(s.root),
      item: s.itemSel,
      count: s.items.length,
      fields,
      sampleItems,
      itemLinkTemplate: link ? link.getAttribute('href') || undefined : undefined,
    });
  }

  const params = [...new URLSearchParams(location.search).keys()];
  const storageKeys: string[] = [];
  try {
    for (let i = 0; i < localStorage.length && storageKeys.length < 12; i++) {
      const k = localStorage.key(i);
      if (k) storageKeys.push(k);
    }
  } catch {}

  const links: ExtractedPage['links'] = [];
  const seenH = new Set<string>();
  for (const a of document.querySelectorAll('a[href]')) {
    const href = (a as HTMLAnchorElement).href;
    if (!href || seenH.has(href)) continue;
    seenH.add(href);
    const text = norm(a.textContent).slice(0, 60);
    const blob = (text + ' ' + href).toLowerCase();
    let score = 0;
    if (a.closest('nav, header')) score += 3;
    if (PLUSK.test(blob)) score += 3;
    if (MINUSK.test(blob)) score -= 5;
    links.push({ href, text, score });
  }

  return {
    title: document.title,
    headings,
    textExcerpt,
    auth,
    forms,
    controls,
    lists,
    urlState: { params },
    storageKeys,
    links,
  };
}

export function dismissCookieBanner(): boolean {
  const re = /^(accept( all)?|agree|allow( all)?|got it|ok|i agree|continue|consent)$/i;
  for (const el of document.querySelectorAll('button, [role="button"], a')) {
    const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
    if (re.test(t)) {
      (el as HTMLElement).click();
      return true;
    }
  }
  return false;
}
