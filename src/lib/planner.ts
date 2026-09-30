import type { FieldSpec, Intent, Recipe } from './types';
import { INDICATORS, INTENTS } from './schema';
import { sourcesFor } from './sources';
import { countryName, findAllCountries, findGeo } from './geo';
import { cosine, embed, model } from './embed';
import { STOP, uid } from './util';

export interface PlanDraft {
  intent: Intent;
  title?: string;
  keywords: string[];
  context: string[];
  excludes: string[];
  country?: string;
  countries?: string[];
  city?: string;
  remote?: boolean;
  since?: string;
  limit: number;
  sort: Recipe['sort'];
  indicator?: string;
  requiredFields: string[];
  notes: string[];
}

const FIELD_SYNONYMS: [RegExp, string][] = [
  [/salar(y|ies)|pay|compensation|comp\b/, 'salary'],
  [/websites?|homepages?|domains?/, 'website'],
  [/pdfs?|open access|full text/, 'pdf'],
  [/licen[cs]es?/, 'license'],
  [/dois?/, 'doi'],
  [/headcount|employees|employee count|team size/, 'employees'],
  [/founding (date|year)|founded|year founded/, 'founded'],
  [/hq|headquarters|head office/, 'hq'],
];

const ROLE_WORDS = new Set(
  'engineer engineers developer developers dev devs designer designers manager managers scientist scientists analyst analysts architect architects programmer programmers consultant consultants specialist specialists writer writers marketer marketers recruiter recruiters intern interns internship internships trainee trainees apprentice apprenticeship researcher researchers'.split(' '),
);
const SENIORITY = new Set('senior junior mid lead staff principal entry entry-level head chief'.split(' '));
const FILLER = new Set(
  'market markets cap marketcap capitalization price prices volume ranked rank ranking by projects project things stuff items entries results data dataset datasets info information details list lists table sheet spreadsheet posted published updated released listed listing lists days day weeks week months month years year today yesterday most highly cited popular trending starred say saying said talking think people folks developers devs latest newest recent recently new fresh best good great number numbers stats statistics currently current active open available right now across globally worldwide world global remote remotely anywhere hybrid onsite on-site office full-time part-time fulltime contract freelance including include includes have has having that which with where who whose also time period range since from until between during over through'.split(' '),
);

const ALL_CUES = new Set(Object.values(INTENTS).flatMap((d) => d.cues.filter((c) => !c.includes(' '))));

function words(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[“”"]/g, ' ')
    .split(/[\s,;:!?()/]+/)
    .map((w) => w.replace(/^[.'-]+|[.'-]+$/g, ''))
    .filter(Boolean);
}

function startOf(unit: 'week' | 'month' | 'year') {
  const d = new Date();
  if (unit === 'week') d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  if (unit === 'month') d.setDate(1);
  if (unit === 'year') d.setMonth(0, 1);
  return d.toISOString().slice(0, 10);
}

function minus(n: number, unit: string) {
  const d = new Date();
  const u = unit.replace(/s$/, '');
  if (u === 'day') d.setDate(d.getDate() - n);
  if (u === 'week') d.setDate(d.getDate() - 7 * n);
  if (u === 'month') d.setMonth(d.getMonth() - n);
  if (u === 'year') d.setFullYear(d.getFullYear() - n);
  return d.toISOString().slice(0, 10);
}

async function classify(brief: string, notes: string[]): Promise<Intent> {
  const lower = ' ' + brief.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ') + ' ';
  const scores: Record<string, number> = {};
  const hits: Record<string, string[]> = {};
  for (const d of Object.values(INTENTS)) {
    const h = d.cues.filter((c) => lower.includes(' ' + c + ' '));
    hits[d.id] = h;
    scores[d.id] = h.length;
  }
  if (/\bgdp|inflation|population|unemployment/.test(lower)) scores.economy += 2;
  let semantic = '';
  if (model.status === 'ready') {
    const defs = Object.values(INTENTS);
    const vecs = await embed([brief, ...defs.map((d) => d.profile)]);
    if (vecs) {
      const sims = defs.map((d, i) => [d.id, cosine(vecs[0], vecs[i + 1])] as const);
      const max = Math.max(...sims.map((s) => s[1]));
      for (const [id, s] of sims) scores[id] += 2.5 * Math.max(0, s - (max - 0.25)) / 0.25;
      const best = sims.reduce((a, b) => (b[1] > a[1] ? b : a));
      semantic = `; on-device model similarity ${best[1].toFixed(2)} to “${INTENTS[best[0]].label}”`;
    }
  }
  const intent = (Object.entries(scores).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'discussions') as Intent;
  const winning = scores[intent] > 0 ? intent : 'discussions';
  notes.push(`Read as **${INTENTS[winning].label}**${hits[winning].length ? ` (cues: ${hits[winning].map((c) => `“${c}”`).join(', ')})` : ''}${semantic}.`);
  return winning;
}

export async function planLocal(brief: string): Promise<PlanDraft> {
  const notes: string[] = [];
  const text = brief.trim();
  const lower = text.toLowerCase();
  const intent = await classify(text, notes);
  let rest = ' ' + lower + ' ';
  const cut = (re: RegExp) => {
    rest = rest.replace(re, ' ');
  };

  // Purpose clauses ("for a sponsor outreach list") describe why, not what.
  cut(/\b(for|so that|so i can|to help|to use|to build)\s+(a|an|my|our|the|us|me)\b.*$/);

  // Time window
  let since: string | undefined;
  let m: RegExpMatchArray | null;
  if ((m = lower.match(/\b(?:last|past|previous)\s+(\d{1,3})\s+(days?|weeks?|months?|years?)\b/))) {
    since = minus(+m[1], m[2]);
    notes.push(`Time window: last ${m[1]} ${m[2]} → since ${since}.`);
    cut(new RegExp(m[0]));
  } else if ((m = lower.match(/\b(?:last|past)\s+(day|week|month|year)\b/))) {
    since = minus(1, m[1]);
    notes.push(`Time window: past ${m[1]} → since ${since}.`);
    cut(new RegExp(m[0]));
  } else if ((m = lower.match(/\bthis\s+(week|month|year)\b/))) {
    since = startOf(m[1] as 'week');
    notes.push(`Time window: this ${m[1]} → since ${since}.`);
    cut(new RegExp(m[0]));
  } else if ((m = lower.match(/\b(?:since|after|from|in|during)\s+((?:19|20)\d{2})\b/))) {
    since = `${m[1]}-01-01`;
    notes.push(`Time window: since ${m[1]}.`);
    cut(new RegExp(m[0]));
  } else if (/\btoday\b/.test(lower)) {
    since = minus(1, 'day');
    notes.push('Time window: last 24 hours.');
  }

  // Sort preference
  let sort: Recipe['sort'] = 'relevance';
  if (/\b(most cited|highly cited|most popular|popular|most starred|trending|top|influential|biggest|largest|leading|best)\b/.test(lower)) sort = 'popular';
  else if (/\b(latest|newest|recent|recently|fresh|new)\b/.test(lower)) sort = 'recent';
  if (sort !== 'relevance') notes.push(`Ordering hint: ${sort === 'popular' ? 'popularity / impact first' : 'most recent first'}.`);

  // Count
  let limit = intent === 'economy' ? 300 : intent === 'crypto' ? 25 : 60;
  if ((m = lower.match(/\b(?:top|first|find|get|list|show|give me|collect|gather)?\s*(\d{1,3})\b(?!\s*(?:days?|weeks?|months?|years?|%|k\b|hours?))/))) {
    const n = +m[1];
    if (n >= 3 && n <= 500) {
      limit = n;
      notes.push(`Target size: ${n} records.`);
      cut(new RegExp(`\\b${m[1]}\\b`));
    }
  }

  // Remote / on-site
  let remote: boolean | undefined;
  if (/\bremote(ly)?\b|work from home|\bwfh\b|\banywhere\b|distributed/.test(lower)) remote = true;
  else if (/\bon-?site\b|in-office|in office/.test(lower)) remote = false;
  if (remote !== undefined && intent === 'jobs') notes.push(remote ? 'Only remote-friendly roles.' : 'On-site roles only.');

  // Geography
  let country: string | undefined;
  let countries: string[] | undefined;
  let city: string | undefined;
  if (intent === 'economy') {
    countries = findAllCountries(text);
    if (countries.length) notes.push(`Countries: ${countries.map(countryName).join(', ')}.`);
    else notes.push('No country named — pulling all economies.');
  } else {
    const g = findGeo(text);
    country = g.country;
    city = g.city;
    if (country) notes.push(`Location grounded to ${city ? `${city}, ` : ''}${countryName(country)} (${country}).`);
  }
  // Remove every place word from the keyword pool.
  for (const n of [country, ...(countries ?? [])].filter(Boolean) as string[]) {
    const nm = countryName(n)?.toLowerCase();
    if (nm) cut(new RegExp(`\\b${nm}\\b`, 'g'));
  }
  const geoWords = findGeo(text).matched;
  geoWords.forEach((w) => cut(new RegExp(`\\b${w}\\b`, 'g')));
  if (countries) for (const c of countries) cut(new RegExp(`\\b${(countryName(c) ?? '').toLowerCase()}\\b`, 'g'));
  cut(/\b(indonesia|vietnam|brazil|india|china|japan|germany|france|europe|european|emea|apac|latam|asia|africa|americas)\b/g);

  // Required fields
  const requiredFields: string[] = [];
  const fieldClause = lower.match(/\b(?:with|that (?:list|lists|include|includes|have|has|show|shows|mention|mentions)|listing|including|having)\s+(?:a|an|the|their)?\s*([a-z ]{2,40})/g) ?? [];
  for (const clause of fieldClause) {
    for (const [re, key] of FIELD_SYNONYMS) {
      if (re.test(clause) && !requiredFields.includes(key)) {
        requiredFields.push(key);
        cut(new RegExp(clause.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
      }
    }
  }
  if (requiredFields.length) notes.push(`Must have: ${requiredFields.join(', ')}.`);

  // Exclusions
  const excludes: string[] = [];
  for (const mm of lower.matchAll(/\b(?:not|excluding|except|exclude|no|without)\s+([a-z0-9+#.-]+(?:\s+[a-z0-9+#.-]+)?)/g)) {
    const phrase = mm[1].replace(/\b(and|or|in|with|jobs?|roles?)\b.*$/, '').trim();
    if (phrase && !FIELD_SYNONYMS.some(([re]) => re.test(phrase))) {
      excludes.push(phrase);
      cut(new RegExp(mm[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
  }
  if (excludes.length) notes.push(`Excluding anything mentioning: ${excludes.join(', ')}.`);

  // Economy indicator
  let indicator: string | undefined;
  if (intent === 'economy') {
    const byLen = INDICATORS.flatMap((i) => i.cues.map((c) => [c, i] as const)).sort((a, b) => b[0].length - a[0].length);
    const hit = byLen.find(([c]) => lower.includes(c));
    indicator = (hit?.[1] ?? INDICATORS[0]).code;
    notes.push(`Indicator: ${(hit?.[1] ?? INDICATORS[0]).label}${hit ? '' : ' (default)'}.`);
  }

  // Keywords: whatever meaningful words remain.
  const quoted = [...text.matchAll(/["“]([^"”]+)["”]/g)].map((q) => q[1].toLowerCase());
  const context: string[] = [];
  const kws: string[] = [];
  for (const w of words(rest)) {
    if (w.length < 2 && !/^[cr]$/.test(w)) continue;
    if (STOP.has(w) || FILLER.has(w) || /^\d+$/.test(w)) continue;
    if (ROLE_WORDS.has(w) || SENIORITY.has(w)) {
      context.push(w);
      continue;
    }
    if (ALL_CUES.has(w) && !(intent === 'crypto' && /bitcoin|ethereum/.test(w))) continue;
    if (/^(or|and|nor|but|vs|versus)$/.test(w)) continue;
    if (!kws.includes(w)) kws.push(w);
  }
  let keywords = [...quoted, ...kws.filter((k) => !quoted.some((q) => q.includes(k)))];
  if (!keywords.length && context.length && intent === 'jobs') keywords = [context.find((c) => ROLE_WORDS.has(c)) ?? context[0]];

  // Keep multi-word topics together when the brief joins them without "or".
  const listed = /\bor\b|\//.test(lower) || /\w,\s*\w+(\s+or|\s+and)?/.test(lower.replace(/,\s*(for|with|in|since|posted|that|not|excluding)\b.*/, ''));
  if (intent !== 'crypto' && keywords.length > 1 && !listed) {
    keywords = [keywords.join(' ')];
  }
  if (keywords.length) notes.push(`Search terms: ${keywords.map((k) => `“${k}”`).join(', ')}${context.length ? `; ranking context: ${context.join(', ')}` : ''}.`);
  else if (intent !== 'economy' && intent !== 'crypto') notes.push('No specific topic found — results will be broad.');

  return { intent, keywords, context, excludes, country, countries, city, remote, since, limit, sort, indicator, requiredFields, notes };
}

/** Restores the user's casing for a term ("typescript" → "TypeScript" if they wrote it that way). */
function cased(term: string, brief: string) {
  const at = brief.toLowerCase().indexOf(term.toLowerCase());
  const t = at >= 0 ? brief.slice(at, at + term.length) : term;
  return t === t.toLowerCase() ? t[0].toUpperCase() + t.slice(1) : t;
}

export function titleFor(d: PlanDraft, brief = '') {
  const def = INTENTS[d.intent];
  if (d.intent === 'crypto') {
    const cat = [['defi', 'DeFi'], ['stable', 'Stablecoin'], ['layer 1', 'Layer-1'], ['layer 2', 'Layer-2'], ['meme', 'Meme'], ['gaming', 'Gaming']].find(([k]) => d.keywords.join(' ').includes(k) || d.notes.join(' ').toLowerCase().includes(k));
    return `${cat ? cat[1] + ' tokens' : d.keywords.length ? d.keywords.join(', ') : 'Top crypto assets'} · market snapshot`;
  }
  const topic = d.intent === 'economy' ? INDICATORS.find((i) => i.code === d.indicator)?.label ?? 'Indicators' : d.keywords.slice(0, 3).map((k) => cased(k, brief)).join(' / ');
  const place = d.city ?? countryName(d.country) ?? (d.countries?.length ? d.countries.map((c) => countryName(c) ?? c).join(', ') : '');
  const bits = [topic ? `${topic[0].toUpperCase()}${topic.slice(1)}` : def.label, d.intent !== 'economy' && topic ? def.label.toLowerCase() : '', place ? `· ${place}` : '', d.remote && d.intent === 'jobs' ? '· remote' : ''];
  return bits.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

/** Turns a draft (from the local planner or Claude) into an executable recipe. */
export function assemble(brief: string, d: PlanDraft, plannedBy: Recipe['plannedBy'], prev?: Recipe): Recipe {
  const def = INTENTS[d.intent];
  const fields: FieldSpec[] = def.fields.map((f) => ({ ...f, required: f.required || d.requiredFields.includes(f.key), visible: f.visible || d.requiredFields.includes(f.key) }));
  const base: Recipe = {
    id: prev?.id ?? uid('r_'),
    title: d.title?.trim() || titleFor(d, brief),
    brief,
    intent: d.intent,
    keywords: d.keywords,
    context: d.context,
    excludes: d.excludes,
    country: d.country,
    countries: d.countries,
    countryName: countryName(d.country),
    city: d.city,
    remote: d.remote,
    since: d.since,
    limit: d.limit,
    sort: d.sort,
    indicator: d.indicator,
    fields,
    sources: [],
    plannedBy,
    planNotes: d.notes,
    watch: prev?.watch ?? null,
    createdAt: prev?.createdAt ?? Date.now(),
    updatedAt: Date.now(),
  };
  base.sources = pickSources(base);
  return base;
}

export function pickSources(r: Recipe) {
  return sourcesFor(r.intent).map((s) => {
    const fit = s.fit?.(r) ?? { score: 0.7, reason: s.provides };
    return { id: s.id, enabled: fit.score >= 0.35, reason: fit.reason };
  });
}
