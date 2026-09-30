// Compact gazetteer used by the local planner to ground locations.
const C: [string, string, string[]][] = [
  ['US', 'United States', ['usa', 'us', 'america', 'united states of america', 'american']],
  ['GB', 'United Kingdom', ['uk', 'britain', 'great britain', 'england', 'british', 'scotland']],
  ['DE', 'Germany', ['deutschland', 'german']],
  ['FR', 'France', ['french']],
  ['NL', 'Netherlands', ['holland', 'dutch', 'the netherlands']],
  ['ES', 'Spain', ['spanish']],
  ['IT', 'Italy', ['italian']],
  ['PT', 'Portugal', ['portuguese']],
  ['IE', 'Ireland', ['irish']],
  ['SE', 'Sweden', ['swedish']],
  ['NO', 'Norway', ['norwegian']],
  ['DK', 'Denmark', ['danish']],
  ['FI', 'Finland', ['finnish']],
  ['PL', 'Poland', ['polish']],
  ['CH', 'Switzerland', ['swiss']],
  ['AT', 'Austria', ['austrian']],
  ['BE', 'Belgium', ['belgian']],
  ['CZ', 'Czechia', ['czech republic', 'czech']],
  ['RO', 'Romania', ['romanian']],
  ['GR', 'Greece', ['greek']],
  ['UA', 'Ukraine', ['ukrainian']],
  ['EE', 'Estonia', ['estonian']],
  ['TR', 'Turkey', ['turkiye', 'turkish']],
  ['IN', 'India', ['indian', 'bharat']],
  ['CN', 'China', ['chinese', 'prc']],
  ['JP', 'Japan', ['japanese']],
  ['KR', 'South Korea', ['korea', 'korean']],
  ['SG', 'Singapore', ['singaporean']],
  ['ID', 'Indonesia', ['indonesian']],
  ['MY', 'Malaysia', ['malaysian']],
  ['TH', 'Thailand', ['thai']],
  ['VN', 'Vietnam', ['vietnamese', 'viet nam']],
  ['PH', 'Philippines', ['filipino', 'philippine']],
  ['PK', 'Pakistan', ['pakistani']],
  ['BD', 'Bangladesh', ['bangladeshi']],
  ['LK', 'Sri Lanka', ['sri lankan']],
  ['NP', 'Nepal', ['nepali']],
  ['AE', 'United Arab Emirates', ['uae', 'emirates', 'emirati']],
  ['SA', 'Saudi Arabia', ['saudi', 'ksa']],
  ['IL', 'Israel', ['israeli']],
  ['EG', 'Egypt', ['egyptian']],
  ['NG', 'Nigeria', ['nigerian']],
  ['KE', 'Kenya', ['kenyan']],
  ['ZA', 'South Africa', ['south african']],
  ['GH', 'Ghana', ['ghanaian']],
  ['MA', 'Morocco', ['moroccan']],
  ['CA', 'Canada', ['canadian']],
  ['MX', 'Mexico', ['mexican']],
  ['BR', 'Brazil', ['brazilian', 'brasil']],
  ['AR', 'Argentina', ['argentinian', 'argentine']],
  ['CL', 'Chile', ['chilean']],
  ['CO', 'Colombia', ['colombian']],
  ['PE', 'Peru', ['peruvian']],
  ['AU', 'Australia', ['australian', 'aussie']],
  ['NZ', 'New Zealand', ['kiwi', 'nz']],
  ['RU', 'Russia', ['russian']],
];

const CITIES: Record<string, string> = {
  'new york': 'US', nyc: 'US', 'san francisco': 'US', sf: 'US', 'bay area': 'US', seattle: 'US', austin: 'US', boston: 'US',
  chicago: 'US', 'los angeles': 'US', denver: 'US', miami: 'US', atlanta: 'US',
  london: 'GB', manchester: 'GB', edinburgh: 'GB', cambridge: 'GB',
  berlin: 'DE', munich: 'DE', hamburg: 'DE', frankfurt: 'DE', cologne: 'DE',
  paris: 'FR', lyon: 'FR', amsterdam: 'NL', rotterdam: 'NL', madrid: 'ES', barcelona: 'ES', lisbon: 'PT', porto: 'PT',
  dublin: 'IE', stockholm: 'SE', oslo: 'NO', copenhagen: 'DK', helsinki: 'FI', warsaw: 'PL', krakow: 'PL', zurich: 'CH',
  geneva: 'CH', vienna: 'AT', brussels: 'BE', prague: 'CZ', tallinn: 'EE', milan: 'IT', rome: 'IT', athens: 'GR',
  bangalore: 'IN', bengaluru: 'IN', mumbai: 'IN', delhi: 'IN', 'new delhi': 'IN', hyderabad: 'IN', pune: 'IN', chennai: 'IN',
  gurgaon: 'IN', gurugram: 'IN', noida: 'IN', kolkata: 'IN', ahmedabad: 'IN',
  tokyo: 'JP', seoul: 'KR', beijing: 'CN', shanghai: 'CN', shenzhen: 'CN', jakarta: 'ID', manila: 'PH', bangkok: 'TH',
  dubai: 'AE', 'abu dhabi': 'AE', riyadh: 'SA', 'tel aviv': 'IL', cairo: 'EG', lagos: 'NG', nairobi: 'KE',
  'cape town': 'ZA', johannesburg: 'ZA', toronto: 'CA', vancouver: 'CA', montreal: 'CA', 'mexico city': 'MX',
  'sao paulo': 'BR', 'buenos aires': 'AR', sydney: 'AU', melbourne: 'AU', auckland: 'NZ',
};

export const COUNTRIES = C.map(([code, name]) => ({ code, name }));

export function countryName(code?: string) {
  return C.find((c) => c[0] === code)?.[1];
}

export interface GeoHit {
  country?: string;
  countryName?: string;
  city?: string;
  matched: string[];
}

/** Finds the first country or city mentioned in free text. */
export function findGeo(text: string): GeoHit {
  const t = ' ' + text.toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ') + ' ';
  const hit: GeoHit = { matched: [] };
  const cities = Object.keys(CITIES).sort((a, b) => b.length - a.length);
  for (const c of cities) {
    if (c.length <= 2) continue;
    if (t.includes(' ' + c + ' ')) {
      hit.city = c.replace(/\b\w/g, (m) => m.toUpperCase());
      hit.country = CITIES[c];
      hit.countryName = countryName(hit.country);
      hit.matched.push(c);
      return hit;
    }
  }
  for (const [code, name, alias] of C) {
    const names = [name.toLowerCase(), ...alias].sort((a, b) => b.length - a.length);
    for (const n of names) {
      // Two-letter aliases (uk, us, nz) only count when upper-case in the source text.
      if (n.length <= 3) {
        if (new RegExp(`\\b${n.toUpperCase()}\\b`).test(text)) {
          hit.country = code;
          hit.countryName = name;
          hit.matched.push(n);
          return hit;
        }
        continue;
      }
      if (t.includes(' ' + n + ' ')) {
        hit.country = code;
        hit.countryName = name;
        hit.matched.push(n);
        return hit;
      }
    }
  }
  return hit;
}

/** Terms that indicate a location string belongs to a country. */
export function locationTerms(code?: string, city?: string): string[] {
  if (!code) return [];
  const row = C.find((c) => c[0] === code);
  const out = new Set<string>();
  if (row) {
    out.add(row[1].toLowerCase());
    row[2].filter((a) => a.length > 2).forEach((a) => out.add(a));
  }
  for (const [c, cc] of Object.entries(CITIES)) if (cc === code && c.length > 2) out.add(c);
  if (city) out.add(city.toLowerCase());
  if (code === 'US') ['usa', 'u.s.', ' us ', 'united states', 'americas', 'north america'].forEach((x) => out.add(x));
  if (code === 'GB') ['uk', 'u.k.'].forEach((x) => out.add(x));
  return [...out];
}

export const EU = new Set(['DE', 'FR', 'NL', 'ES', 'IT', 'PT', 'IE', 'SE', 'DK', 'FI', 'PL', 'AT', 'BE', 'CZ', 'RO', 'GR', 'EE']);

/** Every country mentioned, in order of appearance (used for multi-country indicator briefs). */
export function findAllCountries(text: string): string[] {
  const t = ' ' + text.toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ') + ' ';
  const found: [number, string][] = [];
  for (const [code, name, alias] of C) {
    for (const n of [name.toLowerCase(), ...alias.filter((a) => a.length > 3)]) {
      const at = t.indexOf(' ' + n + ' ');
      if (at >= 0) {
        found.push([at, code]);
        break;
      }
    }
    for (const a of alias.filter((a) => a.length <= 3)) {
      const m = new RegExp(`\b${a.toUpperCase()}\b`).exec(text);
      if (m) found.push([m.index, code]);
    }
  }
  return [...new Set(found.sort((a, b) => a[0] - b[0]).map((f) => f[1]))];
}
