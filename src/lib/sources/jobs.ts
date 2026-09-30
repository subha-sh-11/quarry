import type { RawRecord, SourceDef } from '../types';
import { clip, recordBuilder, stripHtml, toDate } from '../util';

const kwQueries = (kw: string[], max = 3) => (kw.length ? kw.slice(0, max) : ['']);

export const remotive: SourceDef = {
  id: 'remotive',
  name: 'Remotive',
  host: 'remotive.com',
  intents: ['jobs'],
  provides: 'Curated remote jobs with category, salary text and candidate location.',
  terms: 'Public API. Must link back to Remotive and credit it as the source. Max ~4 requests/min.',
  termsUrl: 'https://github.com/remotive-com/remote-jobs-api',
  attribution: 'Jobs via Remotive',
  rate: '4 req/min',
  serverSearch: true,
  fit: (r) => ({ score: r.remote === false ? 0.4 : 0.9, reason: 'Remote-only board with salary text on many listings' }),
  async fetch({ recipe, call }) {
    const out: RawRecord[] = [];
    for (const q of kwQueries(recipe.keywords, 2)) {
      const apiUrl = `https://remotive.com/api/remote-jobs?limit=150${q ? `&search=${encodeURIComponent(q)}` : ''}`;
      const data = await call(apiUrl);
      const now = Date.now();
      (data.jobs ?? []).forEach((j: any, i: number) => {
        const b = recordBuilder({ sourceId: 'remotive', apiUrl, recordUrl: j.url, fetchedAt: now });
        const p = `jobs[${i}]`;
        out.push({
          sourceId: 'remotive',
          text: [j.title, j.company_name, j.category, (j.tags ?? []).join(' '), clip(stripHtml(j.description), 2500)].join(' · '),
          fields: {
            title: b(j.title, `${p}.title`),
            company: b(j.company_name, `${p}.company_name`),
            location: b(j.candidate_required_location || 'Worldwide', `${p}.candidate_required_location`),
            remote: b(true, `${p}`, 'remote-only board', 'Implied: every Remotive listing is remote'),
            salary: b(j.salary || null, `${p}.salary`),
            type: b(j.job_type ? String(j.job_type).replace(/_/g, ' ') : null, `${p}.job_type`),
            tags: b(j.tags ?? [], `${p}.tags`),
            posted: b(toDate(j.publication_date), `${p}.publication_date`, j.publication_date, 'ISO datetime → date'),
            url: b(j.url, `${p}.url`),
          },
        });
      });
    }
    return out;
  },
};

export const arbeitnow: SourceDef = {
  id: 'arbeitnow',
  name: 'Arbeitnow',
  host: 'arbeitnow.com',
  intents: ['jobs'],
  provides: 'European (mostly German) job board feed, on-site and remote, updated hourly.',
  terms: 'Free public API; do not abuse. Link back to Arbeitnow appreciated.',
  termsUrl: 'https://www.arbeitnow.com/blog/job-board-api',
  attribution: 'Jobs via Arbeitnow',
  rate: 'Fair use',
  serverSearch: false,
  fit: (r) => {
    const eu = ['DE', 'AT', 'CH', 'NL', 'FR', 'ES', 'IT', 'PL', 'IE', 'PT', 'BE', 'SE', 'DK'].includes(r.country ?? '');
    return { score: eu ? 1 : r.country ? 0.2 : 0.6, reason: eu ? 'Strong coverage of European on-site roles' : 'European feed; filtered locally by keyword' };
  },
  async fetch({ recipe, call }) {
    const out: RawRecord[] = [];
    const pages = recipe.limit > 60 ? 3 : 2;
    for (let page = 1; page <= pages; page++) {
      const apiUrl = `https://www.arbeitnow.com/api/job-board-api?page=${page}`;
      const data = await call(apiUrl);
      const now = Date.now();
      (data.data ?? []).forEach((j: any, i: number) => {
        const b = recordBuilder({ sourceId: 'arbeitnow', apiUrl, recordUrl: j.url, fetchedAt: now });
        const p = `data[${i}]`;
        out.push({
          sourceId: 'arbeitnow',
          text: [j.title, j.company_name, j.location, (j.tags ?? []).join(' '), clip(stripHtml(j.description), 2500)].join(' · '),
          fields: {
            title: b(j.title, `${p}.title`),
            company: b(j.company_name, `${p}.company_name`),
            location: b(j.location, `${p}.location`),
            remote: b(!!j.remote, `${p}.remote`),
            salary: b(null, `${p}`, 'not provided'),
            type: b((j.job_types ?? []).join(', ') || null, `${p}.job_types`),
            tags: b(j.tags ?? [], `${p}.tags`),
            posted: b(toDate(j.created_at), `${p}.created_at`, j.created_at, 'Unix seconds → date'),
            url: b(j.url, `${p}.url`),
          },
        });
      });
    }
    return out;
  },
};

export const remoteok: SourceDef = {
  id: 'remoteok',
  name: 'Remote OK',
  host: 'remoteok.com',
  intents: ['jobs'],
  provides: 'Remote tech jobs with structured salary ranges and tags.',
  terms: 'Public API. Must link back to Remote OK (followed link) and mention it as the source.',
  termsUrl: 'https://remoteok.com/api',
  attribution: 'Jobs via Remote OK',
  rate: 'Fair use',
  serverSearch: true,
  fit: (r) => ({ score: r.remote === false ? 0.3 : 0.85, reason: 'Structured min/max salary on most remote listings' }),
  async fetch({ recipe, call }) {
    const out: RawRecord[] = [];
    const tags = recipe.keywords.length ? recipe.keywords.slice(0, 2).map((k) => k.toLowerCase().replace(/\s+/g, '-')) : [''];
    for (const tag of tags) {
      const apiUrl = `https://remoteok.com/api${tag ? `?tag=${encodeURIComponent(tag)}` : ''}`;
      const data = await call(apiUrl);
      const now = Date.now();
      (Array.isArray(data) ? data : []).forEach((j: any, i: number) => {
        if (!j.position) return; // first element is the legal notice
        const b = recordBuilder({ sourceId: 'remoteok', apiUrl, recordUrl: j.url, fetchedAt: now });
        const p = `[${i}]`;
        const sal = j.salary_min || j.salary_max ? `USD ${Math.round((j.salary_min || 0) / 1000)}k–${Math.round((j.salary_max || 0) / 1000)}k` : null;
        out.push({
          sourceId: 'remoteok',
          text: [j.position, j.company, j.location, (j.tags ?? []).join(' '), clip(stripHtml(j.description), 2500)].join(' · '),
          fields: {
            title: b(j.position, `${p}.position`),
            company: b(String(j.company ?? '').trim(), `${p}.company`),
            location: b(j.location || 'Worldwide', `${p}.location`),
            remote: b(true, `${p}`, 'remote-only board', 'Implied: every Remote OK listing is remote'),
            salary: b(sal, `${p}.salary_min / salary_max`, { min: j.salary_min, max: j.salary_max }, sal ? 'Annual USD range, rounded to thousands' : undefined),
            type: b(null, p, 'not provided'),
            tags: b(j.tags ?? [], `${p}.tags`),
            posted: b(toDate(j.date), `${p}.date`, j.date, 'ISO datetime → date'),
            url: b(j.url, `${p}.url`),
          },
        });
      });
    }
    return out;
  },
};

export const jobicy: SourceDef = {
  id: 'jobicy',
  name: 'Jobicy',
  host: 'jobicy.com',
  intents: ['jobs'],
  provides: 'Remote jobs with seniority level, industry and geographic restriction.',
  terms: 'Public API. Credit Jobicy with a direct link; applications must go to the Jobicy listing.',
  termsUrl: 'https://jobicy.com/jobs-rss-feed',
  attribution: 'Jobs via Jobicy',
  rate: 'Fair use, cached hourly',
  serverSearch: true,
  fit: (r) => ({ score: r.remote === false ? 0.3 : 0.75, reason: 'Adds seniority level and geo restriction per role' }),
  async fetch({ recipe, call }) {
    const out: RawRecord[] = [];
    for (const q of kwQueries(recipe.keywords, 2)) {
      const apiUrl = `https://jobicy.com/api/v2/remote-jobs?count=100${q ? `&tag=${encodeURIComponent(q)}` : ''}`;
      const data = await call(apiUrl);
      const now = Date.now();
      (data.jobs ?? []).forEach((j: any, i: number) => {
        const b = recordBuilder({ sourceId: 'jobicy', apiUrl, recordUrl: j.url, fetchedAt: now });
        const p = `jobs[${i}]`;
        const min = j.salaryMin ?? j.annualSalaryMin;
        const max = j.salaryMax ?? j.annualSalaryMax;
        const cur = j.salaryCurrency ?? '';
        const sal = min || max ? `${cur} ${min ? Math.round(min / 1000) + 'k' : ''}–${max ? Math.round(max / 1000) + 'k' : ''}`.trim() : null;
        out.push({
          sourceId: 'jobicy',
          text: [j.jobTitle, j.companyName, j.jobGeo, j.jobLevel, (j.jobIndustry ?? []).join(' '), clip(stripHtml(j.jobDescription || j.jobExcerpt), 2500)].join(' · '),
          fields: {
            title: b(stripHtml(j.jobTitle), `${p}.jobTitle`),
            company: b(j.companyName, `${p}.companyName`),
            location: b(j.jobGeo || 'Anywhere', `${p}.jobGeo`),
            remote: b(true, p, 'remote-only board', 'Implied: every Jobicy listing is remote'),
            salary: b(sal, `${p}.salaryMin / salaryMax`, { min, max, cur }, sal ? 'Range rounded to thousands' : undefined),
            type: b((j.jobType ?? []).join(', ') || null, `${p}.jobType`),
            tags: b([...(j.jobIndustry ?? []), j.jobLevel].filter((x: string) => x && x !== 'Any').map(stripHtml), `${p}.jobIndustry + jobLevel`),
            posted: b(toDate(j.pubDate), `${p}.pubDate`, j.pubDate, 'ISO datetime → date'),
            url: b(j.url, `${p}.url`),
          },
        });
      });
    }
    return out;
  },
};

const ROLE = /(engineer|developer|designer|manager|scientist|analyst|lead|architect|intern|head of|director|founder|sre|devops|researcher|specialist|consultant|writer|marketer|product|recruiter|cto|vp)/i;

/** Parses the conventional first line of an HN hiring comment: "Company | Role | Location | REMOTE | Salary | URL". */
export function parseHiringLine(html: string) {
  const text = stripHtml(html);
  const first = text.split('\n')[0] ?? '';
  const parts = first.split(/\s[|•·]\s|\s\|\s?|\s-{1,2}\s/).map((s) => s.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const company = parts[0].replace(/\(.*?\)/g, '').trim();
  let title = parts.find((p, i) => i > 0 && ROLE.test(p)) ?? '';
  const salaryPart = parts.find((p) => /([$€£₹]\s?\d|\d+\s?k\b|\d{2,3},\d{3})/i.test(p)) ?? null;
  const remote = /remote/i.test(first);
  const urlMatch = text.match(/https?:\/\/[^\s)]+/);
  const loc = parts.find((p, i) => i > 0 && p !== title && p !== salaryPart && !/https?:/.test(p) && !/^(full[- ]?time|part[- ]?time|contract|onsite|on-site|remote|hybrid|visa)/i.test(p) && /^[A-Z][A-Za-z .,'/()-]+$/.test(p) && p.length < 60);
  if (title.length > 90) title = title.slice(0, 88) + '…';
  return { company, title, location: loc ?? (remote ? 'Remote' : null), remote, salary: salaryPart, link: urlMatch?.[0] ?? null, first, text };
}

export const hnHiring: SourceDef = {
  id: 'hn_hiring',
  name: 'HN “Who is hiring?”',
  host: 'news.ycombinator.com',
  intents: ['jobs'],
  provides: 'Direct-from-founder roles posted in the latest monthly hiring thread, parsed from free text.',
  terms: 'Read via the official HN Algolia search API. Content belongs to its authors; link to the original comment.',
  termsUrl: 'https://hn.algolia.com/api',
  attribution: 'Comments from Hacker News',
  rate: '10k req/hour',
  serverSearch: true,
  fit: () => ({ score: 0.7, reason: 'Startup roles straight from founders; free text parsed into fields' }),
  async fetch({ recipe, call, log, ground }) {
    const find = `https://hn.algolia.com/api/v1/search_by_date?tags=story,author_whoishiring&query=${encodeURIComponent('Who is hiring')}&hitsPerPage=5`;
    const threads = await call(find);
    const thread = (threads.hits ?? []).find((h: any) => /who is hiring/i.test(h.title));
    if (!thread) throw new Error('No hiring thread found');
    ground.hnThread = { id: thread.objectID, title: thread.title };
    log(`Using thread “${thread.title}” (${thread.num_comments} comments)`);
    const out: RawRecord[] = [];
    const seen = new Set<string>();
    for (const q of kwQueries(recipe.keywords, 3)) {
      const apiUrl = `https://hn.algolia.com/api/v1/search?tags=comment,story_${thread.objectID}&hitsPerPage=200${q ? `&query=${encodeURIComponent(q)}` : ''}`;
      const data = await call(apiUrl);
      const now = Date.now();
      (data.hits ?? []).forEach((h: any, i: number) => {
        if (seen.has(h.objectID) || h.parent_id !== +thread.objectID) return; // top-level posts only
        seen.add(h.objectID);
        const parsed = parseHiringLine(h.comment_text ?? '');
        if (!parsed) return;
        const recordUrl = `https://news.ycombinator.com/item?id=${h.objectID}`;
        const b = recordBuilder({ sourceId: 'hn_hiring', apiUrl, recordUrl, fetchedAt: now });
        const p = `hits[${i}].comment_text`;
        out.push({
          sourceId: 'hn_hiring',
          text: clip(parsed.text, 900),
          fields: {
            title: b(parsed.title || null, `${p} › line 1`, parsed.first, 'Segment matching a role keyword'),
            company: b(parsed.company, `${p} › line 1 › segment 1`, parsed.first, 'First pipe-delimited segment'),
            location: b(parsed.location, `${p} › line 1`, parsed.first, 'Segment that looks like a place'),
            remote: b(parsed.remote, `${p} › line 1`, parsed.first, 'Contains “remote”'),
            salary: b(parsed.salary, `${p} › line 1`, parsed.first, 'Segment with a currency amount'),
            type: b(null, p, ''),
            tags: b([], p, ''),
            posted: b(toDate(h.created_at), `hits[${i}].created_at`, h.created_at, 'ISO datetime → date'),
            url: b(recordUrl, `hits[${i}].objectID`, h.objectID, 'Comment permalink'),
          },
        });
      });
    }
    return out;
  },
};
