import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { deleteRun, useStore } from '../lib/store';
import { INTENTS } from '../lib/schema';
import { ago, dur } from '../lib/util';
import { RunBadge, SourceChips, go } from '../components/ui';
import type { Run } from '../lib/types';

export default function Runs() {
  const runs = useStore((s) => s.runs);
  const [status, setStatus] = useState<'' | Run['status']>('');
  const list = runs.filter((r) => !status || r.status === status);
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Runs</h1>
          <p className="sub">Every execution of every recipe, with its sources, timings and outcome. The last 20 runs per recipe are kept.</p>
        </div>
        <select className="select" style={{ width: 170 }} value={status} onChange={(e) => setStatus(e.target.value as typeof status)} aria-label="Filter by status">
          <option value="">All statuses</option>
          <option value="running">Running</option>
          <option value="done">Complete</option>
          <option value="failed">Failed</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>
      {!list.length ? (
        <div className="card empty">
          <h3>No runs {status ? 'with this status' : 'yet'}</h3>
          <p>Runs appear here once you start a collection.</p>
          <a className="btn btn-primary" href="#/new">New collection</a>
        </div>
      ) : (
        <div className="card">
          <div className="table-wrap">
            <table className="t">
              <thead>
                <tr>
                  <th>Dataset</th>
                  <th>Status</th>
                  <th>Sources</th>
                  <th className="r">Fetched</th>
                  <th className="r">Kept</th>
                  <th className="r">Δ vs previous</th>
                  <th className="r">Duration</th>
                  <th className="r">Started</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.id} className="click" onClick={() => go(`/run/${r.id}`)}>
                    <td className="primary" style={{ maxWidth: 280 }}>
                      <span className="cell-clip">{r.recipeTitle}</span>
                      <span className="muted" style={{ fontSize: 12, fontWeight: 400 }}>{INTENTS[r.intent].label}{r.trigger === 'watch' ? ' · scheduled' : ''}</span>
                    </td>
                    <td><RunBadge status={r.status} /></td>
                    <td><SourceChips ids={r.sources.filter((s) => s.status === 'done').map((s) => s.sourceId)} /></td>
                    <td className="r num">{r.stats.fetched || '—'}</td>
                    <td className="r num">{r.status === 'done' ? r.stats.final : '—'}</td>
                    <td className="r num nowrap">{r.diff ? `+${r.diff.added.length} / −${r.diff.removed.length}` : '—'}</td>
                    <td className="r mono">{r.endedAt ? dur(r.endedAt - r.startedAt) : '…'}</td>
                    <td className="r muted nowrap">{ago(r.startedAt)}</td>
                    <td className="r" onClick={(e) => e.stopPropagation()}>
                      <button className="btn btn-ghost btn-icon" aria-label="Delete run" onClick={() => confirm('Delete this run and its dataset?') && deleteRun(r.id)}>
                        <Trash2 />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
