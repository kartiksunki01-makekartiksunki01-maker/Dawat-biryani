import { Download, RefreshCw, Search } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { STATUS_LABEL } from '../../lib/api';
import { Badge, Btn, Confirm, downloadCsv, Empty, errText, Field, fmtDT, Input, inr, istToday, Modal, Notice, PageHeader, Skeleton, Textarea, useAdmin, waLink } from '../ui';
import { ActionMenu } from './Menu3';
import { ORDER_COLS, OrderDetail, statusTone, type OrderRow } from './Orders';

interface CustomerRow {
  id: string; name: string; phone: string | null; notes: string | null; archived_at: string | null; anonymised_at: string | null;
  created_at: string; first_order_at: string | null; last_order_at: string | null; orders: number; completed: number; cancelled: number; value: number;
}

export function Customers() {
  const { sb, toast } = useAdmin();
  const [rows, setRows] = useState<CustomerRow[] | null>(null);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [edit, setEdit] = useState<CustomerRow | null>(null);
  const [history, setHistory] = useState<CustomerRow | null>(null);
  const [remove, setRemove] = useState<CustomerRow | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await sb.rpc('admin_customers');
    if (error) { setErr(errText(error, 'Could not load customers.')); return; }
    setErr('');
    setRows((data as CustomerRow[]).map((c) => ({ ...c, value: Number(c.value) })));
  }, [sb]);
  useEffect(() => { void load(); }, [load]);

  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    return (rows ?? []).filter((c) => (showArchived || !c.archived_at) && (!n || `${c.name} ${c.phone ?? ''}`.toLowerCase().includes(n)));
  }, [rows, q, showArchived]);

  const setArchived = async (c: CustomerRow, archived: boolean) => {
    const { error } = await sb.from('customers').update({ archived_at: archived ? new Date().toISOString() : null }).eq('id', c.id);
    if (error) toast(errText(error), 'err'); else { toast(archived ? 'Customer archived.' : 'Customer restored.'); void load(); }
  };

  return (
    <section aria-label="Customers">
      <PageHeader title="Customers" intro="Built automatically from real orders. A phone number groups orders — it does not prove identity, so customers never see each other's data."
        actions={<>
          <Btn onClick={() => void load()}><RefreshCw size={16} /> Refresh</Btn>
          <Btn tone="gold" disabled={!shown.length} onClick={() => downloadCsv(`dawat-customers-${istToday()}.csv`, ['Name', 'Phone', 'Orders', 'Completed', 'Cancelled', 'Order value', 'First order', 'Last order', 'Notes'],
            shown.map((c) => [c.name, c.phone, c.orders, c.completed, c.cancelled, c.value, c.first_order_at, c.last_order_at, c.notes]))}><Download size={16} /> Export CSV</Btn>
        </>} />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="relative min-w-[220px] flex-1">
          <span className="sr-only">Search customers</span>
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ivory/40" />
          <Input className="pl-9" placeholder="Name or phone" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <label className="flex items-center gap-2 text-xs text-ivory/60"><input type="checkbox" className="h-4 w-4 accent-[#D4AF37]" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Show archived</label>
      </div>
      {err && <Notice kind="err">{err}</Notice>}
      {!rows ? <Skeleton rows={4} /> : !shown.length ? <Empty title="No customers yet">Customers appear here after their first order.</Empty> : (
        <ul className="grid gap-3 md:grid-cols-2">
          {shown.map((c) => (
            <li key={c.id} className={`rounded-xl border border-white/10 bg-white/[0.03] p-4 ${c.archived_at ? 'opacity-60' : ''}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{c.name} {c.anonymised_at && <Badge>Anonymised</Badge>} {c.archived_at && <Badge>Archived</Badge>}</p>
                  <p className="font-num text-sm text-ivory/60">{c.phone ?? '—'}</p>
                </div>
                <ActionMenu label={`Actions for ${c.name}`} items={[
                  { label: 'View order history', onClick: () => setHistory(c) },
                  { label: 'Edit name & notes', onClick: () => setEdit(c), disabled: !!c.anonymised_at },
                  c.archived_at ? { label: 'Restore customer', onClick: () => void setArchived(c, false) } : { label: 'Archive customer', onClick: () => void setArchived(c, true) },
                  { label: c.orders ? 'Delete personal data…' : 'Delete customer…', onClick: () => setRemove(c), danger: true, disabled: !!c.anonymised_at },
                ]} />
              </div>
              <dl className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded-lg bg-white/5 p-2"><dt className="text-ivory/50">Orders</dt><dd className="font-num text-base">{c.orders}</dd></div>
                <div className="rounded-lg bg-white/5 p-2"><dt className="text-ivory/50">Completed</dt><dd className="font-num text-base">{c.completed}</dd></div>
                <div className="rounded-lg bg-white/5 p-2"><dt className="text-ivory/50">Value</dt><dd className="font-num text-base">{inr(c.value)}</dd></div>
              </dl>
              <p className="mt-2 text-[11px] text-ivory/45">First order {fmtDT(c.first_order_at)} · Last {fmtDT(c.last_order_at)}{c.cancelled ? ` · ${c.cancelled} cancelled` : ''}</p>
              {c.notes && <p className="mt-2 rounded-lg bg-white/5 p-2 text-xs text-ivory/70">{c.notes}</p>}
              <div className="mt-3 flex gap-2">
                {c.phone && <a className="inline-flex min-h-[40px] items-center rounded-lg border border-white/20 px-3 text-sm hover:bg-white/10" href={`tel:+91${c.phone}`}>Call</a>}
                {waLink(c.phone) && <a className="inline-flex min-h-[40px] items-center rounded-lg border border-emerald-400/40 px-3 text-sm text-emerald-200 hover:bg-emerald-500/10" href={waLink(c.phone)!} target="_blank" rel="noopener noreferrer">WhatsApp</a>}
              </div>
            </li>
          ))}
        </ul>
      )}
      {edit && <EditCustomer c={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); void load(); }} />}
      {history && <History c={history} onClose={() => setHistory(null)} />}
      <Confirm open={!!remove} onClose={() => setRemove(null)} danger busy={busy} typeToConfirm="DELETE"
        title={remove?.orders ? 'Delete this customer’s personal data?' : 'Delete this customer?'}
        body={remove?.orders ? (
          <p>{remove.name} has {remove.orders} order(s). Their <b>name, phone number, address and notes</b> will be removed from the customer record and from those orders. <b>Bill numbers, items and amounts stay</b> so your accounts remain correct. This cannot be undone.</p>
        ) : <p>{remove?.name} has no orders. The customer record will be deleted permanently.</p>}
        confirmLabel={remove?.orders ? 'Anonymise' : 'Delete'}
        onConfirm={async () => {
          if (!remove) return;
          setBusy(true);
          const { data, error } = await sb.rpc('admin_remove_customer', { p_customer_id: remove.id });
          setBusy(false);
          if (error) toast(errText(error), 'err');
          else { toast(data === 'deleted' ? 'Customer deleted.' : 'Personal data removed; orders kept.'); setRemove(null); void load(); }
        }} />
    </section>
  );
}

function EditCustomer({ c, onClose, onSaved }: { c: CustomerRow; onClose: () => void; onSaved: () => void }) {
  const { sb, toast } = useAdmin();
  const [name, setName] = useState(c.name);
  const [notes, setNotes] = useState(c.notes ?? '');
  const [busy, setBusy] = useState(false);
  return (
    <Modal open onClose={onClose} title="Edit customer">
      <div className="space-y-3">
        <Field label="Name"><Input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Internal notes" hint="Only staff can see these."><Textarea rows={3} maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        <p className="text-[11px] text-ivory/45">The phone number can’t be edited here — it links this customer’s orders.</p>
        <div className="flex justify-end gap-2">
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn tone="gold" busy={busy} disabled={name.trim().length < 1} onClick={async () => {
            setBusy(true);
            const { error } = await sb.from('customers').update({ name: name.trim(), notes: notes.trim() || null }).eq('id', c.id);
            setBusy(false);
            if (error) toast(errText(error), 'err'); else { toast('Customer saved.'); onSaved(); }
          }}>Save</Btn>
        </div>
      </div>
    </Modal>
  );
}

function History({ c, onClose }: { c: CustomerRow; onClose: () => void }) {
  const { sb } = useAdmin();
  const [orders, setOrders] = useState<OrderRow[] | null>(null);
  const [open, setOpen] = useState<OrderRow | null>(null);
  const load = useCallback(() => {
    void sb.from('orders').select(ORDER_COLS).eq('customer_id', c.id).order('created_at', { ascending: false }).limit(200)
      .then(({ data }) => setOrders(((data as unknown as OrderRow[]) ?? []).map((o) => ({ ...o, total: Number(o.total) }))));
  }, [sb, c.id]);
  useEffect(load, [load]);
  return (
    <Modal open onClose={onClose} title={`Orders — ${c.name}`} wide>
      {!orders ? <Skeleton rows={2} /> : !orders.length ? <p className="text-sm text-ivory/55">No orders.</p> : (
        <ul className="divide-y divide-white/5">
          {orders.map((o) => (
            <li key={o.id}>
              <button type="button" className="flex w-full flex-wrap items-center justify-between gap-2 py-2 text-left text-sm hover:bg-white/5" onClick={() => setOpen(o)}>
                <span><b className="font-num text-gold">{o.bill_number}</b> · {fmtDT(o.created_at)}</span>
                <span className="flex items-center gap-2"><span className="font-num">{inr(o.total)}</span><Badge tone={statusTone(o.status)}>{STATUS_LABEL[o.status]}</Badge></span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && <OrderDetail order={open} onClose={() => setOpen(null)} onChanged={load} />}
    </Modal>
  );
}
