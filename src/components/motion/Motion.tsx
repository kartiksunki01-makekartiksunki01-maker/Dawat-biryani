import {
  animate,
  motion,
  useInView,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  type HTMLMotionProps,
} from 'framer-motion';
import { useEffect, useRef, type ElementType, type PointerEvent, type ReactNode } from 'react';

const ease = [0.22, 1, 0.36, 1] as const;

/**
 * Number that glides to its new value (≈0.35 s). Screen readers get the final value only; reduced motion snaps.
 * The visible digits are written straight to the DOM so React never fights the animation.
 */
export function CountUp({ value, format, className = '', label }: { value: number; format: (n: number) => string; className?: string; label?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef(value);
  const reduced = useReducedMotion();
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduced || shown.current === value) {
      el.textContent = format(value);
      shown.current = value;
      return;
    }
    const c = animate(shown.current, value, {
      duration: 0.35,
      ease,
      onUpdate: (v) => {
        shown.current = v;
        el.textContent = format(Math.round(v));
      },
      onComplete: () => {
        shown.current = value;
        el.textContent = format(value);
      },
    });
    return () => c.stop();
  }, [value, format, reduced]);
  return (
    <span className={className}>
      <span ref={ref} aria-hidden data-countup={value} />
      <span className="sr-only">{label ? `${label} ` : ''}{format(value)}</span>
    </span>
  );
}

/** Staggered word-by-word masked heading reveal. */
export function SplitReveal({
  text,
  as: Tag = 'span',
  className = '',
  wordClassName = '',
  delay = 0,
  stagger = 0.06,
}: {
  text: string;
  as?: ElementType;
  className?: string;
  /** applied to each word — use for gradient text (background-clip can't reach transformed children) */
  wordClassName?: string;
  delay?: number;
  stagger?: number;
}) {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, margin: '0px 0px -10% 0px' });
  const reduced = useReducedMotion();
  const words = text.split(' ');
  return (
    <Tag ref={ref} className={className} aria-label={text}>
      {words.map((w, i) => (
        <span key={i} aria-hidden className="inline-block overflow-hidden pb-[0.12em] -mb-[0.12em] align-bottom">
          <motion.span
            className={`inline-block will-change-transform ${wordClassName}`}
            initial={reduced ? false : { y: '110%' }}
            animate={inView ? { y: '0%' } : undefined}
            transition={{ duration: 0.95, ease, delay: delay + i * stagger }}
          >
            {w}
            {i < words.length - 1 ? ' ' : ''}
          </motion.span>
        </span>
      ))}
    </Tag>
  );
}

/** Character-level reveal (used for the brand name in the intro). */
export function SplitChars({ text, className = '', delay = 0 }: { text: string; className?: string; delay?: number }) {
  return (
    <span className={className} aria-label={text}>
      {[...text].map((ch, i) => (
        <motion.span
          key={i}
          aria-hidden
          className="inline-block"
          initial={{ opacity: 0, y: '0.45em' }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease, delay: delay + i * 0.07 }}
        >
          {ch === ' ' ? ' ' : ch}
        </motion.span>
      ))}
    </span>
  );
}

/** Fade + rise when scrolled into view. */
export function Reveal({
  children,
  delay = 0,
  y = 28,
  className = '',
  ...rest
}: { children: ReactNode; delay?: number; y?: number; className?: string } & HTMLMotionProps<'div'>) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduced ? false : { opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -8% 0px' }}
      transition={{ duration: 0.9, ease, delay }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

/** Gold ornamental divider that draws itself. */
export function GoldDivider({ className = '', width = 260 }: { className?: string; width?: number }) {
  const reduced = useReducedMotion();
  const draw = {
    initial: reduced ? false : { pathLength: 0, opacity: 0 },
    whileInView: { pathLength: 1, opacity: 1 },
    viewport: { once: true },
  } as const;
  return (
    <svg
      className={className}
      width={width}
      height="22"
      viewBox="0 0 260 22"
      fill="none"
      aria-hidden
      role="presentation"
    >
      <motion.path d="M4 11 H104" stroke="url(#gd-l)" strokeWidth="1" {...draw} transition={{ duration: 1.2, ease }} />
      <motion.path d="M156 11 H256" stroke="url(#gd-r)" strokeWidth="1" {...draw} transition={{ duration: 1.2, ease }} />
      <motion.path
        d="M130 2 C136 8 140 10 148 11 C140 12 136 14 130 20 C124 14 120 12 112 11 C120 10 124 8 130 2Z"
        stroke="#D4AF37"
        strokeWidth="1.1"
        {...draw}
        transition={{ duration: 1.4, ease, delay: 0.2 }}
      />
      <circle cx="130" cy="11" r="2" fill="#D4AF37" />
      <circle cx="108" cy="11" r="1.4" fill="#D4AF37" />
      <circle cx="152" cy="11" r="1.4" fill="#D4AF37" />
      <defs>
        <linearGradient id="gd-l" x1="4" x2="104" y1="0" y2="0" gradientUnits="userSpaceOnUse">
          <stop stopColor="#D4AF37" stopOpacity="0" />
          <stop offset="1" stopColor="#D4AF37" />
        </linearGradient>
        <linearGradient id="gd-r" x1="156" x2="256" y1="0" y2="0" gradientUnits="userSpaceOnUse">
          <stop stopColor="#D4AF37" />
          <stop offset="1" stopColor="#D4AF37" stopOpacity="0" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/** Magnetic hover for desktop pointers. */
export function Magnetic({ children, strength = 0.25, className = '' }: { children: ReactNode; strength?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const x = useSpring(0, { stiffness: 220, damping: 18 });
  const y = useSpring(0, { stiffness: 220, damping: 18 });
  const onMove = (e: PointerEvent) => {
    if (reduced || e.pointerType !== 'mouse' || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    x.set((e.clientX - (r.left + r.width / 2)) * strength);
    y.set((e.clientY - (r.top + r.height / 2)) * strength);
  };
  const reset = () => {
    x.set(0);
    y.set(0);
  };
  return (
    <motion.div ref={ref} className={`inline-flex ${className}`} style={{ x, y }} onPointerMove={onMove} onPointerLeave={reset}>
      {children}
    </motion.div>
  );
}

/** Perspective tilt + cursor spotlight (sets --mx/--my for CSS). */
export function Tilt({ children, className = '', max = 7 }: { children: ReactNode; className?: string; max?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const rx = useSpring(0, { stiffness: 180, damping: 20 });
  const ry = useSpring(0, { stiffness: 180, damping: 20 });
  const onMove = (e: PointerEvent) => {
    const el = ref.current;
    if (!el || reduced || e.pointerType !== 'mouse') return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    ry.set((px - 0.5) * max * 2);
    rx.set(-(py - 0.5) * max * 2);
    el.style.setProperty('--mx', `${px * 100}%`);
    el.style.setProperty('--my', `${py * 100}%`);
  };
  const reset = () => {
    rx.set(0);
    ry.set(0);
  };
  return (
    <motion.div
      ref={ref}
      className={className}
      style={{ rotateX: rx, rotateY: ry, transformPerspective: 900 }}
      onPointerMove={onMove}
      onPointerLeave={reset}
    >
      {children}
    </motion.div>
  );
}

/** Thin gold reading-progress bar at the top of the page. */
export function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 120, damping: 30 });
  return (
    <motion.div
      aria-hidden
      className="fixed inset-x-0 top-0 z-[70] h-[2px] origin-left bg-gradient-to-r from-saffron via-gold to-ivory"
      style={{ scaleX }}
    />
  );
}

/** Image that reveals with a clip-path curtain and drifts with scroll. */
export function ImageReveal({
  src,
  alt,
  className = '',
  imgClassName = '',
  label,
}: {
  src: string;
  alt: string;
  className?: string;
  imgClassName?: string;
  label?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const y = useTransform(scrollYProgress, [0, 1], reduced ? ['0%', '0%'] : ['-6%', '6%']);
  return (
    <motion.div
      ref={ref}
      className={`relative overflow-hidden ${className}`}
      initial={reduced ? false : { clipPath: 'inset(100% 0% 0% 0%)' }}
      whileInView={{ clipPath: 'inset(0% 0% 0% 0%)' }}
      viewport={{ once: true, margin: '0px 0px -10% 0px' }}
      transition={{ duration: 1.3, ease }}
    >
      <motion.img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        style={{ y, scale: 1.14 }}
        className={`h-full w-full object-cover ${imgClassName}`}
      />
      {label && (
        <span className="absolute bottom-3 left-3 rounded-full bg-black/55 px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-ivory/80 backdrop-blur">
          {label}
        </span>
      )}
    </motion.div>
  );
}

/** Golden light sweep across its parent (parent must be relative + overflow-hidden). */
export function LightSweep({ delay = 0, repeatDelay = 6 }: { delay?: number; repeatDelay?: number }) {
  const reduced = useReducedMotion();
  if (reduced) return null;
  return (
    <motion.span
      aria-hidden
      className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 bg-gradient-to-r from-transparent via-[#fff1c4]/40 to-transparent mix-blend-overlay"
      initial={{ x: '-100%' }}
      animate={{ x: '450%' }}
      transition={{ duration: 1.6, ease: 'easeInOut', delay, repeat: Infinity, repeatDelay }}
    />
  );
}

/** Royal arch / onion-dome outline used as an ornamental frame. */
export function ArchOutline({ className = '', strokeWidth = 1 }: { className?: string; strokeWidth?: number }) {
  return (
    <svg className={className} viewBox="0 0 200 260" fill="none" aria-hidden preserveAspectRatio="none">
      <path
        d="M10 258 V140 C10 92 64 86 100 6 C136 86 190 92 190 140 V258"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        vectorEffect="non-scaling-stroke"
      />
      <path
        d="M22 258 V144 C22 102 70 96 100 26 C130 96 178 102 178 144 V258"
        stroke="currentColor"
        strokeOpacity="0.45"
        strokeWidth={strokeWidth}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

