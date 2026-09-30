import type { RawRecord, SourceDef } from '../types';
import { clip, recordBuilder, stripHtml, toDate } from '../util';

const q = (kw: string[]) => kw.join(' ');

export const openalex: SourceDef = {
  id: 'openalex',
  name: 'OpenAlex',
  host: 'openalex.org',
  intents: ['research'],
  provides: '250M+ scholarly works with citation counts, venues, authors and open-access links.',
  terms: 'CC0 data. Free API; include a contact email for the polite pool. 100k calls/day.',
  termsUrl: 'https://docs.openalex.org/how-to-use-the-api/rate-limits-and-authentication',
  attribution: 'Metadata from OpenAlex (CC0)',
  rate: '10 req/s',
  serverSearch: true,
  fit: () => ({ score: 1, reason: 'Title/abstract search with citation counts and country filter' }),
  async fetch({ recipe, call }) {
    const filters = [`title_and_abstract.search:${q(recipe.keywords)}`];
    if (recipe.since) filters.push(`from_publication_date:${recipe.since}`);
    if (recipe.country) filters.push(`institutions.country_code:${recipe.country}`);
    const sort = recipe.sort === 'recent' ? '&sort=publication_date:desc' : recipe.sort === 'popular' ? '&sort=cited_by_count:desc' : '';
    const apiUrl = `https://api.openalex.org/works?filter=${encodeURIComponent(filters.join(','))}${sort}&per-page=${Math.min(100, Math.max(25, recipe.limit))}&select=id,display_name,doi,publication_year,cited_by_count,authorships,primary_location,open_access,abstract_inverted_index&mailto=quarry-app@users.noreply.github.com`;
    const data = await call(apiUrl);
    const now = Date.now();
    return (data.results ?? []).map((w: any, i: number): RawRecord => {
      const b = recordBuilder({ sourceId: 'openalex', apiUrl, recordUrl: w.id, fetchedAt: now });
      const p = `results[${i}]`;
      const abs = w.abstract_inverted_index
        ? Object.entries(w.abstract_inverted_index as Record<string, number[]>)
            .flatMap(([word, pos]) => pos.map((x) => [x, word] as [number, string]))
            .sort((a, b) => a[0] - b[0])
            .map((x) => x[1])
            .slice(0, 120)
            .join(' ')
        : '';
      const authors = (w.authorships ?? []).slice(0, 6).map((a: any) => a.author?.display_name).filter(Boolean);
      return {
        sourceId: 'openalex',
        text: [w.display_name, abs].join(' · '),
        fields: {
          title: b(stripHtml(w.display_name), `${p}.display_name`),
          authors: b(authors, `${p}.authorships[*].author.display_name`, authors, 'First six authors'),
          venue: b(w.primary_location?.source?.display_name ?? null, `${p}.primary_location.source.display_name`),
          year: b(w.publication_year ?? null, `${p}.publication_year`),
          citations: b(w.cited_by_count ?? 0, `${p}.cited_by_count`),
          doi: b(w.doi ? String(w.doi).replace('https://doi.org/', '') : null, `${p}.doi`, w.doi, 'Stripped resolver prefix'),
          pdf: b(w.open_access?.oa_url ?? null, `${p}.open_access.oa_url`),
          url: b(w.doi || w.id, w.doi ? `${p}.doi` : `${p}.id`),
        },
      };
    });
  },
};

export const crossref: SourceDef = {
  id: 'crossref',
  name: 'Crossref',
  host: 'crossref.org',
  intents: ['research'],
  provides: 'DOI registry metadata from publishers: titles, journals, reference counts.',
  terms: 'Metadata is free to reuse. Polite pool: include mailto. No scraping of publisher sites.',
  termsUrl: 'https://www.crossref.org/documentation/retrieve-metadata/rest-api/',
  attribution: 'Metadata from Crossref',
  rate: '50 req/s (polite)',
  serverSearch: true,
  fit: () => ({ score: 0.7, reason: 'Publisher-registered DOIs to cross-check OpenAlex' }),
  async fetch({ recipe, call }) {
    const filters = ['type:journal-article'];
    if (recipe.since) filters.push(`from-pub-date:${recipe.since}`);
    const sort = recipe.sort === 'recent' ? '&sort=published&order=desc' : recipe.sort === 'popular' ? '&sort=is-referenced-by-count&order=desc' : '';
    const apiUrl = `https://api.crossref.org/works?query.bibliographic=${encodeURIComponent(q(recipe.keywords))}&filter=${filters.join(',')}${sort}&rows=${Math.min(60, Math.max(20, recipe.limit))}&select=DOI,title,author,container-title,issued,is-referenced-by-count,URL,link,abstract&mailto=quarry-app@users.noreply.github.com`;
    const data = await call(apiUrl);
    const now = Date.now();
    return (data.message?.items ?? []).map((w: any, i: number): RawRecord => {
      const b = recordBuilder({ sourceId: 'crossref', apiUrl, recordUrl: w.URL, fetchedAt: now });
      const p = `message.items[${i}]`;
      const authors = (w.author ?? []).slice(0, 6).map((a: any) => [a.given, a.family].filter(Boolean).join(' ')).filter(Boolean);
      const year = w.issued?.['date-parts']?.[0]?.[0] ?? null;
      const pdf = (w.link ?? []).find((l: any) => l['content-type'] === 'application/pdf')?.URL ?? null;
      return {
        sourceId: 'crossref',
        text: [w.title?.[0], clip(stripHtml(w.abstract), 700)].join(' · '),
        fields: {
          title: b(stripHtml(w.title?.[0]), `${p}.title[0]`),
          authors: b(authors, `${p}.author[*]`, authors, 'given + family, first six'),
          venue: b(w['container-title']?.[0] ?? null, `${p}.container-title[0]`),
          year: b(year, `${p}.issued.date-parts[0][0]`),
          citations: b(w['is-referenced-by-count'] ?? 0, `${p}.is-referenced-by-count`),
          doi: b(w.DOI ?? null, `${p}.DOI`),
          pdf: b(pdf, `${p}.link[type=pdf].URL`),
          url: b(w.URL, `${p}.URL`),
        },
      };
    });
  },
};

const LANGS = ['python', 'rust', 'go', 'typescript', 'javascript', 'java', 'kotlin', 'swift', 'ruby', 'php', 'elixir', 'scala', 'haskell', 'zig', 'dart', 'julia', 'c++', 'c#', 'lua', 'r'];

export const githubRepos: SourceDef = {
  id: 'github_repos',
  name: 'GitHub repositories',
  host: 'github.com',
  intents: ['opensource'],
  provides: 'Public repositories with stars, primary language, license and last push.',
  terms: 'GitHub REST API under the GitHub Terms of Service; unauthenticated: 10 searches/min.',
  termsUrl: 'https://docs.github.com/en/site-policy/github-terms/github-terms-of-service',
  attribution: 'Repositories from GitHub',
  rate: '10 searches/min',
  serverSearch: true,
  fit: () => ({ score: 1, reason: 'Primary index of open-source code with activity signals' }),
  async fetch({ recipe, call }) {
    const lang = recipe.keywords.find((k) => LANGS.includes(k.toLowerCase()));
    const kw = recipe.keywords.filter((k) => k !== lang);
    const parts = [kw.join(' ') || lang || 'stars:>100'];
    if (lang && kw.length) parts.push(`language:${lang}`);
    if (recipe.since) parts.push(`pushed:>=${recipe.since}`);
    parts.push('archived:false');
    const sort = recipe.sort === 'recent' ? 'updated' : 'stars';
    const apiUrl = `https://api.github.com/search/repositories?q=${encodeURIComponent(parts.join(' '))}&sort=${sort}&order=desc&per_page=${Math.min(100, Math.max(30, recipe.limit))}`;
    const data = await call(apiUrl);
    const now = Date.now();
    return (data.items ?? []).map((r: any, i: number): RawRecord => {
      const b = recordBuilder({ sourceId: 'github_repos', apiUrl, recordUrl: r.html_url, fetchedAt: now });
      const p = `items[${i}]`;
      return {
        sourceId: 'github_repos',
        text: [r.full_name, r.description, (r.topics ?? []).join(' ')].filter(Boolean).join(' · '),
        fields: {
          name: b(r.full_name, `${p}.full_name`),
          kind: b('Repository', p, 'search/repositories'),
          description: b(r.description ?? null, `${p}.description`),
          stars: b(r.stargazers_count, `${p}.stargazers_count`),
          language: b(r.language ?? null, `${p}.language`),
          updated: b(toDate(r.pushed_at), `${p}.pushed_at`, r.pushed_at, 'Last push → date'),
          license: b(r.license?.spdx_id && r.license.spdx_id !== 'NOASSERTION' ? r.license.spdx_id : null, `${p}.license.spdx_id`),
          url: b(r.html_url, `${p}.html_url`),
        },
      };
    });
  },
};

export const npm: SourceDef = {
  id: 'npm',
  name: 'npm registry',
  host: 'npmjs.com',
  intents: ['opensource'],
  provides: 'JavaScript/TypeScript packages with weekly downloads and publish dates.',
  terms: 'Public registry API; npm Open-Source Terms. Avoid excessive request rates.',
  termsUrl: 'https://docs.npmjs.com/policies/open-source-terms',
  attribution: 'Packages from npm',
  rate: 'Fair use',
  serverSearch: true,
  fit: (r) => ({ score: r.keywords.some((k) => /js|javascript|typescript|node|react|vue|npm/i.test(k)) ? 1 : 0.5, reason: 'Adds package-level adoption (weekly downloads)' }),
  async fetch({ recipe, call }) {
    const apiUrl = `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(recipe.keywords.join(' '))}&size=${Math.min(100, Math.max(25, recipe.limit))}`;
    const data = await call(apiUrl);
    const now = Date.now();
    return (data.objects ?? []).map((o: any, i: number): RawRecord => {
      const pk = o.package ?? {};
      const url = pk.links?.npm ?? `https://www.npmjs.com/package/${pk.name}`;
      const b = recordBuilder({ sourceId: 'npm', apiUrl, recordUrl: url, fetchedAt: now });
      const p = `objects[${i}]`;
      return {
        sourceId: 'npm',
        text: [pk.name, pk.description, (pk.keywords ?? []).join(' ')].filter(Boolean).join(' · '),
        fields: {
          name: b(pk.name, `${p}.package.name`),
          kind: b('npm package', p, 'registry search'),
          description: b(pk.description ?? null, `${p}.package.description`),
          stars: b(o.downloads?.weekly ?? null, `${p}.downloads.weekly`, o.downloads, 'Weekly downloads (npm has no stars)'),
          language: b('JavaScript', p, 'npm', 'Implied by registry'),
          updated: b(toDate(pk.date ?? o.updated), `${p}.package.date`),
          license: b(pk.license ?? null, `${p}.package.license`),
          url: b(url, `${p}.package.links.npm`),
        },
      };
    });
  },
};

export const huggingface: SourceDef = {
  id: 'huggingface',
  name: 'Hugging Face Hub',
  host: 'huggingface.co',
  intents: ['opensource'],
  provides: 'Machine-learning models with likes, downloads, task and library.',
  terms: 'Public Hub API; respect each model’s licence. Anonymous rate limits apply.',
  termsUrl: 'https://huggingface.co/terms-of-service',
  attribution: 'Models from Hugging Face',
  rate: 'Fair use',
  serverSearch: true,
  fit: (r) => ({ score: /model|llm|embedding|vision|speech|ml|ai|transformer|diffusion|bert|gpt/i.test(r.brief) ? 1 : 0.35, reason: 'ML models with adoption signals' }),
  async fetch({ recipe, call }) {
    const apiUrl = `https://huggingface.co/api/models?search=${encodeURIComponent(recipe.keywords.join(' '))}&sort=likes&direction=-1&limit=${Math.min(100, Math.max(25, recipe.limit))}`;
    const data = await call(apiUrl);
    const now = Date.now();
    return (Array.isArray(data) ? data : []).map((m: any, i: number): RawRecord => {
      const url = `https://huggingface.co/${m.id}`;
      const b = recordBuilder({ sourceId: 'huggingface', apiUrl, recordUrl: url, fetchedAt: now });
      const p = `[${i}]`;
      const lic = (m.tags ?? []).find((t: string) => t.startsWith('license:'))?.slice(8) ?? null;
      return {
        sourceId: 'huggingface',
        text: [m.id, m.pipeline_tag, m.library_name, (m.tags ?? []).slice(0, 12).join(' ')].filter(Boolean).join(' · '),
        fields: {
          name: b(m.id, `${p}.id`),
          kind: b(m.pipeline_tag ? `Model · ${m.pipeline_tag}` : 'Model', `${p}.pipeline_tag`),
          description: b(m.library_name ? `${m.library_name} model, ${Number(m.downloads ?? 0).toLocaleString()} downloads` : null, `${p}.library_name + downloads`, { lib: m.library_name, downloads: m.downloads }, 'Composed summary'),
          stars: b(m.likes ?? 0, `${p}.likes`),
          language: b(m.library_name ?? null, `${p}.library_name`),
          updated: b(toDate(m.lastModified ?? m.createdAt), m.lastModified ? `${p}.lastModified` : `${p}.createdAt`),
          license: b(lic, `${p}.tags[license:*]`),
          url: b(url, `${p}.id`, m.id, 'Hub URL from id'),
        },
      };
    });
  },
};

export const hnStories: SourceDef = {
  id: 'hn',
  name: 'Hacker News',
  host: 'news.ycombinator.com',
  intents: ['discussions'],
  provides: 'Stories, launches and Show HN posts with points and comment counts.',
  terms: 'Official HN Algolia search API. Link to the HN discussion.',
  termsUrl: 'https://hn.algolia.com/api',
  attribution: 'Stories from Hacker News',
  rate: '10k req/hour',
  serverSearch: true,
  fit: () => ({ score: 1, reason: 'Engineering community signal with engagement counts' }),
  async fetch({ recipe, call }) {
    const since = recipe.since ? Math.floor(new Date(recipe.since).getTime() / 1000) : 0;
    const ep = recipe.sort === 'recent' ? 'search_by_date' : 'search';
    const apiUrl = `https://hn.algolia.com/api/v1/${ep}?query=${encodeURIComponent(recipe.keywords.join(' '))}&tags=story&hitsPerPage=${Math.min(100, Math.max(30, recipe.limit))}${since ? `&numericFilters=${encodeURIComponent(`created_at_i>${since}`)}` : ''}`;
    const data = await call(apiUrl);
    const now = Date.now();
    return (data.hits ?? []).map((h: any, i: number): RawRecord => {
      const item = `https://news.ycombinator.com/item?id=${h.objectID}`;
      const b = recordBuilder({ sourceId: 'hn', apiUrl, recordUrl: item, fetchedAt: now });
      const p = `hits[${i}]`;
      return {
        sourceId: 'hn',
        text: [h.title, clip(stripHtml(h.story_text), 500)].filter(Boolean).join(' · '),
        fields: {
          title: b(h.title, `${p}.title`),
          site: b('Hacker News', p, 'hn'),
          author: b(h.author, `${p}.author`),
          score: b(h.points ?? 0, `${p}.points`),
          comments: b(h.num_comments ?? 0, `${p}.num_comments`),
          posted: b(toDate(h.created_at), `${p}.created_at`),
          url: b(item, `${p}.objectID`, h.objectID, 'Discussion permalink'),
        },
      };
    });
  },
};

export const devto: SourceDef = {
  id: 'devto',
  name: 'DEV Community',
  host: 'dev.to',
  intents: ['discussions'],
  provides: 'Developer articles by tag with reactions and comment counts.',
  terms: 'Forem public API; content belongs to authors. Link to the article.',
  termsUrl: 'https://developers.forem.com/api',
  attribution: 'Articles from DEV',
  rate: 'Fair use',
  serverSearch: false,
  fit: () => ({ score: 0.7, reason: 'Practitioner write-ups, filtered by tag' }),
  async fetch({ recipe, call }) {
    const out: RawRecord[] = [];
    const days = recipe.since ? Math.max(1, Math.round((Date.now() - new Date(recipe.since).getTime()) / 86400000)) : 365;
    // DEV tags are single lowercase words: try the joined phrase, then its longer words.
    const tags = [...new Set(recipe.keywords.flatMap((k) => [k.toLowerCase().replace(/[^a-z0-9]/g, ''), ...k.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3)]))].filter(Boolean).slice(0, 3);
    for (const tag of tags.length ? tags : ['programming']) {
      const apiUrl = `https://dev.to/api/articles?tag=${tag}&top=${days}&per_page=${Math.min(100, Math.max(30, recipe.limit))}`;
      const data = await call(apiUrl);
      const now = Date.now();
      (Array.isArray(data) ? data : []).forEach((a: any, i: number) => {
        const b = recordBuilder({ sourceId: 'devto', apiUrl, recordUrl: a.url, fetchedAt: now });
        const p = `[${i}]`;
        out.push({
          sourceId: 'devto',
          text: [a.title, a.description, (a.tag_list ?? []).join(' ')].filter(Boolean).join(' · '),
          fields: {
            title: b(a.title, `${p}.title`),
            site: b('DEV', p, 'dev.to'),
            author: b(a.user?.name ?? null, `${p}.user.name`),
            score: b(a.public_reactions_count ?? 0, `${p}.public_reactions_count`),
            comments: b(a.comments_count ?? 0, `${p}.comments_count`),
            posted: b(toDate(a.published_at), `${p}.published_at`),
            url: b(a.url, `${p}.url`),
          },
        });
      });
    }
    return out;
  },
};

export const stackexchange: SourceDef = {
  id: 'stackoverflow',
  name: 'Stack Overflow',
  host: 'stackoverflow.com',
  intents: ['discussions'],
  provides: 'Questions with votes, answers and tags.',
  terms: 'Stack Exchange API; content CC BY-SA with attribution to the author and link.',
  termsUrl: 'https://stackoverflow.com/legal/api-terms-of-use',
  attribution: 'Q&A from Stack Overflow (CC BY-SA)',
  rate: '300 req/day per IP (no key)',
  serverSearch: true,
  fit: () => ({ score: 0.6, reason: 'Concrete problems people hit, with vote counts' }),
  async fetch({ recipe, call }) {
    const from = recipe.since ? `&fromdate=${Math.floor(new Date(recipe.since).getTime() / 1000)}` : '';
    const sort = recipe.sort === 'recent' ? 'creation' : recipe.sort === 'popular' ? 'votes' : 'relevance';
    const apiUrl = `https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=${sort}&q=${encodeURIComponent(recipe.keywords.join(' '))}&site=stackoverflow&pagesize=${Math.min(100, Math.max(30, recipe.limit))}${from}`;
    const data = await call(apiUrl);
    const now = Date.now();
    return (data.items ?? []).map((x: any, i: number): RawRecord => {
      const b = recordBuilder({ sourceId: 'stackoverflow', apiUrl, recordUrl: x.link, fetchedAt: now });
      const p = `items[${i}]`;
      return {
        sourceId: 'stackoverflow',
        text: [stripHtml(x.title), (x.tags ?? []).join(' ')].join(' · '),
        fields: {
          title: b(stripHtml(x.title), `${p}.title`, x.title, 'HTML entities decoded'),
          site: b('Stack Overflow', p, 'stackoverflow'),
          author: b(stripHtml(x.owner?.display_name) || null, `${p}.owner.display_name`),
          score: b(x.score ?? 0, `${p}.score`),
          comments: b(x.answer_count ?? 0, `${p}.answer_count`, x.answer_count, 'Answer count'),
          posted: b(toDate(x.creation_date), `${p}.creation_date`, x.creation_date, 'Unix seconds → date'),
          url: b(x.link, `${p}.link`),
        },
      };
    });
  },
};
