import Lenis from 'lenis';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);
ScrollTrigger.config({ ignoreMobileResize: true });

let lenis: Lenis | null = null;
let reduced = false;
let locks = 0;

export function initSmoothScroll(reducedMotion: boolean) {
  reduced = reducedMotion;
  if (reducedMotion) return () => {};
  lenis = new Lenis({ lerp: 0.085, smoothWheel: true, wheelMultiplier: 0.95 });
  // the intro may have locked scrolling before Lenis existed — honour that lock
  if (locks > 0) lenis.stop();
  lenis.on('scroll', ScrollTrigger.update);
  const tick = (time: number) => lenis?.raf(time * 1000);
  gsap.ticker.add(tick);
  gsap.ticker.lagSmoothing(0);
  return () => {
    gsap.ticker.remove(tick);
    lenis?.destroy();
    lenis = null;
  };
}

/** Anchors that live *inside* the pinned 3D story, expressed as story progress (0..1). */
export const STORY_ANCHORS: Record<string, number> = {
  home: 0,
  'dum-experience': 0.3,
  'chapter-1': 0,
  'chapter-2': 0.3,
  'chapter-3': 0.56,
  'chapter-4': 0.82,
};

export function storyScrollY(progress: number) {
  const el = document.getElementById('home');
  if (!el) return 0;
  const range = el.offsetHeight - window.innerHeight;
  return el.offsetTop + Math.max(0, range) * progress;
}

function resolveTarget(target: string): number | null {
  const storyMode = document.getElementById('home')?.dataset.mode;
  if (target in STORY_ANCHORS && (storyMode === 'webgl' || target === 'home')) {
    return storyScrollY(STORY_ANCHORS[target]);
  }
  const el = document.getElementById(target.startsWith('chapter-') ? 'dum-experience' : target);
  if (!el) return null;
  return el.getBoundingClientRect().top + window.scrollY - 72;
}

export function scrollToTarget(target: string | number, immediate = false) {
  const y = typeof target === 'number' ? target : resolveTarget(target);
  if (y === null) return;
  if (lenis && !reduced) {
    lenis.scrollTo(y, { duration: immediate ? 0 : 1.6, immediate, force: true });
  } else {
    window.scrollTo({ top: y, behavior: immediate || reduced ? 'auto' : 'smooth' });
  }
}

export function lockScroll(lock: boolean) {
  locks = Math.max(0, locks + (lock ? 1 : -1));
  const locked = locks > 0;
  if (locked) lenis?.stop();
  else lenis?.start();
  document.documentElement.style.overflow = locked ? 'hidden' : '';
}
