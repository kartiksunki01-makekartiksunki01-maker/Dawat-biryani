import { Archive, Download, Phone, Printer, RefreshCw, Search, Undo2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { PAYMENT_LABEL, STATUS_LABEL, type OrderJSON, type OrderStatus } from '../../lib/api';
import { downloadReceiptPdf, printReceipt } from '../../lib/receipt';
import { useNotifications } from '../notifications';
import {
  addDays, Badge, Btn, Card, Confirm, downloadCsv, Empty, errText, Field, fmtDT, Input, inr, istToday, Modal, Notice, PageHeader,
  Select, Skeleton, Textarea, useAdmin, waLink,
} from '../ui';

export interface OrderRow {
  id: string;
  bill_number: string;
  created_at: string;
  order_date: string;
  customer_id: string | null;
  customer_name: string;
  customer_phone: string | null;
  mode: 'pickup' | 'delivery';
  delivery_address: string | null;
  scheduled_for: string | null;
  instructions: string | null;
  status: OrderStatus;
  status_reason: string | null;
  payment_status: 'unpaid' | 'paid' | 'refunded';
  payment_method: string | null;
  subtotal: number;
  discount: number;
  delivery_charge: number;
  tax: number;
  total: number;
  coupon_code: string | null;
  prep_minutes: number | null;
  admin_notes: string | null;
  source: string;
  archived_at: string | null;
  order_items: { dish_name: string; variant_label: string; qty: number; unit_price: number; line_total: number; note: string | null }[];
}

export const ORDER_COLS =
  'id,bill_number,created_at,order_date,customer_id,customer_name,customer_phone,mode,delivery_address,scheduled_for,instructions,status,status_reason,payment_status,payment_method,subtotal,discount,delivery_charge,tax,total,coupon_code,prep_minutes,admin_notes,source,archived_at,order_items(dish_name,variant_label,qty,unit_price,line_total,note)';

const NEXT: Record<OrderStatus, OrderStatus[]> = {
  pending: ['confirmed', 'rejected', 'cancelled'],
  confirmed: ['preparing', 'ready', 'out_for_delivery', 'cancelled'],
  preparing: ['ready', 'out_for_delivery', 'cancelled'],
  ready: ['completed', 'cancelled'],
  out_for_delivery: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
  rejected: [],
};
export const nextStatuses = (o: Pick<OrderRow, 'status' | 'mode'>) =>
  NEXT[o.status].filter((s) => (s === 'ready' ? o.mode === 'pickup' : s === 'out_for_delivery' ? o.mode === 'delivery' : true));

export const statusTone = (s: OrderStatus) =>
  s === 'pending' ? 'warn' : s === 'completed' ? 'good' : s === 'cancelled' || s === 'rejected' ? 'bad' : 'info';

const RANGES = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: '7d', label: 'Last 7 days' },
  { id: '30d', label: 'Last 30 days' },
  { id: 'all', label: 'All time' },
  { id: 'custom', label: 'Custom' },
] as const;

const SEEN_KEY = 'dawat-admin-seen-orders';
const seenSet = () => { try { return new Set<string>(JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]')); } catch { return new Set<string>(); } };

export function Orders({ billsMode = false }: { billsMode?: boolean }) {
  const { sb, toast } = useAdmin();
  const { orderTick } = useNotifications();
  const [rows, setRows] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [range, setRange] = useState<(typeof RANGES)[number]['id']>(billsMode ? '30d' : 'today');
  const [from, setFrom] = useState(istToday());
  const [to, setTo] = useState(istToday());
  const [status, setStatus] = useState<'all' | 'open' | OrderStatus>(billsMode ? 'all' : 'open');
  const [q, setQ] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [seen, setSeen] = useState(seenSet);

  const dates = useMemo(() => {
    const t = istToday();
    switch (range) {
      case 'today': return [t, t];
      case 'yesterday': return [addDays(t, -1), addDays(t, -1)];
      case '7d': return [addDays(t, -6), t];
      case '30d': return [addDays(t, -29), t];
      case 'custom': return [from, to];
      default: return [null, null];
    }
  }, [range, from, to]);

  const load = useCallback(async () => {
    let query = sb.from('orders').select(ORDER_COLS).order('created_at', { ascending: false }).limit(500);
    // "Open orders" means everything still waiting for action — from ANY day (the red badge counts them the same way)
    if (status !== 'open') {
      if (dates[0]) query = query.gte('order_date', dates[0]);
      if (dates[1]) query = query.lte('order_date', dates[1]);
    }
    if (!showArchived) query = query.is('archived_at', null);
    const { data, error } = await query;
    setLoading(false);
    if (error) setErr(errText(error, 'Could not load orders.'));
    else {
      setErr('');
      setRows((data as unknown as OrderRow[]).map((o) => ({ ...o, total: Number(o.total), subtotal: Number(o.subtotal), discount: Number(o.discount), delivery_charge: Number(o.delivery_charge), tax: Number(o.tax) })));
    }
  }, [sb, dates, showArchived, status]);

  useEffect(() => { void load(); }, [load, orderTick]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase().replace(/\s+/g, '');
    return rows.filter((o) => {
      if (status === 'open' && ['completed', 'cancelled', 'rejected'].includes(o.status)) return false;
      if (status !== 'all' && status !== 'open' && o.status !== status) return false;
      if (!needle) return true;
      return `${o.bill_number}${o.id}${o.customer_name}${o.customer_phone ?? ''}`.toLowerCase().replace(/\s+/g, '').includes(needle);
    });
  }, [rows, status, q]);

  const markSeen = (id: string) => {
    const s = new Set(seen).add(id);
    setSeen(s);
    try { localStorage.setItem(SEEN_KEY, JSON.stringify([...s].slice(-500))); } catch { /* ignore */ }
  };

  const exportCsv = () =>
    downloadCsv(`dawat-${billsMode ? 'bills' : 'orders'}-${istToday()}.csv`,
      ['Bill number', 'Order ID', 'Created', 'Customer', 'Phone', 'Mode', 'Scheduled for', 'Items', 'Subtotal', 'Discount', 'Delivery', 'Tax', 'Total', 'Status', 'Payment', 'Payment method', 'Coupon'],
      shown.map((o) => [o.bill_number, o.id, o.created_at, o.customer_name, o.customer_phone, o.mode, o.scheduled_for ?? 'ASAP',
        o.order_items.map((i) => `${i.qty}x ${i.dish_name}${i.variant_label ? ` (${i.variant_label})` : ''}`).join('; '),
        o.subtotal, o.discount, o.delivery_charge, o.tax, o.total, STATUS_LABEL[o.status], PAYMENT_LABEL[o.payment_status], o.payment_method, o.coupon_code]));

  const quick = async (o: OrderRow, next: OrderStatus) => {
    const { error } = await sb.from('orders').update({ status: next }).eq('id', o.id);
    if (error) toast(errText(error), 'err');
    else { toast(`${o.bill_number}: ${STATUS_LABEL[next]}`); void load(); }
  };

  const open = rows.find((r) => r.id === openId) ?? null;

  return (
    <section aria-label={billsMode ? 'Bills and receipts' : 'Orders'}>
      <PageHeader
        title={billsMode ? 'Bills & Receipts' : 'Orders'}
        intro={billsMode ? 'Every order has a unique bill number. Search by bill number, print or download the receipt.' : 'New orders appear here automatically. Accept, prepare and complete them; payment is recorded separately.'}
        actions={<>
          <Btn onClick={() => void load()}><RefreshCw size={16} /> Refresh</Btn>
          <Btn tone="gold" onClick={exportCsv} disabled={!shown.length}><Download size={16} /> Export CSV</Btn>
        </>}
      />
      <Card className="mb-4">
        <div className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
          <label className="relative">
            <span className="sr-only">Search orders</span>
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ivory/40" />
            <Input className="pl-9" placeholder={billsMode ? 'Bill number (e.g. DBH-20261124-0001)' : 'Bill no., order ID, name or phone'} value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <Select value={range} onChange={(e) => setRange(e.target.value as typeof range)} aria-label="Date range" disabled={status === 'open'} title={status === 'open' ? 'Open orders are shown from every day' : undefined} className="md:w-40 disabled:opacity-50">
            {RANGES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </Select>
          <Select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} aria-label="Status" className="md:w-48">
            <option value="open">Open orders</option>
            <option value="all">All statuses</option>
            {(Object.keys(STATUS_LABEL) as OrderStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </Select>
        </div>
        {status === 'open' && <p className="mt-2 text-xs text-ivory/55">Showing every order still waiting for action, from any day. Choose another status to filter by date.</p>}
        {status !== 'open' && range === 'custom' && (
          <div className="mt-3 grid grid-cols-2 gap-3 sm:w-96">
            <Field label="From"><Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></Field>
            <Field label="To"><Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></Field>
          </div>
        )}
        <label className="mt-3 flex items-center gap-2 text-xs text-ivory/60">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="h-4 w-4 accent-[#D4AF37]" /> Include archived
        </label>
      </Card>

      {err && <Notice kind="err">{err}</Notice>}
      {loading ? <Skeleton rows={4} /> : !shown.length ? (
        <Empty title="No orders here">Orders placed on the website show up automatically. Try a wider date range.</Empty>
      ) : (
        <ul className="space-y-3">
          {shown.map((o) => {
            const isNew = o.status === 'pending' && !seen.has(o.id);
            return (
              <li key={o.id} className={`rounded-xl border bg-white/[0.03] p-4 ${isNew ? 'border-gold/70 shadow-[0_0_0_1px_rgba(212,175,55,0.4)]' : 'border-white/10'} ${o.archived_at ? 'opacity-60' : ''}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <button type="button" className="min-w-0 text-left" onClick={() => { setOpenId(o.id); markSeen(o.id); }}>
                    <p className="font-num text-base text-gold">{o.bill_number} {isNew && <Badge tone="gold">NEW</Badge>}</p>
                    <p className="text-sm text-ivory">{o.customer_name} · {o.customer_phone ?? 'no phone'}</p>
                    <p className="text-xs text-ivory/50">{fmtDT(o.created_at)} · {o.mode === 'pickup' ? 'Pickup' : 'Delivery'} · {o.scheduled_for ? `for ${fmtDT(o.scheduled_for)}` : 'ASAP'}</p>
                    <p className="mt-1 text-xs text-ivory/70">{o.order_items.map((i) => `${i.qty}× ${i.dish_name}${i.variant_label ? ` (${i.variant_label})` : ''}`).join(', ')}</p>
                  </button>
                  <div className="flex flex-col items-end gap-1">
                    <p className="font-num text-lg font-semibold">{inr(o.total)}</p>
                    <div className="flex flex-wrap justify-end gap-1">
                      <Badge tone={statusTone(o.status)}>{STATUS_LABEL[o.status]}</Badge>
                      <Badge tone={o.payment_status === 'paid' ? 'good' : o.payment_status === 'refunded' ? 'info' : 'neutral'}>{PAYMENT_LABEL[o.payment_status]}</Badge>
                      {o.archived_at && <Badge>Archived</Badge>}
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {!billsMode && o.status === 'pending' && <Btn tone="gold" onClick={() => void quick(o, 'confirmed')}>Accept</Btn>}
                  {!billsMode && o.status === 'confirmed' && <Btn onClick={() => void quick(o, 'preparing')}>Start preparing</Btn>}
                  {!billsMode && o.status === 'preparing' && <Btn onClick={() => void quick(o, o.mode === 'pickup' ? 'ready' : 'out_for_delivery')}>{o.mode === 'pickup' ? 'Ready for pickup' : 'Out for delivery'}</Btn>}
                  {!billsMode && (o.status === 'ready' || o.status === 'out_for_delivery') && <Btn onClick={() => void quick(o, 'completed')}>Complete</Btn>}
                  <Btn tone="quiet" onClick={() => { setOpenId(o.id); markSeen(o.id); }}>{billsMode ? 'Receipt & details' : 'Details'}</Btn>
                  {o.customer_phone && <a className="inline-flex min-h-[40px] items-center gap-1 rounded-lg px-3 text-sm text-ivory/70 hover:bg-white/10" href={`tel:+91${o.customer_phone}`}><Phone size={14} /> Call</a>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {open && <OrderDetail order={open} onClose={() => setOpenId(null)} onChanged={() => void load()} />}
    </section>
  );
}

export function OrderDetail({ order: o, onClose, onChanged }: { order: OrderRow; onClose: () => void; onChanged: () => void }) {
  const { sb, toast } = useAdmin();
  const [reasonFor, setReasonFor] = useState<OrderStatus | null>(null);
  const [reason, setReason] = useState('');
  const [prep, setPrep] = useState(String(o.prep_minutes ?? ''));
  const [notes, setNotes] = useState(o.admin_notes ?? '');
  const [pay, setPay] = useState(o.payment_status);
  const [method, setMethod] = useState(o.payment_method ?? '');
  const [busy, setBusy] = useState('');
  const [confirmArchive, setConfirmArchive] = useState(false);

  const update = async (patch: Record<string, unknown>, label: string) => {
    setBusy(label);
    const { error } = await sb.from('orders').update(patch).eq('id', o.id);
    setBusy('');
    if (error) { toast(errText(error), 'err'); return false; }
    toast(`${o.bill_number}: ${label}`);
    onChanged();
    return true;
  };
  const setStatus = async (s: OrderStatus) => {
    if (s === 'rejected' || s === 'cancelled') { setReasonFor(s); setReason(''); return; }
    await update({ status: s }, STATUS_LABEL[s]);
  };
  const fullOrder = async (): Promise<OrderJSON | null> => {
    const { data, error } = await sb.rpc('admin_get_order', { p_order_id: o.id });
    if (error || !data) { toast(errText(error, 'Could not load the receipt.'), 'err'); return null; }
    const d = data as OrderJSON;
    return { ...d, subtotal: Number(d.subtotal), discount: Number(d.discount), delivery_charge: Number(d.delivery_charge), tax: Number(d.tax), total: Number(d.total), items: d.items.map((i) => ({ ...i, unit_price: Number(i.unit_price), line_total: Number(i.line_total) })) };
  };
  const wa = waLink(o.customer_phone, `Namaste ${o.customer_name}, this is Dawat Biryani House about your order ${o.bill_number}.`);

  return (
    <Modal open onClose={onClose} title={`Order ${o.bill_number}`} wide>
      <div className="space-y-5 text-sm">
        <div className="flex flex-wrap gap-2">
          <Badge tone={statusTone(o.status)}>{STATUS_LABEL[o.status]}</Badge>
          <Badge tone={o.payment_status === 'paid' ? 'good' : 'neutral'}>{PAYMENT_LABEL[o.payment_status]}{o.payment_method ? ` · ${o.payment_method}` : ''}</Badge>
          <Badge>{o.mode === 'pickup' ? 'Pickup' : 'Delivery'}</Badge>
          {o.source !== 'website' && <Badge tone="gold">{o.source}</Badge>}
        </div>
        <dl className="grid gap-3 sm:grid-cols-2">
          <div><dt className="text-xs text-ivory/50">Customer</dt><dd>{o.customer_name}</dd></div>
          <div><dt className="text-xs text-ivory/50">Phone</dt><dd className="font-num">{o.customer_phone ?? '—'}</dd></div>
          <div><dt className="text-xs text-ivory/50">Placed</dt><dd>{fmtDT(o.created_at)}</dd></div>
          <div><dt className="text-xs text-ivory/50">Wanted</dt><dd>{o.scheduled_for ? fmtDT(o.scheduled_for) : 'As soon as possible'}</dd></div>
          {o.delivery_address && <div className="sm:col-span-2"><dt className="text-xs text-ivory/50">Delivery address</dt><dd>{o.delivery_address}</dd></div>}
          {o.instructions && <div className="sm:col-span-2"><dt className="text-xs text-ivory/50">Customer instructions</dt><dd className="rounded-lg bg-amber-500/10 p-2">{o.instructions}</dd></div>}
          {o.status_reason && <div className="sm:col-span-2"><dt className="text-xs text-ivory/50">Reason</dt><dd>{o.status_reason}</dd></div>}
          <div className="sm:col-span-2"><dt className="text-xs text-ivory/50">Order ID</dt><dd className="break-all font-mono text-xs">{o.id}</dd></div>
        </dl>
        <table className="w-full text-sm">
          <thead><tr className="border-b border-white/10 text-left text-xs text-ivory/50"><th className="py-1 font-normal">Item</th><th className="py-1 text-center font-normal">Qty</th><th className="py-1 text-right font-normal">Amount</th></tr></thead>
          <tbody>
            {o.order_items.map((i, n) => (
              <tr key={n} className="border-b border-white/5 align-top">
                <td className="py-1.5">{i.dish_name}{i.variant_label ? ` (${i.variant_label})` : ''} <span className="text-xs text-ivory/45">@ {inr(i.unit_price)}</span>{i.note && <span className="block text-xs text-amber-200">Note: {i.note}</span>}</td>
                <td className="py-1.5 text-center">{i.qty}</td>
                <td className="py-1.5 text-right font-num">{inr(i.line_total)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="text-sm">
            <tr><td colSpan={2} className="pt-2 text-ivory/60">Subtotal</td><td className="pt-2 text-right font-num">{inr(o.subtotal)}</td></tr>
            {o.discount > 0 && <tr><td colSpan={2} className="text-ivory/60">Discount {o.coupon_code ? `(${o.coupon_code})` : ''}</td><td className="text-right font-num">− {inr(o.discount)}</td></tr>}
            {o.delivery_charge > 0 && <tr><td colSpan={2} className="text-ivory/60">Delivery</td><td className="text-right font-num">{inr(o.delivery_charge)}</td></tr>}
            {o.tax > 0 && <tr><td colSpan={2} className="text-ivory/60">Tax</td><td className="text-right font-num">{inr(o.tax)}</td></tr>}
            <tr className="font-semibold"><td colSpan={2}>Total</td><td className="text-right font-num text-gold">{inr(o.total)}</td></tr>
          </tfoot>
        </table>

        <Card>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gold">Order status</p>
          {nextStatuses(o).length ? (
            <div className="flex flex-wrap gap-2">
              {nextStatuses(o).map((s) => (
                <Btn key={s} tone={s === 'rejected' || s === 'cancelled' ? 'danger' : s === 'confirmed' ? 'gold' : 'ghost'} busy={busy === STATUS_LABEL[s]} onClick={() => void setStatus(s)}>
                  {s === 'confirmed' ? 'Accept order' : s === 'rejected' ? 'Reject' : s === 'cancelled' ? 'Cancel order' : `Mark ${STATUS_LABEL[s].toLowerCase()}`}
                </Btn>
              ))}
            </div>
          ) : <p className="text-xs text-ivory/55">This order is {STATUS_LABEL[o.status].toLowerCase()} — no further status changes.</p>}
          <div className="mt-3 flex items-end gap-2">
            <Field label="Preparation time (minutes, shown to customer)"><Input inputMode="numeric" value={prep} onChange={(e) => setPrep(e.target.value.replace(/\D/g, '').slice(0, 3))} className="!w-28" /></Field>
            <Btn busy={busy === 'Prep time saved'} onClick={() => void update({ prep_minutes: prep ? Number(prep) : null }, 'Prep time saved')} disabled={!!prep && (Number(prep) < 1 || Number(prep) > 600)}>Save</Btn>
          </div>
        </Card>

        <Card>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gold">Payment (recorded by you)</p>
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Payment status">
              <Select value={pay} onChange={(e) => setPay(e.target.value as typeof pay)} className="!w-36">
                <option value="unpaid">Unpaid</option><option value="paid">Paid</option><option value="refunded">Refunded</option>
              </Select>
            </Field>
            <Field label="Method">
              <Select value={method} onChange={(e) => setMethod(e.target.value)} className="!w-32">
                <option value="">—</option><option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option><option value="other">Other</option>
              </Select>
            </Field>
            <Btn busy={busy === 'Payment saved'} disabled={pay === o.payment_status && method === (o.payment_method ?? '')} onClick={() => void update({ payment_status: pay, payment_method: method || null }, 'Payment saved')}>Save payment</Btn>
          </div>
          <p className="mt-2 text-[11px] text-ivory/45">Mark “Paid” only after you have actually received the money.</p>
        </Card>

        <Field label="Private notes (customers never see these)">
          <Textarea rows={2} value={notes} maxLength={2000} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <Btn busy={busy === 'Notes saved'} disabled={notes === (o.admin_notes ?? '')} onClick={() => void update({ admin_notes: notes.trim() || null }, 'Notes saved')}>Save notes</Btn>

        <div className="flex flex-wrap gap-2 border-t border-white/10 pt-4">
          <Btn onClick={async () => { const d = await fullOrder(); if (d) await printReceipt(d); }}><Printer size={16} /> Print receipt</Btn>
          <Btn onClick={async () => { const d = await fullOrder(); if (d) await downloadReceiptPdf(d); }}><Download size={16} /> Receipt PDF</Btn>
          {o.customer_phone && <a className="inline-flex min-h-[40px] items-center gap-1 rounded-lg border border-white/20 px-4 text-sm hover:bg-white/10" href={`tel:+91${o.customer_phone}`}><Phone size={16} /> Call</a>}
          {wa && <a className="inline-flex min-h-[40px] items-center rounded-lg border border-emerald-400/40 px-4 text-sm text-emerald-200 hover:bg-emerald-500/10" href={wa} target="_blank" rel="noopener noreferrer">WhatsApp customer</a>}
          {o.archived_at
            ? <Btn onClick={() => void update({ archived_at: null }, 'Restored')}><Undo2 size={16} /> Restore</Btn>
            : <Btn onClick={() => setConfirmArchive(true)} disabled={!['completed', 'cancelled', 'rejected'].includes(o.status)} title="Only finished orders can be archived"><Archive size={16} /> Archive</Btn>}
        </div>
      </div>

      <Modal open={!!reasonFor} onClose={() => setReasonFor(null)} title={reasonFor === 'rejected' ? 'Reject order' : 'Cancel order'}>
        <div className="space-y-3">
          <p className="text-sm text-ivory/70">The customer will see this reason on their order page. The bill number is kept and never reused.</p>
          <Field label="Reason *"><Textarea rows={2} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Mutton finished for today" /></Field>
          <div className="flex justify-end gap-2">
            <Btn onClick={() => setReasonFor(null)}>Back</Btn>
            <Btn tone="danger" busy={!!busy} disabled={reason.trim().length < 3} onClick={async () => { if (await update({ status: reasonFor, status_reason: reason.trim() }, STATUS_LABEL[reasonFor!])) setReasonFor(null); }}>
              {reasonFor === 'rejected' ? 'Reject order' : 'Cancel order'}
            </Btn>
          </div>
        </div>
      </Modal>
      <Confirm open={confirmArchive} title="Archive this order?" onClose={() => setConfirmArchive(false)}
        body={<p>The order is hidden from the default lists. Its bill, items and amounts are kept and it can be restored any time.</p>}
        confirmLabel="Archive" onConfirm={async () => { if (await update({ archived_at: new Date().toISOString() }, 'Archived')) setConfirmArchive(false); }} />
    </Modal>
  );
}
