import { motion } from 'framer-motion';
import { CalendarClock, Clock3, Copy, Flame, Phone, Scale } from 'lucide-react';
import { lazy, Suspense, useEffect, useMemo, useState, type FormEvent } from 'react';
import { menu, restaurant } from '../../data/restaurant';
import { useMenuVersion } from '../../data/menuSync';
import { saveLead } from '../../lib/leads';
import { useHost } from '../../stores/hostStore';
import { useUI } from '../../stores/uiStore';
import { hasWebGL } from '../../utils/device';
import { buildBulkMessage, copyText, telUrl, whatsappUrl, type BulkEnquiry } from '../../utils/order';
import { sound } from '../../utils/sound';
import { useInView, useReducedMotion } from '../../hooks/useMedia';
import { Reveal } from '../motion/Motion';
import { SectionHeading, WhatsAppIcon } from '../ui/Bits';
import { HotBox } from './HotBox';

const BulkHandi3D = lazy(() => import('./BulkHandi3D'));

const PHONE_RE = /^(\+91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}$/;
const { minKg, maxKg, anytimeUpToKg, advanceNoticeHours, advertisedFor } = restaurant.bulk;

const getVarieties = () => [
  `${advertisedFor} (advertised 1–20 kg)`,
  ...menu
    .filter((m) => m.status === 'available' && m.name.toLowerCase().includes('biryani') && !m.name.includes('Paneer'))
    .map((m) => `${m.name} (availability to be confirmed)`),
  'Mixed / not sure yet',
];

const todayISO = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

function HandiFallback({ kg }: { kg: number }) {
  const s = 0.55 + 0.55 * Math.pow((kg - 1) / 19, 0.6);
  return (
    <svg viewBox="0 0 240 200" className="h-full w-full" aria-hidden>
      <g style={{ transform: `scale(${s})`, transformOrigin: '120px 190px', transition: 'transform 0.5s cubic-bezier(.22,1,.36,1)' }}>
        <path d="M58 92 Q120 70 182 92 L176 98 Q120 80 64 98Z" fill="#c9953e" />
        <path d="M66 98 Q120 84 174 98 C186 118 206 136 196 164 C186 190 150 200 120 200 C90 200 54 190 44 164 C34 136 54 118 66 98Z" fill="#8a5d22" stroke="#D4AF37" />
      </g>
    </svg>
  );
}

export function BulkOrders() {
  const menuVersion = useMenuVersion((s) => s.version);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const varieties = useMemo(() => getVarieties(), [menuVersion]);
  const [ref, seen] = useInView<HTMLElement>({ threshold: 0.2 });
  const [canvasRef, canvasVisible] = useInView<HTMLDivElement>({ once: false, rootMargin: '100px' });
  const reduced = useReducedMotion();
  const say = useHost((s) => s.say);
  const showToast = useUI((s) => s.showToast);
  const [webgl] = useState(() => hasWebGL());
  const [canvasMounted, setCanvasMounted] = useState(false);
  const [form, setForm] = useState<BulkEnquiry>({
    kg: 5,
    variety: getVarieties()[0],
    eventType: restaurant.bulk.eventTypes[0],
    date: '',
    time: '',
    name: '',
    phone: '',
    mode: 'pickup',
    instructions: '',
  });
  const [consent, setConsent] = useState(false);
  const [tried, setTried] = useState(false);
  const set = (patch: Partial<BulkEnquiry>) => setForm((f) => ({ ...f, ...patch }));

  useEffect(() => {
    if (seen) say('bulk', { once: true });
  }, [seen, say]);
  useEffect(() => {
    if (canvasVisible) setCanvasMounted(true);
  }, [canvasVisible]);

  const needsNotice = form.kg > anytimeUpToKg;
  const noticeWarning = useMemo(() => {
    if (!needsNotice || !form.date || !form.time) return '';
    const when = new Date(`${form.date}T${form.time}`);
    const hours = (when.getTime() - Date.now()) / 36e5;
    return hours < advanceNoticeHours
      ? `For ${form.kg} kg, please choose a time at least ${advanceNoticeHours} hours from now.`
      : '';
  }, [needsNotice, form.date, form.time, form.kg]);

  const errors = {
    name: form.name.trim().length < 2 ? 'Please enter your name.' : '',
    phone: !PHONE_RE.test(form.phone.trim()) ? 'Enter a valid 10-digit Indian mobile number.' : '',
    date: !form.date ? 'Choose a date.' : form.date < todayISO() ? 'Choose today or a later date.' : '',
    time: !form.time ? 'Choose a time.' : '',
    consent: consent ? '' : 'Please confirm to continue.',
  };
  const valid = Object.values(errors).every((e) => !e) && !noticeWarning;
  const message = buildBulkMessage(form);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (!valid) return;
    saveLead({
      kind: 'bulk',
      name: form.name,
      phone: form.phone,
      message,
      payload: { kg: form.kg, variety: form.variety, eventType: form.eventType, date: form.date, time: form.time, mode: form.mode },
    });
    window.open(whatsappUrl(message), '_blank', 'noopener,noreferrer');
    sound.play('chime');
    say('sent');
    showToast('Opening WhatsApp with your bulk-order enquiry…');
  };

  const copy = async () => {
    setTried(true);
    if (errors.name || errors.phone || errors.date || errors.time || noticeWarning) return;
    const ok = await copyText(message);
    showToast(ok ? 'Bulk enquiry copied.' : 'Could not copy — please try again.');
  };

  const fill = ((form.kg - minKg) / (maxKg - minKg)) * 100;

  return (
    <section id="bulk-orders" ref={ref} className="relative scroll-mt-24 overflow-hidden bg-smoke py-28 sm:py-36" aria-labelledby="bulk-title">
      <div className="pointer-events-none absolute left-1/2 top-1/3 h-[600px] w-[900px] -translate-x-1/2 rounded-full bg-saffron/10 blur-[140px]" aria-hidden />
      <div className="relative mx-auto max-w-[1400px] px-5 sm:px-8 lg:px-14">
        <div id="bulk-title">
          <SectionHeading
            eyebrow="Bulk Orders"
            title="Feasts for Every"
            accent="Celebration."
            intro={`Family functions, parties and gatherings — tell us how many kilograms you need and we’ll prepare a custom quotation.`}
          />
        </div>

        <div className="mt-14 grid gap-10 lg:grid-cols-[1fr_1.05fr] lg:gap-14">
          {/* Visual + rules */}
          <div>
            <div ref={canvasRef} className="relative aspect-[5/4] overflow-hidden rounded-[2rem] bg-gradient-to-b from-[#1d130d] to-smoke ring-1 ring-gold/20">
              <div className="absolute inset-0 bg-[radial-gradient(50%_40%_at_50%_70%,rgba(245,158,11,0.25),transparent)]" aria-hidden />
              {webgl ? (
                <Suspense fallback={null}>{canvasMounted && <BulkHandi3D kg={form.kg} active={canvasVisible} reduced={reduced} />}</Suspense>
              ) : (
                <HandiFallback kg={form.kg} />
              )}
              <div className="pointer-events-none absolute left-6 top-5">
                <motion.p key={form.kg} initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="font-num text-6xl font-bold text-ivory sm:text-7xl">
                  {form.kg}
                  <span className="ml-1 text-2xl text-gold">kg</span>
                </motion.p>
                <p className="mt-1 text-xs uppercase tracking-[0.2em] text-ivory/50">your handi grows with your order</p>
              </div>
            </div>

            <ul className="mt-6 grid gap-3 sm:grid-cols-2">
              <li className={`rounded-2xl p-4 ring-1 transition ${!needsNotice ? 'bg-emerald/40 ring-gold/50' : 'bg-ivory/[0.03] ring-gold/15'}`}>
                <p className="flex items-center gap-2 font-medium text-ivory">
                  <Clock3 size={16} className="text-gold" aria-hidden /> {minKg}–{anytimeUpToKg} kg
                </p>
                <p className="mt-1 text-sm text-ivory/65">Advertised as available anytime during business hours, subject to availability.</p>
              </li>
              <li className={`rounded-2xl p-4 ring-1 transition ${needsNotice ? 'bg-maroon/50 ring-gold/50' : 'bg-ivory/[0.03] ring-gold/15'}`}>
                <p className="flex items-center gap-2 font-medium text-ivory">
                  <CalendarClock size={16} className="text-gold" aria-hidden /> {anytimeUpToKg + 1}–{maxKg} kg
                </p>
                <p className="mt-1 text-sm text-ivory/65">Please give at least {advanceNoticeHours} hours’ advance notice.</p>
              </li>
            </ul>
            <p className="mt-4 text-xs leading-relaxed text-ivory/50">
              Bulk orders of {advertisedFor} from {minKg} kg to {maxKg} kg are advertised on the restaurant’s poster. Other varieties and
              per-kg prices are confirmed by the restaurant with your quotation.
            </p>
          </div>

          {/* Form */}
          <Reveal>
            <form onSubmit={submit} noValidate className="glass rounded-[2rem] p-6 sm:p-8" aria-label="Bulk order enquiry">
              <fieldset>
                <legend className="flex items-center gap-2 font-display text-2xl text-ivory">
                  <Scale size={20} className="text-gold" aria-hidden /> Quantity
                </legend>
                <div className="mt-4 flex items-center gap-4">
                  <input
                    type="range"
                    min={minKg}
                    max={maxKg}
                    step={1}
                    value={form.kg}
                    onChange={(e) => set({ kg: Number(e.target.value) })}
                    className="gold-range flex-1"
                    style={{ ['--fill' as string]: `${fill}%` }}
                    aria-label="Quantity in kilograms"
                    aria-valuetext={`${form.kg} kilograms`}
                  />
                  <label className="flex items-center gap-2">
                    <span className="sr-only">Kilograms</span>
                    <input
                      type="number"
                      min={minKg}
                      max={maxKg}
                      value={form.kg}
                      onChange={(e) => {
                        const v = Math.round(Number(e.target.value));
                        if (!Number.isNaN(v)) set({ kg: Math.min(maxKg, Math.max(minKg, v)) });
                      }}
                      className="field w-20 text-center font-num"
                    />
                    <span className="text-sm text-ivory/60">kg</span>
                  </label>
                </div>
              </fieldset>

              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <label className="block sm:col-span-2">
                  <span className="field-label">Food variety</span>
                  <select className="field" value={form.variety} onChange={(e) => set({ variety: e.target.value })}>
                    {varieties.map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="field-label">Event type</span>
                  <select className="field" value={form.eventType} onChange={(e) => set({ eventType: e.target.value })}>
                    {restaurant.bulk.eventTypes.map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </label>
                <div role="radiogroup" aria-label="Pickup or delivery" className="grid grid-cols-2 gap-2 self-end">
                  {(['pickup', 'delivery'] as const).map((m) => (
                    <label key={m} className="relative">
                      <input type="radio" name="bulk-mode" className="peer sr-only" checked={form.mode === m} onChange={() => set({ mode: m })} />
                      <span className="flex min-h-[48px] cursor-pointer items-center justify-center rounded-2xl text-sm ring-1 ring-gold/25 transition peer-checked:bg-gold/15 peer-checked:ring-gold peer-focus-visible:ring-2 peer-focus-visible:ring-saffron">
                        {m === 'pickup' ? 'Pickup' : 'Delivery*'}
                      </span>
                    </label>
                  ))}
                </div>
                <label className="block">
                  <span className="field-label">Preferred date *</span>
                  <input type="date" className="field" min={todayISO()} value={form.date} onChange={(e) => set({ date: e.target.value })} aria-invalid={tried && !!errors.date} />
                  {tried && errors.date && <span className="mt-1 block text-xs text-red-300">{errors.date}</span>}
                </label>
                <label className="block">
                  <span className="field-label">Preferred time *</span>
                  <input type="time" className="field" value={form.time} onChange={(e) => set({ time: e.target.value })} aria-invalid={tried && !!errors.time} />
                  {tried && errors.time && <span className="mt-1 block text-xs text-red-300">{errors.time}</span>}
                </label>
                {noticeWarning && (
                  <p className="flex items-start gap-2 rounded-xl bg-maroon/50 p-3 text-xs text-ivory sm:col-span-2" role="alert">
                    <Flame size={14} className="mt-0.5 shrink-0 text-saffron" aria-hidden /> {noticeWarning}
                  </p>
                )}
                <label className="block">
                  <span className="field-label">Your name *</span>
                  <input className="field" value={form.name} onChange={(e) => set({ name: e.target.value.slice(0, 60) })} autoComplete="name" aria-invalid={tried && !!errors.name} />
                  {tried && errors.name && <span className="mt-1 block text-xs text-red-300">{errors.name}</span>}
                </label>
                <label className="block">
                  <span className="field-label">Mobile number *</span>
                  <input
                    className="field font-num"
                    inputMode="tel"
                    value={form.phone}
                    onChange={(e) => set({ phone: e.target.value.replace(/[^\d+\s-]/g, '').slice(0, 16) })}
                    autoComplete="tel"
                    aria-invalid={tried && !!errors.phone}
                  />
                  {tried && errors.phone && <span className="mt-1 block text-xs text-red-300">{errors.phone}</span>}
                </label>
                <label className="block sm:col-span-2">
                  <span className="field-label">Special instructions</span>
                  <textarea
                    className="field resize-none"
                    rows={3}
                    value={form.instructions}
                    onChange={(e) => set({ instructions: e.target.value.slice(0, 400) })}
                    placeholder="Number of guests, spice level, packaging…"
                  />
                </label>
              </div>

              <label className="mt-5 flex cursor-pointer items-start gap-3 text-xs text-ivory/70">
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-[#D4AF37]" />
                <span>I agree to share these details with {restaurant.name} on WhatsApp so they can send me a quotation.</span>
              </label>
              {tried && errors.consent && <span className="mt-1 block text-xs text-red-300">{errors.consent}</span>}

              <div className="mt-6 grid gap-2">
                <button type="submit" className="btn btn-gold w-full shimmer">
                  <WhatsAppIcon /> Enquire Now
                </button>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" className="btn btn-ghost btn-sm" onClick={copy}>
                    <Copy size={16} /> Copy enquiry
                  </button>
                  <a className="btn btn-ghost btn-sm" href={telUrl}>
                    <Phone size={16} /> Call
                  </a>
                </div>
                <p className="text-center text-[11px] text-ivory/45">
                  No prices are calculated here — you’ll receive a custom quotation. *Delivery subject to the restaurant’s availability.
                </p>
              </div>
            </form>
          </Reveal>
        </div>

        <HotBox />
      </div>
    </section>
  );
}
