import type { ReactNode, SVGProps } from 'react';
import type { Risk, VerificationStatus } from '@/lib/manifest';

const ico = (p: SVGProps<SVGSVGElement>) => ({
  width: 14,
  height: 14,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  ...p,
});

export const IconCheck = (p: SVGProps<SVGSVGElement>) => (
  <svg {...ico(p)}><path d="M20 6 9 17l-5-5" /></svg>
);
export const IconX = (p: SVGProps<SVGSVGElement>) => (
  <svg {...ico(p)}><path d="M18 6 6 18M6 6l12 12" /></svg>
);
export const IconEye = (p: SVGProps<SVGSVGElement>) => (
  <svg {...ico(p)}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></svg>
);
export const IconUndo = (p: SVGProps<SVGSVGElement>) => (
  <svg {...ico(p)}><path d="M3 7v6h6" /><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" /></svg>
);
export const IconShield = (p: SVGProps<SVGSVGElement>) => (
  <svg {...ico(p)}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /><path d="M12 8v4" /><path d="M12 16h.01" /></svg>
);
export const IconClock = (p: SVGProps<SVGSVGElement>) => (
  <svg {...ico(p)}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
);
export const IconCopy = (p: SVGProps<SVGSVGElement>) => (
  <svg {...ico(p)}><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>
);
export const IconExternal = (p: SVGProps<SVGSVGElement>) => (
  <svg {...ico(p)}><path d="M15 3h6v6" /><path d="M10 14 21 3" /><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" /></svg>
);
export const IconDot = (p: SVGProps<SVGSVGElement>) => (
  <svg {...ico(p)} fill="currentColor" stroke="none"><circle cx="12" cy="12" r="4" /></svg>
);
export const IconSpark = (p: SVGProps<SVGSVGElement>) => (
  <svg {...ico(p)}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8" /></svg>
);

const RISK: Record<Risk, { label: string; cls: string; Icon: typeof IconEye; title: string }> = {
  read: {
    label: 'read',
    Icon: IconEye,
    cls: 'bg-ok-subtle text-ok ring-ok-border',
    title: 'Reads data only — registered with readOnlyHint, so agents can call it without a confirmation',
  },
  reversible: {
    label: 'reversible',
    Icon: IconUndo,
    cls: 'bg-warn-subtle text-warn ring-warn-border',
    title: 'Changes state that the user can undo (e.g. cart edits)',
  },
  sensitive: {
    label: 'sensitive',
    Icon: IconShield,
    cls: 'bg-danger-subtle text-danger ring-danger-border',
    title: 'Purchases, bookings, deletions — the bridge requires an in-page human confirmation',
  },
};

export function RiskChip({ risk }: { risk: Risk }) {
  const r = RISK[risk];
  return (
    <span
      title={r.title}
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${r.cls}`}
    >
      <r.Icon width={11} height={11} />
      {r.label}
    </span>
  );
}

const STATUS: Record<VerificationStatus, { label: string; cls: string; Icon: typeof IconCheck; title: string }> = {
  passed: { label: 'verified', Icon: IconCheck, cls: 'text-ok', title: 'Executed against the live site in Playwright and returned a valid result' },
  failed: { label: 'failed', Icon: IconX, cls: 'text-danger', title: 'Execution failed during verification — the tool is disabled' },
  skipped: { label: 'dry-run', Icon: IconShield, cls: 'text-info', title: 'Sensitive tool: locators were resolved but no action was committed' },
  unverified: { label: 'unverified', Icon: IconDot, cls: 'text-fg-subtle', title: 'Not yet executed against the live site' },
};

export function StatusBadge({ status }: { status: VerificationStatus }) {
  const s = STATUS[status];
  return (
    <span title={s.title} className={`inline-flex items-center gap-1 text-[11px] font-medium ${s.cls}`}>
      <s.Icon width={11} height={11} />
      {s.label}
    </span>
  );
}

export function Metric({ label, value, mono = false }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <span className="inline-flex items-baseline gap-1 text-[11px] text-fg-subtle">
      <span>{label}</span>
      <span className={`tabular font-medium text-fg-muted ${mono ? 'font-mono' : ''}`}>{value}</span>
    </span>
  );
}

export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 after:absolute after:-inset-x-2 after:-inset-y-3 after:content-[''] ${
        checked ? 'bg-brand' : 'bg-surface-3'
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${
          checked ? 'translate-x-4.5' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

export function Tabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: T; label: string; count?: number }[];
  active: T | null;
  onChange: (id: T) => void;
}) {
  return (
    <div role="tablist" className="flex flex-wrap gap-0.5 rounded-lg bg-surface-2 p-0.5">
      {tabs.map((t) => {
        const on = active === t.id;
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={on}
            onClick={() => onChange(t.id)}
            className={`cursor-pointer rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors duration-150 ${
              on ? 'bg-surface text-fg shadow-sm' : 'text-fg-subtle hover:text-fg-muted'
            }`}
          >
            {t.label}
            {t.count !== undefined && <span className="tabular ml-1 text-fg-subtle">{t.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function Card({ children, className = '', muted = false }: { children: ReactNode; className?: string; muted?: boolean }) {
  return (
    <div
      className={`min-w-0 rounded-xl border bg-surface shadow-[var(--shadow-card)] ${
        muted ? 'border-dashed opacity-70' : ''
      } ${className}`}
    >
      {children}
    </div>
  );
}

export function CodeBlock({ children, maxHeight = '14rem' }: { children: ReactNode; maxHeight?: string }) {
  return (
    <pre className="code-block scroll-x overflow-y-auto" style={{ maxHeight }} tabIndex={0}>
      {children}
    </pre>
  );
}
