'use client';
import { useRouter } from 'next/navigation';
import { useWebMCP } from 'use-webmcp-tool';
import type { SiteManifest } from '@/lib/manifest';

export function AgentTools({ siteId, manifest, agentUrl }: { siteId?: string; manifest?: SiteManifest; agentUrl?: string }) {
  const router = useRouter();

  useWebMCP({
    name: 'analyze_site',
    description: 'Start making a website agent-ready: WebMCPify crawls the URL, generates WebMCP tools and returns the dashboard link. Use when the user gives a website URL.',
    inputSchema: { type: 'object', properties: { url: { type: 'string', description: 'Full http(s) URL of the site' } }, required: ['url'] },
    annotations: { readOnlyHint: false },
    async execute({ url }: { url: string }) {
      const res = await fetch('/api/sites', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'failed to start');
      router.push(`/sites/${data.id}`);
      return { site_id: data.id, status: data.status, dashboard: `${location.origin}/sites/${data.id}` };
    },
  });

  useWebMCP({
    name: 'list_generated_tools',
    description: 'List the WebMCP tools generated for the site shown on this dashboard, with risk level and verification status.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
    enabled: !!manifest,
    async execute() {
      return {
        site: manifest?.name,
        agent_ready_url: agentUrl,
        tools: (manifest?.tools ?? []).map((t) => ({ name: t.name, risk: t.risk, verified: t.verification.status, enabled: t.enabled, description: t.description.slice(0, 120) })),
      };
    },
  });

  useWebMCP({
    name: 'get_agent_ready_url',
    description: 'Return the agent-ready URL (proxy) and the one-line install snippet for the current site.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
    enabled: !!manifest && !!siteId,
    async execute() {
      return { agent_ready_url: agentUrl, snippet: `<script src="${location.origin}/w/${siteId}.js"></script>` };
    },
  });

  return null;
}
