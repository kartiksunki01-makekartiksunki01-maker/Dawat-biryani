import { BellRing, CheckCheck, Download, RefreshCw, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNotifications } from '../notifications';
import { BulkDeleteDialog, SelectBox, SelectionBar, useSelection } from '../selection';
import { Badge, Btn, Card, downloadCsv, Empty, errText, fmtDT, istToday, Notice, PageHeader, Select, Skeleton, Toggle, useAdmin } from '../ui';

const KIND: Record<string, { label: string; go: string }> = {
  new_order: { label: 'Order', go: 'orders' },
  order_update: { label: 'Order update', go: 'orders' },
  new_bulk: { label: 'Bulk enquiry', go: 'bulk' },
  new_enquiry: { label: 'Enquiry', go: 'leads' },
  new_chat: { label: 'Chat', go: 'chat' },
};

export function NotificationsPage() {
  const { go, sb } = useAdmin();
  const n = useNotifications();
  const { reload } = n;
  useEffect(() => { void reload(); }, [reload]); // always fresh when opened
  const [filter, setFilter] = useState('all');
  const [delOpen, setDelOpen] = useState(false);
  const shown = useMemo(() => n.items.filter((x) => {
    if (filter === 'read') return n.readIds.has(x.id);
    if (filter === 'unread') return !n.readIds.has(x.id);
    if (filter === 'old') return new Date(x.created_at).getTime() < Date.now() - 30 * 864e5;
    return true;
  }), [n.items, n.readIds, filter]);
  const sel = useSelection(shown.map((x) => x.id));
  const picked = shown.filter((x) => sel.has(x.id));
  const csv = () => downloadCsv(`dawat-notifications-${istToday()}.csv`, ['Date', 'Type', 'Title', 'Details', 'Read'],
    picked.map((x) => [x.created_at, KIND[x.kind]?.label ?? x.kind, x.title, x.body, n.readIds.has(x.id) ? 'yes' : 'no']));
  return (
    <section aria-label="Notifications">
      <PageHeader title="Notifications" intro="One notification per real event. Old notifications stay here but never pop up or ring again."
        actions={<>
          <Btn onClick={() => void n.reload()}><RefreshCw size={16} /> Refresh</Btn>
          <Btn tone="gold" disabled={!n.unread} onClick={() => void n.markAllRead()}><CheckCheck size={16} /> Mark all as read</Btn>
        </>} />
      <Card className="mb-4">
        <p className="mb-1 text-xs text-ivory/55">{n.live ? 'Live updates connected.' : 'Live updates not connected — checking every 30 seconds instead.'}</p>
        <Toggle label="Sound for new notifications" hint="Plays once per new event, never for old ones" checked={n.soundOn} onChange={n.setSoundOn} />
        <Toggle label="Browser notifications" hint="Shows a system notification when this tab is in the background (asks permission)" checked={n.browserOn} onChange={(v) => (v ? void n.enableBrowser() : n.disableBrowser())} />
      </Card>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Select aria-label="Show notifications" value={filter} onChange={(e) => setFilter(e.target.value)} className="!w-52">
          <option value="all">All notifications</option>
          <option value="unread">Unread</option>
          <option value="read">Read</option>
          <option value="old">Older than 30 days</option>
        </Select>
      </div>
      {n.error && <Notice kind="err">{n.error}</Notice>}
      {n.loading ? <Skeleton rows={4} /> : !shown.length ? <Empty title="No notifications here">New orders and enquiries will appear here.</Empty> : (
        <>
          <SelectionBar sel={sel} selectableIds={shown.map((x) => x.id)} noun="notification">
            <Btn onClick={csv}><Download size={16} /> CSV of selected</Btn>
            <Btn tone="danger" onClick={() => setDelOpen(true)}><Trash2 size={16} /> Delete…</Btn>
          </SelectionBar>
          <ul className="space-y-2">
            {shown.map((x) => {
              const read = n.readIds.has(x.id);
              return (
                <li key={x.id} className={`flex flex-wrap items-center gap-3 rounded-xl border p-3 ${read ? 'border-white/10 bg-white/[0.02] text-ivory/65' : 'border-gold/40 bg-gold/[0.05]'}`}>
                  <SelectBox checked={sel.has(x.id)} onChange={(v) => sel.toggle(x.id, v)} label={`Select notification ${x.title}`} />
                  <BellRing size={18} className={read ? 'text-ivory/40' : 'text-gold'} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{x.title} <Badge>{KIND[x.kind]?.label ?? x.kind}</Badge> {!read && <Badge tone="gold">Unread</Badge>}</p>
                    <p className="text-xs text-ivory/55">{x.body} · {fmtDT(x.created_at)}</p>
                  </div>
                  <Btn tone="quiet" onClick={() => { void n.markRead(x.id); go(KIND[x.kind]?.go ?? 'orders'); }}>Open</Btn>
                  {!read && <Btn tone="quiet" onClick={() => void n.markRead(x.id)}>Mark read</Btn>}
                </li>
              );
            })}
          </ul>
        </>
      )}
      <BulkDeleteDialog open={delOpen} onClose={() => setDelOpen(false)} title="Delete notifications?" ids={sel.ids} batch={100}
        sample={picked.map((x) => `${x.title} · ${fmtDT(x.created_at)}`)}
        explain={<>Only the notifications are removed. The orders, enquiries and chats they point to are not touched.</>}
        onCsv={csv}
        run={async (chunk) => {
          const { data, error } = await sb.from('notifications').delete().in('id', chunk).select('id');
          if (error) throw new Error(errText(error));
          return { deleted: (data as unknown[]).length, skipped: [] };
        }}
        onDone={() => { sel.clear(); void n.reload(); }} />
    </section>
  );
}
