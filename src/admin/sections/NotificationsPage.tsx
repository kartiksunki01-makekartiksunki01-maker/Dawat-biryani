import { BellRing, CheckCheck, RefreshCw } from 'lucide-react';
import { useEffect } from 'react';
import { useNotifications } from '../notifications';
import { Badge, Btn, Card, Empty, fmtDT, Notice, PageHeader, Skeleton, Toggle, useAdmin } from '../ui';

const KIND: Record<string, { label: string; go: string }> = {
  new_order: { label: 'Order', go: 'orders' },
  order_update: { label: 'Order update', go: 'orders' },
  new_bulk: { label: 'Bulk enquiry', go: 'bulk' },
  new_enquiry: { label: 'Enquiry', go: 'leads' },
};

export function NotificationsPage() {
  const { go } = useAdmin();
  const n = useNotifications();
  const { reload } = n;
  useEffect(() => { void reload(); }, [reload]); // always fresh when opened
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
      {n.error && <Notice kind="err">{n.error}</Notice>}
      {n.loading ? <Skeleton rows={4} /> : !n.items.length ? <Empty title="No notifications yet">New orders and enquiries will appear here.</Empty> : (
        <ul className="space-y-2">
          {n.items.map((x) => {
            const read = n.readIds.has(x.id);
            return (
              <li key={x.id} className={`flex flex-wrap items-center gap-3 rounded-xl border p-3 ${read ? 'border-white/10 bg-white/[0.02] text-ivory/65' : 'border-gold/40 bg-gold/[0.05]'}`}>
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
      )}
    </section>
  );
}
