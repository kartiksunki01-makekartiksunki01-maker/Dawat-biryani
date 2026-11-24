import { useCallback, useEffect, useState } from 'react';
import { errText, useAdmin } from '../ui';

/** Load + save one of the single-row settings tables. */
export function useSingleton<T extends Record<string, unknown>>(table: 'restaurant_settings' | 'website_settings') {
  const { sb, toast } = useAdmin();
  const [saved, setSaved] = useState<T | null>(null);
  const [draft, setDraft] = useState<T | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const { data, error } = await sb.from(table).select('*').eq('id', 1).single();
    if (error) { setErr(errText(error, 'Could not load settings.')); return; }
    setErr('');
    setSaved(data as T);
    setDraft(data as T);
  }, [sb, table]);
  useEffect(() => { void load(); }, [load]);
  const set = (p: Partial<T>) => setDraft((d) => (d ? { ...d, ...p } : d));
  const dirty = !!saved && !!draft && JSON.stringify(saved) !== JSON.stringify(draft);
  const save = async (patch?: Partial<T>) => {
    if (!draft) return false;
    setBusy(true);
    const body = { ...(patch ?? draft) } as Record<string, unknown>;
    delete body.id;
    delete body.updated_at;
    const { data, error } = await sb.from(table).update(body).eq('id', 1).select('*').single();
    setBusy(false);
    if (error) { toast(errText(error, 'Could not save.'), 'err'); return false; }
    setSaved(data as T);
    setDraft(data as T);
    toast('Saved — the website uses it on the next page load.');
    return true;
  };
  return { saved, draft, set, save, dirty, busy, err, reset: () => setDraft(saved) };
}
