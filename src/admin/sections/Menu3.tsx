import { EllipsisVertical } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';

/** Clearly visible three-dot action menu (keyboard accessible). */
export function ActionMenu({ label, items }: { label: string; items: { label: string; onClick: () => void; danger?: boolean; disabled?: boolean }[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', key);
    ref.current?.querySelector<HTMLElement>('[role=menuitem]')?.focus();
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', key); };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button type="button" aria-haspopup="menu" aria-expanded={open} aria-controls={id} aria-label={label} onClick={() => setOpen(!open)}
        className="grid h-10 w-10 place-items-center rounded-lg border border-white/15 text-ivory/80 hover:bg-white/10">
        <EllipsisVertical size={18} />
      </button>
      {open && (
        <ul id={id} role="menu" className="absolute right-0 z-20 mt-1 min-w-[200px] overflow-hidden rounded-xl border border-white/15 bg-[#1a120d] py-1 shadow-2xl">
          {items.map((it) => (
            <li key={it.label} role="none">
              <button type="button" role="menuitem" disabled={it.disabled} onClick={() => { setOpen(false); it.onClick(); }}
                className={`block min-h-[40px] w-full px-4 text-left text-sm disabled:opacity-40 ${it.danger ? 'text-red-300 hover:bg-red-500/10' : 'text-ivory hover:bg-white/10'}`}>
                {it.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
