import type { Cell, DataRecord, Diff, Dropped, Issue, RawRecord, Recipe, Run, RunData, SourceStat, Step, StepId } from './types';
import { INTENTS } from './schema';
import { sourceById } from './sources';
import { EU, locationTerms } from './geo';
import { cosine, embed, loadModel } from './embed';
import { clip, display, norm, pool, tokens, uid } from './util';

const STEP_LABELS: Record<StepId, string> = {
  understand: 'Understand request',
  ground: 'Check permissions & resolve filters',
  fetch: 'Collect from sources',
  extract: 'Extract & filter',
  validate: 'Validate fields',
  dedupe: 'Deduplicate & merge',
  rank: 'Rank by relevance',
  publish: 'Publish dataset',
};

export interface RunOptions {
  trigger: Run['trigger'];
  previous?: { run: Run; data: RunData } | null;
  semantic: boolean;
  githubToken?: string;
  onUpdate: (run: Run, data?: RunData) => void;
}

export interface RunHandle {
  run: Run;
  cancel: () => void;
  done: Promise<{ run: Run; data: RunData }>;
}

class Cancelled extends Error {}

export function startRun(recipe: Recipe, opts: RunOptions): RunHandle {
  const ctrl = new AbortController();
  const run: Run = {
    id: uid('run_'),
    recipeId: recipe.id,
    recipeTitle: recipe.title,
    intent: recipe.intent,
    status: 'running',
    trigger: opts.trigger,
    startedAt: Date.now(),
    steps: (Object.keys(STEP_LABELS) as StepId[]).map((id) => ({ id, label: STEP_LABELS[id], status: 'pending', log: [] })),
    sources: recipe.sources.map((s) => ({ sourceId: s.id, status: s.enabled ? 'pending' : 'skipped', requests: 0, received: 0, kept: 0, ms: 0, calls: [] })),
    stats: { fetched: 0, dropped: 0, merged: 0, final: 0, avgQuality: 0 },
  };
  let lastEmit = 0;
  const emit = (force = false) => {
    const now = Date.now();
    if (!force && now - lastEmit < 120) return;
    lastEmit = now;
    opts.onUpdate(structuredClone(run));
  };
  const done = execute(recipe, run, ctrl.signal, opts, emit).then(
    (data) => {
      run.status = 'done';
      run.endedAt = Date.now();
      opts.onUpdate(structuredClone(run), data);
      return { run, data };
    },
    (err) => {
      const cancelled = err instanceof Cancelled || ctrl.signal.aborted;
      run.status = cancelled ? 'cancelled' : 'failed';
      run.error = cancelled ? 'Cancelled by user' : String(err?.message ?? err);
      run.endedAt = Date.now();
      for (const s of run.steps) if (s.status === 'running' || s.status === 'pending') s.status = s.status === 'running' ? 'failed' : 'skipped';
      for (const s of run.sources) if (s.status === 'running' || s.status === 'pending') s.status = 'skipped';
      const data = { records: [], dropped: [] };
      opts.onUpdate(structuredClone(run), data);
      return { run, data };
    },
  );
  return { run, cancel: () => ctrl.abort(), done };
}

async function execute(recipe: Recipe, run: Run, signal: AbortSignal, opts: RunOptions, emit: (f?: boolean) => void): Promise<RunData> {
  const def = INTENTS[recipe.intent];
  const step = (id: StepId) => run.steps.find((s) => s.id === id)!;
  const begin = (id: StepId) => {
    if (signal.aborted) throw new Cancelled();
    const s = step(id);
    s.status = 'running';
    s.startedAt = Date.now();
    emit(true);
    return s;
  };
  const end = (s: Step, detail: string, status: Step['status'] = 'done') => {
    s.status = status;
    s.endedAt = Date.now();
    s.detail = detail;
    emit(true);
  };

  // 1 — Understand
  let s = begin('understand');
  s.log.push(`Brief: “${recipe.brief}”`);
  recipe.planNotes.forEach((n) => s.log.push(n.replace(/\*\*/g, '')));
  s.log.push(`Planner: ${recipe.plannedBy === 'claude' ? 'Claude' : 'on-device rules + embeddings'}`);
  end(s, `${def.label}${recipe.keywords.length ? ` · “${recipe.keywords.join('”, “')}”` : ''}`);

  // 2 — Permissions & filters
  s = begin('ground');
  const enabled = recipe.sources.filter((x) => x.enabled);
  for (const pick of enabled) {
    const src = sourceById(pick.id);
    if (!src) throw new Error(`Unknown source ${pick.id}`);
    s.log.push(`✓ ${src.name}: ${src.terms}`);
  }
  if (!enabled.length) throw new Error('No sources enabled for this recipe.');
  const locTerms = locationTerms(recipe.country, recipe.city);
  if (recipe.country) s.log.push(`Location terms: ${locTerms.slice(0, 10).join(', ')}${locTerms.length > 10 ? '…' : ''}`);
  if (opts.semantic) {
    s.log.push('Warming on-device embedding model in the background');
    void loadModel();
  }
  end(s, `${enabled.length} permitted source${enabled.length > 1 ? 's' : ''} · public APIs only`);

  // 3 — Fetch
  s = begin('fetch');
  const ground: Record<string, any> = {};
  const raws: RawRecord[] = [];
  await pool(enabled, 4, async (pick) => {
    const src = sourceById(pick.id)!;
    const stat = run.sources.find((x) => x.sourceId === pick.id)!;
    stat.status = 'running';
    const t0 = performance.now();
    emit();
    const call = async (url: string, init?: RequestInit) => {
      if (signal.aborted) throw new Cancelled();
      stat.requests++;
      stat.calls.push(url);
      const headers: Record<string, string> = { Accept: 'application/json' };
      if (opts.githubToken && url.startsWith('https://api.github.com')) headers.Authorization = `Bearer ${opts.githubToken}`;
      if (url.startsWith('https://query.wikidata.org')) headers.Accept = 'application/sparql-results+json';
      const timeout = AbortSignal.timeout(30000);
      const res = await fetch(url, { ...init, headers, signal: AbortSignal.any([signal, timeout]) });
      if (!res.ok) {
        const hint = res.status === 403 || res.status === 429 ? ' (rate limit — try again shortly)' : '';
        throw new Error(`HTTP ${res.status}${hint}`);
      }
      return res.json();
    };
    try {
      const got = await src.fetch({ recipe, signal, call, ground, log: (m) => s.log.push(`${src.name}: ${m}`) });
      stat.received = got.length;
      stat.status = 'done';
      raws.push(...got);
      s.log.push(`${src.name}: ${got.length} raw records from ${stat.requests} request${stat.requests > 1 ? 's' : ''}`);
    } catch (e) {
      if (signal.aborted) throw new Cancelled();
      stat.status = 'failed';
      stat.error = String((e as Error).message ?? e);
      s.log.push(`${src.name}: failed — ${stat.error}`);
    }
    stat.ms = performance.now() - t0;
    emit();
  });
  run.stats.fetched = raws.length;
  const okSources = run.sources.filter((x) => x.status === 'done').length;
  if (!okSources) throw new Error('Every source failed. Check your connection or try again in a minute.');
  end(s, `${raws.length} raw records from ${okSources}/${enabled.length} sources`);

  // 4 — Extract & filter
  s = begin('extract');
  const dropped: Dropped[] = [];
  const labelOf = (r: { fields: Record<string, Cell> }) => display(r.fields[def.labelField]?.value) || '(untitled)';
  const urlOf = (r: { fields: Record<string, Cell> }) => (r.fields.url?.value as string) || undefined;
  const kwTokenSets = recipe.keywords.map((k) => tokens(k)).filter((t) => t.length);
  const kept: RawRecord[] = [];
  for (const r of raws) {
    const reasons: string[] = [];
    const src = sourceById(r.sourceId)!;
    const hay = (r.text + ' ' + Object.values(r.fields).map((c) => display(c.value)).join(' ')).toLowerCase();
    const hayTokens = new Set(tokens(hay));
    const covers = (set: string[]) => set.filter((t) => hayTokens.has(t) || hay.includes(t)).length >= (set.length > 2 ? set.length - 1 : set.length);
    // Job boards' own search is loose (tags, full descriptions), so jobs are always checked locally.
    if ((!src.serverSearch || recipe.intent === 'jobs') && kwTokenSets.length && !kwTokenSets.some(covers)) reasons.push(`No mention of ${recipe.keywords.map((k) => `“${k}”`).join(' or ')}`);
    for (const ex of recipe.excludes) if (ex && hay.includes(ex.toLowerCase())) reasons.push(`Mentions excluded term “${ex}”`);
    if (recipe.intent === 'jobs') {
      const remote = r.fields.remote?.value;
      if (recipe.remote === true && remote === false) reasons.push('Not remote');
      if (recipe.remote === false && remote === true) reasons.push('Remote role (on-site requested)');
      if (recipe.country) {
        const loc = display(r.fields.location?.value).toLowerCase();
        const inPlace = locTerms.some((t) => loc.includes(t.trim()));
        const openToAll = remote === true && (/worldwide|anywhere|global|^remote$|remote \(global\)/.test(loc) || !loc);
        const region = remote === true && ((EU.has(recipe.country) && /europe|emea|\beu\b|cet|cest/.test(loc)) || (['US', 'CA', 'MX', 'BR'].includes(recipe.country) && /americas|north america/.test(loc)) || (['IN', 'SG', 'ID', 'PH', 'VN', 'MY', 'TH', 'JP', 'KR', 'AU'].includes(recipe.country) && /apac|asia/.test(loc)));
        if (!inPlace && !openToAll && !region) reasons.push(`Location “${display(r.fields.location?.value) || 'unknown'}” is outside ${recipe.city ?? recipe.countryName}`);
      }
    }
    if (recipe.since) {
      const dateKey = def.fields.find((f) => f.type === 'date' && ['posted', 'updated'].includes(f.key))?.key;
      const v = dateKey ? (r.fields[dateKey]?.value as string | null) : null;
      if (v && v < recipe.since) reasons.push(`Dated ${v}, before ${recipe.since}`);
      if (recipe.intent === 'research') {
        const y = r.fields.year?.value as number | null;
        if (y && y < +recipe.since.slice(0, 4)) reasons.push(`Published ${y}, before ${recipe.since.slice(0, 4)}`);
      }
    }
    if (reasons.length) dropped.push({ label: labelOf(r), sourceId: r.sourceId, reasons, url: urlOf(r) });
    else kept.push(r);
  }
  s.log.push(`${kept.length} kept, ${dropped.length} filtered out by the recipe’s constraints`);
  end(s, `${kept.length} match the recipe, ${dropped.length} filtered`);

  // 5 — Validate
  s = begin('validate');
  const validated: { raw: RawRecord; issues: Issue[] }[] = [];
  let fixes = 0;
  for (const r of kept) {
    const issues: Issue[] = [];
    for (const f of recipe.fields) {
      const c = r.fields[f.key];
      if (!c) {
        r.fields[f.key] = { value: null, prov: [] };
        continue;
      }
      let v = c.value;
      if (typeof v === 'string') {
        v = v.replace(/\s+/g, ' ').trim();
        if (!v) v = null;
      }
      if (v !== null)
        switch (f.type) {
          case 'url':
            try {
              const u = new URL(String(v));
              if (!/^https?:$/.test(u.protocol)) throw 0;
            } catch {
              issues.push({ field: f.key, level: 'warn', message: `Invalid URL “${clip(String(v), 40)}” removed` });
              v = null;
              fixes++;
            }
            break;
          case 'date': {
            const d = new Date(String(v));
            if (isNaN(d.getTime())) {
              issues.push({ field: f.key, level: 'warn', message: 'Unparseable date removed' });
              v = null;
            } else if (d.getTime() > Date.now() + 2 * 86400000) issues.push({ field: f.key, level: 'warn', message: 'Date is in the future' });
            break;
          }
          case 'number':
            if (typeof v !== 'number' || !Number.isFinite(v)) {
              const n = parseFloat(String(v));
              if (Number.isFinite(n)) {
                v = n;
                fixes++;
              } else {
                issues.push({ field: f.key, level: 'warn', message: 'Non-numeric value removed' });
                v = null;
              }
            }
            break;
          case 'money':
            if (!/\d/.test(String(v))) {
              issues.push({ field: f.key, level: 'warn', message: `“${clip(String(v), 30)}” has no amount` });
              v = null;
            }
            break;
          case 'tags':
            if (Array.isArray(v)) v = [...new Set(v.map((x) => String(x).trim()).filter(Boolean))].slice(0, 12);
            break;
        }
      c.value = v;
    }
    const missing = recipe.fields.filter((f) => f.required && (r.fields[f.key]?.value === null || r.fields[f.key]?.value === undefined || (Array.isArray(r.fields[f.key].value) && !(r.fields[f.key].value as string[]).length)));
    if (missing.length) {
      dropped.push({ label: labelOf(r), sourceId: r.sourceId, reasons: missing.map((f) => `Missing required field “${f.label}”`), url: urlOf(r) });
      continue;
    }
    validated.push({ raw: r, issues });
  }
  run.stats.dropped = dropped.length;
  s.log.push(`${fixes} values normalised; ${kept.length - validated.length} records failed required-field checks`);
  end(s, `${validated.length} valid · ${kept.length - validated.length} rejected`);

  // 6 — Dedupe
  s = begin('dedupe');
  const firstMode = recipe.intent === 'research' || recipe.intent === 'discussions';
  const keyOf = (r: RawRecord) => {
    const parts = def.keyFields.map((k) => norm(display(r.fields[k]?.value)));
    if (firstMode) return parts.find(Boolean) ?? uid();
    return parts.join('|') || uid();
  };
  const byKey = new Map<string, DataRecord>();
  let merged = 0;
  const conflicts: string[] = [];
  const mergeInto = (target: DataRecord, raw: RawRecord, issues: Issue[]) => {
    // The same listing returned by two queries to one source is a re-fetch, not corroboration.
    const sameListing = target.sources.includes(raw.sourceId) && target.fields.url?.value === raw.fields.url?.value;
    if (sameListing) return;
    merged++;
    target.mergedFrom++;
    if (!target.sources.includes(raw.sourceId)) target.sources.push(raw.sourceId);
    for (const [k, c] of Object.entries(raw.fields)) {
      const t = target.fields[k];
      if (!t || t.value === null) {
        target.fields[k] = c;
        continue;
      }
      if (c.value === null) continue;
      const a = norm(display(t.value));
      const b = norm(display(c.value));
      if (a === b) t.prov.push(...c.prov);
      else if (k !== 'url' && k !== 'tags' && k !== 'description') {
        t.prov.push(...c.prov.map((p) => ({ ...p, transform: `Disagrees: “${clip(display(c.value), 60)}” — kept first value` })));
        if (!target.issues.some((i) => i.field === k)) target.issues.push({ field: k, level: 'warn', message: `Sources disagree on ${def.fields.find((f) => f.key === k)?.label ?? k}` });
        conflicts.push(k);
      }
    }
    target.issues.push(...issues.filter((i) => !target.issues.some((j) => j.field === i.field)));
    target.text = target.text.length > raw.text.length ? target.text : raw.text;
  };
  for (const { raw, issues } of validated) {
    const key = keyOf(raw);
    const ex = byKey.get(key);
    if (ex) mergeInto(ex, raw, issues);
    else byKey.set(key, { id: uid('rec_'), key, fields: raw.fields, text: raw.text, sources: [raw.sourceId], relevance: 0, quality: 0, issues: [...issues], mergedFrom: 1 });
  }
  s.log.push(`${merged} exact duplicates merged by ${def.keyFields.join(' + ')}`);
  let records = [...byKey.values()];

  // Semantic near-duplicates (e.g. same role posted with slightly different titles on two boards).
  const semanticDedupe = opts.semantic && ['jobs', 'research', 'discussions', 'companies'].includes(recipe.intent) && records.length > 1 && records.length <= 700;
  if (semanticDedupe) {
    const label = (r: DataRecord) => (recipe.intent === 'jobs' ? `${display(r.fields.title?.value)} at ${display(r.fields.company?.value)}` : display(r.fields[def.labelField]?.value));
    const vecs = await embed(records.map(label));
    if (signal.aborted) throw new Cancelled();
    if (vecs) {
      const gone = new Set<number>();
      const threshold = recipe.intent === 'jobs' ? 0.93 : 0.96;
      let near = 0;
      for (let i = 0; i < records.length; i++) {
        if (gone.has(i)) continue;
        for (let j = i + 1; j < records.length; j++) {
          if (gone.has(j)) continue;
          if (recipe.intent === 'jobs' && norm(display(records[i].fields.company?.value)) !== norm(display(records[j].fields.company?.value))) continue;
          if (records[i].sources.some((x) => records[j].sources.includes(x)) && recipe.intent !== 'jobs') continue;
          if (cosine(vecs[i], vecs[j]) >= threshold) {
            const other = records[j];
            mergeInto(records[i], { sourceId: other.sources[0], fields: other.fields, text: other.text }, other.issues);
            other.sources.slice(1).forEach((x) => !records[i].sources.includes(x) && records[i].sources.push(x));
            gone.add(j);
            near++;
          }
        }
      }
      records = records.filter((_, i) => !gone.has(i));
      s.log.push(`${near} near-duplicates merged by on-device semantic similarity (≥ ${threshold})`);
    } else s.log.push('Semantic dedupe skipped: embedding model unavailable');
  }
  run.stats.merged = merged;
  if (conflicts.length) s.log.push(`${conflicts.length} field conflicts between sources flagged for review`);
  end(s, `${records.length} unique · ${merged} merged${conflicts.length ? ` · ${conflicts.length} conflicts` : ''}`);

  // 7 — Rank
  s = begin('rank');
  // Rank against what the user is actually looking for, not the filler around it ("posted in the last 14 days…").
  const focus = [...recipe.keywords, ...recipe.context].join(' ');
  const query = focus ? `${focus} ${def.entity.toLowerCase()}` : recipe.brief;
  const kwSets = recipe.keywords.map(tokens).filter((t) => t.length);
  const keywordHit = (r: DataRecord) => {
    if (!kwSets.length) return 1;
    const title = new Set(tokens(display(r.fields[def.labelField]?.value)));
    const body = new Set(tokens(r.text + ' ' + display(r.fields.tags?.value)));
    const inTitle = kwSets.some((set) => set.every((t) => title.has(t)));
    const inBody = kwSets.some((set) => set.every((t) => body.has(t)));
    return inTitle ? 1 : inBody ? 0.6 : 0;
  };
  let usedSemantic = false;
  if (opts.semantic && !['crypto', 'economy'].includes(recipe.intent) && records.length) {
    const vecs = await embed([query, ...records.map((r) => clip(r.text, 480))]);
    if (signal.aborted) throw new Cancelled();
    if (vecs) {
      usedSemantic = true;
      const sims = records.map((_, i) => cosine(vecs[0], vecs[i + 1]));
      const lo = Math.min(...sims);
      const hi = Math.max(...sims);
      records.forEach((r, i) => {
        const sem = hi - lo > 1e-6 ? (sims[i] - lo) / (hi - lo) : 1;
        r.relevance = Math.max(0.05, Math.min(1, 0.6 * sem + 0.4 * keywordHit(r)));
      });
    }
  }
  if (!usedSemantic) {
    const q = new Set([...recipe.keywords.flatMap(tokens), ...recipe.context.flatMap(tokens)]);
    records.forEach((r) => {
      if (['crypto', 'economy'].includes(recipe.intent) || !q.size) return void (r.relevance = 1);
      const t = new Set(tokens(r.text));
      const title = new Set(tokens(display(r.fields[def.labelField]?.value)));
      let hit = 0;
      q.forEach((w) => (hit += (t.has(w) ? 1 : 0) + (title.has(w) ? 0.5 : 0)));
      r.relevance = Math.min(1, 0.2 + (0.8 * hit) / (q.size * 1.5));
    });
  }
  const popKey = def.fields.find((f) => ['citations', 'stars', 'score', 'marketCap', 'employees'].includes(f.key))?.key;
  const dateKey = def.fields.find((f) => f.type === 'date')?.key;
  const pops = popKey ? records.map((r) => Math.log10(1 + ((r.fields[popKey]?.value as number) || 0))) : [];
  const maxPop = Math.max(1, ...pops);
  const order = (r: DataRecord, i: number) => {
    if (recipe.intent === 'crypto') return -((r.fields.rank?.value as number) ?? 1e9);
    if (recipe.intent === 'economy') return 0;
    let score = r.relevance;
    if (recipe.sort === 'popular' && popKey) score = 0.55 * r.relevance + 0.45 * (pops[i] / maxPop);
    if (recipe.sort === 'recent' && dateKey) {
      const d = r.fields[dateKey]?.value as string | null;
      const age = d ? (Date.now() - new Date(d).getTime()) / 86400000 : 3650;
      score = 0.55 * r.relevance + 0.45 * Math.max(0, 1 - age / 365);
    }
    if (recipe.intent === 'jobs' && locTerms.length && locTerms.some((t) => display(r.fields.location?.value).toLowerCase().includes(t.trim()))) score += 0.12;
    return score + r.sources.length * 0.03;
  };
  const scored = records.map((r, i) => ({ r, o: order(r, i) }));
  if (recipe.intent === 'economy')
    scored.sort((a, b) => display(a.r.fields.country?.value).localeCompare(display(b.r.fields.country?.value)) || ((b.r.fields.year?.value as number) ?? 0) - ((a.r.fields.year?.value as number) ?? 0));
  else scored.sort((a, b) => b.o - a.o);
  records = scored.map((x) => x.r);
  const overflow = Math.max(0, records.length - recipe.limit);
  records = records.slice(0, recipe.limit);

  // Quality: share of visible fields populated, minus warnings, plus corroboration.
  const vis = recipe.fields.filter((f) => f.visible);
  for (const r of records) {
    const filled = vis.filter((f) => {
      const v = r.fields[f.key]?.value;
      return v !== null && v !== undefined && !(Array.isArray(v) && !v.length);
    }).length;
    const corroborated = Object.values(r.fields).some((c) => new Set(c.prov.map((p) => p.sourceId)).size > 1);
    r.quality = Math.max(0, Math.min(1, filled / vis.length - 0.08 * r.issues.length + (corroborated ? 0.05 : 0)));
  }
  s.log.push(usedSemantic ? 'Ranked by on-device semantic similarity to the brief' : 'Ranked by keyword overlap (semantic model off or unavailable)');
  if (overflow) s.log.push(`${overflow} lower-ranked records beyond the target size of ${recipe.limit} were not kept`);
  end(s, `${usedSemantic ? 'Semantic' : 'Lexical'} ranking${overflow ? ` · top ${recipe.limit} kept` : ''}`);

  // 8 — Publish
  s = begin('publish');
  for (const stat of run.sources) stat.kept = records.filter((r) => r.sources.includes(stat.sourceId)).length;
  run.stats.final = records.length;
  run.stats.avgQuality = records.length ? records.reduce((a, r) => a + r.quality, 0) / records.length : 0;
  run.diff = opts.previous ? diffRuns(opts.previous, records, recipe) : null;
  if (run.diff) s.log.push(`Compared with previous run: +${run.diff.added.length} new, −${run.diff.removed.length} gone, ${run.diff.changed.length} changed`);
  end(s, `${records.length} records${run.diff ? ` · +${run.diff.added.length} / −${run.diff.removed.length} vs last run` : ''}`);
  return { records, dropped };
}

function diffRuns(prev: { run: Run; data: RunData }, records: DataRecord[], recipe: Recipe): Diff {
  const def = INTENTS[recipe.intent];
  const before = new Map(prev.data.records.map((r) => [r.key, r]));
  const now = new Map(records.map((r) => [r.key, r]));
  const tracked = recipe.fields.filter((f) => f.visible && f.key !== 'url').map((f) => f.key);
  const changed: Diff['changed'] = [];
  for (const [k, r] of now) {
    const old = before.get(k);
    if (!old) continue;
    const fields = tracked
      .map((f) => ({ field: f, before: display(old.fields[f]?.value), after: display(r.fields[f]?.value) }))
      .filter((x) => x.before !== x.after);
    if (fields.length) changed.push({ key: k, fields });
  }
  return {
    previousRunId: prev.run.id,
    added: [...now.keys()].filter((k) => !before.has(k)),
    removed: [...before.values()].filter((r) => !now.has(r.key)).map((r) => ({ key: r.key, label: display(r.fields[def.labelField]?.value) })),
    changed: changed.slice(0, 300),
  };
}

export { STEP_LABELS };
export type { SourceStat };
