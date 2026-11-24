import { useState } from 'react';
import { Btn, Card, Field, Input, Notice, PageHeader, Skeleton, Textarea, Toggle } from '../ui';
import { useSingleton } from './settingsHook';

interface RS extends Record<string, unknown> {
  name: string; address: string; phone_e164: string; phone_display: string; whatsapp_number: string | null; whatsapp_confirmed: boolean;
  opens_at: string; closes_at: string; open_days: number[]; closed_dates: string[]; online_ordering_enabled: boolean; pickup_enabled: boolean;
  delivery_enabled: boolean; delivery_charge: number; free_delivery_above: number | null; delivery_area_note: string; min_order_value: number;
  default_prep_minutes: number; min_lead_minutes: number; max_days_ahead: number; tax_enabled: boolean; tax_label: string; tax_rate: number;
  gstin: string | null; receipt_footer: string; order_notice: string;
}
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const n = (v: string) => (v === '' ? 0 : Number(v.replace(/[^\d.]/g, '')));

export function RestaurantSettingsPage() {
  const s = useSingleton<RS>('restaurant_settings');
  const [newClosed, setNewClosed] = useState('');
  const d = s.draft;
  const problems = d ? [
    d.name.trim().length < 2 && 'Restaurant name is required.',
    !/^\+[0-9]{10,15}$/.test(d.phone_e164) && 'Phone (international) must look like +919823324553.',
    d.whatsapp_number && !/^[0-9]{10,15}$/.test(d.whatsapp_number) && 'WhatsApp number: digits only with country code, e.g. 919823324553.',
    d.closes_at.slice(0, 5) <= d.opens_at.slice(0, 5) && 'Closing time must be after opening time.',
    !d.open_days.length && 'Choose at least one open day.',
    d.gstin && !/^[0-9A-Z]{15}$/.test(d.gstin) && 'GSTIN must be 15 letters/numbers — enter only your real registered GSTIN.',
    d.tax_enabled && !(d.tax_rate > 0) && 'Set a tax rate or switch tax off.',
  ].filter(Boolean) as string[] : [];
  return (
    <section aria-label="Restaurant settings">
      <PageHeader title="Restaurant Settings" intro="Used by checkout, receipts and the website. The database re-checks hours, delivery and minimum order on every order."
        actions={<Btn tone="gold" disabled={!s.dirty || !!problems.length} busy={s.busy} onClick={() => void s.save()}>Save changes</Btn>} />
      {s.err && <Notice kind="err">{s.err}</Notice>}
      {!d ? <Skeleton rows={4} /> : (
        <div className="space-y-4">
          <Card>
            <h2 className="mb-3 text-sm font-semibold text-gold">Online ordering</h2>
            <Toggle label="Accept online orders" hint="Switch off to pause ordering (customers see a call option)" checked={d.online_ordering_enabled} onChange={(v) => s.set({ online_ordering_enabled: v })} />
            <Toggle label="Pickup available" checked={d.pickup_enabled} onChange={(v) => s.set({ pickup_enabled: v })} />
            <Toggle label="Delivery available" checked={d.delivery_enabled} onChange={(v) => s.set({ delivery_enabled: v })} />
            <div className="mt-2 grid gap-3 sm:grid-cols-3">
              <Field label="Delivery charge (₹)"><Input inputMode="decimal" value={String(d.delivery_charge)} onChange={(e) => s.set({ delivery_charge: n(e.target.value) })} /></Field>
              <Field label="Free delivery above (₹)" hint="Empty = never free"><Input inputMode="decimal" value={d.free_delivery_above == null ? '' : String(d.free_delivery_above)} onChange={(e) => s.set({ free_delivery_above: e.target.value === '' ? null : n(e.target.value) })} /></Field>
              <Field label="Minimum order (₹)"><Input inputMode="decimal" value={String(d.min_order_value)} onChange={(e) => s.set({ min_order_value: n(e.target.value) })} /></Field>
              <Field label="Default preparation time (min)"><Input inputMode="numeric" value={String(d.default_prep_minutes)} onChange={(e) => s.set({ default_prep_minutes: n(e.target.value) })} /></Field>
              <Field label="Earliest order, minutes from now"><Input inputMode="numeric" value={String(d.min_lead_minutes)} onChange={(e) => s.set({ min_lead_minutes: n(e.target.value) })} /></Field>
              <Field label="Orders up to … days ahead"><Input inputMode="numeric" value={String(d.max_days_ahead)} onChange={(e) => s.set({ max_days_ahead: n(e.target.value) })} /></Field>
            </div>
            <Field label="Delivery area note (shown at checkout)"><Input maxLength={300} value={d.delivery_area_note} onChange={(e) => s.set({ delivery_area_note: e.target.value })} placeholder="e.g. Delivery within 3 km of Dhamankar Naka" /></Field>
            <Field label="Checkout notice (optional)"><Input maxLength={300} value={d.order_notice} onChange={(e) => s.set({ order_notice: e.target.value })} /></Field>
          </Card>
          <Card>
            <h2 className="mb-3 text-sm font-semibold text-gold">Opening hours (India time)</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Opens"><Input type="time" value={d.opens_at.slice(0, 5)} onChange={(e) => s.set({ opens_at: e.target.value })} /></Field>
              <Field label="Closes"><Input type="time" value={d.closes_at.slice(0, 5)} onChange={(e) => s.set({ closes_at: e.target.value })} /></Field>
            </div>
            <fieldset className="mt-3"><legend className="mb-1 text-xs text-ivory/60">Open days</legend>
              <div className="flex flex-wrap gap-2">
                {DAYS.map((day, i) => (
                  <label key={day} className="flex min-h-[40px] items-center gap-1.5 rounded-lg border border-white/15 px-3 text-sm">
                    <input type="checkbox" className="h-4 w-4 accent-[#D4AF37]" checked={d.open_days.includes(i)} onChange={() => s.set({ open_days: d.open_days.includes(i) ? d.open_days.filter((x) => x !== i) : [...d.open_days, i].sort() })} />{day}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="mt-3">
              <p className="mb-1 text-xs text-ivory/60">Special closing dates</p>
              <div className="flex flex-wrap items-center gap-2">
                {d.closed_dates.map((c) => <Btn key={c} tone="quiet" onClick={() => s.set({ closed_dates: d.closed_dates.filter((x) => x !== c) })} aria-label={`Remove ${c}`}>{c} ✕</Btn>)}
                <Input type="date" value={newClosed} onChange={(e) => setNewClosed(e.target.value)} className="!w-44" aria-label="Add a closing date" />
                <Btn disabled={!newClosed || d.closed_dates.includes(newClosed)} onClick={() => { s.set({ closed_dates: [...d.closed_dates, newClosed].sort() }); setNewClosed(''); }}>Add date</Btn>
              </div>
            </div>
          </Card>
          <Card>
            <h2 className="mb-3 text-sm font-semibold text-gold">Business details (printed on receipts)</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Restaurant name"><Input maxLength={80} value={d.name} onChange={(e) => s.set({ name: e.target.value })} /></Field>
              <Field label="Phone shown to customers"><Input maxLength={30} value={d.phone_display} onChange={(e) => s.set({ phone_display: e.target.value })} /></Field>
              <Field label="Phone (international, for call links)"><Input value={d.phone_e164} onChange={(e) => s.set({ phone_e164: e.target.value.replace(/[^\d+]/g, '') })} /></Field>
              <Field label="WhatsApp number (digits with country code)"><Input value={d.whatsapp_number ?? ''} onChange={(e) => s.set({ whatsapp_number: e.target.value.replace(/\D/g, '') || null })} /></Field>
            </div>
            <Toggle label="This WhatsApp number is confirmed by the owner" hint="When on, it is also printed on receipts" checked={d.whatsapp_confirmed} onChange={(v) => s.set({ whatsapp_confirmed: v })} />
            <Field label="Address"><Textarea rows={2} maxLength={300} value={d.address} onChange={(e) => s.set({ address: e.target.value })} /></Field>
            <Field label="Receipt thank-you line"><Input maxLength={200} value={d.receipt_footer} onChange={(e) => s.set({ receipt_footer: e.target.value })} /></Field>
          </Card>
          <Card>
            <h2 className="mb-3 text-sm font-semibold text-gold">Tax (only if legally required)</h2>
            <p className="mb-2 text-xs text-ivory/55">Leave off unless your accountant confirms. Receipts are order receipts, not tax invoices. Never enter a GSTIN you don’t have.</p>
            <Toggle label="Add tax to orders" checked={d.tax_enabled} onChange={(v) => s.set({ tax_enabled: v })} />
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Tax label"><Input maxLength={30} value={d.tax_label} onChange={(e) => s.set({ tax_label: e.target.value })} /></Field>
              <Field label="Rate %"><Input inputMode="decimal" value={String(d.tax_rate)} onChange={(e) => s.set({ tax_rate: n(e.target.value) })} /></Field>
              <Field label="GSTIN (optional)"><Input maxLength={15} value={d.gstin ?? ''} onChange={(e) => s.set({ gstin: e.target.value.toUpperCase().replace(/[^0-9A-Z]/g, '') || null })} /></Field>
            </div>
          </Card>
          {problems.length > 0 && <ul className="space-y-1 text-sm text-red-300">{problems.map((p) => <li key={p}>{p}</li>)}</ul>}
          {s.dirty && <div className="flex justify-end gap-2"><Btn onClick={s.reset}>Discard</Btn><Btn tone="gold" disabled={!!problems.length} busy={s.busy} onClick={() => void s.save()}>Save changes</Btn></div>}
        </div>
      )}
    </section>
  );
}
