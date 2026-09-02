'use client';
import { useEffect, useRef, useState } from 'react';
import type { ToolDef } from '@/lib/manifest';
import { Card, CodeBlock, IconClock, Metric, RiskChip, StatusBadge, Switch, Tabs } from './ui';

type Panel = 'params' | 'output' | 'recipe';

export function ToolCard({ tool, siteId, onChange, readOnly = false }: { tool: ToolDef; siteId: string; onChange: (t: ToolDef) => void; readOnly?: boolean }) {
  const [desc, setDesc] = useState(tool.description);
  const [panel, setPanel] = useState<Panel>(tool.verification.sampleOutput ? 'output' : 'params');
  const [saving, setSaving] = useState(false);
  const ta = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ta.current;
    if (!el || CSS.supports('field-sizing', 'content')) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [desc]);

  async function patch(body: Record<string, unknown>) {
    if (readOnly) return;
    setSaving(true);
    try {
      await fetch(`/api/sites/${siteId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ toolName: tool.name, ...body }),
      });
    } finally {
      setSaving(false);
    }
  }

  const params = Object.entries(tool.inputSchema.properties ?? {});
  const required = tool.inputSchema.required ?? [];
  const v = tool.verification;

  return (
    <Card className="flex flex-col p-4" muted={!tool.enabled}>
      <header className="flex min-w-0 items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="truncate font-mono text-[13px] font-semibold text-fg">{tool.name}</h3>
            <RiskChip risk={tool.risk} />
            <StatusBadge status={v.status} />
          </div>
          {tool.scope && (
            <p className="mt-1 truncate font-mono text-[10.5px] text-fg-subtle" title={`Only registered on pages matching ${tool.scope.urlPattern}`}>
              scope {tool.scope.urlPattern}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="hidden text-[11px] text-fg-subtle sm:inline">{tool.enabled ? 'On' : 'Off'}</span>
          {readOnly ? null : (
          <Switch
            checked={tool.enabled}
            label={`${tool.enabled ? 'Disable' : 'Enable'} ${tool.name}`}
            onChange={(next) => {
              onChange({ ...tool, enabled: next });
              patch({ enabled: next });
            }}
          />
          )}
        </div>
      </header>

      <label className="mt-3 block">
        <span className="sr-only">Description shown to the agent for {tool.name}</span>
        <textarea
          ref={ta}
          value={desc}
          rows={3}
          maxLength={500}
          readOnly={readOnly}
          onChange={(e) => setDesc(e.target.value)}
          onBlur={() => {
            if (desc !== tool.description) {
              onChange({ ...tool, description: desc });
              patch({ description: desc });
            }
          }}
          className="field-grow w-full resize-none rounded-lg border border-transparent bg-surface-2 p-2.5 text-[13px] leading-relaxed text-fg-muted transition-colors duration-150 hover:border-border focus:border-brand focus:bg-surface focus:outline-none"
        />
      </label>

      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
        <Metric label="chars" value={`${desc.length}/500`} />
        {v.durationMs !== undefined && (
          <span className="inline-flex items-center gap-1 text-[11px] text-fg-subtle">
            <IconClock width={11} height={11} />
            <span className="tabular font-medium text-fg-muted">{v.durationMs} ms</span>
          </span>
        )}
        {saving && <span className="text-[11px] text-brand">Saving…</span>}
      </div>

      {v.error &&
        (v.status === 'failed' ? (
          <p role="alert" className="mt-2 rounded-lg bg-danger-subtle px-2.5 py-2 text-[11.5px] leading-relaxed text-danger ring-1 ring-inset ring-danger-border">
            {v.error}
          </p>
        ) : (
          <p className="mt-2 rounded-lg bg-info-subtle px-2.5 py-2 text-[11.5px] leading-relaxed text-info">{v.error}</p>
        ))}

      <div className="mt-3">
        <Tabs<Panel>
          active={panel}
          onChange={setPanel}
          tabs={[
            { id: 'params', label: 'Parameters', count: params.length },
            { id: 'output', label: 'Output' },
            { id: 'recipe', label: 'Recipe', count: tool.recipe.length },
          ]}
        />
      </div>

      <div className="mt-2 min-w-0">
        {panel === 'params' &&
          (params.length === 0 ? (
            <p className="px-1 py-2 text-xs text-fg-subtle">No parameters — call it with an empty object.</p>
          ) : (
            <dl className="divide-y divide-border">
              {params.map(([k, p]) => (
                <div key={k} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 py-1.5">
                  <dt className="font-mono text-[11.5px] font-medium text-fg">{k}</dt>
                  <span className="rounded bg-surface-2 px-1 py-px font-mono text-[10px] text-fg-subtle">{p.type}</span>
                  {required.includes(k) && <span className="text-[10px] font-medium uppercase tracking-wide text-danger">required</span>}
                  <dd className="w-full text-[11.5px] leading-relaxed text-fg-muted">
                    {p.description}
                    {p.enum && <span className="ml-1 font-mono text-fg-subtle">({p.enum.join(' · ')})</span>}
                  </dd>
                </div>
              ))}
            </dl>
          ))}

        {panel === 'output' && (
          <CodeBlock>
            {v.sampleOutput ? (
              <>
                <span style={{ color: 'var(--code-dim)' }}>
                  {`// ${tool.name}(${JSON.stringify(v.sampleInput ?? tool.samples[0] ?? {})})\n`}
                </span>
                {v.sampleOutput}
              </>
            ) : (
              <span style={{ color: 'var(--code-dim)' }}>
                {`// not verified yet\n// sample input: ${JSON.stringify(tool.samples[0] ?? {})}`}
              </span>
            )}
          </CodeBlock>
        )}

        {panel === 'recipe' && <CodeBlock maxHeight="18rem">{JSON.stringify(tool.recipe, null, 1)}</CodeBlock>}
      </div>
    </Card>
  );
}
