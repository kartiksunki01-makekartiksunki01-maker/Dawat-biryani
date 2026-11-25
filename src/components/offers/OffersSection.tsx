import { motion } from 'framer-motion';
import { Check, Copy, Megaphone, Tag } from 'lucide-react';
import { useState } from 'react';
import { offerLabel, useStorefront, type PublicOffer } from '../../data/menuSync';
import { formatINR } from '../../utils/format';
import { copyText } from '../../utils/order';
import { scrollToTarget } from '../../utils/scroll';

const endsText = (iso: string | null) =>
  iso ? `Valid till ${new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(iso))}` : '';

function OfferCard({ o, i }: { o: PublicOffer; i: number }) {
  const [copied, setCopied] = useState(false);
  return (
    <motion.li
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6, delay: i * 0.08 }}
      className="relative flex flex-col overflow-hidden rounded-[1.5rem] bg-gradient-to-br from-[#2a1a0e] to-[#120c09] p-5 ring-1 ring-gold/30"
    >
      {o.banner_url && <img src={o.banner_url} alt="" loading="lazy" className="-mx-5 -mt-5 mb-4 aspect-[3/1] w-[calc(100%+2.5rem)] max-w-none object-cover" />}
      <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-emerald-600/90 px-3 py-1 text-xs font-semibold text-white">
        <Tag size={13} /> {offerLabel(o)}
      </span>
      <h3 className="mt-3 font-display text-xl text-ivory">{o.title}</h3>
      {o.description && <p className="mt-1 text-sm text-ivory/65">{o.description}</p>}
      <p className="mt-2 text-xs text-ivory/50">
        {[o.min_order > 0 ? `Min. order ${formatINR(o.min_order)}` : '', o.max_discount ? `Max. discount ${formatINR(o.max_discount)}` : '', endsText(o.ends_at)]
          .filter(Boolean)
          .join(' · ')}
      </p>
      <div className="mt-auto pt-4">
        {o.code ? (
          <button
            type="button"
            className="btn btn-ghost btn-sm w-full font-num tracking-widest"
            onClick={async () => {
              setCopied(await copyText(o.code!));
              window.setTimeout(() => setCopied(false), 2000);
            }}
            aria-label={`Copy coupon code ${o.code}`}
          >
            {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? 'Copied' : o.code}
          </button>
        ) : (
          <p className="text-xs text-gold">Applied automatically at checkout when your order qualifies.</p>
        )}
      </div>
    </motion.li>
  );
}

/** Real offers created by the restaurant in the admin panel. Renders nothing when there are none. */
export function OffersSection() {
  const offers = useStorefront((s) => s.offers);
  const website = useStorefront((s) => s.website);
  const announcement = website?.announcement_enabled && website.announcement_text.trim() ? website.announcement_text.trim() : '';
  if (!offers.length && !announcement) return null;
  return (
    <section id="offers" className="relative scroll-mt-24 bg-clove py-16" aria-labelledby="offers-title">
      <div className="mx-auto max-w-[1400px] space-y-6 px-5 sm:px-8 lg:px-14">
        {announcement && (
          <p role="note" className="flex items-start gap-3 rounded-2xl bg-gold/10 p-4 text-sm text-ivory ring-1 ring-gold/40">
            <Megaphone size={18} className="mt-0.5 shrink-0 text-gold" /> {announcement}
          </p>
        )}
        {offers.length > 0 && (
          <>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="t-eyebrow text-gold">Offers</p>
                <h2 id="offers-title" className="mt-2 font-display text-3xl text-ivory sm:text-4xl">Today’s royal deals</h2>
              </div>
              <button type="button" className="btn btn-gold btn-sm" onClick={() => scrollToTarget('menu')}>
                Order now
              </button>
            </div>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {offers.map((o, i) => (
                <OfferCard key={o.id} o={o} i={i} />
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}
