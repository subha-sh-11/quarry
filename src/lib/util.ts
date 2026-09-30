import type { Cell, Provenance } from './types';

export const uid = (p = '') => p + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);

export function stripHtml(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .replace(/<\s*(br|\/p|\/li|\/div|\/h\d)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

export const clip = (s: string, n = 160) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);

export const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\b(inc|llc|ltd|gmbh|corp|corporation|co|company|limited|plc|ag|sa|bv)\b\.?/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

export const STOP = new Set(
  'a an the and or of for to in on at by with from into over under about as is are was were be been being this that these those it its i me my we our you your they them their show find get give list fetch collect gather pull need want looking look please all any some every most more less top best latest new recent recently who what which where when how many much each per via using than also just only like around near based located across within me us'.split(' '),
);

export function tokens(s: string): string[] {
  return norm(s)
    .split(' ')
    .filter((t) => t.length > 1 && !STOP.has(t));
}

export function cell(value: Cell['value'], p: Omit<Provenance, 'raw'> & { raw?: unknown }): Cell {
  const raw = p.raw === undefined ? value : p.raw;
  return {
    value: value === undefined || value === '' ? null : value,
    prov: [{ ...p, raw: typeof raw === 'string' ? clip(raw, 400) : clip(JSON.stringify(raw ?? null), 400) }],
  };
}

/** Builds cells for one record with shared provenance context. */
export function recordBuilder(base: { sourceId: string; apiUrl: string; recordUrl?: string; fetchedAt: number }) {
  return (value: Cell['value'], path: string, raw?: unknown, transform?: string): Cell =>
    cell(value, { ...base, path, raw, transform });
}

export function toDate(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  let d: Date;
  if (typeof v === 'number') d = new Date(v < 1e12 ? v * 1000 : v);
  else d = new Date(String(v));
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

export function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[, ]/g, ''));
  return Number.isFinite(n) ? n : null;
}

export function fmtNum(n: number, digits = 0) {
  if (!Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1e12) return (n / 1e12).toFixed(2) + 'T';
  if (abs >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (abs >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (abs >= 1e4) return (n / 1e3).toFixed(1) + 'k';
  return n.toLocaleString(undefined, { maximumFractionDigits: digits || (abs < 1 ? 4 : 2) });
}

export function ago(ts: number) {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.round(s / 86400)}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export const dur = (ms: number) => (ms < 1000 ? `${Math.max(0, Math.round(ms))} ms` : `${(ms / 1000).toFixed(1)} s`);

export function hostOf(u: string) {
  try {
    return new URL(u).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function daysAgo(n: number) {
  return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
}

export function display(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) return v.join(', ');
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  return String(v);
}

export async function pool<T, R>(items: T[], n: number, fn: (t: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return out;
}
