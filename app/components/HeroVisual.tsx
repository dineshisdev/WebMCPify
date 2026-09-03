import { IconCheck, IconEye, IconShield, IconUndo } from './ui';

const TOOLS = [
  { name: 'search_products', risk: 'read', Icon: IconEye, cls: 'bg-ok-subtle text-ok ring-ok-border', state: 'verified' },
  { name: 'get_product', risk: 'read', Icon: IconEye, cls: 'bg-ok-subtle text-ok ring-ok-border', state: 'verified' },
  { name: 'add_to_cart', risk: 'reversible', Icon: IconUndo, cls: 'bg-warn-subtle text-warn ring-warn-border', state: 'verified' },
  { name: 'place_order', risk: 'sensitive', Icon: IconShield, cls: 'bg-danger-subtle text-danger ring-danger-border', state: 'confirm' },
];

export function HeroVisual() {
  return (
    <div className="hv min-w-0 select-none" aria-hidden>
      <div className="relative min-w-0 overflow-hidden rounded-xl border bg-surface shadow-[var(--shadow-raised)]">
        <div className="flex items-center gap-2 border-b bg-surface-2 px-3 py-2">
          <span className="flex gap-1.5">
            <i className="block h-2 w-2 rounded-full bg-border-strong" />
            <i className="block h-2 w-2 rounded-full bg-border-strong" />
            <i className="block h-2 w-2 rounded-full bg-border-strong" />
          </span>
          <span className="truncate rounded bg-surface px-2 py-0.5 font-mono text-[10px] text-fg-subtle">
            stride-legacy.example
          </span>
        </div>

        <div className="hv-scanhost relative p-3">
          <div className="flex gap-1.5">
            <span className="h-5 flex-1 rounded-md bg-surface-2" />
            <span className="h-5 w-9 rounded-md bg-surface-2" />
            <span className="h-5 w-9 rounded-md bg-surface-2" />
          </div>
          <div className="mt-2.5 grid grid-cols-3 gap-1.5">
            {Array.from({ length: 6 }).map((_, i) => (
              <span key={i} className="block">
                <span className="block h-9 rounded-md bg-surface-3" />
                <span className="mt-1 block h-1.5 w-4/5 rounded bg-surface-2" />
                <span className="mt-1 block h-1.5 w-2/5 rounded bg-surface-2" />
              </span>
            ))}
          </div>
          <span className="hv-scan" />
        </div>

        <div className="flex items-center gap-2 border-t bg-surface-2 px-3 py-2">
          <span className="hv-dot h-1.5 w-1.5 rounded-full bg-ok" />
          <span className="text-[10.5px] font-semibold text-fg">Agent-ready · 4 tools</span>
        </div>
      </div>

      <ul className="hv-tools mt-3 space-y-1.5">
        {TOOLS.map((t, i) => (
          <li
            key={t.name}
            className="hv-tool flex min-w-0 items-center gap-2 rounded-lg border bg-surface px-2.5 py-1.5 shadow-[var(--shadow-card)]"
            style={{ animationDelay: `${0.5 + i * 0.18}s` }}
          >
            <code className="min-w-0 flex-1 truncate font-mono text-[11.5px] font-medium text-fg">{t.name}</code>
            <span className={`inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset ${t.cls}`}>
              <t.Icon width={10} height={10} />
              {t.risk}
            </span>
            <span className="inline-flex shrink-0 items-center gap-0.5 text-[10px] font-medium text-fg-subtle">
              {t.state === 'verified' ? (
                <>
                  <IconCheck width={10} height={10} className="text-ok" />
                  verified
                </>
              ) : (
                <>
                  <IconShield width={10} height={10} className="text-danger" />
                  confirm
                </>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
