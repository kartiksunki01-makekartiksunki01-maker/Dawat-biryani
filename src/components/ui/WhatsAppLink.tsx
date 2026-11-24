import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Copy, Globe, Phone, X } from 'lucide-react';
import { copyText, isMobileUA, telUrl, waDisplayNumber, whatsappUrl, whatsappWebUrl } from '../../utils/order';
import { WhatsAppIcon } from './Bits';

/**
 * The one WhatsApp button used everywhere.
 *  - It is a real <a href="https://wa.me/…"> so it works with no JavaScript, middle-click, long-press, etc.
 *  - Phones/tablets: opened in the SAME tab (app/universal-link hand-off works in Chrome, Safari and in-app
 *    browsers; a new blank tab does not).  Desktop: new tab (wa.me offers the app or WhatsApp Web).
 *  - If the page is still in front of the user 2.2 s later (nothing opened), a fallback panel offers
 *    WhatsApp Web, Copy message, Copy number and Call — so the customer is never stuck.
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

  const click = (e: React.MouseEvent<HTMLAnchorElement>) => {
    onOpen?.();
    left.current = false;
    if (isMobileUA()) {
      e.preventDefault();
      window.location.assign(href);
    }
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      if (!left.current && document.visibilityState === 'visible') setFallback(true);
    }, 2200);
  };

  return (
    <>
      <a className={className} href={href} target="_blank" rel="noopener noreferrer" onClick={click} data-wa="1">
        {children ?? (<><WhatsAppIcon /> WhatsApp</>)}
      </a>
      {fallback && <Fallback text={text} onClose={() => setFallback(false)} />}
    </>
  );
}

function Fallback({ text, onClose }: { text: string; onClose: () => void }) {
  const [note, setNote] = useState('');
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
        <button type="button" onClick={onClose} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-full ring-1 ring-white/20"><X size={16} /></button>
      </div>
      <p className="mt-1 text-xs text-ivory/70">This device may not have WhatsApp installed, or the number may not be on WhatsApp. Pick another way:</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <a className="btn btn-emerald btn-sm" href={whatsappWebUrl(text)} target="_blank" rel="noopener noreferrer"><Globe size={16} /> WhatsApp Web</a>
        <a className="btn btn-ghost btn-sm" href={telUrl}><Phone size={16} /> Call</a>
        <button type="button" className="btn btn-ghost btn-sm" onClick={async () => flash((await copyText(text)) ? 'Message copied' : 'Copy failed')}><Copy size={16} /> Copy message</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={async () => flash((await copyText(waDisplayNumber())) ? 'Number copied' : 'Copy failed')}><Copy size={16} /> Copy {waDisplayNumber()}</button>
      </div>
      <p role="status" aria-live="polite" className="mt-2 min-h-[1rem] text-center text-xs text-gold">{note}</p>
    </div>,
    document.body,
  );
}
