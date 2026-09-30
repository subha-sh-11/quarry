import { useState } from 'react';
import { Activity, ExternalLink, Loader2 } from 'lucide-react';
import { SOURCES } from '../lib/sources';
import { INTENTS } from '../lib/schema';
import type { Intent } from '../lib/types';
import { dur } from '../lib/util';

const PROBES: Record<string, string> = {
  remotive: 'https://remotive.com/api/remote-jobs?limit=1',
  remoteok: 'https://remoteok.com/api',
  jobicy: 'https://jobicy.com/api/v2/remote-jobs?count=1',
  arbeitnow: 'https://www.arbeitnow.com/api/job-board-api',
  hn_hiring: 'https://hn.algolia.com/api/v1/search?tags=story&hitsPerPage=1',
  wikidata: 'https://www.wikidata.org/w/api.php?action=wbsearchentities&search=energy&language=en&format=json&limit=1&origin=*',
  github_orgs: 'https://api.github.com/rate_limit',
  openalex: 'https://api.openalex.org/works?per-page=1',
  crossref: 'https://api.crossref.org/works?rows=1',
  github_repos: 'https://api.github.com/rate_limit',
  npm: 'https://registry.npmjs.org/-/v1/search?text=react&size=1',
  huggingface: 'https://huggingface.co/api/models?limit=1',
  hn: 'https://hn.algolia.com/api/v1/search?tags=story&hitsPerPage=1',
  devto: 'https://dev.to/api/articles?per_page=1',
  stackoverflow: 'https://api.stackexchange.com/2.3/info?site=stackoverflow',
  coingecko: 'https://api.coingecko.com/api/v3/ping',
  worldbank: 'https://api.worldbank.org/v2/country/US?format=json',
};

type ProbeResult = { ok: boolean; ms: number; note: string };

export default function SourcesPage() {
  const [res, setRes] = useState<Record<string, ProbeResult | 'busy'>>({});
  const probe = async (id: string) => {
    setRes((r) => ({ ...r, [id]: 'busy' }));
    const t0 = performance.now();
    try {
      const r = await fetch(PROBES[id], { signal: AbortSignal.timeout(15000) });
      let note = `HTTP ${r.status}`;
      if (id.startsWith('github') && r.ok) {
        const j = await r.json();
        note = `${j.resources?.search?.remaining ?? '?'} searches, ${j.resources?.core?.remaining ?? '?'} calls left`;
      }
      setRes((x) => ({ ...x, [id]: { ok: r.ok, ms: performance.now() - t0, note } }));
    } catch (e) {
      setRes((x) => ({ ...x, [id]: { ok: false, ms: performance.now() - t0, note: (e as Error).name === 'TimeoutError' ? 'Timed out' : 'Blocked or offline' } }));
    }
  };
  const probeAll = () => SOURCES.forEach((s) => void probe(s.id));
  const groups = Object.keys(INTENTS) as Intent[];

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Permitted sources</h1>
          <p className="sub">Quarry never scrapes pages. It only calls these documented public APIs, straight from your browser, and records their terms and attribution with every dataset.</p>
        </div>
        <button className="btn" onClick={probeAll}>
          <Activity /> Check all
        </button>
      </div>
      <div className="stack" style={{ gap: 26 }}>
        {groups.map((g) => {
          const list = SOURCES.filter((s) => s.intents[0] === g);
          if (!list.length) return null;
          return (
            <section key={g}>
              <div className="section-title">{INTENTS[g].label}</div>
              <div className="grid g3">
                {list.map((s) => {
                  const r = res[s.id];
                  return (
                    <div className="card src-card" key={s.id}>
                      <div className="hd">
                        <div style={{ minWidth: 0 }}>
                          <h3>{s.name}</h3>
                          <div className="host">{s.host}</div>
                        </div>
                        {r === 'busy' ? (
                          <span className="badge"><Loader2 className="spin" /> Checking</span>
                        ) : r ? (
                          <span className={`badge ${r.ok ? 'green' : 'clay'}`} title={r.note}>{r.ok ? `Up · ${dur(r.ms)}` : 'Unreachable'}</span>
                        ) : (
                          <button className="btn btn-sm btn-ghost" onClick={() => probe(s.id)}>Check</button>
                        )}
                      </div>
                      <p className="soft" style={{ fontSize: 13 }}>{s.provides}</p>
                      <dl>
                        <dt>Terms</dt>
                        <dd>{s.terms}</dd>
                        <dt>Rate</dt>
                        <dd>{s.rate}</dd>
                        <dt>Credit</dt>
                        <dd>{s.attribution}</dd>
                        {r && r !== 'busy' && (
                          <>
                            <dt>Probe</dt>
                            <dd className="mono" style={{ fontSize: 11.5 }}>{r.note}</dd>
                          </>
                        )}
                      </dl>
                      <a className="btn btn-sm" href={s.termsUrl} target="_blank" rel="noreferrer" style={{ justifySelf: 'start' }}>
                        Read terms <ExternalLink />
                      </a>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
