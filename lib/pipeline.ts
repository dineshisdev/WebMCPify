import { analyzer, type VerifyResult } from './analyzer-client';
import type { CapabilityModel } from './capability';
import type { ToolDef } from './manifest';
import { generateOneTool, planTools } from './llm/generate';
import { finalizeTools } from './llm/postprocess';
import { repairTool } from './llm/repair';
import { demoSiteDoc, getSite, pushProgress, saveSite, tryLock, unlock, type SiteDoc } from './store';

const VERIFY_ENABLED = () => process.env.SKIP_VERIFY !== '1';

function isDemoOrigin(origin: string): boolean {
  const raw = (process.env.DEMO_STORE_ORIGIN || 'https://stride-legacy.netlify.app').replace(/\/$/, '');
  try {
    return new URL(raw).origin === origin;
  } catch {
    return false;
  }
}

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
  const ttl = doc.status === 'generating' ? 50 : 25;
  const got = await tryLock(`advance:${doc.id}`, ttl);
  if (!got) return doc;
  try {
    const fresh = (await getSite(doc.id)) ?? doc;
    switch (fresh.status) {
      case 'analyzing':
        return await stepAnalyzing(fresh);
      case 'generating':
        return await stepGenerating(fresh);
      case 'verifying':
        return await stepVerifying(fresh);
      default:
        return fresh;
    }
  } catch (e) {
    const current = (await getSite(doc.id)) ?? doc;
    current.status = 'error';
    current.error = (e as Error).message;
    pushProgress(current, `Error: ${current.error}`);
    return saveSite(current);
  } finally {
    await unlock(`advance:${doc.id}`);
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
  pushProgress(doc, 'Generating tools with GPT-5.6...');
  return saveSite(doc);
}

async function stepGenerating(doc: SiteDoc): Promise<SiteDoc> {
  if (!doc.capability) throw new Error('no capability model');

  if (!doc.generation) {
    const plan = await planTools(doc.capability);
    const proxyChoice = proxyDecision(doc.capability);
    doc.manifest = {
      version: 1,
      siteId: doc.id,
      origin: doc.origin,
      name: plan.siteName || doc.capability.siteTitle || doc.origin,
      category: plan.category,
      spa: doc.capability.spa,
      generatedAt: new Date().toISOString(),
      proxy: proxyChoice,
      settings: { badge: true, outputBudget: 1500, confirmTimeoutMs: 60_000 },
      tools: [],
    };
    if (!proxyChoice.allowed) pushProgress(doc, `Instant proxy disabled: ${proxyChoice.reason}`);
    doc.generation = { queue: plan.tools, modelId: plan.modelId, attempts: {} };
    pushProgress(doc, `Planned ${plan.tools.length} tools with ${plan.modelId}: ${plan.tools.map((t) => t.name).join(', ')}`);
    return saveSite(doc);
  }

  const next = doc.generation.queue[0];
  if (!next) {
    const names = doc.manifest?.tools.map((t) => t.name) ?? [];
    delete doc.generation;
    if (!names.length) throw new Error('no tools generated');
    return startVerification(doc, names);
  }

  try {
    const existing = doc.manifest?.tools.map((t) => t.name) ?? [];
    const out = await generateOneTool(doc.capability, next, existing);
    const tools = finalizeTools([...(doc.manifest?.tools ?? []), out.tool]);
    doc.manifest = { ...doc.manifest!, tools, generatedAt: new Date().toISOString() };
    doc.generation.queue = doc.generation.queue.slice(1);
    pushProgress(doc, `Generated ${out.tool.name} (${tools.length}/${tools.length + doc.generation.queue.length})`);
    for (const w of out.warnings.slice(0, 3)) pushProgress(doc, `note: ${out.tool.name}: ${w}`);
    if (out.unknownLocators.length) pushProgress(doc, `${out.tool.name}: locators not in the model (will be verified)`);
  } catch (e) {
    const attempts = doc.generation.attempts ?? {};
    attempts[next.name] = (attempts[next.name] ?? 0) + 1;
    doc.generation.attempts = attempts;
    if (attempts[next.name]! >= 2) {
      doc.generation.queue = doc.generation.queue.slice(1);
      pushProgress(doc, `Skipped ${next.name}: ${(e as Error).message}`.slice(0, 220));
    } else {
      pushProgress(doc, `Will retry ${next.name} on the next poll`);
    }
    return saveSite(doc);
  }

  if (!doc.generation.queue.length) {
    const names = doc.manifest!.tools.map((t) => t.name);
    delete doc.generation;
    if (!names.length) throw new Error('no tools generated');
    return startVerification(doc, names);
  }
  return saveSite(doc);
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
  const summary = `Verification: ${passed} passed · ${failed.length} failed · ${skipped} skipped (sensitive, dry-run)`;
  if (!doc.progress.some((p) => p.endsWith(summary))) pushProgress(doc, summary);

  const attempted = new Set(doc.repairAttempted ?? []);
  const remaining = doc.manifest.tools.filter((t) => t.verification.status === 'failed' && !attempted.has(t.name));
  const next = remaining[0];
  if (next && doc.capability) {
    const f = failed.find((x) => x.tool.name === next.name);
    attempted.add(next.name);
    doc.repairAttempted = [...attempted];
    pushProgress(doc, `Repairing ${next.name} with the LLM…`);
    try {
      const fixed = await repairTool({
        tool: next,
        error: f?.error ?? next.verification.error ?? 'unknown error',
        failedStep: f?.failedStep ?? next.verification.failedStep,
        pageModelAtFailure: f?.page,
        model: doc.capability,
      });
      const idx = doc.manifest.tools.findIndex((t) => t.name === next.name);
      doc.manifest.tools[idx] = { ...fixed, verification: { status: 'unverified' } };
      return startVerification(doc, [fixed.name]);
    } catch (e) {
      pushProgress(doc, `Repair of ${next.name} failed: ${(e as Error).message}`);
      return saveSite(doc);
    }
  }

  for (const t of doc.manifest.tools) if (t.verification.status === 'failed') t.enabled = false;
  doc.status = 'ready';
  pushProgress(doc, 'Ready — agent-ready URL is live');
  return saveSite(doc);
}
