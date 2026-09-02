import { openai } from '@ai-sdk/openai';
import { generateObject, NoObjectGeneratedError } from 'ai';
import { fitBudget, type CapabilityModel } from '../capability';
import type { SiteCategory, ToolDef } from '../manifest';
import { finalizeTools, postprocessTool } from './postprocess';
import { buildGenerationPrompt, SYSTEM_PROMPT } from './prompts';
import { GenerationZ } from './schema';

const DEFAULT_GEN_MODEL = 'gpt-5.6-sol';
const DEFAULT_REPAIR_MODEL = 'gpt-5.6-terra';

function modelId(value: string | undefined, fallback: string): string {
  const id = (value ?? '').trim() || fallback;
  return id.startsWith('openai/') ? id.slice('openai/'.length) : id;
}

export function hasLlmCredentials(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

export function genModel() {
  return openai(modelId(process.env.GEN_MODEL, DEFAULT_GEN_MODEL));
}
export function repairModel() {
  return openai(modelId(process.env.REPAIR_MODEL, DEFAULT_REPAIR_MODEL));
}

export function looksLikeCommerce(model: CapabilityModel): boolean {
  const json = JSON.stringify(model).toLowerCase();
  const priceHits = (json.match(/[₹$€£]\s?\d/g) ?? []).length;
  return priceHits >= 3 && /cart|checkout|add to (cart|bag)|buy/.test(json);
}

export interface GenerationOutcome {
  tools: ToolDef[];
  siteName: string;
  category: SiteCategory;
  warnings: string[];
  unknownLocators: Record<string, string[]>;
  modelId: string;
}

export async function generateTools(model: CapabilityModel): Promise<GenerationOutcome> {
  if (!hasLlmCredentials()) {
    throw new Error('OPENAI_API_KEY is not set — add it to .env.local (or the host env) to generate tools.');
  }
  const fitted = fitBudget(model, 25_000);
  const isCommerce = looksLikeCommerce(fitted);
  const prompt = buildGenerationPrompt(JSON.stringify(fitted), isCommerce);
  const llm = genModel();

  let lastError = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { object } = await generateObject({
        model: llm,
        schema: GenerationZ,
        schemaName: 'webmcp_tool_generation',
        system: SYSTEM_PROMPT,
        prompt: attempt === 0 ? prompt : `${prompt}\n\nYour previous output was rejected: ${lastError.slice(0, 800)}\nFix it and output the full result again.`,
      });
      const warnings: string[] = [];
      const unknownLocators: Record<string, string[]> = {};
      const tools = object.tools.map((g) => {
        const r = postprocessTool(g, model, 'generated');
        for (const w of r.warnings) warnings.push(`${r.tool.name}: ${w}`);
        if (r.unknownLocators.length) unknownLocators[r.tool.name] = r.unknownLocators;
        return r.tool;
      });
      return { tools: finalizeTools(tools), siteName: object.siteName, category: object.category, warnings, unknownLocators, modelId: llm.modelId };
    } catch (e) {
      lastError = NoObjectGeneratedError.isInstance(e) ? `${e.message} ${e.cause ?? ''}` : String((e as Error)?.message ?? e);
      if (attempt === 1) throw new Error(`tool generation failed: ${lastError}`);
    }
  }
  throw new Error('unreachable');
}
