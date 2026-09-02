'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function UrlForm({ defaultValue = '' }: { defaultValue?: string }) {
  const router = useRouter();
  const [url, setUrl] = useState(defaultValue);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/sites', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not start the analysis.');
      router.push(`/sites/${data.id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} id="analyze-form" data-testid="analyze-form" className="w-full max-w-2xl">
      <label htmlFor="site-url" className="mb-1.5 block text-xs font-medium text-fg-muted">
        Website URL
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id="site-url"
          name="url"
          type="url"
          required
          inputMode="url"
          autoComplete="url"
          placeholder="https://your-store.example"
          aria-invalid={!!error}
          aria-describedby={error ? 'url-error' : undefined}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="min-h-11 flex-1 rounded-xl border bg-surface px-4 text-base text-fg shadow-[var(--shadow-card)] transition-colors placeholder:text-fg-subtle hover:border-border-strong focus:border-brand focus:outline-none"
        />
        <button
          type="submit"
          disabled={busy}
          className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-brand px-5 text-sm font-semibold text-brand-fg transition-colors duration-150 hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-70"
        >
          {busy && (
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
          )}
          {busy ? 'Starting…' : 'Make agent-ready'}
        </button>
      </div>
      {error && (
        <p id="url-error" role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
    </form>
  );
}
