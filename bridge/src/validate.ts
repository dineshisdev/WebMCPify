import type { JsonSchemaObject, JsonSchemaProperty } from '../../lib/manifest';
import { RecipeError } from './errors';

function typeOf(v: unknown): string {
  return v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v;
}

function coerce(v: unknown, spec: JsonSchemaProperty): unknown {
  if (typeof v === 'string') {
    const s = v.trim();
    if ((spec.type === 'number' || spec.type === 'integer') && s !== '' && !isNaN(Number(s))) return Number(s);
    if (spec.type === 'boolean' && /^(true|false)$/i.test(s)) return s.toLowerCase() === 'true';
    if (spec.type === 'array') {
      try {
        const parsed: unknown = JSON.parse(s);
        if (Array.isArray(parsed)) return parsed;
      } catch {}
      return s === '' ? [] : s.split(',').map((x) => x.trim());
    }
  }
  if (spec.type === 'array' && Array.isArray(v) && spec.items?.type === 'number') {
    return v.map((x) => (typeof x === 'string' && x.trim() !== '' && !isNaN(Number(x)) ? Number(x) : x));
  }
  return v;
}

export function validateInput(schema: JsonSchemaObject | undefined, input: unknown): Record<string, unknown> {
  const raw = input && typeof input === 'object' && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
  const problems: string[] = [];
  const out: Record<string, unknown> = {};
  const props = schema?.properties ?? {};

  for (const name of schema?.required ?? []) {
    const v = raw[name];
    if (v === undefined || v === null || v === '') problems.push(`"${name}" is required`);
  }

  for (const name of Object.keys(props)) {
    const spec = props[name];
    let v = raw[name];
    if (v === undefined || v === null || v === '') {
      if (spec.default !== undefined) out[name] = spec.default;
      continue;
    }
    v = coerce(v, spec);
    const t = typeOf(v);
    switch (spec.type) {
      case 'string':
        if (t !== 'string') v = typeof v === 'number' || typeof v === 'boolean' ? String(v) : (problems.push(`"${name}" must be a string (got ${t})`), v);
        break;
      case 'number':
        if (t !== 'number' || !isFinite(v as number)) problems.push(`"${name}" must be a number (got ${t})`);
        break;
      case 'integer':
        if (t !== 'number' || !Number.isInteger(v)) problems.push(`"${name}" must be an integer (got ${t === 'number' ? v : t})`);
        break;
      case 'boolean':
        if (t !== 'boolean') problems.push(`"${name}" must be true or false (got ${t})`);
        break;
      case 'array': {
        if (t !== 'array') {
          problems.push(`"${name}" must be an array (got ${t})`);
          break;
        }
        const itemType = spec.items?.type;
        if (itemType) {
          const bad = (v as unknown[]).findIndex((x) => typeOf(x) !== itemType);
          if (bad !== -1) problems.push(`"${name}[${bad}]" must be a ${itemType}`);
        }
        break;
      }
    }
    if (spec.enum && typeof v === 'string') {
      const match = spec.enum.find((e) => e === v) ?? spec.enum.find((e) => e.toLowerCase() === (v as string).toLowerCase());
      if (match === undefined) problems.push(`"${name}" must be one of: ${spec.enum.join(', ')}`);
      else v = match;
    }
    if (typeof v === 'number') {
      if (spec.minimum !== undefined && v < spec.minimum) problems.push(`"${name}" must be >= ${spec.minimum}`);
      if (spec.maximum !== undefined && v > spec.maximum) problems.push(`"${name}" must be <= ${spec.maximum}`);
    }
    out[name] = v;
  }

  if (schema?.additionalProperties === false) {
    const extra = Object.keys(raw).filter((k) => !(k in props));
    if (extra.length) problems.push(`unknown parameter(s): ${extra.join(', ')}`);
  } else {
    for (const k of Object.keys(raw)) if (!(k in props) && out[k] === undefined) out[k] = raw[k];
  }

  if (problems.length) throw new RecipeError('VALIDATION', `Invalid input: ${problems.join('; ')}`);
  return out;
}
