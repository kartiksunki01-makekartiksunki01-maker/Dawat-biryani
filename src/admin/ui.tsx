import { X } from 'lucide-react';
import {
  createContext, useContext, useEffect, useId, useRef, useState,
  type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes,
} from 'react';
import type { SupabaseClient, User } from '@supabase/supabase-js';

/* ───────────────────────── context ───────────────────────── */
interface AdminCtx {
  sb: SupabaseClient;
  user: User;
  toast: (text: string, kind?: 'ok' | 'err') => void;
  go: (section: string) => void;
}
export const AdminContext = createContext<AdminCtx | null>(null);
export const useAdmin = () => {
  const c = useContext(AdminContext);
  if (!c) throw new Error('AdminContext missing');
  return c;
};

/** Human message for a Supabase/Postgres error — never swallowed silently. */
export function errText(e: { message?: string; hint?: string | null; details?: string | null } | null | undefined, fallback = 'Something went wrong.') {
  if (!e) return fallback;
  const m = e.message ?? '';
  const map: Record<string, string> = {
    invalid_status_transition: 'That status change is not allowed for this order.',
    reason_required: 'Please give a reason when rejecting or cancelling.',
    invalid_payment_transition: 'That payment change is not allowed.',
    order_locked_fields: 'Bill number and amounts of an order cannot be changed.',
    forbidden: 'Your account is not allowed to do this.',
    quote_required: 'Save a quotation amount first.',
    already_converted: 'This enquiry was already converted into an order.',
  };
  if (map[m]) return map[m];
  if (/duplicate key/.test(m)) return 'That already exists (duplicate).';
  if (/violates check constraint/.test(m)) return 'One of the values is not allowed. Please check the form.';
  if (/Failed to fetch|NetworkError/i.test(m)) return 'Network problem — check the internet connection and try again.';
  return e.hint || m || fallback;
}

/* ───────────────────────── form primitives ───────────────────────── */
const base =
  'w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-ivory placeholder:text-ivory/35 focus:border-gold focus:outline-none disabled:opacity-50';

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block text-xs text-ivory/60">
      <span className="mb-1 block font-medium tracking-wide">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-ivory/40">{hint}</span>}
    </label>
  );
}
export const Input = (p: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={`${base} ${p.className ?? ''}`} />;
export const Select = (p: SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={`${base} ${p.className ?? ''}`} />;
export const Textarea = (p: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...p} className={`${base} ${p.className ?? ''}`} />;

export function Toggle({ checked, onChange, label, hint, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string; disabled?: boolean }) {
  return (
    <label className={`flex min-h-[44px] items-center justify-between gap-4 ${disabled ? 'opacity-50' : 'cursor-pointer'}`}>
      <span>
        <span className="block text-sm text-ivory">{label}</span>
        {hint && <span className="block text-[11px] text-ivory/50">{hint}</span>}
      </span>
      <input type="checkbox" role="switch" className="peer sr-only" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="relative h-6 w-11 shrink-0 rounded-full bg-white/15 transition peer-checked:bg-gold peer-focus-visible:ring-2 peer-focus-visible:ring-saffron after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-ivory after:transition peer-checked:after:translate-x-5" aria-hidden />
    </label>
  );
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { tone?: 'gold' | 'ghost' | 'danger' | 'quiet'; busy?: boolean };
export function Btn({ tone = 'ghost', className = '', busy, children, disabled, ...p }: BtnProps) {
  const tones = {
    gold: 'bg-gold text-smoke hover:brightness-110',
    ghost: 'border border-white/20 text-ivory hover:bg-white/10',
    danger: 'border border-red-400/40 text-red-300 hover:bg-red-500/10',
    quiet: 'text-ivory/70 hover:bg-white/10 hover:text-ivory',
  } as const;
  return (
    <button
      type="button"
      {...p}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={`inline-flex min-h-[40px] items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${tones[tone]} ${className}`}
    >
      {busy && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden />}
      {children}
    </button>
  );
}

export function Notice({ kind, children }: { kind: 'ok' | 'err' | 'info'; children: ReactNode }) {
  const c = { ok: 'border-emerald-400/40 text-emerald-200', err: 'border-red-400/40 text-red-200', info: 'border-white/20 text-ivory/70' }[kind];
  return <p role={kind === 'err' ? 'alert' : 'status'} className={`rounded-lg border bg-white/5 px-3 py-2 text-sm ${c}`}>{children}</p>;
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'gold' | 'good' | 'warn' | 'bad' | 'info' }) {
  const t = {
    neutral: 'border-white/20 text-ivory/70',
    gold: 'border-gold/50 text-gold',
    good: 'border-emerald-400/50 text-emerald-200',
    warn: 'border-amber-400/50 text-amber-200',
    bad: 'border-red-400/50 text-red-200',
    info: 'border-sky-400/50 text-sky-200',
  }[tone];
  return <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${t}`}>{children}</span>;
}

export function PageHeader({ title, intro, actions }: { title: string; intro?: string; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-2xl text-ivory sm:text-3xl">{title}</h1>
        {intro && <p className="mt-1 max-w-2xl text-sm text-ivory/55">{intro}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-white/10 bg-white/[0.03] p-4 ${className}`}>{children}</div>;
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: string; tone?: 'gold' | 'warn' }) {
  return (
    <Card>
      <p className={`font-num text-2xl font-semibold ${tone === 'warn' ? 'text-amber-200' : 'text-gold'}`}>{value}</p>
      <p className="text-xs text-ivory/60">{label}</p>
      {hint && <p className="mt-1 text-[11px] text-ivory/40">{hint}</p>}
    </Card>
  );
}

export function Skeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-label="Loading" role="status">
      {Array.from({ length: rows }, (_, i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-white/5" />)}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-white/15 p-8 text-center">
      <p className="font-medium text-ivory">{title}</p>
      {children && <p className="mt-1 text-sm text-ivory/55">{children}</p>}
    </div>
  );
}

/* ───────────────────────── dialogs ───────────────────────── */
export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const el = ref.current;
    el?.querySelector<HTMLElement>('input,select,textarea,button')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && el) {
        const f = [...el.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select,textarea')];
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      prev?.focus();
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={id} className={`max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border border-gold/20 bg-[#120d0a] p-5 shadow-2xl sm:rounded-2xl ${wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'}`}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 id={id} className="font-display text-xl text-ivory">{title}</h2>
          <button type="button" onClick={onClose} className="grid h-10 w-10 shrink-0 place-items-center rounded-full hover:bg-white/10" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Confirmation that explains exactly what will happen. Optional typed confirmation for destructive actions. */
export function Confirm({
  open, title, body, confirmLabel = 'Confirm', danger, typeToConfirm, onConfirm, onClose, busy,
}: {
  open: boolean; title: string; body: ReactNode; confirmLabel?: string; danger?: boolean; typeToConfirm?: string;
  onConfirm: () => void; onClose: () => void; busy?: boolean;
}) {
  const [typed, setTyped] = useState('');
  useEffect(() => { if (!open) setTyped(''); }, [open]);
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="space-y-4 text-sm text-ivory/75">
        {body}
        {typeToConfirm && (
          <Field label={`Type ${typeToConfirm} to confirm`}>
            <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
          </Field>
        )}
        <div className="flex justify-end gap-2">
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn tone={danger ? 'danger' : 'gold'} busy={busy} disabled={!!typeToConfirm && typed.trim() !== typeToConfirm} onClick={onConfirm}>
            {confirmLabel}
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

/* ───────────────────────── chart ───────────────────────── */
// Single-series column chart. Colour validated with the dataviz validator against the dark surface
// (#A8862A: inside the dark lightness band, >= 3:1). Text uses ink tokens, not the series colour.
const SERIES = '#A8862A';
export function ColumnChart({
  title, data, format = (v) => String(v),
}: { title: string; data: { label: string; value: number }[]; format?: (v: number) => string }) {
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const W = 640, H = 220, pad = { l: 44, r: 8, t: 16, b: 28 };
  const max = Math.max(1, ...data.map((d) => d.value));
  const nice = (() => {
    const p = Math.pow(10, Math.floor(Math.log10(max)));
    const m = max / p;
    return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
  })();
  const band = (W - pad.l - pad.r) / Math.max(1, data.length);
  const bw = Math.min(24, Math.max(3, band - 2));
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / nice);
  const ticks = [0, nice / 2, nice];
  const every = Math.ceil(data.length / 8);
  const peak = data.reduce((b, d, i) => (d.value > (data[b]?.value ?? -1) ? i : b), 0);
  return (
    <Card>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-ivory">{title}</h3>
        <button type="button" className="min-h-[36px] text-xs text-ivory/60 underline" onClick={() => setTable(!table)}>
          {table ? 'Show chart' : 'View as table'}
        </button>
      </div>
      {table ? (
        <table className="w-full text-xs">
          <thead><tr className="text-left text-ivory/50"><th className="py-1 font-normal">Date</th><th className="py-1 text-right font-normal">Value</th></tr></thead>
          <tbody>{data.map((d) => <tr key={d.label} className="border-t border-white/5"><td className="py-1">{d.label}</td><td className="py-1 text-right font-num">{format(d.value)}</td></tr>)}</tbody>
        </table>
      ) : (
        <div className="relative">
          <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`${title}. Highest ${format(data[peak]?.value ?? 0)} on ${data[peak]?.label ?? ''}.`}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
                <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" fontSize="10" fill="rgba(255,248,236,0.55)">{format(t)}</text>
              </g>
            ))}
            {data.map((d, i) => {
              const x = pad.l + band * i + (band - bw) / 2;
              const top = y(d.value);
              const h = Math.max(0, H - pad.b - top);
              const r = Math.min(4, h, bw / 2);
              return (
                <g key={d.label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} tabIndex={0} aria-label={`${d.label}: ${format(d.value)}`}>
                  <rect x={pad.l + band * i} y={pad.t} width={band} height={H - pad.t - pad.b} fill="transparent" />
                  {h > 0 && (
                    <path
                      d={`M${x},${H - pad.b} V${top + r} Q${x},${top} ${x + r},${top} H${x + bw - r} Q${x + bw},${top} ${x + bw},${top + r} V${H - pad.b} Z`}
                      fill={SERIES}
                      opacity={hover === null || hover === i ? 1 : 0.55}
                    />
                  )}
                  {i % every === 0 && <text x={x + bw / 2} y={H - 10} textAnchor="middle" fontSize="10" fill="rgba(255,248,236,0.55)">{d.label}</text>}
                </g>
              );
            })}
            {data[peak] && data[peak].value > 0 && (
              <text x={pad.l + band * peak + band / 2} y={y(data[peak].value) - 5} textAnchor="middle" fontSize="10" fill="rgba(255,248,236,0.85)">{format(data[peak].value)}</text>
            )}
          </svg>
          {hover !== null && data[hover] && (
            <div className="pointer-events-none absolute top-0 rounded-md bg-black/85 px-2 py-1 text-xs text-ivory ring-1 ring-white/15" style={{ left: `${((pad.l + band * hover + band / 2) / W) * 100}%`, transform: 'translateX(-50%)' }}>
              {data[hover].label}: <b className="font-num">{format(data[hover].value)}</b>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

/* ───────────────────────── misc ───────────────────────── */
export const inr = (n: number | string | null | undefined) =>
  `₹${Number(n ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export const fmtDT = (iso: string | null | undefined) =>
  iso ? new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(iso)) : '—';

export const istToday = () => new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
export const addDays = (d: string, n: number) => {
  const x = new Date(`${d}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};

/** Values come from the public internet — neutralise spreadsheet formulas before exporting. */
const csvCell = (v: unknown) => {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
};
export function downloadCsv(name: string, head: string[], rows: unknown[][]) {
  const text = '﻿' + [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  a.download = name;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export const waLink = (phone: string | null | undefined, text = '') => {
  const d = (phone ?? '').replace(/\D/g, '');
  const n = d.length === 10 ? `91${d}` : d;
  return n ? `https://wa.me/${n}${text ? `?text=${encodeURIComponent(text)}` : ''}` : null;
};
