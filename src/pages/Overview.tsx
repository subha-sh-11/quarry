import { useState } from 'react';
import { ArrowRight, BookMarked, CornerDownLeft, Database, History, Radio, ShieldCheck } from 'lucide-react';
import { useStore } from '../lib/store';
import { EXAMPLES, INTENTS } from '../lib/schema';
import { SOURCES, sourceById } from '../lib/sources';
import { ago, dur } from '../lib/util';
import { RunBadge, go } from '../components/ui';

export default function Overview() {
  const recipes = useStore((s) => s.recipes);
  const runs = useStore((s) => s.runs);
  const [q, setQ] = useState('');

  const latestByRecipe = new Map<string, (typeof runs)[number]>();
  for (const r of runs) if (r.status === 'done' && !latestByRecipe.has(r.recipeId)) latestByRecipe.set(r.recipeId, r);
  const liveRecords = [...latestByRecipe.values()].reduce((a, r) => a + r.stats.final, 0);
  const watched = recipes.filter((r) => r.watch).length;

  // Source health from the most recent 30 runs.
  const health = new Map<string, { ok: number; fail: number; ms: number; n: number }>();
  for (const r of runs.slice(0, 30))
    for (const s of r.sources) {
      if (s.status !== 'done' && s.status !== 'failed') continue;
      const h = health.get(s.sourceId) ?? { ok: 0, fail: 0, ms: 0, n: 0 };
      if (s.status === 'done') h.ok++;
      else h.fail++;
      h.ms += s.ms;
      h.n++;
      health.set(s.sourceId, h);
    }

  const submit = () => q.trim().length > 3 && go(`/new?b=${encodeURIComponent(q.trim())}`);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Turn a sentence into a dataset you can trust</h1>
          <p className="sub">Quarry plans a collection workflow from your brief, pulls only from permitted public APIs, validates and deduplicates the results, and keeps a receipt for every value.</p>
        </div>
      </div>

      <div className="card quick" style={{ marginBottom: 18 }}>
        <input
          className="input"
          placeholder="What data do you need? e.g. Rust jobs in Berlin from the last month"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          aria-label="Describe the data you need"
        />
        <button className="btn btn-primary" style={{ height: 42 }} onClick={submit} disabled={q.trim().length < 4}>
          <CornerDownLeft /> Plan
        </button>
      </div>

      <div className="grid g4" style={{ marginBottom: 18 }}>
        <div className="card stat">
          <div className="k"><BookMarked /> Recipes</div>
          <div className="v">{recipes.length}</div>
          <div className="d">{watched ? `${watched} watched` : 'Saved collection workflows'}</div>
        </div>
        <div className="card stat">
          <div className="k"><History /> Runs</div>
          <div className="v">{runs.length}</div>
          <div className="d">{runs.filter((r) => r.status === 'failed').length} failed</div>
        </div>
        <div className="card stat">
          <div className="k"><Database /> Records</div>
          <div className="v">{liveRecords.toLocaleString()}</div>
          <div className="d">Across latest datasets</div>
        </div>
        <div className="card stat">
          <div className="k"><ShieldCheck /> Sources</div>
          <div className="v">{SOURCES.length}</div>
          <div className="d">Permitted public APIs</div>
        </div>
      </div>

      {runs.length === 0 ? (
        <>
          <div className="card how" style={{ marginBottom: 18 }}>
            {[
              ['Describe', 'Write what you need the way you would to a colleague — topic, place, time window, must-have fields.'],
              ['Review the recipe', 'See how the request was understood, which sources will be used and why, and edit anything.'],
              ['Collect & clean', 'Sources are queried in parallel, then filtered, validated, merged across sources and ranked.'],
              ['Inspect & export', 'Open any row to see exactly where each value came from. Re-run later to see what changed.'],
            ].map(([t, d], i) => (
              <div key={t}>
                <div className="n">0{i + 1}</div>
                <h4>{t}</h4>
                <p>{d}</p>
              </div>
            ))}
          </div>
          <div className="section-title">Try one</div>
          <div className="grid g3">
            {EXAMPLES.map((ex) => (
              <button key={ex.brief} className="example" style={{ maxWidth: 'none' }} onClick={() => go(`/new?b=${encodeURIComponent(ex.brief)}`)}>
                <span className="i">{INTENTS[ex.intent].label}</span>
                {ex.brief}
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="grid split">
          <div className="card">
            <div className="card-head">
              <h3>Recent runs</h3>
              <a href="#/runs" className="hint">View all <ArrowRight size={12} style={{ verticalAlign: -2 }} /></a>
            </div>
            <div className="table-wrap">
              <table className="t">
                <thead>
                  <tr>
                    <th>Dataset</th>
                    <th>Status</th>
                    <th className="r">Records</th>
                    <th className="r">When</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.slice(0, 7).map((r) => (
                    <tr key={r.id} className="click" onClick={() => go(`/run/${r.id}`)}>
                      <td className="primary" style={{ maxWidth: 300 }}>
                        <span className="cell-clip">{r.recipeTitle}</span>
                        <span className="muted" style={{ fontSize: 12, fontWeight: 400 }}>{INTENTS[r.intent].label}{r.diff ? ` · +${r.diff.added.length} new` : ''}</span>
                      </td>
                      <td><RunBadge status={r.status} /></td>
                      <td className="r num">{r.status === 'done' ? r.stats.final : '—'}</td>
                      <td className="r muted nowrap">{ago(r.startedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="stack">
            <div className="card">
              <div className="card-head">
                <h3>Source health</h3>
                <span className="hint">Last 30 runs</span>
              </div>
              <div className="card-pad" style={{ paddingTop: 10, paddingBottom: 12 }}>
                {[...health.entries()].length === 0 && <p className="muted">No source calls yet.</p>}
                {[...health.entries()]
                  .sort((a, b) => b[1].n - a[1].n)
                  .slice(0, 8)
                  .map(([id, h]) => (
                    <div className="hbar" key={id}>
                      <span className="truncate">{sourceById(id)?.name}</span>
                      <span className="track" title={`${h.ok} ok, ${h.fail} failed`}>
                        <i className={h.fail > h.ok ? 'fail' : ''} style={{ width: `${(h.ok / h.n) * 100}%` }} />
                      </span>
                      <span className="mono muted" style={{ textAlign: 'right', fontSize: 11.5 }}>{dur(h.ms / h.n)}</span>
                    </div>
                  ))}
              </div>
            </div>
            {watched > 0 && (
              <div className="card">
                <div className="card-head">
                  <h3>Watching</h3>
                  <Radio size={15} className="muted" />
                </div>
                <div className="card-pad stack" style={{ gap: 8 }}>
                  {recipes
                    .filter((r) => r.watch)
                    .map((r) => (
                      <a key={r.id} href={`#/recipes`} className="row" style={{ fontSize: 13 }}>
                        <span className="dot green pulse" />
                        <span className="truncate">{r.title}</span>
                        <span className="spacer" />
                        <span className="muted nowrap">{r.watch?.nextAt ? `next ${new Date(r.watch.nextAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}</span>
                      </a>
                    ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
