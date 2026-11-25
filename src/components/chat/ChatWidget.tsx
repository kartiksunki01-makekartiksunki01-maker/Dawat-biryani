import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, ChevronDown, MessageCircle, RotateCw, Send, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ApiError } from '../../lib/api';
import { chatFetch, chatSend, chatStatus, newChatSecrets, newClientId, type ChatMsg, type ChatStatus } from '../../lib/chatApi';
import { backendConfigured, publicClient } from '../../lib/supabase';
import { useUI } from '../../stores/uiStore';
import { restaurant } from '../../data/restaurant';
import { asset } from '../../utils/format';
import { telUrl } from '../../utils/order';

/** Conversation identity lives on this device only: a random id + a random secret. Refreshing keeps the history. */
interface ChatStore { id: string | null; token: string | null; name: string; setSecrets: (id: string, token: string) => void; setName: (n: string) => void; reset: () => void }
export const useChatStore = create<ChatStore>()(
  persist(
    (set) => ({ id: null, token: null, name: '', setSecrets: (id, token) => set({ id, token }), setName: (name) => set({ name }), reset: () => set({ id: null, token: null }) }),
    { name: 'dawat-chat-v1', version: 1 },
  ),
);

interface Pending { cid: string; body: string; at: string; state: 'sending' | 'failed'; error?: string }
const ease = [0.22, 1, 0.36, 1] as const;
const timeFmt = new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });
const dayFmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
const dayKey = (iso: string) => dayFmt.format(new Date(iso));

export function ChatWidget() {
  const { id, token, name, setSecrets, setName, reset } = useChatStore();
  const [status, setStatus] = useState<ChatStatus | null>(null);
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [unread, setUnread] = useState(0);
  const [online, setOnline] = useState(false);
  const [pending, setPending] = useState<Pending[]>([]);
  const [draft, setDraft] = useState('');
  const pendingRef = useRef<Pending[]>([]);
  pendingRef.current = pending;
  const [netError, setNetError] = useState('');
  const [visible, setVisible] = useState(() => document.visibilityState === 'visible');
  const overlayOpen = useUI((s) => s.cartOpen || s.navOpen || !!s.productId);
  const introDone = useUI((s) => s.introDone);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const stick = useRef(true);
  const inflight = useRef(0); // sends in progress — polling must not react to a conversation that is still being created
  const readingNow = open && !collapsed && visible;
  const [pushOk, setPushOk] = useState(false); // Realtime push connected for this conversation
  const [peek, setPeek] = useState<ChatMsg | null>(null); // short preview of a new reply while the window is closed
  const readingRef = useRef(readingNow);
  readingRef.current = readingNow;
  const seenIds = useRef<Set<string> | null>(null);

  // availability + enabled flag (also tells us whether to render at all)
  useEffect(() => {
    if (!backendConfigured) return;
    let alive = true;
    const load = () => chatStatus().then((s) => { if (alive) { setStatus(s); setOnline(s.online); } }).catch(() => { if (alive) setStatus((x) => x); });
    void load();
    const t = window.setInterval(load, 60000);
    return () => { alive = false; window.clearInterval(t); };
  }, []);

  useEffect(() => {
    const v = () => setVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', v);
    return () => document.removeEventListener('visibilitychange', v);
  }, []);

  const apply = useCallback((s: { messages: ChatMsg[]; unread: number; online: boolean }) => {
    // a reply that arrived while the customer was not looking → small preview above the chat button
    const known = seenIds.current;
    if (known && !readingRef.current) {
      const fresh = s.messages.filter((m) => m.sender === 'admin' && !known.has(m.id));
      if (fresh.length) setPeek(fresh[fresh.length - 1]);
    }
    seenIds.current = new Set(s.messages.map((m) => m.id));
    setMsgs(s.messages);
    setUnread(s.unread);
    setOnline(s.online);
    setPending((p) => p.filter((x) => !s.messages.some((m) => m.cid === x.cid)));
  }, []);

  // conversation sync. Replies are PUSHED (Supabase Realtime broadcast "changed" on chat:<id>, sent by the database);
  // polling is only a safety net: 20 s / 60 s while push is connected, 4 s / 20 s if it is not. Paused in hidden tabs.
  const sync = useCallback(async () => {
    if (!id || !token || inflight.current > 0) return;
    try {
      const s = await chatFetch(id, token, readingNow);
      if (inflight.current > 0) return;
      if (s.not_found) { if (pendingRef.current.length) return; reset(); setMsgs([]); setUnread(0); setPending([]); return; }
      apply(s);
      setNetError('');
    } catch (e) {
      if (e instanceof ApiError && e.kind !== 'rejected') setNetError('Connection problem — retrying…');
    }
  }, [id, token, readingNow, apply, reset]);

  const syncRef = useRef(sync);
  syncRef.current = sync;

  useEffect(() => {
    if (!id || !visible || !status?.enabled) return;
    void sync();
    const reading = open && !collapsed;
    const t = window.setInterval(() => void sync(), pushOk ? (reading ? 20000 : 60000) : (reading ? 4000 : 20000));
    return () => window.clearInterval(t);
  }, [id, visible, open, collapsed, sync, status?.enabled, pushOk]);

  // real-time push: a content-free ping tells this device to re-read its conversation (with its secret token)
  useEffect(() => {
    if (!id || !publicClient || !status?.enabled) return;
    let debounce: number | undefined;
    const ch = publicClient
      .channel(`chat:${id}`)
      .on('broadcast', { event: 'changed' }, () => { window.clearTimeout(debounce); debounce = window.setTimeout(() => void syncRef.current(), 120); })
      .subscribe((st) => setPushOk(st === 'SUBSCRIBED'));
    return () => { window.clearTimeout(debounce); setPushOk(false); void publicClient?.removeChannel(ch); };
  }, [id, status?.enabled]);

  // unread count in the browser tab title while the customer is elsewhere
  const baseTitle = useRef(document.title);
  useEffect(() => {
    document.title = unread > 0 ? `(${unread}) New message · ${baseTitle.current}` : baseTitle.current;
  }, [unread]);
  useEffect(() => () => { document.title = baseTitle.current; }, []);
  useEffect(() => {
    if (!peek) return;
    const t = window.setTimeout(() => setPeek(null), 8000);
    return () => window.clearTimeout(t);
  }, [peek]);
  useEffect(() => { if (open) setPeek(null); }, [open]);

  // auto-scroll to the newest message (unless the visitor scrolled up to read)
  useEffect(() => {
    const el = listRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [msgs, pending, open, collapsed]);
  useEffect(() => { if (readingNow) window.setTimeout(() => inputRef.current?.focus(), 50); }, [readingNow]);

  const send = useCallback(async (body: string, cid: string = newClientId(), existing = false) => {
    const text = body.trim();
    if (!text) return;
    let cId = id, tok = token;
    if (!cId || !tok) { const s = newChatSecrets(); cId = s.conversation_id; tok = s.token; setSecrets(cId, tok); }
    const at = new Date().toISOString();
    setPending((p) => (existing ? p.map((x) => (x.cid === cid ? { ...x, state: 'sending' as const, error: undefined } : x)) : [...p, { cid, body: text, at, state: 'sending' }]));
    stick.current = true;
    inflight.current += 1;
    try {
      const s = await chatSend({ conversation_id: cId, token: tok, body: text, client_id: cid, name: name.trim() || undefined });
      apply(s);
      setNetError('');
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Could not send.';
      setPending((p) => p.map((x) => (x.cid === cid ? { ...x, state: 'failed', error: msg } : x)));
    } finally {
      inflight.current -= 1;
    }
  }, [id, token, name, setSecrets, apply]);

  const submit = () => {
    if (!draft.trim()) return;
    const t = draft;
    setDraft('');
    void send(t);
  };

  const items = useMemo(() => {
    const all: { key: string; m: ChatMsg | null; p?: Pending; at: string }[] = [
      ...msgs.map((m) => ({ key: m.id, m, at: m.created_at })),
      ...pending.map((p) => ({ key: p.cid, m: null, p, at: p.at })),
    ];
    return all;
  }, [msgs, pending]);

  if (!backendConfigured || !status?.enabled) return null;
  const hidden = overlayOpen || !introDone;

  return (
    <div className={`pointer-events-none fixed bottom-3 right-3 z-[66] flex flex-col items-end sm:bottom-5 sm:right-5 ${hidden ? 'invisible' : ''}`} aria-hidden={hidden || undefined} data-chat>
      <AnimatePresence>
        {open && (
          <motion.section
            key="win"
            role="dialog"
            aria-label="Live chat with Dawat Biryani House"
            className="pointer-events-auto mb-3 flex w-[min(calc(100vw-1.5rem),370px)] flex-col overflow-hidden rounded-2xl border border-gold/40 bg-[#14090c] text-ivory shadow-[0_20px_60px_rgba(0,0,0,0.6)]"
            style={{ height: collapsed ? 'auto' : 'min(76dvh, 540px)' }}
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.97 }}
            transition={{ duration: 0.25, ease }}
            onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}
          >
            <header className="flex items-center gap-3 bg-gradient-to-r from-[#4a1220] to-[#2a0b14] px-3 py-2.5">
              <img src={asset('assets/images/logo.png')} alt="" className="h-9 w-9 rounded-full ring-1 ring-gold/60" width={36} height={36} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{restaurant.name}</p>
                <p className="flex items-center gap-1.5 text-[11px] text-ivory/75" data-testid="chat-presence">
                  <span className={`h-2 w-2 rounded-full ${online ? 'bg-emerald-400' : 'bg-zinc-500'}`} aria-hidden />
                  {online ? 'Online — we reply within minutes' : 'Offline — leave a message'}
                </p>
              </div>
              <button type="button" className="grid h-9 w-9 place-items-center rounded-full hover:bg-white/10" aria-label={collapsed ? 'Expand chat' : 'Minimize chat'} onClick={() => setCollapsed((c) => !c)}>
                <ChevronDown size={18} className={collapsed ? 'rotate-180 transition' : 'transition'} />
              </button>
              <button type="button" className="grid h-9 w-9 place-items-center rounded-full hover:bg-white/10" aria-label="Close chat" onClick={() => setOpen(false)}>
                <X size={18} />
              </button>
            </header>

            {!collapsed && (
              <>
                {!online && (
                  <p className="border-b border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] text-ivory/70">
                    We’re away right now. For urgent orders <a className="text-gold underline" href={telUrl}>call {restaurant.phone.display}</a>.
                  </p>
                )}
                <div
                  ref={listRef}
                  role="log"
                  aria-live="polite"
                  aria-label="Chat messages"
                  className="flex-1 space-y-2 overflow-y-auto overscroll-contain px-3 py-3"
                  onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60; }}
                >
                  {!items.length && (
                    <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-white/[0.07] px-3 py-2 text-sm" data-testid="chat-intro">
                      {online ? status.welcome_message : `${status.welcome_message} ${status.offline_message}`}
                    </div>
                  )}
                  {items.map((it, i) => {
                    const prev = items[i - 1];
                    const sep = !prev || dayKey(prev.at) !== dayKey(it.at);
                    return (
                      <div key={it.key}>
                        {sep && <p className="my-2 text-center text-[10px] uppercase tracking-wider text-ivory/40">{dayKey(it.at)}</p>}
                        <Bubble m={it.m} p={it.p} at={it.at} onRetry={(p) => void send(p.body, p.cid, true)} />
                      </div>
                    );
                  })}
                  {netError && <p className="text-center text-[11px] text-saffron" role="status">{netError}</p>}
                </div>

                <form className="border-t border-white/10 bg-black/30 p-2.5" onSubmit={(e) => { e.preventDefault(); submit(); }}>
                  {!id && !items.length && (
                    <input className="field mb-2 !min-h-[40px] !py-1.5 text-sm" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="Your name (optional)" aria-label="Your name (optional)" autoComplete="given-name" />
                  )}
                  <div className="flex items-end gap-2">
                    <textarea
                      ref={inputRef}
                      rows={1}
                      value={draft}
                      maxLength={1000}
                      onChange={(e) => { setDraft(e.target.value); e.currentTarget.style.height = 'auto'; e.currentTarget.style.height = Math.min(e.currentTarget.scrollHeight, 110) + 'px'; }}
                      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); } }}
                      className="field max-h-[110px] min-h-[44px] flex-1 resize-none !py-2.5 text-sm"
                      placeholder="Type your message…"
                      aria-label="Type your message"
                    />
                    <button type="submit" className="btn btn-gold !min-h-[44px] !px-4" disabled={!draft.trim()} aria-label="Send message">
                      <Send size={18} />
                    </button>
                  </div>
                  <p className="mt-1.5 text-[10px] text-ivory/40">Messages are stored by the restaurant to answer you. Please don’t share card numbers or passwords.</p>
                </form>
              </>
            )}
          </motion.section>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {!open && peek && (
          <motion.button
            key={peek.id}
            type="button"
            onClick={() => { setOpen(true); setCollapsed(false); setPeek(null); }}
            className="pointer-events-auto mb-2 max-w-[min(280px,calc(100vw-1.5rem))] rounded-2xl rounded-br-sm border border-gold/40 bg-[#1a0d10] px-3.5 py-2.5 text-left text-ivory shadow-[0_12px_40px_rgba(0,0,0,0.55)]"
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.25, ease }}
            data-testid="chat-peek"
          >
            <span className="block text-[11px] font-semibold uppercase tracking-wider text-gold">New reply · {restaurant.name.split(' ')[0]}</span>
            <span className="mt-0.5 line-clamp-2 block text-sm">{peek.body}</span>
          </motion.button>
        )}
      </AnimatePresence>
      {!open && (
        <motion.button
          type="button"
          onClick={() => { setOpen(true); setCollapsed(false); }}
          className="pointer-events-auto relative grid h-14 w-14 place-items-center rounded-full bg-gradient-to-br from-[#D4AF37] to-[#a8862a] text-[#2a0b14] shadow-[0_8px_30px_rgba(212,175,55,0.35)] ring-2 ring-[#2a0b14]"
          aria-label={unread ? `Open live chat, ${unread} unread message${unread > 1 ? 's' : ''}` : 'Open live chat'}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          whileTap={{ scale: 0.94 }}
          transition={{ duration: 0.3, ease }}
          data-testid="chat-launcher"
        >
          <MessageCircle size={26} />
          <span className={`absolute right-0.5 top-0.5 h-3 w-3 rounded-full ring-2 ring-[#14090c] ${online ? 'bg-emerald-500' : 'bg-zinc-500'}`} aria-hidden />
          {unread > 0 && (
            <span className="absolute -left-1 -top-1 grid min-h-[20px] min-w-[20px] place-items-center rounded-full bg-red-600 px-1 text-[11px] font-bold text-white" data-testid="chat-unread">{unread > 9 ? '9+' : unread}</span>
          )}
        </motion.button>
      )}
    </div>
  );
}

function Bubble({ m, p, at, onRetry }: { m: ChatMsg | null; p?: Pending; at: string; onRetry: (p: Pending) => void }) {
  const mine = p ? true : m?.sender === 'customer';
  const system = m?.sender === 'system';
  const body = p ? p.body : m!.body;
  return (
    <div className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
      <div
        className={`max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm leading-snug ${
          mine ? 'rounded-tr-sm bg-gradient-to-br from-[#D4AF37] to-[#b8932c] text-[#2a0b14]' : system ? 'rounded-tl-sm bg-white/[0.05] italic text-ivory/75' : 'rounded-tl-sm bg-white/[0.09]'
        } ${p?.state === 'sending' ? 'opacity-70' : ''}`}
        data-sender={m?.sender ?? 'customer'}
      >
        {body}
      </div>
      <div className="mt-0.5 flex items-center gap-2 px-1 text-[10px] text-ivory/45">
        {p?.state === 'failed' ? (
          <>
            <span className="flex items-center gap-1 text-red-300"><AlertTriangle size={11} /> Not sent — {p.error}</span>
            <button type="button" className="flex items-center gap-1 text-gold underline" onClick={() => onRetry(p)}><RotateCw size={11} /> Retry</button>
          </>
        ) : p ? 'Sending…' : (
          <>
            {!mine && !system && <span>{restaurant.name.split(' ')[0]} ·</span>}
            <time dateTime={at}>{timeFmt.format(new Date(at))}</time>
          </>
        )}
      </div>
    </div>
  );
}
