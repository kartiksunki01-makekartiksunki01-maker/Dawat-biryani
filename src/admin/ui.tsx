import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';

const base = 'w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-ivory placeholder:text-ivory/35 focus:border-gold focus:outline-none';

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

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { tone?: 'gold' | 'ghost' | 'danger' };
export function Btn({ tone = 'ghost', className = '', ...p }: BtnProps) {
  const tones = {
    gold: 'bg-gold text-smoke hover:brightness-110',
    ghost: 'border border-white/20 text-ivory hover:bg-white/10',
    danger: 'border border-red-400/40 text-red-300 hover:bg-red-500/10',
  } as const;
  return (
    <button
      type="button"
      {...p}
      className={`min-h-[40px] rounded-lg px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${tones[tone]} ${className}`}
    />
  );
}

export function Notice({ kind, children }: { kind: 'ok' | 'err' | 'info'; children: ReactNode }) {
  const c = { ok: 'border-emerald-400/40 text-emerald-200', err: 'border-red-400/40 text-red-200', info: 'border-white/20 text-ivory/70' }[kind];
  return <p role="status" className={`rounded-lg border bg-white/5 px-3 py-2 text-sm ${c}`}>{children}</p>;
}
