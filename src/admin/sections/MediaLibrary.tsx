import { Download, FileAudio, Image as ImageIcon, Minimize2, RefreshCw, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { BulkDeleteDialog, SelectBox, SelectionBar, useSelection } from '../selection';
import { Badge, Btn, downloadCsv, Empty, errText, fmtDT, istToday, Notice, PageHeader, Select, Skeleton, Stat, useAdmin } from '../ui';
import { put, shrinkImage } from './upload';

interface Media { bucket: 'images' | 'audio'; name: string; size: number; mimetype: string | null; created_at: string; used_by: string[] }
const kb = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const LARGE = 400 * 1024;
const key = (m: Media) => `${m.bucket}/${m.name}`;

/** Every uploaded file, where it is used, and safe cleanup of unused ones. Files in use cannot be deleted here. */
export function MediaLibrary() {
  const { sb, toast } = useAdmin();
  const [rows, setRows] = useState<Media[] | null>(null);
  const [err, setErr] = useState('');
  const [filter, setFilter] = useState('all');
  const [delOpen, setDelOpen] = useState(false);
  const [shrinking, setShrinking] = useState('');

  const load = useCallback(async () => {
    const { data, error } = await sb.rpc('admin_media_list');
    if (error) { setErr(errText(error, 'Could not load uploaded files.')); return; }
    setErr('');
    setRows((data as Media[]).map((m) => ({ ...m, size: Number(m.size) })));
  }, [sb]);
  useEffect(() => { void load(); }, [load]);

  const shown = useMemo(() => (rows ?? []).filter((m) =>
    filter === 'unused' ? !m.used_by.length : filter === 'used' ? m.used_by.length > 0 : filter === 'large' ? m.size > LARGE && m.bucket === 'images' : filter === 'audio' ? m.bucket === 'audio' : true), [rows, filter]);
  const sel = useSelection(shown.map(key));
  const deletable = shown.filter((m) => !m.used_by.length).map(key);
  const picked = shown.filter((m) => sel.has(key(m)));
  const url = (m: Media) => sb.storage.from(m.bucket).getPublicUrl(m.name).data.publicUrl;
  const total = (rows ?? []).reduce((a, m) => a + m.size, 0);
  const unused = (rows ?? []).filter((m) => !m.used_by.length);
  const csv = (list: Media[], name: string) => downloadCsv(name, ['Bucket', 'File', 'Size (bytes)', 'Type', 'Uploaded', 'Used by', 'Link'], list.map((m) => [m.bucket, m.name, m.size, m.mimetype, m.created_at, m.used_by.join('; '), url(m)]));

  /** Upload a smaller copy, point every dish / bulk dish / coupon at it, then remove the original. */
  const makeSmaller = async (m: Media) => {
    const oldUrl = url(m);
    if (m.used_by.some((u) => !/^(Menu|Bulk menu|Coupon):/.test(u))) { toast('This file is used in website settings — replace it there.', 'err'); return; }
    setShrinking(key(m));
    try {
      const blob = await (await fetch(oldUrl)).blob();
      const r = await shrinkImage(new File([blob], m.name.split('/').pop() ?? 'photo', { type: blob.type || m.mimetype || 'image/jpeg' }), { maxEdge: 1400, quality: 0.8, force: true });
      if ('error' in r) { toast(r.error, 'err'); return; }
      if (r.file.size >= m.size * 0.9) { toast('Already well compressed — nothing to gain.'); return; }
      const up = await put(sb, 'images', r.file, m.name.includes('/') ? m.name.split('/')[0] : 'media');
      if ('error' in up) { toast(up.error, 'err'); return; }
      const results = await Promise.all([
        sb.from('dishes').update({ image_path: up.url }).eq('image_path', oldUrl),
        sb.from('bulk_menu_items').update({ image_path: up.url }).eq('image_path', oldUrl),
        sb.from('offers').update({ banner_url: up.url }).eq('banner_url', oldUrl),
      ]);
      const e = results.find((x) => x.error)?.error;
      if (e) { toast(errText(e, 'Saved a smaller copy but could not switch to it.'), 'err'); return; }
      await sb.storage.from(m.bucket).remove([m.name]);
      toast(`Made smaller: ${kb(m.size)} → ${kb(r.file.size)}.`);
      void load();
    } catch {
      toast('Could not read this file.', 'err');
    } finally { setShrinking(''); }
  };

  return (
    <section aria-label="Media and storage">
      <PageHeader title="Media & Storage" intro="Every photo and audio file you uploaded, where it is used, and how much space it takes. Files that are still used on the website cannot be deleted here."
        actions={<>
          <Btn onClick={() => void load()}><RefreshCw size={16} /> Refresh</Btn>
          <Btn tone="gold" disabled={!shown.length} onClick={() => csv(shown, `dawat-media-${istToday()}.csv`)}><Download size={16} /> Export CSV</Btn>
        </>} />
      {rows && (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Files" value={rows.length} />
          <Stat label="Space used" value={kb(total)} />
          <Stat label="Unused files" value={unused.length} tone={unused.length ? 'warn' : undefined} hint={unused.length ? `${kb(unused.reduce((a, m) => a + m.size, 0))} can be freed` : undefined} />
          <Stat label="Large photos" value={rows.filter((m) => m.bucket === 'images' && m.size > LARGE).length} hint="over 400 KB" />
        </div>
      )}
      <div className="mb-3 flex flex-wrap gap-3">
        <Select aria-label="Show files" value={filter} onChange={(e) => setFilter(e.target.value)} className="!w-48">
          <option value="all">All files</option>
          <option value="unused">Unused only</option>
          <option value="used">In use</option>
          <option value="large">Large photos (400 KB+)</option>
          <option value="audio">Audio</option>
        </Select>
      </div>
      {err && <Notice kind="err">{err}</Notice>}
      {!rows ? <Skeleton rows={3} /> : !shown.length ? <Empty title="No files here">Photos and music you upload in the admin panel appear here.</Empty> : (
        <>
          <SelectionBar sel={sel} selectableIds={deletable} noun="file">
            <Btn onClick={() => csv(picked, `dawat-selected-media-${istToday()}.csv`)}><Download size={16} /> CSV of selected</Btn>
            <Btn tone="danger" onClick={() => setDelOpen(true)}><Trash2 size={16} /> Delete…</Btn>
          </SelectionBar>
          <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3" aria-label="Uploaded files">
            {shown.map((m) => {
              const used = m.used_by.length > 0;
              return (
                <li key={key(m)} className="flex gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-2" data-media={m.name}>
                  <SelectBox checked={sel.has(key(m))} onChange={(v) => sel.toggle(key(m), v)} label={`Select ${m.name}`} disabled={used} title={used ? `In use: ${m.used_by.join(', ')}` : undefined} />
                  <a href={url(m)} target="_blank" rel="noopener noreferrer" className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-lg bg-black/30">
                    {m.bucket === 'images' ? <img src={url(m)} alt="" loading="lazy" className="h-full w-full object-cover" /> : <FileAudio size={22} className="text-gold" />}
                  </a>
                  <div className="min-w-0 flex-1 text-xs">
                    <p className="truncate font-medium text-ivory" title={m.name}>{m.name.split('/').pop()}</p>
                    <p className="text-ivory/55">{kb(m.size)} · {fmtDT(m.created_at)}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {used ? m.used_by.slice(0, 2).map((u) => <Badge key={u} tone="good">{u}</Badge>) : <Badge tone="warn">Unused</Badge>}
                      {m.used_by.length > 2 && <Badge>+{m.used_by.length - 2}</Badge>}
                    </div>
                    {m.bucket === 'images' && m.size > LARGE && (
                      <button type="button" className="mt-1 inline-flex min-h-[36px] items-center gap-1 rounded-lg px-2 text-gold hover:bg-white/10 disabled:opacity-50" disabled={!!shrinking} onClick={() => void makeSmaller(m)}>
                        {shrinking === key(m) ? 'Making smaller…' : <><Minimize2 size={13} /> Make smaller</>}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 flex items-center gap-1 text-[11px] text-ivory/45"><ImageIcon size={12} /> Built-in website pictures (menu artwork, logo, intro video) are part of the website itself and are not listed here.</p>
        </>
      )}
      <BulkDeleteDialog open={delOpen} onClose={() => setDelOpen(false)} title="Delete unused files?" ids={sel.ids}
        sample={picked.map((m) => `${m.name} · ${kb(m.size)}`)}
        explain={<>These files are not used anywhere on the website or in the admin panel. They are removed from storage for good.</>}
        onCsv={() => csv(picked, `dawat-media-before-delete-${istToday()}.csv`)}
        run={async (chunk) => {
          let deleted = 0; const skipped: { label: string; reason: string }[] = [];
          // re-check usage right before deleting (something may have started using a file)
          const { data } = await sb.rpc('admin_media_list');
          const now = new Map(((data as Media[]) ?? []).map((m) => [key(m), m]));
          for (const bucket of ['images', 'audio'] as const) {
            const names = chunk.filter((k) => k.startsWith(`${bucket}/`)).map((k) => k.slice(bucket.length + 1));
            const free = names.filter((n) => { const m = now.get(`${bucket}/${n}`); if (m?.used_by.length) skipped.push({ label: n, reason: `now used by ${m.used_by.join(', ')}` }); return m && !m.used_by.length; });
            if (!free.length) continue;
            const { error } = await sb.storage.from(bucket).remove(free);
            if (error) throw new Error(error.message);
            deleted += free.length;
          }
          return { deleted, skipped };
        }}
        onDone={() => { sel.clear(); void load(); }} />
    </section>
  );
}
