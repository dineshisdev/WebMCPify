import Fastify from 'fastify';
import cors from '@fastify/cors';
import { z } from 'zod';
import { closeBrowser } from './browser';
import { crawl } from './crawl';
import { createJob, fail, finish, getJob, push, start } from './jobs';
import { errorMessage, normalizeStartUrl } from './util';
import { verify } from './verify';
import type { SiteManifest } from '../../lib/manifest';

const PORT = Number(process.env.PORT || 10000);
const TOKEN = process.env.ANALYZER_TOKEN || '';

const AnalyzeZ = z.object({ url: z.string().min(3) });
const VerifyZ = z.object({
  url: z.string().min(3),
  manifest: z.any(),
  tools: z.array(z.string()).optional(),
});

const app = Fastify({ logger: true, requestTimeout: 120_000 });
await app.register(cors, { origin: true });

app.addHook('onRequest', async (req, reply) => {
  if (!TOKEN) return;
  if (req.url === '/health') return;
  const hdr = req.headers.authorization || '';
  if (hdr !== `Bearer ${TOKEN}`) {
    return reply.code(401).send({ error: 'unauthorized' });
  }
});

app.get('/health', async () => ({ ok: true, uptime: process.uptime() }));

app.post('/analyze', async (req, reply) => {
  const parsed = AnalyzeZ.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: parsed.error.message });
  let url: string;
  try {
    url = normalizeStartUrl(parsed.data.url);
  } catch (e) {
    return reply.code(400).send({ error: errorMessage(e) });
  }
  const job = createJob('analyze');
  run(job.id, async () => {
    const model = await crawl(url, (line) => {
      const j = getJob(job.id);
      if (j) push(j, line);
    });
    return model;
  });
  return { jobId: job.id };
});

app.post('/analyze/sync', async (req, reply) => {
  const parsed = AnalyzeZ.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: parsed.error.message });
  try {
    return await crawl(normalizeStartUrl(parsed.data.url));
  } catch (e) {
    return reply.code(500).send({ error: errorMessage(e) });
  }
});

app.post('/verify', async (req, reply) => {
  const parsed = VerifyZ.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: parsed.error.message });
  const manifest = parsed.data.manifest as SiteManifest;
  if (!manifest?.tools) return reply.code(400).send({ error: 'manifest.tools required' });
  let url: string;
  try {
    url = normalizeStartUrl(parsed.data.url);
  } catch (e) {
    return reply.code(400).send({ error: errorMessage(e) });
  }
  const job = createJob('verify');
  const names = parsed.data.tools;
  run(job.id, () => verify(url, manifest, names));
  return { jobId: job.id };
});

app.get('/jobs/:id', async (req, reply) => {
  const id = (req.params as { id: string }).id;
  const job = getJob(id);
  if (!job) return reply.code(404).send({ error: 'unknown job' });
  return job;
});

function run(id: string, fn: () => Promise<unknown>): void {
  const job = getJob(id);
  if (!job) return;
  start(job);
  fn()
    .then((result) => finish(job, result))
    .catch((e) => fail(job, errorMessage(e)));
}

const shutdown = async () => {
  await closeBrowser();
  await app.close();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

await app.listen({ port: PORT, host: '0.0.0.0' });
app.log.info(`analyzer listening on :${PORT}`);
