import { z } from 'zod';

export const LocatorZ = z.object({
  css: z.string().max(200).describe('CSS selector copied from the capability model'),
  text: z.string().max(40).nullable().describe('Optional visible-text filter (substring, case-insensitive)'),
  nth: z.number().int().nullable().describe('Index among matches, default 0'),
});

export const FieldZ = z.object({
  name: z.string().max(30),
  css: z.string().max(200).nullable().describe('CSS relative to the item/root; null = the item itself'),
  attr: z.string().max(40).nullable().describe("'text' (default), 'href', 'src', 'value' or an attribute name like data-id"),
  regex: z.string().max(80).nullable().describe('Regex whose group 1 is extracted'),
  type: z.enum(['string', 'number', 'boolean']).nullable(),
});

const base = {
  when: z.string().nullable().describe("Template path such as 'input.size'; step skipped when empty"),
  optional: z.boolean().nullable().describe('Swallow TARGET_NOT_FOUND for this step'),
  errorHint: z.string().max(200).nullable().describe('Actionable hint appended to errors from this step'),
};

export const StepZ = z.discriminatedUnion('op', [
  z.object({ op: z.literal('ensurePage'), ...base, urlPattern: z.string().max(200), path: z.string().max(300), waitForCss: z.string().max(200).nullable() }),
  z.object({ op: z.literal('navigate'), ...base, path: z.string().max(300) }),
  z.object({ op: z.literal('fill'), ...base, target: LocatorZ, value: z.string().max(300) }),
  z.object({ op: z.literal('type'), ...base, target: LocatorZ, value: z.string().max(300), pressEnter: z.boolean().nullable() }),
  z.object({ op: z.literal('press'), ...base, key: z.enum(['Enter', 'Escape', 'Tab', 'ArrowDown']), target: LocatorZ.nullable() }),
  z.object({ op: z.literal('click'), ...base, target: LocatorZ }),
  z.object({ op: z.literal('select'), ...base, target: LocatorZ, value: z.string().max(200) }),
  z.object({ op: z.literal('check'), ...base, target: LocatorZ, checked: z.boolean() }),
  z.object({ op: z.literal('waitFor'), ...base, target: LocatorZ, state: z.enum(['visible', 'hidden', 'attached', 'detached']), timeoutMs: z.number().int().nullable() }),
  z.object({ op: z.literal('waitForDomIdle'), ...base }),
  z.object({ op: z.literal('waitForUrl'), ...base, pattern: z.string().max(200) }),
  z.object({ op: z.literal('assert'), ...base, target: LocatorZ, state: z.enum(['exists', 'notExists']), message: z.string().max(200) }),
  z.object({ op: z.literal('extractText'), ...base, target: LocatorZ, attr: z.string().max(40).nullable(), regex: z.string().max(80).nullable(), type: z.enum(['string', 'number']).nullable(), as: z.string().max(30) }),
  z.object({ op: z.literal('extractFields'), ...base, rootCss: z.string().max(200).nullable(), fields: z.array(FieldZ).min(1).max(12), as: z.string().max(30) }),
  z.object({ op: z.literal('extractList'), ...base, rootCss: z.string().max(200).nullable(), item: z.string().max(200), fields: z.array(FieldZ).min(1).max(10), limit: z.number().int().nullable(), as: z.string().max(30) }),
  z.object({ op: z.literal('fetchJson'), ...base, url: z.string().max(300), method: z.enum(['GET', 'POST']).nullable(), bodyJson: z.string().max(1000).nullable(), pick: z.string().max(60).nullable(), as: z.string().max(30) }),
  z.object({ op: z.literal('readStorage'), ...base, key: z.string().max(60), parseJson: z.boolean().nullable(), as: z.string().max(30) }),
  z.object({
    op: z.literal('filterList'), ...base,
    from: z.string().max(60).describe("Template path of a list, e.g. 'vars.catalog'"),
    where: z.array(z.object({ field: z.string().max(40), op: z.enum(['eq', 'neq', 'lt', 'lte', 'gt', 'gte', 'contains', 'in']), value: z.string().max(200) })).nullable(),
    sortBy: z.string().max(40).nullable(), order: z.enum(['asc', 'desc']).nullable(), limit: z.number().int().nullable(),
    pick: z.array(z.string().max(40)).nullable(), as: z.string().max(30),
  }),
  z.object({ op: z.literal('setUrlState'), ...base, path: z.string().max(300).nullable(), paramsJson: z.string().max(500).nullable() }),
  z.object({ op: z.literal('confirm'), ...base, title: z.string().max(80), message: z.string().max(300), details: z.array(z.string().max(120)).nullable() }),
  z.object({ op: z.literal('return'), ...base, valueJson: z.string().max(1500).describe('JSON object; strings may contain {{templates}}'), ifEmptyVar: z.string().max(30).nullable(), ifEmptyMessage: z.string().max(200).nullable() }),
]);

export const ParamZ = z.object({
  name: z.string().max(30),
  type: z.enum(['string', 'number', 'integer', 'boolean', 'array']),
  description: z.string().max(150),
  required: z.boolean(),
  enumValues: z.array(z.string().max(60)).nullable(),
  itemsType: z.enum(['string', 'number']).nullable(),
  minimum: z.number().nullable(),
  maximum: z.number().nullable(),
});

export const GeneratedToolZ = z.object({
  name: z.string().max(40),
  description: z.string().max(600),
  rationale: z.string().max(200),
  risk: z.enum(['read', 'reversible', 'sensitive']),
  scopeUrlPattern: z.string().max(200).nullable().describe('Regex over the pathname when the tool only makes sense on some pages; null = every page'),
  params: z.array(ParamZ).max(8),
  recipe: z.array(StepZ).min(1).max(14),
  samplesJson: z.array(z.string().max(500)).min(1).max(2).describe('Realistic sample inputs as JSON strings'),
});

export const GenerationZ = z.object({
  siteName: z.string().max(60),
  category: z.enum(['commerce', 'booking', 'content', 'saas', 'other']),
  tools: z.array(GeneratedToolZ).min(1).max(8),
});

export type GeneratedTool = z.infer<typeof GeneratedToolZ>;
export type Generation = z.infer<typeof GenerationZ>;
export type GeneratedStep = z.infer<typeof StepZ>;
