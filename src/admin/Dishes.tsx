import type { SupabaseClient } from '@supabase/supabase-js';
import { useCallback, useEffect, useState } from 'react';
import { Btn, Field, Input, Notice, Select, Textarea } from './ui';

interface Variant { id?: string; label: string; price: string }
interface Dish {
  id: string;
  name: string;
  category_id: string | null;
  diet: 'veg' | 'non-veg' | 'unconfirmed';
  status: 'available' | 'enquire';
  image_path: string | null;
  description: string;
  is_visible: boolean;
  sort_order: number;
  variants: Variant[];
}
interface Cat { id: string; label: string }

const slug = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

export function Dishes({ sb }: { sb: SupabaseClient }) {
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [cats, setCats] = useState<Cat[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [d, c] = await Promise.all([
      sb.from('dishes').select('*, dish_variants(id,label,price,sort_order)').order('sort_order'),
      sb.from('categories').select('id,label').order('sort_order'),
    ]);
    setLoading(false);
    if (d.error || c.error) {
      setMsg({ kind: 'err', text: 'Could not load dishes. Try again.' });
      return;
    }
    setCats(c.data as Cat[]);
    setDishes(
      (d.data as (Omit<Dish, 'variants'> & { dish_variants: { id: string; label: string; price: number; sort_order: number }[] })[]).map(
        ({ dish_variants, ...rest }) => ({
          ...rest,
          variants: [...dish_variants].sort((a, b) => a.sort_order - b.sort_order).map((v) => ({ id: v.id, label: v.label, price: String(Number(v.price)) })),
        }),
      ),
    );
  }, [sb]);

  useEffect(() => {
    void load();
  }, [load]);

  const addDish = async () => {
    const name = window.prompt('Name of the new dish?');
    if (!name?.trim()) return;
    const id = slug(name);
    if (!id) return setMsg({ kind: 'err', text: 'Please use letters or numbers in the name.' });
    const { error } = await sb.from('dishes').insert({ id, name: name.trim(), status: 'enquire', is_visible: false, sort_order: dishes.length + 1 });
    if (error) return setMsg({ kind: 'err', text: error.code === '23505' ? 'A dish with this name already exists.' : 'Could not add the dish.' });
    setMsg({ kind: 'ok', text: 'Dish added (hidden). Fill in the details, then switch "Show on website" on.' });
    await load();
    setOpenId(id);
  };

  return (
    <section aria-label="Dishes" className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-sm text-ivory/60">
          Edit names, prices and availability here. Changes show on the website right after you press Save (visitors may need to refresh once).
        </p>
        <Btn tone="gold" onClick={() => void addDish()}>+ Add dish</Btn>
      </div>
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      {loading && <Notice kind="info">Loading…</Notice>}
      <ul className="space-y-3">
        {dishes.map((d) => (
          <DishRow
            key={d.id}
            sb={sb}
            dish={d}
            cats={cats}
            open={openId === d.id}
            onToggle={() => setOpenId(openId === d.id ? null : d.id)}
            onDone={async (m) => {
              setMsg(m);
              await load();
            }}
          />
        ))}
      </ul>
    </section>
  );
}

function DishRow({
  sb, dish, cats, open, onToggle, onDone,
}: {
  sb: SupabaseClient; dish: Dish; cats: Cat[]; open: boolean; onToggle: () => void;
  onDone: (m: { kind: 'ok' | 'err'; text: string }) => Promise<void>;
}) {
  const [f, setF] = useState<Dish>(dish);
  const [busy, setBusy] = useState(false);
  useEffect(() => setF(dish), [dish]);

  const setVar = (i: number, patch: Partial<Variant>) => setF((s) => ({ ...s, variants: s.variants.map((v, n) => (n === i ? { ...v, ...patch } : v)) }));

  const save = async () => {
    const bad = f.variants.find((v) => !v.label.trim() || !(Number(v.price) >= 0) || v.price.trim() === '');
    if (!f.name.trim()) return void onDone({ kind: 'err', text: 'Dish name cannot be empty.' });
    if (bad) return void onDone({ kind: 'err', text: 'Every portion needs a name and a valid price.' });
    if (f.status === 'available' && f.variants.length === 0) return void onDone({ kind: 'err', text: 'An available dish needs at least one price. Or set it to "Price on enquiry".' });
    setBusy(true);
    const up = await sb.from('dishes').update({
      name: f.name.trim(), category_id: f.category_id || null, diet: f.diet, status: f.status,
      description: f.description.trim(), is_visible: f.is_visible, sort_order: f.sort_order,
    }).eq('id', f.id);
    let failed = !!up.error;
    if (!failed) {
      const keepIds = f.variants.filter((v) => v.id).map((v) => v.id!);
      const removed = dish.variants.filter((v) => v.id && !keepIds.includes(v.id));
      for (const v of removed) failed ||= !!(await sb.from('dish_variants').delete().eq('id', v.id!)).error;
      for (const [i, v] of f.variants.entries()) {
        const row = { label: v.label.trim(), price: Number(v.price), sort_order: i + 1 };
        const r = v.id ? await sb.from('dish_variants').update(row).eq('id', v.id) : await sb.from('dish_variants').insert({ ...row, dish_id: f.id });
        failed ||= !!r.error;
      }
    }
    setBusy(false);
    await onDone(failed ? { kind: 'err', text: 'Save failed. Please try again.' } : { kind: 'ok', text: `${f.name} saved.` });
  };

  const del = async () => {
    if (!window.confirm(`Delete "${dish.name}" permanently? (To just hide it, switch off "Show on website" instead.)`)) return;
    const { error } = await sb.from('dishes').delete().eq('id', dish.id);
    await onDone(error ? { kind: 'err', text: 'Delete failed.' } : { kind: 'ok', text: `${dish.name} deleted.` });
  };

  const priceText = dish.variants.length ? dish.variants.map((v) => `${v.label} ₹${v.price}`).join(' · ') : 'Price on enquiry';

  return (
    <li className="rounded-xl border border-white/10 bg-white/[0.03]">
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full flex-wrap items-center justify-between gap-2 p-4 text-left">
        <span>
          <span className="font-semibold">{dish.name}</span>
          {!dish.is_visible && <span className="ml-2 rounded-full border border-white/20 px-2 py-0.5 text-[11px] text-ivory/60">Hidden</span>}
          <span className="block text-xs text-ivory/50">{priceText}</span>
        </span>
        <span className="text-xs text-gold">{open ? 'Close' : 'Edit'}</span>
      </button>
      {open && (
        <div className="space-y-4 border-t border-white/10 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Dish name"><Input value={f.name} maxLength={120} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
            <Field label="Category">
              <Select value={f.category_id ?? ''} onChange={(e) => setF({ ...f, category_id: e.target.value || null })}>
                <option value="">No category</option>
                {cats.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </Select>
            </Field>
            <Field label="Veg / Non-veg">
              <Select value={f.diet} onChange={(e) => setF({ ...f, diet: e.target.value as Dish['diet'] })}>
                <option value="veg">Vegetarian</option>
                <option value="non-veg">Non-vegetarian</option>
                <option value="unconfirmed">Not confirmed</option>
              </Select>
            </Field>
            <Field label="Availability">
              <Select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as Dish['status'] })}>
                <option value="available">Available (shows price, can be ordered)</option>
                <option value="enquire">Price on enquiry</option>
              </Select>
            </Field>
          </div>
          <Field label="Description" hint="Only write things you are sure about (ingredients, spice level, etc.).">
            <Textarea rows={2} maxLength={600} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
          </Field>

          <fieldset className="space-y-2">
            <legend className="mb-1 text-xs font-medium text-ivory/60">Portions & prices (₹)</legend>
            {f.variants.map((v, i) => (
              <div key={v.id ?? `new-${i}`} className="flex items-center gap-2">
                <Input aria-label="Portion name" placeholder="Regular" value={v.label} maxLength={40} onChange={(e) => setVar(i, { label: e.target.value })} />
                <Input aria-label="Price in rupees" inputMode="decimal" placeholder="150" value={v.price} className="!w-28" onChange={(e) => setVar(i, { price: e.target.value.replace(/[^\d.]/g, '') })} />
                <Btn tone="danger" aria-label="Remove portion" onClick={() => setF((s) => ({ ...s, variants: s.variants.filter((_, n) => n !== i) }))}>✕</Btn>
              </div>
            ))}
            <Btn onClick={() => setF((s) => ({ ...s, variants: [...s.variants, { label: s.variants.length ? 'Large' : 'Regular', price: '' }] }))}>+ Add portion</Btn>
          </fieldset>

          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={f.is_visible} onChange={(e) => setF({ ...f, is_visible: e.target.checked })} className="h-4 w-4 accent-[#D4AF37]" />
              Show on website
            </label>
            <label className="flex items-center gap-2 text-sm">
              Order on menu
              <Input type="number" min={0} value={f.sort_order} className="!w-20" onChange={(e) => setF({ ...f, sort_order: Number(e.target.value) || 0 })} />
            </label>
          </div>
          <div className="flex gap-2">
            <Btn tone="gold" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save'}</Btn>
            <Btn tone="danger" onClick={() => void del()}>Delete dish</Btn>
          </div>
        </div>
      )}
    </li>
  );
}
