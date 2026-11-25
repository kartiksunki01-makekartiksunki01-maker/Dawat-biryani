import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { menu } from '../data/restaurant';
import { onMenuReplaced } from '../data/menuSync';

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
  when: 'asap' | 'later';
  date: string;
  time: string;
  address: string;
  instructions: string;
  coupon: string;
}

/** A Place Order attempt whose outcome we may not know yet (e.g. the network dropped). */
export interface PendingAttempt {
  idempotency_key: string;
  access_token: string;
  keys: string[];
  at: number;
}

interface CartState {
  lines: CartLine[];
  details: OrderDetails;
  /** The customer chose to keep name / phone / address on this device. */
  remember: boolean;
  pending: PendingAttempt | null;
  /** increments on every add — used for bounce / host reactions */
  addPulse: number;
  add: (itemId: string, variantId: string, qty?: number, note?: string) => void;
  setQty: (key: string, qty: number) => void;
  remove: (key: string) => void;
  removeKeys: (keys: string[]) => void;
  clear: () => void;
  setDetails: (patch: Partial<OrderDetails>) => void;
  setRemember: (v: boolean) => void;
  forgetDetails: () => void;
  setPending: (p: PendingAttempt | null) => void;
  migrateLegacy: () => void;
}

export const MAX_QTY = 50;

const emptyDetails: OrderDetails = {
  name: '', phone: '', mode: 'pickup', when: 'asap', date: '', time: '', address: '', instructions: '', coupon: '',
};

const keyOf = (itemId: string, variantId: string) => `${itemId}|${variantId}`;

export const useCart = create<CartState>()(
  persist(
    (set) => ({
      lines: [],
      details: emptyDetails,
      remember: false,
      pending: null,
      addPulse: 0,
      add: (itemId, variantId, qty = 1, note) =>
        set((s) => {
          const key = keyOf(itemId, variantId);
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
      removeKeys: (keys) => set((s) => ({ lines: s.lines.filter((l) => !keys.includes(l.key)) })),
      clear: () => set({ lines: [] }),
      setDetails: (patch) => set((s) => ({ details: { ...s.details, ...patch } })),
      setRemember: (remember) => set({ remember }),
      forgetDetails: () => set((s) => ({ remember: false, details: { ...emptyDetails, mode: s.details.mode } })),
      setPending: (pending) => set({ pending }),
      // Carts saved by the previous website version used position-based portion ids
      // ('small' | 'large' | 'std'). Map them once to the real database ids.
      migrateLegacy: () =>
        set((s) => {
          let changed = false;
          const merged = new Map<string, CartLine>();
          for (const l of s.lines) {
            const item = menu.find((m) => m.id === l.itemId);
            let variantId = l.variantId;
            if (item && !item.variants.some((v) => v.id === variantId)) {
              const idx = variantId === 'small' || variantId === 'std' ? 0 : variantId === 'large' ? 1 : -1;
              const v = idx >= 0 ? item.variants[idx] : undefined;
              if (v && (variantId !== 'std' || item.variants.length === 1)) {
                variantId = v.id;
                changed = true;
              }
            }
            const key = keyOf(l.itemId, variantId);
            const prev = merged.get(key);
            merged.set(key, prev ? { ...prev, qty: Math.min(MAX_QTY, prev.qty + l.qty) } : { ...l, key, variantId });
          }
          return changed ? { lines: [...merged.values()] } : {};
        }),
    }),
    {
      name: 'dawat-cart-v1',
      version: 2,
      storage: createJSONStorage(() => localStorage),
      // Personal details are saved only when the customer ticks "Remember my details".
      partialize: (s) => ({
        lines: s.lines,
        remember: s.remember,
        pending: s.pending,
        details: s.remember ? s.details : { ...emptyDetails, mode: s.details.mode },
      }),
      migrate: (persisted, version) => {
        const p = (persisted ?? {}) as Partial<CartState>;
        // v1 stored details without asking — drop them; keep the items.
        if (version < 2) return { lines: p.lines ?? [], remember: false, pending: null, details: emptyDetails } as unknown as CartState;
        return p as CartState;
      },
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<CartState>;
        const lines = (p.lines ?? []).filter((l) => l && typeof l.itemId === 'string' && l.qty > 0);
        return { ...current, ...p, lines, details: { ...emptyDetails, ...(p.details ?? {}) } };
      },
    },
  ),
);

onMenuReplaced(() => useCart.getState().migrateLegacy());
useCart.getState().migrateLegacy();

export interface ResolvedLine extends CartLine {
  name: string;
  variantLabel: string;
  showVariant: boolean;
  unitPrice: number;
  lineTotal: number;
  image?: string;
  /** false when the dish / portion is no longer orderable */
  available: boolean;
  unavailableReason?: string;
}

export function resolveLines(lines: CartLine[]): ResolvedLine[] {
  return lines.map((l) => {
    const item = menu.find((m) => m.id === l.itemId);
    const variant = item?.variants.find((v) => v.id === l.variantId);
    if (!item || !variant) {
      return {
        ...l, name: item?.name ?? 'Item no longer on the menu', variantLabel: '', showVariant: false,
        unitPrice: 0, lineTotal: 0, available: false, unavailableReason: 'No longer on the menu',
      };
    }
    const reason = item.soldOut
      ? 'Sold out right now'
      : item.status !== 'available'
        ? 'Price on enquiry — not orderable online'
        : variant.available === false
          ? 'This portion is unavailable'
          : undefined;
    return {
      ...l,
      name: item.name,
      variantLabel: variant.label,
      showVariant: item.variants.length > 1,
      unitPrice: variant.price,
      lineTotal: variant.price * l.qty,
      image: item.image,
      available: !reason,
      unavailableReason: reason,
    };
  });
}

export const subtotalOf = (lines: ResolvedLine[]) => lines.reduce((sum, l) => sum + (l.available ? l.lineTotal : 0), 0);
export const countOf = (lines: CartLine[]) => lines.reduce((sum, l) => sum + l.qty, 0);
