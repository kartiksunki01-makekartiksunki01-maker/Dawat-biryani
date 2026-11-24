import { useEffect, useState } from 'react';
import { hostLines, type HostEvent } from '../../stores/hostStore';
import { Btn, Card, Field, Input, Notice, PageHeader, Skeleton, Textarea, Toggle, useAdmin } from '../ui';
import { useSingleton } from './settingsHook';

export interface WebsiteRow extends Record<string, unknown> {
  announcement_enabled: boolean; announcement_text: string; intro_enabled: boolean; intro_duration_ms: number; intro_for_returning: boolean;
  music_enabled: boolean; music_url: string | null; music_title: string; music_volume: number; sfx_enabled: boolean;
  character_enabled: boolean; character_messages: Record<string, string>; featured_dish_ids: string[];
}

const EDITABLE: { id: HostEvent; label: string }[] = [
  { id: 'welcome', label: 'First-visit welcome' },
  { id: 'menu', label: 'When the menu comes into view' },
  { id: 'bulk', label: 'When bulk orders come into view' },
  { id: 'added', label: 'After adding an item (once per visit)' },
  { id: 'placed', label: 'After an order is saved' },
  { id: 'enquiry_sent', label: 'After a bulk enquiry is saved' },
];

export function Appearance() {
  const { sb } = useAdmin();
  const s = useSingleton<WebsiteRow>('website_settings');
  const [dishes, setDishes] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => { void sb.from('dishes').select('id,name').eq('is_visible', true).order('sort_order').then(({ data }) => setDishes((data as never) ?? [])); }, [sb]);
  const d = s.draft;
  return (
    <section aria-label="Website appearance">
      <PageHeader title="Website Appearance" intro="Announcement banner, Dawat Anna’s messages and featured dishes. Changes show to visitors on their next page load."
        actions={<>
          <a className="inline-flex min-h-[40px] items-center rounded-lg border border-white/20 px-4 text-sm font-semibold hover:bg-white/10" href="./" target="_blank" rel="noopener noreferrer">Open website</a>
          <Btn tone="gold" disabled={!s.dirty} busy={s.busy} onClick={() => void s.save()}>Save changes</Btn>
        </>} />
      {s.err && <Notice kind="err">{s.err}</Notice>}
      {!d ? <Skeleton rows={3} /> : (
        <div className="space-y-4">
          <Card>
            <h2 className="mb-2 text-sm font-semibold text-gold">Announcement banner</h2>
            <Toggle label="Show announcement" checked={d.announcement_enabled} onChange={(v) => s.set({ announcement_enabled: v })} />
            <Field label="Text (max 160 characters)" hint="Only real, current information — e.g. “Closed on 25 Dec”."><Input maxLength={160} value={d.announcement_text} onChange={(e) => s.set({ announcement_text: e.target.value })} /></Field>
          </Card>
          <Card>
            <h2 className="mb-2 text-sm font-semibold text-gold">Dawat Anna (3D host)</h2>
            <Toggle label="Show Dawat Anna on the website" checked={d.character_enabled} onChange={(v) => s.set({ character_enabled: v })} />
            <p className="mb-3 text-xs text-ivory/50">Each message shows at most once per visitor (or once per visit). Leave a box empty to use the default.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {EDITABLE.map((e) => (
                <Field key={e.id} label={e.label} hint={`Default: “${hostLines[e.id][0].text}”`}>
                  <Textarea rows={2} maxLength={160} value={d.character_messages[e.id] ?? ''} onChange={(ev) => s.set({ character_messages: { ...d.character_messages, [e.id]: ev.target.value } })} />
                </Field>
              ))}
            </div>
          </Card>
          <Card>
            <h2 className="mb-2 text-sm font-semibold text-gold">Featured dishes</h2>
            <p className="mb-2 text-xs text-ivory/50">Saved for highlighting on the homepage.</p>
            <div className="grid gap-1 sm:grid-cols-2">
              {dishes.map((x) => (
                <label key={x.id} className="flex min-h-[36px] items-center gap-2 text-sm">
                  <input type="checkbox" className="h-4 w-4 accent-[#D4AF37]" checked={d.featured_dish_ids.includes(x.id)}
                    onChange={() => s.set({ featured_dish_ids: d.featured_dish_ids.includes(x.id) ? d.featured_dish_ids.filter((i) => i !== x.id) : [...d.featured_dish_ids, x.id] })} />
                  {x.name}
                </label>
              ))}
            </div>
          </Card>
          {s.dirty && <div className="flex justify-end gap-2"><Btn onClick={s.reset}>Discard</Btn><Btn tone="gold" busy={s.busy} onClick={() => void s.save()}>Save changes</Btn></div>}
        </div>
      )}
    </section>
  );
}
