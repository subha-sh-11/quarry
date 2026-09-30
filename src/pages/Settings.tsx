import { useState } from 'react';
import { Cpu, Download, KeyRound, Loader2, Sparkles, Trash2 } from 'lucide-react';
import { clearAll, getRunData, getState, updateSettings, useStore } from '../lib/store';
import { loadModel } from '../lib/embed';
import { Switch, toast, useModel } from '../components/ui';

export default function SettingsPage() {
  const s = useStore((x) => x.settings);
  const m = useModel();
  const [key, setKey] = useState(s.anthropicKey);
  const [gh, setGh] = useState(s.githubToken);

  const exportAll = async () => {
    const st = getState();
    const data: Record<string, unknown> = {};
    for (const r of st.runs) data[r.id] = await getRunData(r.id);
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), recipes: st.recipes, runs: st.runs, data }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `quarry-workspace-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  };

  return (
    <div className="page" style={{ maxWidth: 860 }}>
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <p className="sub">Everything is stored in this browser. Keys never leave your device except in requests to the service they belong to.</p>
        </div>
      </div>
      <div className="stack">
        <div className="card">
          <div className="card-head">
            <h3>
              <Cpu size={15} style={{ verticalAlign: -2, marginRight: 6 }} />
              On-device semantic model
            </h3>
            <Switch on={s.semantic} onChange={(v) => updateSettings({ semantic: v })} label="Semantic model" />
          </div>
          <div className="card-pad stack" style={{ gap: 12 }}>
            <p className="soft">
              A 23&nbsp;MB sentence-embedding model (all-MiniLM-L6-v2) runs inside your browser in a Web Worker. It classifies requests, ranks records by meaning rather than keyword overlap, and merges near-duplicate listings across sources. Nothing is sent to a server.
            </p>
            <div className="row">
              <span className={`badge ${m.status === 'ready' ? 'green' : m.status === 'error' ? 'clay' : m.status === 'loading' ? 'blue' : ''}`}>
                {m.status === 'loading' && <Loader2 className="spin" />}
                {m.status === 'ready' ? 'Ready' : m.status === 'loading' ? `Downloading ${m.progress}%` : m.status === 'error' ? 'Failed to load' : 'Not loaded'}
              </span>
              {m.status !== 'ready' && s.semantic && (
                <button className="btn btn-sm" onClick={() => loadModel()} disabled={m.status === 'loading'}>
                  Load now
                </button>
              )}
            </div>
            {m.status === 'loading' && <div className="progress"><i style={{ width: `${m.progress}%` }} /></div>}
            {m.error && <p className="muted" style={{ fontSize: 12 }}>{m.error}</p>}
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h3>
              <Sparkles size={15} style={{ verticalAlign: -2, marginRight: 6 }} />
              Request planner
            </h3>
          </div>
          <div className="card-pad stack" style={{ gap: 14 }}>
            <div className="grid g2">
              <label className={`card card-pad`} style={{ cursor: 'pointer', borderColor: s.planner === 'local' ? 'var(--accent)' : undefined, boxShadow: s.planner === 'local' ? '0 0 0 1px var(--accent)' : undefined }}>
                <div className="row">
                  <input type="radio" name="planner" checked={s.planner === 'local'} onChange={() => updateSettings({ planner: 'local' })} style={{ accentColor: 'var(--accent)' }} />
                  <b>On-device</b>
                </div>
                <p className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>Rule-based parser for places, dates, counts and fields, plus the embedding model for intent. Free, instant, private.</p>
              </label>
              <label className="card card-pad" style={{ cursor: 'pointer', borderColor: s.planner === 'claude' ? 'var(--accent)' : undefined, boxShadow: s.planner === 'claude' ? '0 0 0 1px var(--accent)' : undefined }}>
                <div className="row">
                  <input type="radio" name="planner" checked={s.planner === 'claude'} onChange={() => updateSettings({ planner: 'claude' })} style={{ accentColor: 'var(--accent)' }} />
                  <b>Claude</b>
                </div>
                <p className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>Claude Opus 5.5 turns the brief into a structured recipe. Handles unusual phrasing better. Needs your Anthropic API key.</p>
              </label>
            </div>
            <div className="field">
              <label className="label" htmlFor="ak">
                <KeyRound size={13} style={{ verticalAlign: -2 }} /> Anthropic API key
              </label>
              <div className="row">
                <input id="ak" className="input mono" type="password" placeholder="sk-ant-…" value={key} onChange={(e) => setKey(e.target.value)} autoComplete="off" />
                <button className="btn" onClick={() => (updateSettings({ anthropicKey: key.trim(), planner: key.trim() ? 'claude' : 'local' }), toast(key.trim() ? 'Key saved — Claude planner on' : 'Key cleared'))}>
                  Save
                </button>
              </div>
              <div className="help">Stored only in this browser (IndexedDB) and sent only to api.anthropic.com. If a call fails, Quarry falls back to the on-device planner.</div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h3>GitHub token (optional)</h3>
          </div>
          <div className="card-pad">
            <div className="row">
              <input className="input mono" type="password" placeholder="github_pat_…" value={gh} onChange={(e) => setGh(e.target.value)} autoComplete="off" />
              <button className="btn" onClick={() => (updateSettings({ githubToken: gh.trim() }), toast('Saved'))}>
                Save
              </button>
            </div>
            <div className="help">Raises GitHub limits from 10 to 30 searches per minute. A fine-grained token with no scopes is enough.</div>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h3>Workspace data</h3>
          </div>
          <div className="card-pad row wrap">
            <button className="btn" onClick={exportAll}>
              <Download /> Export workspace
            </button>
            <button
              className="btn btn-danger"
              onClick={async () => {
                if (confirm('Delete every recipe, run and dataset in this browser?')) {
                  await clearAll();
                  toast('Workspace cleared');
                }
              }}
            >
              <Trash2 /> Clear everything
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
