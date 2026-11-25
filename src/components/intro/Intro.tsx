import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useState } from 'react';
import { restaurant } from '../../data/restaurant';
import { useStorefront } from '../../data/menuSync';
import { backendConfigured } from '../../lib/supabase';
import { useUI } from '../../stores/uiStore';
import { asset } from '../../utils/format';
import { lockScroll } from '../../utils/scroll';

const VISITED_KEY = 'dawat-visited-v2';
const ease = [0.22, 1, 0.36, 1] as const;
const MOTES = [[12, 70, 3, 0.2], [24, 40, 2, 0.5], [35, 78, 2, 0.8], [47, 30, 3, 0.35], [58, 72, 2, 0.65], [68, 38, 3, 0.15], [78, 66, 2, 0.9], [88, 45, 2, 0.45], [18, 22, 2, 0.7], [82, 20, 3, 0.3]].map(([x, y, s, d]) => ({ x, y, s, d }));

const SESSION_KEY = 'dawat-intro-seen';

/**
 * Short logo-only brand intro (~2.4 s incl. exit; admin-configurable 1.5–3 s). No characters, no 3D.
 * Shown at most once per browser session (viewed OR skipped), never on page navigation, never with reduced motion,
 * and never when the admin turns it off. Returning visitors skip it unless the restaurant turns that on.
 * `?intro=preview` always shows it.
 */
function shouldShow(): { show: boolean; duration: number } {
  const w = useStorefront.getState().website;
  const duration = Math.min(3000, Math.max(2000, w?.intro_duration_ms ?? 2400));
  try {
    if (new URLSearchParams(location.search).get('intro') === 'preview') return { show: true, duration };
    if (w && !w.intro_enabled) return { show: false, duration };
    if (sessionStorage.getItem(SESSION_KEY) === '1') return { show: false, duration };
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return { show: false, duration };
    const returning = localStorage.getItem(VISITED_KEY) === '1';
    if (returning && !(w?.intro_for_returning ?? false)) return { show: false, duration };
  } catch {
    /* storage blocked — show the short intro */
  }
  return { show: true, duration };
}

/** Waits (max 0.9 s, behind a plain dark cover) for the admin's intro settings so a disabled intro never flashes. */
export function Intro() {
  const website = useStorefront((s) => s.website);
  const [ready, setReady] = useState(() => !!website || !backendConfigured);
  useEffect(() => {
    if (website) { setReady(true); return; }
    const t = window.setTimeout(() => setReady(true), 900);
    return () => window.clearTimeout(t);
  }, [website]);
  if (!ready) return <div className="fixed inset-0 z-[100] bg-smoke" aria-hidden />;
  return <IntroRun />;
}

function IntroRun() {
  const setIntroDone = useUI((s) => s.setIntroDone);
  const [{ show, duration }] = useState(shouldShow);
  const [visible, setVisible] = useState(show);
  const k = duration / 2400; // timeline scale
  const exitS = 0.5 * k;

  const finish = useCallback(() => {
    setVisible(false);
    try {
      localStorage.setItem(VISITED_KEY, '1');
      sessionStorage.setItem(SESSION_KEY, '1');
    } catch {
      /* private mode */
    }
  }, []);

  useEffect(() => {
    if (!show) {
      setIntroDone();
      return;
    }
    lockScroll(true);
    const t = window.setTimeout(finish, duration - exitS * 1000);
    // hard safety net: scrolling always comes back, even if an animation fails
    const safety = window.setTimeout(() => lockScroll(false), duration + 1500);
    return () => {
      window.clearTimeout(t);
      window.clearTimeout(safety);
      lockScroll(false);
    };
  }, [show, duration, exitS, finish, setIntroDone]);

  if (!show) return null;

  return (
    <AnimatePresence
      onExitComplete={() => {
        lockScroll(false);
        setIntroDone();
      }}
    >
      {visible && (
        <motion.div
          key="intro"
          role="dialog"
          aria-label={`${restaurant.name} — intro`}
          className="fixed inset-0 z-[100] overflow-hidden bg-smoke"
          exit={{ opacity: 0 }}
          transition={{ duration: exitS * 0.6, delay: exitS * 0.4, ease }}
        >
          {/* deep royal-maroon backdrop with a soft golden light behind the logo */}
          <div className="absolute inset-0" style={{ background: 'radial-gradient(70% 55% at 50% 48%, #3a0f1a 0%, #1c0810 55%, #0b0306 100%)' }} aria-hidden />
          <motion.div
            className="absolute left-1/2 top-1/2 h-[70vmin] w-[70vmin] -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{ background: 'radial-gradient(closest-side, rgba(212,175,55,0.28), rgba(212,175,55,0.08) 55%, transparent 72%)' }}
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1.1 * k, ease }}
            aria-hidden
          />
          {/* a few slow golden motes (CSS only, 10 elements) */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
            {MOTES.map((m, i) => (
              <span key={i} className="intro-mote absolute rounded-full bg-[#f3d98b]" style={{ left: `${m.x}%`, top: `${m.y}%`, width: m.s, height: m.s, animationDelay: `${m.d * k}s`, animationDuration: `${1.6 * k}s` }} />
            ))}
          </div>

          {/* the logo and words leave first, then the backdrop dissolves into the homepage (no overlapping text) */}
          <motion.div
            className="relative flex h-full flex-col items-center justify-center px-6 text-center"
            exit={{ opacity: 0, scale: 1.04 }}
            transition={{ duration: exitS * 0.5, ease }}
          >
            <motion.div
              className="relative"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.9 * k, ease, delay: 0.15 * k }}
            >
              <div className="relative h-40 w-40 overflow-hidden rounded-full shadow-[0_0_70px_rgba(212,175,55,0.4)] ring-1 ring-[#D4AF37]/60 sm:h-52 sm:w-52">
                <img src={asset('assets/images/logo.png')} alt={`${restaurant.name} logo`} className="h-full w-full" fetchPriority="high" />
                <motion.span
                  aria-hidden
                  className="pointer-events-none absolute inset-0"
                  style={{ background: 'linear-gradient(110deg, transparent 38%, rgba(255,241,196,0.38) 50%, transparent 62%)' }}
                  initial={{ x: '-120%' }}
                  animate={{ x: '120%' }}
                  transition={{ duration: 0.8 * k, ease: 'easeInOut', delay: 0.9 * k }}
                />
              </div>
            </motion.div>

            <motion.h1
              className="mt-9 font-display text-3xl font-semibold tracking-wide text-ivory sm:text-5xl"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7 * k, ease, delay: 0.7 * k }}
            >
              {restaurant.name}
            </motion.h1>
            <motion.div
              aria-hidden
              className="mt-4 h-px w-40 bg-gradient-to-r from-transparent via-[#D4AF37] to-transparent"
              initial={{ scaleX: 0, opacity: 0 }}
              animate={{ scaleX: 1, opacity: 1 }}
              transition={{ duration: 0.7 * k, ease, delay: 1.0 * k }}
            />
            <motion.p
              className="t-eyebrow mt-4 text-gold"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6 * k, ease, delay: 1.15 * k }}
            >
              {restaurant.tagline}
            </motion.p>
          </motion.div>

          <button type="button" onClick={finish} className="btn btn-ghost absolute right-4 top-4 z-10 min-h-[44px] px-5 sm:right-8 sm:top-8" aria-label="Skip intro">
            Skip intro
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
