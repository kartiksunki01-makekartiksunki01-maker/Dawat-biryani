import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { menu } from '../data/restaurant';

export interface CartLine {
  key: string; // `${itemId}|${variantId}`
  itemId: string;
  variantId: string;
  qty: number;
  note?: string;
}

export interface OrderDetails {
  name: string;
  phone: string;
  mode: 'pickup' | 'delivery';
  date: string;
  time: string;
  instructions: string;
}

interface CartState {
  lines: CartLine[];
  details: OrderDetails;
  /** increments on every add — used for bounce / host reactions */
  addPulse: number;
  add: (itemId: string, variantId: string, qty?: number, note?: string) => void;
  setQty: (key: string, qty: number) => void;
  remove: (key: string) => void;
  clear: () => void;
  setDetails: (patch: Partial<OrderDetails>) => void;
}

export const MAX_QTY = 50;

export const useCart = create<CartState>()(
  persist(
    (set) => ({
      lines: [],
      details: { name: '', phone: '', mode: 'pickup', date: '', time: '', instructions: '' },
      addPulse: 0,
      add: (itemId, variantId, qty = 1, note) =>
        set((s) => {
          const key = `${itemId}|${variantId}`;
          const existing = s.lines.find((l) => l.key === key);
          const lines = existing
            ? s.lines.map((l) =>
                l.key === key
                  ? { ...l, qty: Math.min(MAX_QTY, l.qty + qty), note: note?.trim() ? note.trim() : l.note }
                  : l,
              )
            : [...s.lines, { key, itemId, variantId, qty: Math.min(MAX_QTY, qty), note: note?.trim() || undefined }];
          return { lines, addPulse: s.addPulse + 1 };
        }),
      setQty: (key, qty) =>
        set((s) => ({
          lines:
            qty <= 0
              ? s.lines.filter((l) => l.key !== key)
              : s.lines.map((l) => (l.key === key ? { ...l, qty: Math.min(MAX_QTY, qty) } : l)),
        })),
      remove: (key) => set((s) => ({ lines: s.lines.filter((l) => l.key !== key) })),
      clear: () => set({ lines: [] }),
      setDetails: (patch) => set((s) => ({ details: { ...s.details, ...patch } })),
    }),
    {
      name: 'dawat-cart-v1',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ lines: s.lines, details: s.details }),
      // Drop lines whose item / variant no longer exists in the menu config.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<CartState>;
        const valid = (p.lines ?? []).filter((l) => {
          const item = menu.find((m) => m.id === l.itemId);
          return !!item?.variants.find((v) => v.id === l.variantId) && l.qty > 0;
        });
        return { ...current, ...p, lines: valid, details: { ...current.details, ...(p.details ?? {}) } };
      },
    },
  ),
);

export interface ResolvedLine extends CartLine {
  name: string;
  variantLabel: string;
  showVariant: boolean;
  unitPrice: number;
  lineTotal: number;
  image?: string;
}

export function resolveLines(lines: CartLine[]): ResolvedLine[] {
  return lines.flatMap((l) => {
    const item = menu.find((m) => m.id === l.itemId);
    const variant = item?.variants.find((v) => v.id === l.variantId);
    if (!item || !variant) return [];
    return [
      {
        ...l,
        name: item.name,
        variantLabel: variant.label,
        showVariant: item.variants.length > 1,
        unitPrice: variant.price,
        lineTotal: variant.price * l.qty,
        image: item.image,
      },
    ];
  });
}

export const subtotalOf = (lines: ResolvedLine[]) => lines.reduce((sum, l) => sum + l.lineTotal, 0);
export const countOf = (lines: CartLine[]) => lines.reduce((sum, l) => sum + l.qty, 0);
