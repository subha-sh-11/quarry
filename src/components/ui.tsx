import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Check, Circle, Loader2, Minus, X } from 'lucide-react';
import type { Cell, FieldSpec, Run, Step } from '../lib/types';
import { sourceById } from '../lib/sources';
import { display, fmtNum, hostOf } from '../lib/util';
import { model, onModel } from '../lib/embed';

/* Router */
const hashSubs = new Set<() => void>();
window.addEventListener('hashchange', () => {
  hashSubs.forEach((f) => f());
  window.scrollTo(0, 0);
});
export function useRoute() {
  const hash = useSyncExternalStore(
    (cb) => {
      hashSubs.add(cb);
      return () => hashSubs.delete(cb);
    },
    () => window.location.hash,
  );
  const [path, q = ''] = hash.replace(/^#/, '').split('?');
  return { parts: (path || '/').split('/').filter(Boolean), query: new URLSearchParams(q) };
}
export const go = (to: string) => {
  window.location.hash = to;
};

/* Brand */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="7" fill="#16181b" />
      <path d="M8 11h16M8 16h11M8 21h6" stroke="#f5f5f1" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="22" cy="21" r="2.6" fill="#49a37f" />
    </svg>
  );
}

/* Status */
export function StepIcon({ status }: { status: Step['status'] | Run['status'] }) {
  if (status === 'done') return <Check className="st-icon done" strokeWidth={2.6} />;
  if (status === 'running') return <Loader2 className="st-icon running spin" strokeWidth={2.4} />;
  if (status === 'failed' || status === 'cancelled') return <X className="st-icon failed" strokeWidth={2.6} />;
  if (status === 'skipped') return <Minus className="st-icon skipped" strokeWidth={2.4} />;
  return <Circle className="st-icon pending" strokeWidth={2.4} />;
}

export function RunBadge({ status }: { status: Run['status'] }) {
  const map = {
    running: ['blue', 'Running'],
    done: ['green', 'Complete'],
    failed: ['clay', 'Failed'],
    cancelled: ['', 'Cancelled'],
  } as const;
  const [c, l] = map[status];
  return (
    <span className={`badge ${c}`}>
      <span className={`dot ${c} ${status === 'running' ? 'pulse' : ''}`} />
      {l}
    </span>
  );
}

export function SourceChips({ ids }: { ids: string[] }) {
  return (
    <span className="src-chips" title={ids.map((i) => sourceById(i)?.name ?? i).join(' + ')}>
      {ids.slice(0, 3).map((id) => (
        <span key={id} className={`src-chip ${ids.length > 1 ? 'multi' : ''}`}>
          {abbr(id)}
        </span>
      ))}
    </span>
  );
}

export function abbr(id: string) {
  const m: Record<string, string> = {
    remotive: 'RMV', remoteok: 'ROK', jobicy: 'JBC', arbeitnow: 'ABN', hn_hiring: 'HNH', wikidata: 'WD', github_orgs: 'GHO',
    openalex: 'OA', crossref: 'XR', github_repos: 'GH', npm: 'NPM', huggingface: 'HF', hn: 'HN', devto: 'DEV', stackoverflow: 'SO',
    coingecko: 'CG', worldbank: 'WB',
  };
  return m[id] ?? id.slice(0, 3).toUpperCase();
}

export function Meter({ value, label }: { value: number; label?: string }) {
  const pct = Math.round(value * 100);
  return (
    <span className="meter" title={label}>
      <span className="bar">
        <i className={pct >= 70 ? '' : pct >= 45 ? 'mid' : 'low'} style={{ width: `${pct}%` }} />
      </span>
      <span className="mono muted num" style={{ fontSize: 11.5 }}>
        {pct}
      </span>
    </span>
  );
}

export function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label?: string }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} className={`switch ${on ? 'on' : ''}`} onClick={() => onChange(!on)} />;
}

/* Cell rendering */
export function CellValue({ cell, field, full = false }: { cell?: Cell; field: FieldSpec; full?: boolean }) {
  const v = cell?.value;
  if (v === null || v === undefined || (Array.isArray(v) && !v.length)) return <span className="null">—</span>;
  switch (field.type) {
    case 'url': {
      const s = String(v);
      return (
        <a className="link cell-clip" href={s} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} title={s}>
          {full ? s : hostOf(s) + (s.replace(/^https?:\/\/[^/]+/, '').length > 1 ? '/…' : '')}
        </a>
      );
    }
    case 'number': {
      const n = v as number;
      if (field.key === 'year') return <span className="num">{n}</span>;
      if (field.key === 'change24h') return <span className="num" style={{ color: n < 0 ? 'var(--clay)' : 'var(--accent)' }}>{n > 0 ? '+' : ''}{n.toFixed(2)}%</span>;
      if (field.key === 'price') return <span className="num">${n < 1 ? n.toPrecision(3) : n.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>;
      if (field.key === 'value' && Math.abs(n) < 1000) return <span className="num">{n.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>;
      return <span className="num">{full ? n.toLocaleString() : fmtNum(n)}</span>;
    }
    case 'bool':
      return v ? <span className="badge green">Yes</span> : <span className="badge">No</span>;
    case 'tags':
      return (
        <span className={full ? '' : 'cell-clip'}>
          {(v as string[]).slice(0, full ? 20 : 3).map((t) => (
            <span key={t} className="tag">
              {t}
            </span>
          ))}
        </span>
      );
    case 'date':
      return <span className="num nowrap">{String(v)}</span>;
    default:
      return <span className={full ? '' : 'cell-clip'} title={display(v)}>{display(v)}</span>;
  }
}

/* Menu */
export function Menu({ trigger, children }: { trigger: (open: () => void) => ReactNode; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);
  return (
    <div className="menu" ref={ref}>
      {trigger(() => setOpen((o) => !o))}
      {open && <div className="menu-pop">{children(() => setOpen(false))}</div>}
    </div>
  );
}

/* Toast */
let toastSet: ((m: string | null) => void) | null = null;
export function toast(m: string) {
  toastSet?.(m);
}
export function Toaster() {
  const [m, setM] = useState<string | null>(null);
  useEffect(() => {
    toastSet = setM;
  }, []);
  useEffect(() => {
    if (!m) return;
    const t = setTimeout(() => setM(null), 2600);
    return () => clearTimeout(t);
  }, [m]);
  return m ? <div className="toast">{m}</div> : null;
}

export function useNow(ms = 1000) {
  const [, set] = useState(0);
  useEffect(() => {
    const t = setInterval(() => set((x) => x + 1), ms);
    return () => clearInterval(t);
  }, [ms]);
}

export function useModel() {
  const [, set] = useState(0);
  useEffect(() => {
    const off = onModel(() => set((x) => x + 1));
    return () => void off();
  }, []);
  return model;
}
