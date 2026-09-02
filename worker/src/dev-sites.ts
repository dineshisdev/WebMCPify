import type { SiteManifest } from '../../lib/manifest';
import type { Env } from './env';
import demoManifest from '../../lib/demo-manifest.json';

export interface ResolvedSite {
  origin: string;
  manifest: SiteManifest;
}

export function devSites(env: Env): Record<string, ResolvedSite> {
  const origin = (env.DEMO_ORIGIN || 'http://localhost:8080').replace(/\/+$/, '');
  const manifest = { ...(demoManifest as unknown as SiteManifest), origin, siteId: 'demo' };
  return { demo: { origin, manifest } };
}
