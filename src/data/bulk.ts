// Bulk & Special Orders: per-kilogram menu, a separate bulk-order cart (never mixed with plate orders),
// and the helpers the section and the enquiry use. Prices shown here are ESTIMATES; the database recalculates
// every enquiry from its own prices and the restaurant confirms the final quotation.
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { Diet } from './types';

export type BulkCategory = 'chicken' | 'mutton' | 'seafood' | 'vegetarian' | 'gravies' | 'chicken-specials' | 'starters';

export interface BulkItem {
  id: string;
  slug: string;
  name: string;
  category: BulkCategory;
  diet: Diet;
  pricePerKg: number;
  description: string;
  image?: string;
  imageKind?: 'promotional' | 'photo';
  soldOut: boolean;
  minKg: number;
  maxKg: number;
  /** quantities up to this many kg need no advance notice */
  noticeFreeUpToKg: number;
  advanceNoticeHours: number;
  /** the restaurant has confirmed the timing rule for this dish */
  timingConfirmed: boolean;
}

export interface BulkMenu {
  items: BulkItem[];
  maxTotalKg: number;
}

export const BULK_CATEGORY_LABEL: Record<BulkCategory, string> = {
  chicken: 'Chicken',
  mutton: 'Mutton',
  seafood: 'Seafood',
  vegetarian: 'Vegetarian',
  gravies: 'Gravies',
  'chicken-specials': 'Chicken Specials',
  starters: 'Starters',
};

export const BULK_FILTERS: { id: string; label: string; cats: BulkCategory[] | null }[] = [
  { id: 'all', label: 'All', cats: null },
  { id: 'chicken', label: 'Chicken', cats: ['chicken'] },
  { id: 'mutton', label: 'Mutton', cats: ['mutton'] },
  { id: 'seafood', label: 'Seafood', cats: ['seafood'] },
  { id: 'vegetarian', label: 'Vegetarian', cats: ['vegetarian'] },
  { id: 'gravies', label: 'Gravies', cats: ['gravies'] },
  { id: 'specials', label: 'Specials & Starters', cats: ['chicken-specials', 'starters'] },
];

const DEFAULT_RULES = { minKg: 1, maxKg: 20, noticeFreeUpToKg: 5, advanceNoticeHours: 2, soldOut: false, description: '' };

/**
 * Built-in copy of the supplied bulk menu, used ONLY when the live menu cannot be loaded (no backend / offline
 * first visit). Matches the database seed. Malai Tikka is left out until its per-kg unit is confirmed.
 */
export const STATIC_BULK_MENU: BulkMenu = {
  maxTotalKg: 20,
  items: (
    [
      ['chicken-dum-biryani', 'Chicken Dum Biryani', 'chicken', 'non-veg', 800, 'assets/images/dishes/chicken-dum.webp'],
      ['chicken-tikka-biryani', 'Chicken Tikka Biryani', 'chicken', 'non-veg', 1200, 'assets/images/dishes/chicken-tikka.webp'],
      ['chicken-italian-biryani', 'Chicken Italian Biryani', 'chicken', 'non-veg', 1400, null],
      ['prawns-biryani', 'Prawns Biryani', 'seafood', 'non-veg', 1400, 'assets/images/dishes/prawns.webp'],
      ['mutton-biryani', 'Mutton Biryani', 'mutton', 'non-veg', 1600, 'assets/images/dishes/mutton.webp'],
      ['mutton-tikka-biryani', 'Mutton Tikka Biryani', 'mutton', 'non-veg', 1800, null],
      ['chicken-gravy', 'Chicken Gravy', 'gravies', 'non-veg', 700, 'assets/images/dishes/chicken-gravy.webp'],
      ['chicken-sukha-lapeta', 'Chicken Sukha Lapeta', 'chicken-specials', 'non-veg', 900, null],
      ['chicken-kabab', 'Chicken Kabab', 'starters', 'non-veg', 700, null],
      ['veg-paneer-biryani', 'Veg Vegetable Paneer Biryani', 'vegetarian', 'veg', 800, 'assets/images/dishes/veg-paneer.webp'],
      ['veg-paneer-tikka-biryani', 'Veg Vegetable Paneer Tikka Biryani', 'vegetarian', 'veg', 1200, null],
    ] as [string, string, BulkCategory, Diet, number, string | null][]
  ).map(([slug, name, category, diet, pricePerKg, image]) => ({
    id: slug,
    slug,
    name,
    category,
    diet,
    pricePerKg,
    image: image ?? undefined,
    imageKind: image ? ('promotional' as const) : undefined,
    timingConfirmed: slug === 'veg-paneer-biryani',
    ...DEFAULT_RULES,
  })),
};

export interface BulkPayload {
  max_total_kg: number | null;
  items: {
    id: string;
    slug: string;
    name: string;
    category: BulkCategory;
    diet: Diet;
    price_per_kg: number | string;
    description: string | null;
    image_path: string | null;
    image_kind: 'promotional' | 'photo' | null;
    is_sold_out: boolean;
    min_kg: number;
    max_kg: number;
    notice_free_up_to_kg: number;
    advance_notice_hours: number;
    timing_confirmed: boolean;
  }[];
}

export const toBulkMenu = (p: BulkPayload | null | undefined): BulkMenu | null =>
  p && Array.isArray(p.items)
    ? {
        maxTotalKg: Number(p.max_total_kg) || 20,
        items: p.items.map((b) => ({
          id: b.id,
          slug: b.slug,
          name: b.name,
          category: b.category,
          diet: b.diet,
          pricePerKg: Number(b.price_per_kg),
          description: b.description ?? '',
          image: b.image_path ?? undefined,
          imageKind: b.image_kind ?? undefined,
          soldOut: b.is_sold_out,
          minKg: b.min_kg,
          maxKg: b.max_kg,
          noticeFreeUpToKg: b.notice_free_up_to_kg,
          advanceNoticeHours: b.advance_notice_hours,
          timingConfirmed: b.timing_confirmed,
        })),
      }
    : null;

/* ───────────────────────── formatting ───────────────────────── */
const inrFmt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });
/** ₹ with Indian digit grouping: 120000 → ₹1,20,000 */
export const inr = (n: number) => `₹${inrFmt.format(Math.round(n * 100) / 100)}`;

/* ───────────────────────── bulk cart ───────────────────────── */
export interface BulkLine {
  id: string;
  slug: string;
  name: string;
  /** price per kg the customer was shown (sent to the server, which refuses it if it changed) */
  pricePerKg: number;
  kg: number;
  /** set when the dish is no longer available — the line must be removed before sending */
  unavailable?: boolean;
}

export interface BulkNotice {
  id: string;
  kind: 'price' | 'unavailable' | 'qty';
  text: string;
}

interface BulkCartState {
  lines: BulkLine[];
  notices: BulkNotice[];
  /** increments on every add — drives the confirmation animation */
  addPulse: number;
  put: (item: BulkItem, kg: number) => void;
  setKg: (id: string, kg: number) => void;
  remove: (id: string) => void;
  clear: () => void;
  dismissNotice: (id: string) => void;
  /** compare the cart with the latest menu: new prices, removed / sold-out dishes, changed limits */
  revalidate: (menu: BulkMenu, live: boolean) => void;
}

export const useBulkCart = create<BulkCartState>()(
  persist(
    (set) => ({
      lines: [],
      notices: [],
      addPulse: 0,
      put: (item, kg) =>
        set((s) => {
          const line: BulkLine = { id: item.id, slug: item.slug, name: item.name, pricePerKg: item.pricePerKg, kg };
          const exists = s.lines.some((l) => l.id === item.id);
          return {
            lines: exists ? s.lines.map((l) => (l.id === item.id ? line : l)) : [...s.lines, line],
            notices: s.notices.filter((n) => n.id !== item.id),
            addPulse: s.addPulse + 1,
          };
        }),
      setKg: (id, kg) => set((s) => ({ lines: s.lines.map((l) => (l.id === id ? { ...l, kg } : l)) })),
      remove: (id) => set((s) => ({ lines: s.lines.filter((l) => l.id !== id), notices: s.notices.filter((n) => n.id !== id) })),
      clear: () => set({ lines: [], notices: [] }),
      dismissNotice: (id) => set((s) => ({ notices: s.notices.filter((n) => n.id !== id) })),
      revalidate: (menu, live) =>
        set((s) => {
          if (!s.lines.length) return s;
          const notices = [...s.notices];
          const note = (n: BulkNotice) => {
            const i = notices.findIndex((x) => x.id === n.id);
            if (i >= 0) notices[i] = n;
            else notices.push(n);
          };
          const lines = s.lines.map((l) => {
            // a line added from the built-in copy is matched to the live dish by its slug
            const item = menu.items.find((i) => i.id === l.id) ?? menu.items.find((i) => i.slug === l.slug);
            if (!item || item.soldOut) {
              if (!live) return l;
              note({ id: l.id, kind: 'unavailable', text: `${l.name} is no longer available for bulk orders. Please remove it before sending.` });
              return { ...l, unavailable: true };
            }
            const next: BulkLine = { ...l, id: item.id, slug: item.slug, name: item.name, unavailable: false };
            if (item.pricePerKg !== l.pricePerKg) {
              note({ id: item.id, kind: 'price', text: `The price of ${item.name} changed from ${inr(l.pricePerKg)} to ${inr(item.pricePerKg)} per kg. Your estimate has been updated.` });
              next.pricePerKg = item.pricePerKg;
            }
            const kg = Math.min(item.maxKg, Math.max(item.minKg, l.kg));
            if (kg !== l.kg) {
              note({ id: item.id, kind: 'qty', text: `${item.name} can now be ordered from ${item.minKg} to ${item.maxKg} kg, so your quantity was changed to ${kg} kg.` });
              next.kg = kg;
            }
            return next;
          });
          // dishes that are fine again lose their "unavailable" notice
          const okIds = new Set(lines.filter((l) => !l.unavailable).map((l) => l.id));
          return {
            lines,
            notices: notices.filter((n) => n.kind !== 'unavailable' || !okIds.has(n.id)).filter((n) => lines.some((l) => l.id === n.id)),
          };
        }),
    }),
    {
      name: 'dawat-bulk-cart-v1',
      storage: createJSONStorage(() => localStorage),
      // only the dishes and kilograms are kept on this device — never name or phone
      partialize: (s) => ({ lines: s.lines }),
      version: 1,
    },
  ),
);

export const lineTotal = (l: Pick<BulkLine, 'kg' | 'pricePerKg'>) => l.kg * l.pricePerKg;
export const cartTotals = (lines: BulkLine[]) => ({
  kg: lines.reduce((a, l) => a + l.kg, 0),
  total: lines.reduce((a, l) => a + lineTotal(l), 0),
});

/* ───────────────────────── time rules (Asia/Kolkata) ───────────────────────── */
/** "now" in Asia/Kolkata as YYYY-MM-DD, corrected by the server clock offset. */
export const istToday = (skewMs = 0) => new Date(Date.now() + skewMs + 5.5 * 36e5).toISOString().slice(0, 10);
export const istInstant = (date: string, time: string) => (date && time ? new Date(`${date}T${time}:00+05:30`) : null);

/** Hours of advance notice the whole order needs (the strictest dish wins). */
export function requiredNotice(lines: BulkLine[], items: BulkItem[]) {
  let hours = 0, name = '', kg = 0;
  for (const l of lines) {
    const it = items.find((i) => i.id === l.id);
    if (it && l.kg > it.noticeFreeUpToKg && it.advanceNoticeHours > hours) {
      hours = it.advanceNoticeHours;
      name = it.name;
      kg = l.kg;
    }
  }
  return { hours, name, kg };
}
