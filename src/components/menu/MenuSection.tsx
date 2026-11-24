import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import { Search, X } from 'lucide-react';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { categories, menu, portionLabels } from '../../data/restaurant';
import { useMenuVersion } from '../../data/menuSync';
import type { CategoryId } from '../../data/types';
import { useHost } from '../../stores/hostStore';
import { useInView } from '../../hooks/useMedia';
import { SectionHeading } from '../ui/Bits';
import { MenuCard } from './MenuCard';

export function MenuSection() {
  const [cat, setCat] = useState<'all' | CategoryId>('all');
  const [query, setQuery] = useState('');
  const q = useDeferredValue(query.trim().toLowerCase());
  const say = useHost((s) => s.say);
  const menuVersion = useMenuVersion((s) => s.version);
  const [ref, inView] = useInView<HTMLElement>({ threshold: 0.15 });

  useEffect(() => {
    if (inView) say('menu', { once: true });
  }, [inView, say]);

  const items = useMemo(
    () =>
      menu.filter(
        (m) =>
          (cat === 'all' || m.category === cat) &&
          (!q || m.name.toLowerCase().includes(q) || m.description.toLowerCase().includes(q)),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cat, q, menuVersion],
  );

  return (
    <section id="menu" ref={ref} className="relative scroll-mt-24 bg-clove pb-28 pt-24 sm:pt-32" aria-labelledby="menu-title">
      <div className="bg-jali pointer-events-none absolute inset-0 opacity-70" aria-hidden />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-gradient-to-b from-clove to-transparent" aria-hidden />
      <div className="relative mx-auto max-w-[1400px] px-5 sm:px-8 lg:px-14">
        <div className="flex flex-col gap-10 lg:flex-row lg:items-end lg:justify-between">
          <div id="menu-title">
            <SectionHeading
              eyebrow="Signature Menu"
              title="Our Royal"
              accent="Menu"
              devanagari="बिर्याणी"
              intro={<>Hyderabadi-style biryani and gravies, crafted with tradition and served with pride.</>}
            />
          </div>
          <label className="relative block w-full max-w-sm">
            <span className="sr-only">Search the menu</span>
            <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gold/70" aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search biryani, gravy, paneer…"
              className="field rounded-full pl-11 pr-11"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-1.5 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full text-ivory/60 hover:text-ivory"
                aria-label="Clear search"
              >
                <X size={16} />
              </button>
            )}
          </label>
        </div>

        <LayoutGroup id="menu-tabs">
          <div role="tablist" aria-label="Menu categories" className="no-scrollbar -mx-5 mt-10 flex gap-2 overflow-x-auto px-5 pb-2 sm:mx-0 sm:px-0">
            {categories.map((c) => {
              const selected = cat === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-controls="menu-grid"
                  onClick={() => setCat(c.id)}
                  className={`relative min-h-[44px] shrink-0 rounded-full px-5 text-sm transition-colors ${
                    selected ? 'text-clove' : 'text-ivory/75 ring-1 ring-gold/25 hover:text-ivory hover:ring-gold/50'
                  }`}
                >
                  {selected && (
                    <motion.span
                      layoutId="menu-tab-pill"
                      className="absolute inset-0 rounded-full bg-gradient-to-b from-[#f4d77e] to-[#c99a2e]"
                      transition={{ type: 'spring', stiffness: 400, damping: 34 }}
                    />
                  )}
                  <span className="relative font-medium">{c.label}</span>
                </button>
              );
            })}
          </div>
        </LayoutGroup>

        <div id="menu-grid" role="tabpanel" aria-live="polite" className="mt-8">
          <LayoutGroup id="menu-grid">
            <motion.div layout className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              <AnimatePresence mode="popLayout">
                {items.map((item, i) => (
                  <MenuCard key={item.id} item={item} index={i} />
                ))}
              </AnimatePresence>
            </motion.div>
          </LayoutGroup>
          {items.length === 0 && (
            <div className="glass mx-auto mt-6 max-w-md rounded-3xl p-8 text-center">
              <p className="font-display text-xl">No dishes match “{query}”.</p>
              <p className="mt-2 text-sm text-ivory/60">Try another word, or call us — we’re happy to help.</p>
              <button type="button" className="btn btn-ghost btn-sm mt-5" onClick={() => { setQuery(''); setCat('all'); }}>
                Show the full menu
              </button>
            </div>
          )}
        </div>

        <div className="mt-10 grid gap-2 text-xs leading-relaxed text-ivory/50 sm:max-w-3xl">
          <p>Prices in Indian Rupees, as listed on the restaurant’s menu. The restaurant confirms availability and the final price for every order.</p>
          {!portionLabels.confirmed && (
            <p>
              For dishes with two prices, the portion names “{portionLabels.small}” and “{portionLabels.large}” are provisional — please confirm the quantity when you order.
            </p>
          )}
          <p>Dish images are representative promotional artwork; actual servings may look different. Ask the restaurant about ingredients and allergens.</p>
        </div>
      </div>
    </section>
  );
}
