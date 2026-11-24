import type { ReactNode } from 'react';
import type { Diet } from '../../data/types';
import { GoldDivider, SplitReveal, Reveal } from '../motion/Motion';

export function DietMark({ diet, className = '' }: { diet: Diet; className?: string }) {
  if (diet === 'unconfirmed') return null;
  const veg = diet === 'veg';
  return (
    <span
      className={`diet-mark ${veg ? 'text-cardamom' : 'nonveg text-chilli'} bg-white/95 ${className}`}
      role="img"
      aria-label={veg ? 'Vegetarian' : 'Non-vegetarian'}
      title={veg ? 'Vegetarian' : 'Non-vegetarian'}
    />
  );
}

export function SectionHeading({
  eyebrow,
  title,
  accent,
  intro,
  align = 'left',
  devanagari,
}: {
  eyebrow: string;
  title: string;
  accent?: string;
  intro?: ReactNode;
  align?: 'left' | 'center';
  devanagari?: string;
}) {
  const center = align === 'center';
  return (
    <header className={`relative ${center ? 'mx-auto text-center' : ''} max-w-3xl`}>
      {devanagari && (
        <span
          lang="mr"
          aria-hidden
          className={`pointer-events-none absolute -top-10 select-none font-deva text-[clamp(4rem,12vw,9rem)] font-bold leading-none text-gold/[0.06] ${center ? 'left-1/2 -translate-x-1/2' : '-left-2'}`}
        >
          {devanagari}
        </span>
      )}
      <Reveal>
        <p className={`t-eyebrow flex items-center gap-3 text-gold ${center ? 'justify-center' : ''}`}>
          <span className="h-px w-8 bg-gold/60" aria-hidden />
          {eyebrow}
          {center && <span className="h-px w-8 bg-gold/60" aria-hidden />}
        </p>
      </Reveal>
      <h2 className="t-h2 relative mt-4 font-display font-medium text-ivory">
        <SplitReveal text={title} />
        {accent && (
          <>
            {' '}
            <SplitReveal text={accent} wordClassName="italic text-gold-gradient pr-[0.06em]" delay={0.15} />
          </>
        )}
      </h2>
      <GoldDivider className={`mt-5 ${center ? 'mx-auto' : ''}`} />
      {intro && (
        <Reveal delay={0.1}>
          <div className="mt-5 text-base leading-relaxed text-ivory/70 sm:text-lg">{intro}</div>
        </Reveal>
      )}
    </header>
  );
}

export function QtyStepper({
  value,
  onChange,
  min = 1,
  max = 50,
  label,
  size = 'md',
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  label: string;
  size?: 'sm' | 'md';
}) {
  const btn = size === 'sm' ? 'h-9 w-9' : 'h-11 w-11';
  return (
    <div className="inline-flex items-center rounded-full bg-ivory/5 ring-1 ring-gold/30" role="group" aria-label={label}>
      <button
        type="button"
        className={`${btn} grid place-items-center rounded-full text-lg text-ivory transition hover:bg-gold/15 disabled:opacity-35`}
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        aria-label={`Decrease ${label}`}
      >
        −
      </button>
      <span className="min-w-8 text-center font-num font-semibold tabular-nums" aria-live="polite">
        {value}
      </span>
      <button
        type="button"
        className={`${btn} grid place-items-center rounded-full text-lg text-ivory transition hover:bg-gold/15 disabled:opacity-35`}
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        aria-label={`Increase ${label}`}
      >
        +
      </button>
    </div>
  );
}

export function PromoLabel({ className = '' }: { className?: string }) {
  return (
    <span
      className={`rounded-full bg-black/55 px-2 py-0.5 text-[9.5px] uppercase tracking-[0.16em] text-ivory/75 backdrop-blur ${className}`}
    >
      Promotional artwork
    </span>
  );
}

/** WhatsApp glyph (Lucide has no brand icons). */
export function WhatsAppIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12.04 2C6.55 2 2.1 6.45 2.1 11.94c0 1.75.46 3.46 1.33 4.97L2 22l5.23-1.37a9.9 9.9 0 0 0 4.8 1.23h.01c5.49 0 9.94-4.45 9.94-9.94A9.93 9.93 0 0 0 12.04 2Zm0 18.18h-.01a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.1.81.83-3.03-.2-.31a8.23 8.23 0 1 1 6.97 3.86Zm4.52-6.16c-.25-.12-1.47-.72-1.7-.8-.23-.09-.39-.13-.56.12-.16.25-.64.8-.79.97-.14.16-.29.18-.54.06-.25-.12-1.05-.39-2-1.23-.74-.66-1.24-1.47-1.38-1.72-.15-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.12-.15.16-.25.25-.42.08-.16.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.42h-.48c-.16 0-.43.06-.66.31-.23.25-.87.85-.87 2.07s.89 2.4 1.01 2.56c.12.16 1.75 2.67 4.24 3.75.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.15-1.18-.06-.1-.22-.16-.47-.29Z" />
    </svg>
  );
}

export function InstagramIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4.2" />
      <circle cx="17.4" cy="6.6" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function YouTubeIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M21.6 7.2a2.5 2.5 0 0 0-1.76-1.77C18.3 5 12 5 12 5s-6.3 0-7.84.43A2.5 2.5 0 0 0 2.4 7.2 26 26 0 0 0 2 12a26 26 0 0 0 .4 4.8 2.5 2.5 0 0 0 1.76 1.77C5.7 19 12 19 12 19s6.3 0 7.84-.43a2.5 2.5 0 0 0 1.76-1.77A26 26 0 0 0 22 12a26 26 0 0 0-.4-4.8ZM10 15V9l5.2 3L10 15Z" />
    </svg>
  );
}

export function GoogleIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path fill="#EA4335" d="M12 10.2v3.9h5.4c-.24 1.4-1.66 4.1-5.4 4.1a6.2 6.2 0 0 1 0-12.4c1.9 0 3.2.8 3.9 1.5l2.7-2.6A9.6 9.6 0 0 0 12 2.2a9.8 9.8 0 1 0 0 19.6c5.6 0 9.4-4 9.4-9.6 0-.6-.06-1.1-.16-1.6H12Z" />
    </svg>
  );
}
