import { ArrowDown, ArrowUp, Plus, RefreshCw, Search } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { asset } from '../utils/format';
import { Badge, Btn, Confirm, Empty, errText, Field, Input, inr, Modal, Notice, PageHeader, Select, Skeleton, Textarea, Toggle, useAdmin } from './ui';
import { ActionMenu } from './sections/Menu3';
import { uploadImage } from './sections/upload';

interface Variant { id?: string; label: string; price: string; is_available: boolean }
interface Dish {
  id: string; name: string; category_id: string | null; diet: 'veg' | 'non-veg' | 'unconfirmed'; status: 'available' | 'enquire';
  image_path: string | null; image_kind: 'promotional' | 'photo' | null; description: string; is_visible: boolean; sort_order: number;
  is_sold_out: boolean; is_chef_special: boolean; spice_level: 1 | 2 | 3 | null; archived_at: string | null; variants: Variant[];
}
interface Cat { id: string; label: string }

const slug = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

export function Dishes() {
  const { sb, toast } = useAdmin();
  const [dishes, setDishes] = useState<Dish[] | null>(null);
  const [cats, setCats] = useState<Cat[]>([]);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [edit, setEdit] = useState<Dish | null>(null);
  const [adding, setAdding] = useState(false);
  const [del, setDel] = useState<Dish | null>(null);

  const load = useCallback(async () => {
    const [d, c] = await Promise.all([
      sb.from('dishes').select('*, dish_variants(id,label,price,sort_order,is_available)').order('sort_order').order('id'),
      sb.from('categories').select('id,label').order('sort_order'),
    ]);
    if (d.error || c.error) { setErr(errText(d.error ?? c.error, 'Could not load the menu.')); return; }
    setErr('');
    setCats(c.data as Cat[]);
    setDishes((d.data as (Omit<Dish, 'variants'> & { dish_variants: { id: string; label: string; price: number; sort_order: number; is_available: boolean }[] })[]).map(({ dish_variants, ...rest }) => ({
      ...rest,
      variants: [...dish_variants].sort((a, b) => a.sort_order - b.sort_order).map((v) => ({ id: v.id, label: v.label, price: String(Number(v.price)), is_available: v.is_available })),
    })));
  }, [sb]);
  useEffect(() => { void load(); }, [load]);

  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    return (dishes ?? []).filter((d) => (showArchived || !d.archived_at) && (!n || d.name.toLowerCase().includes(n)));
  }, [dishes, q, showArchived]);

  const patch = async (d: Dish, p: Partial<Dish>, msg: string) => {
    const { error } = await sb.from('dishes').update(p).eq('id', d.id);
    if (error) toast(errText(error), 'err'); else { toast(msg); void load(); }
  };
  const move = async (i: number, dir: -1 | 1) => {
    const a = shown[i], b = shown[i + dir];
    if (!a || !b) return;
    const ao = a.sort_order === b.sort_order ? a.sort_order + dir : b.sort_order;
    const [r1, r2] = await Promise.all([
      sb.from('dishes').update({ sort_order: ao }).eq('id', a.id),
      sb.from('dishes').update({ sort_order: a.sort_order }).eq('id', b.id),
    ]);
    if (r1.error || r2.error) toast(errText(r1.error ?? r2.error), 'err');
    void load();
  };

  return (
    <section aria-label="Menu management">
      <PageHeader title="Menu Management" intro="Prices you save here are used immediately by checkout (the database recalculates every order). Old receipts keep the price at the time of ordering."
        actions={<>
          <Btn onClick={() => void load()}><RefreshCw size={16} /> Refresh</Btn>
          <Btn tone="gold" onClick={() => setAdding(true)}><Plus size={16} /> Add dish</Btn>
        </>} />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="relative min-w-[220px] flex-1">
          <span className="sr-only">Search dishes</span>
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ivory/40" />
          <Input className="pl-9" placeholder="Search dishes" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <label className="flex items-center gap-2 text-xs text-ivory/60"><input type="checkbox" className="h-4 w-4 accent-[#D4AF37]" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Show archived</label>
      </div>
      {err && <Notice kind="err">{err}</Notice>}
      {!dishes ? <Skeleton rows={5} /> : !shown.length ? <Empty title="No dishes">Add your first dish.</Empty> : (
        <ul className="space-y-2">
          {shown.map((d, i) => (
            <li key={d.id} className={`flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 ${d.archived_at ? 'opacity-55' : ''}`}>
              <div className="flex flex-col">
                <button type="button" aria-label={`Move ${d.name} up`} className="grid h-8 w-8 place-items-center rounded hover:bg-white/10 disabled:opacity-30" disabled={i === 0 || !!q} onClick={() => void move(i, -1)}><ArrowUp size={14} /></button>
                <button type="button" aria-label={`Move ${d.name} down`} className="grid h-8 w-8 place-items-center rounded hover:bg-white/10 disabled:opacity-30" disabled={i === shown.length - 1 || !!q} onClick={() => void move(i, 1)}><ArrowDown size={14} /></button>
              </div>
              {d.image_path ? <img src={asset(d.image_path)} alt="" className="h-14 w-14 rounded-lg object-cover" /> : <div className="h-14 w-14 rounded-lg bg-white/5" />}
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setEdit(d)}>
                <p className="font-semibold">{d.name}</p>
                <p className="text-xs text-ivory/55">{d.status === 'enquire' ? 'Price on enquiry' : d.variants.map((v) => `${v.label} ${inr(v.price)}${v.is_available ? '' : ' (off)'}`).join(' · ') || 'No price'}</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {!d.is_visible && <Badge>Hidden</Badge>}
                  {d.is_sold_out && <Badge tone="warn">Sold out</Badge>}
                  {d.is_chef_special && <Badge tone="gold">Chef’s special</Badge>}
                  {d.archived_at && <Badge>Archived</Badge>}
                </div>
              </button>
              <Btn onClick={() => void patch(d, { is_sold_out: !d.is_sold_out }, d.is_sold_out ? `${d.name} is available again.` : `${d.name} marked sold out.`)} disabled={!!d.archived_at}>
                {d.is_sold_out ? 'Mark available' : 'Mark sold out'}
              </Btn>
              <ActionMenu label={`Actions for ${d.name}`} items={[
                { label: 'Edit dish', onClick: () => setEdit(d) },
                d.is_visible ? { label: 'Hide from website', onClick: () => void patch(d, { is_visible: false }, 'Dish hidden.') } : { label: 'Show on website', onClick: () => void patch(d, { is_visible: true }, 'Dish visible.'), disabled: !!d.archived_at },
                { label: d.is_chef_special ? 'Remove chef’s special' : 'Mark chef’s special', onClick: () => void patch(d, { is_chef_special: !d.is_chef_special }, 'Saved.') },
                d.archived_at ? { label: 'Restore dish', onClick: () => void patch(d, { archived_at: null }, 'Dish restored (hidden — switch it on when ready).') } : { label: 'Archive dish', onClick: () => void patch(d, { archived_at: new Date().toISOString(), is_visible: false }, 'Dish archived.') },
                { label: 'Delete dish…', onClick: () => setDel(d), danger: true },
              ]} />
            </li>
          ))}
        </ul>
      )}
      {edit && <DishForm dish={edit} cats={cats} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); void load(); }} />}
      {adding && (
        <AddDish
          onClose={() => setAdding(false)}
          next={(dishes?.length ?? 0) + 1}
          onAdded={(id, name) => {
            setAdding(false);
            void load();
            setEdit({ id, name, category_id: null, diet: 'unconfirmed', status: 'available', image_path: null, image_kind: null, description: '', is_visible: false, sort_order: (dishes?.length ?? 0) + 1, is_sold_out: false, is_chef_special: false, spice_level: null, archived_at: null, variants: [] });
          }}
        />
      )}
      <Confirm open={!!del} onClose={() => setDel(null)} danger typeToConfirm="DELETE" title={`Delete ${del?.name}?`}
        body={<p>The dish and its portions are removed from the menu. Past orders and receipts keep their own copy of the name and price, so they are not affected. If you might sell it again, <b>archive</b> it instead.</p>}
        confirmLabel="Delete permanently"
        onConfirm={async () => {
          if (!del) return;
          const { error } = await sb.from('dishes').delete().eq('id', del.id);
          if (error) toast(errText(error), 'err'); else { toast(`${del.name} deleted.`); setDel(null); void load(); }
        }} />
    </section>
  );
}

function AddDish({ onClose, onAdded, next }: { onClose: () => void; onAdded: (id: string, name: string) => void; next: number }) {
  const { sb, toast } = useAdmin();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Modal open onClose={onClose} title="Add dish">
      <div className="space-y-3">
        <Field label="Dish name"><Input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
        <p className="text-xs text-ivory/55">The dish starts hidden. Add prices and details, then switch on “Show on website”.</p>
        <div className="flex justify-end gap-2">
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn tone="gold" busy={busy} disabled={!slug(name)} onClick={async () => {
            setBusy(true);
            const id = slug(name);
            const { error } = await sb.from('dishes').insert({ id, name: name.trim(), status: 'available', is_visible: false, sort_order: next });
            setBusy(false);
            if (error) toast(/duplicate/.test(error.message) ? 'A dish with this name already exists.' : errText(error), 'err');
            else onAdded(id, name.trim());
          }}>Add</Btn>
        </div>
      </div>
    </Modal>
  );
}

function DishForm({ dish, cats, onClose, onSaved }: { dish: Dish; cats: Cat[]; onClose: () => void; onSaved: () => void }) {
  const { sb, toast } = useAdmin();
  const [f, setF] = useState<Dish>(dish);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const set = (p: Partial<Dish>) => setF((s) => ({ ...s, ...p }));
  const setVar = (i: number, p: Partial<Variant>) => setF((s) => ({ ...s, variants: s.variants.map((v, n) => (n === i ? { ...v, ...p } : v)) }));

  const problems = [
    !f.name.trim() && 'Dish name cannot be empty.',
    f.variants.some((v) => !v.label.trim() || v.price.trim() === '' || !(Number(v.price) >= 0) || Number(v.price) > 100000) && 'Every portion needs a name and a valid price.',
    f.status === 'available' && f.variants.length === 0 && 'An orderable dish needs at least one price (or choose “Price on enquiry”).',
  ].filter(Boolean) as string[];

  const save = async () => {
    if (problems.length) return;
    setBusy(true);
    const up = await sb.from('dishes').update({
      name: f.name.trim(), category_id: f.category_id || null, diet: f.diet, status: f.status, description: f.description.trim(),
      is_visible: f.is_visible, is_sold_out: f.is_sold_out, is_chef_special: f.is_chef_special, spice_level: f.spice_level,
      image_path: f.image_path, image_kind: f.image_path ? f.image_kind ?? 'photo' : null,
    }).eq('id', f.id);
    let error = up.error;
    if (!error) {
      const keep = f.variants.filter((v) => v.id).map((v) => v.id!);
      for (const v of dish.variants.filter((v) => v.id && !keep.includes(v.id))) {
        const r = await sb.from('dish_variants').delete().eq('id', v.id!);
        error = error ?? r.error;
      }
      for (const [i, v] of f.variants.entries()) {
        const row = { label: v.label.trim(), price: Number(v.price), sort_order: i + 1, is_available: v.is_available };
        const r = v.id ? await sb.from('dish_variants').update(row).eq('id', v.id) : await sb.from('dish_variants').insert({ ...row, dish_id: f.id });
        error = error ?? r.error;
      }
    }
    setBusy(false);
    if (error) toast(errText(error, 'Save failed.'), 'err'); else { toast(`${f.name} saved.`); onSaved(); }
  };

  return (
    <Modal open onClose={onClose} title={`Edit — ${dish.name}`} wide>
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Dish name"><Input value={f.name} maxLength={120} onChange={(e) => set({ name: e.target.value })} /></Field>
          <Field label="Category"><Select value={f.category_id ?? ''} onChange={(e) => set({ category_id: e.target.value || null })}><option value="">No category</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</Select></Field>
          <Field label="Veg / non-veg"><Select value={f.diet} onChange={(e) => set({ diet: e.target.value as Dish['diet'] })}><option value="veg">Vegetarian</option><option value="non-veg">Non-vegetarian</option><option value="unconfirmed">Not confirmed</option></Select></Field>
          <Field label="Ordering"><Select value={f.status} onChange={(e) => set({ status: e.target.value as Dish['status'] })}><option value="available">Can be ordered online</option><option value="enquire">Price on enquiry</option></Select></Field>
          <Field label="Spice level" hint="Only if accurate"><Select value={f.spice_level ?? ''} onChange={(e) => set({ spice_level: (Number(e.target.value) || null) as Dish['spice_level'] })}><option value="">Not shown</option><option value="1">Mild</option><option value="2">Medium</option><option value="3">Hot</option></Select></Field>
        </div>
        <Field label="Description" hint="Only write what you are sure about."><Textarea rows={2} maxLength={600} value={f.description} onChange={(e) => set({ description: e.target.value })} /></Field>
        <Field label="Photo" hint="JPG, PNG or WebP, max 5 MB. A real photo replaces the promotional artwork.">
          <div className="flex flex-wrap items-center gap-3">
            {f.image_path && <img src={asset(f.image_path)} alt="" className="h-16 w-24 rounded-lg object-cover" />}
            <input type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading} className="text-xs" onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setUploading(true);
              const r = await uploadImage(sb, file, 'dishes');
              setUploading(false);
              if ('error' in r) toast(r.error, 'err'); else { set({ image_path: r.url, image_kind: 'photo' }); toast('Photo uploaded — press Save to use it.'); }
            }} />
            {uploading && <span className="text-xs text-ivory/60">Uploading…</span>}
          </div>
        </Field>
        <fieldset className="space-y-2">
          <legend className="mb-1 text-xs font-medium text-ivory/60">Portions & prices (₹)</legend>
          {f.variants.map((v, i) => (
            <div key={v.id ?? `n${i}`} className="flex flex-wrap items-center gap-2">
              <Input aria-label="Portion name" placeholder="Regular" value={v.label} maxLength={40} onChange={(e) => setVar(i, { label: e.target.value })} className="!w-40" />
              <Input aria-label="Price in rupees" inputMode="decimal" placeholder="150" value={v.price} onChange={(e) => setVar(i, { price: e.target.value.replace(/[^\d.]/g, '') })} className="!w-28" />
              <label className="flex items-center gap-2 text-xs"><input type="checkbox" className="h-4 w-4 accent-[#D4AF37]" checked={v.is_available} onChange={(e) => setVar(i, { is_available: e.target.checked })} /> Available</label>
              <Btn tone="danger" aria-label="Remove portion" onClick={() => set({ variants: f.variants.filter((_, n) => n !== i) })}>Remove</Btn>
            </div>
          ))}
          <Btn onClick={() => set({ variants: [...f.variants, { label: f.variants.length ? 'Large' : 'Regular', price: '', is_available: true }] })}><Plus size={14} /> Add portion</Btn>
        </fieldset>
        <div className="grid gap-1 sm:grid-cols-3">
          <Toggle label="Show on website" checked={f.is_visible} onChange={(v) => set({ is_visible: v })} />
          <Toggle label="Sold out" checked={f.is_sold_out} onChange={(v) => set({ is_sold_out: v })} />
          <Toggle label="Chef’s special" checked={f.is_chef_special} onChange={(v) => set({ is_chef_special: v })} />
        </div>
        {problems.length > 0 && <ul className="space-y-1 text-xs text-red-300">{problems.map((p) => <li key={p}>{p}</li>)}</ul>}
        <div className="flex justify-end gap-2">
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn tone="gold" busy={busy} disabled={!!problems.length || uploading} onClick={() => void save()}>Save</Btn>
        </div>
      </div>
    </Modal>
  );
}
