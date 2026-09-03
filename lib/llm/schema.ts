import { jsonSchema, type Schema } from 'ai';
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

const base = {
  when: z.string().nullable().describe("Template path such as 'input.size'; step is skipped when it resolves empty"),
  optional: z.boolean().nullable().describe('Swallow TARGET_NOT_FOUND for this step'),
  errorHint: z.string().max(200).nullable().describe('Actionable hint appended to errors from this step'),
};

const step = <S extends string, T extends z.ZodRawShape>(op: S, shape: T) =>
  z.object({ op: z.literal(op), ...base, ...shape });

export const StepZ = z.discriminatedUnion('op', [
  step('ensurePage', {
    urlPattern: z.string().max(200).describe('Regex over the pathname'),
    path: z.string().max(300),
    waitForCss: z.string().max(200).nullable().describe('CSS to wait for after pushState'),
  }),
  step('navigate', { path: z.string().max(300) }),
  step('fill', { target: LocatorZ, value: z.string().max(300).describe('May contain {{templates}}') }),
  step('type', { target: LocatorZ, value: z.string().max(300), pressEnter: z.boolean().nullable() }),
  step('press', { key: z.enum(['Enter', 'Escape', 'Tab', 'ArrowDown']), target: LocatorZ.nullable() }),
  step('click', { target: LocatorZ }),
  step('select', { target: LocatorZ, value: z.string().max(200) }),
  step('check', { target: LocatorZ, checked: z.boolean() }),
  step('waitFor', {
    target: LocatorZ,
    state: z.enum(['visible', 'hidden', 'attached', 'detached']),
    timeoutMs: z.number().int().nullable(),
  }),
  step('waitForDomIdle', {}),
  step('waitForUrl', { pattern: z.string().max(200) }),
  step('assert', { target: LocatorZ, state: z.enum(['exists', 'notExists']), message: z.string().max(200) }),
  step('extractText', {
    target: LocatorZ,
    attr: z.string().max(40).nullable(),
    regex: z.string().max(80).nullable(),
    type: z.enum(['string', 'number']).nullable(),
    as: z.string().max(30),
  }),
  step('extractFields', { rootCss: z.string().max(200).nullable(), fields: z.array(FieldZ), as: z.string().max(30) }),
  step('extractList', {
    rootCss: z.string().max(200).nullable(),
    item: z.string().max(200).describe('CSS for each item, relative to root'),
    fields: z.array(FieldZ),
    limit: z.number().int().nullable(),
    as: z.string().max(30),
  }),
  step('fetchJson', {
    url: z.string().max(300),
    method: z.enum(['GET', 'POST']).nullable(),
    bodyJson: z.string().max(1000).nullable(),
    pick: z.string().max(60).nullable().describe('Dotted path into the JSON body'),
    as: z.string().max(30),
  }),
  step('readStorage', { storageKey: z.string().max(60), parseJson: z.boolean().nullable(), as: z.string().max(30) }),
  step('filterList', {
    from: z.string().max(60).describe("Template path of a list, e.g. 'vars.catalog'"),
    where: z.array(WhereZ).nullable(),
    sortBy: z.string().max(40).nullable(),
    order: z.enum(['asc', 'desc']).nullable(),
    limit: z.number().int().nullable(),
    pickFields: z.array(z.string().max(40)).nullable(),
    as: z.string().max(30),
  }),
  step('setUrlState', {
    path: z.string().max(300).nullable(),
    paramsJson: z.string().max(500).nullable().describe('Query params as a JSON object string'),
  }),
  step('confirm', { title: z.string().max(80), message: z.string().max(200), details: z.array(z.string().max(120)).nullable() }),
  step('return', {
    valueJson: z.string().max(1500).describe('JSON object; strings may contain {{templates}}'),
    ifEmptyVar: z.string().max(30).nullable(),
    ifEmptyMessage: z.string().max(200).nullable(),
  }),
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

export const ToolPlanZ = z.object({
  siteName: z.string().max(60),
  category: z.enum(['commerce', 'booking', 'content', 'saas', 'other']),
  tools: z.array(
    z.object({
      name: z.string().max(40),
      description: z.string().max(600),
      risk: z.enum(['read', 'reversible', 'sensitive']),
    }),
  ).min(1).max(5),
});

export const OneToolZ = GeneratedToolZ.extend({
  recipe: z.array(StepZ).min(1).max(8),
});

export type GeneratedTool = z.infer<typeof GeneratedToolZ>;
export type Generation = z.infer<typeof GenerationZ>;
export type GeneratedStep = z.infer<typeof StepZ>;

const UNSUPPORTED = ['maxLength', 'minLength', 'pattern', 'format', 'minItems', 'maxItems', 'minimum', 'maximum', 'multipleOf', 'default'];

function toStrictNode(node: unknown): void {
  if (!node || typeof node !== 'object') return;
  const n = node as Record<string, unknown>;
  for (const k of UNSUPPORTED) delete n[k];
  if (Array.isArray(n.oneOf)) {
    n.anyOf = n.oneOf;
    delete n.oneOf;
  }
  if (n.type === 'object' && n.properties && typeof n.properties === 'object') {
    const props = n.properties as Record<string, unknown>;
    n.required = Object.keys(props);
    n.additionalProperties = false;
    for (const v of Object.values(props)) toStrictNode(v);
  }
  for (const key of ['items', 'anyOf', 'oneOf', 'allOf', 'not']) {
    const v = n[key];
    if (Array.isArray(v)) v.forEach(toStrictNode);
    else if (v) toStrictNode(v);
  }
}

export function strictWire<T>(schema: z.ZodType<T>): Schema<T> {
  const js = z.toJSONSchema(schema, { target: 'draft-2020-12', io: 'output' }) as Record<string, unknown>;
  toStrictNode(js);
  return jsonSchema<T>(js as never, {
    validate: (value) => {
      const r = schema.safeParse(value);
      return r.success ? { success: true, value: r.data } : { success: false, error: r.error };
    },
  });
}

export const OneToolWire = strictWire(OneToolZ);
export const ToolPlanWire = strictWire(ToolPlanZ);
export const GenerationWire = strictWire(GenerationZ);
