import { Copy, RefreshCw } from 'lucide-react';
import { useMemo, useState } from 'react';
import { trackUrl } from '../../lib/myOrders';
import { copyText } from '../../utils/order';
import { LeadCard, useLeads, type Lead } from '../Leads';
import { Btn, Confirm, Empty, errText, Field, Input, inr, Modal, Notice, PageHeader, Skeleton, useAdmin } from '../ui';

export function Bulk() {
  const { sb, toast, go } = useAdmin();
  const { rows, err, load, patch, remove } = useLeads(['bulk']);
  const [showArchived, setShowArchived] = useState(false);
  const [del, setDel] = useState<Lead | null>(null);
  const [convert, setConvert] = useState<Lead | null>(null);
  const [converted, setConverted] = useState<{ bill: string; link: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const shown = useMemo(() => (rows ?? []).filter((r) => showArchived || !r.archived_at), [rows, showArchived]);

  return (
    <section aria-label="Bulk orders">
      <PageHeader title="Bulk Orders" intro="Quotes are entered by you — the website never shows a bulk price you haven’t set. Converting a confirmed quote creates a real order with its own bill number (only once)."
        actions={<Btn onClick={() => void load()}><RefreshCw size={16} /> Refresh</Btn>} />
      <label className="mb-4 flex items-center gap-2 text-xs text-ivory/60"><input type="checkbox" className="h-4 w-4 accent-[#D4AF37]" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Show archived</label>
      {err && <Notice kind="err">{err}</Notice>}
      {!rows ? <Skeleton rows={3} /> : !shown.length ? <Empty title="No bulk enquiries yet" /> : (
        <ul className="space-y-3">
          {shown.map((r) => (
            <LeadCard key={r.id} r={r} patch={patch} onDelete={() => setDel(r)} extra={<BulkExtra r={r} patch={patch} onConvert={() => setConvert(r)} goOrders={() => go('orders')} />} />
          ))}
        </ul>
      )}
      <Confirm open={!!convert} onClose={() => setConvert(null)} busy={busy} title="Create an order from this quote?"
        body={<p>An order for <b>{inr(convert?.quote_amount ?? 0)}</b> will be created for {convert?.name} with a new bill number and status “Confirmed”. This can be done only once per enquiry.</p>}
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
    </section>
  );
}

function BulkExtra({ r, patch, onConvert, goOrders }: { r: Lead; patch: (id: string, p: Partial<Lead>, m?: string) => Promise<boolean>; onConvert: () => void; goOrders: () => void }) {
  const [quote, setQuote] = useState(r.quote_amount ? String(r.quote_amount) : '');
  const p = r.payload as { kg?: number; variety?: string; eventType?: string; date?: string; time?: string; mode?: string; instructions?: string };
  return (
    <div className="mt-3 space-y-3">
      <p className="text-sm text-ivory/80"><b className="font-num">{p.kg ?? '?'} kg</b> · {p.variety ?? '—'} · {p.eventType ?? '—'} · {p.date ?? '—'} {p.time ?? ''} · {p.mode === 'delivery' ? 'Delivery' : 'Pickup'}</p>
      {p.instructions && <p className="text-xs text-amber-200">{p.instructions}</p>}
      {r.converted_order_id ? (
        <p className="text-sm text-emerald-200">Converted into an order. <button type="button" className="underline" onClick={goOrders}>Open orders</button></p>
      ) : (
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Quotation (₹)"><Input inputMode="decimal" value={quote} onChange={(e) => setQuote(e.target.value.replace(/[^\d.]/g, ''))} className="!w-36" /></Field>
          <Btn disabled={quote === (r.quote_amount ? String(r.quote_amount) : '') || (!!quote && !(Number(quote) > 0))} onClick={() => void patch(r.id, { quote_amount: quote ? Number(quote) : null }, 'Quotation saved.')}>Save quote</Btn>
          <Btn tone="gold" disabled={!r.quote_amount} onClick={onConvert} title={!r.quote_amount ? 'Save a quotation first' : undefined}>Convert to order</Btn>
        </div>
      )}
    </div>
  );
}
