import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { lockScroll } from '../../utils/scroll';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Accessible modal behaviour: focus trap, Escape to close, restores focus, locks page scroll. */
export function useDialog(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useLayoutEffect(() => {
    closeRef.current = onClose;
  });
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    lockScroll(true);
    const t = window.setTimeout(() => {
      const el = ref.current;
      const first = el?.querySelector<HTMLElement>('[data-autofocus]') ?? el?.querySelector<HTMLElement>(FOCUSABLE);
      first?.focus({ preventScroll: true });
    }, 60);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeRef.current();
        return;
      }
      if (e.key !== 'Tab' || !ref.current) return;
      const items = Array.from(ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (n) => n.offsetParent !== null,
      );
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('keydown', onKey);
      lockScroll(false);
      prev?.focus?.({ preventScroll: true });
    };
  }, [open]);
  return ref;
}

const ease = [0.22, 1, 0.36, 1] as const;

/** Side sheet (right on desktop, bottom on mobile when `mobileBottom`). */
export function Sheet({
  open,
  onClose,
  label,
  children,
  side = 'right',
  width = 'max-w-md',
  z = 'z-[80]',
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  children: ReactNode;
  side?: 'right' | 'left';
  width?: string;
  z?: string;
}) {
  const ref = useDialog(open, onClose);
  return (
    <AnimatePresence>
      {open && (
        <div className={`fixed inset-0 ${z}`}>
          <motion.div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            aria-hidden
          />
          <motion.div
            ref={ref}
            role="dialog"
            aria-modal="true"
            aria-label={label}
            data-lenis-prevent
            className={`absolute inset-y-0 ${side === 'right' ? 'right-0' : 'left-0'} flex w-full ${width} flex-col overflow-hidden bg-silk shadow-[0_0_80px_rgba(0,0,0,0.7)] ring-1 ring-gold/20`}
            initial={{ x: side === 'right' ? '100%' : '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: side === 'right' ? '100%' : '-100%' }}
            transition={{ duration: 0.55, ease }}
          >
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
