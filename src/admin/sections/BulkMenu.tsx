import { ArrowDown, ArrowUp, Camera, ImagePlus, Loader2, Plus, RefreshCw, Search } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { asset } from '../../utils/format';
import { BULK_CATEGORY_LABEL, type BulkCategory } from '../../data/bulk';
import { usePhotoUpload, PhotoTile } from '../photo';
import { Badge, Btn, Card, Confirm, Empty, errText, Field, Input, inr, Modal, Notice, Select, Skeleton, Stat, Textarea, Toggle, useAdmin } from '../ui';
import { ActionMenu } from './Menu3';

export interface BulkRow {
  id: string; slug: string; name: string; category: BulkCategory; diet: 'veg' | 'non-veg' | 'unconfirmed';
  price_per_kg: number; description: string; image_path: string | null; image_kind: 'promotional' | 'photo' | null;
  is_available: boolean; is_sold_out: boolean; min_kg: number; max_kg: number; notice_free_up_to_kg: number;
  advance_notice_hours: number; timing_confirmed: boolean; admin_note: string | null; display_order: number;
  archived_at: string | null; updated_at: string;
}
const CATS = Object.keys(BULK_CATEGORY_LABEL) as BulkCategory[];
const slugify = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'dish';
const rule = (r: Pick<BulkRow, 'min_kg' | 'max_kg' | 'notice_free_up_to_kg' | 'advance_notice_hours'>) =>
  r.notice_free_up_to_kg >= r.max_kg || r.advance_notice_hours === 0
    ? `${r.min_kg}–${r.max_kg} kg, no notice`
    : `${r.min_kg}–${r.max_kg} kg · over ${r.notice_free_up_to_kg} kg: ${r.advance_notice_hours} h notice`;

export function BulkMenu() {
  const { sb, toast } = useAdmin();
  const [rows, setRows] = useState<BulkRow[] | null>(null);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<'all' | BulkCategory>('all');
  const [avail, setAvail] = useState<'active' | 'shown' | 'hidden' | 'soldout' | 'archived'>('active');
  const [edit, setEdit] = useState<BulkRow | null>(null);
  const [adding, setAdding] = useState(false);
  const [archive, setArchive] = useState<BulkRow | null>(null);
  const [maxTotal, setMaxTotal] = useState<{ saved: number; text: string } | null>(null);
  const [applyAll, setApplyAll] = useState(false);
  const [bulkRule, setBulkRule] = useState({ min: '1', max: '20', free: '5', hours: '2' });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [b, s] = await Promise.all([
      sb.from('bulk_menu_items').select('*').order('display_order').order('name'),
      sb.from('restaurant_settings').select('bulk_max_total_kg').eq('id', 1).single(),
    ]);
    if (b.error) { setErr(errText(b.error, 'Could not load the bulk menu.')); return; }
    setErr('');
    setRows((b.data as BulkRow[]).map((r) => ({ ...r, price_per_kg: Number(r.price_per_kg) })));
    if (!s.error && s.data) { const v = Number((s.data as { bulk_max_total_kg: number }).bulk_max_total_kg); setMaxTotal({ saved: v, text: String(v) }); }
  }, [sb]);
  useEffect(() => { void load(); }, [load]);

  const active = useMemo(() => (rows ?? []).filter((r) => !r.archived_at), [rows]);
  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    return (rows ?? []).filter((r) =>
      (avail === 'archived' ? !!r.archived_at : !r.archived_at) &&
      (avail !== 'shown' || r.is_available) && (avail !== 'hidden' || !r.is_available) && (avail !== 'soldout' || r.is_sold_out) &&
      (cat === 'all' || r.category === cat) &&
      (!n || `${r.name} ${r.slug} ${BULK_CATEGORY_LABEL[r.category]}`.toLowerCase().includes(n)));
  }, [rows, q, cat, avail]);

  const patch = async (r: BulkRow, p: Partial<BulkRow>, msg: string) => {
    const { error } = await sb.from('bulk_menu_items').update(p).eq('id', r.id);
    if (error) { toast(errText(error), 'err'); return false; }
    setRows((rs) => rs?.map((x) => (x.id === r.id ? { ...x, ...p } : x)) ?? null);
    toast(msg);
    return true;
  };

  const move = async (r: BulkRow, dir: -1 | 1) => {
    const list = [...active];
    const i = list.findIndex((x) => x.id === r.id), j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    const changes = list.map((x, k) => ({ id: x.id, display_order: (k + 1) * 10 })).filter((c) => list.find((x) => x.id === c.id)!.display_order !== c.display_order);
    const res = await Promise.all(changes.map((c) => sb.from('bulk_menu_items').update({ display_order: c.display_order }).eq('id', c.id)));
    const e = res.find((x) => x.error)?.error;
    if (e) toast(errText(e), 'err'); else toast('Order saved.');
    void load();
  };

  const saveMax = async () => {
    if (!maxTotal) return;
    const v = Math.round(Number(maxTotal.text));
    if (!(v >= 1 && v <= 500)) { toast('Enter a total between 1 and 500 kg.', 'err'); return; }
    const { error } = await sb.from('restaurant_settings').update({ bulk_max_total_kg: v }).eq('id', 1);
    if (error) { toast(errText(error), 'err'); return; }
    setMaxTotal({ saved: v, text: String(v) });
    toast(`Online bulk enquiries are now limited to ${v} kg in total.`);
  };
  const ruleErr = (() => {
    const [mn, mx, fr, hr] = [bulkRule.min, bulkRule.max, bulkRule.free, bulkRule.hours].map(Number);
    if (![mn, mx, fr, hr].every((x) => Number.isInteger(x))) return 'Use whole numbers.';
    if (mn < 1 || mx > 50 || mn > mx) return 'Minimum and maximum must be between 1 and 50 kg, minimum ≤ maximum.';
    if (fr < 0 || fr > 50) return '“No notice up to” must be 0–50 kg.';
    if (hr < 0 || hr > 168) return 'Notice must be 0–168 hours.';
    return '';
  })();

  return (
    <div>
      {rows && (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="On website" value={active.filter((r) => r.is_available && !r.is_sold_out).length} />
          <Stat label="Hidden" value={active.filter((r) => !r.is_available).length} tone={active.some((r) => !r.is_available) ? 'warn' : undefined} />
          <Stat label="Sold out" value={active.filter((r) => r.is_sold_out).length} />
          <Stat label="With private notes" value={active.filter((r) => r.admin_note).length} hint="gold notes in the list" />
        </div>
      )}

      <Card className="mb-4 space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Maximum total per online enquiry (kg)" hint="Customers can mix dishes up to this total; larger orders call you.">
            <Input inputMode="numeric" className="!w-28" value={maxTotal?.text ?? ''} onChange={(e) => maxTotal && setMaxTotal({ ...maxTotal, text: e.target.value.replace(/\D/g, '').slice(0, 3) })} aria-label="Maximum total kilograms per enquiry" />
          </Field>
          <Btn tone="gold" disabled={!maxTotal || maxTotal.text === String(maxTotal.saved)} onClick={() => void saveMax()}>Save limit</Btn>
        </div>
        <details className="rounded-xl border border-white/10 p-3">
          <summary className="cursor-pointer text-sm font-semibold text-ivory">Apply one quantity & notice rule to every bulk dish</summary>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <Field label="Min kg"><Input inputMode="numeric" className="!w-20" value={bulkRule.min} onChange={(e) => setBulkRule({ ...bulkRule, min: e.target.value.replace(/\D/g, '') })} /></Field>
            <Field label="Max kg"><Input inputMode="numeric" className="!w-20" value={bulkRule.max} onChange={(e) => setBulkRule({ ...bulkRule, max: e.target.value.replace(/\D/g, '') })} /></Field>
            <Field label="No notice up to (kg)"><Input inputMode="numeric" className="!w-24" value={bulkRule.free} onChange={(e) => setBulkRule({ ...bulkRule, free: e.target.value.replace(/\D/g, '') })} /></Field>
            <Field label="Notice above that (hours)"><Input inputMode="numeric" className="!w-24" value={bulkRule.hours} onChange={(e) => setBulkRule({ ...bulkRule, hours: e.target.value.replace(/\D/g, '') })} /></Field>
            <Btn disabled={!!ruleErr || !active.length} onClick={() => setApplyAll(true)}>Apply to all…</Btn>
          </div>
          {ruleErr && <p className="mt-2 text-xs text-red-300">{ruleErr}</p>}
          <p className="mt-2 text-[11px] text-ivory/50">Each dish can still be changed on its own afterwards. The “timing confirmed” mark is not changed.</p>
        </details>
      </Card>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="relative min-w-[200px] flex-1"><span className="sr-only">Search bulk dishes</span>
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ivory/40" />
          <Input className="pl-9" placeholder="Search bulk dishes" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <Select aria-label="Category" value={cat} onChange={(e) => setCat(e.target.value as typeof cat)} className="!w-44">
          <option value="all">All categories</option>
          {CATS.map((c) => <option key={c} value={c}>{BULK_CATEGORY_LABEL[c]}</option>)}
        </Select>
        <Select aria-label="Availability" value={avail} onChange={(e) => setAvail(e.target.value as typeof avail)} className="!w-40">
          <option value="active">All active</option>
          <option value="shown">On website</option>
          <option value="hidden">Hidden</option>
          <option value="soldout">Sold out</option>
          <option value="archived">Archived</option>
        </Select>
        <Btn onClick={() => void load()}><RefreshCw size={16} /> Refresh</Btn>
        <Btn tone="gold" onClick={() => setAdding(true)}><Plus size={16} /> Add bulk dish</Btn>
      </div>

      {err && <Notice kind="err">{err}</Notice>}
      {!rows ? <Skeleton rows={4} /> : !shown.length ? <Empty title={avail === 'archived' ? 'No archived bulk dishes' : 'No bulk dishes match'} /> : (
        <ul className="space-y-2" aria-label="Bulk menu">
          {shown.map((r) => {
            const idx = active.findIndex((x) => x.id === r.id);
            return (
              <li key={r.id} className={`rounded-xl border border-white/10 bg-white/[0.03] p-3 ${r.archived_at ? 'opacity-60' : ''}`} data-bulk-admin-row={r.slug}>
                <div className="flex flex-wrap items-center gap-3">
                  {!r.archived_at && (
                    <div className="flex flex-col">
                      <button type="button" className="grid h-8 w-8 place-items-center rounded hover:bg-white/10 disabled:opacity-30" disabled={idx <= 0} onClick={() => void move(r, -1)} aria-label={`Move ${r.name} up`}><ArrowUp size={14} /></button>
                      <button type="button" className="grid h-8 w-8 place-items-center rounded hover:bg-white/10 disabled:opacity-30" disabled={idx < 0 || idx >= active.length - 1} onClick={() => void move(r, 1)} aria-label={`Move ${r.name} down`}><ArrowDown size={14} /></button>
                    </div>
                  )}
                  <PhotoTile src={r.image_path} name={r.name} folder="bulk" disabled={!!r.archived_at}
                    onSaved={async (url) => { await patch(r, { image_path: url, image_kind: 'photo' }, `Photo saved for ${r.name}.`); }} />
                  <button type="button" className="min-w-[180px] flex-1 text-left" onClick={() => setEdit(r)} aria-label={`${r.name} — edit`}>
                    <p className="font-semibold text-ivory">{r.name} {!r.is_available && !r.archived_at && <Badge tone="warn">Hidden</Badge>} {r.is_sold_out && <Badge tone="bad">Sold out</Badge>} {r.archived_at && <Badge>Archived</Badge>}</p>
                    <p className="text-xs text-ivory/55">{BULK_CATEGORY_LABEL[r.category]} · {r.diet === 'veg' ? 'Veg' : r.diet === 'non-veg' ? 'Non-veg' : 'Diet not set'} · {rule(r)}{r.timing_confirmed ? ' · timing confirmed' : ''}</p>
                    {r.admin_note && <p className="mt-1 text-xs text-amber-200">Note: {r.admin_note}</p>}
                  </button>
                  <p className="font-num text-lg font-semibold text-gold">{inr(r.price_per_kg)}<span className="text-xs font-normal text-ivory/55"> /kg</span></p>
                  {!r.archived_at && (
                    <div className="flex flex-wrap items-center gap-x-4">
                      <div className="w-36"><Toggle checked={r.is_available} label="On website" onChange={(v) => void patch(r, { is_available: v }, v ? `${r.name} is now shown on the website.` : `${r.name} is hidden from the website.`)} /></div>
                      <div className="w-32"><Toggle checked={r.is_sold_out} label="Sold out" onChange={(v) => void patch(r, { is_sold_out: v }, v ? `${r.name} marked sold out.` : `${r.name} is available again.`)} /></div>
                    </div>
                  )}
                  <Btn onClick={() => setEdit(r)}>Edit</Btn>
                  <ActionMenu label={`Actions for ${r.name}`} items={r.archived_at
                    ? [{ label: 'Restore (stays hidden)', onClick: () => void patch(r, { archived_at: null, is_available: false }, `${r.name} restored — switch on “On website” when ready.`) }]
                    : [{ label: 'Archive…', onClick: () => setArchive(r), danger: true }]} />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {edit && <BulkEditor key={edit.id} row={edit} onClose={() => setEdit(null)} onSaved={(r) => { setRows((rs) => rs?.map((x) => (x.id === r.id ? r : x)) ?? null); setEdit(null); }} />}
      <AddBulkDish open={adding} onClose={() => setAdding(false)} existing={rows ?? []} onAdded={(r) => { setAdding(false); setRows((rs) => [...(rs ?? []), r]); setEdit(r); }} />
      <Confirm open={!!archive} onClose={() => setArchive(null)} danger title={`Archive ${archive?.name ?? ''}?`}
        body={<p>It disappears from the website and cannot be ordered. Enquiries and bills that already include it keep their prices. You can restore it from “Archived”.</p>}
        confirmLabel="Archive" onConfirm={async () => { if (archive && (await patch(archive, { archived_at: new Date().toISOString(), is_available: false }, `${archive.name} archived.`))) setArchive(null); }} />
      <Confirm open={applyAll} onClose={() => setApplyAll(false)} busy={busy} title="Apply this rule to every bulk dish?"
        body={<p>All {active.length} active bulk dishes will use <b>{bulkRule.min}–{bulkRule.max} kg</b>, no notice up to <b>{bulkRule.free} kg</b>, and <b>{bulkRule.hours} hours</b>’ notice above that. Customers who already added more than the new maximum are asked to adjust.</p>}
        confirmLabel="Apply to all" onConfirm={async () => {
          setBusy(true);
          const { error } = await sb.from('bulk_menu_items').update({ min_kg: Number(bulkRule.min), max_kg: Number(bulkRule.max), notice_free_up_to_kg: Number(bulkRule.free), advance_notice_hours: Number(bulkRule.hours) }).is('archived_at', null);
          setBusy(false);
          if (error) { toast(errText(error), 'err'); return; }
          toast('Rule applied to all bulk dishes.');
          setApplyAll(false);
          void load();
        }} />
    </div>
  );
}

function AddBulkDish({ open, onClose, existing, onAdded }: { open: boolean; onClose: () => void; existing: BulkRow[]; onAdded: (r: BulkRow) => void }) {
  const { sb, toast } = useAdmin();
  const [f, setF] = useState({ name: '', category: 'chicken' as BulkCategory, diet: 'non-veg' as BulkRow['diet'], price: '' });
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setF({ name: '', category: 'chicken', diet: 'non-veg', price: '' }); }, [open]);
  const price = Number(f.price);
  const err = f.name.trim().length < 2 ? 'Enter the dish name.' : !(price > 0 && price <= 100000) ? 'Enter the price per kg.' : '';
  return (
    <Modal open={open} onClose={onClose} title="Add a bulk dish">
      <div className="space-y-3">
        <Field label="Dish name"><Input value={f.name} maxLength={120} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Category"><Select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value as BulkCategory, diet: e.target.value === 'vegetarian' ? 'veg' : f.diet })}>{CATS.map((c) => <option key={c} value={c}>{BULK_CATEGORY_LABEL[c]}</option>)}</Select></Field>
          <Field label="Veg / non-veg"><Select value={f.diet} onChange={(e) => setF({ ...f, diet: e.target.value as BulkRow['diet'] })}><option value="veg">Vegetarian</option><option value="non-veg">Non-vegetarian</option><option value="unconfirmed">Not set</option></Select></Field>
          <Field label="Price per kg (₹)"><Input inputMode="decimal" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value.replace(/[^\d.]/g, '') })} /></Field>
        </div>
        <p className="text-xs text-ivory/55">The dish starts hidden. On the next screen add its photo and rules, then switch on “Show on website”.</p>
        <div className="flex justify-end gap-2">
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn tone="gold" busy={busy} disabled={!!err} title={err || undefined} onClick={async () => {
            setBusy(true);
            const base = slugify(f.name);
            let slug = base, n = 2;
            while (existing.some((r) => r.slug === slug)) slug = `${base}-${n++}`;
            const order = Math.max(0, ...existing.map((r) => r.display_order)) + 10;
            const { data, error } = await sb.from('bulk_menu_items').insert({ slug, name: f.name.trim(), category: f.category, diet: f.diet, price_per_kg: price, display_order: order, is_available: false }).select('*').single();
            setBusy(false);
            if (error) { toast(errText(error), 'err'); return; }
            toast(`${f.name.trim()} added (hidden).`);
            onAdded({ ...(data as BulkRow), price_per_kg: Number((data as BulkRow).price_per_kg) });
          }}>Add dish</Btn>
        </div>
      </div>
    </Modal>
  );
}

function BulkEditor({ row, onClose, onSaved }: { row: BulkRow; onClose: () => void; onSaved: (r: BulkRow) => void }) {
  const { sb, toast } = useAdmin();
  const [f, setF] = useState({
    name: row.name, category: row.category, diet: row.diet, price: String(row.price_per_kg), description: row.description ?? '',
    min: String(row.min_kg), max: String(row.max_kg), free: String(row.notice_free_up_to_kg), hours: String(row.advance_notice_hours),
    timing_confirmed: row.timing_confirmed, is_available: row.is_available, is_sold_out: row.is_sold_out, admin_note: row.admin_note ?? '',
    image_path: row.image_path, image_kind: row.image_kind,
  });
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<typeof f>) => setF((s) => ({ ...s, ...p }));
  const { uploading, onChange } = usePhotoUpload('bulk', (url) => { set({ image_path: url, image_kind: 'photo' }); toast('Photo uploaded — press Save changes to use it.'); });
  const original = row.image_kind === 'promotional' ? row.image_path : null;

  const price = Number(f.price), mn = Number(f.min), mx = Number(f.max), fr = Number(f.free), hr = Number(f.hours);
  const errors: Record<string, string> = {};
  if (f.name.trim().length < 2) errors.name = 'Name must be at least 2 characters.';
  if (!(price > 0 && price <= 100000) || !/^\d+(\.\d{1,2})?$/.test(f.price)) errors.price = 'Enter a price per kg (up to 2 decimals).';
  if (![mn, mx].every(Number.isInteger) || mn < 1 || mx > 50 || mn > mx) errors.kg = 'Minimum and maximum must be whole kg between 1 and 50, minimum ≤ maximum.';
  if (!Number.isInteger(fr) || fr < 0 || fr > 50) errors.free = 'Whole kg, 0–50.';
  if (!Number.isInteger(hr) || hr < 0 || hr > 168) errors.hours = 'Whole hours, 0–168.';
  const changed = JSON.stringify(f) !== JSON.stringify({
    name: row.name, category: row.category, diet: row.diet, price: String(row.price_per_kg), description: row.description ?? '',
    min: String(row.min_kg), max: String(row.max_kg), free: String(row.notice_free_up_to_kg), hours: String(row.advance_notice_hours),
    timing_confirmed: row.timing_confirmed, is_available: row.is_available, is_sold_out: row.is_sold_out, admin_note: row.admin_note ?? '',
    image_path: row.image_path, image_kind: row.image_kind,
  });
  const ok = !Object.keys(errors).length;
  const examples = [Math.max(mn || 1, 1), Math.min(Math.max(mn || 1, 5), mx || 20), mx || 20].filter((v, i, a) => a.indexOf(v) === i);

  const save = async () => {
    if (!ok) return;
    setBusy(true);
    const p = {
      name: f.name.trim(), category: f.category, diet: f.diet, price_per_kg: price, description: f.description.trim(),
      min_kg: mn, max_kg: mx, notice_free_up_to_kg: fr, advance_notice_hours: hr, timing_confirmed: f.timing_confirmed,
      is_available: f.is_available, is_sold_out: f.is_sold_out, admin_note: f.admin_note.trim() || null,
      image_path: f.image_path, image_kind: f.image_path ? f.image_kind : null,
    };
    const { data, error } = await sb.from('bulk_menu_items').update(p).eq('id', row.id).select('*').single();
    setBusy(false);
    if (error) { toast(errText(error), 'err'); return; }
    toast(price !== row.price_per_kg ? `Saved. New enquiries use ${inr(price)}/kg; earlier enquiries and bills keep their prices.` : 'Changes saved.');
    onSaved({ ...(data as BulkRow), price_per_kg: Number((data as BulkRow).price_per_kg) });
  };

  return (
    <Modal open onClose={onClose} title={`Edit bulk dish — ${row.name}`} wide>
      <div className="space-y-4">
        <div className="rounded-xl border border-gold/30 bg-gold/[0.06] p-3">
          <p className="mb-2 text-sm font-semibold text-ivory">Dish photo</p>
          <div className="flex flex-wrap items-center gap-4">
            <div className="grid h-28 w-40 shrink-0 place-items-center overflow-hidden rounded-xl border border-white/15 bg-black/30">
              {f.image_path ? <img src={asset(f.image_path)} alt={`Photo of ${f.name}`} className="h-full w-full object-cover" /> : <span className="flex flex-col items-center gap-1 text-xs text-ivory/55"><ImagePlus size={22} /> No photo yet</span>}
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <label className={`inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-lg bg-gold px-5 text-sm font-semibold text-smoke focus-within:ring-2 focus-within:ring-ivory ${uploading ? 'pointer-events-none opacity-60' : 'hover:brightness-110'}`}>
                {uploading ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />} {uploading ? 'Uploading…' : f.image_path ? 'Change photo' : 'Add photo'}
                <input type="file" accept="image/*" className="sr-only" aria-label="Choose bulk dish photo" disabled={uploading} onChange={(e) => void onChange(e)} />
              </label>
              {f.image_path !== row.image_path && <p className="text-xs text-emerald-300">New photo ready — press Save changes to use it.</p>}
              {f.image_path && f.image_path !== original && !uploading && (
                <div><Btn tone="quiet" onClick={() => set({ image_path: original, image_kind: original ? 'promotional' : null })}>{original ? 'Go back to the original picture' : 'Remove photo'}</Btn></div>
              )}
              <p className="text-xs text-ivory/55">Use a real photo of this dish. Without one, the website shows a “photo coming soon” placeholder — never another dish’s picture.</p>
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Dish name"><Input value={f.name} maxLength={120} onChange={(e) => set({ name: e.target.value })} aria-invalid={!!errors.name} /></Field>
          <Field label="Price per kg (₹)"><Input inputMode="decimal" value={f.price} onChange={(e) => set({ price: e.target.value.replace(/[^\d.]/g, '') })} aria-invalid={!!errors.price} /></Field>
          <Field label="Category"><Select value={f.category} onChange={(e) => set({ category: e.target.value as BulkCategory })}>{CATS.map((c) => <option key={c} value={c}>{BULK_CATEGORY_LABEL[c]}</option>)}</Select></Field>
          <Field label="Veg / non-veg"><Select value={f.diet} onChange={(e) => set({ diet: e.target.value as BulkRow['diet'] })}><option value="veg">Vegetarian</option><option value="non-veg">Non-vegetarian</option><option value="unconfirmed">Not set</option></Select></Field>
        </div>
        {(errors.name || errors.price) && <p className="text-xs text-red-300">{errors.name || errors.price}</p>}
        <Field label="Short description (optional)" hint="Only write what you are sure about."><Textarea rows={2} maxLength={400} value={f.description} onChange={(e) => set({ description: e.target.value })} /></Field>

        <fieldset className="rounded-xl border border-white/10 p-3">
          <legend className="px-1 text-sm font-semibold text-ivory">Quantity & advance notice</legend>
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="Min kg"><Input inputMode="numeric" value={f.min} onChange={(e) => set({ min: e.target.value.replace(/\D/g, '') })} /></Field>
            <Field label="Max kg"><Input inputMode="numeric" value={f.max} onChange={(e) => set({ max: e.target.value.replace(/\D/g, '') })} /></Field>
            <Field label="No notice up to (kg)"><Input inputMode="numeric" value={f.free} onChange={(e) => set({ free: e.target.value.replace(/\D/g, '') })} /></Field>
            <Field label="Notice above that (h)"><Input inputMode="numeric" value={f.hours} onChange={(e) => set({ hours: e.target.value.replace(/\D/g, '') })} /></Field>
          </div>
          {(errors.kg || errors.free || errors.hours) && <p className="mt-2 text-xs text-red-300">{errors.kg || errors.free || errors.hours}</p>}
          <div className="mt-2"><Toggle checked={f.timing_confirmed} onChange={(v) => set({ timing_confirmed: v })} label="Timing confirmed by the restaurant" hint="Off: customers see “preparation time is confirmed with your quotation”." /></div>
        </fieldset>

        <div className="grid gap-x-6 sm:grid-cols-2">
          <Toggle checked={f.is_available} onChange={(v) => set({ is_available: v })} label="Show on website" />
          <Toggle checked={f.is_sold_out} onChange={(v) => set({ is_sold_out: v })} label="Sold out" />
        </div>
        <Field label="Private note (never shown to customers)"><Textarea rows={2} maxLength={500} value={f.admin_note} onChange={(e) => set({ admin_note: e.target.value })} /></Field>

        <div className="rounded-xl bg-black/30 p-3 text-sm" aria-label="Customer preview">
          <p className="text-[11px] uppercase tracking-[0.14em] text-ivory/50">Customer preview</p>
          <p className="mt-1 font-semibold text-ivory">{f.name.trim() || '—'} · <span className="text-gold">{ok ? inr(price) : '—'} per kg</span> {!f.is_available && <Badge tone="warn">hidden</Badge>} {f.is_sold_out && <Badge tone="bad">sold out</Badge>}</p>
          {ok && <p className="mt-1 font-num text-xs text-ivory/70">{examples.map((k) => `${k} kg = ${inr(k * price)}`).join(' · ')}</p>}
          {ok && <p className="mt-1 text-xs text-ivory/55">Orders {mn}–{mx} kg{hr > 0 && fr < mx ? ` · above ${fr} kg needs ${hr} h notice` : ''}{f.timing_confirmed ? '' : ' · timing confirmed with the quotation'}</p>}
        </div>

        <div className="sticky bottom-0 -mx-1 flex justify-end gap-2 bg-[#120c08]/95 px-1 py-2">
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn tone="gold" busy={busy} disabled={!ok || !changed || uploading} onClick={() => void save()}>Save changes</Btn>
        </div>
      </div>
    </Modal>
  );
}
