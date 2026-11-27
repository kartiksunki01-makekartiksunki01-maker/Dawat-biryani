import { Archive, ArchiveRestore, ArrowLeft, CheckCheck, CircleDot, RefreshCw, RotateCcw, Search, Send, Settings2, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useChatAdmin, type ChatSettingsRow, type Conv } from '../chat';
import { useNotifications } from '../notifications';
import { BulkDeleteDialog, SelectBox, SelectionBar, useSelection } from '../selection';
import { Badge, Btn, Card, Confirm, Empty, errText, Field, fmtDT, Input, Notice, PageHeader, Skeleton, Textarea, Toggle, useAdmin } from '../ui';

interface Msg { id: string; sender: 'customer' | 'admin' | 'system'; kind: string | null; body: string; created_at: string }
type Tab = 'active' | 'resolved' | 'archived';
const clock = new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });
const label = (c: Conv) => c.customer_name || `Visitor ${c.id.slice(0, 4).toUpperCase()}`;

export function LiveChat() {
  const { sb, toast } = useAdmin();
  const chat = useChatAdmin();
  const notifs = useNotifications();
  const [tab, setTab] = useState<Tab>('active');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [del, setDel] = useState<Conv | null>(null);

  const list = useMemo(() => chat.convs.filter((c) => (tab === 'active' ? c.status === 'open' : c.status === tab))
    .filter((c) => !q.trim() || `${label(c)} ${c.last_message_preview}`.toLowerCase().includes(q.trim().toLowerCase())), [chat.convs, tab, q]);
  const current = chat.convs.find((c) => c.id === sel) ?? null;
  const pick = useSelection(list.map((c) => c.id));
  const [delMany, setDelMany] = useState(false);
  const counts = useMemo(() => ({
    active: chat.convs.filter((c) => c.status === 'open').length, resolved: chat.convs.filter((c) => c.status === 'resolved').length, archived: chat.convs.filter((c) => c.status === 'archived').length,
  }), [chat.convs]);

  const act = useCallback(async (c: Conv, action: 'read' | 'resolve' | 'reopen' | 'archive' | 'unarchive' | 'delete', msg: string) => {
    const { error } = await sb.rpc('admin_chat_action', { p: { conversation_id: c.id, action } });
    if (error) { toast(errText(error), 'err'); return; }
    toast(msg); if (action === 'delete') setSel(null); void chat.reload();
    if (action === 'read' || action === 'resolve' || action === 'archive') {
      for (const n of notifs.items) if (n.kind === 'new_chat' && n.conversation_id === c.id && !notifs.readIds.has(n.id)) void notifs.markRead(n.id);
    }
  }, [sb, toast, chat, notifs]);

  const s = chat.settings;
  return (
    <section aria-label="Live chat and customer support">
      <PageHeader title="Live Chat & Customer Support" intro="Real two-way chat with website visitors. Customers only ever see their own conversation."
        actions={<>
          <Btn onClick={() => void chat.reload()}><RefreshCw size={16} /> Refresh</Btn>
          <Btn onClick={() => setShowSettings((v) => !v)} aria-expanded={showSettings}><Settings2 size={16} /> Chat settings</Btn>
        </>} />
      {chat.error && <Notice kind="err">{chat.error}</Notice>}
      <Card className="mb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold"><CircleDot size={16} className={s?.admin_online ? 'text-emerald-400' : 'text-zinc-500'} /> {s?.admin_online ? 'You are Online' : 'You are Offline'}</p>
            <p className="text-xs text-ivory/55">{s?.admin_online ? 'The website shows “Online” while this admin panel stays open (checked every minute).' : 'The website shows “Offline” and sends your offline message automatically.'}</p>
          </div>
          <Toggle label="Available for chat" checked={!!s?.admin_online} disabled={!s} onChange={(v) => void chat.setAvailability(v)} />
        </div>
        <p className="mt-2 text-[11px] text-ivory/45">{chat.live ? 'Live updates connected.' : 'Live push not connected — checking for new messages every 8 seconds instead.'}</p>
      </Card>
      {showSettings && s && <ChatSettings s={s} onSaved={() => void chat.reload()} />}

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <div className={sel ? 'hidden lg:block' : ''}>
          <div className="relative mb-2">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ivory/40" />
            <Input className="!pl-9" placeholder="Search conversations" aria-label="Search conversations" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div role="tablist" aria-label="Conversation filter" className="mb-2 flex gap-1">
            {(['active', 'resolved', 'archived'] as Tab[]).map((t) => (
              <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`min-h-[40px] flex-1 rounded-lg px-2 text-xs capitalize ${tab === t ? 'bg-gold/15 text-gold ring-1 ring-gold/30' : 'text-ivory/65 hover:bg-white/5'}`}>
                {t} ({counts[t]})
              </button>
            ))}
          </div>
          {chat.loading ? <Skeleton rows={4} /> : !list.length ? <Empty title={q ? 'No match' : `No ${tab} conversations`}>{tab === 'active' && !q ? 'New customer messages appear here instantly.' : ''}</Empty> : (
            <>
            <SelectionBar sel={pick} selectableIds={list.map((c) => c.id)} noun="chat">
              <Btn tone="danger" onClick={() => setDelMany(true)}><Trash2 size={16} /> Delete…</Btn>
            </SelectionBar>
            <ul className="space-y-1.5" data-testid="conv-list">
              {list.map((c) => (
                <li key={c.id} className="flex items-stretch gap-1">
                  <SelectBox checked={pick.has(c.id)} onChange={(v) => pick.toggle(c.id, v)} label={`Select chat with ${label(c)}`} />
                  <button type="button" onClick={() => setSel(c.id)} aria-current={sel === c.id} className={`w-full rounded-xl border p-3 text-left transition ${sel === c.id ? 'border-gold/50 bg-gold/10' : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]'}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-semibold">{label(c)}</span>
                      {c.admin_unread > 0 && <span className="min-w-[20px] rounded-full bg-red-600 px-1.5 text-center text-[11px] font-bold leading-5 text-white" aria-label={`${c.admin_unread} unread`}>{c.admin_unread}</span>}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-ivory/60">{c.last_message_preview || '—'}</p>
                    <p className="mt-0.5 text-[10px] text-ivory/40">{fmtDT(c.last_message_at)}</p>
                  </button>
                </li>
              ))}
            </ul>
            </>
          )}
          <BulkDeleteDialog open={delMany} onClose={() => setDelMany(false)} title="Delete conversations permanently?" ids={pick.ids}
            sample={list.filter((c) => pick.has(c.id)).map((c) => `${label(c)} — ${c.last_message_preview || '…'}`)}
            explain={<>All messages in these conversations are deleted. A customer who returns starts a fresh chat.</>}
            run={async (chunk) => {
              const { data, error } = await sb.rpc('admin_delete_conversations', { p_ids: chunk });
              if (error) throw new Error(errText(error));
              return { deleted: Number(data), skipped: [] };
            }}
            onDone={() => { if (sel && pick.has(sel)) setSel(null); pick.clear(); void chat.reload(); }} />
        </div>

        <div className={!sel ? 'hidden lg:block' : ''}>
          {!current ? <Empty title="Select a conversation">Pick a customer on the left to read and reply.</Empty> : (
            <Thread key={current.id} conv={current} onBack={() => setSel(null)} act={act} onDelete={() => setDel(current)} />
          )}
        </div>
      </div>
      <Confirm open={!!del} onClose={() => setDel(null)} danger title="Delete this conversation?" confirmLabel="Delete"
        body={<p>The whole conversation with {del ? label(del) : ''} will be removed permanently. Resolved or archived chats are kept until your retention period ends — delete only if needed.</p>}
        onConfirm={async () => { if (del) { await act(del, 'delete', 'Conversation deleted.'); setDel(null); } }} />
    </section>
  );
}

function Thread({ conv, onBack, act, onDelete }: { conv: Conv; onBack: () => void; act: (c: Conv, a: 'read' | 'resolve' | 'reopen' | 'archive' | 'unarchive' | 'delete', m: string) => Promise<void>; onDelete: () => void }) {
  const { sb, toast } = useAdmin();
  const chat = useChatAdmin();
  const [msgs, setMsgs] = useState<Msg[] | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const retry = useRef<{ cid: string; body: string } | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await sb.from('chat_messages').select('id,sender,kind,body,created_at').eq('conversation_id', conv.id).order('created_at').limit(500);
    if (!error) setMsgs(data as Msg[]);
  }, [sb, conv.id]);
  useEffect(() => { void load(); }, [load, chat.tick]);
  useEffect(() => { if (conv.admin_unread > 0) void sb.rpc('admin_chat_action', { p: { conversation_id: conv.id, action: 'read' } }).then(() => chat.reload()); }, [conv.admin_unread, conv.id, sb, chat]);
  useEffect(() => { const el = listRef.current; if (el) el.scrollTop = el.scrollHeight; }, [msgs]);
  // While this conversation is open, its “New chat message” bell entries are read too (no phantom red badge afterwards)
  const notifs = useNotifications();
  const triedNotifs = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const n of notifs.items) {
      if (n.kind !== 'new_chat' || n.conversation_id !== conv.id || notifs.readIds.has(n.id) || triedNotifs.current.has(n.id)) continue;
      triedNotifs.current.add(n.id);
      void notifs.markRead(n.id);
    }
  }, [notifs, conv.id]);

  const send = async () => {
    const body = (retry.current?.body ?? draft).trim();
    if (!body || sending) return;
    const cid = retry.current?.cid ?? crypto.randomUUID();
    retry.current = { cid, body };     // a retry after a network failure re-uses the id, so it can never be stored twice
    setSending(true);
    const { error } = await sb.rpc('admin_chat_reply', { p: { conversation_id: conv.id, body, client_id: cid } });
    setSending(false);
    if (error) { toast(errText(error, 'Reply not sent — try again.'), 'err'); return; }
    retry.current = null; setDraft(''); void load(); void chat.reload();
  };

  return (
    <div className="flex h-[70vh] min-h-[420px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
      <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-3 py-2">
        <button type="button" className="grid h-10 w-10 place-items-center rounded-lg hover:bg-white/10 lg:hidden" aria-label="Back to conversations" onClick={onBack}><ArrowLeft size={18} /></button>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{label(conv)}</p>
          <p className="text-[11px] text-ivory/50">Started {fmtDT(conv.created_at)} <Badge tone={conv.status === 'open' ? 'good' : 'neutral'}>{conv.status}</Badge></p>
        </div>
        <Btn onClick={() => void act(conv, 'read', 'Marked as read.')} disabled={!conv.admin_unread}><CheckCheck size={16} /> Mark read</Btn>
        {conv.status === 'resolved' ? <Btn onClick={() => void act(conv, 'reopen', 'Conversation re-opened.')}><RotateCcw size={16} /> Re-open</Btn> : <Btn onClick={() => void act(conv, 'resolve', 'Marked resolved.')}><CheckCheck size={16} /> Resolve</Btn>}
        {conv.status === 'archived' ? <Btn onClick={() => void act(conv, 'unarchive', 'Restored.')}><ArchiveRestore size={16} /> Restore</Btn> : <Btn onClick={() => void act(conv, 'archive', 'Archived.')}><Archive size={16} /> Archive</Btn>}
        <Btn tone="danger" onClick={onDelete} aria-label="Delete conversation"><Trash2 size={16} /></Btn>
      </div>
      <div ref={listRef} role="log" aria-live="polite" aria-label="Messages" className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
        {!msgs ? <Skeleton rows={3} /> : msgs.map((m) => (
          <div key={m.id} className={`flex flex-col ${m.sender === 'admin' ? 'items-end' : 'items-start'}`}>
            <div data-from={m.sender} className={`max-w-[80%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm ${m.sender === 'admin' ? 'bg-gold/90 text-[#2a0b14]' : m.sender === 'system' ? 'bg-white/5 italic text-ivory/65' : 'bg-white/10'}`}>{m.body}</div>
            <span className="mt-0.5 px-1 text-[10px] text-ivory/40">{m.sender === 'system' ? 'Automatic · ' : ''}{clock.format(new Date(m.created_at))}</span>
          </div>
        ))}
      </div>
      <form className="flex items-end gap-2 border-t border-white/10 p-3" onSubmit={(e) => { e.preventDefault(); void send(); }}>
        <Textarea rows={2} maxLength={1000} value={draft} onChange={(e) => { retry.current = null; setDraft(e.target.value); }} aria-label="Reply to customer" placeholder="Type your reply…"
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); } }} />
        <Btn tone="gold" type="submit" busy={sending} disabled={!draft.trim()} aria-label="Send reply"><Send size={16} /> Send</Btn>
      </form>
    </div>
  );
}

function ChatSettings({ s, onSaved }: { s: ChatSettingsRow; onSaved: () => void }) {
  const { sb, toast } = useAdmin();
  const [d, setD] = useState(s);
  const [busy, setBusy] = useState(false);
  useEffect(() => setD(s), [s]);
  const dirty = JSON.stringify([d.enabled, d.welcome_message, d.offline_message, d.retention_days]) !== JSON.stringify([s.enabled, s.welcome_message, s.offline_message, s.retention_days]);
  const bad = d.retention_days < 7 || d.retention_days > 3650;
  const save = async () => {
    setBusy(true);
    const { error } = await sb.from('chat_settings').update({ enabled: d.enabled, welcome_message: d.welcome_message.trim(), offline_message: d.offline_message.trim(), retention_days: d.retention_days }).eq('id', 1);
    setBusy(false);
    if (error) toast(errText(error, 'Could not save chat settings.'), 'err'); else { toast('Chat settings saved.'); onSaved(); }
  };
  const purge = async () => {
    const { data, error } = await sb.rpc('admin_chat_purge');
    if (error) toast(errText(error), 'err'); else { toast(`${data as number} old conversation(s) deleted.`); onSaved(); }
  };
  return (
    <Card className="mb-4" >
      <h2 className="mb-2 text-sm font-semibold text-gold">Chat settings</h2>
      <Toggle label="Show the live chat widget on the website" hint="Off = the chat button disappears for visitors" checked={d.enabled} onChange={(v) => setD({ ...d, enabled: v })} />
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="Automatic welcome message" hint="Shown at the start of every new chat"><Textarea rows={3} maxLength={300} value={d.welcome_message} onChange={(e) => setD({ ...d, welcome_message: e.target.value })} /></Field>
        <Field label="Offline response" hint="Sent once per 30 minutes when you are offline"><Textarea rows={3} maxLength={300} value={d.offline_message} onChange={(e) => setD({ ...d, offline_message: e.target.value })} /></Field>
        <Field label="Keep conversations for (days)" hint="7–3650. Older chats are deleted automatically when a new chat starts, or with the button below."><Input inputMode="numeric" value={String(d.retention_days)} onChange={(e) => setD({ ...d, retention_days: Number(e.target.value.replace(/\D/g, '')) || 0 })} /></Field>
      </div>
      {bad && <p className="mt-2 text-xs text-red-300">Retention must be between 7 and 3650 days.</p>}
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <Btn onClick={() => void purge()}>Delete chats older than retention now</Btn>
        <Btn tone="gold" busy={busy} disabled={!dirty || bad} onClick={() => void save()}>Save chat settings</Btn>
      </div>
    </Card>
  );
}
