import { generateObject } from 'ai';
import { z } from 'zod';
import { genModel, hasLlmCredentials } from '@/lib/llm/generate';

export const maxDuration = 30;

const BodyZ = z.object({
  goal: z.string().min(1).max(500),
  tools: z
    .array(
      z.object({
        name: z.string(),
        description: z.string(),
        inputSchema: z.any(),
      }),
    )
    .max(12),
});

const PlanZ = z.object({
  tool: z.string().nullable(),
  inputJson: z.string().max(800).nullable(),
  say: z.string().max(400),
});

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function POST(request: Request) {
  if (!hasLlmCredentials()) {
    return Response.json({ error: 'no_llm' }, { status: 501, headers: CORS });
  }
  let body: z.infer<typeof BodyZ>;
  try {
    body = BodyZ.parse(await request.json());
  } catch {
    return Response.json({ error: 'bad body' }, { status: 400, headers: CORS });
  }
  try {
    const { object } = await generateObject({
      model: genModel(),
      schema: PlanZ,
      schemaName: 'webmcp_agent_turn',
      system:
        'You pick ONE WebMCP tool to run next for the user\'s goal. Tools execute on the live page. Prefer read tools first. If the goal is done or you need a question, set tool=null and put the message in say. Never invent a tool name.',
      prompt: `GOAL: ${body.goal}\n\nTOOLS:\n${body.tools.map((t) => `${t.name}: ${t.description}\n schema: ${JSON.stringify(t.inputSchema)}`).join('\n\n')}`,
    });
    const name = object.tool && body.tools.some((t) => t.name === object.tool) ? object.tool : null;
    let input: Record<string, unknown> = {};
    if (object.inputJson) {
      try {
        const parsed: unknown = JSON.parse(object.inputJson);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) input = parsed as Record<string, unknown>;
      } catch {}
    }
    return Response.json({ tool: name, input, say: object.say }, { headers: CORS });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502, headers: CORS });
  }
}
