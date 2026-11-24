import { create } from 'zustand';

export type Gesture = 'idle' | 'namaste' | 'wave' | 'point' | 'present' | 'celebrate' | 'thanks';

export type HostEvent = 'welcome' | 'menu' | 'bulk' | 'added' | 'sent' | 'talk' | 'guide';

export const hostLines: Record<HostEvent, { text: string; gesture: Gesture }[]> = {
  welcome: [{ text: 'Namaskaram! Welcome to Dawat Biryani House.', gesture: 'namaste' }],
  menu: [{ text: 'Anna recommends exploring our Chicken Dum Biryani!', gesture: 'point' }],
  bulk: [{ text: 'Planning a family function? Check our bulk-order options.', gesture: 'present' }],
  added: [{ text: 'Excellent choice! Your Dawat is getting ready.', gesture: 'celebrate' }],
  sent: [{ text: 'Thank you! See you at Dawat Biryani House.', gesture: 'thanks' }],
  guide: [{ text: 'Tap a dish for details, pick a portion, then “Add to order”.', gesture: 'point' }],
  talk: [
    { text: 'Ready for your royal biryani experience?', gesture: 'wave' },
    { text: 'Scroll slowly — watch the dum seal break and the spices rise!', gesture: 'present' },
    { text: 'We are open 10 AM to 10 PM, opposite Padmashree School, Dhamankar Naka.', gesture: 'point' },
    { text: 'Your order goes to the restaurant as an enquiry — they confirm the final price.', gesture: 'namaste' },
    { text: 'Planning a family function? Check our bulk-order options.', gesture: 'present' },
  ],
};

interface HostState {
  message: { id: number; text: string } | null;
  gesture: { id: number; name: Gesture };
  fired: Partial<Record<HostEvent, boolean>>;
  talkIndex: number;
  say: (event: HostEvent, opts?: { once?: boolean }) => void;
  dismiss: () => void;
}

const SESSION_KEY = 'dawat-host-fired';
const loadFired = (): Partial<Record<HostEvent, boolean>> => {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? '{}');
  } catch {
    return {};
  }
};

export const useHost = create<HostState>()((set, get) => ({
  message: null,
  gesture: { id: 0, name: 'idle' },
  fired: loadFired(),
  talkIndex: 0,
  say: (event, opts) => {
    const { fired, talkIndex } = get();
    if (opts?.once && fired[event]) return;
    const pool = hostLines[event];
    const idx = event === 'talk' ? talkIndex % pool.length : 0;
    const line = pool[idx];
    const nextFired = { ...fired, [event]: true };
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(nextFired));
    } catch {
      /* ignore */
    }
    const id = Date.now();
    set({
      message: { id, text: line.text },
      gesture: { id, name: line.gesture },
      fired: nextFired,
      talkIndex: event === 'talk' ? talkIndex + 1 : talkIndex,
    });
  },
  dismiss: () => set({ message: null }),
}));
