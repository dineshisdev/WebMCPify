export interface Locator {
  css: string;
  text?: string;
  exact?: boolean;
  nth?: number;
  within?: Locator;
  alternates?: Locator[];
}

export type Risk = 'read' | 'reversible' | 'sensitive';

export interface ToolAnnotations {
  readOnlyHint: boolean;
  untrustedContentHint: boolean;
}

export type JsonSchemaPrimitive = 'string' | 'number' | 'integer' | 'boolean' | 'array';

export interface JsonSchemaProperty {
  type: JsonSchemaPrimitive;
  description?: string;
  enum?: string[];
  items?: { type: 'string' | 'number' };
  minimum?: number;
  maximum?: number;
  default?: unknown;
}

export interface JsonSchemaObject {
  type: 'object';
  properties: Record<string, JsonSchemaProperty>;
  required?: string[];
  additionalProperties?: boolean;
}

export interface FieldSpec {
  css?: string;
  attr?: string;
  regex?: string;
  type?: 'string' | 'number' | 'boolean';
}

export type WhereOp = 'eq' | 'neq' | 'lt' | 'lte' | 'gt' | 'gte' | 'contains' | 'in';

export interface Where {
  field: string;
  op: WhereOp;
  value: unknown;
}

interface StepBase {
  when?: string;
  optional?: boolean;
  timeoutMs?: number;
  errorHint?: string;
}

export type Step =
  | (StepBase & { op: 'ensurePage'; urlPattern: string; path: string; mode?: 'push' | 'navigate'; waitFor?: Locator })
  | (StepBase & { op: 'navigate'; path: string })
  | (StepBase & { op: 'fill'; target: Locator; value: string })
  | (StepBase & { op: 'type'; target: Locator; value: string; pressEnter?: boolean })
  | (StepBase & { op: 'press'; key: 'Enter' | 'Escape' | 'Tab' | 'ArrowDown'; target?: Locator })
  | (StepBase & { op: 'click'; target: Locator })
  | (StepBase & { op: 'select'; target: Locator; value: string })
  | (StepBase & { op: 'check'; target: Locator; checked: boolean })
  | (StepBase & { op: 'scrollIntoView'; target: Locator })
  | (StepBase & { op: 'waitFor'; target: Locator; state: 'visible' | 'hidden' | 'attached' | 'detached' })
  | (StepBase & { op: 'waitForDomIdle'; quietMs?: number })
  | (StepBase & { op: 'waitForUrl'; pattern: string })
  | (StepBase & { op: 'wait'; ms: number })
  | (StepBase & { op: 'assert'; target: Locator; state: 'exists' | 'notExists'; message: string })
  | (StepBase & { op: 'extractText'; target: Locator; attr?: string; regex?: string; type?: 'string' | 'number'; as: string })
  | (StepBase & { op: 'extractFields'; root?: Locator; fields: Record<string, FieldSpec>; as: string })
  | (StepBase & { op: 'extractList'; root?: Locator; item: string; fields: Record<string, FieldSpec>; limit?: number; as: string })
  | (StepBase & { op: 'fetchJson'; url: string; method?: 'GET' | 'POST'; body?: unknown; pick?: string; as: string })
  | (StepBase & { op: 'readStorage'; key: string; parse?: 'json'; as: string })
  | (StepBase & { op: 'filterList'; from: string; where?: Where[]; sortBy?: string; order?: 'asc' | 'desc'; limit?: number; pick?: string[]; as: string })
  | (StepBase & { op: 'setUrlState'; path?: string; params?: Record<string, string>; replace?: boolean })
  | (StepBase & { op: 'confirm'; title: string; message: string; details?: string[] })
  | (StepBase & { op: 'fail'; message: string })
  | (StepBase & { op: 'return'; value: unknown; ifEmpty?: { var: string; message: string } });

export type StepOp = Step['op'];

export type VerificationStatus = 'unverified' | 'passed' | 'failed' | 'skipped';

export interface ToolVerification {
  status: VerificationStatus;
  checkedAt?: string;
  sampleInput?: unknown;
  sampleOutput?: string;
  error?: string;
  failedStep?: number;
  durationMs?: number;
  screenshotRef?: string;
}

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: JsonSchemaObject;
  annotations: ToolAnnotations;
  risk: Risk;
  scope?: { urlPattern: string };
  recipe: Step[];
  samples: Record<string, unknown>[];
  verification: ToolVerification;
  enabled: boolean;
  source: 'generated' | 'repaired' | 'manual';
  rationale?: string;
}

export type SiteCategory = 'commerce' | 'booking' | 'content' | 'saas' | 'other';

export interface SiteManifest {
  version: 1;
  siteId: string;
  origin: string;
  name: string;
  category: SiteCategory;
  spa: boolean;
  generatedAt: string;
  proxy?: { allowed: boolean; reason?: string };
  settings: {
    badge: boolean;
    outputBudget: number;
    confirmTimeoutMs: number;
  };
  tools: ToolDef[];
}

export interface ToolResult {
  content: { type: 'text'; text: string }[];
  isError?: boolean;
}

export type RecipeErrorCode =
  | 'VALIDATION'
  | 'TARGET_NOT_FOUND'
  | 'TIMEOUT'
  | 'PRECONDITION'
  | 'DECLINED'
  | 'NAVIGATION_REQUIRED'
  | 'NETWORK'
  | 'BUSY'
  | 'ABORTED'
  | 'INTERNAL';

export type BridgeMode = 'proxy' | 'snippet' | 'verify';

export interface BridgeConfig {
  mode: BridgeMode;
  siteId: string;
  prefix: string;
  apiBase: string;
  manifest?: SiteManifest;
  dryRun?: boolean;
}

export const TOOL_NAME_RE = /^[a-z][a-z0-9_]{0,29}$/;
export const LIMITS = {
  toolName: 30,
  toolDescription: 500,
  paramName: 30,
  paramDescription: 150,
  outputChars: 1500,
  maxTools: 8,
  maxSteps: 14,
} as const;

export const SENSITIVE_TEXT_RE =
  /\b(pay|place order|buy now|buy|purchase|book|reserve|delete|remove account|send|submit|confirm|checkout|subscribe|unsubscribe|transfer)\b/i;

export const EXTRACT_OPS: ReadonlySet<StepOp> = new Set(['extractText', 'extractFields', 'extractList', 'fetchJson', 'readStorage']);

export function proxyAllowed(m: Pick<SiteManifest, 'proxy'>): boolean {
  return m.proxy?.allowed !== false;
}

export function publicManifest(m: SiteManifest): SiteManifest {
  return { ...m, tools: m.tools.filter((t) => t.enabled && t.verification.status !== 'failed') };
}
