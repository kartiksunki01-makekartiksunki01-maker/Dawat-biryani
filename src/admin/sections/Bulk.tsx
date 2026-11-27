import { Copy, Download, RefreshCw, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { trackUrl } from '../../lib/myOrders';
import { copyText } from '../../utils/order';
import { LEAD_STATUSES, LeadBulkDelete, LeadCard, useLeads, type Lead } from '../Leads';
import { useSelection } from '../selection';
import { Badge, Btn, Confirm, downloadCsv, Empty, errText, Field, Input, inr, istToday, Modal, Notice, PageHeader, Select, Skeleton, Stat, useAdmin } from '../ui';
import { BulkMenu } from './BulkMenu';

type Tab = 'menu' | 'enquiries';
const TAB_KEY = 'dawat-admin-bulk-tab';

export function Bulk() {
  const [tab, setTabState] = useState<Tab>(() => {
    try { return (sessionStorage.getItem(TAB_KEY) as Tab) || 'enquiries'; } catch { return 'enquiries'; }
  });
  const setTab = (t: Tab) => { setTabState(t); try { sessionStorage.setItem(TAB_KEY, t); } catch { /* private mode */ } };
  const tabs: { id: Tab; label: string }[] = [{ id: 'menu', label: 'Bulk Menu & Pricing' }, { id: 'enquiries', label: 'Bulk Order Enquiries' }];
  return (
    <section aria-label="Bulk and special orders">
      <PageHeader title="Bulk & Special Orders" intro="Per-kilogram bulk menu (separate from the regular plate prices) and the bulk enquiries customers send. Website totals are estimates; you confirm the final quotation." />
      <div role="tablist" aria-label="Bulk sections" className="mb-5 inline-flex rounded-xl border border-white/10 bg-white/[0.03] p-1">
        {tabs.map((t) => (
          <button key={t.id} type="button" role="tab" id={`bulk-tab-${t.id}`} aria-selected={tab === t.id} aria-controls={`bulk-panel-${t.id}`}
            onClick={() => setTab(t.id)}
            className={`min-h-[44px] rounded-lg px-4 text-sm font-medium transition-colors ${tab === t.id ? 'bg-gold text-smoke' : 'text-ivory/70 hover:bg-white/5 hover:text-ivory'}`}>
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`bulk-panel-${tab}`} aria-labelledby={`bulk-tab-${tab}`}>
        {tab === 'menu' ? <BulkMenu /> : <BulkEnquiries />}
      </div>
    </section>
  );
}

interface BulkLineSnap { id?: string; name: string; kg: number; price_per_kg: number; subtotal: number }
interface BulkPayloadV2 { version?: number; items?: BulkLineSnap[]; total_kg?: number; estimated_total?: number; event_type?: string; eventType?: string; date?: string; time?: string; mode?: string; instructions?: string; kg?: number; variety?: string }
const linesOf = (r: Lead) => {
  const p = r.payload as BulkPayloadV2;
  return Array.isArray(p.items) ? p.items.map((i) => ({ ...i, kg: Number(i.kg), price_per_kg: Number(i.price_per_kg), subtotal: Number(i.subtotal) })) : null;
};
const fmtWhen = (p: BulkPayloadV2) => {
  if (!p.date) return '—';
  const d = new Date(`${p.date}T00:00:00Z`);
  const day = Number.isNaN(d.getTime()) ? p.date : new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(d);
  if (!p.time) return day;
  const [h, m] = p.time.split(':').map(Number);
  return `${day}, ${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
};

function BulkEnquiries() {
  const { sb, toast, go } = useAdmin();
  const { rows, err, load, patch, remove, removeMany, more } = useLeads(['bulk']);
  const [showArchived, setShowArchived] = useState(false);
  const [status, setStatus] = useState('all');
  const [q, setQ] = useState('');
  const [del, setDel] = useState<Lead | null>(null);
  const [convert, setConvert] = useState<Lead | null>(null);
  const [reject, setReject] = useState<Lead | null>(null);
  const [converted, setConverted] = useState<{ bill: string; link: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    return (rows ?? []).filter((r) => (showArchived || !r.archived_at) && (status === 'all' || r.status === status) &&
      (!n || `${r.name ?? ''} ${r.phone ?? ''} ${(linesOf(r) ?? []).map((l) => l.name).join(' ')} ${(r.payload as BulkPayloadV2).variety ?? ''}`.toLowerCase().includes(n)));
  }, [rows, showArchived, status, q]);
  const sel = useSelection(shown.map((r) => r.id));

  const exportCsv = () => {
    const out: unknown[][] = [];
    for (const r of shown) {
      const p = r.payload as BulkPayloadV2;
      const ls = linesOf(r) ?? [{ name: p.variety ?? '', kg: Number(p.kg ?? 0), price_per_kg: NaN, subtotal: NaN }];
      for (const l of ls) {
        out.push([r.created_at, r.id.slice(0, 8).toUpperCase(), r.name, r.phone, r.status, p.event_type ?? p.eventType ?? '', p.date ?? '', p.time ?? '', p.mode ?? '',
          l.name, l.kg, Number.isNaN(l.price_per_kg) ? '' : l.price_per_kg, Number.isNaN(l.subtotal) ? '' : l.subtotal,
          p.total_kg ?? p.kg ?? '', p.estimated_total ?? '', r.quote_amount ?? '', r.converted_order_id ? 'yes' : 'no', r.notes ?? '']);
      }
    }
    downloadCsv(`dawat-bulk-enquiries-${istToday()}.csv`,
      ['Received', 'Reference', 'Name', 'Phone', 'Status', 'Event', 'Preferred date', 'Preferred time', 'Pickup/Delivery', 'Dish', 'Kg', 'Price per kg (at submission)', 'Line estimate', 'Total kg', 'Estimated total', 'Quotation', 'Converted to order', 'Notes'], out);
  };

  return (
    <div>
      {rows && (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="New" value={rows.filter((r) => r.status === 'new' && !r.archived_at).length} tone={rows.some((r) => r.status === 'new' && !r.archived_at) ? 'gold' : undefined} />
          <Stat label="Waiting for a quote" value={rows.filter((r) => !r.archived_at && !r.quote_amount && !['rejected', 'closed'].includes(r.status) && !r.converted_order_id).length} />
          <Stat label="Confirmed" value={rows.filter((r) => r.status === 'confirmed').length} />
          <Stat label="Turned into orders" value={rows.filter((r) => r.converted_order_id).length} />
        </div>
      )}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="relative min-w-[200px] flex-1"><span className="sr-only">Search bulk enquiries</span>
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ivory/40" />
          <Input className="pl-9" placeholder="Name, phone or dish" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <Select aria-label="Enquiry status filter" value={status} onChange={(e) => setStatus(e.target.value)} className="!w-40">
          <option value="all">All statuses</option>{LEAD_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
        <label className="flex items-center gap-2 text-xs text-ivory/60"><input type="checkbox" className="h-4 w-4 accent-[#D4AF37]" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Show archived</label>
        <Btn onClick={() => void load()}><RefreshCw size={16} /> Refresh</Btn>
        <Btn tone="gold" disabled={!shown.length} onClick={exportCsv}><Download size={16} /> Export CSV</Btn>
      </div>
      {err && <Notice kind="err">{err}</Notice>}
      <LeadBulkDelete sel={sel} shown={shown} removeMany={removeMany} noun="bulk enquiry" />
      {!rows ? <Skeleton rows={3} /> : !shown.length ? <Empty title="No bulk enquiries">New bulk & special order enquiries from the website appear here.</Empty> : (
        <>
        <ul className="space-y-3">
          {shown.map((r) => (
            <LeadCard key={r.id} r={r} patch={patch} onDelete={() => setDel(r)} sel={sel}
              extra={<BulkDetails r={r} patch={patch} onConvert={() => setConvert(r)} onReject={() => setReject(r)} goOrders={() => go('orders')} />} />
          ))}
        </ul>
        {more && <div className="mt-4 text-center"><Btn onClick={more}>Load 100 more</Btn></div>}
        </>
      )}
      <Confirm open={!!convert} onClose={() => setConvert(null)} busy={busy} title="Create an order from this quotation?"
        body={<div className="space-y-2">
          <p>An order for <b>{inr(convert?.quote_amount ?? 0)}</b> will be created for {convert?.name} with a new bill number and status “Confirmed”. This can be done only once per enquiry.</p>
          {convert && linesOf(convert) && <p className="text-xs text-ivory/60">The receipt lists each dish (kg × price per kg as submitted). Any difference to your quotation is shown as a discount or a “Quotation adjustment” line, so the bill total equals the quotation.</p>}
        </div>}
        confirmLabel="Create order"
        onConfirm={async () => {
          if (!convert) return;
          setBusy(true);
          const { data, error } = await sb.rpc('admin_convert_lead', { p_lead_id: convert.id });
          setBusy(false);
          if (error) { toast(errText(error), 'err'); return; }
          const d = data as { order_id: string; bill_number: string; access_token: string };
          setConvert(null);
          setConverted({ bill: d.bill_number, link: trackUrl(d.order_id, d.access_token) });
          void load();
        }} />
      <Confirm open={!!reject} onClose={() => setReject(null)} danger title="Reject this bulk enquiry?"
        body={<p>The enquiry from {reject?.name ?? 'this customer'} is marked “rejected” and cannot be turned into an order unless you change its status again. Let the customer know by phone or WhatsApp.</p>}
        confirmLabel="Reject enquiry" onConfirm={async () => { if (reject && (await patch(reject.id, { status: 'rejected' }, 'Enquiry rejected.'))) setReject(null); }} />
      <Modal open={!!converted} onClose={() => setConverted(null)} title={`Order ${converted?.bill ?? ''} created`}>
        <div className="space-y-3 text-sm">
          <p>Share this private link with the customer so they can see the receipt and status. It is shown only now — copy it before closing.</p>
          <p className="break-all rounded-lg bg-black/30 p-2 font-mono text-xs">{converted?.link}</p>
          <div className="flex flex-wrap gap-2">
            <Btn tone="gold" onClick={async () => toast((await copyText(converted?.link ?? '')) ? 'Link copied.' : 'Could not copy.', 'ok')}><Copy size={16} /> Copy link</Btn>
            <Btn onClick={() => { setConverted(null); go('orders'); }}>Open orders</Btn>
          </div>
        </div>
      </Modal>
      <Confirm open={!!del} onClose={() => setDel(null)} danger title="Delete this bulk enquiry?"
        body={<p>The enquiry and the customer’s phone number will be deleted. {del?.converted_order_id ? 'The order created from it stays.' : ''}</p>}
        confirmLabel="Delete" onConfirm={async () => { if (del && (await remove(del.id))) setDel(null); }} />
    </div>
  );
}

function BulkDetails({ r, patch, onConvert, onReject, goOrders }: { r: Lead; patch: (id: string, p: Partial<Lead>, m?: string) => Promise<boolean>; onConvert: () => void; onReject: () => void; goOrders: () => void }) {
  const [quote, setQuote] = useState(r.quote_amount ? String(r.quote_amount) : '');
  const p = r.payload as BulkPayloadV2;
  const lines = linesOf(r);
  const est = lines ? Number(p.estimated_total ?? lines.reduce((a, l) => a + l.subtotal, 0)) : null;
  const totalKg = lines ? Number(p.total_kg ?? lines.reduce((a, l) => a + l.kg, 0)) : Number(p.kg ?? 0);
  const saved = r.quote_amount ? String(r.quote_amount) : '';
  const rejected = r.status === 'rejected';
  return (
    <div className="mt-3 space-y-3">
      {lines ? (
        <div className="overflow-x-auto rounded-lg border border-white/10">
          <table className="w-full min-w-[420px] text-sm">
            <caption className="sr-only">Dishes in this bulk enquiry</caption>
            <thead className="bg-white/[0.04] text-left text-[11px] uppercase tracking-[0.1em] text-ivory/50">
              <tr><th className="px-3 py-2 font-medium">Dish</th><th className="px-3 py-2 text-right font-medium">Kg</th><th className="px-3 py-2 text-right font-medium">₹/kg (at submission)</th><th className="px-3 py-2 text-right font-medium">Estimate</th></tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={l.id ?? i} className="border-t border-white/5"><td className="px-3 py-2">{l.name}</td><td className="px-3 py-2 text-right font-num">{l.kg}</td><td className="px-3 py-2 text-right font-num">{inr(l.price_per_kg)}</td><td className="px-3 py-2 text-right font-num">{inr(l.subtotal)}</td></tr>
              ))}
            </tbody>
            <tfoot className="border-t border-white/10 font-semibold">
              <tr><td className="px-3 py-2">Total</td><td className="px-3 py-2 text-right font-num">{totalKg} kg</td><td /><td className="px-3 py-2 text-right font-num text-gold">{inr(est ?? 0)}</td></tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <p className="text-sm text-ivory/80"><b className="font-num">{p.kg ?? '?'} kg</b> · {p.variety ?? '—'} <Badge>older enquiry form</Badge></p>
      )}
      <p className="text-sm text-ivory/75">{p.event_type ?? p.eventType ?? '—'} · {fmtWhen(p)} · {p.mode === 'delivery' ? 'Delivery' : 'Pickup'}</p>
      {p.instructions && <p className="text-xs text-amber-200">“{p.instructions}”</p>}
      {r.converted_order_id ? (
        <p className="text-sm text-emerald-200">Converted into an order for {inr(r.quote_amount ?? 0)}. <button type="button" className="underline" onClick={goOrders}>Open orders</button></p>
      ) : (
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Final quotation (₹)"><Input inputMode="decimal" value={quote} onChange={(e) => setQuote(e.target.value.replace(/[^\d.]/g, ''))} className="!w-36" /></Field>
          {est != null && quote !== String(est) && <Btn tone="quiet" onClick={() => setQuote(String(est))}>Use estimate {inr(est)}</Btn>}
          <Btn disabled={quote === saved || (!!quote && !(Number(quote) > 0))} onClick={() => void patch(r.id, { quote_amount: quote ? Number(quote) : null }, 'Quotation saved.')}>Save quote</Btn>
          {!rejected && r.status !== 'confirmed' && <Btn disabled={!r.quote_amount} title={!r.quote_amount ? 'Save a quotation first' : undefined} onClick={() => void patch(r.id, { status: 'confirmed' }, 'Quotation confirmed.')}>Confirm quotation</Btn>}
          {!rejected && <Btn tone="danger" onClick={onReject}>Reject…</Btn>}
          <Btn tone="gold" disabled={!r.quote_amount || rejected} onClick={onConvert} title={rejected ? 'Rejected enquiries cannot be converted' : !r.quote_amount ? 'Save a quotation first' : undefined}>Convert to order</Btn>
        </div>
      )}
      {rejected && !r.converted_order_id && <p className="text-xs text-red-300">Rejected. Change the status above to reopen it.</p>}
    </div>
  );
}
