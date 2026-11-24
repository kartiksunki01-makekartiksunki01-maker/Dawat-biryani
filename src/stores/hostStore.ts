import { create } from 'zustand';
import { useStorefront } from '../data/menuSync';

export type Gesture = 'idle' | 'namaste' | 'wave' | 'point' | 'present' | 'celebrate' | 'thanks';

export type HostEvent = 'welcome' | 'menu' | 'bulk' | 'added' | 'placed' | 'enquiry_sent' | 'talk' | 'guide';

export const hostLines: Record<HostEvent, { text: string; gesture: Gesture }[]> = {
  welcome: [{ text: 'Namaskaram! Welcome to Dawat Biryani House.', gesture: 'namaste' }],
  menu: [{ text: 'Anna recommends exploring our Chicken Dum Biryani!', gesture: 'point' }],
  bulk: [{ text: 'Planning a family function? Check our bulk-order options.', gesture: 'present' }],
  added: [{ text: 'Excellent choice! Open your order when you are ready to check out.', gesture: 'celebrate' }],
  placed: [{ text: 'Your order is with the restaurant. Thank you!', gesture: 'thanks' }],
  enquiry_sent: [{ text: 'Your enquiry reached the restaurant — they will get back to you.', gesture: 'thanks' }],
  guide: [{ text: 'Tap a dish, pick a portion, add it, then place your order from the cart.', gesture: 'point' }],
  talk: [
    { text: 'Ready for your royal biryani experience?', gesture: 'wave' },
    { text: 'Scroll slowly — watch the dum seal break and the spices rise!', gesture: 'present' },
    { text: 'We are open 10 AM to 10 PM, opposite Padmashree School, Dhamankar Naka.', gesture: 'point' },
    { text: 'Place your order online, then pay at the restaurant.', gesture: 'namaste' },
    { text: 'Planning a family function? Check our bulk-order options.', gesture: 'present' },
  ],
};

/** Events that should appear only once per visitor (remembered across visits on this device). */
const ONCE_FOREVER: HostEvent[] = ['welcome', 'menu', 'bulk'];
/** Events that should appear at most once per browsing session. */
const ONCE_PER_SESSION: HostEvent[] = ['added'];
/** Messages the visitor asked for (or confirmed results) — always allowed. */
const ALWAYS: HostEvent[] = ['talk', 'guide', 'placed', 'enquiry_sent'];

interface HostState {
  message: { id: number; text: string } | null;
  gesture: { id: number; name: Gesture };
  talkIndex: number;
  say: (event: HostEvent, opts?: { once?: boolean }) => void;
  dismiss: () => void;
}

const LS_KEY = 'dawat-host-seen-v2';
const SS_KEY = 'dawat-host-session-v2';
const read = (store: Storage | undefined, key: string): Partial<Record<HostEvent, boolean>> => {
  try {
    return JSON.parse(store?.getItem(key) ?? '{}');
  } catch {
    return {};
  }
};
const write = (store: Storage | undefined, key: string, v: object) => {
  try {
    store?.setItem(key, JSON.stringify(v));
  } catch {
    /* ignore */
  }
};

const typing = () => {
  const el = typeof document !== 'undefined' ? document.activeElement : null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || (el as HTMLElement).isContentEditable);
};

export const useHost = create<HostState>()((set, get) => ({
  message: null,
  gesture: { id: 0, name: 'idle' },
  talkIndex: 0,
  say: (event) => {
    const website = useStorefront.getState().website;
    if (website && !website.character_enabled) return;
    const ls = typeof localStorage !== 'undefined' ? localStorage : undefined;
    const ss = typeof sessionStorage !== 'undefined' ? sessionStorage : undefined;
    if (!ALWAYS.includes(event)) {
      if (typing()) return; // never interrupt someone filling a form
      if (ONCE_FOREVER.includes(event)) {
        const seen = read(ls, LS_KEY);
        if (seen[event]) return;
        write(ls, LS_KEY, { ...seen, [event]: true });
      }
      if (ONCE_PER_SESSION.includes(event)) {
        const seen = read(ss, SS_KEY);
        if (seen[event]) return;
        write(ss, SS_KEY, { ...seen, [event]: true });
      }
    }
    const { talkIndex } = get();
    const pool = hostLines[event];
    const idx = event === 'talk' ? talkIndex % pool.length : 0;
    const line = pool[idx];
    const override = website?.character_messages?.[event];
    const text = typeof override === 'string' && override.trim() ? override.trim().slice(0, 160) : line.text;
    const id = Date.now();
    set({
      message: { id, text },
      gesture: { id, name: line.gesture },
      talkIndex: event === 'talk' ? talkIndex + 1 : talkIndex,
    });
  },
  dismiss: () => set({ message: null }),
}));
