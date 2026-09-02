import type { ToolDef } from '../../lib/manifest';

export interface PlanMemory {
  lastIds: string[];
  lastQuery: string;
}

export type PlanStep = { name: string; input: Record<string, unknown>; note: string };
export type Plan = { steps: PlanStep[] } | { say: string };

const SIZE_RE = /\b(?:uk\s*)?([6-9]|1[0-2])\b/i;
const PRICE_RE = /(?:under|below|less than|<)\s*₹?\s*([\d,]+)\s*(k)?/i;
const ID_RE = /sn-\d+/gi;
const CATS = ['running', 'lifestyle', 'basketball', 'trail'] as const;
export const TOP3 = '__TOP3__';
export const LAST = '__LAST__';

function has(tools: ToolDef[], name: string): boolean {
  return tools.some((t) => t.name === name && t.enabled);
}

function one(name: string, input: Record<string, unknown>, note: string): Plan {
  return { steps: [{ name, input, note }] };
}

export function resolveInput(input: Record<string, unknown>, memory: PlanMemory): Record<string, unknown> {
  const out = { ...input };
  if (out.product_ids === TOP3) out.product_ids = memory.lastIds.slice(0, 3);
  if (out.product_id === LAST) out.product_id = memory.lastIds[0];
  return out;
}

function searchQuery(goal: string, g: string, cat: string | undefined): string {
  let q = goal.replace(/^(please\s+)?(search( for)?|find|look for|show me)\s+/i, '').trim();
  q = q.replace(/,?\s*(compare|add (the )?(best|cheapest|it|that).*)/i, '').trim();
  q = q.replace(/\s+under\s+₹?\s*[\d,]+.*/i, '').trim();
  q = q.replace(/\s+size\s+(uk\s*)?\d+.*/i, '').trim();
  q = q.replace(/\b(shoes?|sneakers|trainers|kicks)\b/gi, '').trim();
  if (!q) q = cat || 'black';
  return q;
}

export function planTurn(goal: string, tools: ToolDef[], memory: PlanMemory): Plan {
  const g = goal.toLowerCase().trim();
  if (!g) return { say: 'Tell me what to do — e.g. “find black sneakers under ₹10k”.' };
  const size = SIZE_RE.exec(g)?.[1];
  const priceMatch = PRICE_RE.exec(g);
  const maxPrice = priceMatch ? Number(priceMatch[1].replace(/,/g, '')) * (priceMatch[2] ? 1000 : 1) : undefined;
  const idsInText = goal.match(ID_RE) ?? [];
  const cat = CATS.find((c) => g.includes(c));
  const wantsCompare = /compare/.test(g);
  const wantsAdd = /add .{0,40}\bcart\b|add to bag/.test(g);
  const wantsFind = /search|find|look|show me|black|sneaker|shoe/.test(g);
  const compound = wantsFind && (wantsCompare || wantsAdd || maxPrice !== undefined || (size && /size/.test(g)));

  if (compound && has(tools, 'search_products')) {
    const steps: PlanStep[] = [];
    const q = searchQuery(goal, g, cat);
    steps.push({ name: 'search_products', input: { query: q }, note: `Searching “${q}”` });
    if (has(tools, 'filter_products') && (maxPrice || size || cat)) {
      const input: Record<string, unknown> = {};
      if (cat) input.category = cat;
      if (maxPrice) input.max_price = maxPrice;
      if (size) input.size = size;
      if (/best|rating/.test(g)) input.sort = 'rating';
      else if (/cheap/.test(g)) input.sort = 'price-asc';
      steps.push({ name: 'filter_products', input, note: 'Applying filters' });
    }
    if (wantsCompare && has(tools, 'compare_products')) {
      steps.push({ name: 'compare_products', input: { product_ids: TOP3 }, note: 'Comparing the top results' });
    }
    if (wantsAdd && has(tools, 'add_to_cart')) {
      steps.push({
        name: 'add_to_cart',
        input: { product_id: LAST, size: size || '9', quantity: 1 },
        note: `Adding the top match (UK ${size || '9'})`,
      });
    }
    return { steps };
  }

  if (has(tools, 'place_order') && /place (the |this )?order|buy now|complete (the )?purchase/.test(g)) {
    const sample = tools.find((t) => t.name === 'place_order')?.samples[0] ?? {};
    return one('place_order', { ...sample } as Record<string, unknown>, 'Placing the order (will ask you to confirm)');
  }
  if (has(tools, 'proceed_to_checkout') && /checkout|check out|go to payment/.test(g)) {
    return one('proceed_to_checkout', {}, 'Opening checkout');
  }
  if (has(tools, 'get_cart') && /\bcart\b/.test(g) && !/add/.test(g)) {
    return one('get_cart', {}, 'Reading the cart');
  }
  if (has(tools, 'add_to_cart') && /add (it |that |this )?(to )?(the )?cart|add to bag/.test(g)) {
    const id = idsInText[0] || memory.lastIds[0];
    if (!id) return { say: 'Search first, or give a product id like sn-014.' };
    return one('add_to_cart', { product_id: id, size: size || '9', quantity: 1 }, `Adding ${id} (UK ${size || '9'})`);
  }
  if (has(tools, 'compare_products') && /compare/.test(g)) {
    const use = (idsInText.length ? idsInText : memory.lastIds).slice(0, 4);
    if (use.length < 2) return { say: 'I need at least two product ids. Search first, then say “compare the top 3”.' };
    return one('compare_products', { product_ids: use }, `Comparing ${use.join(', ')}`);
  }
  if (has(tools, 'get_product') && idsInText[0] && /detail|get_product|open|show/.test(g)) {
    return one('get_product', { product_id: idsInText[0] }, `Opening ${idsInText[0]}`);
  }
  if (has(tools, 'filter_products') && (cat || maxPrice || (size && /size/.test(g))) && !/search|find|look/.test(g)) {
    const input: Record<string, unknown> = {};
    if (cat) input.category = cat;
    if (maxPrice) input.max_price = maxPrice;
    if (size) input.size = size;
    if (/rating|best/.test(g)) input.sort = 'rating';
    return one('filter_products', input, 'Filtering the catalog');
  }
  if (has(tools, 'search_products')) {
    const q = searchQuery(goal, g, cat);
    return one('search_products', { query: q }, `Searching “${q}”`);
  }
  const first = tools.find((t) => t.enabled);
  if (!first) return { say: 'No tools are enabled on this page.' };
  return one(first.name, (first.samples[0] ?? {}) as Record<string, unknown>, `Running ${first.name}`);
}

export function rememberFromOutput(text: string, memory: PlanMemory): void {
  const ids = text.match(/sn-\d+/g);
  if (ids && ids.length) memory.lastIds = [...new Set(ids)].slice(0, 8);
}
