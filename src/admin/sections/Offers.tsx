import { Eye, Plus, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Badge, Btn, Confirm, Empty, errText, Field, fmtDT, Input, inr, Modal, Notice, PageHeader, Select, Skeleton, Textarea, Toggle, useAdmin } from '../ui';
import { ActionMenu } from './Menu3';
import { uploadImage } from './upload';

interface Offer {
  id: string; title: string; description: string; discount_type: 'percent' | 'fixed'; discount_value: number; code: string | null;
  is_public: boolean; applies_to: 'all' | 'dishes' | 'categories'; dish_ids: string[]; category_ids: string[]; min_order: number;
  max_discount: number | null; starts_at: string | null; ends_at: string | null; usage_limit: number | null; per_phone_limit: number | null;
  used_count: number; is_active: boolean; priority: number; banner_url: string | null; archived_at: string | null; created_at: string;
}
type Draft = Omit<Offer, 'id' | 'used_count' | 'archived_at' | 'created_at'> & { id?: string };

const blank: Draft = {
  title: '', description: '', discount_type: 'percent', discount_value: 10, code: null, is_public: true, applies_to: 'all',
  dish_ids: [], category_ids: [], min_order: 0, max_discount: null, starts_at: null, ends_at: null, usage_limit: null,
  per_phone_limit: null, is_active: false, priority: 0, banner_url: null,
};

// <input type=datetime-local> works in local time; the restaurant runs on India time.
const toLocal = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() + 330 * 60000).toISOString().slice(0, 16) : '');
const fromLocal = (v: string) => (v ? new Date(`${v}:00+05:30`).toISOString() : null);

export const offerState = (o: Offer) => {
  if (o.archived_at) return { label: 'Archived', tone: 'neutral' as const };
  if (!o.is_active) return { label: 'Inactive', tone: 'neutral' as const };
  if (o.ends_at && new Date(o.ends_at) <= new Date()) return { label: 'Expired', tone: 'bad' as const };
  if (o.starts_at && new Date(o.starts_at) > new Date()) return { label: 'Scheduled', tone: 'info' as const };
  if (o.usage_limit && o.used_count >= o.usage_limit) return { label: 'Used up', tone: 'warn' as const };
  return { label: 'Live', tone: 'good' as const };
};

export function Offers() {
  const { sb, toast } = useAdmin();
  const [rows, setRows] = useState<Offer[] | null>(null);
  const [err, setErr] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [del, setDel] = useState<Offer | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await sb.from('offers').select('*').order('created_at', { ascending: false });
    if (error) { setErr(errText(error, 'Could not load offers.')); return; }
    setErr('');
    setRows((data as Offer[]).map((o) => ({ ...o, discount_value: Number(o.discount_value), min_order: Number(o.min_order), max_discount: o.max_discount == null ? null : Number(o.max_discount) })));
  }, [sb]);
  useEffect(() => { void load(); }, [load]);

  const patch = async (o: Offer, p: Partial<Offer>, msg: string) => {
    const { error } = await sb.from('offers').update(p).eq('id', o.id);
    if (error) toast(errText(error), 'err'); else { toast(msg); void load(); }
  };

  const shown = (rows ?? []).filter((o) => showArchived || !o.archived_at);
  return (
    <section aria-label="Offers and discounts">
      <PageHeader title="Offers & Discounts" intro="Every discount is checked by the database at checkout — expired, used-up or invalid coupons are refused with a clear reason."
        actions={<>
          <Btn onClick={() => void load()}><RefreshCw size={16} /> Refresh</Btn>
          <a className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-white/20 px-4 text-sm font-semibold hover:bg-white/10" href="./#offers" target="_blank" rel="noopener noreferrer"><Eye size={16} /> Preview on website</a>
          <Btn tone="gold" onClick={() => setDraft({ ...blank })}><Plus size={16} /> New offer</Btn>
        </>} />
      <label className="mb-4 flex items-center gap-2 text-xs text-ivory/60"><input type="checkbox" className="h-4 w-4 accent-[#D4AF37]" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Show archived</label>
      {err && <Notice kind="err">{err}</Notice>}
      {!rows ? <Skeleton rows={3} /> : !shown.length ? <Empty title="No offers yet">Create one with “New offer”. It stays inactive until you switch it on.</Empty> : (
        <ul className="grid gap-3 md:grid-cols-2">
          {shown.map((o) => {
            const st = offerState(o);
            return (
              <li key={o.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{o.title}</p>
                    <p className="text-sm text-gold">{o.discount_type === 'percent' ? `${o.discount_value}% off` : `${inr(o.discount_value)} off`}{o.max_discount ? ` (max ${inr(o.max_discount)})` : ''}</p>
                  </div>
                  <ActionMenu label={`Actions for ${o.title}`} items={[
                    { label: 'Edit', onClick: () => setDraft({ ...o }) },
                    { label: 'Duplicate', onClick: () => setDraft({ ...o, id: undefined, title: `${o.title} (copy)`.slice(0, 80), code: null, is_active: false }) },
                    o.is_active ? { label: 'Deactivate', onClick: () => void patch(o, { is_active: false }, 'Offer deactivated.') } : { label: 'Activate', onClick: () => void patch(o, { is_active: true }, 'Offer activated.'), disabled: !!o.archived_at },
                    o.archived_at ? { label: 'Restore', onClick: () => void patch(o, { archived_at: null }, 'Offer restored.') } : { label: 'Archive', onClick: () => void patch(o, { archived_at: new Date().toISOString(), is_active: false }, 'Offer archived.') },
                    { label: 'Delete…', onClick: () => setDel(o), danger: true },
                  ]} />
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  <Badge tone={st.tone}>{st.label}</Badge>
                  {o.code ? <Badge tone="gold">Code {o.code}</Badge> : <Badge>Automatic</Badge>}
                  {!o.is_public && <Badge>Hidden from website</Badge>}
                  <Badge>{o.applies_to === 'all' ? 'Whole menu' : o.applies_to === 'dishes' ? `${o.dish_ids.length} dish(es)` : `${o.category_ids.length} category(ies)`}</Badge>
                </div>
                <p className="mt-2 text-xs text-ivory/55">
                  Used {o.used_count}{o.usage_limit ? ` / ${o.usage_limit}` : ''} times{o.min_order ? ` · min order ${inr(o.min_order)}` : ''}
                  {o.starts_at ? ` · from ${fmtDT(o.starts_at)}` : ''}{o.ends_at ? ` · until ${fmtDT(o.ends_at)}` : ''}
                </p>
              </li>
            );
          })}
        </ul>
      )}
      {draft && <OfferForm draft={draft} onClose={() => setDraft(null)} onSaved={() => { setDraft(null); void load(); }} />}
      <Confirm open={!!del} onClose={() => setDel(null)} danger title="Delete offer?"
        body={del?.used_count ? <p>This offer was used {del.used_count} time(s). To keep a correct history it can’t be deleted — archive it instead.</p> : <p>“{del?.title}” has never been used and will be deleted permanently.</p>}
        confirmLabel={del?.used_count ? 'Archive instead' : 'Delete'}
        onConfirm={async () => {
          if (!del) return;
          const { error } = del.used_count
            ? await sb.from('offers').update({ archived_at: new Date().toISOString(), is_active: false }).eq('id', del.id)
            : await sb.from('offers').delete().eq('id', del.id);
          if (error) toast(errText(error), 'err'); else { toast(del.used_count ? 'Offer archived.' : 'Offer deleted.'); setDel(null); void load(); }
        }} />
    </section>
  );
}

function OfferForm({ draft, onClose, onSaved }: { draft: Draft; onClose: () => void; onSaved: () => void }) {
  const { sb, toast } = useAdmin();
  const [f, setF] = useState<Draft>(draft);
  const [dishes, setDishes] = useState<{ id: string; name: string }[]>([]);
  const [cats, setCats] = useState<{ id: string; label: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const set = (p: Partial<Draft>) => setF((s) => ({ ...s, ...p }));
  useEffect(() => {
    void sb.from('dishes').select('id,name').is('archived_at', null).order('sort_order').then(({ data }) => setDishes((data as never) ?? []));
    void sb.from('categories').select('id,label').order('sort_order').then(({ data }) => setCats((data as never) ?? []));
  }, [sb]);

  const problems = [
    f.title.trim().length < 2 && 'Give the offer a title.',
    !(f.discount_value > 0) && 'Discount must be more than 0.',
    f.discount_type === 'percent' && f.discount_value > 100 && 'A percentage discount cannot be over 100%.',
    f.code && !/^[A-Z0-9]{3,20}$/.test(f.code) && 'Coupon code: 3–20 letters/numbers, no spaces.',
    f.applies_to === 'dishes' && !f.dish_ids.length && 'Pick at least one dish.',
    f.applies_to === 'categories' && !f.category_ids.length && 'Pick at least one category.',
    f.starts_at && f.ends_at && new Date(f.ends_at) <= new Date(f.starts_at) && 'End must be after start.',
  ].filter(Boolean) as string[];

  const save = async () => {
    if (problems.length) return;
    setBusy(true);
    const row = {
      title: f.title.trim(), description: f.description.trim(), discount_type: f.discount_type, discount_value: f.discount_value,
      code: f.code || null, is_public: f.is_public, applies_to: f.applies_to,
      dish_ids: f.applies_to === 'dishes' ? f.dish_ids : [], category_ids: f.applies_to === 'categories' ? f.category_ids : [],
      min_order: f.min_order || 0, max_discount: f.max_discount || null, starts_at: f.starts_at, ends_at: f.ends_at,
      usage_limit: f.usage_limit || null, per_phone_limit: f.per_phone_limit || null, is_active: f.is_active, priority: f.priority || 0,
      banner_url: f.banner_url,
    };
    const { error } = f.id ? await sb.from('offers').update(row).eq('id', f.id) : await sb.from('offers').insert(row);
    setBusy(false);
    if (error) toast(/duplicate/.test(error.message) ? 'That coupon code is already used by another offer.' : errText(error), 'err');
    else { toast('Offer saved.'); onSaved(); }
  };
  const num = (v: string) => (v === '' ? 0 : Number(v.replace(/[^\d.]/g, '')));
  const toggleIn = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  return (
    <Modal open onClose={onClose} title={f.id ? 'Edit offer' : 'New offer'} wide>
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Title *"><Input value={f.title} maxLength={80} onChange={(e) => set({ title: e.target.value })} placeholder="Weekend feast" /></Field>
          <Field label="Coupon code" hint="Leave empty for an automatic offer."><Input value={f.code ?? ''} maxLength={20} onChange={(e) => set({ code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') || null })} placeholder="DAWAT10" /></Field>
        </div>
        <Field label="Description (shown to customers)"><Textarea rows={2} maxLength={300} value={f.description} onChange={(e) => set({ description: e.target.value })} /></Field>
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Type"><Select value={f.discount_type} onChange={(e) => set({ discount_type: e.target.value as Draft['discount_type'] })}><option value="percent">Percentage %</option><option value="fixed">Fixed ₹</option></Select></Field>
          <Field label={f.discount_type === 'percent' ? 'Discount %' : 'Discount ₹'}><Input inputMode="decimal" value={String(f.discount_value || '')} onChange={(e) => set({ discount_value: num(e.target.value) })} /></Field>
          <Field label="Minimum order ₹"><Input inputMode="decimal" value={String(f.min_order || '')} onChange={(e) => set({ min_order: num(e.target.value) })} placeholder="0" /></Field>
          <Field label="Maximum discount ₹"><Input inputMode="decimal" value={f.max_discount ? String(f.max_discount) : ''} onChange={(e) => set({ max_discount: num(e.target.value) || null })} placeholder="No cap" /></Field>
        </div>
        <Field label="Applies to">
          <Select value={f.applies_to} onChange={(e) => set({ applies_to: e.target.value as Draft['applies_to'] })}>
            <option value="all">Whole menu</option><option value="dishes">Selected dishes</option><option value="categories">Selected categories</option>
          </Select>
        </Field>
        {f.applies_to === 'dishes' && (
          <fieldset className="grid gap-1 sm:grid-cols-2"><legend className="sr-only">Dishes</legend>
            {dishes.map((d) => <label key={d.id} className="flex min-h-[36px] items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-[#D4AF37]" checked={f.dish_ids.includes(d.id)} onChange={() => set({ dish_ids: toggleIn(f.dish_ids, d.id) })} />{d.name}</label>)}
          </fieldset>
        )}
        {f.applies_to === 'categories' && (
          <fieldset className="grid gap-1 sm:grid-cols-3"><legend className="sr-only">Categories</legend>
            {cats.map((c) => <label key={c.id} className="flex min-h-[36px] items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-[#D4AF37]" checked={f.category_ids.includes(c.id)} onChange={() => set({ category_ids: toggleIn(f.category_ids, c.id) })} />{c.label}</label>)}
          </fieldset>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Starts (India time)" hint="Empty = immediately"><Input type="datetime-local" value={toLocal(f.starts_at)} onChange={(e) => set({ starts_at: fromLocal(e.target.value) })} /></Field>
          <Field label="Ends (India time)" hint="Empty = no end date"><Input type="datetime-local" value={toLocal(f.ends_at)} onChange={(e) => set({ ends_at: fromLocal(e.target.value) })} /></Field>
          <Field label="Total uses allowed" hint="Empty = unlimited"><Input inputMode="numeric" value={f.usage_limit ? String(f.usage_limit) : ''} onChange={(e) => set({ usage_limit: Number(e.target.value.replace(/\D/g, '')) || null })} /></Field>
          <Field label="Uses per phone number" hint="Limits repeat use; a phone number is not proof of identity."><Input inputMode="numeric" value={f.per_phone_limit ? String(f.per_phone_limit) : ''} onChange={(e) => set({ per_phone_limit: Number(e.target.value.replace(/\D/g, '')) || null })} /></Field>
          <Field label="Display priority" hint="Higher shows first"><Input inputMode="numeric" value={String(f.priority)} onChange={(e) => set({ priority: Number(e.target.value.replace(/[^\d-]/g, '')) || 0 })} /></Field>
          <Field label="Banner image (optional)">
            <div className="flex items-center gap-2">
              <input type="file" accept="image/jpeg,image/png,image/webp" className="text-xs" disabled={uploading} onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setUploading(true);
                const r = await uploadImage(sb, file, 'offers');
                setUploading(false);
                if ('error' in r) toast(r.error, 'err'); else set({ banner_url: r.url });
              }} />
              {f.banner_url && <Btn tone="quiet" onClick={() => set({ banner_url: null })}>Remove</Btn>}
            </div>
          </Field>
        </div>
        {f.banner_url && <img src={f.banner_url} alt="" className="aspect-[3/1] w-full rounded-lg object-cover" />}
        <div className="grid gap-1 sm:grid-cols-2">
          <Toggle label="Active" hint="Customers can use it now (within its dates)" checked={f.is_active} onChange={(v) => set({ is_active: v })} />
          <Toggle label="Show on website" hint="Off = secret coupon you share yourself" checked={f.is_public} onChange={(v) => set({ is_public: v })} />
        </div>
        {problems.length > 0 && <ul className="space-y-1 text-xs text-red-300">{problems.map((p) => <li key={p}>{p}</li>)}</ul>}
        <div className="flex justify-end gap-2">
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn tone="gold" busy={busy} disabled={!!problems.length || uploading} onClick={() => void save()}>Save offer</Btn>
        </div>
      </div>
    </Modal>
  );
}
