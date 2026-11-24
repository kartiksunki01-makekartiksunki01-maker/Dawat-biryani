import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useState } from 'react';
import { restaurant } from '../../data/restaurant';
import { useStorefront } from '../../data/menuSync';
import { useUI } from '../../stores/uiStore';
import { asset } from '../../utils/format';
import { lockScroll } from '../../utils/scroll';

const VISITED_KEY = 'dawat-visited-v2';
const ease = [0.22, 1, 0.36, 1] as const;

/**
 * Short cinematic intro (~1.8 s incl. exit, admin-configurable 1–3 s).
 * Never waits for the 3D scene — the page loads underneath and can be used as soon as it fades.
 * Returning visitors skip it (unless the restaurant turns that on). `?intro=preview` always shows it.
 */
function shouldShow(): { show: boolean; duration: number } {
  const w = useStorefront.getState().website;
  const duration = Math.min(3000, Math.max(1000, w?.intro_duration_ms ?? 1800));
  try {
    if (new URLSearchParams(location.search).get('intro') === 'preview') return { show: true, duration };
    if (w && !w.intro_enabled) return { show: false, duration };
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return { show: false, duration };
    const returning = localStorage.getItem(VISITED_KEY) === '1';
    if (returning && !(w?.intro_for_returning ?? false)) return { show: false, duration };
  } catch {
    /* storage blocked — show the short intro */
  }
  return { show: true, duration };
}

function HandiSilhouette({ k }: { k: number }) {
  return (
    <motion.svg
      viewBox="0 0 240 200"
      className="absolute bottom-[-6vh] left-1/2 w-[min(70vw,420px)] -translate-x-1/2"
      initial={{ y: 60, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.45 * k, ease, delay: 0.3 * k }}
      aria-hidden
    >
      <defs>
        <linearGradient id="hs" x1="0" x2="1">
          <stop offset="0" stopColor="#3b2412" />
          <stop offset="0.5" stopColor="#7a5220" />
          <stop offset="1" stopColor="#2a190d" />
        </linearGradient>
      </defs>
      {[0, 1, 2].map((i) => (
        <motion.path
          key={i}
          d={`M${100 + i * 16} 70 C ${82 + i * 16} 50, ${128 + i * 8} 38, ${108 + i * 14} 14`}
          stroke="#fff1d2"
          strokeOpacity="0.16"
          strokeWidth="11"
          strokeLinecap="round"
          fill="none"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: [0, 0.8, 0.2], y: -18 }}
          transition={{ duration: 0.9 * k, delay: (0.45 + i * 0.1) * k, ease: 'easeOut' }}
        />
      ))}
      <path d="M58 92 Q120 70 182 92 L176 98 Q120 80 64 98Z" fill="#c9953e" />
      <path
        d="M66 98 Q120 84 174 98 C186 118 206 136 196 164 C186 190 150 200 120 200 C90 200 54 190 44 164 C34 136 54 118 66 98Z"
        fill="url(#hs)"
        stroke="#D4AF37"
        strokeOpacity="0.55"
      />
    </motion.svg>
  );
}

export function Intro() {
  const setIntroDone = useUI((s) => s.setIntroDone);
  const [{ show, duration }] = useState(shouldShow);
  const [visible, setVisible] = useState(show);
  const k = duration / 1800; // timeline scale
  const exitS = 0.45 * k;

  const finish = useCallback(() => {
    setVisible(false);
    try {
      localStorage.setItem(VISITED_KEY, '1');
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
          exit={{ opacity: 0, scale: 1.03 }}
          transition={{ duration: exitS, ease }}
        >
          <motion.div
            className="absolute inset-0"
            style={{
              background:
                'radial-gradient(60% 50% at 50% 55%, rgba(245,158,11,0.22), transparent 70%), radial-gradient(40% 30% at 50% 100%, rgba(220,38,38,0.18), transparent 70%)',
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.35 * k }}
          />
          <svg
            className="absolute left-1/2 top-1/2 h-[86vh] w-[min(80vw,620px)] -translate-x-1/2 -translate-y-1/2 text-gold/40"
            viewBox="0 0 200 260"
            fill="none"
            preserveAspectRatio="none"
            aria-hidden
          >
            <motion.path
              d="M10 258 V140 C10 92 64 86 100 6 C136 86 190 92 190 140 V258"
              stroke="currentColor"
              strokeWidth="0.6"
              vectorEffect="non-scaling-stroke"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.8 * k, ease: 'easeInOut' }}
            />
          </svg>

          <div className="relative flex h-full flex-col items-center justify-center px-6 text-center">
            <motion.div
              className="relative"
              initial={{ opacity: 0, scale: 0.86 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.35 * k, ease }}
            >
              <div className="relative h-36 w-36 overflow-hidden rounded-full shadow-[0_0_60px_rgba(212,175,55,0.35)] sm:h-44 sm:w-44">
                <img src={asset('assets/images/logo.png')} alt={`${restaurant.name} logo`} className="h-full w-full" />
                <motion.span
                  aria-hidden
                  className="pointer-events-none absolute inset-0"
                  style={{ background: 'linear-gradient(110deg, transparent 38%, rgba(255,241,196,0.3) 50%, transparent 62%)' }}
                  initial={{ x: '-120%' }}
                  animate={{ x: '120%' }}
                  transition={{ duration: 0.6 * k, ease: 'easeInOut', delay: 0.2 * k }}
                />
              </div>
            </motion.div>

            <motion.h1
              className="mt-10 font-display text-4xl font-semibold text-ivory sm:text-6xl"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45 * k, ease, delay: 0.8 * k }}
            >
              {restaurant.name}
            </motion.h1>
            <motion.p
              className="t-eyebrow mt-4 text-gold"
              initial={{ opacity: 0, letterSpacing: '0.5em' }}
              animate={{ opacity: 1, letterSpacing: '0.32em' }}
              transition={{ duration: 0.45 * k, ease, delay: 0.95 * k }}
            >
              {restaurant.tagline}
            </motion.p>
          </div>

          <HandiSilhouette k={k} />

          <button type="button" onClick={finish} className="btn btn-ghost btn-sm absolute right-4 top-4 z-10 sm:right-8 sm:top-8">
            Skip intro
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
