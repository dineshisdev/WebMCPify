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

export const WhereZ = z.object({
  field: z.string().max(40),
  op: z.enum(['eq', 'neq', 'lt', 'lte', 'gt', 'gte', 'contains', 'in']),
  value: z.string().max(200),
});

const STEP_OPS = [
  'ensurePage',
  'navigate',
  'fill',
  'type',
  'press',
  'click',
  'select',
  'check',
  'waitFor',
  'waitForDomIdle',
  'waitForUrl',
  'assert',
  'extractText',
  'extractFields',
  'extractList',
  'fetchJson',
  'readStorage',
  'filterList',
  'setUrlState',
  'confirm',
  'return',
] as const;

/**
 * Flat step object (no discriminatedUnion). OpenAI structured outputs reject
 * nested `oneOf`, which is what z.discriminatedUnion compiles to.
 * Unused fields must be null. `toStep` in postprocess drops incomplete ops.
 */
export const StepZ = z.object({
  op: z.enum(STEP_OPS).describe('Recipe opcode; set unused fields to null'),
  when: z.string().nullable().describe("Template path such as 'input.size'; step skipped when empty"),
  optional: z.boolean().nullable().describe('Swallow TARGET_NOT_FOUND for this step'),
  errorHint: z.string().max(200).nullable().describe('Actionable hint appended to errors from this step'),
  urlPattern: z.string().max(200).nullable().describe('ensurePage: regex over the pathname'),
  path: z.string().max(300).nullable().describe('ensurePage / navigate / setUrlState path'),
  waitForCss: z.string().max(200).nullable().describe('ensurePage: CSS to wait for after pushState'),
  target: LocatorZ.nullable().describe('Locator for fill/type/press/click/select/check/waitFor/assert/extractText'),
  value: z.string().max(300).nullable().describe('fill / type / select value; may contain {{templates}}'),
  pressEnter: z.boolean().nullable(),
  key: z.enum(['Enter', 'Escape', 'Tab', 'ArrowDown']).nullable().describe('press key'),
  checked: z.boolean().nullable(),
  state: z.enum(['visible', 'hidden', 'attached', 'detached', 'exists', 'notExists']).nullable(),
  timeoutMs: z.number().int().nullable(),
  pattern: z.string().max(200).nullable().describe('waitForUrl regex'),
  message: z.string().max(200).nullable().describe('assert / fail message'),
  attr: z.string().max(40).nullable(),
  regex: z.string().max(80).nullable(),
  type: z.enum(['string', 'number', 'boolean']).nullable(),
  as: z.string().max(30).nullable().describe('Variable name to store extract/fetch/filter results'),
  rootCss: z.string().max(200).nullable(),
  fields: z.array(FieldZ).nullable(),
  item: z.string().max(200).nullable().describe('extractList: CSS for each item relative to root'),
  limit: z.number().int().nullable(),
  url: z.string().max(300).nullable().describe('fetchJson URL'),
  method: z.enum(['GET', 'POST']).nullable(),
  bodyJson: z.string().max(1000).nullable(),
  pick: z.string().max(60).nullable().describe('fetchJson: dotted path into the JSON body'),
  pickFields: z.array(z.string().max(40)).nullable().describe('filterList: field names to keep'),
  storageKey: z.string().max(60).nullable().describe('readStorage key'),
  parseJson: z.boolean().nullable(),
  from: z.string().max(60).nullable().describe("filterList: template path of a list, e.g. 'vars.catalog'"),
  where: z.array(WhereZ).nullable(),
  sortBy: z.string().max(40).nullable(),
  order: z.enum(['asc', 'desc']).nullable(),
  paramsJson: z.string().max(500).nullable().describe('setUrlState query params as JSON object string'),
  title: z.string().max(80).nullable(),
  details: z.array(z.string().max(120)).nullable(),
  valueJson: z.string().max(1500).nullable().describe('return: JSON object; strings may contain {{templates}}'),
  ifEmptyVar: z.string().max(30).nullable(),
  ifEmptyMessage: z.string().max(200).nullable(),
});

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
