import { useEffect, useState } from 'react';
import { Card, ColumnChart, Notice, PageHeader, Skeleton, Stat, errText, inr, useAdmin } from '../ui';
import { dayLabel, useRange, useStats } from './stats';

interface ItemRow { dish_name: string; qty: number; line_total: number }

export function Analytics() {
  const { sb } = useAdmin();
  const { dates, picker } = useRange('30d');
  const { stats, error } = useStats(dates[0], dates[1]);
  const [top, setTop] = useState<{ name: string; qty: number; value: number }[] | null>(null);
  const [topErr, setTopErr] = useState('');

  useEffect(() => {
    void sb.from('order_items').select('dish_name,qty,line_total,orders!inner(order_date,status)')
      .gte('orders.order_date', dates[0]).lte('orders.order_date', dates[1]).not('orders.status', 'in', '(cancelled,rejected)')
      .limit(5000)
      .then(({ data, error: e }) => {
        if (e) { setTopErr(errText(e, 'Could not load dish totals.')); return; }
        const m = new Map<string, { name: string; qty: number; value: number }>();
        for (const r of (data as unknown as ItemRow[]) ?? []) {
          const x = m.get(r.dish_name) ?? { name: r.dish_name, qty: 0, value: 0 };
          x.qty += r.qty;
          x.value += Number(r.line_total);
          m.set(r.dish_name, x);
        }
        setTop([...m.values()].sort((a, b) => b.qty - a.qty).slice(0, 10));
      });
  }, [sb, dates]);

  const s = stats;
  const maxQty = Math.max(1, ...(top ?? []).map((t) => t.qty));
  return (
    <section aria-label="Business analytics">
      <PageHeader title="Business Analytics" intro="Calculated from stored orders only — nothing is estimated or generated." actions={picker} />
      {error && <Notice kind="err">{error}</Notice>}
      {!s ? <Skeleton rows={3} /> : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Orders" value={s.orders} />
            <Stat label="Average order value" value={s.orders ? inr(s.order_value / Math.max(1, s.orders - (s.by_status.cancelled ?? 0) - (s.by_status.rejected ?? 0))) : '—'} hint="Excl. cancelled/rejected" />
            <Stat label="Completed sales" value={inr(s.completed_value)} />
            <Stat label="Payments recorded" value={inr(s.paid_value)} />
          </div>
          <ColumnChart title="Orders per day" data={s.daily.map((d) => ({ label: dayLabel(d.date), value: d.orders }))} />
          <div className="grid gap-4 lg:grid-cols-2">
            <ColumnChart title="Completed sales per day (₹)" data={s.daily.map((d) => ({ label: dayLabel(d.date), value: d.completed_value }))} format={(v) => inr(v)} />
            <ColumnChart title="Payments recorded per day (₹)" data={s.daily.map((d) => ({ label: dayLabel(d.date), value: d.paid_value }))} format={(v) => inr(v)} />
          </div>
          <Card>
            <h3 className="mb-3 text-sm font-semibold">Most ordered dishes</h3>
            {topErr && <Notice kind="err">{topErr}</Notice>}
            {!top ? <Skeleton rows={2} /> : !top.length ? <p className="text-sm text-ivory/55">No orders in this range.</p> : (
              <ul className="space-y-2">
                {top.map((t) => (
                  <li key={t.name} className="text-sm">
                    <div className="flex justify-between gap-2"><span>{t.name}</span><span className="font-num text-ivory/70">{t.qty} sold · {inr(t.value)}</span></div>
                    <div className="mt-1 h-2 rounded-full bg-white/5"><div className="h-2 rounded-full" style={{ width: `${(t.qty / maxQty) * 100}%`, background: '#A8862A' }} /></div>
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
