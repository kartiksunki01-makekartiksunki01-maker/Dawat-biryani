import { AnimatePresence, motion } from 'framer-motion';
import { BookOpen, ChevronDown, MessageCircle, Volume2, VolumeX, X } from 'lucide-react';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useHost } from '../../stores/hostStore';
import { useStorefront } from '../../data/menuSync';
import { useSettings, useUI } from '../../stores/uiStore';
import { hasWebGL } from '../../utils/device';
import { scrollToTarget } from '../../utils/scroll';
import { speak, stopSpeaking } from '../../utils/sound';
import { useReducedMotion } from '../../hooks/useMedia';

const AnnaCanvas = lazy(() => import('./AnnaCanvas'));

const ease = [0.22, 1, 0.36, 1] as const;

/** Small illustrated avatar used for the minimised pill and the no-WebGL fallback. */
function AnnaAvatar({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden>
      <circle cx="20" cy="20" r="20" fill="#06351E" />
      <ellipse cx="20" cy="38" rx="13" ry="9" fill="#F6F2EA" />
      <circle cx="20" cy="19" r="9.5" fill="#C98B5F" />
      <path d="M10.5 18 C11 9 29 9 29.5 18 C27 13 13 13 10.5 18Z" fill="#151010" />
      <path d="M11 20 C12 30 28 30 29 20 C27 26 13 26 11 20Z" fill="#151010" />
      <path d="M16 24.5 Q20 27 24 24.5" stroke="#FFFAF0" strokeWidth="1.4" fill="none" strokeLinecap="round" />
      <circle cx="16.5" cy="18.5" r="1.3" fill="#1a0f08" />
      <circle cx="23.5" cy="18.5" r="1.3" fill="#1a0f08" />
      <rect x="19.3" y="12" width="1.4" height="3.4" rx="0.7" fill="#C4141C" />
    </svg>
  );
}

export function HostDock() {
  const hostVisible = useSettings((s) => s.hostVisible);
  const characterEnabled = useStorefront((s) => s.website?.character_enabled ?? true);
  const voiceOn = useSettings((s) => s.voiceOn);
  const setVoiceOn = useSettings((s) => s.setVoiceOn);
  const introDone = useUI((s) => s.introDone);
  const overlayOpen = useUI((s) => s.cartOpen || s.navOpen || !!s.productId);
  const message = useHost((s) => s.message);
  const say = useHost((s) => s.say);
  const dismiss = useHost((s) => s.dismiss);
  const reduced = useReducedMotion();
  // Phones & tablets start minimised so Anna never covers menu items, prices or checkout controls.
  const [minimised, setMinimised] = useState(
    () => typeof window !== 'undefined' && (window.innerWidth < 768 || window.matchMedia('(pointer: coarse)').matches),
  );
  const [scrollHidden, setScrollHidden] = useState(false);
  const [mountCanvas, setMountCanvas] = useState(false);
  const [webgl] = useState(() => hasWebGL());
  const [inView, setInView] = useState(true);
  const dockRef = useRef<HTMLDivElement>(null);

  // Lazy-mount the 3D host once the page is idle after the intro.
  useEffect(() => {
    if (!introDone || minimised || !webgl) return;
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
    const id = w.requestIdleCallback ? w.requestIdleCallback(() => setMountCanvas(true), { timeout: 1500 }) : window.setTimeout(() => setMountCanvas(true), 600);
    return () => {
      if (!w.requestIdleCallback) window.clearTimeout(id);
    };
  }, [introDone, minimised, webgl]);

  // Dev-only helper so gestures can be checked visually (stripped from production builds).
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as unknown as { __host?: (e: string) => void }).__host = (e: string) =>
      say(e as Parameters<typeof say>[0]);
  }, [say]);

  // Greet once per session, shortly after the intro.
  useEffect(() => {
    if (!introDone) return;
    const t = window.setTimeout(() => say('welcome', { once: true }), 1200);
    return () => window.clearTimeout(t);
  }, [introDone, say]);

  // Speech bubble auto-hides; optional voice (only after the visitor turned it on).
  useEffect(() => {
    if (!message) return;
    if (voiceOn && !minimised) speak(message.text);
    const t = window.setTimeout(dismiss, 7000);
    return () => window.clearTimeout(t);
  }, [message, voiceOn, minimised, dismiss]);

  // Touch screens: tuck the minimised pill away while scrolling down, bring it back on scroll up.
  useEffect(() => {
    if (!minimised) {
      setScrollHidden(false);
      return;
    }
    let last = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      if (Math.abs(y - last) < 8) return;
      setScrollHidden(y > last && y > 200);
      last = y;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [minimised]);

  // pause rendering when tab hidden
  useEffect(() => {
    const onVis = () => setInView(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  if (!hostVisible || !characterEnabled) return null;

  const hiddenByOverlay = overlayOpen || scrollHidden;

  return (
    <motion.div
      ref={dockRef}
      className="pointer-events-none fixed bottom-3 right-3 z-[65] flex flex-col items-end sm:bottom-5 sm:right-5"
      initial={false}
      animate={introDone && !hiddenByOverlay ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
      transition={{ duration: 0.6, ease }}
      aria-hidden={hiddenByOverlay ? true : undefined}
    >
      <AnimatePresence>
        {message && !minimised && (
          <motion.div
            key={message.id}
            role="status"
            aria-live="polite"
            className="pointer-events-auto relative mb-2 max-w-[260px] rounded-2xl rounded-br-md bg-emerald px-4 py-3 pr-9 text-sm leading-snug text-ivory shadow-xl ring-1 ring-gold/60"
            initial={{ opacity: 0, y: 12, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.96 }}
            transition={{ duration: 0.35, ease }}
          >
            <span className="mb-0.5 block font-royal text-[10px] tracking-[0.2em] text-gold">DAWAT ANNA</span>
            {message.text}
            <button
              type="button"
              onClick={() => {
                dismiss();
                stopSpeaking();
              }}
              className="absolute right-1 top-1 grid h-8 w-8 place-items-center rounded-full text-ivory/60 hover:text-ivory"
              aria-label="Dismiss message"
            >
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {minimised ? (
        <button
          type="button"
          onClick={() => {
            setMinimised(false);
            say('talk');
          }}
          className="glass pointer-events-auto flex min-h-[48px] items-center gap-2 rounded-full py-1 pl-1 pr-4 text-sm text-ivory"
          aria-label="Open Dawat Anna, your virtual host"
        >
          <AnnaAvatar size={40} />
          <span className="font-medium">Ask Anna</span>
        </button>
      ) : (
        <motion.div
          className="pointer-events-auto relative w-[150px] sm:w-[172px]"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, ease }}
        >
          <div className="relative h-[200px] overflow-hidden rounded-t-[999px] rounded-b-[1.5rem] bg-gradient-to-b from-[#2a1a10]/90 to-[#0b0908]/95 ring-1 ring-gold/40 sm:h-[228px]">
            <div className="absolute inset-0 bg-[radial-gradient(60%_45%_at_50%_35%,rgba(245,158,11,0.28),transparent)]" aria-hidden />
            {webgl && mountCanvas ? (
              <Suspense fallback={<div className="grid h-full place-items-center"><AnnaAvatar size={72} /></div>}>
                <AnnaCanvas active={inView} reduced={reduced} />
              </Suspense>
            ) : (
              <div className="grid h-full place-items-center">
                <AnnaAvatar size={84} />
              </div>
            )}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-3 pb-2 pt-6 text-center">
              <p className="font-royal text-[11px] tracking-[0.18em] text-gold">DAWAT ANNA</p>
              <p className="text-[10px] text-ivory/55">Virtual host · fictional character</p>
            </div>
          </div>
          <div className="mt-2 flex items-center justify-end gap-1.5">
            <button
              type="button"
              onClick={() => say('talk')}
              className="glass grid h-11 w-11 place-items-center rounded-full text-ivory"
              aria-label="Talk to Anna"
              title="Talk to Anna"
            >
              <MessageCircle size={18} />
            </button>
            <button
              type="button"
              onClick={() => {
                say('guide');
                scrollToTarget('menu');
              }}
              className="glass grid h-11 w-11 place-items-center rounded-full text-ivory"
              aria-label="Menu guidance"
              title="Menu guidance"
            >
              <BookOpen size={18} />
            </button>
            <button
              type="button"
              onClick={() => {
                const next = !voiceOn;
                setVoiceOn(next);
                if (!next) stopSpeaking();
                else if (message) speak(message.text);
              }}
              className="glass grid h-11 w-11 place-items-center rounded-full text-ivory"
              aria-pressed={voiceOn}
              aria-label={voiceOn ? 'Turn Anna’s voice off' : 'Turn Anna’s voice on'}
              title={voiceOn ? 'Voice on' : 'Voice off'}
            >
              {voiceOn ? <Volume2 size={18} /> : <VolumeX size={18} />}
            </button>
            <button
              type="button"
              onClick={() => {
                setMinimised(true);
                stopSpeaking();
              }}
              className="glass grid h-11 w-11 place-items-center rounded-full text-ivory"
              aria-label="Hide Anna"
              title="Hide Anna"
            >
              <ChevronDown size={18} />
            </button>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}
