import { ArrowLeft, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { ApiError, getOrder, STATUS_LABEL, type OrderJSON } from '../lib/api';
import { parseTrackHash, trackUrl, useMyOrders } from '../lib/myOrders';
import { fmtDateTime } from '../lib/receipt';
import { Receipt, ReceiptActions, StatusTimeline } from '../components/order/Receipt';
import { formatINR } from '../utils/format';

const POLL_MS = 30000;

function MyOrdersList() {
  const orders = useMyOrders((s) => s.orders);
  const forget = useMyOrders((s) => s.forget);
  if (!orders.length) {
    return <p className="text-sm text-ivory/60">No orders have been placed from this device yet.</p>;
  }
  return (
    <ul className="space-y-2">
      {orders.map((o) => (
        <li key={o.id} className="flex items-center justify-between gap-3 rounded-xl bg-ivory/[0.04] p-3 ring-1 ring-gold/20">
          <a className="min-w-0 flex-1" href={trackUrl(o.id, o.token)}>
            <span className="block font-num text-gold">{o.bill}</span>
            <span className="text-xs text-ivory/55">{fmtDateTime(o.at)}</span>
          </a>
          <button type="button" className="min-h-[40px] px-2 text-xs text-ivory/50 underline" onClick={() => forget(o.id)} aria-label={`Remove ${o.bill} from this device`}>
            Remove
          </button>
        </li>
      ))}
    </ul>
  );
}

export function TrackApp() {
  const [ref, setRef] = useState(() => parseTrackHash(location.hash));
  const [order, setOrder] = useState<OrderJSON | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'notfound' | 'error'>('loading');
  const [updated, setUpdated] = useState<Date | null>(null);

  useEffect(() => {
    const on = () => setRef(parseTrackHash(location.hash));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  const load = useCallback(async () => {
    if (!ref) return;
    try {
      const o = await getOrder(ref.id, ref.token);
      setOrder(o);
      setState('ok');
      setUpdated(new Date());
      document.title = `${o.bill_number} · ${STATUS_LABEL[o.status]} — Dawat Biryani House`;
    } catch (e) {
      setState(e instanceof ApiError && e.kind === 'rejected' ? 'notfound' : 'error');
    }
  }, [ref]);

  useEffect(() => {
    if (!ref) return;
    setState('loading');
    void load();
    const t = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, POLL_MS);
    return () => window.clearInterval(t);
  }, [ref, load]);

  return (
    <main className="min-h-screen bg-smoke px-4 py-8 font-sans text-ivory sm:px-8">
      <div className="mx-auto max-w-2xl space-y-6">
        <a href="./" className="inline-flex min-h-[44px] items-center gap-2 text-sm text-ivory/70 hover:text-gold">
          <ArrowLeft size={18} /> Back to Dawat Biryani House
        </a>
        {!ref && (
          <section className="space-y-4">
            <h1 className="font-display text-3xl">My orders on this device</h1>
            <MyOrdersList />
          </section>
        )}
        {ref && state === 'loading' && <div className="h-64 animate-pulse rounded-2xl bg-ivory/5" aria-label="Loading order" />}
        {ref && state === 'notfound' && (
          <p role="alert" className="rounded-xl bg-red-500/10 p-4 text-sm ring-1 ring-red-400/30">
            This order link is not valid. Please use the link from the device you ordered on, or contact the restaurant.
          </p>
        )}
        {ref && state === 'error' && !order && (
          <p role="alert" className="rounded-xl bg-red-500/10 p-4 text-sm ring-1 ring-red-400/30">
            Could not load the order (connection problem). <button type="button" className="underline" onClick={() => void load()}>Try again</button>
          </p>
        )}
        {order && ref && (
          <>
            <header className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="t-eyebrow text-gold">Order {order.bill_number}</p>
                <h1 className="font-display text-3xl">{STATUS_LABEL[order.status]}</h1>
                <p className="text-sm text-ivory/60">Total {formatINR(order.total)} · placed {fmtDateTime(order.created_at)}</p>
              </div>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => void load()}>
                <RefreshCw size={16} /> Refresh
              </button>
            </header>
            <section aria-label="Order progress" className="rounded-2xl bg-ivory/[0.03] p-5 ring-1 ring-gold/20">
              <StatusTimeline order={order} />
              <p className="mt-4 text-[11px] text-ivory/45">
                Updates every 30 seconds while this page is open{updated ? ` · last checked ${updated.toLocaleTimeString('en-IN')}` : ''}.
                {state === 'error' && ' (Last check failed — showing the previous status.)'}
              </p>
            </section>
            <Receipt order={order} />
            <ReceiptActions order={order} trackHref={trackUrl(order.id, ref.token)} />
          </>
        )}
      </div>
    </main>
  );
}
