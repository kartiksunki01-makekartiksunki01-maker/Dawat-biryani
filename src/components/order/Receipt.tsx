import { Check, Download, ExternalLink, MapPin, Phone, Printer, Share2 } from 'lucide-react';
import { useState } from 'react';
import { PAYMENT_LABEL, STATUS_LABEL, type OrderJSON, type OrderStatus } from '../../lib/api';
import { downloadReceiptPdf, fmtDateTime, printReceipt, receiptText, whenText } from '../../lib/receipt';
import { asset, formatINR } from '../../utils/format';
import {copyText, waTemplates} from '../../utils/order';
import { WhatsAppLink } from '../ui/WhatsAppLink';
import { WhatsAppIcon } from '../ui/Bits';

const STEPS: OrderStatus[] = ['pending', 'confirmed', 'preparing', 'ready', 'completed'];

/** Elegant ivory receipt card. Every number comes from the stored order. */
export function Receipt({ order }: { order: OrderJSON }) {
  const r = order.receipt;
  return (
    <article
      aria-label={`Receipt ${order.bill_number}`}
      className="rounded-2xl bg-[#FFF8EC] p-5 font-serif text-[#14100c] shadow-[0_20px_60px_rgba(0,0,0,0.45)] ring-1 ring-[#b8892b]/60 sm:p-6"
    >
      <header className="border-b border-[#b8892b]/60 pb-4 text-center">
        <img src={asset('assets/images/logo-256.png')} alt="" className="mx-auto h-14 w-14 rounded-full" />
        <h3 className="mt-2 text-lg font-bold tracking-wide">{r?.restaurant ?? 'Dawat Biryani House'}</h3>
        <p className="mt-1 text-[11px] leading-relaxed text-[#5c5146]">
          {r?.address}
          <br />
          Phone: {r?.phone}
          {r?.gstin ? ` · GSTIN: ${r.gstin}` : ''}
        </p>
        <p className="mt-2 text-[10px] uppercase tracking-[0.3em] text-[#8a6516]">{r?.title ?? 'Order Receipt'}</p>
      </header>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 py-4 text-xs">
        {[
          ['Bill number', order.bill_number],
          ['Order date', fmtDateTime(order.created_at)],
          ['Customer', order.customer_name],
          [order.mode === 'pickup' ? 'Pickup' : 'Delivery', whenText(order)],
          ['Order status', STATUS_LABEL[order.status]],
          ['Payment', PAYMENT_LABEL[order.payment_status]],
        ].map(([k, v]) => (
          <div key={k}>
            <dt className="text-[10px] uppercase tracking-wider text-[#8a6516]">{k}</dt>
            <dd className="font-medium">{v}</dd>
          </div>
        ))}
        {order.mode === 'delivery' && order.delivery_address && (
          <div className="col-span-2">
            <dt className="text-[10px] uppercase tracking-wider text-[#8a6516]">Delivery address</dt>
            <dd>{order.delivery_address}</dd>
          </div>
        )}
        <div className="col-span-2">
          <dt className="text-[10px] uppercase tracking-wider text-[#8a6516]">Order reference</dt>
          <dd className="break-all font-mono text-[10px]">{order.id}</dd>
        </div>
      </dl>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-[#b8892b]/60 text-[10px] uppercase tracking-wider text-[#8a6516]">
            <th className="py-1.5 text-left font-normal">Item</th>
            <th className="py-1.5 text-center font-normal">Qty</th>
            <th className="py-1.5 text-right font-normal">Price</th>
            <th className="py-1.5 text-right font-normal">Amount</th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((i, n) => (
            <tr key={n} className="border-b border-dotted border-[#d9c79e] align-top">
              <td className="py-1.5 pr-2">
                {i.name}
                {i.variant_label ? ` (${i.variant_label})` : ''}
                {i.note && <span className="block text-[10px] italic text-[#6b5d4f]">{i.note}</span>}
              </td>
              <td className="py-1.5 text-center">{i.qty}</td>
              <td className="py-1.5 text-right">{formatINR(i.unit_price)}</td>
              <td className="py-1.5 text-right">{formatINR(i.line_total)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="text-xs">
          <tr><td colSpan={3} className="pt-2">Subtotal</td><td className="pt-2 text-right">{formatINR(order.subtotal)}</td></tr>
          {order.discount > 0 && (
            <tr><td colSpan={3}>Discount{order.coupon_code ? ` (${order.coupon_code})` : ''}</td><td className="text-right">− {formatINR(order.discount)}</td></tr>
          )}
          {order.delivery_charge > 0 && <tr><td colSpan={3}>Delivery charges</td><td className="text-right">{formatINR(order.delivery_charge)}</td></tr>}
          {order.tax > 0 && <tr><td colSpan={3}>Tax</td><td className="text-right">{formatINR(order.tax)}</td></tr>}
          <tr className="border-t-2 border-[#b8892b] text-base font-bold">
            <td colSpan={3} className="pt-2">Grand total</td>
            <td className="pt-2 text-right">{formatINR(order.total)}</td>
          </tr>
        </tfoot>
      </table>
      {order.instructions && <p className="mt-3 text-[11px] text-[#5c5146]"><b>Instructions:</b> {order.instructions}</p>}
      <footer className="mt-4 text-center text-xs italic">
        {r?.footer}
        <span className="mt-1 block text-[10px] not-italic text-[#6b5d4f]">
          This is an order receipt, not a tax invoice. Payment status is recorded by the restaurant.
        </span>
      </footer>
    </article>
  );
}

/** Status progress for customers. */
export function StatusTimeline({ order }: { order: OrderJSON }) {
  const stopped = order.status === 'cancelled' || order.status === 'rejected';
  const steps = order.mode === 'delivery' ? STEPS.map((s) => (s === 'ready' ? 'out_for_delivery' : s)) : STEPS;
  const at = (s: OrderStatus) => order.history.find((h) => h.status === s)?.at;
  const currentIdx = steps.indexOf(order.status);
  return (
    <div>
      {stopped ? (
        <p role="status" className="rounded-xl bg-red-500/10 p-3 text-sm text-red-200 ring-1 ring-red-400/30">
          This order was {order.status}.{order.status_reason ? ` Reason: ${order.status_reason}` : ''}
        </p>
      ) : (
        <ol className="grid gap-3" aria-label="Order progress">
          {steps.map((s, i) => {
            const done = i <= currentIdx;
            return (
              <li key={s} className="flex items-center gap-3" aria-current={i === currentIdx ? 'step' : undefined}>
                <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ring-1 ${done ? 'bg-gold text-smoke ring-gold' : 'text-ivory/40 ring-ivory/20'}`}>
                  {done ? <Check size={16} /> : i + 1}
                </span>
                <span className={done ? 'text-ivory' : 'text-ivory/45'}>
                  {STATUS_LABEL[s]}
                  {at(s) && <span className="ml-2 text-xs text-ivory/45">{fmtDateTime(at(s))}</span>}
                </span>
              </li>
            );
          })}
        </ol>
      )}
      {order.prep_minutes && !stopped && order.status !== 'completed' && (
        <p className="mt-3 text-sm text-gold">Estimated preparation time: about {order.prep_minutes} minutes (as set by the restaurant).</p>
      )}
    </div>
  );
}

export function ReceiptActions({ order, trackHref, onContinue }: { order: OrderJSON; trackHref?: string; onContinue?: () => void }) {
  const [busy, setBusy] = useState<'' | 'pdf' | 'print'>('');
  const [msg, setMsg] = useState('');
  const flash = (t: string) => {
    setMsg(t);
    window.setTimeout(() => setMsg(''), 3500);
  };
  const pdf = async () => {
    setBusy('pdf');
    try {
      await downloadReceiptPdf(order);
      flash('PDF downloaded.');
    } catch {
      flash('Could not create the PDF. Try Print → Save as PDF instead.');
    } finally {
      setBusy('');
    }
  };
  const print = async () => {
    setBusy('print');
    try {
      await printReceipt(order);
    } catch {
      flash('Printing is not available in this browser.');
    } finally {
      setBusy('');
    }
  };
  const share = async () => {
    const text = receiptText(order);
    const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
    if (nav.share) {
      try {
        await nav.share({ title: `Order ${order.bill_number}`, text, url: trackHref });
        return;
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
      }
    }
    const ok = await copyText(trackHref ? `${text}\n\nTrack: ${trackHref}` : text);
    flash(ok ? 'Order summary copied — paste it anywhere.' : 'Could not copy the summary.');
  };
  const tel = order.receipt?.phone_e164 ? `tel:${order.receipt.phone_e164}` : undefined;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <button type="button" className="btn btn-gold btn-sm" onClick={pdf} disabled={!!busy} aria-busy={busy === 'pdf'}>
          <Download size={16} /> {busy === 'pdf' ? 'Preparing…' : 'Download PDF'}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={print} disabled={!!busy}>
          <Printer size={16} /> Print
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={share}>
          <Share2 size={16} /> Share
        </button>
        {trackHref && (
          <a className="btn btn-ghost btn-sm" href={trackHref} target="_blank" rel="noopener noreferrer">
            <MapPin size={16} /> Track order
          </a>
        )}
        {trackHref && (
          <a className="btn btn-ghost btn-sm" href={trackHref} target="_blank" rel="noopener noreferrer">
            <ExternalLink size={16} /> View receipt
          </a>
        )}
        {tel && (
          <a className="btn btn-ghost btn-sm" href={tel}>
            <Phone size={16} /> Call restaurant
          </a>
        )}
      </div>
      <WhatsAppLink className="btn btn-emerald btn-sm w-full" text={waTemplates.orderSupport(order.bill_number)}>
        <WhatsAppIcon /> Message the restaurant about this order (optional)
      </WhatsAppLink>
      {onContinue && (
        <button type="button" className="btn btn-ghost w-full" onClick={onContinue}>
          Continue browsing
        </button>
      )}
      <p role="status" aria-live="polite" className="min-h-[1.25rem] text-center text-xs text-gold">{msg}</p>
    </div>
  );
}
