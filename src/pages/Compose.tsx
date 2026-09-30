import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { ArrowRight, CornerDownLeft, ExternalLink, Info, Loader2, Play, Save, Sparkles, Wand2, X } from 'lucide-react';
import type { Intent, Recipe } from '../lib/types';
import { EXAMPLES, INDICATORS, INTENTS } from '../lib/schema';
import { assemble, pickSources, planLocal, type PlanDraft } from '../lib/planner';
import { sourceById } from '../lib/sources';
import { COUNTRIES, countryName } from '../lib/geo';
import { runRecipe, saveRecipe, updateSettings, useStore } from '../lib/store';
import { go, toast, useRoute } from '../components/ui';

export default function Compose({ recipeId }: { recipeId?: string }) {
  const { query } = useRoute();
  const existing = useStore((s) => s.recipes.find((r) => r.id === recipeId));
  const settings = useStore((s) => s.settings);
  const [brief, setBrief] = useState(existing?.brief ?? query.get('b') ?? '');
  const [draft, setDraft] = useState<Recipe | null>(existing ?? null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const planRef = useRef<HTMLDivElement>(null);
  const autoRan = useRef(false);

  const useClaude = settings.planner === 'claude' && !!settings.anthropicKey;

  async function plan(text = brief) {
    const b = text.trim();
    if (b.length < 4) return;
    setBusy(true);
    setErr('');
    try {
      let d: PlanDraft;
      let by: Recipe['plannedBy'] = 'local';
      if (useClaude) {
        try {
          const { planWithClaude } = await import('../lib/llm');
          d = await planWithClaude(b, settings.anthropicKey);
          by = 'claude';
        } catch (e) {
          d = await planLocal(b);
          d.notes.push(`Claude planning failed (${(e as Error).message.slice(0, 90)}); used the on-device planner instead.`);
        }
      } else d = await planLocal(b);
      setDraft(assemble(b, d, by, existing ?? undefined));
      requestAnimationFrame(() => planRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!autoRan.current && query.get('b') && !existing) {
      autoRan.current = true;
      void plan(query.get('b')!);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void plan();
    }
  };

  async function launch() {
    if (!draft) return;
    const id = await runRecipe({ ...draft, brief: brief.trim() || draft.brief });
    go(`/run/${id}`);
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          {existing && (
            <div className="crumbs">
              <a href="#/recipes">Recipes</a> / <span>{existing.title}</span>
            </div>
          )}
          <h1>{existing ? 'Edit recipe' : 'New collection'}</h1>
          <p className="sub">Describe the dataset you need in plain English. Quarry drafts a collection recipe you can inspect and adjust before anything is fetched.</p>
        </div>
      </div>

      <div className="card composer">
        <textarea
          className="textarea"
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          onKeyDown={onKey}
          placeholder="e.g. Remote Python data engineering jobs in Europe posted in the last 3 weeks, must list a salary"
          aria-label="Describe the data you need"
          autoFocus={!existing}
        />
        <div className="composer-foot">
          <span className="badge outline" title="Change in Settings">
            {useClaude ? <Sparkles /> : <Wand2 />}
            {useClaude ? 'Planner: Claude' : 'Planner: on-device'}
          </span>
          {!useClaude && settings.anthropicKey && (
            <button className="btn btn-ghost btn-sm" onClick={() => updateSettings({ planner: 'claude' })}>
              Use Claude
            </button>
          )}
          <span className="spacer" />
          <span className="muted nowrap" style={{ fontSize: 12 }}>
            <span className="kbd">Enter</span> to draft
          </span>
          <button className="btn btn-primary" onClick={() => plan()} disabled={busy || brief.trim().length < 4}>
            {busy ? <Loader2 className="spin" /> : <CornerDownLeft />}
            {draft ? 'Re-draft plan' : 'Draft plan'}
          </button>
        </div>
      </div>

      {!draft && (
        <div className="examples">
          {EXAMPLES.map((ex) => (
            <button
              key={ex.brief}
              className="example"
              onClick={() => {
                setBrief(ex.brief);
                void plan(ex.brief);
              }}
            >
              <span className="i">{INTENTS[ex.intent].label}</span>
              {ex.brief}
            </button>
          ))}
        </div>
      )}

      {err && (
        <div className="callout clay" style={{ marginTop: 14 }}>
          <Info />
          {err}
        </div>
      )}

      {draft && (
        <div ref={planRef} style={{ scrollMarginTop: 20 }}>
          <PlanEditor draft={draft} onChange={setDraft} />
          <div className="action-bar">
            <button
              className="btn"
              onClick={() => {
                saveRecipe({ ...draft, brief: brief.trim() || draft.brief });
                toast('Recipe saved');
                go('/recipes');
              }}
            >
              <Save /> Save recipe
            </button>
            <button className="btn btn-accent" onClick={launch} disabled={!draft.sources.some((s) => s.enabled)}>
              <Play /> Run collection
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function PlanEditor({ draft, onChange }: { draft: Recipe; onChange: (r: Recipe) => void }) {
  const set = (p: Partial<Recipe>) => onChange({ ...draft, ...p });
  const def = INTENTS[draft.intent];
  const enabled = draft.sources.filter((s) => s.enabled);

  const changeIntent = (intent: Intent) => {
    const next: Recipe = { ...draft, intent, fields: INTENTS[intent].fields.map((f) => ({ ...f })), indicator: intent === 'economy' ? draft.indicator ?? INDICATORS[0].code : undefined };
    next.sources = pickSources(next);
    onChange(next);
  };

  const flow = useMemo(() => {
    const cons = [
      draft.keywords.length && `mentions ${draft.keywords.map((k) => `“${k}”`).join(' or ')}`,
      draft.country && `in ${draft.city ?? countryName(draft.country)}`,
      draft.remote === true && draft.intent === 'jobs' && 'remote',
      draft.since && `since ${draft.since}`,
      draft.excludes.length && `not ${draft.excludes.join(', ')}`,
    ].filter(Boolean);
    const req = draft.fields.filter((f) => f.required).map((f) => f.label);
    return [
      ['Understand request', `${draft.plannedBy === 'claude' ? 'Claude' : 'On-device planner'} → ${def.label.toLowerCase()} recipe`],
      ['Check permissions', `${enabled.length} whitelisted public APIs, terms recorded`],
      ['Collect', `Parallel requests to ${enabled.map((s) => sourceById(s.id)?.name).join(', ') || '—'}`],
      ['Extract & filter', cons.length ? `Keep records that ${cons.join(', ')}` : 'No extra constraints'],
      ['Validate', `URLs, dates, numbers checked; required: ${req.join(', ') || 'none'}`],
      ['Deduplicate', `Merge on ${def.keyFields.join(' + ')}, then semantic near-duplicates`],
      ['Rank', draft.sort === 'relevance' ? 'Semantic similarity to your brief' : draft.sort === 'popular' ? 'Relevance blended with popularity' : 'Relevance blended with recency'],
      ['Publish', `Top ${draft.limit} with per-cell provenance and a diff against the last run`],
    ];
  }, [draft, def, enabled]);

  return (
    <div className="plan">
      <div className="stack">
        <div className="card">
          <div className="card-head">
            <h3>Recipe</h3>
            <span className="hint">Everything here is editable</span>
          </div>
          <div className="card-pad form-grid">
            <div className="field full">
              <label className="label" htmlFor="title">Dataset name</label>
              <input id="title" className="input" value={draft.title} onChange={(e) => set({ title: e.target.value })} />
            </div>
            <div className="field">
              <label className="label" htmlFor="intent">What to collect</label>
              <select id="intent" className="select" value={draft.intent} onChange={(e) => changeIntent(e.target.value as Intent)}>
                {Object.values(INTENTS).map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label className="label" htmlFor="limit">Target size</label>
              <input id="limit" className="input num" type="number" min={5} max={500} value={draft.limit} onChange={(e) => set({ limit: Math.max(1, Math.min(500, +e.target.value || 0)) })} />
            </div>
            {draft.intent !== 'economy' && (
              <div className="field full">
                <label className="label">Search terms</label>
                <TagInput values={draft.keywords} onChange={(keywords) => set({ keywords })} placeholder="Add a term and press Enter" />
                <div className="help">{draft.intent === 'jobs' ? 'Each term is searched separately (OR).' : 'Sent to each source’s own search.'}</div>
              </div>
            )}
            {draft.intent === 'economy' && (
              <>
                <div className="field full">
                  <label className="label" htmlFor="ind">Indicator</label>
                  <select id="ind" className="select" value={draft.indicator} onChange={(e) => set({ indicator: e.target.value })}>
                    {INDICATORS.map((i) => (
                      <option key={i.code} value={i.code}>
                        {i.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field full">
                  <label className="label">Countries</label>
                  <CountryPicker values={draft.countries ?? []} onChange={(countries) => set({ countries })} />
                  <div className="help">Leave empty for every economy.</div>
                </div>
              </>
            )}
            {draft.intent !== 'economy' && draft.intent !== 'crypto' && (
              <div className="field">
                <label className="label" htmlFor="country">Country</label>
                <select id="country" className="select" value={draft.country ?? ''} onChange={(e) => set({ country: e.target.value || undefined, countryName: countryName(e.target.value), city: undefined })}>
                  <option value="">Anywhere</option>
                  {COUNTRIES.slice()
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.name}
                      </option>
                    ))}
                </select>
                {draft.city && <div className="help">City: {draft.city}</div>}
              </div>
            )}
            {draft.intent !== 'crypto' && (
              <div className="field">
                <label className="label" htmlFor="since">{draft.intent === 'economy' ? 'From year' : 'Since'}</label>
                <input id="since" className="input" type="date" value={draft.since ?? ''} onChange={(e) => set({ since: e.target.value || undefined })} />
              </div>
            )}
            {draft.intent === 'jobs' && (
              <div className="field">
                <label className="label" htmlFor="remote">Work mode</label>
                <select id="remote" className="select" value={draft.remote === undefined ? '' : draft.remote ? 'remote' : 'onsite'} onChange={(e) => set({ remote: e.target.value === '' ? undefined : e.target.value === 'remote' })}>
                  <option value="">Any</option>
                  <option value="remote">Remote only</option>
                  <option value="onsite">On-site only</option>
                </select>
              </div>
            )}
            {!['crypto', 'economy'].includes(draft.intent) && (
              <div className="field">
                <label className="label" htmlFor="sort">Priority</label>
                <select id="sort" className="select" value={draft.sort} onChange={(e) => set({ sort: e.target.value as Recipe['sort'] })}>
                  <option value="relevance">Most relevant</option>
                  <option value="popular">Most popular / cited</option>
                  <option value="recent">Most recent</option>
                </select>
              </div>
            )}
            {!['crypto', 'economy'].includes(draft.intent) && (
              <div className="field full">
                <label className="label">Exclude records mentioning</label>
                <TagInput values={draft.excludes} onChange={(excludes) => set({ excludes })} placeholder="e.g. crypto, unpaid" />
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h3>Output schema</h3>
            <span className="hint">{def.entity} · {draft.fields.filter((f) => f.visible).length} columns</span>
          </div>
          <div className="card-pad fields-table">
            <div className="fr fh">
              <span>Field</span>
              <span>Show</span>
              <span>Required</span>
            </div>
            {draft.fields.map((f, i) => (
              <div className="fr" key={f.key}>
                <span className="truncate">
                  {f.label} <span className="mono muted">{f.type}</span>
                </span>
                <label className="check">
                  <input type="checkbox" checked={!!f.visible} onChange={(e) => set({ fields: draft.fields.map((x, j) => (j === i ? { ...x, visible: e.target.checked } : x)) })} />
                  <span className="sr">Show {f.label}</span>
                </label>
                <label className="check">
                  <input type="checkbox" checked={!!f.required} onChange={(e) => set({ fields: draft.fields.map((x, j) => (j === i ? { ...x, required: e.target.checked } : x)) })} />
                  <span className="sr">Require {f.label}</span>
                </label>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="stack">
        <div className="card">
          <div className="card-head">
            <h3>How Quarry read this</h3>
            <span className="badge outline">{draft.plannedBy === 'claude' ? 'Claude' : 'On-device'}</span>
          </div>
          <div className="card-pad">
            <ul className="notes">
              {draft.planNotes.map((n, i) => (
                <li key={i}>
                  <ArrowRight />
                  <span dangerouslySetInnerHTML={{ __html: n.replace(/</g, '&lt;').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>') }} />
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h3>Sources</h3>
            <span className="hint">{enabled.length} of {draft.sources.length} selected</span>
          </div>
          {draft.sources.map((s) => {
            const src = sourceById(s.id)!;
            return (
              <label className="src-row" key={s.id} style={{ cursor: 'pointer' }}>
                <input type="checkbox" style={{ accentColor: 'var(--accent)', marginTop: 3 }} checked={s.enabled} onChange={(e) => set({ sources: draft.sources.map((x) => (x.id === s.id ? { ...x, enabled: e.target.checked } : x)) })} />
                <div style={{ minWidth: 0 }}>
                  <div className="name">{src.name}</div>
                  <div className="why">{s.reason}</div>
                </div>
                <a href={src.termsUrl} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm" onClick={(e) => e.stopPropagation()} title="Terms of use">
                  Terms <ExternalLink />
                </a>
              </label>
            );
          })}
        </div>

        <div className="card">
          <div className="card-head">
            <h3>Workflow</h3>
            <span className="hint">What will run</span>
          </div>
          <div className="card-pad">
            <ol className="flow">
              {flow.map(([t, d], i) => (
                <li key={t}>
                  <span className="n">{i + 1}</span>
                  <div style={{ minWidth: 0 }}>
                    <div className="t">{t}</div>
                    <div className="d">{d}</div>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}

function TagInput({ values, onChange, placeholder }: { values: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [v, setV] = useState('');
  const add = () => {
    const t = v.trim().replace(/,$/, '');
    if (t && !values.includes(t)) onChange([...values, t]);
    setV('');
  };
  return (
    <div className="input" style={{ height: 'auto', minHeight: 34, padding: '4px 6px', display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center' }}>
      {values.map((t) => (
        <span className="chip" key={t} style={{ height: 24, cursor: 'default' }}>
          <span className="truncate" style={{ maxWidth: 220 }}>{t}</span>
          <button className="x" onClick={() => onChange(values.filter((x) => x !== t))} aria-label={`Remove ${t}`}>
            <X size={13} />
          </button>
        </span>
      ))}
      <input
        value={v}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            add();
          } else if (e.key === 'Backspace' && !v && values.length) onChange(values.slice(0, -1));
        }}
        onBlur={add}
        placeholder={values.length ? '' : placeholder}
        style={{ border: 0, outline: 0, flex: '1 1 120px', minWidth: 80, height: 24, background: 'transparent' }}
      />
    </div>
  );
}

function CountryPicker({ values, onChange }: { values: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="stack" style={{ gap: 8 }}>
      {values.length > 0 && (
        <div className="chips">
          {values.map((c) => (
            <span className="chip" key={c} style={{ cursor: 'default' }}>
              {countryName(c) ?? c}
              <button className="x" onClick={() => onChange(values.filter((x) => x !== c))} aria-label={`Remove ${c}`}>
                <X size={13} />
              </button>
            </span>
          ))}
        </div>
      )}
      <select className="select" value="" onChange={(e) => e.target.value && onChange([...values, e.target.value])}>
        <option value="">Add a country…</option>
        {COUNTRIES.filter((c) => !values.includes(c.code))
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
      </select>
    </div>
  );
}

