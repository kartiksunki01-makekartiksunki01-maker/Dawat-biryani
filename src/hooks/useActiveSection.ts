import { useEffect } from 'react';
import { useUI } from '../stores/uiStore';

const ORDER = ['home', 'menu', 'our-story', 'care', 'bulk-orders', 'gallery', 'reviews', 'visit'];

/** Tracks which section is under the upper third of the viewport. */
export function useActiveSection() {
  const setActive = useUI((s) => s.setActiveSection);
  useEffect(() => {
    let raf = 0;
    const compute = () => {
      raf = 0;
      const probe = window.innerHeight * 0.35;
      let current = 'home';
      for (const id of ORDER) {
        const el = document.getElementById(id);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        if (r.top <= probe && r.bottom > probe) current = id;
      }
      if (current === 'home' && useUI.getState().storyChapter >= 1) {
        const home = document.getElementById('home');
        if (home?.dataset.mode === 'webgl') current = 'dum-experience';
      }
      if (useUI.getState().activeSection !== current) setActive(current);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(compute);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    const unsub = useUI.subscribe((s, prev) => {
      if (s.storyChapter !== prev.storyChapter) onScroll();
    });
    compute();
    return () => {
      window.removeEventListener('scroll', onScroll);
      unsub();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [setActive]);
}
