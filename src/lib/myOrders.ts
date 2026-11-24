// Orders placed from THIS browser. Only the order id + its secret token are stored here;
// the order itself lives in the database and is fetched with the token (never by phone number).
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface MyOrderRef {
  id: string;
  token: string;
  bill: string;
  at: string;
}

interface MyOrdersState {
  orders: MyOrderRef[];
  add: (o: MyOrderRef) => void;
  forget: (id: string) => void;
  forgetAll: () => void;
}

export const useMyOrders = create<MyOrdersState>()(
  persist(
    (set) => ({
      orders: [],
      add: (o) => set((s) => ({ orders: [o, ...s.orders.filter((x) => x.id !== o.id)].slice(0, 20) })),
      forget: (id) => set((s) => ({ orders: s.orders.filter((x) => x.id !== id) })),
      forgetAll: () => set({ orders: [] }),
    }),
    { name: 'dawat-my-orders-v1', storage: createJSONStorage(() => localStorage) },
  ),
);

/** Link to the receipt / tracking page. The token sits after "#", so it is never sent to any server log. */
export const trackUrl = (id: string, token: string) => {
  // site root, whether we are on /, /index.html, /admin, /admin/ or /track.html
  const root = location.pathname.replace(/(admin(\.html)?\/?|track(\.html)?|index\.html)$/, '');
  const u = new URL(`${root}track.html`, location.origin);
  u.hash = `${id}.${token}`;
  return u.toString();
};

export function parseTrackHash(hash: string): { id: string; token: string } | null {
  const m = /^#?([0-9a-f-]{36})\.([A-Za-z0-9_-]{32,128})$/i.exec(hash);
  return m ? { id: m[1], token: m[2] } : null;
}
