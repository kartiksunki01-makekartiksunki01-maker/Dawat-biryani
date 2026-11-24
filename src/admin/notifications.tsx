// Admin notifications: one stored row per real event (deduplicated in the database by event_key).
// Live via Supabase Realtime, with polling as a fallback. A popup/sound fires only for events that
// arrive while the panel is open and have never been announced before on this device — never again
// after a refresh, and never for old orders.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useAdmin } from './ui';

export interface Notif {
  id: string;
  kind: 'new_order' | 'order_update' | 'new_bulk' | 'new_enquiry';
  title: string;
  body: string;
  order_id: string | null;
  lead_id: string | null;
  created_at: string;
}

interface Ctx {
  items: Notif[];
  readIds: Set<string>;
  unread: number;
  pendingOrders: number;
  live: boolean;
  loading: boolean;
  error: string;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  reload: () => Promise<void>;
  soundOn: boolean;
  setSoundOn: (v: boolean) => void;
  browserOn: boolean;
  enableBrowser: () => Promise<void>;
  disableBrowser: () => void;
  /** increments when orders change in realtime — order lists can refresh themselves */
  orderTick: number;
}

const NotifCtx = createContext<Ctx | null>(null);
export const useNotifications = () => {
  const c = useContext(NotifCtx);
  if (!c) throw new Error('NotificationsProvider missing');
  return c;
};

const ANNOUNCED_KEY = 'dawat-admin-announced-v1';
const SOUND_KEY = 'dawat-admin-sound';
const BROWSER_KEY = 'dawat-admin-browser-notif';
const lsGet = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } };

function chime() {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    const t = ctx.currentTime;
    [880, 1320].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t + i * 0.18);
      g.gain.exponentialRampToValueAtTime(0.2, t + i * 0.18 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.18 + 0.5);
      o.connect(g).connect(ctx.destination);
      o.start(t + i * 0.18);
      o.stop(t + i * 0.18 + 0.55);
    });
    window.setTimeout(() => void ctx.close(), 1200);
  } catch {
    /* no audio */
  }
}

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { sb, user, toast } = useAdmin();
  const [items, setItems] = useState<Notif[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [pendingOrders, setPendingOrders] = useState(0);
  const [live, setLive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [orderTick, setOrderTick] = useState(0);
  const [soundOn, setSoundOnState] = useState(() => lsGet(SOUND_KEY) === '1');
  const [browserOn, setBrowserOn] = useState(() => lsGet(BROWSER_KEY) === '1' && typeof Notification !== 'undefined' && Notification.permission === 'granted');
  const openedAt = useRef(Date.now());
  const announced = useRef<Set<string>>(new Set(JSON.parse(lsGet(ANNOUNCED_KEY) ?? '[]') as string[]));
  const prefs = useRef({ soundOn, browserOn });
  prefs.current = { soundOn, browserOn };

  const announce = useCallback((n: Notif) => {
    if (announced.current.has(n.id)) return;
    announced.current.add(n.id);
    lsSet(ANNOUNCED_KEY, JSON.stringify([...announced.current].slice(-300)));
    if (new Date(n.created_at).getTime() < openedAt.current - 60000) return; // historical — no popup
    toast(`${n.title} — ${n.body}`);
    if (prefs.current.soundOn) chime();
    if (prefs.current.browserOn && document.visibilityState !== 'visible') {
      try { new Notification(n.title, { body: n.body, tag: n.id }); } catch { /* ignore */ }
    }
  }, [toast]);

  const reload = useCallback(async () => {
    const [n, r, p] = await Promise.all([
      sb.from('notifications').select('*').order('created_at', { ascending: false }).limit(200),
      sb.from('notification_reads').select('notification_id').eq('admin_id', user.id),
      sb.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'pending').is('archived_at', null),
    ]);
    setLoading(false);
    if (n.error || r.error) {
      setError('Could not load notifications. Retrying automatically.');
      return;
    }
    setError('');
    const list = n.data as Notif[];
    // first load: everything already stored counts as announced (no burst of sounds)
    if (!announced.current.size) list.forEach((x) => announced.current.add(x.id));
    else list.forEach(announce);
    lsSet(ANNOUNCED_KEY, JSON.stringify([...announced.current].slice(-300)));
    setItems(list);
    setReadIds(new Set((r.data as { notification_id: string }[]).map((x) => x.notification_id)));
    if (!p.error) setPendingOrders(p.count ?? 0);
  }, [sb, user.id, announce]);

  useEffect(() => {
    void reload();
    const ch = sb
      .channel('admin-live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, (payload) => {
        const n = payload.new as Notif;
        setItems((xs) => (xs.some((x) => x.id === n.id) ? xs : [n, ...xs]));
        announce(n);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        setOrderTick((t) => t + 1);
        void sb.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'pending').is('archived_at', null)
          .then((p) => !p.error && setPendingOrders(p.count ?? 0));
      })
      .subscribe((status) => setLive(status === 'SUBSCRIBED'));
    // polling fallback (also heals missed events after a reconnect)
    const t = window.setInterval(() => {
      if (document.visibilityState === 'visible') void reload().then(() => setOrderTick((x) => x + 1));
    }, 30000);
    return () => {
      window.clearInterval(t);
      void sb.removeChannel(ch);
    };
  }, [sb, reload, announce]);

  const markRead = useCallback(async (id: string) => {
    if (readIds.has(id)) return;
    const { error: e } = await sb.from('notification_reads').insert({ notification_id: id, admin_id: user.id });
    if (e && !/duplicate/.test(e.message)) toast('Could not mark as read.', 'err');
    else setReadIds((s) => new Set(s).add(id));
  }, [sb, user.id, readIds, toast]);

  const markAllRead = useCallback(async () => {
    const { error: e } = await sb.rpc('admin_mark_all_read');
    if (e) toast('Could not mark all as read.', 'err');
    else setReadIds(new Set(items.map((i) => i.id)));
  }, [sb, items, toast]);

  const value = useMemo<Ctx>(() => ({
    items, readIds, unread: items.filter((i) => !readIds.has(i.id)).length, pendingOrders, live, loading, error,
    markRead, markAllRead, reload, soundOn,
    setSoundOn: (v) => { setSoundOnState(v); lsSet(SOUND_KEY, v ? '1' : '0'); if (v) chime(); },
    browserOn,
    enableBrowser: async () => {
      if (typeof Notification === 'undefined') { toast('This browser does not support notifications.', 'err'); return; }
      const p = await Notification.requestPermission();
      if (p === 'granted') { setBrowserOn(true); lsSet(BROWSER_KEY, '1'); toast('Browser notifications on.'); }
      else toast('Permission was not given — browser notifications stay off.', 'err');
    },
    disableBrowser: () => { setBrowserOn(false); lsSet(BROWSER_KEY, '0'); },
    orderTick,
  }), [items, readIds, pendingOrders, live, loading, error, markRead, markAllRead, reload, soundOn, browserOn, toast, orderTick]);

  return <NotifCtx.Provider value={value}>{children}</NotifCtx.Provider>;
}
