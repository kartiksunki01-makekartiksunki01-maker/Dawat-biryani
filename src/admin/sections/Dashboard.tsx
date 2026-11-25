import { useEffect, useState } from 'react';
import { STATUS_LABEL } from '../../lib/api';
import { useNotifications } from '../notifications';
import { Badge, Btn, Card, ColumnChart, Notice, PageHeader, Skeleton, Stat, fmtDT, inr, useAdmin } from '../ui';
import { statusTone, type OrderRow } from './Orders';
import { dayLabel, useRange, useStats } from './stats';

export function Dashboard() {
  const { sb, go } = useAdmin();
  const { orderTick, unread } = useNotifications();
  const { dates, picker } = useRange('today');
  const { stats, error } = useStats(dates[0], dates[1], orderTick);
  const [recent, setRecent] = useState<Pick<OrderRow, 'id' | 'bill_number' | 'customer_name' | 'total' | 'status' | 'created_at' | 'mode'>[] | null>(null);

  useEffect(() => {
    void sb.from('orders').select('id,bill_number,customer_name,total,status,created_at,mode').is('archived_at', null)
      .order('created_at', { ascending: false }).limit(6).then(({ data }) => setRecent((data as never) ?? []));
  }, [sb, orderTick]);

  const s = stats;
  const by = (k: string) => s?.by_status[k] ?? 0;
  return (
    <section aria-label="Dashboard">
      <PageHeader title="Dashboard" intro="Live numbers from your real orders. Order value, completed sales and payments recorded are shown separately." actions={picker} />
      {error && <Notice kind="err">{error}</Notice>}
      {!s ? <Skeleton rows={3} /> : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Orders in range" value={s.orders} />
            <Stat label="Pending right now" value={s.pending_now} tone={s.pending_now ? 'warn' : undefined} hint="All dates, not archived" />
            <Stat label="Confirmed / in progress" value={by('confirmed') + by('preparing') + by('ready') + by('out_for_delivery')} />
            <Stat label="Completed" value={by('completed')} />
            <Stat label="Cancelled / rejected" value={by('cancelled') + by('rejected')} />
            <Stat label="Unique customers" value={s.unique_customers} />
            <Stat label="Returning customers" value={s.returning_customers} hint="Same phone number ordered before" />
            <Stat label="New enquiries" value={s.new_enquiries} hint={unread ? `${unread} unread notifications` : undefined} />
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <Stat label="Order value (excl. cancelled/rejected)" value={inr(s.order_value)} />
            <Stat label="Completed sales" value={inr(s.completed_value)} />
            <Stat label="Payments recorded as paid" value={inr(s.paid_value)} hint="Only what you marked as Paid" />
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <Stat label="Active offers" value={s.active_offers} />
            <Stat label="Dishes available" value={s.available_dishes} />
            <Stat label="Sold out" value={s.sold_out_dishes} tone={s.sold_out_dishes ? 'warn' : undefined} />
          </div>
          {s.daily.length > 1 && (
            <div className="grid gap-4 lg:grid-cols-2">
              <ColumnChart title="Orders per day" data={s.daily.map((d) => ({ label: dayLabel(d.date), value: d.orders }))} />
              <ColumnChart title="Completed sales per day (₹)" data={s.daily.map((d) => ({ label: dayLabel(d.date), value: d.completed_value }))} format={(v) => inr(v)} />
            </div>
          )}
          <Card>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Recent orders</h2>
              <Btn tone="quiet" onClick={() => go('orders')}>Open orders</Btn>
            </div>
            {!recent ? <Skeleton rows={2} /> : !recent.length ? <p className="text-sm text-ivory/55">No orders yet.</p> : (
              <ul className="divide-y divide-white/5">
                {recent.map((o) => (
                  <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <span><b className="font-num text-gold">{o.bill_number}</b> · {o.customer_name} · <span className="text-ivory/50">{fmtDT(o.created_at)}</span></span>
                    <span className="flex items-center gap-2"><span className="font-num">{inr(o.total)}</span><Badge tone={statusTone(o.status)}>{STATUS_LABEL[o.status]}</Badge></span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </section>
  );
}
