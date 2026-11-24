import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';
import { restaurant } from '../../data/restaurant';
import { useUI } from '../../stores/uiStore';
import { asset } from '../../utils/format';
import { lockScroll } from '../../utils/scroll';
import { SplitChars } from '../motion/Motion';

const SEEN_KEY = 'dawat-intro-seen';
const ease = [0.22, 1, 0.36, 1] as const;

/** 2D canvas of floating golden dust — cheap, independent of WebGL. */
function DustCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!;
    const g = c.getContext('2d')!;
    let raf = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const resize = () => {
      c.width = window.innerWidth * dpr;
      c.height = window.innerHeight * dpr;
    };
    resize();
    window.addEventListener('resize', resize);
    // 40 slow particles; glow is pre-rendered ONCE into a sprite (shadowBlur per frame was the lag)
    const sprite = document.createElement('canvas');
    sprite.width = sprite.height = 32;
    const sg = sprite.getContext('2d')!;
    const grad = sg.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, 'rgba(255, 226, 140, 1)');
    grad.addColorStop(0.35, 'rgba(245, 180, 60, 0.55)');
    grad.addColorStop(1, 'rgba(245, 158, 11, 0)');
    sg.fillStyle = grad;
    sg.fillRect(0, 0, 32, 32);
    const parts = Array.from({ length: 40 }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: 4 + Math.random() * 7,
      vx: (Math.random() - 0.5) * 0.00006,
      vy: -0.00006 - Math.random() * 0.00012,
      tw: Math.random() * Math.PI * 2,
    }));
    const start = performance.now();
    let last = start;
    const tick = (now: number) => {
      const dt = Math.min(48, now - last); // time-based so speed is steady at any fps
      last = now;
      const t = (now - start) / 1000;
      const fade = Math.min(1, t / 2.2);
      g.clearRect(0, 0, c.width, c.height);
      for (const p of parts) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.y < -0.03) p.y = 1.03;
        g.globalAlpha = (0.3 + 0.5 * (0.5 + 0.5 * Math.sin(t * 0.9 + p.tw))) * fade;
        const s = p.r * dpr * 2;
        g.drawImage(sprite, p.x * c.width - s / 2, p.y * c.height - s / 2, s, s);
      }
      g.globalAlpha = 1;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);
  return <canvas ref={ref} className="absolute inset-0 h-full w-full" aria-hidden />;
}

function HandiSilhouette() {
  return (
    <motion.svg
      viewBox="0 0 240 200"
      className="absolute bottom-[-6vh] left-1/2 w-[min(70vw,420px)] -translate-x-1/2"
      initial={{ y: 80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 2, ease, delay: 3.6 }}
      aria-hidden
    >
      <defs>
        <linearGradient id="hs" x1="0" x2="1">
          <stop offset="0" stopColor="#3b2412" />
          <stop offset="0.5" stopColor="#7a5220" />
          <stop offset="1" stopColor="#2a190d" />
        </linearGradient>
      </defs>
      {/* steam: soft wide strokes, opacity-only (no filter:blur, no path-length redraw) */}
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
          animate={{ opacity: [0, 0.8, 0], y: -26 }}
          transition={{ duration: 3.4, delay: 4.8 + i * 0.5, repeat: Infinity, ease: 'easeInOut' }}
        />
      ))}
      <path d="M58 92 Q120 70 182 92 L176 98 Q120 80 64 98Z" fill="#c9953e" />
      <path
        d="M66 98 Q120 84 174 98 C186 118 206 136 196 164 C186 190 150 200 120 200 C90 200 54 190 44 164 C34 136 54 118 66 98Z"
        fill="url(#hs)"
        stroke="#D4AF37"
        strokeOpacity="0.55"
      />
      <path d="M48 130 Q120 118 192 130" stroke="#D4AF37" strokeOpacity="0.5" fill="none" />
    </motion.svg>
  );
}

export function Intro() {
  const setIntroDone = useUI((s) => s.setIntroDone);
  const sceneReady = useUI((s) => s.sceneReady);
  const [visible, setVisible] = useState(true);
  const [short] = useState(() => {
    try {
      return (
        sessionStorage.getItem(SEEN_KEY) === '1' || window.matchMedia('(prefers-reduced-motion: reduce)').matches
      );
    } catch {
      return false;
    }
  });
  const [timelineDone, setTimelineDone] = useState(false);
  const [waited, setWaited] = useState(false);

  const finish = useCallback(() => {
    setVisible(false);
    try {
      sessionStorage.setItem(SEEN_KEY, '1');
    } catch {
      /* private mode */
    }
  }, []);

  useEffect(() => {
    lockScroll(true);
    // calmer pacing: ~6.4 s of story, then hold until the 3D scene is really ready
    const t1 = window.setTimeout(() => setTimelineDone(true), short ? 900 : 6400);
    // never hold visitors hostage to a slow GPU — cap the wait
    const t2 = window.setTimeout(() => setWaited(true), short ? 2500 : 10000);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [short]);

  useEffect(() => {
    if (visible && timelineDone && (sceneReady || waited)) finish();
  }, [visible, timelineDone, sceneReady, waited, finish]);

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
          transition={{ duration: short ? 0.5 : 1.3, ease }}
        >
          {!short && <DustCanvas />}
          {/* amber atmosphere */}
          <motion.div
            className="absolute inset-0"
            style={{
              background:
                'radial-gradient(60% 50% at 50% 55%, rgba(245,158,11,0.22), transparent 70%), radial-gradient(40% 30% at 50% 100%, rgba(220,38,38,0.18), transparent 70%)',
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: short ? 0.3 : 2.4 }}
          />
          {/* royal arch silhouette */}
          {!short && (
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
                transition={{ duration: 3.4, ease: 'easeInOut' }}
              />
              <motion.path
                d="M22 258 V144 C22 102 70 96 100 26 C130 96 178 102 178 144 V258"
                stroke="currentColor"
                strokeOpacity="0.4"
                strokeWidth="0.6"
                vectorEffect="non-scaling-stroke"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 3.6, ease: 'easeInOut', delay: 0.3 }}
              />
            </svg>
          )}
          {/* smoke */}
          <div className="absolute inset-x-0 bottom-0 h-1/2 bg-[radial-gradient(70%_60%_at_50%_100%,rgba(255,241,210,0.07),transparent)]" />

          <div className="relative flex h-full flex-col items-center justify-center px-6 text-center">
            <motion.div
              className="relative"
              initial={{ opacity: 0, scale: 0.82 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: short ? 0.4 : 2, ease, delay: short ? 0 : 1.2 }}
            >
              {/* ornamental ring */}
              <svg className="absolute -inset-5 h-[calc(100%+2.5rem)] w-[calc(100%+2.5rem)]" viewBox="0 0 100 100" aria-hidden>
                <motion.circle
                  cx="50"
                  cy="50"
                  r="48"
                  fill="none"
                  stroke="#D4AF37"
                  strokeWidth="0.4"
                  strokeDasharray="1 2.2"
                  initial={{ pathLength: 0, rotate: -90 }}
                  animate={{ pathLength: 1, rotate: 0 }}
                  transition={{ duration: short ? 0.5 : 2.4, ease, delay: short ? 0 : 1.8 }}
                />
              </svg>
              <div className="relative h-36 w-36 overflow-hidden rounded-full shadow-[0_0_60px_rgba(212,175,55,0.35)] sm:h-44 sm:w-44">
                <img src={asset('assets/images/logo.png')} alt={`${restaurant.name} logo`} className="h-full w-full" />
                {/* shine: plain transform-only sweep (mask + blend-mode removed — they forced repaints) */}
                {!short && (
                  <motion.span
                    aria-hidden
                    className="pointer-events-none absolute inset-0"
                    style={{
                      background: 'linear-gradient(110deg, transparent 38%, rgba(255,241,196,0.28) 50%, transparent 62%)',
                    }}
                    initial={{ x: '-120%' }}
                    animate={{ x: '120%' }}
                    transition={{ duration: 2, ease: 'easeInOut', delay: 2.8 }}
                  />
                )}
              </div>
            </motion.div>

            <h1 className="mt-10 font-display text-4xl font-semibold text-ivory sm:text-6xl">
              {short ? restaurant.name : <SplitChars text={restaurant.name} delay={2.8} />}
            </h1>
            <motion.p
              className="t-eyebrow mt-4 text-gold"
              initial={{ opacity: 0, letterSpacing: '0.6em' }}
              animate={{ opacity: 1, letterSpacing: '0.32em' }}
              transition={{ duration: 1.8, ease, delay: short ? 0.15 : 3.9 }}
            >
              {restaurant.tagline}
            </motion.p>
            <motion.p
              className="mt-3 font-deva text-sm text-ivory/50"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 1.4, delay: short ? 0.2 : 4.6 }}
              lang="mr"
            >
              दावत मध्ये आपले स्वागत आहे
            </motion.p>
            {timelineDone && !sceneReady && !waited && (
              <motion.p
                className="mt-8 text-xs tracking-[0.2em] text-ivory/50 uppercase"
                initial={{ opacity: 0 }}
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 1.6, repeat: Infinity }}
                role="status"
              >
                Preparing the dum…
              </motion.p>
            )}
          </div>

          {!short && <HandiSilhouette />}

          <button
            type="button"
            onClick={finish}
            className="btn btn-ghost btn-sm absolute right-4 top-4 z-10 sm:right-8 sm:top-8"
          >
            Skip intro
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
