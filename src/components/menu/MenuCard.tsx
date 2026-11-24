import { motion } from 'framer-motion';
import { Info, MessageCircle, Phone, ShoppingBag } from 'lucide-react';
import { useState, type Ref } from 'react';
import { categories } from '../../data/restaurant';
import type { MenuItem } from '../../data/types';
import { useUI } from '../../stores/uiStore';
import { offerLabel, offersForDish, useStorefront } from '../../data/menuSync';
import { asset, formatINR } from '../../utils/format';
import { enquireItemMessage, telUrl, whatsappUrl } from '../../utils/order';
import { ArchOutline, Tilt } from '../motion/Motion';
import { DietMark, QtyStepper } from '../ui/Bits';
import { useAddToOrder } from './useAddToOrder';

export const categoryLabel = (id: MenuItem['category']) =>
  id ? (categories.find((c) => c.id === id)?.label ?? '') : 'On enquiry';

export function VariantPicker({
  item,
  value,
  onChange,
  name,
}: {
  item: MenuItem;
  value: string;
  onChange: (id: string) => void;
  name: string;
}) {
  if (item.variants.length === 1) {
    return (
      <p className="font-num text-2xl font-semibold text-gold">
        {formatINR(item.variants[0].price)}
      </p>
    );
  }
  return (
    <div role="radiogroup" aria-label={`Portion for ${item.name}`} className="grid grid-cols-2 gap-2">
      {item.variants.map((v) => (
        <label key={v.id} className="relative">
          <input
            type="radio"
            name={name}
            className="peer sr-only"
            checked={value === v.id}
            onChange={() => onChange(v.id)}
          />
          <span className="flex min-h-[48px] cursor-pointer flex-col items-center justify-center rounded-2xl px-2 py-1.5 text-center ring-1 ring-gold/25 transition peer-checked:bg-gold/15 peer-checked:ring-gold peer-focus-visible:ring-2 peer-focus-visible:ring-saffron">
            <span className="font-num text-lg font-semibold leading-tight text-ivory">{formatINR(v.price)}</span>
            <span className="text-[11px] uppercase tracking-wider text-ivory/55">{v.label}</span>
          </span>
        </label>
      ))}
    </div>
  );
}

export function MenuCard({ item, index, ref }: { item: MenuItem; index: number; ref?: Ref<HTMLElement> }) {
  const openProduct = useUI((s) => s.openProduct);
  const addToOrder = useAddToOrder();
  const [picked, setVariant] = useState(item.variants[0]?.id ?? '');
  // the menu can be replaced with live data (new portion ids) after this card mounted
  const variant = item.variants.some((v) => v.id === picked) ? picked : (item.variants[0]?.id ?? '');
  const [qty, setQty] = useState(1);
  const enquire = item.status === 'enquire';
  const offers = useStorefront((s) => s.offers);
  const dishOffers = offersForDish(item, offers);
  const variantOff = item.variants.find((v) => v.id === variant)?.available === false;

  return (
    <motion.article
      ref={ref}
      layout
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      viewport={{ once: true, margin: '0px 0px -5% 0px' }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: (index % 4) * 0.07 }}
      className="h-full"
      aria-labelledby={`dish-${item.id}`}
    >
      <Tilt className="group relative h-full" max={5}>
        <div className="menu-card relative flex h-full flex-col overflow-hidden rounded-[1.75rem] bg-gradient-to-b from-[#24170f] to-[#120c09] ring-1 ring-gold/15 transition duration-500 group-hover:ring-gold/45">
          <span className="menu-spot pointer-events-none absolute inset-0 z-10 opacity-0 transition duration-500 group-hover:opacity-100" aria-hidden />
          {/* Image */}
          <button
            type="button"
            onClick={() => openProduct(item.id)}
            className="relative block aspect-[2/1] w-full overflow-hidden text-left"
            aria-label={`View details for ${item.name}`}
          >
            {item.image ? (
              <motion.img
                layoutId={`dish-img-${item.id}`}
                src={asset(item.image)}
                alt={item.name}
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover transition duration-[1.2s] ease-out group-hover:scale-[1.07]"
              />
            ) : (
              <div className="relative grid h-full w-full place-items-center bg-silk">
                <ArchOutline className="absolute inset-y-3 left-1/2 w-24 -translate-x-1/2 text-gold/40" />
                <span className="relative px-6 text-center font-royal text-sm tracking-[0.2em] text-gold/90">
                  {item.name}
                </span>
              </div>
            )}
            <span className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-[#1a120e] to-transparent" aria-hidden />
            <span className="absolute left-3 top-3 flex items-center gap-2">
              <DietMark diet={item.diet} />
              {item.chefSpecial && <span className="rounded-full bg-gold px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-smoke">Chef’s special</span>}
            </span>
            {dishOffers.length > 0 && !item.soldOut && (
              <motion.span initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="absolute bottom-3 left-3 z-10 rounded-full bg-emerald-600/90 px-2.5 py-1 text-[11px] font-semibold text-white shadow">
                {offerLabel(dishOffers[0])}{dishOffers[0].code ? ` · ${dishOffers[0].code}` : ''}
              </motion.span>
            )}
            {item.soldOut && (
              <span className="absolute inset-0 z-10 grid place-items-center bg-black/55 text-sm font-semibold uppercase tracking-[0.2em] text-ivory">Sold out today</span>
            )}
            <span className="absolute right-3 top-3 rounded-full bg-black/50 px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-ivory/80 backdrop-blur">
              {categoryLabel(item.category)}
            </span>
          </button>

          {/* Body */}
          <div className="relative z-20 flex flex-1 flex-col gap-4 p-5">
            <div>
              <h3 id={`dish-${item.id}`} className="font-display text-[1.35rem] leading-tight text-ivory">
                {item.name}
              </h3>
              <p className="mt-1.5 line-clamp-2 text-sm text-ivory/60">{item.description}</p>
            </div>

            {enquire ? (
              <div className="mt-auto space-y-3">
                <p className="text-sm text-gold">Price on enquiry</p>
                <div className="grid grid-cols-2 gap-2">
                  <a
                    className="btn btn-emerald btn-sm"
                    href={whatsappUrl(enquireItemMessage(item.name))}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <MessageCircle size={16} /> Enquire
                  </a>
                  <a className="btn btn-ghost btn-sm" href={telUrl}>
                    <Phone size={16} /> Call
                  </a>
                </div>
              </div>
            ) : (
              <div className="mt-auto space-y-3">
                <VariantPicker item={item} value={variant} onChange={setVariant} name={`v-${item.id}`} />
                <div className="flex items-center gap-2">
                  <QtyStepper value={qty} onChange={setQty} label={`quantity of ${item.name}`} size="sm" />
                  <button
                    type="button"
                    className="btn btn-gold btn-sm flex-1"
                    disabled={item.soldOut || variantOff}
                    onClick={() => {
                      addToOrder(item.id, variant, qty);
                      setQty(1);
                    }}
                  >
                    <ShoppingBag size={16} aria-hidden /> {item.soldOut ? 'Sold out' : variantOff ? 'Unavailable' : 'Add to Order'}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => openProduct(item.id)}
                  className="inline-flex min-h-[40px] items-center gap-1.5 text-xs text-ivory/55 transition hover:text-gold"
                >
                  <Info size={14} aria-hidden /> Details & instructions
                </button>
              </div>
            )}
          </div>
        </div>
      </Tilt>
    </motion.article>
  );
}
