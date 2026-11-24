import { useEffect, useState } from 'react';
import { getOpenStatus } from '../../utils/hours';

export function useOpenStatus() {
  const [status, setStatus] = useState(() => getOpenStatus());
  useEffect(() => {
    const id = window.setInterval(() => setStatus(getOpenStatus()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  return status;
}

/** Live open/closed chip based on the configured schedule (Asia/Kolkata). */
export function OpenStatusChip({ className = '' }: { className?: string }) {
  const s = useOpenStatus();
  return (
    <span
      className={`inline-flex items-center gap-2 text-sm ${className}`}
      title="Based on our usual hours (10 AM – 10 PM, India time). Actual hours may vary."
    >
      <span className="relative flex h-2.5 w-2.5" aria-hidden>
        {s.open && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />}
        <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${s.open ? 'bg-emerald-400' : 'bg-chilli'}`} />
      </span>
      <span className={s.open ? 'text-emerald-300' : 'text-red-300'}>{s.label}</span>
    </span>
  );
}
