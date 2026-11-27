import { Download, Eraser, Loader2, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Btn, Card, Confirm, downloadCsv, errText, Field, fmtDT, istToday, Notice, PageHeader, Select, Skeleton, Toggle, useAdmin } from '../ui';

interface Settings {
  auto_enabled: boolean; orders_days: number; leads_days: number; notifications_days: number; chats_days: number; coupons_days: number;
  last_run_at: string | null; last_result: Record<string, number | string> | null;
}
type Kind = 'orders' | 'leads' | 'notifications' | 'chats' | 'coupons';
const KINDS: { id: Kind; label: string; what: string; field: keyof Settings }[] = [
  { id: 'orders', label: 'Finished orders', what: 'Completed, cancelled and rejected orders older than this. Bill number, date and amounts stay in the bill register.', field: 'orders_days' },
  { id: 'leads', label: 'Closed enquiries', what: 'Enquiries that were closed, rejected, archived or turned into orders. New and contacted enquiries are never removed.', field: 'leads_days' },
  { id: 'notifications', label: 'Notifications', what: 'Notifications older than this (the orders/enquiries they point to are not touched).', field: 'notifications_days' },
  { id: 'chats', label: 'Resolved chats', what: 'Resolved or archived chats with no message for this long. Open chats are never removed.', field: 'chats_days' },
  { id: 'coupons', label: 'Expired coupons', what: 'Coupons that ended (or were archived) this long ago. Bills keep their coupon code and discount.', field: 'coupons_days' },
];
const PERIODS = [0, 30, 60, 90, 180, 365];

/** Optional clean-up of old records. Automatic mode is off unless the owner switches it on. */
export function DataCleanup() {
  const { sb, toast } = useAdmin();
  const [s, setS] = useState<Settings | null>(null);
  const [draft, setDraft] = useState<Settings | null>(null);
  const [preview, setPreview] = useState<Record<Kind, string[]> | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [result, setResult] = useState<Record<string, number | string> | null>(null);

  const load = useCallback(async () => {
    const [a, b] = await Promise.all([sb.from('cleanup_settings').select('*').eq('id', 1).single(), sb.rpc('admin_cleanup_preview')]);
    if (a.error || b.error) { setErr(errText(a.error ?? b.error, 'Could not load clean-up settings.')); return; }
    setErr('');
    setS(a.data as Settings); setDraft(a.data as Settings); setPreview(b.data as Record<Kind, string[]>);
  }, [sb]);
  useEffect(() => { void load(); }, [load]);

  const dirty = !!s && !!draft && KINDS.some((k) => s[k.field] !== draft[k.field]) || (!!s && !!draft && s.auto_enabled !== draft.auto_enabled);
  const save = async () => {
    if (!draft) return;
    setBusy('save');
    const { error } = await sb.from('cleanup_settings').update({ auto_enabled: draft.auto_enabled, orders_days: draft.orders_days, leads_days: draft.leads_days,
      notifications_days: draft.notifications_days, chats_days: draft.chats_days, coupons_days: draft.coupons_days }).eq('id', 1);
    setBusy('');
    if (error) { toast(errText(error), 'err'); return; }
    toast(draft.auto_enabled ? 'Saved. Automatic clean-up runs once a day when the admin panel is opened.' : 'Saved. Automatic clean-up is off.');
    void load();
  };

  /** CSV of everything the clean-up would delete, fetched from the database before anything is removed. */
  const exportAll = async () => {
    if (!preview) return;
    setBusy('csv');
    const rows: unknown[][] = [];
    const get = async (table: string, ids: string[], cols: string) => (ids.length ? ((await sb.from(table).select(cols).in('id', ids.slice(0, 1000))).data as unknown as Record<string, unknown>[] ?? []) : []);
    for (const o of await get('orders', preview.orders, 'bill_number,created_at,customer_name,customer_phone,status,payment_status,total')) rows.push(['Order', o.bill_number, o.created_at, o.customer_name, o.customer_phone, o.status, o.payment_status, o.total]);
    for (const l of await get('leads', preview.leads, 'created_at,kind,name,phone,status,quote_amount,message')) rows.push(['Enquiry', l.kind, l.created_at, l.name, l.phone, l.status, '', l.quote_amount, l.message]);
    for (const n of await get('notifications', preview.notifications, 'created_at,title,body')) rows.push(['Notification', n.title, n.created_at, n.body]);
    for (const c of await get('chat_conversations', preview.chats, 'last_message_at,customer_name,status,last_message_preview')) rows.push(['Chat', c.customer_name ?? 'Visitor', c.last_message_at, c.last_message_preview, '', c.status]);
    for (const f of await get('offers', preview.coupons, 'title,code,ends_at,used_count')) rows.push(['Coupon', f.title, f.ends_at, f.code, '', '', '', f.used_count]);
    downloadCsv(`dawat-cleanup-preview-${istToday()}.csv`, ['Type', 'Reference', 'Date', 'Name / title', 'Phone / details', 'Status', 'Payment', 'Amount / used', 'Message'], rows);
    setBusy('');
  };

  const count = preview ? KINDS.reduce((a, k) => a + preview[k.id].length, 0) : 0;
  return (
    <section aria-label="Data cleanup">
      <PageHeader title="Data Cleanup" intro="Remove old records you no longer need, so the database stays small and fast. Nothing is removed automatically unless you switch it on."
        actions={<Btn onClick={() => void load()}><RefreshCw size={16} /> Refresh</Btn>} />
      {err && <Notice kind="err">{err}</Notice>}
      {!draft || !preview ? <Skeleton rows={4} /> : (
        <>
          <Card className="mb-4 space-y-3">
            <Toggle label="Automatic clean-up" hint="When on, the rules below run by themselves once a day (when the admin panel is opened). Off by default." checked={draft.auto_enabled} onChange={(v) => setDraft({ ...draft, auto_enabled: v })} />
            <ul className="space-y-3">
              {KINDS.map((k) => (
                <li key={k.id} className="flex flex-wrap items-end justify-between gap-3 rounded-xl border border-white/10 p-3" data-cleanup={k.id}>
                  <div className="min-w-[220px] flex-1">
                    <p className="font-semibold text-ivory">{k.label} <span className="ml-1 rounded-full bg-white/10 px-2 py-0.5 text-xs text-gold">{preview[k.id].length} now</span></p>
                    <p className="text-xs text-ivory/55">{k.what}</p>
                  </div>
                  <Field label="Remove after">
                    <Select aria-label={`${k.label}: remove after`} value={String(draft[k.field])} onChange={(e) => setDraft({ ...draft, [k.field]: Number(e.target.value) })} className="!w-36">
                      {PERIODS.map((p) => <option key={p} value={p}>{p === 0 ? 'Never' : `${p} days`}</option>)}
                    </Select>
                  </Field>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2">
              <Btn tone="gold" busy={busy === 'save'} disabled={!dirty} onClick={() => void save()}>Save settings</Btn>
              {dirty && <p className="self-center text-xs text-amber-200">Save first — the counts above use the saved settings.</p>}
            </div>
          </Card>
          <Card className="space-y-3">
            <p className="font-semibold text-ivory">Run clean-up now</p>
            <p className="text-sm text-ivory/70">{count ? <>With the saved settings, <b>{count}</b> record(s) would be removed: {KINDS.filter((k) => preview[k.id].length).map((k) => `${preview[k.id].length} ${k.label.toLowerCase()}`).join(', ')}.</> : 'Nothing to clean up with the saved settings.'}</p>
            <div className="flex flex-wrap gap-2">
              <Btn disabled={!count || busy === 'csv'} busy={busy === 'csv'} onClick={() => void exportAll()}><Download size={16} /> Download CSV of these records</Btn>
              <Btn tone="danger" disabled={!count || dirty} onClick={() => setConfirm(true)}><Eraser size={16} /> Clean up now…</Btn>
            </div>
            {s?.last_run_at && <p className="text-xs text-ivory/50">Last run {fmtDT(s.last_run_at)} ({String(s.last_result?.mode ?? '')}): {KINDS.map((k) => `${s.last_result?.[k.id] ?? 0} ${k.label.toLowerCase()}`).join(', ')}.</p>}
            {busy === 'run' && <p className="flex items-center gap-2 text-sm" role="status"><Loader2 size={16} className="animate-spin" /> Cleaning up…</p>}
            {result && <Notice kind="ok">Removed {KINDS.map((k) => `${result[k.id] ?? 0} ${k.label.toLowerCase()}`).join(', ')}.</Notice>}
          </Card>
        </>
      )}
      <Confirm open={confirm} onClose={() => setConfirm(false)} danger typeToConfirm="DELETE" busy={busy === 'run'} title={`Permanently remove ${count} old record(s)?`}
        body={<p>This cannot be undone. Download the CSV first if you may need these records. Active orders, new enquiries and open chats are never touched; deleted orders keep their bill number and amounts in the bill register.</p>}
        confirmLabel="Clean up now" onConfirm={async () => {
          setBusy('run');
          const { data, error } = await sb.rpc('admin_cleanup_run');
          setBusy('');
          setConfirm(false);
          if (error) { toast(errText(error), 'err'); return; }
          setResult(data as Record<string, number>);
          toast('Clean-up finished.');
          void load();
        }} />
    </section>
  );
}
