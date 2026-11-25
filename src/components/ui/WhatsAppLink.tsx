import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Copy, Globe, MessageCircle, Phone, X } from 'lucide-react';
import { copyText, isMobileUA, telUrl, waDisplayNumber, whatsappAppUrl, whatsappUrl, whatsappWebUrl } from '../../utils/order';
import { WhatsAppIcon } from './Bits';

/**
 * The one WhatsApp button used everywhere on the site.
 *
 * Root cause of "tap does nothing" (Nov 2026): the button was a NEW-TAB link (target="_blank").
 * In-app browsers on Android/iOS (the browser that opens when you tap a link inside another app)
 * silently ignore new-tab links, so nothing opened and no error showed. On phones and tablets this
 * button is therefore a plain SAME-TAB link to https://wa.me/<number>?text=… — a real tap on a real
 * link, which is exactly what Android App Links / iOS Universal Links need to hand off to the
 * WhatsApp app. If the app is not installed, wa.me itself shows WhatsApp's web page (browser fallback).
 * Desktop keeps a new tab (wa.me offers WhatsApp Desktop or WhatsApp Web there).
 *
 * Safety net: if the page is still in front of the customer 2.5 s after the tap (nothing opened at
 * all), a small panel offers "Open WhatsApp app", WhatsApp Web, Call, Copy message and Copy number.
 * No preventDefault, no window.open, no JavaScript is needed for the link itself to work.
 */
export function WhatsAppLink({
  text,
  className,
  children,
  onOpen,
}: {
  text: string;
  className?: string;
  children?: ReactNode;
  onOpen?: () => void;
}) {
  const [fallback, setFallback] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const left = useRef(false);
  const [touch] = useState(() => typeof navigator !== 'undefined' && isMobileUA());

  useEffect(() => {
    const gone = () => { left.current = true; };
    const vis = () => { if (document.visibilityState === 'hidden') left.current = true; };
    window.addEventListener('pagehide', gone);
    window.addEventListener('blur', gone);
    document.addEventListener('visibilitychange', vis);
    return () => {
      window.removeEventListener('pagehide', gone);
      window.removeEventListener('blur', gone);
      document.removeEventListener('visibilitychange', vis);
      window.clearTimeout(timer.current);
    };
  }, []);

  const href = whatsappUrl(text);

  const click = () => {
    onOpen?.();
    left.current = false;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      if (!left.current && document.visibilityState === 'visible') setFallback(true);
    }, 2500);
  };

  return (
    <>
      <a
        className={className}
        href={href}
        target={touch ? undefined : '_blank'}
        rel="noopener noreferrer"
        onClick={click}
        data-wa="1"
      >
        {children ?? (<><WhatsAppIcon /> WhatsApp</>)}
      </a>
      {fallback && <Fallback text={text} touch={touch} onClose={() => setFallback(false)} />}
    </>
  );
}

function Fallback({ text, touch, onClose }: { text: string; touch: boolean; onClose: () => void }) {
  const [note, setNote] = useState('');
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);
  const flash = (m: string) => { setNote(m); window.setTimeout(() => setNote(''), 2200); };
  return createPortal(
    <div
      role="alertdialog"
      aria-label="WhatsApp did not open"
      data-wa-fallback="1"
      className="fixed inset-x-3 bottom-3 z-[2147483000] mx-auto max-w-md rounded-2xl border border-gold/40 bg-[#1a0d10] p-4 text-ivory shadow-2xl"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold">WhatsApp didn’t open?</p>
        <button ref={closeRef} type="button" onClick={onClose} aria-label="Close" className="grid h-10 w-10 place-items-center rounded-full ring-1 ring-white/20"><X size={16} /></button>
      </div>
      <p className="mt-1 text-xs text-ivory/70">
        {touch
          ? 'If this site is open inside another app, use that app’s menu → “Open in Chrome / browser”, then tap WhatsApp again. Or pick another way:'
          : 'Pick another way to reach us:'}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {touch ? (
          <a className="btn btn-emerald btn-sm" href={whatsappAppUrl(text)}><MessageCircle size={16} /> Open WhatsApp app</a>
        ) : (
          <a className="btn btn-emerald btn-sm" href={whatsappWebUrl(text)} target="_blank" rel="noopener noreferrer"><Globe size={16} /> WhatsApp Web</a>
        )}
        <a className="btn btn-ghost btn-sm" href={telUrl}><Phone size={16} /> Call</a>
        <button type="button" className="btn btn-ghost btn-sm" onClick={async () => flash((await copyText(text)) ? 'Message copied' : 'Copy failed')}><Copy size={16} /> Copy message</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={async () => flash((await copyText(waDisplayNumber())) ? 'Number copied' : 'Copy failed')}><Copy size={16} /> Copy {waDisplayNumber()}</button>
      </div>
      <p role="status" aria-live="polite" className="mt-2 min-h-[1rem] text-center text-xs text-gold">{note}</p>
    </div>,
    document.body,
  );
}
