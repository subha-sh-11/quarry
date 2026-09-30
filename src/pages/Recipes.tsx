import { useState } from 'react';
import { Copy, MoreHorizontal, Pencil, Play, Plus, Search, Trash2 } from 'lucide-react';
import { deleteRecipe, runRecipe, saveRecipe, setWatch, useStore } from '../lib/store';
import { INTENTS } from '../lib/schema';
import { countryName } from '../lib/geo';
import { ago, uid } from '../lib/util';
import { Menu, RunBadge, go, toast } from '../components/ui';

export default function Recipes() {
  const recipes = useStore((s) => s.recipes);
  const runs = useStore((s) => s.runs);
  const [q, setQ] = useState('');
  const list = recipes.filter((r) => !q || (r.title + r.brief + r.keywords.join(' ')).toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Recipes</h1>
          <p className="sub">Saved collection workflows. Re-run any of them to refresh the dataset and see what changed, or put them on a watch schedule.</p>
        </div>
        <a className="btn btn-primary" href="#/new">
          <Plus /> New collection
        </a>
      </div>
      {!recipes.length ? (
        <div className="card empty">
          <h3>No recipes yet</h3>
          <p>Describe the data you need and Quarry will draft the first one.</p>
          <a className="btn btn-primary" href="#/new">
            <Plus size={15} /> New collection
          </a>
        </div>
      ) : (
        <div className="card">
          <div className="toolbar">
            <div className="search">
              <Search />
              <input className="input" placeholder="Search recipes" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          </div>
          <div className="table-wrap">
            <table className="t">
              <thead>
                <tr>
                  <th>Recipe</th>
                  <th>Type</th>
                  <th>Filters</th>
                  <th>Last run</th>
                  <th>Watch</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.map((r) => {
                  const last = runs.find((x) => x.recipeId === r.id);
                  const n = runs.filter((x) => x.recipeId === r.id).length;
                  const filters = [r.keywords.slice(0, 3).join(', '), r.city ?? countryName(r.country), r.remote ? 'remote' : '', r.since ? `since ${r.since}` : ''].filter(Boolean).join(' · ');
                  return (
                    <tr key={r.id} className="click" onClick={() => (last ? go(`/run/${last.id}`) : go(`/recipe/${r.id}/edit`))}>
                      <td className="primary" style={{ maxWidth: 300 }}>
                        <span className="cell-clip">{r.title}</span>
                        <span className="muted cell-clip" style={{ fontSize: 12, fontWeight: 400 }} title={r.brief}>{r.brief}</span>
                      </td>
                      <td className="nowrap">{INTENTS[r.intent].label}</td>
                      <td style={{ maxWidth: 220 }}>
                        <span className="cell-clip soft">{filters || '—'}</span>
                      </td>
                      <td className="nowrap">
                        {last ? (
                          <div className="row" style={{ gap: 8 }}>
                            <RunBadge status={last.status} />
                            <span className="muted">{last.status === 'done' ? `${last.stats.final} · ` : ''}{ago(last.startedAt)}</span>
                          </div>
                        ) : (
                          <span className="muted">Never</span>
                        )}
                        {n > 1 && <div className="muted" style={{ fontSize: 12 }}>{n} runs</div>}
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <select className="select" style={{ height: 30, width: 130, fontSize: 12.5 }} value={r.watch?.everyMin ?? ''} onChange={(e) => setWatch(r, e.target.value ? +e.target.value : null)} aria-label="Watch schedule">
                          <option value="">Off</option>
                          <option value="15">15 min</option>
                          <option value="60">Hourly</option>
                          <option value="360">6 hours</option>
                          <option value="1440">Daily</option>
                        </select>
                      </td>
                      <td onClick={(e) => e.stopPropagation()} className="r">
                        <div className="row" style={{ gap: 4, justifyContent: 'flex-end' }}>
                          <button
                            className="btn btn-sm"
                            onClick={async () => {
                              const id = await runRecipe(r);
                              go(`/run/${id}`);
                            }}
                          >
                            <Play /> Run
                          </button>
                          <Menu trigger={(t) => <button className="btn btn-ghost btn-icon" onClick={t} aria-label="More"><MoreHorizontal /></button>}>
                            {(close) => (
                              <>
                                <button onClick={() => (close(), go(`/recipe/${r.id}/edit`))}>
                                  <Pencil /> Edit recipe
                                </button>
                                <button
                                  onClick={() => {
                                    saveRecipe({ ...r, id: uid('r_'), title: `${r.title} (copy)`, watch: null, createdAt: Date.now() });
                                    toast('Recipe duplicated');
                                    close();
                                  }}
                                >
                                  <Copy /> Duplicate
                                </button>
                                <button
                                  onClick={() => {
                                    close();
                                    if (confirm(`Delete “${r.title}” and its ${n} run${n === 1 ? '' : 's'}?`)) deleteRecipe(r.id);
                                  }}
                                  style={{ color: 'var(--clay)' }}
                                >
                                  <Trash2 style={{ color: 'var(--clay)' }} /> Delete
                                </button>
                              </>
                            )}
                          </Menu>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
