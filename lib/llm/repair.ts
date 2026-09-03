import { generateObject } from 'ai';
import type { PageModel } from '../capability';
import type { CapabilityModel } from '../capability';
import type { ToolDef } from '../manifest';
import { repairModel } from './generate';
import { postprocessTool } from './postprocess';
import { DSL_CHEATSHEET, REPAIR_SYSTEM_PROMPT } from './prompts';
import { OneToolZ } from './schema';

export interface RepairInput {
  tool: ToolDef;
  error: string;
  failedStep?: number;
  pageModelAtFailure?: Pick<PageModel, 'url' | 'forms' | 'controls' | 'lists'>;
  model: CapabilityModel;
}

export async function repairTool(input: RepairInput): Promise<ToolDef> {
  const { object } = await generateObject({
    model: repairModel(),
    schema: OneToolZ,
    schemaName: 'webmcp_tool_repair',
    system: REPAIR_SYSTEM_PROMPT,
    maxOutputTokens: 2200,
    providerOptions: { openai: { reasoningEffort: 'minimal', textVerbosity: 'low', strictJsonSchema: false } },
    prompt: [
      'FAILED TOOL (storage shape):',
      JSON.stringify(input.tool),
      '',
      `ERROR: ${input.error}`,
      input.failedStep !== undefined ? `FAILED STEP INDEX: ${input.failedStep}` : '',
      '',
      'PAGE MODEL AT FAILURE (only selectors from here or from the original model are allowed):',
      JSON.stringify(input.pageModelAtFailure ?? {}).slice(0, 12_000),
      '',
      DSL_CHEATSHEET,
      '',
      'Output the corrected tool in the generation shape (params[], fields[], valueJson, samplesJson).',
    ].join('\n'),
  });
  const merged: CapabilityModel = input.pageModelAtFailure
    ? { ...input.model, pages: [...input.model.pages, { ...input.pageModelAtFailure, urlTemplate: '', title: '', headings: [], textExcerpt: '', auth: false, region: 'other', urlState: { params: [], changedByProbe: false }, storageKeys: [], probes: [] }] }
    : input.model;
  const r = postprocessTool(object, merged, 'repaired');
  return { ...r.tool, name: input.tool.name, risk: input.tool.risk === 'sensitive' ? 'sensitive' : r.tool.risk };
}
