// Shared "select / select all / delete selected" building blocks for the admin panel.
// Deletes run in small batches with a progress bar; the admin can download a CSV first; results list what was
// deleted and what was skipped (and why). Everything is permanent — the dialog says so plainly.
import { CheckSquare, Download, Loader2, Square, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Btn, Field, Input, Modal } from './ui';

export const plural = (w: string) => (/[^aeiou]y$/.test(w) ? `${w.slice(0, -1)}ies` : `${w}s`);

export function useSelection(visibleIds: string[]) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const key = visibleIds.join(',');
  // drop selections that are no longer on screen (filter changed, item deleted)
  useEffect(() => {
    setSel((s) => {
      const vis = new Set(visibleIds);
      const next = new Set([...s].filter((id) => vis.has(id)));
      return next.size === s.size ? s : next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const toggle = useCallback((id: string, on?: boolean) => setSel((s) => {
    const n = new Set(s);
    if (on ?? !n.has(id)) n.add(id); else n.delete(id);
    return n;
  }), []);
  const setAll = useCallback((ids: string[]) => setSel(new Set(ids)), []);
  const clear = useCallback(() => setSel(new Set()), []);
  return { selected: sel, ids: [...sel], count: sel.size, has: (id: string) => sel.has(id), toggle, setAll, clear };
}
export type Selection = ReturnType<typeof useSelection>;

/** Row checkbox with a comfortable touch target. */
export function SelectBox({ checked, onChange, label, disabled, title }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean; title?: string }) {
  return (
    <label className={`grid h-11 w-11 shrink-0 place-items-center rounded-lg ${disabled ? 'cursor-not-allowed opacity-35' : 'cursor-pointer hover:bg-white/10'}`} title={title} onClick={(e) => e.stopPropagation()}>
      <input type="checkbox" className="h-5 w-5 accent-[#D4AF37]" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} aria-label={label} />
    </label>
  );
}

/** Select-all control + sticky action bar shown while something is selected. */
export function SelectionBar({ sel, selectableIds, noun, children }: { sel: Selection; selectableIds: string[]; noun: string; children?: ReactNode }) {
  const all = selectableIds.length > 0 && selectableIds.every((id) => sel.has(id));
  return (
    <div className={`mb-3 flex flex-wrap items-center gap-2 rounded-xl border px-2 py-1.5 ${sel.count ? 'sticky top-2 z-20 border-gold/50 bg-[#1a120d]/95 shadow-xl backdrop-blur' : 'border-white/10 bg-white/[0.02]'}`} data-selection-bar>
      <button type="button" className="inline-flex min-h-[44px] items-center gap-2 rounded-lg px-2 text-sm text-ivory/80 hover:bg-white/10 disabled:opacity-40"
        disabled={!selectableIds.length} onClick={() => (all ? sel.clear() : sel.setAll(selectableIds))} aria-pressed={all}>
        {all ? <CheckSquare size={18} className="text-gold" /> : <Square size={18} />} {all ? 'Unselect all' : `Select all (${selectableIds.length})`}
      </button>
      {sel.count > 0 && (
        <>
          <span className="text-sm font-semibold text-gold" aria-live="polite">{sel.count} {sel.count === 1 ? noun : plural(noun)} selected</span>
          <button type="button" className="inline-flex min-h-[44px] items-center gap-1 rounded-lg px-2 text-xs text-ivory/60 hover:bg-white/10" onClick={sel.clear}><X size={14} /> Clear</button>
          <div className="ml-auto flex flex-wrap gap-2">{children}</div>
        </>
      )}
    </div>
  );
}

export interface DeleteResult { deleted: number; skipped: { label: string; reason: string }[] }

/** Runs `fn` over ids in batches, reporting progress. Stops at the first batch that throws. */
export async function runInBatches(ids: string[], size: number, fn: (chunk: string[]) => Promise<DeleteResult>, onProgress: (done: number) => void): Promise<DeleteResult & { error?: string }> {
  const out: DeleteResult & { error?: string } = { deleted: 0, skipped: [] };
  for (let i = 0; i < ids.length; i += size) {
    const chunk = ids.slice(i, i + size);
    try {
      const r = await fn(chunk);
      out.deleted += r.deleted;
      out.skipped.push(...r.skipped);
    } catch (e) {
      out.error = e instanceof Error ? e.message : String(e);
      break;
    }
    onProgress(Math.min(ids.length, i + size));
  }
  return out;
}

/**
 * Permanent-delete dialog: what will happen, optional CSV download first, type DELETE for larger batches,
 * progress while deleting, then a result summary (deleted / skipped with reasons / error).
 */
export function BulkDeleteDialog({ open, onClose, title, ids, sample, explain, onCsv, run, batch = 50, onDone }: {
  open: boolean; onClose: () => void; title: string; ids: string[]; sample: string[]; explain: ReactNode;
  onCsv?: () => void; run: (chunk: string[]) => Promise<DeleteResult>; batch?: number; onDone: () => void;
}) {
  return open ? <DeleteBody {...{ onClose, title, sample, explain, onCsv, run, batch, onDone, ids }} count={ids.length} /> : null;
}

function DeleteBody({ onClose, title, count, sample, explain, onCsv, run, batch, onDone, ids }: {
  onClose: () => void; title: string; count: number; sample: string[]; explain: ReactNode; onCsv?: () => void;
  run: (chunk: string[]) => Promise<DeleteResult>; batch: number; onDone: () => void; ids: string[];
}) {
  const [typed, setTyped] = useState('');
  const [csvDone, setCsvDone] = useState(false);
  const [phase, setPhase] = useState<'ask' | 'running' | 'done'>('ask');
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<(DeleteResult & { error?: string }) | null>(null);
  const needType = count > 5;
  const pct = useMemo(() => (count ? Math.round((progress / count) * 100) : 0), [progress, count]);
  const go = async () => {
    setPhase('running');
    const r = await runInBatches(ids, batch, run, setProgress);
    setResult(r);
    setPhase('done');
    onDone();
  };
  return (
    <Modal open onClose={phase === 'running' ? () => {} : onClose} title={title}>
      {phase === 'ask' && (
        <div className="space-y-4 text-sm text-ivory/80" data-delete-dialog>
          <div className="rounded-xl border border-red-400/40 bg-red-500/10 p-3">
            <p className="font-semibold text-red-100">This permanently deletes {count} item{count === 1 ? '' : 's'} from the database. It cannot be undone.</p>
            <div className="mt-1 text-xs text-red-100/80">{explain}</div>
          </div>
          <ul className="max-h-32 overflow-auto text-xs text-ivory/60">
            {sample.slice(0, 6).map((s, i) => <li key={i}>• {s}</li>)}
            {count > 6 && <li>• …and {count - 6} more</li>}
          </ul>
          {onCsv && (
            <Btn onClick={() => { onCsv(); setCsvDone(true); }}><Download size={16} /> {csvDone ? 'CSV downloaded — download again' : 'Download CSV first (recommended)'}</Btn>
          )}
          {needType && <Field label="Type DELETE to confirm"><Input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" /></Field>}
          <div className="flex justify-end gap-2">
            <Btn onClick={onClose}>Cancel</Btn>
            <Btn tone="danger" disabled={needType && typed.trim() !== 'DELETE'} onClick={() => void go()}><Trash2 size={16} /> Delete {count} permanently</Btn>
          </div>
        </div>
      )}
      {phase === 'running' && (
        <div className="space-y-3 py-2" role="status" aria-live="polite">
          <p className="flex items-center gap-2 text-sm text-ivory"><Loader2 size={16} className="animate-spin" /> Deleting… {progress} of {count}</p>
          <div className="h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gold transition-[width] duration-300" style={{ width: `${pct}%` }} /></div>
          <p className="text-xs text-ivory/50">Please keep this page open until it finishes.</p>
        </div>
      )}
      {phase === 'done' && result && (
        <div className="space-y-3 text-sm" role="status" data-delete-result>
          <p className={result.error ? 'text-amber-200' : 'text-emerald-200'}>
            {result.deleted} deleted permanently.{result.skipped.length ? ` ${result.skipped.length} kept (see why below).` : ''}
          </p>
          {result.error && <p className="rounded-lg bg-red-500/10 p-2 text-xs text-red-100">Stopped with an error: {result.error}. Nothing after that point was deleted — you can try again.</p>}
          {result.skipped.length > 0 && (
            <ul className="max-h-40 overflow-auto rounded-lg bg-black/30 p-2 text-xs text-ivory/70">
              {result.skipped.map((s, i) => <li key={i}>• <b>{s.label}</b> — {s.reason}</li>)}
            </ul>
          )}
          <div className="flex justify-end"><Btn tone="gold" onClick={onClose}>Done</Btn></div>
        </div>
      )}
    </Modal>
  );
}

/* ───────────────────────── storage helpers ───────────────────────── */
const PUBLIC_RE = /\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/;
export const storageRef = (url: string | null | undefined) => {
  const m = url ? PUBLIC_RE.exec(url.split('?')[0]) : null;
  return m ? { bucket: m[1], name: decodeURIComponent(m[2]) } : null;
};

/**
 * After records are deleted: remove their uploaded files from storage, but only files no longer used anywhere
 * (checked against the database). Built-in website artwork (assets/…) is never touched.
 */
export async function removeUnusedUploads(sb: SupabaseClient, urls: (string | null | undefined)[]): Promise<number> {
  const refs = urls.map(storageRef).filter((r): r is { bucket: string; name: string } => !!r);
  if (!refs.length) return 0;
  const { data, error } = await sb.rpc('admin_media_list');
  if (error || !Array.isArray(data)) return 0;
  const unused = new Set((data as { bucket: string; name: string; used_by: string[] }[]).filter((m) => !m.used_by.length).map((m) => `${m.bucket}/${m.name}`));
  let removed = 0;
  for (const bucket of new Set(refs.map((r) => r.bucket))) {
    const names = refs.filter((r) => r.bucket === bucket && unused.has(`${bucket}/${r.name}`)).map((r) => r.name);
    if (!names.length) continue;
    const { error: e } = await sb.storage.from(bucket).remove([...new Set(names)]);
    if (!e) removed += new Set(names).size;
  }
  return removed;
}
