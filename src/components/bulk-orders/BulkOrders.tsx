import { AnimatePresence, LayoutGroup, MotionConfig, motion } from 'framer-motion';
import { CheckCircle2, Copy, Flame, Loader2, Phone, Scale, Search, ShoppingBag, X } from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { restaurant } from '../../data/restaurant';
import { syncMenu, useStorefront } from '../../data/menuSync';
import {
  BULK_CATEGORY_LABEL, BULK_FILTERS, STATIC_BULK_MENU, cartTotals, inr, istInstant, istToday, requiredNotice, useBulkCart, type BulkItem,
} from '../../data/bulk';
import { ApiError, submitBulkEnquiry } from '../../lib/api';
import { useHost } from '../../stores/hostStore';
import { useUI } from '../../stores/uiStore';
import { guessQuality, hasWebGL } from '../../utils/device';
import { buildBulkOrderMessage, copyText, telUrl, type BulkOrderDetails } from '../../utils/order';
import { WhatsAppLink } from '../ui/WhatsAppLink';
import { sound } from '../../utils/sound';
import { useInView, useReducedMotion } from '../../hooks/useMedia';
import { CountUp, Reveal } from '../motion/Motion';
import { DietMark, SectionHeading, WhatsAppIcon } from '../ui/Bits';
import { HotBox } from './HotBox';
import { BulkSummary, DishVisual, KgControl, ProductCard, TimingRules } from './BulkParts';

const ease = [0.22, 1, 0.36, 1] as const;

const BulkHandi3D = lazy(() => import('./BulkHandi3D'));

const PHONE_RE = /^(\+91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}$/;
let lastBulkSync = Date.now(); // main.tsx syncs the whole storefront on page load
const startKg = (it: BulkItem) => Math.min(it.maxKg, Math.max(it.minKg, 5));

function HandiFallback({ kg }: { kg: number }) {
  const s = 0.55 + 0.55 * Math.pow((Math.min(50, Math.max(1, kg)) - 1) / 19, 0.6);
  return (
    <svg viewBox="0 0 240 200" className="h-full w-full" aria-hidden>
      <motion.g initial={false} animate={{ scale: s }} transition={{ type: 'spring', stiffness: 170, damping: 20 }} style={{ originX: 0.5, originY: 1 }}>
        <path d="M58 92 Q120 70 182 92 L176 98 Q120 80 64 98Z" fill="#c9953e" />
        <path d="M66 98 Q120 84 174 98 C186 118 206 136 196 164 C186 190 150 200 120 200 C90 200 54 190 44 164 C34 136 54 118 66 98Z" fill="#8a5d22" stroke="#D4AF37" />
      </motion.g>
    </svg>
  );
}

export function BulkOrders() {
  const liveMenu = useStorefront((s) => s.bulk);
  const source = useStorefront((s) => s.source);
  const version = useStorefront((s) => s.version);
  const skew = useStorefront((s) => s.clockSkewMs);
  const rs = useStorefront((s) => s.restaurant);
  const bulkMenu = liveMenu ?? STATIC_BULK_MENU;
  const items = bulkMenu.items;
  const maxTotalKg = bulkMenu.maxTotalKg;

  const lines = useBulkCart((s) => s.lines);
  const notices = useBulkCart((s) => s.notices);
  const addPulse = useBulkCart((s) => s.addPulse);
  const { put, setKg, remove, clear, dismissNotice, revalidate } = useBulkCart.getState();

  const [ref, seen] = useInView<HTMLElement>({ threshold: 0.2 });
  const [sectionRef, inSection] = useInView<HTMLDivElement>({ once: false, threshold: 0 });
  const [summaryRef, summaryVisible] = useInView<HTMLDivElement>({ once: false, threshold: 0.15 });
  const [canvasRef, canvasVisible] = useInView<HTMLDivElement>({ once: false, rootMargin: '100px' });
  const reduced = useReducedMotion();
  const say = useHost((s) => s.say);
  const showToast = useUI((s) => s.showToast);
  const [webgl] = useState(() => hasWebGL());
  const [lite] = useState(() => guessQuality() === 'low');
  const [canvasMounted, setCanvasMounted] = useState(false);

  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [focusId, setFocusId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, number>>({});
  const [summaryOpen, setSummaryOpen] = useState(true);
  const [details, setDetails] = useState<BulkOrderDetails>({ eventType: restaurant.bulk.eventTypes[0], date: '', time: '', name: '', phone: '', mode: 'pickup', instructions: '' });
  const [consent, setConsent] = useState(false);
  const [tried, setTried] = useState(false);
  const [limitMsg, setLimitMsg] = useState('');
  const set = (patch: Partial<BulkOrderDetails>) => { setDetails((d) => ({ ...d, ...patch })); if ('date' in patch || 'time' in patch) setClock(Date.now()); };

  useEffect(() => { if (seen) say('bulk', { once: true }); }, [seen, say]);
  useEffect(() => { if (canvasVisible) setCanvasMounted(true); }, [canvasVisible]);
  // keep bulk prices fresh while the customer is here: re-check when the section comes into view or the tab
  // returns to the foreground (at most every 2 minutes), so admin price changes reach an open page too
  useEffect(() => {
    if (!inSection) return;
    const refresh = () => { if (document.visibilityState === 'visible' && Date.now() - lastBulkSync > 120000) { lastBulkSync = Date.now(); void syncMenu(); } };
    refresh();
    document.addEventListener('visibilitychange', refresh);
    const t = window.setInterval(refresh, 150000);
    return () => { document.removeEventListener('visibilitychange', refresh); window.clearInterval(t); };
  }, [inSection]);
  // every menu refresh: new prices / removed dishes / changed limits are applied to the saved bulk order
  useEffect(() => { revalidate(bulkMenu, source === 'live' && !!liveMenu); }, [version]); // eslint-disable-line react-hooks/exhaustive-deps

  const shown = useMemo(() => {
    const cats = BULK_FILTERS.find((f) => f.id === filter)?.cats ?? null;
    const q = query.trim().toLowerCase();
    return items.filter((i) => (!cats || cats.includes(i.category)) && (!q || `${i.name} ${BULK_CATEGORY_LABEL[i.category]}`.toLowerCase().includes(q)));
  }, [items, filter, query]);

  const focus = items.find((i) => i.id === focusId) ?? items.find((i) => !i.soldOut) ?? items[0];
  const kgOf = useCallback((it: BulkItem) => draft[it.id] ?? lines.find((l) => l.id === it.id)?.kg ?? startKg(it), [draft, lines]);
  const focusKg = focus ? kgOf(focus) : 1;
  const focusLine = focus ? lines.find((l) => l.id === focus.id) : undefined;
  const { kg: totalKg, total } = cartTotals(lines.filter((l) => !l.unavailable));
  const usable = lines.filter((l) => !l.unavailable);
  const hasUnavailable = lines.some((l) => l.unavailable);

  const addItem = (it: BulkItem, kg: number) => {
    const others = lines.filter((l) => l.id !== it.id && !l.unavailable).reduce((a, l) => a + l.kg, 0);
    if (others + kg > maxTotalKg) {
      setLimitMsg(`Online bulk enquiries can be up to ${maxTotalKg} kg in total. You already have ${others} kg — choose ${Math.max(0, maxTotalKg - others)} kg or less, or call the restaurant.`);
      showToast(`Total limit is ${maxTotalKg} kg`);
      return false;
    }
    setLimitMsg('');
    const wasIn = lines.some((l) => l.id === it.id);
    put(it, kg);
    setSummaryOpen(true);
    sound.play('chime');
    showToast(wasIn ? `${it.name} updated to ${kg} kg` : `${kg} kg ${it.name} added to your bulk order`);
    return true;
  };
  const setDraftKg = (id: string, kg: number) => setDraft((d) => ({ ...d, [id]: kg }));

  /* ───────── timing, validation (Asia/Kolkata) ───────── */
  const notice = requiredNotice(usable, items);
  const atMs = istInstant(details.date, details.time)?.getTime() ?? null;
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => { const t = window.setInterval(() => setClock(Date.now()), 30000); return () => window.clearInterval(t); }, []);
  const nowMs = clock + skew;
  const timeIssue = (() => {
    if (atMs === null) return '';
    if (atMs < nowMs - 120000) return 'The chosen time has already passed. Please choose a later time.';
    if (notice.hours && atMs < nowMs + notice.hours * 36e5 - 120000) return `For ${notice.kg} kg of ${notice.name}, please choose a time at least ${notice.hours} hours from now.`;
    if (rs) {
      const local = new Date(atMs + 5.5 * 36e5);
      const dow = local.getUTCDay();
      const hhmm = local.toISOString().slice(11, 16);
      if (!rs.open_days.includes(dow) || rs.closed_dates.includes(details.date)) return 'The restaurant is closed on the chosen day. Please choose another day.';
      if (hhmm < rs.opens_at.slice(0, 5) || hhmm > rs.closes_at.slice(0, 5)) return `Please choose a time within opening hours (${rs.opens_at.slice(0, 5)} – ${rs.closes_at.slice(0, 5)}).`;
    }
    return '';
  })();

  const errors = {
    items: !usable.length ? 'Add at least one dish to your bulk order.' : hasUnavailable ? 'Remove the dish that is no longer available.' : totalKg > maxTotalKg ? `The total is limited to ${maxTotalKg} kg.` : '',
    name: details.name.trim().length < 2 ? 'Please enter your name.' : '',
    phone: !PHONE_RE.test(details.phone.trim()) ? 'Enter a valid 10-digit Indian mobile number.' : '',
    date: !details.date ? 'Choose a date.' : details.date < istToday(skew) ? 'Choose today or a later date.' : '',
    time: !details.time ? 'Choose a time.' : '',
    consent: consent ? '' : 'Please confirm to continue.',
  };
  const valid = Object.values(errors).every((e) => !e) && !timeIssue;
  const message = buildBulkOrderMessage(usable, details);

  /* ───────── submit (server prices it; duplicates are prevented by the idempotency key) ───────── */
  const keyRef = useRef<string>(crypto.randomUUID());
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<{ id: string; kg: number; total: number; lines: { name: string; kg: number; pricePerKg: number }[] } | null>(null);
  const [sendError, setSendError] = useState<ApiError | null>(null);
  const sendingRef = useRef(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (!valid || sendingRef.current) {
      if (errors.items) document.getElementById('bulk-summary')?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
      return;
    }
    sendingRef.current = true;
    setSending(true);
    setSendError(null);
    try {
      const res = await submitBulkEnquiry({
        idempotency_key: keyRef.current,
        name: details.name.trim(),
        phone: details.phone.trim(),
        items: usable.map((l) => ({ id: l.id, kg: l.kg })),
        seen_prices: Object.fromEntries(usable.map((l) => [l.id, l.pricePerKg])),
        event_type: details.eventType,
        date: details.date,
        time: details.time,
        mode: details.mode,
        instructions: details.instructions.trim(),
        consent,
      });
      setSent({ id: res.id, kg: res.total_kg, total: res.estimated_total, lines: res.items.map((i) => ({ name: i.name, kg: i.kg, pricePerKg: i.price_per_kg })) });
      keyRef.current = crypto.randomUUID();
      clear();
      sound.play('chime');
      say('enquiry_sent');
      showToast('Bulk enquiry received by the restaurant.');
    } catch (err) {
      const apiErr = err instanceof ApiError ? err : new ApiError('network', 'Could not send the enquiry.');
      if (!apiErr.uncertain) keyRef.current = crypto.randomUUID(); // nothing was stored — a fresh attempt is safe
      if (apiErr.issues.some((i) => i.code === 'price_changed' || i.code === 'unavailable' || i.code === 'qty_invalid')) {
        // refresh the menu so the summary shows the new prices / unavailable dishes before the customer resends
        await syncMenu();
        revalidate(useStorefront.getState().bulk ?? bulkMenu, true);
        setSummaryOpen(true);
      }
      setSendError(apiErr);
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

  const copy = async () => {
    setTried(true);
    if (errors.items) return;
    const ok = await copyText(message);
    showToast(ok ? 'Bulk order details copied.' : 'Could not copy — please try again.');
  };

  const fill = focus ? ((focusKg - focus.minKg) / Math.max(1, focus.maxKg - focus.minKg)) * 100 : 0;
  const showPill = inSection && !summaryVisible && usable.length > 0 && !sent;

  return (
    <MotionConfig reducedMotion="user">
      <section id="bulk-orders" ref={ref} className="relative scroll-mt-24 overflow-hidden bg-smoke py-28 sm:py-36" aria-labelledby="bulk-title">
        <div className="pointer-events-none absolute left-1/2 top-1/3 h-[600px] w-[900px] -translate-x-1/2 rounded-full bg-saffron/10 blur-[140px]" aria-hidden />
        <div ref={sectionRef} className="relative mx-auto max-w-[1400px] px-5 sm:px-8 lg:px-14">
          <div id="bulk-title">
            <SectionHeading
              eyebrow="Bulk & Special Orders"
              title="Bulk & Special"
              accent="Orders."
              intro="Royal feasts for family functions, celebrations, parties and every special occasion — priced per kilogram, mix as many dishes as you like."
            />
          </div>

          {/* ───────── stage + selector ───────── */}
          {focus && (
            <div className="mt-14 grid gap-8 lg:grid-cols-[1.05fr_1fr] lg:gap-12">
              <div ref={canvasRef} className="relative aspect-[5/4] overflow-hidden rounded-[2rem] bg-gradient-to-b from-[#1d130d] to-smoke ring-1 ring-gold/20" data-bulk-stage>
                <div className="absolute inset-0 bg-[radial-gradient(50%_40%_at_50%_70%,rgba(245,158,11,0.25),transparent)]" aria-hidden />
                <motion.div className="pointer-events-none absolute inset-0 bg-[radial-gradient(40%_35%_at_50%_62%,rgba(255,199,107,0.35),transparent)]" key={`glow-${addPulse}-${focus.id}`}
                  initial={{ opacity: reduced ? 0 : 0.9 }} animate={{ opacity: 0 }} transition={{ duration: 1.1, ease }} aria-hidden />
                {webgl ? (
                  <Suspense fallback={null}>{canvasMounted && <BulkHandi3D kg={focusKg} pulse={addPulse} active={canvasVisible} reduced={reduced} lite={lite} />}</Suspense>
                ) : (
                  <HandiFallback kg={focusKg} />
                )}
                <div className="pointer-events-none absolute left-5 top-4 sm:left-6 sm:top-5">
                  <p className="font-num text-6xl font-bold leading-none text-ivory sm:text-7xl" data-stage-kg={focusKg}>
                    <CountUp value={focusKg} format={(n) => String(n)} label="Selected quantity" />
                    <span className="ml-1 text-2xl text-gold">kg</span>
                  </p>
                  <p className="mt-2 text-xs uppercase tracking-[0.2em] text-ivory/50">your handi grows with your order</p>
                </div>
                <div className="pointer-events-none absolute inset-x-4 bottom-4 flex items-end justify-between gap-3 sm:inset-x-5 sm:bottom-5">
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.div key={focus.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25, ease }} className="min-w-0">
                      <p className="flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.16em] text-gold/85"><DietMark diet={focus.diet} className="scale-90" /> {BULK_CATEGORY_LABEL[focus.category]}</p>
                      <p className="truncate font-display text-xl text-ivory sm:text-2xl">{focus.name}</p>
                      <p className="font-num text-sm text-ivory/70">{inr(focus.pricePerKg)} / kg</p>
                    </motion.div>
                  </AnimatePresence>
                  <div className="shrink-0 rounded-2xl bg-black/45 px-3.5 py-2 text-right ring-1 ring-gold/30 backdrop-blur-sm">
                    <p className="text-[10px] uppercase tracking-[0.16em] text-ivory/60">Estimate</p>
                    <CountUp value={focusKg * focus.pricePerKg} format={inr} label={`Estimate for ${focusKg} kg`} className="font-num text-xl font-semibold text-gold sm:text-2xl" />
                  </div>
                </div>
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div key={focus.id} initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }} transition={{ duration: 0.3, ease }}
                    className="pointer-events-none absolute right-4 top-4 hidden overflow-hidden rounded-2xl ring-1 ring-gold/40 shadow-xl sm:block">
                    <DishVisual item={focus} sizes="sm" className="h-20 w-20" />
                  </motion.div>
                </AnimatePresence>
              </div>

              <div className="glass flex flex-col rounded-[2rem] p-6 sm:p-8" aria-label="Quantity selector">
                <p className="flex items-center gap-2 font-display text-2xl text-ivory"><Scale size={20} className="text-gold" aria-hidden /> Quantity</p>
                <p className="mt-1 text-sm text-ivory/65">
                  for <AnimatePresence mode="wait" initial={false}><motion.b key={focus.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} className="font-medium text-ivory">{focus.name}</motion.b></AnimatePresence>
                  {' · '}{inr(focus.pricePerKg)} per kg
                </p>
                <div className="mt-5 flex flex-wrap items-center gap-4">
                  <input
                    type="range" min={focus.minKg} max={focus.maxKg} step={1} value={focusKg}
                    onChange={(e) => setDraftKg(focus.id, Number(e.target.value))}
                    className="gold-range min-w-[180px] flex-1" style={{ ['--fill' as string]: `${fill}%` }}
                    aria-label="Quantity in kilograms" aria-valuetext={`${focusKg} kilograms`} disabled={focus.soldOut}
                  />
                  <KgControl value={focusKg} min={focus.minKg} max={focus.maxKg} onChange={(v) => setDraftKg(focus.id, v)} label={`Quantity of ${focus.name}`} />
                </div>
                <dl className="mt-5 grid grid-cols-3 gap-2 rounded-2xl bg-black/25 p-4 text-center">
                  <div><dt className="text-[10px] uppercase tracking-[0.14em] text-ivory/50">Price</dt><dd className="font-num text-sm text-ivory">{inr(focus.pricePerKg)}/kg</dd></div>
                  <div><dt className="text-[10px] uppercase tracking-[0.14em] text-ivory/50">Quantity</dt><dd className="font-num text-sm text-ivory">{focusKg} kg</dd></div>
                  <div><dt className="text-[10px] uppercase tracking-[0.14em] text-ivory/50">Estimate</dt><dd><CountUp value={focusKg * focus.pricePerKg} format={inr} className="font-num text-sm font-semibold text-gold" /></dd></div>
                </dl>
                <motion.button whileTap={{ scale: 0.97 }} type="button" disabled={focus.soldOut || (focusLine?.kg === focusKg)}
                  onClick={() => addItem(focus, focusKg)}
                  className="btn btn-gold shimmer mt-5 w-full disabled:opacity-60">
                  <ShoppingBag size={18} /> {focus.soldOut ? 'Sold out' : focusLine ? (focusLine.kg === focusKg ? `In your bulk order · ${focusKg} kg` : `Update to ${focusKg} kg`) : 'Add to Bulk Order'}
                </motion.button>
                {limitMsg && <p role="alert" className="mt-3 rounded-xl bg-maroon/50 p-3 text-xs text-ivory">{limitMsg}</p>}
                <div className="mt-5"><TimingRules item={focus} kg={focusKg} /></div>
              </div>
            </div>
          )}

          {/* ───────── dishes ───────── */}
          <div className="mt-16">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div>
                <h3 className="font-display text-3xl text-ivory">Choose your dishes</h3>
                <p className="mt-1 text-sm text-ivory/60">Prices per kilogram for bulk orders — separate from the regular plate menu.</p>
              </div>
              <label className="relative block w-full md:max-w-xs">
                <span className="sr-only">Search bulk dishes</span>
                <Search size={17} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gold/70" aria-hidden />
                <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search bulk dishes…" className="field rounded-full pl-11 pr-11" />
                {query && (
                  <button type="button" onClick={() => setQuery('')} className="absolute right-1.5 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full text-ivory/60 hover:text-ivory" aria-label="Clear search"><X size={16} /></button>
                )}
              </label>
            </div>
            <LayoutGroup id="bulk-filters">
              <div role="tablist" aria-label="Bulk dish categories" className="no-scrollbar -mx-5 mt-6 flex gap-2 overflow-x-auto px-5 pb-2 sm:mx-0 sm:px-0">
                {BULK_FILTERS.map((f) => {
                  const sel = filter === f.id;
                  return (
                    <button key={f.id} type="button" role="tab" aria-selected={sel} aria-controls="bulk-grid" onClick={() => setFilter(f.id)}
                      className={`relative min-h-[44px] shrink-0 rounded-full px-5 text-sm transition-colors ${sel ? 'text-clove' : 'text-ivory/75 ring-1 ring-gold/25 hover:text-ivory hover:ring-gold/50'}`}>
                      {sel && <motion.span layoutId="bulk-tab-pill" className="absolute inset-0 rounded-full bg-gradient-to-b from-[#f4d77e] to-[#c99a2e]" transition={{ type: 'spring', stiffness: 400, damping: 34 }} />}
                      <span className="relative font-medium">{f.label}</span>
                    </button>
                  );
                })}
              </div>
            </LayoutGroup>
            <div id="bulk-grid" role="tabpanel" aria-live="polite" className="mt-6">
              {!shown.length ? (
                <p className="rounded-2xl bg-ivory/[0.03] p-6 text-center text-sm text-ivory/60 ring-1 ring-gold/10">No bulk dishes match{query ? ` “${query}”` : ''}. Try another category.</p>
              ) : (
                // Filtering removes cards at once (no exit animation that could linger on slow devices);
                // remaining cards glide to their new place and new ones fade in with a short stagger.
                <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {shown.map((it, i) => (
                    <ProductCard key={it.id} item={it} index={i} focused={focus?.id === it.id} inCart={lines.find((l) => l.id === it.id && !l.unavailable)} draftKg={kgOf(it)}
                      onFocus={() => { setFocusId(it.id); setLimitMsg(''); }} onDraft={(kg) => setDraftKg(it.id, kg)} onAdd={() => addItem(it, kgOf(it))} />
                  ))}
                </ul>
              )}
              {source === 'static' && <p className="mt-3 text-xs text-ivory/45">Showing the restaurant’s published bulk prices. The final price is always confirmed by the restaurant.</p>}
            </div>
          </div>

          {/* ───────── summary + enquiry ───────── */}
          <div className="mt-16 grid gap-8 lg:grid-cols-[1fr_1.05fr] lg:gap-12">
            <div ref={summaryRef} className="lg:self-start">
              <BulkSummary lines={lines} items={items} notices={notices} maxTotalKg={maxTotalKg} open={summaryOpen} setOpen={setSummaryOpen}
                onKg={(id, kg) => {
                  const others = lines.filter((l) => l.id !== id && !l.unavailable).reduce((a, l) => a + l.kg, 0);
                  if (others + kg > maxTotalKg) { showToast(`Total limit is ${maxTotalKg} kg`); return; }
                  setKg(id, kg);
                  setDraftKg(id, kg);
                }}
                onRemove={(id) => { remove(id); setLimitMsg(''); showToast('Removed from your bulk order'); }} onDismiss={dismissNotice} />
              {tried && errors.items && <p role="alert" className="mt-3 text-xs text-red-300">{errors.items}</p>}
            </div>

            <Reveal>
              <form onSubmit={submit} noValidate className="glass rounded-[2rem] p-6 sm:p-8" aria-label="Bulk order enquiry">
                <p className="font-display text-2xl text-ivory">Enquiry details</p>
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="field-label">Event type</span>
                    <select className="field" value={details.eventType} onChange={(e) => set({ eventType: e.target.value })}>
                      {restaurant.bulk.eventTypes.map((v) => <option key={v}>{v}</option>)}
                    </select>
                  </label>
                  <div role="radiogroup" aria-label="Pickup or delivery" className="grid grid-cols-2 gap-2 self-end">
                    {(['pickup', 'delivery'] as const).map((m) => (
                      <label key={m} className="relative">
                        <input type="radio" name="bulk-mode" className="peer sr-only" checked={details.mode === m} onChange={() => set({ mode: m })} />
                        <span className="flex min-h-[48px] cursor-pointer items-center justify-center rounded-2xl text-sm ring-1 ring-gold/25 transition peer-checked:bg-gold/15 peer-checked:ring-gold peer-focus-visible:ring-2 peer-focus-visible:ring-saffron">
                          {m === 'pickup' ? 'Pickup' : 'Delivery*'}
                        </span>
                      </label>
                    ))}
                  </div>
                  <label className="block">
                    <span className="field-label">Preferred date *</span>
                    <input type="date" className="field" min={istToday(skew)} value={details.date} onChange={(e) => set({ date: e.target.value })} aria-invalid={tried && !!errors.date} />
                    {tried && errors.date && <span className="mt-1 block text-xs text-red-300">{errors.date}</span>}
                  </label>
                  <label className="block">
                    <span className="field-label">Preferred time *</span>
                    <input type="time" className="field" value={details.time} onChange={(e) => set({ time: e.target.value })} aria-invalid={tried && !!errors.time} />
                    {tried && errors.time && <span className="mt-1 block text-xs text-red-300">{errors.time}</span>}
                  </label>
                  {timeIssue && (
                    <p className="flex items-start gap-2 rounded-xl bg-maroon/50 p-3 text-xs text-ivory sm:col-span-2" role="alert">
                      <Flame size={14} className="mt-0.5 shrink-0 text-saffron" aria-hidden /> {timeIssue}
                    </p>
                  )}
                  <label className="block">
                    <span className="field-label">Your name *</span>
                    <input className="field" value={details.name} onChange={(e) => set({ name: e.target.value.slice(0, 60) })} autoComplete="name" aria-invalid={tried && !!errors.name} />
                    {tried && errors.name && <span className="mt-1 block text-xs text-red-300">{errors.name}</span>}
                  </label>
                  <label className="block">
                    <span className="field-label">Mobile number *</span>
                    <input className="field font-num" inputMode="tel" value={details.phone} onChange={(e) => set({ phone: e.target.value.replace(/[^\d+\s-]/g, '').slice(0, 16) })} autoComplete="tel" aria-invalid={tried && !!errors.phone} />
                    {tried && errors.phone && <span className="mt-1 block text-xs text-red-300">{errors.phone}</span>}
                  </label>
                  <label className="block sm:col-span-2">
                    <span className="field-label">Special instructions</span>
                    <textarea className="field resize-none" rows={3} value={details.instructions} onChange={(e) => set({ instructions: e.target.value.slice(0, 400) })} placeholder="Number of guests, spice level, packaging…" />
                  </label>
                </div>

                <label className="mt-5 flex cursor-pointer items-start gap-3 text-xs text-ivory/70">
                  <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-[#D4AF37]" />
                  <span>I agree to share these details with {restaurant.name} so they can contact me with a quotation.</span>
                </label>
                {tried && errors.consent && <span className="mt-1 block text-xs text-red-300">{errors.consent}</span>}

                <div className="mt-6 grid gap-2">
                  <AnimatePresence mode="wait" initial={false}>
                    {sent ? (
                      <motion.div key="sent" role="status" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.3, ease }} className="space-y-3 rounded-2xl bg-emerald-500/10 p-4 text-sm text-ivory ring-1 ring-emerald-400/40">
                        <p className="flex items-center gap-2 font-semibold text-emerald-200"><CheckCircle2 size={18} /> Enquiry received by the restaurant</p>
                        <p className="text-xs text-ivory/75">Reference <b className="font-num">{sent.id.slice(0, 8).toUpperCase()}</b> · {sent.kg} kg · estimate <b>{inr(sent.total)}</b>. {restaurant.name} will contact you on {details.phone} to confirm availability and the final price. This is not a confirmed order yet.</p>
                        <WhatsAppLink className="btn btn-emerald btn-sm w-full" text={buildBulkOrderMessage(sent.lines, details)}>
                          <WhatsAppIcon /> Also send on WhatsApp (optional)
                        </WhatsAppLink>
                        <button type="button" className="btn btn-ghost btn-sm w-full" onClick={() => { setSent(null); setTried(false); setConsent(false); }}>Start a new bulk enquiry</button>
                      </motion.div>
                    ) : (
                      <motion.button key="send" whileTap={{ scale: 0.98 }} type="submit" className="btn btn-gold w-full shimmer" disabled={sending} aria-busy={sending}>
                        {sending ? <><Loader2 size={18} className="animate-spin" /> Sending…</> : <>Submit Bulk Order Enquiry{usable.length ? ` · ${inr(total)}` : ''}</>}
                      </motion.button>
                    )}
                  </AnimatePresence>
                  {sendError && !sent && (
                    <div role="alert" className="rounded-2xl bg-red-500/10 p-3 text-xs text-red-100 ring-1 ring-red-400/40">
                      <p className="font-semibold">{sendError.uncertain ? 'We could not confirm the enquiry was received.' : 'The enquiry was not sent.'}</p>
                      <p className="mt-1">{sendError.message} {sendError.issues.length > 1 && sendError.issues.slice(1).map((i) => i.message).join(' ')} Your details are kept — {sendError.uncertain ? 'press Submit again (it will not be duplicated), ' : 'check and try again, '}use WhatsApp, or call.</p>
                    </div>
                  )}
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {usable.length ? (
                      <WhatsAppLink className="btn btn-emerald btn-sm" text={message}>
                        <WhatsAppIcon /> WhatsApp enquiry
                      </WhatsAppLink>
                    ) : (
                      <button type="button" className="btn btn-emerald btn-sm opacity-50" disabled title="Add a dish first"><WhatsAppIcon /> WhatsApp enquiry</button>
                    )}
                    <button type="button" className="btn btn-ghost btn-sm" onClick={copy}><Copy size={16} /> Copy order details</button>
                    <a className="btn btn-ghost btn-sm" href={telUrl}><Phone size={16} /> Call restaurant</a>
                  </div>
                  <p className="text-center text-[11px] text-ivory/45">
                    Estimates use per-kg prices only. Final price, availability and timing are confirmed by the restaurant. *Delivery subject to the restaurant’s availability.
                  </p>
                </div>
              </form>
            </Reveal>
          </div>

          <HotBox />
        </div>

        {/* mobile/tablet: a small pill that jumps to the bulk order summary */}
        <AnimatePresence>
          {showPill && (
            <motion.button
              type="button"
              initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 24 }} transition={{ duration: 0.25, ease }}
              onClick={() => { setSummaryOpen(true); document.getElementById('bulk-summary')?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' }); }}
              className="fixed bottom-3 left-3 z-[64] flex max-w-[calc(100vw-6.5rem)] items-center gap-2 rounded-full bg-gradient-to-b from-[#f4d77e] to-[#c99a2e] px-4 py-2.5 text-sm font-semibold text-clove shadow-[0_12px_30px_-10px_rgba(0,0,0,0.7)] sm:bottom-5 sm:left-5 lg:hidden"
              aria-label={`View bulk order: ${usable.length} dishes, ${totalKg} kg, estimate ${inr(total)}`}
              data-bulk-pill
            >
              <ShoppingBag size={16} aria-hidden /> <span className="truncate">Bulk order · {totalKg} kg · {inr(total)}</span>
            </motion.button>
          )}
        </AnimatePresence>
      </section>
    </MotionConfig>
  );
}
