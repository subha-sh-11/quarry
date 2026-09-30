import type { RawRecord, SourceDef } from '../types';
import { INDICATORS } from '../schema';
import { recordBuilder } from '../util';

const CATEGORIES: [RegExp, string][] = [
  [/defi|decentrali[sz]ed finance/i, 'decentralized-finance-defi'],
  [/stable ?coins?/i, 'stablecoins'],
  [/layer ?1|l1\b/i, 'layer-1'],
  [/layer ?2|l2\b|rollup/i, 'layer-2'],
  [/meme/i, 'meme-token'],
  [/\bai\b|artificial intelligence/i, 'artificial-intelligence'],
  [/gaming|gamefi/i, 'gaming'],
  [/real world assets?|rwa/i, 'real-world-assets-rwa'],
];

export const coingecko: SourceDef = {
  id: 'coingecko',
  name: 'CoinGecko',
  host: 'coingecko.com',
  intents: ['crypto'],
  provides: 'Live price, market cap, volume and 24h change for digital assets.',
  terms: 'Free Demo API; attribution to CoinGecko required. ~30 calls/min.',
  termsUrl: 'https://www.coingecko.com/en/api_terms',
  attribution: 'Price data by CoinGecko',
  rate: '30 req/min',
  serverSearch: true,
  fit: () => ({ score: 1, reason: 'Authoritative market snapshot with category filters' }),
  async fetch({ recipe, call, log, ground }) {
    const cat = CATEGORIES.find(([re]) => re.test(recipe.brief))?.[1];
    let ids: string[] = [];
    if (!cat) {
      const named = recipe.keywords.filter((k) => !/^(crypto|coins?|tokens?|market|prices?)$/i.test(k)).slice(0, 8);
      for (const k of named) {
        const s = await call(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(k)}`);
        const hit = (s.coins ?? []).find((c: any) => c.name.toLowerCase() === k.toLowerCase() || c.symbol.toLowerCase() === k.toLowerCase());
        if (hit) ids.push(hit.id);
      }
      if (ids.length) log(`Resolved named assets → ${ids.join(', ')}`);
    } else log(`Using category “${cat}”`);
    ground.cryptoCategory = cat ?? null;
    const apiUrl = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${Math.min(250, Math.max(10, recipe.limit))}&page=1&price_change_percentage=24h${cat ? `&category=${cat}` : ''}${ids.length ? `&ids=${ids.join(',')}` : ''}`;
    const data = await call(apiUrl);
    const now = Date.now();
    return (Array.isArray(data) ? data : []).map((c: any, i: number): RawRecord => {
      const url = `https://www.coingecko.com/en/coins/${c.id}`;
      const b = recordBuilder({ sourceId: 'coingecko', apiUrl, recordUrl: url, fetchedAt: now });
      const p = `[${i}]`;
      return {
        sourceId: 'coingecko',
        text: `${c.name} ${c.symbol}`,
        fields: {
          name: b(c.name, `${p}.name`),
          symbol: b(String(c.symbol ?? '').toUpperCase(), `${p}.symbol`, c.symbol, 'Upper-cased'),
          price: b(c.current_price, `${p}.current_price`),
          change24h: b(c.price_change_percentage_24h != null ? Math.round(c.price_change_percentage_24h * 100) / 100 : null, `${p}.price_change_percentage_24h`, c.price_change_percentage_24h, 'Rounded to 2 dp'),
          marketCap: b(c.market_cap, `${p}.market_cap`),
          volume: b(c.total_volume, `${p}.total_volume`),
          rank: b(c.market_cap_rank, `${p}.market_cap_rank`),
          url: b(url, `${p}.id`, c.id, 'Coin page from id'),
        },
      };
    });
  },
};

export const worldbank: SourceDef = {
  id: 'worldbank',
  name: 'World Bank Open Data',
  host: 'worldbank.org',
  intents: ['economy'],
  provides: 'Country indicators (WDI) by year: GDP, inflation, population, trade, emissions.',
  terms: 'CC BY 4.0. Cite “World Bank, World Development Indicators”.',
  termsUrl: 'https://www.worldbank.org/en/about/legal/terms-of-use-for-datasets',
  attribution: 'World Bank, World Development Indicators (CC BY 4.0)',
  rate: 'Fair use',
  serverSearch: true,
  fit: () => ({ score: 1, reason: 'Canonical source for country-level indicators' }),
  async fetch({ recipe, call }) {
    const ind = INDICATORS.find((x) => x.code === recipe.indicator) ?? INDICATORS[0];
    const countries = recipe.countries?.length ? recipe.countries.join(';') : recipe.country ?? 'all';
    const y0 = recipe.since ? +recipe.since.slice(0, 4) : new Date().getFullYear() - 10;
    const apiUrl = `https://api.worldbank.org/v2/country/${countries}/indicator/${ind.code}?format=json&date=${y0}:${new Date().getFullYear()}&per_page=2000`;
    const data = await call(apiUrl);
    const rows = Array.isArray(data) ? data[1] ?? [] : [];
    if (Array.isArray(data) && data[0]?.message) throw new Error(data[0].message[0]?.value ?? 'World Bank error');
    const now = Date.now();
    return rows.map((r: any, i: number): RawRecord => {
      const url = `https://data.worldbank.org/indicator/${ind.code}?locations=${r.country?.id}`;
      const b = recordBuilder({ sourceId: 'worldbank', apiUrl, recordUrl: url, fetchedAt: now });
      const p = `[1][${i}]`;
      return {
        sourceId: 'worldbank',
        text: `${r.country?.value} ${r.indicator?.value} ${r.date}`,
        fields: {
          country: b(r.country?.value, `${p}.country.value`),
          indicator: b(r.indicator?.value ?? ind.label, `${p}.indicator.value`),
          year: b(+r.date, `${p}.date`),
          value: b(r.value, `${p}.value`),
          url: b(url, `${p}.country.id`, r.country?.id, 'Indicator page for country'),
        },
      };
    });
  },
};
