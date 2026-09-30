export type Intent = 'jobs' | 'companies' | 'research' | 'opensource' | 'discussions' | 'crypto' | 'economy';

export type FieldType = 'text' | 'url' | 'date' | 'number' | 'money' | 'bool' | 'tags';

export interface FieldSpec {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  /** Shown as a column by default. */
  visible?: boolean;
}

export interface SourcePick {
  id: string;
  enabled: boolean;
  reason: string;
}

export interface Recipe {
  id: string;
  title: string;
  brief: string;
  intent: Intent;
  keywords: string[];
  context: string[];
  excludes: string[];
  country?: string; // ISO-3166 alpha-2
  countries?: string[];
  countryName?: string;
  city?: string;
  remote?: boolean;
  since?: string; // YYYY-MM-DD
  limit: number;
  sort: 'relevance' | 'recent' | 'popular';
  indicator?: string; // economy only
  fields: FieldSpec[];
  sources: SourcePick[];
  plannedBy: 'local' | 'claude';
  planNotes: string[];
  watch?: { everyMin: number; nextAt?: number } | null;
  createdAt: number;
  updatedAt: number;
}

/** A receipt: where exactly one value came from. */
export interface Provenance {
  sourceId: string;
  recordUrl?: string;
  apiUrl: string;
  path: string;
  raw: string;
  transform?: string;
  fetchedAt: number;
}

export interface Cell {
  value: string | number | boolean | string[] | null;
  prov: Provenance[];
}

export interface Issue {
  field: string;
  level: 'error' | 'warn';
  message: string;
}

export interface DataRecord {
  id: string;
  key: string;
  fields: Record<string, Cell>;
  text: string;
  sources: string[];
  relevance: number;
  quality: number;
  issues: Issue[];
  mergedFrom: number;
}

export interface RawRecord {
  sourceId: string;
  fields: Record<string, Cell>;
  text: string;
}

export type StepId = 'understand' | 'ground' | 'fetch' | 'extract' | 'validate' | 'dedupe' | 'rank' | 'publish';
export type StepStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped';

export interface Step {
  id: StepId;
  label: string;
  status: StepStatus;
  startedAt?: number;
  endedAt?: number;
  detail?: string;
  log: string[];
}

export interface SourceStat {
  sourceId: string;
  status: 'pending' | 'running' | 'done' | 'failed' | 'skipped';
  requests: number;
  received: number;
  kept: number;
  ms: number;
  error?: string;
  calls: string[];
}

export interface Diff {
  previousRunId: string;
  added: string[];
  removed: { key: string; label: string }[];
  changed: { key: string; fields: { field: string; before: string; after: string }[] }[];
}

export interface Run {
  id: string;
  recipeId: string;
  recipeTitle: string;
  intent: Intent;
  status: 'running' | 'done' | 'failed' | 'cancelled';
  trigger: 'manual' | 'watch';
  startedAt: number;
  endedAt?: number;
  steps: Step[];
  sources: SourceStat[];
  stats: { fetched: number; dropped: number; merged: number; final: number; avgQuality: number };
  diff?: Diff | null;
  error?: string;
}

export interface Dropped {
  label: string;
  sourceId: string;
  reasons: string[];
  url?: string;
}

export interface RunData {
  records: DataRecord[];
  dropped: Dropped[];
}

export interface FetchCtx {
  recipe: Recipe;
  signal: AbortSignal;
  log: (msg: string) => void;
  call: (url: string, init?: RequestInit) => Promise<any>;
  ground: Record<string, any>;
}

export interface SourceDef {
  id: string;
  name: string;
  host: string;
  intents: Intent[];
  provides: string;
  terms: string;
  termsUrl: string;
  attribution: string;
  rate: string;
  /** Returns true if the source can apply the keyword filter itself. */
  serverSearch: boolean;
  /** Relative strength for a given recipe, used to explain selection. */
  fit?: (r: Recipe) => { score: number; reason: string };
  fetch: (ctx: FetchCtx) => Promise<RawRecord[]>;
}

export interface Settings {
  planner: 'local' | 'claude';
  anthropicKey: string;
  githubToken: string;
  semantic: boolean;
}
