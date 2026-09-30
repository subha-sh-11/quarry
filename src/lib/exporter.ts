import type { DataRecord, Recipe, Run } from './types';
import { sourceById } from './sources';
import { display } from './util';

const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

function download(name: string, body: string, type: string) {
  const blob = new Blob([body], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'dataset';

export function exportCsv(recipe: Recipe, run: Run, records: DataRecord[], withProvenance: boolean) {
  const fields = recipe.fields;
  const head = [...fields.map((f) => f.label), 'Sources', 'Relevance', 'Quality'];
  if (withProvenance) head.push(...fields.map((f) => `${f.label} · source path`));
  const rows = records.map((r) => {
    const row = [
      ...fields.map((f) => display(r.fields[f.key]?.value)),
      r.sources.map((s) => sourceById(s)?.name ?? s).join(' + '),
      r.relevance.toFixed(2),
      r.quality.toFixed(2),
    ];
    if (withProvenance) row.push(...fields.map((f) => (r.fields[f.key]?.prov ?? []).map((p) => `${p.sourceId}:${p.path}`).join(' | ')));
    return row.map(esc).join(',');
  });
  download(`${slug(recipe.title)}-${new Date(run.startedAt).toISOString().slice(0, 10)}.csv`, [head.map(esc).join(','), ...rows].join('\n'), 'text/csv;charset=utf-8');
}

export function exportJson(recipe: Recipe, run: Run, records: DataRecord[]) {
  const attributions = [...new Set(records.flatMap((r) => r.sources))].map((s) => ({ source: sourceById(s)?.name ?? s, attribution: sourceById(s)?.attribution, terms: sourceById(s)?.termsUrl }));
  const body = {
    dataset: recipe.title,
    brief: recipe.brief,
    collectedAt: new Date(run.startedAt).toISOString(),
    runId: run.id,
    recipe: { intent: recipe.intent, keywords: recipe.keywords, country: recipe.country ?? null, since: recipe.since ?? null, remote: recipe.remote ?? null, limit: recipe.limit },
    attributions,
    records: records.map((r) => ({
      ...Object.fromEntries(recipe.fields.map((f) => [f.key, r.fields[f.key]?.value ?? null])),
      _sources: r.sources,
      _relevance: +r.relevance.toFixed(3),
      _quality: +r.quality.toFixed(3),
      _issues: r.issues,
      _provenance: Object.fromEntries(recipe.fields.map((f) => [f.key, r.fields[f.key]?.prov ?? []])),
    })),
  };
  download(`${slug(recipe.title)}-${new Date(run.startedAt).toISOString().slice(0, 10)}.json`, JSON.stringify(body, null, 2), 'application/json');
}
