import { Download, RefreshCw, Search } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNotifications } from './notifications';
import { Badge, Btn, Confirm, downloadCsv, Empty, errText, fmtDT, Input, istToday, Notice, PageHeader, Select, Skeleton, Stat, Textarea, useAdmin, waLink } from './ui';
import { ActionMenu } from './sections/Menu3';

export interface Lead {
  id: string;
  kind: 'cart' | 'bulk' | 'contact';
  name: string | null;
  phone: string | null;
  message: string | null;
  payload: Record<string, unknown>;
  status: 'new' | 'contacted' | 'confirmed' | 'rejected' | 'closed';
  notes: string | null;
  quote_amount: number | null;
  archived_at: string | null;
  converted_order_id: string | null;
  created_at: string;
}
export const LEAD_STATUSES: Lead['status'][] = ['new', 'contacted', 'confirmed', 'rejected', 'closed'];
const KIND_LABEL: Record<Lead['kind'], string> = { cart: 'Order enquiry (old site)', bulk: 'Bulk & special order', contact: 'Contact' };

export function useLeads(kinds: Lead['kind'][]) {
  const { sb, toast } = useAdmin();
  const { orderTick } = useNotifications();
  const [rows, setRows] = useState<Lead[] | null>(null);
  const [err, setErr] = useState('');
  const load = useCallback(async () => {
    const { data, error } = await sb.from('leads').select('*').in('kind', kinds).order('created_at', { ascending: false }).limit(500);
    if (error) { setErr(errText(error, 'Could not load enquiries.')); return; }
    setErr('');
    setRows((data as Lead[]).map((l) => ({ ...l, quote_amount: l.quote_amount == null ? null : Number(l.quote_amount) })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sb, kinds.join(',')]);
  useEffect(() => { void load(); }, [load, orderTick]);
  const patch = async (id: string, p: Partial<Lead>, msg = 'Saved.') => {
    const { error } = await sb.from('leads').update(p).eq('id', id);
    if (error) { toast(errText(error), 'err'); return false; }
    toast(msg);
    setRows((rs) => rs?.map((r) => (r.id === id ? { ...r, ...p } : r)) ?? null);
    return true;
  };
  const remove = async (id: string) => {
    const { error } = await sb.from('leads').delete().eq('id', id);
    if (error) { toast(errText(error), 'err'); return false; }
    toast('Enquiry deleted.');
    setRows((rs) => rs?.filter((r) => r.id !== id) ?? null);
    return true;
  };
  return { rows, err, load, patch, remove };
}

export function Leads() {
  const { rows, err, load, patch, remove } = useLeads(['cart', 'contact']);
  const [status, setStatus] = useState('all');
  const [q, setQ] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [del, setDel] = useState<Lead | null>(null);

  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    return (rows ?? []).filter((r) => (showArchived || !r.archived_at) && (status === 'all' || r.status === status) && (!n || `${r.name ?? ''} ${r.phone ?? ''} ${r.message ?? ''}`.toLowerCase().includes(n)));
  }, [rows, status, q, showArchived]);

  return (
    <section aria-label="Enquiries and leads">
      <PageHeader title="Enquiries & Leads" intro="Messages and order enquiries that were not placed as online orders (including enquiries sent from the previous website version)."
        actions={<>
          <Btn onClick={() => void load()}><RefreshCw size={16} /> Refresh</Btn>
          <Btn tone="gold" disabled={!shown.length} onClick={() => downloadCsv(`dawat-enquiries-${istToday()}.csv`, ['Date', 'Type', 'Name', 'Phone', 'Status', 'Notes', 'Message'], shown.map((r) => [r.created_at, KIND_LABEL[r.kind], r.name, r.phone, r.status, r.notes, r.message]))}><Download size={16} /> Export CSV</Btn>
        </>} />
      {rows && (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="New" value={rows.filter((r) => r.status === 'new' && !r.archived_at).length} />
          <Stat label="Contacted" value={rows.filter((r) => r.status === 'contacted').length} />
          <Stat label="Received today" value={rows.filter((r) => new Date(r.created_at).toDateString() === new Date().toDateString()).length} />
          <Stat label="All" value={rows.length} />
        </div>
      )}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="relative min-w-[220px] flex-1"><span className="sr-only">Search enquiries</span>
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ivory/40" />
          <Input className="pl-9" placeholder="Name, phone or message" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <Select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)} className="!w-40"><option value="all">All statuses</option>{LEAD_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</Select>
        <label className="flex items-center gap-2 text-xs text-ivory/60"><input type="checkbox" className="h-4 w-4 accent-[#D4AF37]" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Show archived</label>
      </div>
      {err && <Notice kind="err">{err}</Notice>}
      {!rows ? <Skeleton rows={3} /> : !shown.length ? <Empty title="No enquiries">New enquiries from the website appear here.</Empty> : (
        <ul className="space-y-3">{shown.map((r) => <LeadCard key={r.id} r={r} patch={patch} onDelete={() => setDel(r)} />)}</ul>
      )}
      <Confirm open={!!del} onClose={() => setDel(null)} danger title="Delete this enquiry?"
        body={<p>The enquiry from {del?.name ?? 'this customer'} and their phone number will be deleted permanently. Online orders are not affected.</p>}
        confirmLabel="Delete" onConfirm={async () => { if (del && (await remove(del.id))) setDel(null); }} />
    </section>
  );
}

export function LeadCard({ r, patch, onDelete, extra }: { r: Lead; patch: (id: string, p: Partial<Lead>, msg?: string) => Promise<boolean>; onDelete: () => void; extra?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState(r.notes ?? '');
  const wa = waLink(r.phone, `Namaste ${r.name ?? ''}, this is Dawat Biryani House about your enquiry.`);
  return (
    <li className={`rounded-xl border border-white/10 bg-white/[0.03] p-4 ${r.archived_at ? 'opacity-60' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold">{r.name || 'No name'} <Badge tone="gold">{KIND_LABEL[r.kind]}</Badge> {r.status === 'new' && <Badge tone="warn">new</Badge>} {r.archived_at && <Badge>Archived</Badge>}</p>
          <p className="text-xs text-ivory/50">{fmtDT(r.created_at)} · <span className="font-num">{r.phone || 'No phone'}</span></p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {r.phone && <a className="inline-flex min-h-[40px] items-center rounded-lg border border-white/20 px-3 text-sm hover:bg-white/10" href={`tel:+91${r.phone.replace(/\D/g, '').slice(-10)}`}>Call</a>}
          {wa && <a className="inline-flex min-h-[40px] items-center rounded-lg border border-emerald-400/40 px-3 text-sm text-emerald-200 hover:bg-emerald-500/10" href={wa} target="_blank" rel="noopener noreferrer">WhatsApp</a>}
          <Select aria-label="Enquiry status" value={r.status} onChange={(e) => void patch(r.id, { status: e.target.value as Lead['status'] }, 'Status updated.')} className="!w-32">
            {LEAD_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
          <ActionMenu label={`Actions for enquiry from ${r.name ?? 'customer'}`} items={[
            { label: open ? 'Hide details' : 'Show message & notes', onClick: () => setOpen(!open) },
            r.archived_at ? { label: 'Restore', onClick: () => void patch(r.id, { archived_at: null }, 'Restored.') } : { label: 'Archive', onClick: () => void patch(r.id, { archived_at: new Date().toISOString() }, 'Archived.') },
            { label: 'Delete…', onClick: onDelete, danger: true },
          ]} />
        </div>
      </div>
      {extra}
      {open && (
        <div className="mt-3 space-y-2">
          <pre className="whitespace-pre-wrap rounded-lg bg-black/30 p-3 font-sans text-xs text-ivory/75">{r.message || '—'}</pre>
          <Textarea rows={2} maxLength={2000} placeholder="Private notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          <Btn tone="gold" disabled={notes === (r.notes ?? '')} onClick={() => void patch(r.id, { notes: notes.trim() || null }, 'Note saved.')}>Save note</Btn>
        </div>
      )}
    </li>
  );
}
