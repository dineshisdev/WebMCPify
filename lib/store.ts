import { Redis } from '@upstash/redis';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { CapabilityModel } from './capability';
import type { Risk, SiteManifest } from './manifest';
import demoManifest from './demo-manifest.json';

export type SiteStatus = 'analyzing' | 'generating' | 'verifying' | 'ready' | 'error';

export interface SiteDoc {
  id: string;
  url: string;
  origin: string;
  createdAt: string;
  updatedAt: string;
  status: SiteStatus;
  progress: string[];
  error?: string;
  analyzerJobId?: string;
  verifyJobId?: string;
  capability?: CapabilityModel;
  manifest?: SiteManifest;
  repairAttempted?: string[];
  demo?: boolean;
  generation?: {
    queue: { name: string; description: string; risk: Risk }[];
    modelId: string;
    attempts?: Record<string, number>;
  };
}

export const DEMO_SITE_ID = 'demo';

function demoOrigin(): string {
  return process.env.DEMO_STORE_ORIGIN?.replace(/\/$/, '') || 'https://stride-legacy.netlify.app';
}

export function demoSiteDoc(): SiteDoc {
  const origin = demoOrigin();
  const manifest = { ...(demoManifest as unknown as SiteManifest), origin, siteId: DEMO_SITE_ID };
  const now = new Date().toISOString();
  return {
    id: DEMO_SITE_ID,
    url: origin + '/',
    origin,
    createdAt: now,
    updatedAt: now,
    status: 'ready',
    progress: ['Seeded from lib/demo-manifest.json'],
    manifest,
    demo: true,
  };
}

interface Backend {
  get(id: string): Promise<SiteDoc | null>;
  set(doc: SiteDoc): Promise<void>;
  list(): Promise<string[]>;
  tryLock(key: string, ttlSec: number): Promise<boolean>;
  unlock(key: string): Promise<void>;
}

class RedisBackend implements Backend {
  private r: Redis;
  constructor(url: string, token: string) {
    this.r = new Redis({ url, token });
  }
  async get(id: string) {
    return (await this.r.get<SiteDoc>(`site:${id}`)) ?? null;
  }
  async set(doc: SiteDoc) {
    await this.r.set(`site:${doc.id}`, doc);
    await this.r.sadd('sites:index', doc.id);
  }
  async list() {
    return (await this.r.smembers('sites:index')) as string[];
  }
  async tryLock(key: string, ttlSec: number) {
    const ok = await this.r.set(`lock:${key}`, '1', { nx: true, ex: ttlSec });
    return ok === 'OK';
  }
  async unlock(key: string) {
    await this.r.del(`lock:${key}`);
  }
}

const memoryLocks = new Map<string, number>();

class FileBackend implements Backend {
  private dir = path.join(process.cwd(), '.data', 'sites');
  private file(id: string) {
    return path.join(this.dir, `${id.replace(/[^a-z0-9_-]/gi, '')}.json`);
  }
  async get(id: string) {
    try {
      return JSON.parse(await fs.readFile(this.file(id), 'utf8')) as SiteDoc;
    } catch {
      return null;
    }
  }
  async set(doc: SiteDoc) {
    await fs.mkdir(this.dir, { recursive: true });
    await fs.writeFile(this.file(doc.id), JSON.stringify(doc, null, 2));
  }
  async list() {
    try {
      return (await fs.readdir(this.dir)).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5));
    } catch {
      return [];
    }
  }
  async tryLock(key: string, ttlSec: number) {
    const until = memoryLocks.get(key) ?? 0;
    if (until > Date.now()) return false;
    memoryLocks.set(key, Date.now() + ttlSec * 1000);
    return true;
  }
  async unlock(key: string) {
    memoryLocks.delete(key);
  }
}

let backend: Backend | null = null;
function getBackend(): Backend {
  if (backend) return backend;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  backend = url && token ? new RedisBackend(url, token) : new FileBackend();
  return backend;
}

export function storageKind(): 'redis' | 'file' {
  return process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN ? 'redis' : 'file';
}

export async function getSite(id: string): Promise<SiteDoc | null> {
  const doc = await getBackend().get(id);
  if (doc) return doc;
  if (id === DEMO_SITE_ID) return demoSiteDoc();
  return null;
}

export async function saveSite(doc: SiteDoc): Promise<SiteDoc> {
  doc.updatedAt = new Date().toISOString();
  await getBackend().set(doc);
  return doc;
}

export async function tryLock(key: string, ttlSec = 40): Promise<boolean> {
  return getBackend().tryLock(key, ttlSec);
}

export async function unlock(key: string): Promise<void> {
  await getBackend().unlock(key);
}

export async function listSiteIds(): Promise<string[]> {
  const ids = await getBackend().list();
  return ids.includes(DEMO_SITE_ID) ? ids : [DEMO_SITE_ID, ...ids];
}

export function newSiteId(): string {
  const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789';
  let id = '';
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  for (const b of bytes) id += alphabet[b % alphabet.length];
  return id;
}

export function pushProgress(doc: SiteDoc, line: string) {
  doc.progress.push(`${new Date().toISOString().slice(11, 19)} ${line}`);
  if (doc.progress.length > 40) doc.progress.splice(0, doc.progress.length - 40);
}
