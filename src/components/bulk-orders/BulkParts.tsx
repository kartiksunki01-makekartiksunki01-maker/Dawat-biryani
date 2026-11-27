import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, CalendarClock, Check, ChevronDown, Clock3, CookingPot, Minus, Plus, ShoppingBag, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { BULK_CATEGORY_LABEL, inr, lineTotal, type BulkItem, type BulkLine, type BulkNotice } from '../../data/bulk';
import { asset } from '../../utils/format';
import { CountUp } from '../motion/Motion';
import { DietMark, PromoLabel } from '../ui/Bits';

const ease = [0.22, 1, 0.36, 1] as const;

/** Real photo, the restaurant's promotional artwork (labelled), or a branded placeholder that names no dish look. */
export function DishVisual({ item, className = '', sizes = 'md' }: { item: BulkItem; className?: string; sizes?: 'sm' | 'md' }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [item.image]);
  if (item.image && !broken) {
    return (
      <div className={`relative overflow-hidden bg-[#1d130d] ${className}`}>
        <img src={asset(item.image)} alt={item.imageKind === 'photo' ? `Photo of ${item.name}` : `Promotional artwork for ${item.name}`} loading="lazy" decoding="async" onError={() => setBroken(true)} className="h-full w-full object-cover" />
        {item.imageKind === 'promotional' && (sizes === 'md'
          ? <PromoLabel className="absolute bottom-1.5 left-1.5" />
          : <span className="absolute bottom-1 left-1 rounded bg-black/65 px-1 py-px text-[8px] uppercase tracking-[0.12em] text-ivory/75">Artwork</span>)}
      </div>
    );
  }
  return (
    <div className={`relative grid place-items-center overflow-hidden bg-gradient-to-br from-[#3a0b0b] via-[#22110b] to-[#120c08] ${className}`} role="img" aria-label={`${item.name} — photo coming soon`}>
      <div className="bg-jali pointer-events-none absolute inset-0 opacity-40" aria-hidden />
      <div className="relative flex flex-col items-center gap-1 text-center">
        <CookingPot size={sizes === 'sm' ? 22 : 30} className="text-gold/80" aria-hidden />
        {sizes === 'md' && <span className="px-2 text-[9.5px] uppercase tracking-[0.18em] text-ivory/55">Photo coming soon</span>}
      </div>
    </div>
  );
}

export function KgControl({ value, min, max, onChange, label, size = 'md' }: { value: number; min: number; max: number; onChange: (v: number) => void; label: string; size?: 'sm' | 'md' }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = (raw: string) => {
    const v = Math.round(Number(raw));
    if (raw.trim() === '' || Number.isNaN(v)) { setText(String(value)); return; }
    const c = Math.min(max, Math.max(min, v));
    setText(String(c));
    if (c !== value) onChange(c);
  };
  const btn = size === 'sm' ? 'h-10 w-10' : 'h-11 w-11';
  return (
    <div className="inline-flex items-center rounded-full bg-ivory/5 ring-1 ring-gold/30" role="group" aria-label={label}>
      <motion.button whileTap={{ scale: 0.9 }} type="button" className={`${btn} grid place-items-center rounded-full text-ivory transition-colors hover:bg-gold/15 disabled:opacity-35`}
        onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label={`Decrease ${label}`}>
        <Minus size={16} />
      </motion.button>
      <label className="flex items-baseline">
        <span className="sr-only">{label} in kilograms</span>
        <input
          inputMode="numeric"
          className={`${size === 'sm' ? 'w-9' : 'w-11'} bg-transparent text-center font-num font-semibold tabular-nums text-ivory outline-none focus-visible:rounded focus-visible:ring-2 focus-visible:ring-saffron`}
          value={text}
          onChange={(e) => setText(e.target.value.replace(/[^\d]/g, '').slice(0, 3))}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit((e.target as HTMLInputElement).value); } }}
          aria-valuemin={min}
          aria-valuemax={max}
        />
      </label>
      <span className="-ml-0.5 text-xs text-ivory/60" aria-hidden>kg</span>
      <motion.button whileTap={{ scale: 0.9 }} type="button" className={`${btn} grid place-items-center rounded-full text-ivory transition-colors hover:bg-gold/15 disabled:opacity-35`}
        onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label={`Increase ${label}`}>
        <Plus size={16} />
      </motion.button>
    </div>
  );
}

export function TimingRules({ item, kg }: { item: BulkItem; kg: number }) {
  const needs = kg > item.noticeFreeUpToKg && item.advanceNoticeHours > 0;
  const freeLabel = item.noticeFreeUpToKg >= item.minKg ? `${item.minKg}–${Math.min(item.noticeFreeUpToKg, item.maxKg)} kg` : null;
  const noticeFrom = Math.max(item.minKg, item.noticeFreeUpToKg + 1);
  return (
    <div>
      <ul className="grid gap-2 sm:grid-cols-2">
        {freeLabel && (
          <li className={`rounded-2xl p-3.5 ring-1 transition-colors duration-300 ${!needs ? 'bg-emerald/40 ring-gold/50' : 'bg-ivory/[0.03] ring-gold/15'}`}>
            <p className="flex items-center gap-2 text-sm font-medium text-ivory"><Clock3 size={15} className="text-gold" aria-hidden /> {freeLabel}</p>
            <p className="mt-1 text-xs text-ivory/65">{item.timingConfirmed ? 'Advertised as available anytime during business hours, subject to availability.' : 'No advance notice needed to send the enquiry.'}</p>
          </li>
        )}
        {noticeFrom <= item.maxKg && item.advanceNoticeHours > 0 && (
          <li className={`rounded-2xl p-3.5 ring-1 transition-colors duration-300 ${needs ? 'bg-maroon/50 ring-gold/50' : 'bg-ivory/[0.03] ring-gold/15'}`}>
            <p className="flex items-center gap-2 text-sm font-medium text-ivory"><CalendarClock size={15} className="text-gold" aria-hidden /> {noticeFrom}–{item.maxKg} kg</p>
            <p className="mt-1 text-xs text-ivory/65">Please give at least {item.advanceNoticeHours} hour{item.advanceNoticeHours === 1 ? '' : 's'}’ advance notice.</p>
          </li>
        )}
      </ul>
      {!item.timingConfirmed && (
        <p className="mt-2 text-[11px] leading-relaxed text-ivory/50">Preparation time for {item.name} is confirmed by the restaurant with your quotation.</p>
      )}
    </div>
  );
}

export function ProductCard({ item, focused, inCart, draftKg, onFocus, onDraft, onAdd, index }: {
  item: BulkItem; focused: boolean; inCart?: BulkLine; draftKg: number; index: number;
  onFocus: () => void; onDraft: (kg: number) => void; onAdd: () => void;
}) {
  const [added, setAdded] = useState(false);
  useEffect(() => { if (!added) return; const t = window.setTimeout(() => setAdded(false), 1400); return () => window.clearTimeout(t); }, [added]);
  const same = inCart?.kg === draftKg;
  return (
    <motion.li
      layout="position"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease, delay: Math.min(index, 8) * 0.035 }}
      onClick={onFocus}
      data-bulk-card={item.slug}
      className={`group relative flex gap-3 overflow-hidden rounded-2xl p-3 ring-1 transition-[box-shadow,background-color] duration-300 ${
        focused ? 'bg-gold/[0.08] ring-gold/70 shadow-[0_0_0_1px_rgba(212,175,55,0.25),0_18px_40px_-24px_rgba(245,158,11,0.55)]' : 'bg-ivory/[0.03] ring-gold/15 hover:bg-ivory/[0.05] hover:ring-gold/35'
      }`}
    >
      {added && <span className="bulk-sweep pointer-events-none absolute inset-0" aria-hidden />}
      <DishVisual item={item} sizes="sm" className="h-24 w-24 shrink-0 rounded-xl sm:h-[6.5rem] sm:w-[6.5rem]" />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-2">
          <button type="button" className="min-w-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-saffron rounded" onClick={(e) => { e.stopPropagation(); onFocus(); }} aria-pressed={focused}>
            <span className="flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.14em] text-gold/80"><DietMark diet={item.diet} className="scale-90" /> {BULK_CATEGORY_LABEL[item.category]}</span>
            <span className="mt-0.5 block font-display text-[1.05rem] leading-snug text-ivory">{item.name}</span>
          </button>
          <p className="shrink-0 text-right font-num text-sm font-semibold text-gold">{inr(item.pricePerKg)}<span className="block text-[10px] font-normal text-ivory/55">per kg</span></p>
        </div>
        <p className="mt-1 text-[11px]">
          {item.soldOut ? <span className="text-red-300">● Sold out</span>
            : inCart ? <span className="text-gold">● In your bulk order · {inCart.kg} kg</span>
            : <span className="text-emerald-300">● Available{!item.timingConfirmed ? ' · timing confirmed on quotation' : ''}</span>}
        </p>
        {!item.soldOut && (
          <div className="mt-auto flex flex-wrap items-center gap-2 pt-2" onClick={(e) => e.stopPropagation()}>
            <KgControl size="sm" value={draftKg} min={item.minKg} max={item.maxKg} onChange={(v) => { onDraft(v); onFocus(); }} label={`Quantity of ${item.name}`} />
            <motion.button
              whileTap={{ scale: 0.95 }}
              type="button"
              disabled={!!inCart && same && !added}
              onClick={() => { onAdd(); setAdded(true); }}
              className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-full px-3.5 text-xs font-semibold transition-colors ${added ? 'bg-emerald-500/90 text-white' : 'bg-gradient-to-b from-[#f4d77e] to-[#c99a2e] text-clove hover:brightness-110 disabled:from-ivory/10 disabled:to-ivory/10 disabled:text-ivory/50'}`}
              aria-label={inCart ? `Update ${item.name} in bulk order to ${draftKg} kg` : `Add ${draftKg} kg ${item.name} to bulk order`}
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.span key={added ? 'ok' : 'add'} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.16 }} className="inline-flex items-center gap-1.5">
                  {added ? <><Check size={14} /> Added</> : inCart ? (same ? <>In order</> : <>Update</>) : <><Plus size={14} /> Add</>}
                </motion.span>
              </AnimatePresence>
            </motion.button>
          </div>
        )}
      </div>
    </motion.li>
  );
}

export function BulkSummary({ lines, items, notices, maxTotalKg, onKg, onRemove, onDismiss, open, setOpen }: {
  lines: BulkLine[]; items: BulkItem[]; notices: BulkNotice[]; maxTotalKg: number; open: boolean; setOpen: (v: boolean) => void;
  onKg: (id: string, kg: number) => void; onRemove: (id: string) => void; onDismiss: (id: string) => void;
}) {
  const kg = lines.reduce((a, l) => a + l.kg, 0);
  const total = lines.reduce((a, l) => a + lineTotal(l), 0);
  const over = kg > maxTotalKg;
  return (
    <section id="bulk-summary" aria-label="Your bulk order" className="glass overflow-hidden rounded-[2rem]">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="bulk-summary-body" className="flex w-full items-center justify-between gap-3 p-5 text-left sm:p-6">
        <span className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-full bg-gold/15 text-gold ring-1 ring-gold/30"><ShoppingBag size={18} aria-hidden /></span>
          <span>
            <span className="block font-display text-xl text-ivory">Your bulk order</span>
            <span className="block text-xs text-ivory/60">{lines.length ? `${lines.length} dish${lines.length === 1 ? '' : 'es'} · ${kg} kg` : 'No dishes added yet'}</span>
          </span>
        </span>
        <span className="flex items-center gap-3">
          {lines.length > 0 && <CountUp value={total} format={inr} label="Estimated total" className="font-num text-lg font-semibold text-gold" />}
          <ChevronDown size={18} className={`text-ivory/60 transition-transform duration-300 ${open ? 'rotate-180' : ''}`} aria-hidden />
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div id="bulk-summary-body" key="body" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3, ease }}>
            <div className="border-t border-gold/15 px-5 pb-5 pt-4 sm:px-6">
              <AnimatePresence initial={false}>
                {notices.map((n) => (
                  <motion.p key={n.id + n.kind} role="alert" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                    className={`mb-2 flex items-start gap-2 overflow-hidden rounded-xl p-3 text-xs ${n.kind === 'unavailable' ? 'bg-red-500/10 text-red-100 ring-1 ring-red-400/40' : 'bg-saffron/10 text-amber-100 ring-1 ring-saffron/40'}`}>
                    <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden /> <span className="flex-1">{n.text}</span>
                    {n.kind !== 'unavailable' && <button type="button" onClick={() => onDismiss(n.id)} className="-m-1 grid h-7 w-7 place-items-center rounded-full hover:bg-white/10" aria-label="Dismiss notice"><X size={13} /></button>}
                  </motion.p>
                ))}
              </AnimatePresence>
              {!lines.length ? (
                <p className="rounded-2xl bg-ivory/[0.03] p-4 text-sm text-ivory/60 ring-1 ring-gold/10">Choose dishes above and press <b className="text-ivory">Add</b>. You can mix several dishes in one enquiry.</p>
              ) : (
                <ul className="space-y-2" aria-label="Dishes in your bulk order">
                  <AnimatePresence initial={false}>
                    {lines.map((l) => {
                      const it = items.find((i) => i.id === l.id);
                      return (
                        <motion.li key={l.id} layout="position" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.26, ease }} className="overflow-hidden">
                          <div className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl p-3 ring-1 ${l.unavailable ? 'bg-red-500/5 ring-red-400/40' : 'bg-ivory/[0.03] ring-gold/15'}`} data-bulk-line={l.slug}>
                            <div className="min-w-0 flex-1">
                              <p className={`text-sm font-medium ${l.unavailable ? 'text-ivory/50 line-through' : 'text-ivory'}`}>{l.name}</p>
                              <p className="font-num text-xs text-ivory/60">{l.kg} kg × {inr(l.pricePerKg)}/kg = <span className="text-ivory/85">{inr(lineTotal(l))}</span></p>
                            </div>
                            {!l.unavailable && it && <KgControl size="sm" value={l.kg} min={it.minKg} max={it.maxKg} onChange={(v) => onKg(l.id, v)} label={`Quantity of ${l.name} in bulk order`} />}
                            <button type="button" onClick={() => onRemove(l.id)} className="grid h-10 w-10 place-items-center rounded-full text-ivory/60 transition-colors hover:bg-red-500/15 hover:text-red-200" aria-label={`Remove ${l.name} from bulk order`}>
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </motion.li>
                      );
                    })}
                  </AnimatePresence>
                </ul>
              )}
              {lines.length > 0 && (
                <dl className="mt-4 space-y-1.5 rounded-2xl bg-black/25 p-4 text-sm">
                  <div className="flex justify-between text-ivory/70"><dt>Total quantity</dt><dd className="font-num" data-bulk-total-kg={kg}>{kg} kg</dd></div>
                  <div className="flex justify-between font-semibold text-ivory"><dt>Estimated total</dt><dd><CountUp value={total} format={inr} className="font-num text-gold" /></dd></div>
                  <p className="pt-1 text-[11px] leading-relaxed text-ivory/50">Estimate only — the restaurant confirms availability and the final price. No delivery, packaging, tax or discounts are added here.</p>
                </dl>
              )}
              {over && <p role="alert" className="mt-3 rounded-xl bg-maroon/50 p-3 text-xs text-ivory">Online bulk enquiries can be up to {maxTotalKg} kg in total — yours is {kg} kg. Reduce a quantity or call the restaurant for larger orders.</p>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
