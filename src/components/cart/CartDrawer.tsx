import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, ArrowLeft, Check, CheckCircle2, Copy, Loader2, Phone, Tag, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { restaurant } from '../../data/restaurant';
import { canOrderOnline, offerLabel, syncMenu, useStorefront } from '../../data/menuSync';
import { ApiError, newOrderSecrets, placeOrder, quoteOrder, type OrderJSON, type Quote } from '../../lib/api';
import { trackUrl, useMyOrders } from '../../lib/myOrders';
import { resolveLines, subtotalOf, useCart, type ResolvedLine } from '../../stores/cartStore';
import { useHost } from '../../stores/hostStore';
import { useUI } from '../../stores/uiStore';
import { asset, formatINR } from '../../utils/format';
import {buildOrderMessage, copyText, telUrl} from '../../utils/order';
import { WhatsAppLink } from '../ui/WhatsAppLink';
import { asapAvailable, dateOptions, label12, timeSlots, toIstIso } from '../../utils/schedule';
import { scrollToTarget } from '../../utils/scroll';
import { sound } from '../../utils/sound';
import { Receipt, ReceiptActions } from '../order/Receipt';
import { Sheet } from '../ui/Sheet';
import { QtyStepper, WhatsAppIcon } from '../ui/Bits';

const PHONE_RE = /^(\+?91[\s-]?|0)?[6-9]\d{4}[\s-]?\d{5}$/;
const PENDING_MAX_AGE = 6 * 3600e3;

function EmptyHandi() {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <svg width="140" height="120" viewBox="0 0 140 120" aria-hidden>
        {[0, 1, 2].map((i) => (
          <motion.path
            key={i}
            d={`M${52 + i * 16} 44 C ${44 + i * 16} 32, ${62 + i * 16} 24, ${54 + i * 16} 10`}
            stroke="#FFF1D2"
            strokeOpacity="0.35"
            strokeWidth="3"
            strokeLinecap="round"
            fill="none"
            animate={{ y: [6, -6], opacity: [0, 0.8, 0] }}
            transition={{ duration: 2.4, repeat: Infinity, delay: i * 0.5 }}
          />
        ))}
        <path d="M28 54 Q70 44 112 54 L108 60 Q70 50 32 60Z" fill="#C9953E" />
        <path d="M32 60 Q70 52 108 60 C118 74 128 86 122 100 C116 114 92 118 70 118 C48 118 24 114 18 100 C12 86 22 74 32 60Z" fill="#3a2414" stroke="#D4AF37" strokeOpacity="0.6" />
      </svg>
      <p className="mt-4 font-display text-2xl text-ivory">Your handi is empty</p>
      <p className="mt-2 max-w-xs text-sm text-ivory/60">Pick a biryani from the royal menu and it will appear here.</p>
    </div>
  );
}

function Lines({ lines }: { lines: ResolvedLine[] }) {
  const setQty = useCart((s) => s.setQty);
  const remove = useCart((s) => s.remove);
  return (
    <ul className="space-y-3" aria-label="Items in your order">
      <AnimatePresence initial={false}>
        {lines.map((l) => (
          <motion.li
            key={l.key}
            layout
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -30, height: 0, marginTop: 0 }}
            className={`flex gap-3 rounded-2xl p-3 ring-1 ${l.available ? 'bg-ivory/[0.03] ring-gold/15' : 'bg-red-500/[0.06] ring-red-400/30'}`}
          >
            {l.image && <img src={asset(l.image)} alt="" className={`h-16 w-16 shrink-0 rounded-xl object-cover ${l.available ? '' : 'opacity-40 grayscale'}`} />}
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium leading-snug text-ivory">{l.name}</p>
                  {l.available ? (
                    <p className="text-xs text-ivory/55">
                      {l.showVariant ? `${l.variantLabel} · ` : ''}
                      <span className="font-num">{formatINR(l.unitPrice)}</span> each
                    </p>
                  ) : (
                    <p className="text-xs text-red-300">{l.unavailableReason} — please remove it to continue.</p>
                  )}
                  {l.note && <p className="mt-1 text-xs italic text-gold/80">“{l.note}”</p>}
                </div>
                <button
                  type="button"
                  onClick={() => remove(l.key)}
                  className="-mr-1 -mt-1 grid h-10 w-10 shrink-0 place-items-center rounded-full text-ivory/50 transition hover:bg-chilli/15 hover:text-red-300"
                  aria-label={`Remove ${l.name}`}
                >
                  <Trash2 size={16} />
                </button>
              </div>
              {l.available && (
                <div className="mt-2 flex items-center justify-between">
                  <QtyStepper value={l.qty} onChange={(v) => setQty(l.key, v)} label={`quantity of ${l.name}`} size="sm" />
                  <motion.span key={l.lineTotal} initial={{ scale: 1.12 }} animate={{ scale: 1 }} className="font-num font-semibold text-gold">
                    {formatINR(l.lineTotal)}
                  </motion.span>
                </div>
              )}
            </div>
          </motion.li>
        ))}
      </AnimatePresence>
    </ul>
  );
}

/** Shown when online ordering cannot be used — clearly an enquiry, never a "placed" order. */
function OfflineOrdering({ lines, reason }: { lines: ResolvedLine[]; reason: string }) {
  const details = useCart((s) => s.details);
  const [copied, setCopied] = useState(false);
  const message = buildOrderMessage(lines.filter((l) => l.available), { ...details, name: details.name || 'Customer' }, subtotalOf(lines));
  return (
    <div className="space-y-3 rounded-2xl bg-ivory/[0.03] p-4 ring-1 ring-gold/20">
      <p className="flex items-start gap-2 text-sm text-ivory/80">
        <AlertTriangle size={18} className="mt-0.5 shrink-0 text-saffron" /> {reason}
      </p>
      <a className="btn btn-gold w-full" href={telUrl}>
        <Phone size={16} /> Call {restaurant.phone.display} to order
      </a>
      <div className="grid grid-cols-2 gap-2">
        <WhatsAppLink className="btn btn-emerald btn-sm" text={message}>
          <WhatsAppIcon /> Enquire on WhatsApp
        </WhatsAppLink>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={async () => {
            setCopied(await copyText(message));
            window.setTimeout(() => setCopied(false), 2500);
          }}
        >
          {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? 'Copied' : 'Copy list'}
        </button>
      </div>
      <p className="text-[11px] text-ivory/45">A WhatsApp message is an enquiry — the order is placed only when the restaurant confirms it.</p>
    </div>
  );
}

export function CartDrawer() {
  const open = useUI((s) => s.cartOpen);
  const setOpen = useUI((s) => s.setCartOpen);
  const showToast = useUI((s) => s.showToast);
  const say = useHost((s) => s.say);
  const rawLines = useCart((s) => s.lines);
  const details = useCart((s) => s.details);
  const setDetails = useCart((s) => s.setDetails);
  const clear = useCart((s) => s.clear);
  const removeKeys = useCart((s) => s.removeKeys);
  const remember = useCart((s) => s.remember);
  const setRemember = useCart((s) => s.setRemember);
  const forgetDetails = useCart((s) => s.forgetDetails);
  const pending = useCart((s) => s.pending);
  const setPending = useCart((s) => s.setPending);
  const addMyOrder = useMyOrders((s) => s.add);
  const version = useStorefront((s) => s.version);
  const settings = useStorefront((s) => s.restaurant);
  const offers = useStorefront((s) => s.offers);
  const skew = useStorefront((s) => s.clockSkewMs);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const lines = useMemo(() => resolveLines(rawLines), [rawLines, version]);
  const orderable = lines.filter((l) => l.available);
  const subtotal = subtotalOf(lines);

  const [step, setStep] = useState<'cart' | 'checkout' | 'done'>('cart');
  const [placed, setPlaced] = useState<{ order: OrderJSON; token: string } | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [tried, setTried] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [couponInput, setCouponInput] = useState(details.coupon);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteState, setQuoteState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [quoteNonce, setQuoteNonce] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<ApiError | null>(null);
  const submittingRef = useRef(false);
  const [queued, setQueued] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  const now = Date.now() + skew;
  const online = canOrderOnline();
  const paused = settings?.online_ordering_enabled === false;
  const asapOk = settings ? asapAvailable(settings, now) : true;
  const dates = settings ? dateOptions(settings, now) : [];
  const slots = settings && details.date ? timeSlots(settings, details.date, now) : [];
  const when = asapOk ? details.when : 'later';
  const scheduledIso = when === 'later' && details.date && details.time ? toIstIso(details.date, details.time) : null;
  const deliveryOn = settings?.delivery_enabled ?? false;
  const pickupOn = settings?.pickup_enabled ?? true;
  const mode = details.mode === 'delivery' && !deliveryOn ? 'pickup' : details.mode === 'pickup' && !pickupOn && deliveryOn ? 'delivery' : details.mode;

  // drop a stale unconfirmed attempt (very old ones can't be meaningfully recovered)
  useEffect(() => {
    if (pending && Date.now() - pending.at > PENDING_MAX_AGE) setPending(null);
  }, [pending, setPending]);

  const items = orderable.map((l) => ({ variant_id: l.variantId, qty: l.qty, expected_price: l.unitPrice, ...(l.note ? { note: l.note } : {}) }));
  const itemsKey = JSON.stringify(items);

  // authoritative amount from the database
  useEffect(() => {
    if ((step !== 'checkout' && step !== 'cart') || !online || paused || !items.length) return;
    let alive = true;
    setQuoteState('loading');
    const t = window.setTimeout(async () => {
      try {
        const q = await quoteOrder({ mode, scheduled_for: scheduledIso, coupon: details.coupon || undefined, phone: details.phone, items, address: details.address });
        if (!alive) return;
        setQuote(q);
        setQuoteState('idle');
        if (q.issues.some((i) => i.code === 'price_changed' || i.code === 'item_unavailable')) void syncMenu();
      } catch {
        if (alive) setQuoteState('error');
      }
    }, 350);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, online, paused, itemsKey, mode, details.coupon, scheduledIso, quoteNonce]);

  const errors = {
    name: details.name.trim().length < 2 ? 'Please enter your name.' : '',
    phone: !PHONE_RE.test(details.phone.trim()) ? 'Enter a valid 10-digit Indian mobile number.' : '',
    address: mode === 'delivery' && details.address.trim().length < 8 ? 'Please enter the full delivery address.' : '',
    date: when === 'later' && !details.date ? 'Choose a date.' : '',
    time: when === 'later' && details.date && !details.time ? 'Choose a time.' : '',
    confirm: !confirmed ? 'Please confirm your order details.' : '',
  };
  const firstError = (Object.keys(errors) as (keyof typeof errors)[]).find((k) => errors[k]);
  const blockingIssues = quote?.issues ?? [];
  const canPlace = !!quote && !quote.blocking && quoteState === 'idle' && !submitting;

  const close = () => {
    setOpen(false);
    if (step === 'done') {
      setStep('cart');
      setPlaced(null);
    }
  };

  const goCheckout = () => {
    setStep('checkout');
    setSubmitError(null);
    bodyRef.current?.scrollTo({ top: 0 });
  };

  const applyCoupon = () => setDetails({ coupon: couponInput.trim().toUpperCase().replace(/[^A-Z0-9]/g, '') });

  const place = async () => {
    setTried(true);
    if (firstError) {
      document.getElementById(`co-${firstError}`)?.focus();
      return;
    }
    if (submittingRef.current) return;
    // the final amount is still being checked — place the order as soon as it is ready
    if (!quote || quoteState === 'loading') {
      setQueued(true);
      return;
    }
    if (quoteState === 'error') {
      setQuoteNonce((n) => n + 1);
      setQueued(true);
      return;
    }
    if (quote.blocking) {
      document.querySelector('[aria-label="Order summary"]')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    setSubmitError(null);
    const keys = orderable.map((l) => l.key);
    // reuse an unconfirmed attempt's keys so a retry can never create a duplicate order
    const attempt = pending ?? { ...newOrderSecrets(), keys, at: Date.now() };
    if (!pending) setPending(attempt);
    try {
      const order = await placeOrder({
        idempotency_key: attempt.idempotency_key,
        access_token: attempt.access_token,
        name: details.name.trim(),
        phone: details.phone.trim(),
        mode,
        address: mode === 'delivery' ? details.address.trim() : undefined,
        scheduled_for: scheduledIso,
        instructions: details.instructions.trim() || undefined,
        coupon: details.coupon || undefined,
        confirm: true,
        items,
      });
      addMyOrder({ id: order.id, token: attempt.access_token, bill: order.bill_number, at: order.created_at });
      removeKeys(order.replayed ? attempt.keys : keys);
      setPending(null);
      setPlaced({ order, token: attempt.access_token });
      setStep('done');
      setConfirmed(false);
      setTried(false);
      setDetails({ instructions: '', coupon: '' });
      setCouponInput('');
      sound.play('chime');
      say('placed');
      showToast(`Order placed · ${order.bill_number}`);
      bodyRef.current?.scrollTo({ top: 0 });
    } catch (e) {
      const err = e instanceof ApiError ? e : new ApiError('network', 'Something went wrong. Please try again.');
      if (!err.uncertain) setPending(null); // the server said no — nothing was stored
      setSubmitError(err);
      if (err.issues.some((i) => i.code === 'price_changed' || i.code === 'item_unavailable')) void syncMenu();
      setQuoteNonce((n) => n + 1);
      window.setTimeout(() => errorRef.current?.focus(), 50);
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  useEffect(() => {
    if (!queued || quoteState === 'loading') return;
    setQueued(false);
    if (quoteState === 'idle' && quote && !quote.blocking) void place();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queued, quoteState, quote]);

  const title = step === 'done' ? 'Order placed' : step === 'checkout' ? 'Checkout' : 'Your Order';
  const showErr = (k: keyof typeof errors) =>
    tried && errors[k] ? <span id={`co-${k}-err`} className="mt-1 block text-xs text-red-300">{errors[k]}</span> : null;

  return (
    <Sheet open={open} onClose={close} label="Your order" width="max-w-[480px]">
      <div className="flex items-center justify-between border-b border-gold/15 px-6 py-5">
        <div className="flex items-center gap-2">
          {step === 'checkout' && (
            <button type="button" onClick={() => setStep('cart')} className="-ml-2 grid h-11 w-11 place-items-center rounded-full hover:bg-ivory/10" aria-label="Back to items">
              <ArrowLeft size={20} />
            </button>
          )}
          <div>
            <p className="t-eyebrow text-gold">Your Dawat</p>
            <h2 className="mt-1 font-display text-2xl text-ivory">{title}</h2>
          </div>
        </div>
        <button type="button" onClick={close} className="grid h-11 w-11 place-items-center rounded-full ring-1 ring-gold/30 transition hover:bg-ivory/10" aria-label="Close order">
          <X size={20} />
        </button>
      </div>

      <div ref={bodyRef} className="flex-1 overflow-y-auto overscroll-contain" data-lenis-prevent>
        {/* ───────── DONE ───────── */}
        {step === 'done' && placed && (
          <div className="space-y-5 px-6 py-6">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center" role="status">
              <CheckCircle2 size={56} className="mx-auto text-emerald-400" aria-hidden />
              <p className="mt-3 font-display text-2xl text-ivory">Thank you, {placed.order.customer_name.split(' ')[0]}!</p>
              <p className="mt-1 text-sm text-ivory/70">
                Your order is saved with the restaurant. Bill number <b className="font-num text-gold">{placed.order.bill_number}</b>.
              </p>
              <p className="mt-2 text-xs text-ivory/55">
                Status: Pending confirmation — {restaurant.name} will confirm it. Payment is made at the restaurant{placed.order.mode === 'delivery' ? ' or on delivery' : ''}; no money has been taken online.
              </p>
            </motion.div>
            <Receipt order={placed.order} />
            <ReceiptActions order={placed.order} trackHref={trackUrl(placed.order.id, placed.token)} onContinue={close} />
          </div>
        )}

        {/* ───────── CART ───────── */}
        {step === 'cart' &&
          (lines.length === 0 ? (
            <>
              <EmptyHandi />
              <div className="px-6 pb-10 text-center">
                <button type="button" className="btn btn-gold" onClick={() => { setOpen(false); scrollToTarget('menu'); }}>
                  Explore the Royal Menu
                </button>
              </div>
            </>
          ) : (
            <div className="space-y-5 px-6 py-5">
              <Lines lines={lines} />
              <div className="flex items-center justify-between text-sm">
                {confirmClear ? (
                  <span className="flex items-center gap-2">
                    Clear all items?
                    <button type="button" className="min-h-[40px] px-2 text-red-300 underline" onClick={() => { clear(); setConfirmClear(false); }}>Yes, clear</button>
                    <button type="button" className="min-h-[40px] px-2 text-ivory/60 underline" onClick={() => setConfirmClear(false)}>Cancel</button>
                  </span>
                ) : (
                  <button type="button" className="min-h-[40px] text-ivory/50 underline-offset-4 hover:text-ivory hover:underline" onClick={() => setConfirmClear(true)}>
                    Clear order
                  </button>
                )}
              </div>
              {offers.length > 0 && (
                <div className="rounded-2xl bg-gold/[0.06] p-3 text-xs text-ivory/75 ring-1 ring-gold/25">
                  <p className="mb-1 flex items-center gap-1.5 font-semibold text-gold"><Tag size={14} /> Offers</p>
                  <ul className="space-y-1">
                    {offers.slice(0, 3).map((o) => (
                      <li key={o.id}>
                        {o.title} — {offerLabel(o)}
                        {o.code ? <> with code <b className="font-num text-gold">{o.code}</b></> : ' (applied automatically when eligible)'}
                        {o.min_order > 0 ? ` · min ${formatINR(o.min_order)}` : ''}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {(!online || paused) && (
                <OfflineOrdering
                  lines={lines}
                  reason={paused ? 'Online ordering is paused by the restaurant right now.' : 'Online ordering is not connected right now (check your internet).'}
                />
              )}
            </div>
          ))}

        {/* ───────── CHECKOUT ───────── */}
        {step === 'checkout' && (
          <form
            className="space-y-5 px-6 py-5"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void place();
            }}
          >
            {pending && !submitError && (
              <p role="status" className="rounded-xl bg-saffron/10 p-3 text-xs text-ivory/80 ring-1 ring-saffron/30">
                An earlier order attempt from this device was not confirmed. Placing the order now checks it first — it will not create a duplicate.
              </p>
            )}
            {settings?.order_notice && <p className="rounded-xl bg-ivory/[0.04] p-3 text-xs text-ivory/75 ring-1 ring-gold/20">{settings.order_notice}</p>}

            <fieldset className="space-y-4">
              <legend className="t-eyebrow mb-3 text-gold">Your details</legend>
              <label className="block">
                <span className="field-label">Full name *</span>
                <input id="co-name" className="field" value={details.name} onChange={(e) => setDetails({ name: e.target.value.slice(0, 80) })} autoComplete="name" aria-invalid={tried && !!errors.name} aria-describedby="co-name-err" />
                {showErr('name')}
              </label>
              <label className="block">
                <span className="field-label">Mobile number *</span>
                <input id="co-phone" className="field font-num" inputMode="tel" value={details.phone} onChange={(e) => setDetails({ phone: e.target.value.replace(/[^\d+\s-]/g, '').slice(0, 16) })} autoComplete="tel" placeholder="98xxxxxxxx" aria-invalid={tried && !!errors.phone} aria-describedby="co-phone-err" />
                {showErr('phone')}
              </label>
            </fieldset>

            <fieldset className="space-y-3">
              <legend className="t-eyebrow mb-3 text-gold">Pickup or delivery</legend>
              <div className="grid grid-cols-2 gap-2">
                {(['pickup', 'delivery'] as const).map((m) => {
                  const disabled = m === 'delivery' ? !deliveryOn : !pickupOn;
                  return (
                    <label key={m} className="relative">
                      <input type="radio" name="mode" className="peer sr-only" checked={mode === m} disabled={disabled} onChange={() => setDetails({ mode: m })} />
                      <span className="flex min-h-[48px] cursor-pointer flex-col items-center justify-center rounded-2xl px-2 text-center text-sm ring-1 ring-gold/25 transition peer-checked:bg-gold/15 peer-checked:ring-gold peer-focus-visible:ring-2 peer-focus-visible:ring-saffron peer-disabled:cursor-not-allowed peer-disabled:opacity-45">
                        {m === 'pickup' ? 'Pickup' : 'Delivery'}
                        {disabled && <span className="text-[10px] text-ivory/50">Not available now</span>}
                        {m === 'delivery' && !disabled && settings && (
                          <span className="text-[10px] text-ivory/55">
                            {settings.delivery_charge > 0 ? `${formatINR(settings.delivery_charge)} charge` : 'No delivery charge'}
                            {settings.free_delivery_above != null ? ` · free above ${formatINR(settings.free_delivery_above)}` : ''}
                          </span>
                        )}
                      </span>
                    </label>
                  );
                })}
              </div>
              {mode === 'delivery' && (
                <label className="block">
                  <span className="field-label">Delivery address *</span>
                  <textarea id="co-address" className="field resize-none" rows={2} value={details.address} onChange={(e) => setDetails({ address: e.target.value.slice(0, 300) })} autoComplete="street-address" placeholder="House / building, street, landmark" aria-invalid={tried && !!errors.address} aria-describedby="co-address-err" />
                  {showErr('address')}
                  {settings?.delivery_area_note && <span className="mt-1 block text-[11px] text-ivory/50">{settings.delivery_area_note}</span>}
                </label>
              )}
            </fieldset>

            <fieldset className="space-y-3">
              <legend className="t-eyebrow mb-3 text-gold">When</legend>
              <div className="grid grid-cols-2 gap-2">
                {(['asap', 'later'] as const).map((w) => (
                  <label key={w} className="relative">
                    <input type="radio" name="when" className="peer sr-only" checked={when === w} disabled={w === 'asap' && !asapOk} onChange={() => setDetails({ when: w })} />
                    <span className="flex min-h-[48px] cursor-pointer flex-col items-center justify-center rounded-2xl px-2 text-center text-sm ring-1 ring-gold/25 transition peer-checked:bg-gold/15 peer-checked:ring-gold peer-focus-visible:ring-2 peer-focus-visible:ring-saffron peer-disabled:cursor-not-allowed peer-disabled:opacity-45">
                      {w === 'asap' ? 'As soon as possible' : 'Schedule for later'}
                      {w === 'asap' && !asapOk && <span className="text-[10px] text-ivory/50">Closed right now</span>}
                    </span>
                  </label>
                ))}
              </div>
              {when === 'later' && (
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="field-label">Date *</span>
                    <select id="co-date" className="field" value={details.date} onChange={(e) => setDetails({ date: e.target.value, time: '' })} aria-invalid={tried && !!errors.date} aria-describedby="co-date-err">
                      <option value="">Choose…</option>
                      {dates.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                    </select>
                    {showErr('date')}
                  </label>
                  <label className="block">
                    <span className="field-label">Time *</span>
                    <select id="co-time" className="field" value={details.time} disabled={!details.date} onChange={(e) => setDetails({ time: e.target.value })} aria-invalid={tried && !!errors.time} aria-describedby="co-time-err">
                      <option value="">Choose…</option>
                      {slots.map((t) => <option key={t} value={t}>{label12(t)}</option>)}
                    </select>
                    {showErr('time')}
                  </label>
                </div>
              )}
              {settings && <p className="text-[11px] text-ivory/50">Open {label12(settings.opens_at)} – {label12(settings.closes_at)} (India time).</p>}
            </fieldset>

            <label className="block">
              <span className="field-label">Special instructions (optional)</span>
              <textarea className="field resize-none" rows={2} value={details.instructions} onChange={(e) => setDetails({ instructions: e.target.value.slice(0, 500) })} placeholder="Spice preference, cutlery, landmark…" />
            </label>

            <div>
              <span className="field-label">Coupon code (optional)</span>
              <div className="flex gap-2">
                <input className="field font-num uppercase" value={couponInput} onChange={(e) => setCouponInput(e.target.value.slice(0, 20))} placeholder="e.g. DAWAT10" aria-label="Coupon code" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); applyCoupon(); } }} />
                {details.coupon ? (
                  <button type="button" className="btn btn-ghost btn-sm shrink-0" onClick={() => { setDetails({ coupon: '' }); setCouponInput(''); }}>Remove</button>
                ) : (
                  <button type="button" className="btn btn-ghost btn-sm shrink-0" onClick={applyCoupon} disabled={!couponInput.trim()}>Apply</button>
                )}
              </div>
            </div>

            {/* summary — always from the database */}
            <section aria-label="Order summary" aria-busy={quoteState === 'loading'} className="space-y-2 rounded-2xl bg-ivory/[0.03] p-4 text-sm ring-1 ring-gold/20">
              <p className="t-eyebrow text-gold">Order summary</p>
              <ul className="space-y-1 text-ivory/80">
                {orderable.map((l) => (
                  <li key={l.key} className="flex justify-between gap-3">
                    <span>{l.qty} × {l.name}{l.showVariant ? ` (${l.variantLabel})` : ''}</span>
                    <span className="font-num">{formatINR(l.lineTotal)}</span>
                  </li>
                ))}
              </ul>
              {quoteState === 'loading' && !quote && <div className="h-16 animate-pulse rounded-xl bg-ivory/5" />}
              {quoteState === 'error' && (
                <p className="text-xs text-red-300">
                  Could not check the final amount. <button type="button" className="underline" onClick={() => setQuoteNonce((n) => n + 1)}>Try again</button>
                </p>
              )}
              {quote && (
                <dl className={`space-y-1 border-t border-gold/15 pt-2 transition ${quoteState === 'loading' ? 'opacity-50' : ''}`}>
                  <div className="flex justify-between"><dt>Subtotal</dt><dd className="font-num">{formatINR(quote.subtotal)}</dd></div>
                  {quote.discount > 0 && (
                    <div className="flex justify-between text-emerald-300"><dt>Discount{quote.offer ? ` · ${quote.offer.title}` : ''}</dt><dd className="font-num">− {formatINR(quote.discount)}</dd></div>
                  )}
                  {mode === 'delivery' && <div className="flex justify-between"><dt>Delivery</dt><dd className="font-num">{quote.delivery_charge > 0 ? formatINR(quote.delivery_charge) : 'Free'}</dd></div>}
                  {quote.tax > 0 && <div className="flex justify-between"><dt>{quote.tax_label ?? 'Tax'}</dt><dd className="font-num">{formatINR(quote.tax)}</dd></div>}
                  <div className="flex items-baseline justify-between border-t border-gold/15 pt-2 text-base font-semibold text-ivory">
                    <dt>Total to pay</dt>
                    <motion.dd key={quote.total} initial={{ scale: 1.12 }} animate={{ scale: 1 }} className="font-num text-2xl text-gold">{formatINR(quote.total)}</motion.dd>
                  </div>
                  <p className="text-[11px] text-ivory/50">Pay at the restaurant{mode === 'delivery' ? ' or on delivery' : ''}. No online payment is taken.</p>
                </dl>
              )}
              {blockingIssues.length > 0 && (
                <ul className="space-y-1 pt-1" aria-live="polite">
                  {blockingIssues.map((i, n) => (
                    <li key={n} className="flex gap-2 text-xs text-red-300"><AlertTriangle size={14} className="mt-0.5 shrink-0" /> {i.message}</li>
                  ))}
                </ul>
              )}
            </section>

            <div className="space-y-3 text-xs text-ivory/70">
              <label className="flex cursor-pointer items-start gap-3">
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-[#D4AF37]" />
                <span>Remember my name, number and address on this device for next time.</span>
              </label>
              {remember && (
                <button type="button" className="ml-8 underline" onClick={() => { forgetDetails(); showToast('Saved details removed from this device.'); }}>
                  Forget my saved details
                </button>
              )}
              <label className="flex cursor-pointer items-start gap-3">
                <input id="co-confirm" type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-[#D4AF37]" aria-invalid={tried && !!errors.confirm} aria-describedby="co-confirm-err" />
                <span>I confirm my order details are correct. {restaurant.name} may call me on this number about the order.</span>
              </label>
              {showErr('confirm')}
              <p className="text-[11px] text-ivory/45">
                Privacy: your details are used only to prepare and hand over this order, and are visible only to the restaurant. <a href="#privacy" className="underline" onClick={() => setOpen(false)}>Privacy notice</a>
              </p>
            </div>

            {submitError && (
              <div ref={errorRef} tabIndex={-1} role="alert" className="rounded-2xl bg-red-500/10 p-4 text-sm text-red-100 ring-1 ring-red-400/40">
                <p className="font-semibold">{submitError.uncertain ? 'We could not confirm your order' : 'The order was not placed'}</p>
                <p className="mt-1 text-red-100/85">
                  {submitError.uncertain
                    ? `${submitError.message} Your order may or may not have reached the restaurant. Tap “Check & retry” — it uses the same request, so it cannot create a duplicate.`
                    : submitError.issues.length > 1
                      ? submitError.issues.map((i) => i.message).join(' ')
                      : submitError.message}
                </p>
                <p className="mt-2 text-xs text-red-100/70">Your items and details are kept. You can also call {restaurant.phone.display}.</p>
              </div>
            )}
          </form>
        )}
      </div>

      {/* footer actions */}
      {step === 'cart' && lines.length > 0 && online && !paused && (
        <div className="border-t border-gold/15 bg-smoke/60 px-6 pb-6 pt-4 backdrop-blur">
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-ivory/70">Items subtotal</span>
            <motion.span key={subtotal} initial={{ scale: 1.15, color: '#F59E0B' }} animate={{ scale: 1, color: '#D4AF37' }} className="font-num text-2xl font-bold">{formatINR(subtotal)}</motion.span>
          </div>
          <div className="mt-3">
            <label className="field-label" htmlFor="cart-coupon">Have a coupon code?</label>
            <div className="flex gap-2">
              <input id="cart-coupon" className="field font-num uppercase" value={couponInput} onChange={(e) => setCouponInput(e.target.value.slice(0, 20))} placeholder="e.g. DAWAT10" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); applyCoupon(); } }} />
              {details.coupon ? (
                <button type="button" className="btn btn-ghost btn-sm shrink-0" onClick={() => { setDetails({ coupon: '' }); setCouponInput(''); }}>Remove</button>
              ) : (
                <button type="button" className="btn btn-ghost btn-sm shrink-0" onClick={applyCoupon} disabled={!couponInput.trim()}>Apply</button>
              )}
            </div>
            <div aria-live="polite" className="mt-1 min-h-[1.1rem] text-xs">
              {details.coupon && quoteState === 'loading' && <span className="text-ivory/60">Checking {details.coupon}…</span>}
              {details.coupon && quoteState !== 'loading' && quote && (
                quote.offer?.code === details.coupon && quote.discount > 0
                  ? <span className="text-emerald-300" data-testid="cart-coupon-ok">✓ {details.coupon} applied — you save {formatINR(quote.discount)}</span>
                  : <span className="text-red-300" data-testid="cart-coupon-err">{quote.issues.find((i) => i.code === 'coupon_invalid')?.message ?? `${details.coupon} can’t be used on this order${quote.discount > 0 ? ' — a better offer is already applied' : ''}.`}</span>
              )}
            </div>
          </div>
          {quote && quote.discount > 0 && (
            <div className="mt-1 flex items-baseline justify-between text-sm"><span className="text-ivory/70">Estimated total after discount</span><span className="font-num text-gold">{formatINR(quote.subtotal - quote.discount)}</span></div>
          )}
          <p className="mt-1 text-xs text-ivory/50">Delivery and the final total are confirmed at checkout.</p>
          <button type="button" className="btn btn-gold mt-4 w-full" onClick={goCheckout} disabled={!orderable.length || orderable.length !== lines.length}>
            Continue to checkout
          </button>
          {orderable.length !== lines.length && <p className="mt-2 text-center text-xs text-red-300">Remove unavailable items to continue.</p>}
        </div>
      )}
      {step === 'checkout' && (
        <div className="border-t border-gold/15 bg-smoke/60 px-6 pb-6 pt-4 backdrop-blur">
          <button type="button" className="btn btn-gold w-full" onClick={() => void place()} disabled={submitting || queued} aria-busy={submitting || queued} aria-disabled={!canPlace}>
            {submitting || queued ? (
              <><Loader2 size={18} className="animate-spin" /> {queued ? 'Checking final amount…' : 'Placing order…'}</>
            ) : submitError?.uncertain ? (
              'Check & retry'
            ) : (
              <>Place order{quote && !quote.blocking ? ` · ${formatINR(quote.total)}` : ''}</>
            )}
          </button>
          {!canPlace && !submitting && quote?.blocking && <p className="mt-2 text-center text-xs text-red-300">Fix the highlighted issue above to place your order.</p>}
          {quoteState === 'loading' && !submitting && <p className="mt-2 text-center text-xs text-ivory/50">Checking prices and offers…</p>}
        </div>
      )}
    </Sheet>
  );
}
