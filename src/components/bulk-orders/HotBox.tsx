import { motion } from 'framer-motion';
import { restaurant } from '../../data/restaurant';
import { Reveal } from '../motion/Motion';

/** Illustrated (not photographic) hot-box showcase. Warmth duration only shown once verified. */
export function HotBox() {
  const { verified, warmHours } = restaurant.hotBox;
  return (
    <Reveal className="mt-20">
      <div className="relative grid items-center gap-10 overflow-hidden rounded-[2.25rem] bg-gradient-to-br from-emerald via-[#0a2a19] to-smoke p-8 ring-1 ring-gold/30 sm:p-12 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="bg-jali pointer-events-none absolute inset-0 opacity-60" aria-hidden />
        <svg viewBox="0 0 320 240" className="relative mx-auto w-full max-w-sm" role="img" aria-label="Illustration of an insulated hot box with steam">
          <defs>
            <linearGradient id="hb-body" x1="0" x2="1">
              <stop offset="0" stopColor="#4a0909" />
              <stop offset="0.5" stopColor="#7a1212" />
              <stop offset="1" stopColor="#3a0707" />
            </linearGradient>
            <linearGradient id="hb-lid" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="#f4d77e" />
              <stop offset="1" stopColor="#b38a26" />
            </linearGradient>
          </defs>
          {[0, 1, 2].map((i) => (
            <motion.path
              key={i}
              d={`M${130 + i * 30} 70 C ${118 + i * 30} 50, ${146 + i * 30} 40, ${132 + i * 30} 14`}
              stroke="#FFF1D2"
              strokeOpacity="0.45"
              strokeWidth="5"
              strokeLinecap="round"
              fill="none"
              animate={{ y: [8, -8], opacity: [0, 0.9, 0] }}
              transition={{ duration: 2.6, repeat: Infinity, delay: i * 0.6 }}
            />
          ))}
          <rect x="60" y="92" width="200" height="120" rx="22" fill="url(#hb-body)" stroke="#D4AF37" strokeOpacity="0.7" />
          <rect x="52" y="76" width="216" height="28" rx="12" fill="url(#hb-lid)" />
          <rect x="140" y="64" width="40" height="14" rx="6" fill="#b38a26" />
          <path d="M80 150 H240" stroke="#D4AF37" strokeOpacity="0.5" strokeDasharray="4 6" />
          <circle cx="160" cy="152" r="22" fill="none" stroke="#D4AF37" strokeOpacity="0.8" />
          <path d="M160 140 V152 L168 158" stroke="#F59E0B" strokeWidth="2.5" strokeLinecap="round" fill="none" />
        </svg>
        <div className="relative">
          <p className="t-eyebrow text-gold">Special Hot Box</p>
          <h3 className="t-h3 mt-3 font-display text-ivory">
            Packed to arrive <span className="text-gold-gradient">warm and ready.</span>
          </h3>
          <p className="mt-4 max-w-lg text-ivory/75">
            {verified && warmHours
              ? `Our Special Hot Box packaging keeps biryani warm for up to ${warmHours} hours.`
              : 'Ask about our Special Hot Box packaging for bulk and function orders — the restaurant will tell you how long it keeps your biryani warm.'}
          </p>
          <p className="mt-4 max-w-lg rounded-2xl bg-black/30 p-4 text-xs leading-relaxed text-ivory/60 ring-1 ring-gold/15">
            Food-safety note: warm packaging helps with serving, but warmth alone doesn’t make cooked food safe to keep for long.
            Serve promptly and refrigerate leftovers.
          </p>
        </div>
      </div>
    </Reveal>
  );
}
