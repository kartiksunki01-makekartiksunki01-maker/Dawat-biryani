import { AnimatePresence, motion } from 'framer-motion';
import { ShoppingBag, X } from 'lucide-react';
import { useState } from 'react';
import { menu } from '../../data/restaurant';
import { useMenuVersion } from '../../data/menuSync';
import type { MenuItem } from '../../data/types';
import { useUI } from '../../stores/uiStore';
import { asset, formatINR } from '../../utils/format';
import {enquireItemMessage, telUrl} from '../../utils/order';
import { WhatsAppLink } from '../ui/WhatsAppLink';
import { useDialog } from '../ui/Sheet';
import { DietMark, PromoLabel, QtyStepper } from '../ui/Bits';
import { categoryLabel, VariantPicker } from './MenuCard';
import { useAddToOrder } from './useAddToOrder';

const ease = [0.22, 1, 0.36, 1] as const;

export function ProductSheet() {
  const productId = useUI((s) => s.productId);
  const openProduct = useUI((s) => s.openProduct);
  useMenuVersion((s) => s.version); // re-render when the menu is refreshed from the backend
  const item = menu.find((m) => m.id === productId) ?? null;
  const close = () => openProduct(null);
  const ref = useDialog(!!item, close);

  return (
    <AnimatePresence>
      {item && (
        <div className="fixed inset-0 z-[85]" key="product">
          <motion.div
            className="absolute inset-0 bg-black/70 backdrop-blur-md"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={close}
            aria-hidden
          />
          <motion.div
            ref={ref}
            role="dialog"
            aria-modal="true"
            aria-labelledby="product-title"
            data-lenis-prevent
            className="absolute inset-x-0 bottom-0 max-h-[92svh] overflow-y-auto rounded-t-[2rem] bg-silk ring-1 ring-gold/25 md:inset-y-4 md:left-auto md:right-4 md:max-h-none md:w-[min(560px,92vw)] md:rounded-[2rem]"
            initial={{ y: 60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ duration: 0.5, ease }}
          >
            <ProductBody key={item.id} item={item} onClose={close} onOpen={openProduct} />
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

function ProductBody({ item, onClose, onOpen }: { item: MenuItem; onClose: () => void; onOpen: (id: string) => void }) {
  const [picked, setVariant] = useState(item.variants[0]?.id ?? '');
  const variant = item.variants.some((v) => v.id === picked) ? picked : (item.variants[0]?.id ?? '');
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState('');
  const addToOrder = useAddToOrder();
  const price = item.variants.find((v) => v.id === variant)?.price ?? 0;
  const related = menu
    .filter((m) => m.id !== item.id && m.status === 'available' && (m.category === item.category || !item.category))
    .concat(menu.filter((m) => m.id !== item.id && m.status === 'available' && m.category !== item.category))
    .slice(0, 3);

  return (
    <div className="relative">
      <div className="relative aspect-[2/1] w-full overflow-hidden md:rounded-t-[2rem]">
        {item.image ? (
          <motion.img
            layoutId={`dish-img-${item.id}`}
            src={asset(item.image)}
            alt={item.name}
            className="h-full w-full object-cover"
            transition={{ duration: 0.6, ease }}
          />
        ) : (
          <div className="grid h-full w-full place-items-center bg-clove font-royal tracking-[0.2em] text-gold">{item.name}</div>
        )}
        <span className="absolute inset-0 bg-gradient-to-t from-[#1a120e] via-transparent to-black/20" aria-hidden />
        {item.imageKind === 'promotional' && <PromoLabel className="absolute bottom-3 right-4" />}
        <button
          type="button"
          onClick={onClose}
          data-autofocus
          className="absolute right-4 top-4 grid h-11 w-11 place-items-center rounded-full bg-black/55 text-ivory backdrop-blur transition hover:bg-black/75"
          aria-label="Close details"
        >
          <X size={20} />
        </button>
      </div>

      <div className="space-y-6 p-6 sm:p-8">
        <div>
          <p className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-gold">
            <DietMark diet={item.diet} /> {categoryLabel(item.category)}
          </p>
          <h3 id="product-title" className="mt-3 font-display text-3xl text-ivory sm:text-4xl">
            {item.name}
          </h3>
          <p className="mt-3 text-ivory/70">{item.description}</p>
        </div>

        {item.status === 'enquire' ? (
          <div className="glass rounded-2xl p-5">
            <p className="text-sm text-ivory/80">Price and availability for this dish haven’t been published yet.</p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <WhatsAppLink className="btn btn-emerald btn-sm" text={enquireItemMessage(item.name)}>
                Enquire on WhatsApp
              </WhatsAppLink>
              <a className="btn btn-ghost btn-sm" href={telUrl}>
                Call
              </a>
            </div>
          </div>
        ) : (
          <>
            <div>
              <p className="field-label">{item.variants.length > 1 ? 'Choose portion' : 'Price'}</p>
              <VariantPicker item={item} value={variant} onChange={setVariant} name={`sheet-v-${item.id}`} />
            </div>
            <label className="block">
              <span className="field-label">Instructions for this dish (optional)</span>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, 160))}
                rows={2}
                className="field resize-none"
                placeholder="e.g. less spicy, extra raita if available"
              />
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <QtyStepper value={qty} onChange={setQty} label={`quantity of ${item.name}`} />
              <button
                type="button"
                className="btn btn-gold flex-1"
                disabled={item.soldOut}
                onClick={() => {
                  addToOrder(item.id, variant, qty, note);
                  onClose();
                }}
              >
                <ShoppingBag size={18} aria-hidden /> {item.soldOut ? 'Sold out right now' : <>Add to Order · <span className="font-num">{formatINR(price * qty)}</span></>}
              </button>
            </div>
          </>
        )}

        <div className="rounded-2xl bg-ivory/[0.03] p-4 text-sm text-ivory/60 ring-1 ring-gold/15">
          <p className="font-medium text-ivory/80">Ingredients & allergens</p>
          <p className="mt-1">
            {item.ingredients?.length
              ? item.ingredients.join(', ')
              : 'Detailed ingredient and allergen information hasn’t been published yet. If you have an allergy or dietary need, please ask the restaurant before ordering.'}
          </p>
        </div>

        {related.length > 0 && (
          <div>
            <p className="t-eyebrow text-gold">You may also like</p>
            <ul className="mt-3 grid gap-2">
              {related.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => onOpen(r.id)}
                    className="flex w-full items-center gap-3 rounded-2xl p-2 text-left ring-1 ring-gold/10 transition hover:bg-ivory/5 hover:ring-gold/30"
                  >
                    {r.image && <img src={asset(r.image)} alt="" className="h-12 w-20 rounded-xl object-cover" loading="lazy" />}
                    <span className="flex-1 text-sm text-ivory">{r.name}</span>
                    <span className="pr-2 font-num text-sm text-gold">from {formatINR(Math.min(...r.variants.map((v) => v.price)))}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
