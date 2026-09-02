import type { Locator } from './manifest';

export type PageRegion = 'home' | 'listing' | 'detail' | 'cart' | 'checkout' | 'form' | 'other';
export type ControlRegion = 'header' | 'nav' | 'main' | 'footer' | 'aside';

export interface FieldModel {
  locator: Locator;
  name?: string;
  label?: string;
  type: string;
  placeholder?: string;
  required: boolean;
  options?: { value: string; label: string }[];
  currentValue?: string;
}

export interface FormModel {
  locator: Locator;
  action?: string;
  method?: string;
  purpose: 'search' | 'filter' | 'login' | 'checkout' | 'contact' | 'newsletter' | 'unknown';
  fields: FieldModel[];
  submit?: { locator: Locator; text: string };
}

export interface ControlModel {
  locator: Locator;
  kind: 'button' | 'link' | 'select' | 'toggle' | 'input';
  text: string;
  href?: string;
  region: ControlRegion;
  riskHint?: 'sensitive';
}

export interface ListFieldModel {
  css?: string;
  attr?: string;
  kind: 'title' | 'price' | 'rating' | 'image' | 'link' | 'id' | 'text';
  sample: string;
}

export interface ListModel {
  root: Locator;
  item: string;
  count: number;
  fields: Record<string, ListFieldModel>;
  sampleItems: Record<string, string>[];
  itemLinkTemplate?: string;
}

export interface EndpointModel {
  method: string;
  urlTemplate: string;
  queryParams: string[];
  contentType: string;
  status: number;
  responseShape: string;
  triggeredBy?: string;
}

export interface ProbeResult {
  kind: 'search' | 'select' | 'linkClick';
  target: Locator;
  value: string;
  effects: {
    urlAfter: string;
    pushState: boolean;
    fullLoad: boolean;
    listCountBefore?: number;
    listCountAfter?: number;
    endpointsHit: string[];
  };
}

export interface PageModel {
  url: string;
  urlTemplate: string;
  title: string;
  headings: string[];
  textExcerpt: string;
  auth: boolean;
  region: PageRegion;
  forms: FormModel[];
  controls: ControlModel[];
  lists: ListModel[];
  urlState: { params: string[]; changedByProbe: boolean };
  storageKeys: string[];
  probes: ProbeResult[];
  screenshotRef?: string;
}

export interface CapabilityModel {
  version: 1;
  url: string;
  origin: string;
  siteTitle: string;
  spa: boolean;
  crawledAt: string;
  pages: PageModel[];
  endpoints: EndpointModel[];
  boundaries: { auth: string[]; skipped: string[] };
  stats: { pagesVisited: number; controls: number; forms: number; lists: number; endpoints: number };
}

export function estimateTokens(value: unknown): number {
  return Math.ceil(JSON.stringify(value).length / 4);
}

const REGION_PRIORITY: PageRegion[] = ['home', 'listing', 'detail', 'cart', 'checkout', 'form', 'other'];

export function fitBudget(model: CapabilityModel, maxTokens = 25_000): CapabilityModel {
  const m: CapabilityModel = JSON.parse(JSON.stringify(model));
  const over = () => estimateTokens(m) > maxTokens;
  if (!over()) return m;

  for (const p of m.pages) p.controls = p.controls.filter((c) => c.region !== 'footer');
  if (!over()) return m;

  for (const p of m.pages) p.textExcerpt = p.textExcerpt.slice(0, 150);
  if (!over()) return m;

  for (const p of m.pages) for (const l of p.lists) l.sampleItems = l.sampleItems.slice(0, 1);
  if (!over()) return m;

  for (const e of m.endpoints) e.responseShape = e.responseShape.slice(0, 300);
  if (!over()) return m;

  m.pages.sort((a, b) => REGION_PRIORITY.indexOf(a.region) - REGION_PRIORITY.indexOf(b.region));
  while (m.pages.length > 4 && over()) m.pages.pop();
  while (over() && m.pages.length > 1) m.pages.pop();
  return m;
}
