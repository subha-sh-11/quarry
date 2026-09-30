import type { FieldSpec, Intent } from './types';

export interface IntentDef {
  id: Intent;
  label: string;
  entity: string;
  blurb: string;
  /** Natural-language description used by the embedding classifier. */
  profile: string;
  cues: string[];
  fields: FieldSpec[];
  /** Fields that make up the dedupe fingerprint. */
  keyFields: string[];
  labelField: string;
}

const f = (key: string, label: string, type: FieldSpec['type'], extra: Partial<FieldSpec> = {}): FieldSpec => ({
  key,
  label,
  type,
  visible: true,
  ...extra,
});

export const INTENTS: Record<Intent, IntentDef> = {
  jobs: {
    id: 'jobs',
    label: 'Job openings',
    entity: 'Job opening',
    blurb: 'Open roles from remote job boards and the monthly HN hiring thread.',
    profile: 'job openings, hiring, vacancies, roles, positions, careers, recruiting engineers developers designers, salary, remote work',
    cues: ['job', 'jobs', 'hiring', 'hire', 'role', 'roles', 'position', 'positions', 'vacancy', 'vacancies', 'opening', 'openings', 'career', 'careers', 'recruit', 'internship', 'internships', 'salary', 'freelance', 'contract'],
    fields: [
      f('title', 'Role', 'text', { required: true }),
      f('company', 'Company', 'text', { required: true }),
      f('location', 'Location', 'text'),
      f('remote', 'Remote', 'bool'),
      f('salary', 'Salary', 'money'),
      f('type', 'Type', 'text', { visible: false }),
      f('tags', 'Tags', 'tags', { visible: false }),
      f('posted', 'Posted', 'date'),
      f('url', 'Link', 'url', { required: true }),
    ],
    keyFields: ['company', 'title'],
    labelField: 'title',
  },
  companies: {
    id: 'companies',
    label: 'Companies & leads',
    entity: 'Company',
    blurb: 'Organisations by industry and country from Wikidata and GitHub.',
    profile: 'companies, businesses, startups, organisations, firms, vendors, sales leads, prospects, sponsors, partners, manufacturers, agencies in an industry or country',
    cues: ['company', 'companies', 'startup', 'startups', 'business', 'businesses', 'firm', 'firms', 'lead', 'leads', 'prospect', 'prospects', 'sponsor', 'sponsors', 'vendor', 'vendors', 'manufacturer', 'manufacturers', 'agency', 'agencies', 'organisation', 'organization', 'organizations', 'brands', 'partners', 'suppliers'],
    fields: [
      f('name', 'Name', 'text', { required: true }),
      f('industry', 'Industry', 'text'),
      f('country', 'Country', 'text'),
      f('hq', 'HQ', 'text'),
      f('website', 'Website', 'url'),
      f('founded', 'Founded', 'date'),
      f('employees', 'Employees', 'number'),
      f('url', 'Record', 'url', { required: true }),
    ],
    keyFields: ['name'],
    labelField: 'name',
  },
  research: {
    id: 'research',
    label: 'Research papers',
    entity: 'Paper',
    blurb: 'Scholarly works with citations and DOIs from OpenAlex and Crossref.',
    profile: 'research papers, academic publications, studies, scholarly articles, journals, citations, preprints, literature review',
    cues: ['paper', 'papers', 'research', 'study', 'studies', 'publication', 'publications', 'journal', 'academic', 'scholarly', 'citations', 'cited', 'literature', 'preprint', 'preprints', 'thesis'],
    fields: [
      f('title', 'Title', 'text', { required: true }),
      f('authors', 'Authors', 'tags'),
      f('venue', 'Venue', 'text'),
      f('year', 'Year', 'number'),
      f('citations', 'Citations', 'number'),
      f('doi', 'DOI', 'text', { visible: false }),
      f('pdf', 'Open access', 'url'),
      f('url', 'Record', 'url', { required: true }),
    ],
    keyFields: ['doi', 'title'],
    labelField: 'title',
  },
  opensource: {
    id: 'opensource',
    label: 'Open-source projects',
    entity: 'Project',
    blurb: 'Repositories, packages and ML models from GitHub, npm and Hugging Face.',
    profile: 'open source projects, github repositories, libraries, frameworks, packages, sdk, tools, machine learning models, developer tooling',
    cues: ['repo', 'repos', 'repository', 'repositories', 'github', 'library', 'libraries', 'framework', 'frameworks', 'package', 'packages', 'npm', 'open source', 'opensource', 'oss', 'sdk', 'model', 'models', 'huggingface', 'tool', 'tools', 'stars'],
    fields: [
      f('name', 'Name', 'text', { required: true }),
      f('kind', 'Kind', 'text'),
      f('description', 'Description', 'text'),
      f('stars', 'Stars / likes', 'number'),
      f('language', 'Language', 'text'),
      f('updated', 'Updated', 'date'),
      f('license', 'License', 'text', { visible: false }),
      f('url', 'Link', 'url', { required: true }),
    ],
    keyFields: ['name'],
    labelField: 'name',
  },
  discussions: {
    id: 'discussions',
    label: 'Discussions & articles',
    entity: 'Post',
    blurb: 'Threads and articles from Hacker News, DEV and Stack Overflow.',
    profile: 'discussions, articles, blog posts, news, threads, launches, show hn, questions, opinions, community conversation, trends',
    cues: ['discussion', 'discussions', 'article', 'articles', 'post', 'posts', 'blog', 'blogs', 'news', 'thread', 'threads', 'launch', 'launches', 'hacker news', 'hn', 'question', 'questions', 'stack overflow', 'mentions', 'talking', 'opinions', 'trend', 'trends'],
    fields: [
      f('title', 'Title', 'text', { required: true }),
      f('site', 'Site', 'text'),
      f('author', 'Author', 'text'),
      f('score', 'Score', 'number'),
      f('comments', 'Comments', 'number'),
      f('posted', 'Posted', 'date'),
      f('url', 'Link', 'url', { required: true }),
    ],
    keyFields: ['url', 'title'],
    labelField: 'title',
  },
  crypto: {
    id: 'crypto',
    label: 'Crypto market data',
    entity: 'Asset',
    blurb: 'Live market snapshot for digital assets from CoinGecko.',
    profile: 'cryptocurrency market data, coins, tokens, prices, market cap, trading volume, bitcoin ethereum defi',
    cues: ['crypto', 'cryptocurrency', 'cryptocurrencies', 'coin', 'coins', 'token', 'tokens', 'bitcoin', 'ethereum', 'defi', 'market cap', 'altcoins', 'stablecoin', 'stablecoins'],
    fields: [
      f('name', 'Asset', 'text', { required: true }),
      f('symbol', 'Symbol', 'text'),
      f('price', 'Price (USD)', 'number', { required: true }),
      f('change24h', '24h %', 'number'),
      f('marketCap', 'Market cap', 'number'),
      f('volume', 'Volume 24h', 'number'),
      f('rank', 'Rank', 'number'),
      f('url', 'Record', 'url'),
    ],
    keyFields: ['symbol', 'name'],
    labelField: 'name',
  },
  economy: {
    id: 'economy',
    label: 'Economic indicators',
    entity: 'Observation',
    blurb: 'Country-level indicators (GDP, inflation, population…) from the World Bank.',
    profile: 'economic indicators, gdp, inflation, population, unemployment, market size, macro data by country and year, statistics',
    cues: ['gdp', 'inflation', 'population', 'unemployment', 'economy', 'economic', 'indicator', 'indicators', 'macro', 'growth rate', 'per capita', 'exports', 'imports', 'co2', 'emissions', 'literacy', 'internet users', 'fdi', 'market size'],
    fields: [
      f('country', 'Country', 'text', { required: true }),
      f('indicator', 'Indicator', 'text'),
      f('year', 'Year', 'number', { required: true }),
      f('value', 'Value', 'number', { required: true }),
      f('url', 'Record', 'url'),
    ],
    keyFields: ['country', 'indicator', 'year'],
    labelField: 'country',
  },
};

export const INDICATORS: { code: string; label: string; cues: string[] }[] = [
  { code: 'NY.GDP.MKTP.CD', label: 'GDP (current US$)', cues: ['gdp'] },
  { code: 'NY.GDP.PCAP.CD', label: 'GDP per capita (current US$)', cues: ['gdp per capita', 'per capita', 'income per person'] },
  { code: 'NY.GDP.MKTP.KD.ZG', label: 'GDP growth (annual %)', cues: ['gdp growth', 'growth rate', 'economic growth'] },
  { code: 'FP.CPI.TOTL.ZG', label: 'Inflation, consumer prices (annual %)', cues: ['inflation', 'cpi', 'consumer prices'] },
  { code: 'SP.POP.TOTL', label: 'Population, total', cues: ['population'] },
  { code: 'SL.UEM.TOTL.ZS', label: 'Unemployment (% of labor force)', cues: ['unemployment', 'jobless'] },
  { code: 'IT.NET.USER.ZS', label: 'Internet users (% of population)', cues: ['internet users', 'internet penetration', 'internet'] },
  { code: 'EN.GHG.CO2.PC.CE.AR5', label: 'CO2 emissions per capita (t CO2e)', cues: ['co2', 'emissions', 'carbon'] },
  { code: 'NE.EXP.GNFS.CD', label: 'Exports of goods & services (US$)', cues: ['exports', 'export'] },
  { code: 'NE.IMP.GNFS.CD', label: 'Imports of goods & services (US$)', cues: ['imports', 'import'] },
  { code: 'BX.KLT.DINV.CD.WD', label: 'Foreign direct investment, net inflows (US$)', cues: ['fdi', 'foreign direct investment', 'investment inflows'] },
  { code: 'SE.ADT.LITR.ZS', label: 'Literacy rate, adult (%)', cues: ['literacy'] },
];

export const EXAMPLES: { brief: string; intent: Intent }[] = [
  { brief: 'Remote React or TypeScript jobs posted in the last 14 days that list a salary', intent: 'jobs' },
  { brief: 'Renewable energy companies in Germany with a website, for a sponsor outreach list', intent: 'companies' },
  { brief: 'Most cited papers on retrieval augmented generation since 2023', intent: 'research' },
  { brief: 'Vector database projects on GitHub updated this month', intent: 'opensource' },
  { brief: 'What developers are saying about local-first software this year', intent: 'discussions' },
  { brief: 'GDP growth for India, Indonesia, Vietnam and Brazil since 2015', intent: 'economy' },
];
