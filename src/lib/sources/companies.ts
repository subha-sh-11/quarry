import type { RawRecord, SourceDef } from '../types';
import { locationTerms } from '../geo';
import { num, recordBuilder, toDate } from '../util';

const WD = 'https://query.wikidata.org/sparql?format=json&query=';

/** Resolve free-text industry terms to the Wikidata item most used as “industry” (P452). */
async function groundIndustry(terms: string[], call: (u: string) => Promise<any>, log: (m: string) => void) {
  const phrases = [...new Set([terms.join(' '), ...terms])].filter(Boolean).slice(0, 4);
  const candidates: { id: string; label: string; description?: string }[] = [];
  for (const ph of phrases) {
    const u = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(ph)}&language=en&format=json&limit=6&origin=*`;
    const r = await call(u);
    for (const s of r.search ?? []) if (!candidates.some((c) => c.id === s.id)) candidates.push({ id: s.id, label: s.label, description: s.description });
    if (candidates.length >= 10) break;
  }
  if (!candidates.length) return [];
  // UNION rather than VALUES: the query service's optimiser returns nothing for VALUES + GROUP BY here.
  const q = `SELECT ?i (COUNT(?c) AS ?n) WHERE { ${candidates.map((c) => `{ ?c wdt:P452 wd:${c.id} . BIND(wd:${c.id} AS ?i) }`).join(' UNION ')} } GROUP BY ?i`;
  const counts = await call(WD + encodeURIComponent(q));
  const byId: Record<string, number> = {};
  for (const b of counts.results?.bindings ?? []) byId[b.i.value.split('/').pop()] = +b.n.value;
  const ranked = candidates
    .map((c) => ({ ...c, count: byId[c.id] ?? 0 }))
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count);
  const picked = ranked.slice(0, 2).filter((c, i) => i === 0 || c.count > ranked[0].count * 0.15);
  picked.forEach((c) => log(`Grounded industry “${c.label}” → ${c.id} (${c.count} companies tagged)`));
  return picked;
}

export const wikidata: SourceDef = {
  id: 'wikidata',
  name: 'Wikidata',
  host: 'wikidata.org',
  intents: ['companies'],
  provides: 'Structured company facts: industry, country, HQ, website, founding date, headcount.',
  terms: 'CC0 public domain data via the Wikidata Query Service. Send a descriptive User-Agent; 60s query limit.',
  termsUrl: 'https://www.wikidata.org/wiki/Wikidata:Data_access',
  attribution: 'Data from Wikidata (CC0)',
  rate: '5 parallel queries',
  serverSearch: true,
  fit: () => ({ score: 1, reason: 'Entity-grounded industry + country filter with structured facts' }),
  async fetch({ recipe, call, log, ground }) {
    const industries = await groundIndustry(recipe.keywords, call, log);
    ground.industries = industries;
    if (!industries.length) throw new Error(`No Wikidata industry matches “${recipe.keywords.join(' ')}”`);
    const industryMatch = industries.map((i) => `{ ?c wdt:P452 wd:${i.id} . BIND(wd:${i.id} AS ?ind) }`).join(' UNION ');
    const country = recipe.country ? `?c wdt:P17 ?cty . ?cty wdt:P297 "${recipe.country}" .` : 'OPTIONAL { ?c wdt:P17 ?cty . }';
    const lim = Math.min(600, Math.max(60, recipe.limit * 3));
    // The label service is far cheaper than rdfs:label filters; rows are grouped per entity client-side.
    const q = `SELECT ?c ?cLabel ?website ?employees ?inception ?hqLabel ?ctyLabel ?indLabel WHERE {
  ${industryMatch}
  ${country}
  OPTIONAL { ?c wdt:P856 ?website }
  OPTIONAL { ?c wdt:P1128 ?employees }
  OPTIONAL { ?c wdt:P571 ?inception }
  OPTIONAL { ?c wdt:P159 ?hq }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,de,fr,es,mul". }
} LIMIT ${lim}`;
    const apiUrl = WD + encodeURIComponent(q);
    const data = await call(apiUrl);
    const now = Date.now();
    const rows: any[] = data.results?.bindings ?? [];
    const byEntity = new Map<string, { i: number; rows: any[] }>();
    rows.forEach((r, i) => {
      const e = byEntity.get(r.c.value) ?? { i, rows: [] };
      e.rows.push(r);
      byEntity.set(r.c.value, e);
    });
    const pick = (rs: any[], k: string) => rs.find((r) => r[k]?.value)?.[k]?.value ?? null;
    const out: RawRecord[] = [];
    for (const [uri, { i, rows: rs }] of byEntity) {
      const qid = uri.split('/').pop()!;
      const name = pick(rs, 'cLabel');
      if (!name || /^Q\d+$/.test(name)) continue; // no human-readable label
      const b = recordBuilder({ sourceId: 'wikidata', apiUrl, recordUrl: uri, fetchedAt: now });
      const p = `bindings[${i}]`;
      const emps = rs.map((r) => num(r.employees?.value)).filter((x): x is number => x !== null);
      const incs = rs.map((r) => r.inception?.value).filter(Boolean).sort();
      out.push({
        sourceId: 'wikidata',
        text: [name, pick(rs, 'indLabel'), pick(rs, 'hqLabel'), pick(rs, 'ctyLabel')].filter(Boolean).join(' · '),
        fields: {
          name: b(name, `${p}.cLabel (label@en)`),
          industry: b(pick(rs, 'indLabel'), `${p}.indLabel (P452)`),
          country: b(pick(rs, 'ctyLabel'), `${p}.ctyLabel (P17)`),
          hq: b(pick(rs, 'hqLabel'), `${p}.hqLabel (P159)`),
          website: b(pick(rs, 'website'), `${p}.website (P856)`),
          founded: b(toDate(incs[0]), `${p}.inception (P571)`, incs[0] ?? null, incs.length > 1 ? 'Earliest of several values' : 'xsd:dateTime → date'),
          employees: b(emps.length ? Math.max(...emps) : null, `${p}.employees (P1128)`, emps, emps.length > 1 ? 'Largest reported value' : undefined),
          url: b(`https://www.wikidata.org/wiki/${qid}`, `${p}.c`, uri, 'Entity URI → page'),
        },
      });
    }
    return out;
  },
};

export const githubOrgs: SourceDef = {
  id: 'github_orgs',
  name: 'GitHub organisations',
  host: 'github.com',
  intents: ['companies'],
  provides: 'Engineering-active organisations matching a keyword and location, with public profile data.',
  terms: 'GitHub REST API under the GitHub Terms of Service; unauthenticated: 10 searches/min, 60 calls/hour.',
  termsUrl: 'https://docs.github.com/en/site-policy/github-terms/github-terms-of-service',
  attribution: 'Profiles from GitHub',
  rate: '60 req/hour (unauthenticated)',
  serverSearch: true,
  fit: () => ({ score: 0.6, reason: 'Finds tech-forward orgs that are active on GitHub' }),
  async fetch({ recipe, call, log }) {
    const kw = recipe.keywords.slice(0, 2).join(' ');
    const loc = recipe.city ?? recipe.countryName;
    const q = `${kw} type:org${loc ? ` location:"${loc}"` : ''}`;
    const apiUrl = `https://api.github.com/search/users?q=${encodeURIComponent(q)}&per_page=30`;
    const data = await call(apiUrl);
    const items = (data.items ?? []).slice(0, 12);
    log(`${data.total_count ?? 0} organisations matched; enriching top ${items.length}`);
    const out: RawRecord[] = [];
    const terms = locationTerms(recipe.country, recipe.city);
    for (const [i, it] of items.entries()) {
      const detailUrl = `https://api.github.com/orgs/${it.login}`;
      let o: any;
      try {
        o = await call(detailUrl);
      } catch (e) {
        log(`Could not enrich ${it.login}: ${(e as Error).message}`);
        if (/HTTP 403|HTTP 429/.test((e as Error).message)) break; // rate limited — stop early
        continue;
      }
      const now = Date.now();
      const b = recordBuilder({ sourceId: 'github_orgs', apiUrl: detailUrl, recordUrl: o.html_url, fetchedAt: now });
      const locText = String(o.location ?? '');
      const inCountry = recipe.countryName && terms.some((t) => locText.toLowerCase().includes(t.trim()));
      const site = o.blog ? (/^https?:/.test(o.blog) ? o.blog : `https://${o.blog}`) : null;
      out.push({
        sourceId: 'github_orgs',
        text: [o.name, o.description, o.location, kw].filter(Boolean).join(' · '),
        fields: {
          name: b(o.name || o.login, o.name ? 'name' : 'login'),
          industry: b(null, 'description', o.description ?? '', 'Not classified by GitHub'),
          country: b(inCountry ? recipe.countryName! : null, 'location', o.location, inCountry ? 'Location text matched the requested country' : undefined),
          hq: b(o.location || null, 'location'),
          website: b(site, 'blog', o.blog, o.blog && site !== o.blog ? 'Added https:// scheme' : undefined),
          founded: b(null, 'created_at', o.created_at, 'GitHub join date is not a founding date — left empty'),
          employees: b(null, '', ''),
          url: b(o.html_url, 'html_url'),
        },
      });
      void i;
    }
    return out;
  },
};
