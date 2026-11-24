import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ChevronRight, Flame, MapPin, Play } from 'lucide-react';
import { restaurant } from '../../data/restaurant';
import { useQuality, useSettings, useUI } from '../../stores/uiStore';
import { guessQuality, hasWebGL, type QualityTier } from '../../utils/device';
import { asset } from '../../utils/format';
import { scrollToTarget } from '../../utils/scroll';
import { useReducedMotion } from '../../hooks/useMedia';
import { story } from '../three/storyState';
import { Magnetic } from '../motion/Motion';
import { OpenStatusChip } from '../ui/OpenStatus';

const StoryCanvas = lazy(() => import('../three/StoryCanvas'));

const CALLOUTS = [
  { title: 'Aromatic Basmati Rice', text: 'Long, slender grains that stay separate and fragrant.', pos: 'md:left-[6%] md:top-[24%]' },
  { title: 'Rich Traditional Spices', text: 'Whole spices that perfume every layer.', pos: 'md:right-[6%] md:top-[30%]' },
  { title: 'The Art of Dum Cooking', text: 'Dum means slow cooking in a sealed pot, so the aroma stays inside.', pos: 'md:left-[8%] md:bottom-[18%]' },
  { title: 'Layers of Royal Flavour', text: 'Rice and masala layered the Hyderabadi way.', pos: 'md:right-[7%] md:bottom-[14%]' },
];

const CHAPTERS = ['The Sealed Dum Handi', 'Breaking the Dum Seal', 'The Ingredient Symphony', 'From Handi to Your Plate'];

const lowerTier = (t: QualityTier): QualityTier => (t === 'high' ? 'medium' : 'low');
const raiseTier = (t: QualityTier, cap: QualityTier): QualityTier => {
  const order: QualityTier[] = ['low', 'medium', 'high'];
  return order[Math.min(order.indexOf(cap), order.indexOf(t) + 1)];
};

export function StorySection() {
  const [webgl] = useState(() => hasWebGL());
  const reduced = useReducedMotion();
  const tier = useQuality();
  const qualityMode = useSettings((s) => s.qualityMode);
  const setAutoTier = useUI((s) => s.setAutoTier);
  const setSceneReady = useUI((s) => s.setSceneReady);
  const setStoryChapter = useUI((s) => s.setStoryChapter);
  const chapter = useUI((s) => s.storyChapter);
  const introDone = useUI((s) => s.introDone);

  const sectionRef = useRef<HTMLElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);
  const cueRef = useRef<HTMLDivElement>(null);
  const ch2Ref = useRef<HTMLDivElement>(null);
  const calloutRefs = useRef<(HTMLDivElement | null)[]>([]);
  const ch3Ref = useRef<HTMLDivElement>(null);
  const ch4Ref = useRef<HTMLDivElement>(null);
  const fadeRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(true);

  // Fallback (no WebGL): the scene is "ready" immediately.
  useEffect(() => {
    if (!webgl) setSceneReady();
  }, [webgl, setSceneReady]);

  // Only render the 3D canvas while the story is on screen.
  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setActive(e.isIntersecting), { rootMargin: '100px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // ── Single master timeline, scrubbed by scroll ──
  useLayoutEffect(() => {
    if (!webgl) return;
    const section = sectionRef.current!;
    const mm = gsap.matchMedia();
    const build = (desktop: boolean) => {
      const tl = gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: {
          trigger: section,
          start: 'top top',
          end: 'bottom bottom',
          scrub: reduced ? true : 1.2,
          onUpdate: (self) => {
            const p = self.progress;
            const c = p < 0.2 ? 0 : p < 0.45 ? 1 : p < 0.7 ? 2 : 3;
            if (useUI.getState().storyChapter !== c) setStoryChapter(c);
          },
        },
      });
      tl.to(story, { p: 1, duration: 1 }, 0);
      tl.to(cueRef.current, { autoAlpha: 0, duration: 0.03 }, 0.02);
      tl.to(heroRef.current, { autoAlpha: 0, y: -90, duration: 0.08, ease: 'power1.in' }, 0.09);
      // Chapter II
      tl.fromTo(ch2Ref.current, { autoAlpha: 0, y: 40 }, { autoAlpha: 1, y: 0, duration: 0.04 }, 0.21);
      const callouts = calloutRefs.current.filter(Boolean) as HTMLDivElement[];
      callouts.forEach((el, i) => {
        const at = 0.25 + i * 0.045;
        tl.fromTo(
          el,
          { autoAlpha: 0, y: 30, clipPath: 'inset(0 100% 0 0)' },
          { autoAlpha: 1, y: 0, clipPath: 'inset(0 0% 0 0)', duration: 0.035 },
          at,
        );
        if (!desktop && i < callouts.length - 1) tl.to(el, { autoAlpha: 0, y: -20, duration: 0.02 }, at + 0.04);
      });
      tl.to([ch2Ref.current, ...callouts], { autoAlpha: 0, y: -30, duration: 0.03 }, 0.43);
      // Chapter III
      tl.fromTo(ch3Ref.current, { autoAlpha: 0, y: 30 }, { autoAlpha: 1, y: 0, duration: 0.04 }, 0.48);
      tl.to(ch3Ref.current, { autoAlpha: 0, y: -30, duration: 0.03 }, 0.66);
      // Chapter IV
      tl.fromTo(ch4Ref.current, { autoAlpha: 0, y: 40 }, { autoAlpha: 1, y: 0, duration: 0.05 }, 0.78);
      // dissolve into the menu
      tl.fromTo(fadeRef.current, { opacity: 0 }, { opacity: 1, duration: 0.07 }, 0.93);
      return () => tl.kill();
    };
    mm.add('(min-width: 768px)', () => build(true));
    mm.add('(max-width: 767px)', () => build(false));
    return () => mm.revert();
  }, [webgl, reduced, setStoryChapter]);

  useEffect(() => {
    if (introDone) ScrollTrigger.refresh();
  }, [introDone]);

  const onDecline = useCallback(() => {
    if (useSettings.getState().qualityMode !== 'auto') return;
    setAutoTier(lowerTier(useUI.getState().autoTier));
  }, [setAutoTier]);
  const onIncline = useCallback(() => {
    if (useSettings.getState().qualityMode !== 'auto') return;
    setAutoTier(raiseTier(useUI.getState().autoTier, guessQuality()));
  }, [setAutoTier]);

  if (!webgl) return <StaticStory />;

  return (
    <section
      id="home"
      ref={sectionRef}
      data-mode="webgl"
      className="relative h-[560vh] md:h-[620vh]"
      aria-label="The Dawat story: sealed handi, breaking the dum, ingredients and the plated biryani"
    >
      <div className="sticky top-0 h-[100svh] w-full overflow-hidden bg-smoke">
        <Suspense fallback={<div className="absolute inset-0 bg-[radial-gradient(50%_40%_at_60%_60%,rgba(245,158,11,0.15),transparent)]" />}>
          <StoryCanvas
            tier={tier}
            auto={qualityMode === 'auto'}
            active={active}
            reduced={reduced}
            onReady={setSceneReady}
            onDecline={onDecline}
            onIncline={onIncline}
          />
        </Suspense>
        <div className="story-vignette pointer-events-none absolute inset-0" aria-hidden />

        {/* Chapter I — hero */}
        <div ref={heroRef} className="pointer-events-none absolute inset-0 z-10">
          <div className="absolute inset-y-0 left-0 hidden w-[62%] bg-gradient-to-r from-smoke/85 via-smoke/40 to-transparent md:landscape:block" />
          <div className="absolute inset-x-0 top-0 h-[60%] bg-gradient-to-b from-smoke/90 via-smoke/50 to-transparent md:landscape:hidden" />
          <div className="relative mx-auto flex h-full max-w-[1400px] flex-col justify-start px-5 pt-28 sm:px-8 md:landscape:justify-center md:landscape:pt-16 lg:px-14">
            <div className="pointer-events-auto max-w-[40rem]">
              <p className="t-eyebrow flex items-center gap-3 text-gold">
                <span className="h-px w-8 bg-gold/70" />
                {restaurant.name} · {restaurant.address.city}
              </p>
              <h2 className="t-hero mt-5 font-display font-semibold text-ivory">
                <span className="block">Sealed in Tradition.</span>
                <span className="text-gold-gradient text-gold-sweep block italic">Awakened by Fire.</span>
              </h2>
              <p className="mt-6 max-w-md text-base leading-relaxed text-ivory/75 sm:text-lg">
                Discover the royal flavours of Hyderabad, brought to Bhiwandi by {restaurant.name}.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Magnetic>
                  <button type="button" className="btn btn-gold shimmer" onClick={() => scrollToTarget('menu')}>
                    Explore the Royal Menu <ChevronRight size={18} aria-hidden />
                  </button>
                </Magnetic>
                <Magnetic>
                  <button type="button" className="btn btn-emerald" onClick={() => scrollToTarget('dum-experience')}>
                    <span className="grid h-7 w-7 place-items-center rounded-full border border-gold/60">
                      <Play size={13} className="translate-x-px fill-current" aria-hidden />
                    </span>
                    Experience the Dum
                  </button>
                </Magnetic>
              </div>
              <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-ivory/60">
                <OpenStatusChip />
                <span className="inline-flex items-center gap-1.5">
                  <MapPin size={14} className="text-gold" aria-hidden /> Dhamankar Naka, Bhiwandi
                </span>
              </div>
            </div>
          </div>
        </div>

        <div ref={cueRef} className="pointer-events-none absolute bottom-6 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-2 text-ivory/60">
          <span className="relative h-10 w-6 rounded-full border border-ivory/40" aria-hidden>
            <span className="scroll-dot absolute left-1/2 top-2 h-2 w-1 -translate-x-1/2 rounded-full bg-gold" />
          </span>
          <span className="hidden text-[11px] uppercase tracking-[0.25em] sm:block">Scroll to break the seal</span>
        </div>

        {/* Chapter II */}
        <div ref={ch2Ref} className="invisible pointer-events-none absolute left-5 top-24 z-10 sm:left-8 md:left-1/2 md:top-[11%] md:-translate-x-1/2 md:text-center">
          <p className="t-eyebrow text-gold">Chapter II</p>
          <h2 className="t-h3 mt-2 font-display text-ivory">Breaking the Dum Seal</h2>
        </div>
        {CALLOUTS.map((c, i) => (
          <div
            key={c.title}
            ref={(el) => {
              calloutRefs.current[i] = el;
            }}
            className={`invisible pointer-events-none absolute inset-x-5 bottom-[12%] z-10 max-w-xs md:inset-x-auto ${c.pos}`}
          >
            <div className="glass rounded-2xl px-5 py-4">
              <p className="flex items-center gap-2 font-royal text-sm tracking-wider text-gold">
                <Flame size={14} aria-hidden /> {c.title}
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-ivory/75">{c.text}</p>
            </div>
          </div>
        ))}

        {/* Chapter III */}
        <div ref={ch3Ref} className="invisible pointer-events-none absolute inset-x-0 top-24 z-10 isolate px-5 text-center md:inset-x-auto md:bottom-[7%] md:left-[4%] md:top-auto md:text-left lg:left-14">
          <div className="absolute -inset-x-16 -inset-y-12 -z-10 hidden bg-[radial-gradient(closest-side,rgba(11,9,8,0.85),transparent)] md:block" aria-hidden />
          <p className="t-eyebrow text-gold">Chapter III</p>
          <h2 className="t-h3 mt-2 font-display text-ivory">
            The Royal <span className="italic text-gold-gradient">Ingredient Symphony</span>
          </h2>
          <p className="mt-2 hidden text-sm text-ivory/55 md:block">Move your cursor — the spices follow.</p>
        </div>

        {/* Chapter IV */}
        <div ref={ch4Ref} className="invisible absolute inset-x-0 bottom-0 z-10">
          <div className="bg-gradient-to-t from-smoke via-smoke/70 to-transparent px-5 pb-10 pt-24 sm:px-8 lg:px-14">
            <div className="mx-auto max-w-[1400px]">
              <p className="t-eyebrow text-gold">Chapter IV</p>
              <h2 className="t-h2 mt-3 max-w-2xl font-display text-ivory">
                From Handi <span className="italic text-gold-gradient">to Your Plate.</span>
              </h2>
              <p className="mt-4 max-w-lg text-ivory/70">Choose your biryani, pick a portion, and send your order enquiry in a few taps.</p>
              <button type="button" className="btn btn-gold mt-6" onClick={() => scrollToTarget('menu')}>
                See the Royal Menu <ChevronRight size={18} aria-hidden />
              </button>
            </div>
          </div>
        </div>

        {/* Chapter navigation */}
        <nav aria-label="Story chapters" className="absolute right-4 top-1/2 z-20 hidden -translate-y-1/2 flex-col gap-3 lg:flex">
          {CHAPTERS.map((label, i) => (
            <button
              key={label}
              type="button"
              onClick={() => scrollToTarget(`chapter-${i + 1}`)}
              aria-current={chapter === i ? 'step' : undefined}
              className="group flex min-h-[44px] items-center justify-end gap-3"
            >
              <span className="pointer-events-none translate-x-2 text-xs text-ivory/70 opacity-0 transition group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:opacity-100">
                {label}
              </span>
              <span
                className={`font-royal text-[11px] transition ${chapter === i ? 'text-gold' : 'text-ivory/40'}`}
                aria-hidden
              >
                {['I', 'II', 'III', 'IV'][i]}
              </span>
              <span className={`h-px transition-all ${chapter === i ? 'w-10 bg-gold' : 'w-5 bg-ivory/30'}`} aria-hidden />
            </button>
          ))}
        </nav>

        <div ref={fadeRef} className="pointer-events-none absolute inset-0 z-30 bg-clove opacity-0" aria-hidden />
      </div>
    </section>
  );
}

/** Elegant static fallback when WebGL is unavailable. Menu and ordering keep working. */
function StaticStory() {
  return (
    <section id="home" data-mode="static" className="relative overflow-hidden bg-smoke">
      <div className="relative mx-auto grid min-h-[100svh] max-w-[1400px] items-center gap-10 px-5 pb-16 pt-28 sm:px-8 md:grid-cols-2 lg:px-14">
        <div>
          <p className="t-eyebrow text-gold">{restaurant.name} · {restaurant.address.city}</p>
          <h2 className="t-hero mt-5 font-display font-semibold text-ivory">
            Sealed in Tradition. <span className="text-gold-gradient block italic">Awakened by Fire.</span>
          </h2>
          <p className="mt-6 max-w-md text-lg text-ivory/75">
            Discover the royal flavours of Hyderabad, brought to Bhiwandi by {restaurant.name}.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <button type="button" className="btn btn-gold" onClick={() => scrollToTarget('menu')}>
              Explore the Royal Menu <ChevronRight size={18} aria-hidden />
            </button>
            <button type="button" className="btn btn-emerald" onClick={() => scrollToTarget('dum-experience')}>
              Experience the Dum
            </button>
          </div>
          <div className="mt-6">
            <OpenStatusChip />
          </div>
        </div>
        <figure className="relative">
          <img
            src={asset('assets/images/art/hero-handi.webp')}
            alt="Brass handi of biryani over glowing charcoal"
            className="w-full rounded-[2rem] object-cover shadow-2xl"
          />
          <figcaption className="absolute bottom-3 left-3 rounded-full bg-black/55 px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-ivory/80">
            Promotional artwork
          </figcaption>
        </figure>
      </div>
      <div id="dum-experience" className="mx-auto max-w-[1400px] px-5 pb-24 sm:px-8 lg:px-14">
        <p className="t-eyebrow text-gold">The Dum Experience</p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {CALLOUTS.map((c) => (
            <div key={c.title} className="glass rounded-2xl p-5">
              <p className="font-royal text-sm text-gold">{c.title}</p>
              <p className="mt-2 text-sm text-ivory/75">{c.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
