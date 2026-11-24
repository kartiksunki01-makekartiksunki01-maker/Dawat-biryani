import type { SupabaseClient } from '@supabase/supabase-js';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Btn, Input, Notice, Select, Textarea } from './ui';

interface Lead {
  id: string;
  kind: 'cart' | 'bulk' | 'contact';
  name: string | null;
  phone: string | null;
  message: string | null;
  payload: Record<string, unknown>;
  status: 'new' | 'contacted' | 'confirmed' | 'closed';
  notes: string | null;
  created_at: string;
}

const STATUSES: Lead['status'][] = ['new', 'contacted', 'confirmed', 'closed'];
const KIND_LABEL: Record<Lead['kind'], string> = { cart: 'Order enquiry', bulk: 'Bulk order', contact: 'Contact' };

const fmt = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

function digits(phone: string | null) {
  const d = (phone ?? '').replace(/\D/g, '');
  return d.length === 10 ? `91${d}` : d;
}

/** Leads come from the public internet — neutralise spreadsheet formulas before exporting. */
const csvCell = (v: unknown) => {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
};

export function Leads({ sb }: { sb: SupabaseClient }) {
  const [rows, setRows] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [status, setStatus] = useState('all');
  const [kind, setKind] = useState('all');
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await sb.from('leads').select('*').order('created_at', { ascending: false }).limit(500);
    setLoading(false);
    if (error) setErr('Could not load leads. Try Refresh.');
    else {
      setErr('');
      setRows(data as Lead[]);
    }
  }, [sb]);

  useEffect(() => {
    void load();
  }, [load]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (status === 'all' || r.status === status) &&
        (kind === 'all' || r.kind === kind) &&
        (!needle || `${r.name ?? ''} ${r.phone ?? ''} ${r.message ?? ''}`.toLowerCase().includes(needle)),
    );
  }, [rows, status, kind, q]);

  const counts = useMemo(() => {
    const today = new Date().toDateString();
    return {
      fresh: rows.filter((r) => r.status === 'new').length,
      today: rows.filter((r) => new Date(r.created_at).toDateString() === today).length,
      bulk: rows.filter((r) => r.kind === 'bulk').length,
      total: rows.length,
    };
  }, [rows]);

  const patch = async (id: string, change: Partial<Pick<Lead, 'status' | 'notes'>>) => {
    const { error } = await sb.from('leads').update(change).eq('id', id);
    if (error) setErr('Update failed.');
    else setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...change } : r)));
  };

  const remove = async (id: string) => {
    if (!window.confirm('Delete this lead permanently?')) return;
    const { error } = await sb.from('leads').delete().eq('id', id);
    if (error) setErr('Delete failed.');
    else setRows((rs) => rs.filter((r) => r.id !== id));
  };

  const exportCsv = () => {
    const head = ['Date', 'Type', 'Name', 'Phone', 'Status', 'Notes', 'Message'];
    const lines = shown.map((r) => [r.created_at, KIND_LABEL[r.kind], r.name, r.phone, r.status, r.notes, r.message].map(csvCell).join(','));
    const blob = new Blob(['﻿' + [head.map(csvCell).join(','), ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `dawat-leads-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <section aria-label="Leads" className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ['New (not contacted)', counts.fresh],
          ['Received today', counts.today],
          ['Bulk enquiries', counts.bulk],
          ['All leads', counts.total],
        ].map(([label, n]) => (
          <div key={label as string} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <p className="text-2xl font-semibold text-gold">{n}</p>
            <p className="text-xs text-ivory/55">{label}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[200px] flex-1">
          <Input placeholder="Search name, phone, message…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search leads" />
        </div>
        <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status" className="!w-auto">
          <option value="all">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
        <Select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Filter by type" className="!w-auto">
          <option value="all">All types</option>
          {(Object.keys(KIND_LABEL) as Lead['kind'][]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
        </Select>
        <Btn onClick={() => void load()}>Refresh</Btn>
        <Btn tone="gold" onClick={exportCsv} disabled={!shown.length}>Export CSV</Btn>
      </div>

      {err && <Notice kind="err">{err}</Notice>}
      {loading && <Notice kind="info">Loading…</Notice>}
      {!loading && !shown.length && (
        <Notice kind="info">No leads yet. Every WhatsApp enquiry sent from the website will appear here.</Notice>
      )}

      <ul className="space-y-3">
        {shown.map((r) => (
          <LeadCard key={r.id} r={r} onPatch={patch} onDelete={remove} />
        ))}
      </ul>
    </section>
  );
}

function LeadCard({ r, onPatch, onDelete }: { r: Lead; onPatch: (id: string, c: Partial<Pick<Lead, 'status' | 'notes'>>) => void; onDelete: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState(r.notes ?? '');
  const num = digits(r.phone);
  const items = Array.isArray(r.payload?.items) ? (r.payload.items as { name: string; variant: string; qty: number; unitPrice: number }[]) : [];
  const total = typeof r.payload?.subtotal === 'number' ? r.payload.subtotal : null;

  return (
    <li className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold">
            {r.name || 'No name'} <span className="ml-2 rounded-full border border-gold/40 px-2 py-0.5 text-[11px] font-normal text-gold">{KIND_LABEL[r.kind]}</span>
          </p>
          <p className="text-xs text-ivory/50">{fmt(r.created_at)} · {r.phone || 'No phone'}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {num && (
            <>
              <a className="inline-flex min-h-[40px] items-center rounded-lg border border-white/20 px-3 text-sm hover:bg-white/10" href={`tel:+${num}`}>Call</a>
              <a className="inline-flex min-h-[40px] items-center rounded-lg border border-emerald-400/40 px-3 text-sm text-emerald-200 hover:bg-emerald-500/10" href={`https://wa.me/${num}`} target="_blank" rel="noopener noreferrer">WhatsApp</a>
            </>
          )}
          <Select value={r.status} onChange={(e) => onPatch(r.id, { status: e.target.value as Lead['status'] })} aria-label="Lead status" className="!w-auto">
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
        </div>
      </div>

      {items.length > 0 && (
        <ul className="mt-3 space-y-0.5 text-sm text-ivory/80">
          {items.map((i, n) => (
            <li key={n}>{i.qty} × {i.name}{i.variant && i.variant !== 'Standard' ? ` (${i.variant})` : ''} — ₹{i.unitPrice * i.qty}</li>
          ))}
          {total !== null && <li className="font-semibold text-gold">Total ₹{total}</li>}
        </ul>
      )}
      {r.kind === 'bulk' && (
        <p className="mt-3 text-sm text-ivory/80">
          {String(r.payload?.kg ?? '?')} kg · {String(r.payload?.variety ?? '')} · {String(r.payload?.date ?? '')} {String(r.payload?.time ?? '')}
        </p>
      )}

      <button type="button" className="mt-3 text-xs text-ivory/55 underline" onClick={() => setOpen(!open)}>
        {open ? 'Hide details' : 'Full message & notes'}
      </button>
      {open && (
        <div className="mt-3 space-y-3">
          <pre className="whitespace-pre-wrap rounded-lg bg-black/30 p-3 font-sans text-xs text-ivory/70">{r.message || '—'}</pre>
          <Textarea rows={2} placeholder="Private notes (customers can't see this)" value={notes} onChange={(e) => setNotes(e.target.value)} />
          <div className="flex gap-2">
            <Btn tone="gold" onClick={() => onPatch(r.id, { notes: notes.trim() || null })}>Save note</Btn>
            <Btn tone="danger" onClick={() => onDelete(r.id)}>Delete lead</Btn>
          </div>
        </div>
      )}
    </li>
  );
}
