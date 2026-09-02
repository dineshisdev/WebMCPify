'use client';
import { useState } from 'react';
import { IconCheck, IconCopy } from './ui';

export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      aria-label={done ? 'Copied to clipboard' : label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1600);
        } catch {}
      }}
      className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border bg-surface px-2.5 py-2 text-xs font-medium text-fg-muted transition-colors duration-150 hover:border-border-strong hover:text-fg"
    >
      {done ? <IconCheck width={13} height={13} className="text-ok" /> : <IconCopy width={13} height={13} />}
      <span className={done ? 'text-ok' : ''}>{done ? 'Copied' : label}</span>
    </button>
  );
}
