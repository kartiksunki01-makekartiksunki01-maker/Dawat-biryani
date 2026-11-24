/**
 * Shared mutable state between the GSAP master timeline (DOM) and the R3F scene.
 * Mutated every frame — deliberately not React state to avoid re-renders.
 */
export const story = {
  /** master scroll progress 0..1 (already smoothed by ScrollTrigger scrub) */
  p: 0,
  /** normalised pointer -1..1 */
  pointerX: 0,
  pointerY: 0,
};

export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** Story phases — single source of truth for the scroll choreography. */
export const phases = (p: number) => {
  const sealBreak = smooth(0.2, 0.28, p);
  const lidOpen = smooth(0.22, 0.4, p);
  const rise = smooth(0.44, 0.58, p);
  const ret = smooth(0.69, 0.8, p);
  const plate = smooth(0.72, 0.86, p);
  return {
    sealBreak,
    lidOpen,
    rise,
    ret,
    ingredients: rise * (1 - ret),
    plate,
    labels: smooth(0.5, 0.56, p) * (1 - smooth(0.67, 0.7, p)),
    hero: 1 - smooth(0.1, 0.22, p),
  };
};

/** Deterministic PRNG so procedural assets look identical on every load. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
