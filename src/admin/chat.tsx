// Admin side of the live chat: conversation list, unread total, availability and a heartbeat.
// Live via Supabase Realtime (Postgres Changes on chat_messages; RLS lets only admins receive them) with an
// 8 s polling fallback (30 s while push is connected) that also heals missed events.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { errText, useAdmin } from './ui';

export interface Conv {
  id: string; customer_name: string | null; status: 'open' | 'resolved' | 'archived'; admin_unread: number; customer_unread: number;
  last_message_at: string; last_message_preview: string; created_at: string;
}
export interface ChatSettingsRow {
  enabled: boolean; admin_online: boolean; admin_seen_at: string | null; welcome_message: string; offline_message: string; retention_days: number;
}
interface Ctx {
  convs: Conv[]; unread: number; settings: ChatSettingsRow | null; live: boolean; loading: boolean; error: string;
  reload: () => Promise<void>; tick: number;
  setAvailability: (on: boolean) => Promise<void>;
}
const C = createContext<Ctx | null>(null);
export const useChatAdmin = () => { const c = useContext(C); if (!c) throw new Error('ChatProvider missing'); return c; };

export const CONV_COLS = 'id,customer_name,status,admin_unread,customer_unread,last_message_at,last_message_preview,created_at';

export function ChatProvider({ children }: { children: ReactNode }) {
  const { sb, toast } = useAdmin();
  const [convs, setConvs] = useState<Conv[]>([]);
  const [settings, setSettings] = useState<ChatSettingsRow | null>(null);
  const [live, setLive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);
  const liveRef = useRef(false);

  const reload = useCallback(async () => {
    const [c, s] = await Promise.all([
      sb.from('chat_conversations').select(CONV_COLS).order('last_message_at', { ascending: false }).limit(300),
      sb.from('chat_settings').select('*').eq('id', 1).maybeSingle(),
    ]);
    setLoading(false);
    if (c.error || s.error) { setError(errText(c.error ?? s.error, 'Could not load chats.')); return; }
    setError('');
    setConvs(c.data as Conv[]);
    setSettings(s.data as ChatSettingsRow | null);
    setTick((t) => t + 1);
  }, [sb]);

  useEffect(() => {
    void reload();
    let debounce: number | undefined;
    const kick = () => { window.clearTimeout(debounce); debounce = window.setTimeout(() => void reload(), 250); };
    const ch = sb.channel('admin-chat')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_messages' }, kick)
      .subscribe((st) => { liveRef.current = st === 'SUBSCRIBED'; setLive(liveRef.current); });
    let ticks = 0;
    // every 8 s only while live push is down; every 2 min as a safety net while it works
    const poll = window.setInterval(() => {
      ticks += 1;
      if (document.visibilityState === 'visible' && (!liveRef.current || ticks % 15 === 0)) void reload();
    }, 8000);
    // presence: the website shows "Online" only while this panel has pinged in the last 5 minutes (ping every 2 min)
    const beat = () => { if (document.visibilityState === 'visible') void sb.rpc('admin_chat_heartbeat'); };
    beat();
    const hb = window.setInterval(beat, 120000);
    return () => { window.clearTimeout(debounce); window.clearInterval(poll); window.clearInterval(hb); void sb.removeChannel(ch); };
  }, [sb, reload]);

  const setAvailability = useCallback(async (on: boolean) => {
    const { error: e } = await sb.from('chat_settings').update({ admin_online: on, admin_seen_at: new Date().toISOString() }).eq('id', 1);
    if (e) { toast(errText(e, 'Could not change availability.'), 'err'); return; }
    await sb.rpc('admin_chat_heartbeat');
    void reload();
  }, [sb, toast, reload]);

  const value = useMemo<Ctx>(() => ({
    convs, unread: convs.reduce((a, c) => a + (c.status === 'archived' ? 0 : c.admin_unread), 0), settings, live, loading, error, reload, tick, setAvailability,
  }), [convs, settings, live, loading, error, reload, tick, setAvailability]);
  return <C.Provider value={value}>{children}</C.Provider>;
}
