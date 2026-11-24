export type QualityTier = 'high' | 'medium' | 'low';

let webglCache: boolean | null = null;

export function hasWebGL(): boolean {
  if (webglCache !== null) return webglCache;
  try {
    const canvas = document.createElement('canvas');
    const gl = (canvas.getContext('webgl2') || canvas.getContext('webgl')) as WebGLRenderingContext | null;
    webglCache = !!gl;
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    webglCache = false;
  }
  return webglCache;
}

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export const isCoarsePointer = () =>
  typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

/** First guess only — PerformanceMonitor adjusts it at runtime when quality is "auto". */
export function guessQuality(): QualityTier {
  if (typeof navigator === 'undefined') return 'medium';
  const nav = navigator as Navigator & { deviceMemory?: number };
  const cores = nav.hardwareConcurrency ?? 4;
  const mem = nav.deviceMemory ?? 4;
  if (cores <= 4 || mem <= 3) return 'low';
  if (isCoarsePointer()) return 'medium';
  return 'high';
}

export const dprFor = (tier: QualityTier): [number, number] =>
  tier === 'high' ? [1, 1.5] : tier === 'medium' ? [1, 1.25] : [1, 1];
