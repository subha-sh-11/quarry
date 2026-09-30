const _f = globalThis.fetch; globalThis.fetch = ((u: any, i: any = {}) => _f(u, { ...i, headers: { ...(i.headers ?? {}), 'User-Agent': 'QuarrySmokeTest/1.0 (https://github.com/subha-sh-11/quarry)' } })) as any;
import { planLocal, assemble } from '../src/lib/planner';
import { startRun } from '../src/lib/engine';
import { EXAMPLES } from '../src/lib/schema';

const briefs = process.argv.slice(2).length ? process.argv.slice(2) : [...EXAMPLES.map((e) => e.brief), 'Top 20 DeFi tokens by market cap', 'Fintech startups in India', 'Senior backend engineer jobs in Berlin'];
for (const b of briefs) {
  const d = await planLocal(b);
  const r = assemble(b, d, 'local');
  console.log('\n=== ' + b);
  console.log('  intent=%s kw=%j ctx=%j country=%s countries=%j since=%s remote=%s limit=%d sort=%s req=%j excl=%j', r.intent, r.keywords, r.context, r.country, r.countries, r.since, r.remote, r.limit, r.sort, d.requiredFields, r.excludes);
  console.log('  title: ' + r.title);
  const h = startRun(r, { trigger: 'manual', semantic: false, onUpdate: () => {} });
  const { run, data } = await h.done;
  console.log('  status=%s fetched=%d dropped=%d merged=%d final=%d q=%s %s', run.status, run.stats.fetched, run.stats.dropped, run.stats.merged, run.stats.final, run.stats.avgQuality.toFixed(2), run.error ?? '');
  for (const s of run.sources) console.log('   - %s %s req=%d recv=%d kept=%d %s', s.sourceId, s.status, s.requests, s.received, s.kept, s.error ?? '');
  for (const rec of data.records.slice(0, 3)) console.log('     * ' + Object.entries(rec.fields).filter(([k]) => r.fields.find(f=>f.key===k)?.visible).map(([k, c]) => `${k}=${JSON.stringify(c.value)?.slice(0, 50)}`).join(' | '));
  const reasons: Record<string, number> = {};
  for (const x of data.dropped) for (const rr of x.reasons) { const k = rr.replace(/“[^”]*”/g, '…'); reasons[k] = (reasons[k] ?? 0) + 1; }
  console.log('   dropped reasons: ' + JSON.stringify(reasons).slice(0, 300));
}
