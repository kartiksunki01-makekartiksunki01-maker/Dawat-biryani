import { useCallback, useEffect, useMemo, useState } from 'react';
import { addDays, Field, Input, Select, errText, istToday, useAdmin } from '../ui';

export interface Stats {
  orders: number;
  by_status: Record<string, number>;
  order_value: number;
  completed_value: number;
  paid_value: number;
  unique_customers: number;
  returning_customers: number;
  daily: { date: string; orders: number; completed_value: number; paid_value: number }[];
  new_enquiries: number;
  active_offers: number;
  available_dishes: number;
  sold_out_dishes: number;
  pending_now: number;
}

export const RANGE_OPTIONS = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: '7d', label: 'Last 7 days' },
  { id: '30d', label: 'Last 30 days' },
  { id: 'custom', label: 'Custom range' },
] as const;
export type RangeId = (typeof RANGE_OPTIONS)[number]['id'];

export function useRange(initial: RangeId) {
  const [range, setRange] = useState<RangeId>(initial);
  const [from, setFrom] = useState(addDays(istToday(), -6));
  const [to, setTo] = useState(istToday());
  const dates = useMemo<[string, string]>(() => {
    const t = istToday();
    if (range === 'today') return [t, t];
    if (range === 'yesterday') return [addDays(t, -1), addDays(t, -1)];
    if (range === '7d') return [addDays(t, -6), t];
    if (range === '30d') return [addDays(t, -29), t];
    return [from, to];
  }, [range, from, to]);
  const picker = (
    <div className="flex flex-wrap items-end gap-2">
      <Select aria-label="Date range" value={range} onChange={(e) => setRange(e.target.value as RangeId)} className="!w-44">
        {RANGE_OPTIONS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
      </Select>
      {range === 'custom' && (
        <>
          <Field label="From"><Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="To"><Input type="date" value={to} min={from} max={istToday()} onChange={(e) => setTo(e.target.value)} /></Field>
        </>
      )}
    </div>
  );
  return { dates, picker };
}

export function useStats(from: string, to: string, tick = 0) {
  const { sb } = useAdmin();
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    const { data, error: e } = await sb.rpc('admin_stats', { p_from: from, p_to: to });
    if (e) { setError(errText(e, 'Could not load statistics.')); return; }
    setError('');
    const s = data as Stats;
    setStats({
      ...s,
      order_value: Number(s.order_value), completed_value: Number(s.completed_value), paid_value: Number(s.paid_value),
      daily: s.daily.map((d) => ({ ...d, completed_value: Number(d.completed_value), paid_value: Number(d.paid_value) })),
    });
  }, [sb, from, to]);
  useEffect(() => { void load(); }, [load, tick]);
  return { stats, error, reload: load };
}

export const dayLabel = (d: string) =>
  new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${d}T00:00:00Z`));
