import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useUI } from '../../stores/uiStore';

export function Toast() {
  const toast = useUI((s) => s.toast);
  const [visible, setVisible] = useState<typeof toast>(null);
  useEffect(() => {
    if (!toast) return;
    setVisible(toast);
    const t = window.setTimeout(() => setVisible(null), 2800);
    return () => window.clearTimeout(t);
  }, [toast]);
  return (
    <div className="pointer-events-none fixed inset-x-0 top-20 z-[95] flex justify-center px-4 sm:bottom-8 sm:top-auto" aria-live="polite" role="status">
      <AnimatePresence>
        {visible && (
          <motion.p
            key={visible.id}
            className="glass flex max-w-md items-center gap-2 rounded-full px-5 py-3 text-sm text-ivory"
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.97 }}
            transition={{ duration: 0.35 }}
          >
            <CheckCircle2 size={17} className="shrink-0 text-gold" aria-hidden />
            {visible.text}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
