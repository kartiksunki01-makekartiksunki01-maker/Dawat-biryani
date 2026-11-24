import { AnimatePresence, motion } from 'framer-motion';
import { Check, Copy, Phone, Trash2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { restaurant } from '../../data/restaurant';
import { useMenuVersion } from '../../data/menuSync';
import { saveLead } from '../../lib/leads';
import { resolveLines, subtotalOf, useCart } from '../../stores/cartStore';
import { useHost } from '../../stores/hostStore';
import { useUI } from '../../stores/uiStore';
import { asset, formatINR } from '../../utils/format';
import { buildOrderMessage, copyText, telUrl, whatsappUrl } from '../../utils/order';
import { scrollToTarget } from '../../utils/scroll';
import { sound } from '../../utils/sound';
import { Sheet } from '../ui/Sheet';
import { QtyStepper, WhatsAppIcon } from '../ui/Bits';

const PHONE_RE = /^(\+91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}$/;
const todayISO = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

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

export function CartDrawer() {
  const open = useUI((s) => s.cartOpen);
  const setOpen = useUI((s) => s.setCartOpen);
  const showToast = useUI((s) => s.showToast);
  const say = useHost((s) => s.say);
  const rawLines = useCart((s) => s.lines);
  const details = useCart((s) => s.details);
  const setDetails = useCart((s) => s.setDetails);
  const setQty = useCart((s) => s.setQty);
  const remove = useCart((s) => s.remove);
  const clear = useCart((s) => s.clear);
  const menuVersion = useMenuVersion((s) => s.version);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const lines = useMemo(() => resolveLines(rawLines), [rawLines, menuVersion]);
  const subtotal = subtotalOf(lines);
  const [consent, setConsent] = useState(false);
  const [tried, setTried] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  const errors = {
    name: details.name.trim().length < 2 ? 'Please enter your name.' : '',
    phone: details.phone.trim() && !PHONE_RE.test(details.phone.trim()) ? 'Enter a valid 10-digit Indian mobile number.' : '',
    date: details.date && details.date < todayISO() ? 'Please choose today or a later date.' : '',
    consent: !consent ? 'Please confirm to continue.' : '',
  };
  const valid = !errors.name && !errors.phone && !errors.date;
  const message = buildOrderMessage(lines, details, subtotal);

  const send = () => {
    setTried(true);
    if (!valid || errors.consent || !lines.length) return;
    saveLead({
      kind: 'cart',
      name: details.name,
      phone: details.phone,
      message,
      payload: {
        subtotal,
        mode: details.mode,
        date: details.date,
        time: details.time,
        items: lines.map((l) => ({ name: l.name, variant: l.variantLabel, qty: l.qty, unitPrice: l.unitPrice })),
      },
    });
    window.open(whatsappUrl(message), '_blank', 'noopener,noreferrer');
    sound.play('chime');
    say('sent');
    showToast('Opening WhatsApp with your order enquiry…');
  };

  const copy = async () => {
    setTried(true);
    if (!valid || !lines.length) return;
    const ok = await copyText(message);
    setCopied(ok);
    showToast(ok ? 'Order enquiry copied — paste it in a message to the restaurant.' : 'Could not copy — please select the text manually.');
    window.setTimeout(() => setCopied(false), 2500);
  };

  return (
    <Sheet open={open} onClose={() => setOpen(false)} label="Your order" width="max-w-[460px]">
      <div className="flex items-center justify-between border-b border-gold/15 px-6 py-5">
        <div>
          <p className="t-eyebrow text-gold">Your Dawat</p>
          <h2 className="mt-1 font-display text-2xl text-ivory">Order Enquiry</h2>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="grid h-11 w-11 place-items-center rounded-full ring-1 ring-gold/30 transition hover:bg-ivory/10"
          aria-label="Close order"
        >
          <X size={20} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain" data-lenis-prevent>
        {lines.length === 0 ? (
          <>
            <EmptyHandi />
            <div className="px-6 pb-10 text-center">
              <button
                type="button"
                className="btn btn-gold"
                onClick={() => {
                  setOpen(false);
                  scrollToTarget('menu');
                }}
              >
                Explore the Royal Menu
              </button>
            </div>
          </>
        ) : (
          <div className="space-y-6 px-6 py-5">
            <ul className="space-y-3" aria-label="Items in your order">
              <AnimatePresence initial={false}>
                {lines.map((l) => (
                  <motion.li
                    key={l.key}
                    layout
                    initial={{ opacity: 0, x: 30 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -30, height: 0, marginTop: 0 }}
                    className="flex gap-3 rounded-2xl bg-ivory/[0.03] p-3 ring-1 ring-gold/15"
                  >
                    {l.image && <img src={asset(l.image)} alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover" />}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-medium leading-snug text-ivory">{l.name}</p>
                          <p className="text-xs text-ivory/55">
                            {l.showVariant ? `${l.variantLabel} · ` : ''}
                            <span className="font-num">{formatINR(l.unitPrice)}</span> each
                          </p>
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
                      <div className="mt-2 flex items-center justify-between">
                        <QtyStepper value={l.qty} onChange={(v) => setQty(l.key, v)} label={`quantity of ${l.name}`} size="sm" />
                        <span className="font-num font-semibold text-gold">{formatINR(l.lineTotal)}</span>
                      </div>
                    </div>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>

            <div className="flex items-center justify-between text-sm">
              {confirmClear ? (
                <span className="flex items-center gap-2">
                  Clear all items?
                  <button type="button" className="min-h-[40px] px-2 text-red-300 underline" onClick={() => { clear(); setConfirmClear(false); }}>
                    Yes, clear
                  </button>
                  <button type="button" className="min-h-[40px] px-2 text-ivory/60 underline" onClick={() => setConfirmClear(false)}>
                    Cancel
                  </button>
                </span>
              ) : (
                <button type="button" className="min-h-[40px] text-ivory/50 underline-offset-4 hover:text-ivory hover:underline" onClick={() => setConfirmClear(true)}>
                  Clear order
                </button>
              )}
            </div>

            <fieldset className="space-y-4">
              <legend className="t-eyebrow mb-3 text-gold">Your details</legend>
              <label className="block">
                <span className="field-label">Name *</span>
                <input
                  className="field"
                  value={details.name}
                  onChange={(e) => setDetails({ name: e.target.value.slice(0, 60) })}
                  autoComplete="name"
                  aria-invalid={tried && !!errors.name}
                  aria-describedby="err-name"
                />
                {tried && errors.name && <span id="err-name" className="mt-1 block text-xs text-red-300">{errors.name}</span>}
              </label>
              <label className="block">
                <span className="field-label">Mobile number (optional)</span>
                <input
                  className="field font-num"
                  inputMode="tel"
                  value={details.phone}
                  onChange={(e) => setDetails({ phone: e.target.value.replace(/[^\d+\s-]/g, '').slice(0, 16) })}
                  autoComplete="tel"
                  placeholder="98xxxxxxxx"
                  aria-invalid={tried && !!errors.phone}
                />
                {tried && errors.phone && <span className="mt-1 block text-xs text-red-300">{errors.phone}</span>}
              </label>
              <div role="radiogroup" aria-label="Pickup or delivery" className="grid grid-cols-2 gap-2">
                {(['pickup', 'delivery'] as const).map((m) => (
                  <label key={m} className="relative">
                    <input type="radio" name="mode" className="peer sr-only" checked={details.mode === m} onChange={() => setDetails({ mode: m })} />
                    <span className="flex min-h-[48px] cursor-pointer items-center justify-center rounded-2xl text-sm ring-1 ring-gold/25 transition peer-checked:bg-gold/15 peer-checked:ring-gold peer-focus-visible:ring-2 peer-focus-visible:ring-saffron">
                      {m === 'pickup' ? 'Pickup' : 'Delivery (if available)'}
                    </span>
                  </label>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="field-label">Preferred date</span>
                  <input type="date" className="field" min={todayISO()} value={details.date} onChange={(e) => setDetails({ date: e.target.value })} aria-invalid={tried && !!errors.date} />
                </label>
                <label className="block">
                  <span className="field-label">Preferred time</span>
                  <input type="time" className="field" min="10:00" max="22:00" value={details.time} onChange={(e) => setDetails({ time: e.target.value })} />
                </label>
              </div>
              {tried && errors.date && <span className="block text-xs text-red-300">{errors.date}</span>}
              <label className="block">
                <span className="field-label">Additional instructions</span>
                <textarea
                  className="field resize-none"
                  rows={3}
                  value={details.instructions}
                  onChange={(e) => setDetails({ instructions: e.target.value.slice(0, 300) })}
                  placeholder="Landmark, spice preference, cutlery…"
                />
              </label>
            </fieldset>
          </div>
        )}
      </div>

      {lines.length > 0 && (
        <div className="border-t border-gold/15 bg-smoke/60 px-6 pb-6 pt-4 backdrop-blur">
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-ivory/70">Estimated subtotal</span>
            <motion.span key={subtotal} initial={{ scale: 1.15, color: '#F59E0B' }} animate={{ scale: 1, color: '#D4AF37' }} className="font-num text-2xl font-bold">
              {formatINR(subtotal)}
            </motion.span>
          </div>
          <p className="mt-1 text-xs text-ivory/50">
            This is an enquiry, not a confirmed order. {restaurant.name} will confirm availability and the final price. No delivery charges, taxes or discounts are calculated here.
          </p>
          <label className="mt-3 flex cursor-pointer items-start gap-3 text-xs text-ivory/70">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-[#D4AF37]" />
            <span>I agree to share these details with {restaurant.name} on WhatsApp so they can respond to my enquiry.</span>
          </label>
          {tried && errors.consent && <span className="mt-1 block text-xs text-red-300">{errors.consent}</span>}
          <div className="mt-4 grid gap-2">
            <button type="button" className="btn btn-emerald w-full" onClick={send}>
              <WhatsAppIcon /> Send enquiry on WhatsApp
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" className="btn btn-ghost btn-sm" onClick={copy}>
                {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? 'Copied' : 'Copy order'}
              </button>
              <a className="btn btn-ghost btn-sm" href={telUrl}>
                <Phone size={16} /> Call to order
              </a>
            </div>
            {!restaurant.whatsapp.confirmed && (
              <p className="text-center text-[11px] text-ivory/45">
                If WhatsApp doesn’t reach the restaurant, call {restaurant.phone.display} or paste the copied order in an SMS.
              </p>
            )}
          </div>
        </div>
      )}
    </Sheet>
  );
}
