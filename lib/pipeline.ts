import { analyzer, type VerifyResult } from './analyzer-client';
import type { CapabilityModel } from './capability';
import type { SiteManifest, ToolDef } from './manifest';
import { generateTools } from './llm/generate';
import { repairTool } from './llm/repair';
import { demoSiteDoc, pushProgress, saveSite, type SiteDoc } from './store';

const VERIFY_ENABLED = () => process.env.SKIP_VERIFY !== '1';

function isDemoOrigin(origin: string): boolean {
  const raw = (process.env.DEMO_STORE_ORIGIN || 'https://stride-legacy.netlify.app').replace(/\/$/, '');
  try {
    return new URL(raw).origin === origin;
  } catch {
    return false;
  }
}

/**
 * A proxied page is same-origin with our injected script and has the origin's
 * CSP/frame protections removed, so we refuse to host anything with a sign-in
 * form. Snippet mode has no such restriction — the owner installs it themselves.
 */
function proxyDecision(cap: CapabilityModel): { allowed: boolean; reason?: string } {
  if (cap.pages.some((p) => p.auth)) {
    return { allowed: false, reason: 'the crawl found a sign-in form on this site' };
  }
  if (cap.boundaries.auth.length > 0) {
    return { allowed: false, reason: 'the site has pages behind a sign-in' };
  }
  return { allowed: true };
}

export async function createSiteDoc(id: string, url: string): Promise<SiteDoc> {
  const u = new URL(url);
  const now = new Date().toISOString();
  if (isDemoOrigin(u.origin)) {
    const seeded = demoSiteDoc();
    const manifest = { ...seeded.manifest!, siteId: id, origin: u.origin };
    return saveSite({
      ...seeded,
      id,
      url: u.toString(),
      origin: u.origin,
      createdAt: now,
      updatedAt: now,
      demo: true,
      manifest,
      progress: ['Recognized the Stride Legacy demo store — using the hand-authored manifest (generation skipped)'],
    });
  }
  const doc: SiteDoc = { id, url: u.toString(), origin: u.origin, createdAt: now, updatedAt: now, status: 'analyzing', progress: [] };
  pushProgress(doc, `Created for ${u.origin}`);
  try {
    const { jobId } = await analyzer.startAnalyze(doc.url);
    doc.analyzerJobId = jobId;
    pushProgress(doc, `Analyzer job ${jobId} started (crawling up to 6 pages)`);
  } catch (e) {
    doc.status = 'error';
    doc.error = `Analyzer unreachable: ${(e as Error).message}`;
    pushProgress(doc, doc.error);
  }
  return saveSite(doc);
}

export async function advance(doc: SiteDoc): Promise<SiteDoc> {
  try {
    switch (doc.status) {
      case 'analyzing':
        return await stepAnalyzing(doc);
      case 'generating':
        return await stepGenerating(doc);
      case 'verifying':
        return await stepVerifying(doc);
      default:
        return doc;
    }
  } catch (e) {
    doc.status = 'error';
    doc.error = (e as Error).message;
    pushProgress(doc, `Error: ${doc.error}`);
    return saveSite(doc);
  }
}

async function stepAnalyzing(doc: SiteDoc): Promise<SiteDoc> {
  if (!doc.analyzerJobId) throw new Error('no analyzer job');
  const job = await analyzer.job<CapabilityModel>(doc.analyzerJobId);
  if (job.progress?.length) {
    const last = job.progress[job.progress.length - 1];
    if (!doc.progress.some((p) => p.endsWith(last))) pushProgress(doc, last);
  }
  if (job.status === 'error') throw new Error(`analysis failed: ${job.error}`);
  if (job.status !== 'done' || !job.result) return saveSite(doc);
  doc.capability = job.result;
  doc.status = 'generating';
  const s = job.result.stats;
  pushProgress(doc, `Analyzed ${s.pagesVisited} pages · ${s.forms} forms · ${s.controls} controls · ${s.lists} lists · ${s.endpoints} endpoints`);
  pushProgress(doc, 'Generating tools with GPT-5.6…');
  return saveSite(doc);
}

async function stepGenerating(doc: SiteDoc): Promise<SiteDoc> {
  if (!doc.capability) throw new Error('no capability model');
  const out = await generateTools(doc.capability);
  const proxyChoice = proxyDecision(doc.capability);
  const manifest: SiteManifest = {
    version: 1,
    siteId: doc.id,
    origin: doc.origin,
    name: out.siteName || doc.capability.siteTitle || doc.origin,
    category: out.category,
    spa: doc.capability.spa,
    generatedAt: new Date().toISOString(),
    proxy: proxyChoice,
    settings: { badge: true, outputBudget: 1500, confirmTimeoutMs: 60_000 },
    tools: out.tools,
  };
  if (!proxyChoice.allowed) pushProgress(doc, `Instant proxy disabled: ${proxyChoice.reason}`);
  doc.manifest = manifest;
  pushProgress(doc, `Generated ${out.tools.length} tools with ${out.modelId}`);
  for (const w of out.warnings.slice(0, 6)) pushProgress(doc, `note: ${w}`);
  const unknown = Object.entries(out.unknownLocators);
  if (unknown.length) pushProgress(doc, `Locators not found in the model for: ${unknown.map(([n]) => n).join(', ')} (will be verified)`);
  return startVerification(doc, out.tools.map((t) => t.name));
}

async function startVerification(doc: SiteDoc, tools: string[]): Promise<SiteDoc> {
  if (!VERIFY_ENABLED() || !doc.manifest) {
    doc.status = 'ready';
    pushProgress(doc, 'Verification skipped');
    return saveSite(doc);
  }
  try {
    const { jobId } = await analyzer.startVerify(doc.url, doc.manifest, tools);
    doc.verifyJobId = jobId;
    doc.status = 'verifying';
    pushProgress(doc, `Verifying ${tools.length} tools against the live site…`);
  } catch (e) {
    doc.status = 'ready';
    pushProgress(doc, `Verification unavailable (${(e as Error).message}); tools left unverified`);
  }
  return saveSite(doc);
}

async function stepVerifying(doc: SiteDoc): Promise<SiteDoc> {
  if (!doc.verifyJobId || !doc.manifest) throw new Error('no verify job');
  const job = await analyzer.job<VerifyResult>(doc.verifyJobId);
  if (job.status === 'error') {
    pushProgress(doc, `Verification failed to run: ${job.error}`);
    doc.status = 'ready';
    return saveSite(doc);
  }
  if (job.status !== 'done' || !job.result) return saveSite(doc);

  const byName = new Map(doc.manifest.tools.map((t) => [t.name, t] as const));
  const failed: { tool: ToolDef; error: string; failedStep?: number; page?: VerifyResult['results'][number]['pageModelAtFailure'] }[] = [];
  for (const r of job.result.results) {
    const t = byName.get(r.tool);
    if (!t) continue;
    t.verification = {
      status: r.status,
      checkedAt: new Date().toISOString(),
      sampleInput: t.samples[0],
      sampleOutput: r.output?.slice(0, 1500),
      error: r.error,
      failedStep: r.failedStep,
      durationMs: r.durationMs,
    };
    if (r.status === 'failed') failed.push({ tool: t, error: r.error ?? 'unknown error', failedStep: r.failedStep, page: r.pageModelAtFailure });
  }
  const passed = job.result.results.filter((r) => r.status === 'passed').length;
  const skipped = job.result.results.filter((r) => r.status === 'skipped').length;
  pushProgress(doc, `Verification: ${passed} passed · ${failed.length} failed · ${skipped} skipped (sensitive, dry-run)`);

  const attempted = new Set(doc.repairAttempted ?? []);
  const toRepair = failed.filter((f) => !attempted.has(f.tool.name)).slice(0, 4);
  if (toRepair.length && doc.capability) {
    pushProgress(doc, `Repairing ${toRepair.length} tool(s) with the LLM…`);
    const repairedNames: string[] = [];
    for (const f of toRepair) {
      attempted.add(f.tool.name);
      try {
        const fixed = await repairTool({ tool: f.tool, error: f.error, failedStep: f.failedStep, pageModelAtFailure: f.page, model: doc.capability });
        const idx = doc.manifest.tools.findIndex((t) => t.name === f.tool.name);
        doc.manifest.tools[idx] = { ...fixed, verification: { status: 'unverified' } };
        repairedNames.push(fixed.name);
      } catch (e) {
        pushProgress(doc, `Repair of ${f.tool.name} failed: ${(e as Error).message}`);
      }
    }
    doc.repairAttempted = [...attempted];
    if (repairedNames.length) return startVerification(doc, repairedNames);
  }

  for (const t of doc.manifest.tools) if (t.verification.status === 'failed') t.enabled = false;
  doc.status = 'ready';
  pushProgress(doc, 'Ready — agent-ready URL is live');
  return saveSite(doc);
}
