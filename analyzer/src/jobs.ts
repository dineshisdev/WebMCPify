import { randomBytes } from 'node:crypto';

export type JobStatus = 'queued' | 'running' | 'done' | 'error';

export interface Job<T = unknown> {
  id: string;
  kind: 'analyze' | 'verify';
  status: JobStatus;
  progress: string[];
  result?: T;
  error?: string;
  startedAt?: string;
  finishedAt?: string;
  createdAt: string;
}

const jobs = new Map<string, Job>();
const MAX = 80;
const TTL_MS = 30 * 60 * 1000;

function gc(): void {
  const now = Date.now();
  for (const [id, j] of jobs) {
    const t = Date.parse(j.finishedAt || j.createdAt);
    if (now - t > TTL_MS) jobs.delete(id);
  }
  while (jobs.size > MAX) {
    const oldest = jobs.keys().next().value;
    if (!oldest) break;
    jobs.delete(oldest);
  }
}

export function createJob(kind: Job['kind']): Job {
  gc();
  const id = randomBytes(8).toString('hex');
  const job: Job = { id, kind, status: 'queued', progress: [], createdAt: new Date().toISOString() };
  jobs.set(id, job);
  return job;
}

export function getJob(id: string): Job | undefined {
  return jobs.get(id);
}

export function push(job: Job, line: string): void {
  job.progress.push(line);
  if (job.progress.length > 40) job.progress.splice(0, job.progress.length - 40);
}

export function start(job: Job): void {
  job.status = 'running';
  job.startedAt = new Date().toISOString();
}

export function finish<T>(job: Job, result: T): void {
  job.status = 'done';
  job.result = result;
  job.finishedAt = new Date().toISOString();
}

export function fail(job: Job, error: string): void {
  job.status = 'error';
  job.error = error;
  job.finishedAt = new Date().toISOString();
}
