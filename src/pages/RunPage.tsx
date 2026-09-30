import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowDownUp, Clock, Download, ExternalLink, Eye, FileJson, FileSpreadsheet, Filter, Layers, Pencil, RotateCw, Search, ShieldCheck, Square, X } from 'lucide-react';
import type { DataRecord, FieldSpec, Recipe, Run, RunData } from '../lib/types';
import { INTENTS } from '../lib/schema';
import { sourceById } from '../lib/sources';
import { cancelRun, getRunData, isLive, peekRunData, runRecipe, setWatch, useStore } from '../lib/store';
import { exportCsv, exportJson } from '../lib/exporter';
import { ago, clip, display, dur, hostOf } from '../lib/util';
import { CellValue, Menu, Meter, RunBadge, SourceChips, StepIcon, abbr, go, toast, useNow } from '../components/ui';

type Tab = 'data' | 'workflow' | 'sources' | 'dropped' | 'changes';

export default function RunPage({ runId }: { runId: string }) {
  const run = useStore((s) => s.runs.find((r) => r.id === runId));
  const recipe = useStore((s) => s.recipes.find((r) => r.id === run?.recipeId));
  const history = useStore((s) => s.runs.filter((r) => r.recipeId === run?.recipeId));
  const [data, setData] = useState<RunData | null>(() => peekRunData(runId));
  const [tab, setTab] = useState<Tab>('data');
  useNow(run?.status === 'running' ? 500 : 30000);

  useEffect(() => {
    if (run?.status !== 'running') void getRunData(runId).then(setData);
  }, [runId, run?.status]);

  if (!run)
    return (
      <div className="page">
        <div className="card empty">
          <h3>Run not found</h3>
          <p>It may have been deleted or pruned from history.</p>
          <a className="btn" href="#/runs">
            All runs
          </a>
        </div>
      </div>
    );

  const running = run.status === 'running';
  const elapsed = (run.endedAt ?? Date.now()) - run.startedAt;
  const def = INTENTS[run.intent];
  const records = data?.records ?? [];
  const dropped = data?.dropped ?? [];

  const rerun = async () => {
    if (!recipe) return;
    const id = await runRecipe(recipe);
    go(`/run/${id}`);
  };

  return (
    <div className="page">
      <div className="page-head">
        <div style={{ minWidth: 0 }}>
          <div className="crumbs">
            <a href="#/runs">Runs</a> / <span className="truncate">{run.recipeTitle}</span>
          </div>
          <h1 className="truncate">{run.recipeTitle}</h1>
          <div className="run-meta">
            <RunBadge status={run.status} />
            <span>
              <Layers /> {def.label}
            </span>
            <span>
              <Clock /> {ago(run.startedAt)} · {dur(elapsed)}
            </span>
            {run.trigger === 'watch' && <span className="badge blue">Scheduled</span>}
            {!running && run.status === 'done' && (
              <span>
                <ShieldCheck /> {run.stats.final} records · quality {Math.round(run.stats.avgQuality * 100)}
              </span>
            )}
          </div>
        </div>
        <div className="btn-group">
          {running && isLive(run.id) ? (
            <button className="btn btn-danger" onClick={() => cancelRun(run.id)}>
              <Square /> Cancel
            </button>
          ) : (
            recipe && (
              <>
                <a className="btn" href={`#/recipe/${recipe.id}/edit`}>
                  <Pencil /> Edit recipe
                </a>
                <button className="btn" onClick={rerun}>
                  <RotateCw /> Re-run
                </button>
              </>
            )
          )}
          {recipe && !running && records.length > 0 && <ExportMenu recipe={recipe} run={run} records={records} />}
        </div>
      </div>

      <Pipeline run={run} />

      {run.status === 'failed' && (
        <div className="callout clay" style={{ marginBottom: 16 }}>
          <AlertTriangle />
          <div>
            <b>Run failed.</b> {run.error}
          </div>
        </div>
      )}

      <div className="tabs" role="tablist">
        <TabBtn on={tab === 'data'} set={() => setTab('data')} n={running ? undefined : records.length}>
          Dataset
        </TabBtn>
        <TabBtn on={tab === 'workflow'} set={() => setTab('workflow')}>
          Workflow log
        </TabBtn>
        <TabBtn on={tab === 'sources'} set={() => setTab('sources')} n={run.sources.filter((s) => s.status !== 'skipped').length}>
          Sources
        </TabBtn>
        <TabBtn on={tab === 'dropped'} set={() => setTab('dropped')} n={running ? undefined : dropped.length}>
          Filtered out
        </TabBtn>
        {run.diff && (
          <TabBtn on={tab === 'changes'} set={() => setTab('changes')} n={run.diff.added.length + run.diff.removed.length + run.diff.changed.length}>
            Changes
          </TabBtn>
        )}
      </div>

      {tab === 'data' &&
        (running ? (
          <LiveProgress run={run} />
        ) : recipe ? (
          <DataTable recipe={recipe} run={run} records={records} />
        ) : (
          <div className="card empty">Recipe was deleted.</div>
        ))}
      {tab === 'workflow' && <WorkflowLog run={run} />}
      {tab === 'sources' && <SourcesTab run={run} />}
      {tab === 'dropped' && <DroppedTab data={data} />}
      {tab === 'changes' && run.diff && recipe && <ChangesTab run={run} records={records} recipe={recipe} />}

      {recipe && !running && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-head">
            <h3>Monitoring</h3>
            <span className="hint">{history.length} run{history.length === 1 ? '' : 's'} of this recipe</span>
          </div>
          <div className="card-pad row wrap" style={{ gap: 14 }}>
            <span className="soft" style={{ fontSize: 13 }}>
              Re-run automatically while Quarry is open, and diff each result against the previous one.
            </span>
            <span className="spacer" />
            <select className="select" style={{ width: 180 }} value={recipe.watch?.everyMin ?? ''} onChange={(e) => (setWatch(recipe, e.target.value ? +e.target.value : null), toast(e.target.value ? 'Watching this recipe' : 'Stopped watching'))}>
              <option value="">Not watching</option>
              <option value="15">Every 15 minutes</option>
              <option value="60">Every hour</option>
              <option value="360">Every 6 hours</option>
              <option value="1440">Every day</option>
            </select>
          </div>
          {history.length > 1 && (
            <div className="table-wrap" style={{ borderTop: '1px solid var(--line)' }}>
              <table className="t">
                <thead>
                  <tr>
                    <th>Started</th>
                    <th>Status</th>
                    <th className="r">Records</th>
                    <th className="r">New</th>
                    <th className="r">Gone</th>
                    <th className="r">Changed</th>
                  </tr>
                </thead>
                <tbody>
                  {history.slice(0, 8).map((h) => (
                    <tr key={h.id} className={`click ${h.id === run.id ? 'sel' : ''}`} onClick={() => go(`/run/${h.id}`)}>
                      <td className="nowrap">{new Date(h.startedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</td>
                      <td>
                        <RunBadge status={h.status} />
                      </td>
                      <td className="r num">{h.stats.final}</td>
                      <td className="r num">{h.diff ? `+${h.diff.added.length}` : '—'}</td>
                      <td className="r num">{h.diff ? `−${h.diff.removed.length}` : '—'}</td>
                      <td className="r num">{h.diff ? h.diff.changed.length : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TabBtn({ on, set, n, children }: { on: boolean; set: () => void; n?: number; children: React.ReactNode }) {
  return (
    <button role="tab" aria-selected={on} className={`tab ${on ? 'on' : ''}`} onClick={set}>
      {children}
      {n !== undefined && <span className="n">{n}</span>}
    </button>
  );
}

function Pipeline({ run }: { run: Run }) {
  return (
    <div className="card pipeline">
      {run.steps.map((s, i) => (
        <div key={s.id} className={`pipe ${s.status}`}>
          <div className="top">
            <StepIcon status={s.status} />
            <span className="idx">{String(i + 1).padStart(2, '0')}</span>
            {s.startedAt && s.endedAt && <span className="idx" style={{ marginLeft: 'auto' }}>{dur(s.endedAt - s.startedAt)}</span>}
          </div>
          <div className="lbl">{s.label}</div>
          <div className="det" title={s.detail}>{s.detail ?? (s.status === 'running' ? 'Working…' : s.status === 'skipped' ? 'Skipped' : 'Waiting')}</div>
        </div>
      ))}
    </div>
  );
}

function LiveProgress({ run }: { run: Run }) {
  const active = run.sources.filter((s) => s.status !== 'skipped');
  const done = active.filter((s) => s.status === 'done' || s.status === 'failed').length;
  const step = run.steps.find((s) => s.status === 'running');
  return (
    <div className="card">
      <div className="card-head">
        <h3>{step?.label ?? 'Starting'}…</h3>
        <span className="hint">{done}/{active.length} sources finished</span>
      </div>
      <div className="card-pad stack" style={{ gap: 12 }}>
        <div className="progress">
          <i style={{ width: `${(run.steps.filter((s) => s.status === 'done').length / run.steps.length) * 100}%` }} />
        </div>
        {active.map((s) => {
          const src = sourceById(s.sourceId)!;
          return (
            <div key={s.sourceId} className="row" style={{ fontSize: 13 }}>
              <StepIcon status={s.status === 'pending' ? 'pending' : s.status} />
              <span style={{ fontWeight: 500 }}>{src.name}</span>
              <span className="muted truncate">{s.status === 'failed' ? s.error : s.status === 'done' ? `${s.received} records · ${s.requests} requests` : s.status === 'running' ? `${s.requests} request${s.requests === 1 ? '' : 's'} sent` : 'queued'}</span>
              <span className="spacer" />
              {s.ms > 0 && <span className="mono muted">{dur(s.ms)}</span>}
            </div>
          );
        })}
        <pre className="log" style={{ margin: '4px -20px -18px', padding: '10px 20px' }}>
          {(step?.log ?? []).slice(-6).join('\n') || 'Preparing…'}
        </pre>
      </div>
    </div>
  );
}

type SortState = { key: string; dir: 1 | -1 } | null;

function DataTable({ recipe, run, records }: { recipe: Recipe; run: Run; records: DataRecord[] }) {
  const [q, setQ] = useState('');
  const [src, setSrc] = useState('');
  const [flag, setFlag] = useState<'' | 'multi' | 'issues' | 'new'>('');
  const [sort, setSort] = useState<SortState>(null);
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<DataRecord | null>(null);
  const cols = recipe.fields.filter((f) => f.visible);
  const added = useMemo(() => new Set(run.diff?.added ?? []), [run.diff]);
  const srcIds = useMemo(() => [...new Set(records.flatMap((r) => r.sources))], [records]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let out = records.filter((r) => {
      if (src && !r.sources.includes(src)) return false;
      if (flag === 'multi' && r.sources.length < 2) return false;
      if (flag === 'issues' && !r.issues.length) return false;
      if (flag === 'new' && !added.has(r.key)) return false;
      if (needle && !(Object.values(r.fields).map((c) => display(c.value)).join(' ') + ' ' + r.text).toLowerCase().includes(needle)) return false;
      return true;
    });
    if (sort) {
      out = [...out].sort((a, b) => {
        const av = sort.key === '_rel' ? a.relevance : sort.key === '_q' ? a.quality : a.fields[sort.key]?.value;
        const bv = sort.key === '_rel' ? b.relevance : sort.key === '_q' ? b.quality : b.fields[sort.key]?.value;
        if (av === null || av === undefined) return 1;
        if (bv === null || bv === undefined) return -1;
        return (typeof av === 'number' && typeof bv === 'number' ? av - bv : display(av).localeCompare(display(bv))) * sort.dir;
      });
    }
    return out;
  }, [records, q, src, flag, sort, added]);

  useEffect(() => setPage(1), [q, src, flag, sort]);
  const shown = rows.slice(0, page * 50);
  const toggleSort = (key: string) => setSort((s) => (s?.key === key ? (s.dir === -1 ? { key, dir: 1 } : null) : { key, dir: -1 }));

  if (!records.length)
    return (
      <div className="card empty">
        <h3>No records made it through</h3>
        <p>Check the “Filtered out” tab to see why, then loosen the recipe.</p>
        <a className="btn" href={`#/recipe/${recipe.id}/edit`}>
          <Pencil size={15} /> Edit recipe
        </a>
      </div>
    );

  return (
    <>
      <div className="card">
        <div className="toolbar">
          <div className="search">
            <Search />
            <input className="input" placeholder={`Search ${records.length} records`} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search records" />
          </div>
          <select className="select" value={src} onChange={(e) => setSrc(e.target.value)} aria-label="Filter by source">
            <option value="">All sources</option>
            {srcIds.map((s) => (
              <option key={s} value={s}>
                {sourceById(s)?.name}
              </option>
            ))}
          </select>
          <select className="select" value={flag} onChange={(e) => setFlag(e.target.value as typeof flag)} aria-label="Filter by flag">
            <option value="">All records</option>
            <option value="multi">Corroborated (2+ sources)</option>
            <option value="issues">Has validation notes</option>
            {run.diff && <option value="new">New since last run</option>}
          </select>
          <span className="spacer" />
          <span className="muted" style={{ fontSize: 12.5 }}>
            <Filter size={13} style={{ verticalAlign: -2 }} /> {rows.length} shown
          </span>
        </div>
        <div className="table-wrap">
          <table className="t">
            <thead>
              <tr>
                {cols.map((f) => (
                  <th key={f.key} className={`sortable ${['number'].includes(f.type) ? 'r' : ''}`} onClick={() => toggleSort(f.key)}>
                    {f.label} {sort?.key === f.key && <ArrowDownUp size={11} style={{ verticalAlign: -1 }} />}
                  </th>
                ))}
                <th>Sources</th>
                <th className="sortable" onClick={() => toggleSort('_rel')} title="Semantic match to your brief">
                  Match {sort?.key === '_rel' && <ArrowDownUp size={11} />}
                </th>
                <th className="sortable" onClick={() => toggleSort('_q')} title="Field completeness and validation">
                  Quality {sort?.key === '_q' && <ArrowDownUp size={11} />}
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} className={`click ${open?.id === r.id ? 'sel' : ''}`} onClick={() => setOpen(r)}>
                  {cols.map((f, i) => (
                    <td key={f.key} className={`${f.type === 'number' ? 'r' : ''} ${i === 0 ? 'primary' : ''}`} style={i === 0 ? { maxWidth: 320 } : undefined}>
                      {i === 0 ? (
                        <span className="row" style={{ gap: 6 }}>
                          {added.has(r.key) && <span className="badge green" style={{ height: 18, fontSize: 10.5, flex: 'none' }}>New</span>}
                          {r.issues.length > 0 && <AlertTriangle size={12} style={{ color: 'var(--sand)', flex: 'none' }} aria-label="Has validation notes" />}
                          <CellValue cell={r.fields[f.key]} field={f} />
                        </span>
                      ) : (
                        <CellValue cell={r.fields[f.key]} field={f} />
                      )}
                    </td>
                  ))}
                  <td>
                    <SourceChips ids={r.sources} />
                  </td>
                  <td>
                    <Meter value={r.relevance} />
                  </td>
                  <td>
                    <Meter value={r.quality} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="table-foot">
          <span>
            Click any row to see the receipt for every value. {[...new Set(records.flatMap((r) => r.sources))].map((s) => sourceById(s)?.attribution).join(' · ')}
          </span>
          {shown.length < rows.length && (
            <button className="btn btn-sm" onClick={() => setPage((p) => p + 1)}>
              Show 50 more
            </button>
          )}
        </div>
      </div>
      {open && <RecordDrawer record={open} recipe={recipe} onClose={() => setOpen(null)} isNew={added.has(open.key)} />}
    </>
  );
}

function RecordDrawer({ record, recipe, onClose, isNew }: { record: DataRecord; recipe: Recipe; onClose: () => void; isNew: boolean }) {
  const def = INTENTS[recipe.intent];
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  const title = display(record.fields[def.labelField]?.value) || '(untitled)';
  const fields: FieldSpec[] = [...recipe.fields.filter((f) => f.visible), ...recipe.fields.filter((f) => !f.visible)];
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label={title}>
        <div className="drawer-head">
          <div className="row">
            <span className="muted" style={{ fontSize: 12 }}>{def.entity}</span>
            {isNew && <span className="badge green">New since last run</span>}
            <span className="spacer" />
            <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close">
              <X />
            </button>
          </div>
          <h2>{title}</h2>
          <div className="row wrap" style={{ gap: 12, fontSize: 12.5 }}>
            <span className="muted">Match</span> <Meter value={record.relevance} />
            <span className="muted">Quality</span> <Meter value={record.quality} />
            <span className="muted">
              {record.sources.length > 1 ? `Corroborated by ${record.sources.length} sources` : `From ${sourceById(record.sources[0])?.name}`}
            </span>
          </div>
        </div>
        <div className="drawer-body">
          {record.issues.length > 0 && (
            <div className="callout" style={{ marginTop: 14, background: 'var(--sand-soft)', borderColor: '#e6dac8', color: 'var(--sand)' }}>
              <AlertTriangle />
              <div>
                {record.issues.map((i, k) => (
                  <div key={k}>{i.message}</div>
                ))}
              </div>
            </div>
          )}
          {fields.map((f) => {
            const c = record.fields[f.key];
            const provs = c?.prov ?? [];
            return (
              <div className="fblock" key={f.key}>
                <div className="fl">
                  <span className="fk">
                    {f.label}
                    {f.required && <span className="muted"> · required</span>}
                  </span>
                  {provs.length > 1 && new Set(provs.map((p) => p.sourceId)).size > 1 && <span className="badge green">{new Set(provs.map((p) => p.sourceId)).size} sources</span>}
                </div>
                <div className="fv">
                  <CellValue cell={c} field={f} full />
                </div>
                {provs.slice(0, 4).map((p, i) => (
                  <div className={`receipt ${p.transform?.startsWith('Disagrees') ? 'warn' : ''}`} key={i}>
                    <div className="receipt-row">
                      <span className="rk">Source</span>
                      <span className="rv">
                        {sourceById(p.sourceId)?.name} {p.recordUrl && (<a href={p.recordUrl} target="_blank" rel="noreferrer">· {hostOf(p.recordUrl)} <ExternalLink size={10} /></a>)}
                      </span>
                    </div>
                    <div className="receipt-row">
                      <span className="rk">Request</span>
                      <span className="rv">
                        <a href={p.apiUrl} target="_blank" rel="noreferrer" title={p.apiUrl}>
                          {clip(p.apiUrl.replace(/^https:\/\//, ''), 90)}
                        </a>
                      </span>
                    </div>
                    {p.path && (
                      <div className="receipt-row">
                        <span className="rk">Path</span>
                        <span className="rv">{p.path}</span>
                      </div>
                    )}
                    {p.raw && p.raw !== 'null' && p.raw !== display(c?.value) && (
                      <div className="receipt-row">
                        <span className="rk">Raw</span>
                        <span className="rv">{clip(p.raw, 220)}</span>
                      </div>
                    )}
                    {p.transform && (
                      <div className="receipt-row">
                        <span className="rk">Transform</span>
                        <span className="rv" style={{ fontFamily: 'var(--sans)' }}>{p.transform}</span>
                      </div>
                    )}
                    <div className="receipt-row">
                      <span className="rk">Fetched</span>
                      <span className="rv">{new Date(p.fetchedAt).toLocaleString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
          {record.text && (
            <div className="fblock">
              <div className="fl">
                <span className="fk">Context used for ranking</span>
              </div>
              <p className="soft" style={{ fontSize: 12.5 }}>{clip(record.text, 700)}</p>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

function ExportMenu({ recipe, run, records }: { recipe: Recipe; run: Run; records: DataRecord[] }) {
  return (
    <Menu
      trigger={(t) => (
        <button className="btn btn-primary" onClick={t}>
          <Download /> Export
        </button>
      )}
    >
      {(close) => (
        <>
          <button onClick={() => (exportCsv(recipe, run, records, false), close())}>
            <FileSpreadsheet />
            <div>
              CSV<div className="sub">Values only, ready for Sheets or Excel</div>
            </div>
          </button>
          <button onClick={() => (exportCsv(recipe, run, records, true), close())}>
            <FileSpreadsheet />
            <div>
              CSV with provenance<div className="sub">Adds a source-path column per field</div>
            </div>
          </button>
          <button onClick={() => (exportJson(recipe, run, records), close())}>
            <FileJson />
            <div>
              JSON<div className="sub">Full receipts, issues and attributions</div>
            </div>
          </button>
        </>
      )}
    </Menu>
  );
}

function WorkflowLog({ run }: { run: Run }) {
  const [openIds, setOpen] = useState<Set<string>>(new Set(['fetch', 'dedupe']));
  return (
    <div className="card steplist">
      {run.steps.map((s) => (
        <div key={s.id} className="sl">
          <div className="sh" style={{ cursor: s.log.length ? 'pointer' : 'default' }} onClick={() => setOpen((o) => new Set(o.has(s.id) ? [...o].filter((x) => x !== s.id) : [...o, s.id]))}>
            <StepIcon status={s.status} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 500 }}>{s.label}</div>
              <div className="d truncate">{s.detail ?? s.status}</div>
            </div>
            <span className="mono muted">{s.startedAt && s.endedAt ? dur(s.endedAt - s.startedAt) : ''}</span>
          </div>
          {openIds.has(s.id) && s.log.length > 0 && <pre className="log">{s.log.join('\n')}</pre>}
        </div>
      ))}
    </div>
  );
}

function SourcesTab({ run }: { run: Run }) {
  return (
    <div className="card">
      <div className="table-wrap">
        <table className="t">
          <thead>
            <tr>
              <th>Source</th>
              <th>Status</th>
              <th className="r">Requests</th>
              <th className="r">Received</th>
              <th className="r">In dataset</th>
              <th className="r">Latency</th>
              <th>Calls</th>
            </tr>
          </thead>
          <tbody>
            {run.sources.map((s) => {
              const src = sourceById(s.sourceId)!;
              return (
                <tr key={s.sourceId}>
                  <td>
                    <div className="row" style={{ gap: 8 }}>
                      <span className="src-chip">{abbr(s.sourceId)}</span>
                      <div style={{ minWidth: 0 }}>
                        <div className="primary">{src.name}</div>
                        <div className="muted" style={{ fontSize: 12 }}>{src.rate}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    {s.status === 'failed' ? (
                      <span className="badge clay" title={s.error}>Failed</span>
                    ) : s.status === 'skipped' ? (
                      <span className="badge">Off</span>
                    ) : s.status === 'done' ? (
                      <span className="badge green">OK</span>
                    ) : (
                      <span className="badge blue">{s.status}</span>
                    )}
                    {s.error && <div className="muted" style={{ fontSize: 12, marginTop: 3 }}>{clip(s.error, 60)}</div>}
                  </td>
                  <td className="r num">{s.requests}</td>
                  <td className="r num">{s.received}</td>
                  <td className="r num">{s.kept}</td>
                  <td className="r mono">{s.ms ? dur(s.ms) : '—'}</td>
                  <td style={{ maxWidth: 320 }}>
                    {s.calls.slice(0, 3).map((c, i) => (
                      <a key={i} className="link cell-clip mono" style={{ fontSize: 11.5 }} href={c} target="_blank" rel="noreferrer" title={c}>
                        {c.replace(/^https:\/\//, '')}
                      </a>
                    ))}
                    {s.calls.length > 3 && <span className="muted" style={{ fontSize: 11.5 }}>+{s.calls.length - 3} more</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DroppedTab({ data }: { data: RunData | null }) {
  const [q, setQ] = useState('');
  const groups = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of data?.dropped ?? []) for (const r of d.reasons) {
      const k = r.replace(/“[^”]*”/g, '“…”').replace(/\d{4}-\d{2}-\d{2}/g, 'date').replace(/\b\d{4}\b/g, 'year');
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [data]);
  const list = (data?.dropped ?? []).filter((d) => !q || (d.label + d.reasons.join(' ')).toLowerCase().includes(q.toLowerCase()));
  if (!data?.dropped.length) return <div className="card empty"><h3>Nothing was filtered out</h3><p>Every fetched record satisfied the recipe.</p></div>;
  return (
    <div className="stack">
      <div className="card card-pad">
        <div className="section-title">Why records were excluded</div>
        {groups.map(([k, n]) => (
          <div className="hbar" key={k} style={{ gridTemplateColumns: 'minmax(0, 1fr) 140px 44px' }}>
            <span className="truncate soft" title={k}>{k}</span>
            <span className="track"><i className="fail" style={{ width: `${(n / data.dropped.length) * 100}%` }} /></span>
            <span className="mono muted r" style={{ textAlign: 'right' }}>{n}</span>
          </div>
        ))}
      </div>
      <div className="card">
        <div className="toolbar">
          <div className="search">
            <Search />
            <input className="input" placeholder="Search filtered records" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <span className="spacer" />
          <span className="muted" style={{ fontSize: 12.5 }}>{list.length} records</span>
        </div>
        <div className="table-wrap">
          <table className="t">
            <thead>
              <tr>
                <th>Record</th>
                <th>Source</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {list.slice(0, 200).map((d, i) => (
                <tr key={i}>
                  <td className="primary" style={{ maxWidth: 340 }}>
                    {d.url ? (
                      <a className="link cell-clip" href={d.url} target="_blank" rel="noreferrer">{d.label}</a>
                    ) : (
                      <span className="cell-clip">{d.label}</span>
                    )}
                  </td>
                  <td className="nowrap">{sourceById(d.sourceId)?.name}</td>
                  <td className="soft" style={{ maxWidth: 420 }}>
                    <span className="cell-clip" title={d.reasons.join('; ')}>{d.reasons.join('; ')}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ChangesTab({ run, records, recipe }: { run: Run; records: DataRecord[]; recipe: Recipe }) {
  const diff = run.diff!;
  const def = INTENTS[recipe.intent];
  const byKey = new Map(records.map((r) => [r.key, r]));
  const label = (k: string) => display(byKey.get(k)?.fields[def.labelField]?.value) || k;
  const fl = (k: string) => recipe.fields.find((f) => f.key === k)?.label ?? k;
  return (
    <div className="stack">
      <div className="grid g3">
        <div className="card stat"><div className="k">New</div><div className="v" style={{ color: 'var(--accent)' }}>+{diff.added.length}</div></div>
        <div className="card stat"><div className="k">No longer present</div><div className="v" style={{ color: 'var(--clay)' }}>−{diff.removed.length}</div></div>
        <div className="card stat"><div className="k">Changed values</div><div className="v">{diff.changed.length}</div></div>
      </div>
      <div className="card">
        <div className="card-head">
          <h3>Compared with previous run</h3>
          <a className="hint" href={`#/run/${diff.previousRunId}`}>
            <Eye size={13} style={{ verticalAlign: -2 }} /> Open previous run
          </a>
        </div>
        {!diff.added.length && !diff.removed.length && !diff.changed.length && <div className="empty">No differences.</div>}
        {diff.added.slice(0, 100).map((k) => (
          <div className="diff-row" key={'a' + k}>
            <span className="badge green">Added</span>
            <span className="truncate">{label(k)}</span>
          </div>
        ))}
        {diff.removed.slice(0, 100).map((r) => (
          <div className="diff-row" key={'r' + r.key}>
            <span className="badge clay">Gone</span>
            <span className="truncate">{r.label}</span>
          </div>
        ))}
        {diff.changed.slice(0, 100).map((c) => (
          <div className="diff-row" key={'c' + c.key}>
            <span className="badge blue">Changed</span>
            <div style={{ minWidth: 0 }}>
              <div className="truncate" style={{ fontWeight: 500 }}>{label(c.key)}</div>
              {c.fields.map((f) => (
                <div className="chg" key={f.field}>
                  <span className="muted">{fl(f.field)}</span>
                  <span className="truncate">
                    <span className="b">{f.before || '∅'}</span> → <span className="a">{f.after || '∅'}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

