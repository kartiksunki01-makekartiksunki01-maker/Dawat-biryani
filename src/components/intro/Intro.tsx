import { AnimatePresence, motion, type Variants } from 'framer-motion';
import { ChevronsRight, Play, Volume2, VolumeX } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { restaurant } from '../../data/restaurant';
import { useStorefront } from '../../data/menuSync';
import { backendConfigured } from '../../lib/supabase';
import { useUI } from '../../stores/uiStore';
import { asset } from '../../utils/format';
import { lockScroll } from '../../utils/scroll';
import { sound } from '../../utils/sound';

const VISITED_KEY = 'dawat-visited-v2';
const SESSION_KEY = 'dawat-intro-seen';
const ease = [0.22, 1, 0.36, 1] as const;

/** The restaurant's brand film (≈10 s, 1280×720). The 480p copy is used on Data Saver / 2G / 3G connections. */
const VIDEO = {
  full: 'assets/videos/dawat-intro-720.mp4',
  lite: 'assets/videos/dawat-intro-480.mp4',
  poster: 'assets/videos/dawat-intro-poster.jpg',
};
/** Nothing playing after this long (slow network, broken file) → go straight to the website. */
const START_TIMEOUT_MS = 5000;
/** Autoplay refused (e.g. iPhone Low Power Mode): wait this long for a tap on "Play", then enter the site. */
const BLOCKED_TIMEOUT_MS = 8000;
/** Buffering this long in the middle of the film → enter the site instead of showing a frozen frame. */
const STALL_TIMEOUT_MS = 4500;
/** Absolute upper bound for the overlay, whatever happens (10 s film + generous slack). */
const HARD_CAP_MS = 25000;

type ExitKind = 'skip' | 'end' | 'fail';

const isPreview = () => {
  try {
    return new URLSearchParams(location.search).get('intro') === 'preview';
  } catch {
    return false;
  }
};

/**
 * Brand video intro. Shown at most once per browser session (marked as soon as it starts, so a reload never
 * replays it), never on in-page navigation, never with reduced motion, and never when the admin turns it off.
 * Returning visitors skip it unless the restaurant turns that on. `?intro=preview` always shows it.
 */
function shouldShow(): boolean {
  const w = useStorefront.getState().website;
  try {
    if (isPreview()) return true;
    if (w && !w.intro_enabled) return false;
    if (sessionStorage.getItem(SESSION_KEY) === '1') return false;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
    const returning = localStorage.getItem(VISITED_KEY) === '1';
    if (returning && !(w?.intro_for_returning ?? false)) return false;
  } catch {
    /* storage blocked — show the intro */
  }
  return true;
}

function pickSource() {
  const c = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  const slow = !!c && (c.saveData === true || /2g|3g/.test(c.effectiveType ?? ''));
  return asset(slow ? VIDEO.lite : VIDEO.full);
}

// Warm the poster early (only when the intro is likely to show) so the first frame is never a black screen.
if (typeof window !== 'undefined') {
  try {
    const likely =
      isPreview() ||
      (sessionStorage.getItem(SESSION_KEY) !== '1' &&
        localStorage.getItem(VISITED_KEY) !== '1' &&
        !window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    if (likely) {
      const l = document.createElement('link');
      l.rel = 'preload';
      l.as = 'image';
      l.href = asset(VIDEO.poster);
      document.head.appendChild(l);
    }
  } catch {
    /* ignore */
  }
}

/** Waits (max 0.9 s, behind a plain dark cover) for the admin's intro settings so a disabled intro never flashes. */
export function Intro() {
  const website = useStorefront((s) => s.website);
  const [ready, setReady] = useState(() => !!website || !backendConfigured);
  useEffect(() => {
    if (website) {
      setReady(true);
      return;
    }
    const t = window.setTimeout(() => setReady(true), 900);
    return () => window.clearTimeout(t);
  }, [website]);
  if (!ready) return <div className="fixed inset-0 z-[100] bg-smoke" aria-hidden />;
  return <IntroRun />;
}

// Skip / failure: a quick dissolve. Natural end: a slower cinematic fade with a slight push-in on the last frame.
const overlayV: Variants = {
  exit: (fast: boolean) => ({ opacity: 0, transition: { duration: fast ? 0.35 : 0.9, ease, delay: fast ? 0 : 0.1 } }),
};
const filmV: Variants = {
  exit: (fast: boolean) => ({ scale: fast ? 1 : 1.04, transition: { duration: fast ? 0.35 : 1, ease } }),
};

function IntroRun() {
  const setIntroDone = useUI((s) => s.setIntroDone);
  const [show] = useState(shouldShow);
  const [src] = useState(pickSource);
  const [visible, setVisible] = useState(show);
  const [fastExit, setFastExit] = useState(true);
  const [muted, setMuted] = useState(true);
  const [phase, setPhase] = useState<'loading' | 'playing' | 'blocked'>('loading');

  const videoRef = useRef<HTMLVideoElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const doneRef = useRef(false);
  const startedRef = useRef(false);
  const lockedRef = useRef(false);
  const timers = useRef<Record<string, number>>({});

  const clearTimer = useCallback((k: string) => {
    if (timers.current[k]) window.clearTimeout(timers.current[k]);
    delete timers.current[k];
  }, []);
  const setTimer = useCallback(
    (k: string, fn: () => void, ms: number) => {
      clearTimer(k);
      timers.current[k] = window.setTimeout(fn, ms);
    },
    [clearTimer],
  );

  /** Gives scrolling and site audio back exactly once. */
  const release = useCallback(() => {
    if (!lockedRef.current) return;
    lockedRef.current = false;
    lockScroll(false);
    sound.setHeld(false);
  }, []);

  const finish = useCallback(
    (how: ExitKind) => {
      if (doneRef.current) return;
      doneRef.current = true;
      const v = videoRef.current;
      if (v) {
        v.muted = true;
        v.pause();
      }
      Object.keys(timers.current).forEach(clearTimer);
      setFastExit(how !== 'end');
      setVisible(false);
      try {
        localStorage.setItem(VISITED_KEY, '1');
      } catch {
        /* private mode */
      }
      // safety net: even if the fade never completes, the page is released
      window.setTimeout(() => {
        release();
        setIntroDone();
      }, 1600);
    },
    [release, setIntroDone, clearTimer],
  );

  useEffect(() => {
    if (!show) {
      setIntroDone();
      return;
    }
    lockedRef.current = true;
    lockScroll(true);
    sound.setHeld(true);
    try {
      sessionStorage.setItem(SESSION_KEY, '1');
    } catch {
      /* private mode */
    }

    const v = videoRef.current;
    if (v) {
      // muted + inline is what lets mobile browsers autoplay
      v.defaultMuted = true;
      v.muted = true;
      v.setAttribute('muted', '');
      v.play().catch((err: unknown) => {
        if (doneRef.current) return;
        if ((err as { name?: string })?.name === 'NotAllowedError') {
          setPhase('blocked');
          clearTimer('start');
          setTimer('blocked', () => finish('fail'), BLOCKED_TIMEOUT_MS);
        } else if ((err as { name?: string })?.name !== 'AbortError') {
          finish('fail');
        }
      });
    }
    setTimer('start', () => !startedRef.current && finish('fail'), START_TIMEOUT_MS);
    setTimer('cap', () => finish('fail'), HARD_CAP_MS);

    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && finish('skip');
    window.addEventListener('keydown', onKey);
    const t = timers.current;
    return () => {
      window.removeEventListener('keydown', onKey);
      Object.keys(t).forEach(clearTimer);
      release();
    };
  }, [show, finish, release, setIntroDone, setTimer, clearTimer]);

  // thin gold progress line, driven straight from the video clock (no re-renders)
  useEffect(() => {
    if (phase !== 'playing') return;
    let raf = 0;
    const tick = () => {
      const v = videoRef.current;
      const bar = barRef.current;
      if (v && bar && v.duration > 0) bar.style.transform = `scaleX(${Math.min(1, v.currentTime / v.duration)})`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  if (!show) return null;

  const toggleSound = () => {
    const v = videoRef.current;
    if (!v) return;
    const next = !muted;
    v.muted = next;
    setMuted(next);
    if (v.paused && !doneRef.current) void v.play().catch(() => {});
  };

  const playAfterTap = () => {
    const v = videoRef.current;
    if (!v) return;
    clearTimer('blocked');
    setTimer('start', () => !startedRef.current && finish('fail'), START_TIMEOUT_MS);
    v.play().catch(() => finish('fail'));
  };

  return (
    <AnimatePresence
      custom={fastExit}
      onExitComplete={() => {
        release();
        setIntroDone();
      }}
    >
      {visible && (
        <motion.div
          key="intro"
          role="dialog"
          aria-modal="true"
          aria-label={`${restaurant.name} — intro`}
          data-intro-phase={phase}
          className="fixed inset-0 z-[100] touch-none overflow-hidden overscroll-contain bg-black"
          custom={fastExit}
          variants={overlayV}
          exit="exit"
        >
          {/* deep royal backdrop around the letterboxed film (the film itself is never cropped or stretched) */}
          <div className="absolute inset-0" style={{ background: 'radial-gradient(90% 70% at 50% 50%, #1a0a0e 0%, #070304 65%, #000 100%)' }} aria-hidden />

          <motion.video
            ref={videoRef}
            className="absolute inset-0 h-full w-full object-contain"
            src={src}
            poster={asset(VIDEO.poster)}
            muted
            playsInline
            preload="auto"
            disablePictureInPicture
            disableRemotePlayback
            controlsList="nodownload nofullscreen noremoteplayback"
            aria-label={`${restaurant.name} brand film`}
            custom={fastExit}
            variants={filmV}
            onPlaying={() => {
              startedRef.current = true;
              clearTimer('start');
              clearTimer('stall');
              clearTimer('blocked');
              setPhase('playing');
            }}
            onWaiting={() => {
              if (startedRef.current) setTimer('stall', () => finish('fail'), STALL_TIMEOUT_MS);
            }}
            onEnded={() => finish('end')}
            onError={() => finish('fail')}
          />

          {/* keeps the buttons legible over bright frames */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/55 to-transparent" aria-hidden />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/45 to-transparent" aria-hidden />

          {phase === 'blocked' && (
            <button
              type="button"
              onClick={playAfterTap}
              className="intro-glass-btn absolute left-1/2 top-1/2 flex min-h-[56px] -translate-x-1/2 -translate-y-1/2 items-center gap-3 rounded-full px-7"
            >
              <Play size={18} className="fill-current" aria-hidden />
              <span>Play intro</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => finish('skip')}
            className="intro-glass-btn group absolute right-[calc(env(safe-area-inset-right,0px)+1rem)] top-[calc(env(safe-area-inset-top,0px)+1rem)] z-10 flex min-h-[46px] min-w-[46px] items-center gap-2 rounded-full pl-5 pr-4 sm:right-[calc(env(safe-area-inset-right,0px)+2rem)] sm:top-[calc(env(safe-area-inset-top,0px)+2rem)]"
            aria-label="Skip intro"
          >
            <span>Skip intro</span>
            <ChevronsRight size={16} className="transition-transform duration-300 group-hover:translate-x-0.5" aria-hidden />
          </button>

          <button
            type="button"
            onClick={toggleSound}
            aria-pressed={!muted}
            aria-label={muted ? 'Turn intro sound on' : 'Mute intro sound'}
            className="intro-glass-btn absolute bottom-[calc(env(safe-area-inset-bottom,0px)+1.25rem)] left-[calc(env(safe-area-inset-left,0px)+1rem)] z-10 flex min-h-[46px] min-w-[46px] items-center gap-2 rounded-full px-4 sm:bottom-[calc(env(safe-area-inset-bottom,0px)+2rem)] sm:left-[calc(env(safe-area-inset-left,0px)+2rem)]"
          >
            {muted ? <VolumeX size={16} aria-hidden /> : <Volume2 size={16} aria-hidden />}
            <span className="hidden sm:inline">{muted ? 'Sound off' : 'Sound on'}</span>
          </button>

          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[2px] bg-white/[0.06]" aria-hidden>
            <div ref={barRef} className="h-full origin-left bg-gradient-to-r from-[#b8862b] via-[#f6d77a] to-[#d4af37]" style={{ transform: 'scaleX(0)' }} />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
