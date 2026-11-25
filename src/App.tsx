import { useEffect } from 'react';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Intro } from './components/intro/Intro';
import { Navbar } from './components/navigation/Navbar';
import { StorySection } from './components/story/StorySection';
import { MenuSection } from './components/menu/MenuSection';
import { ProductSheet } from './components/menu/ProductSheet';
import { OurStory } from './components/heritage/OurStory';
import { CraftedWithCare } from './components/care/CraftedWithCare';
import { BulkOrders } from './components/bulk-orders/BulkOrders';
import { Gallery } from './components/gallery/Gallery';
import { Reviews } from './components/reviews/Reviews';
import { Finale } from './components/finale/Finale';
import { VisitUs } from './components/location/VisitUs';
import { Footer } from './components/finale/Footer';
import { CartDrawer } from './components/cart/CartDrawer';
import { ChatWidget } from './components/chat/ChatWidget';
import { Toast } from './components/ui/Toast';
import { ScrollProgress } from './components/motion/Motion';
import { initSmoothScroll } from './utils/scroll';
import { useReducedMotion } from './hooks/useMedia';
import { useActiveSection } from './hooks/useActiveSection';
import { useSettings } from './stores/uiStore';
import { sound } from './utils/sound';
import { useStorefront } from './data/menuSync';
import { OffersSection } from './components/offers/OffersSection';

export default function App() {
  const reduced = useReducedMotion();
  const volume = useSettings((s) => s.volume);

  useEffect(() => initSmoothScroll(reduced), [reduced]);
  useActiveSection();

  useEffect(() => {
    sound.setVolume(volume);
  }, [volume]);

  const musicOn = useSettings((s) => s.musicOn);
  const sfxOn = useSettings((s) => s.sfxOn);
  const website = useStorefront((s) => s.website);
  useEffect(() => sound.setUserPrefs({ music: musicOn, sfx: sfxOn }), [musicOn, sfxOn]);
  useEffect(() => {
    if (!website) return;
    sound.configure({ musicUrl: website.music_url, musicEnabled: website.music_enabled, sfxEnabled: website.sfx_enabled });
    // the restaurant's default volume applies until a visitor picks their own
    try {
      const saved = JSON.parse(localStorage.getItem('dawat-settings-v1') ?? '{}') as { state?: { volumeChosen?: boolean } };
      if (!saved.state?.volumeChosen) useSettings.setState({ volume: website.music_volume });
    } catch {
      /* ignore */
    }
  }, [website]);

  // Background music: browsers only allow sound after the visitor's first tap/click/key, so start it then
  // (unless they switched sound off before). The sound buttons handle their own taps.
  useEffect(() => {
    const evs = ['pointerup', 'touchend', 'mousedown', 'keydown', 'click'] as const;
    const off = () => evs.forEach((e) => window.removeEventListener(e, start, true));
    function start(e: Event) {
      if (e instanceof KeyboardEvent && e.key === 'Escape') return; // Esc is not a "user activation"
      if ((e.target as Element | null)?.closest?.('[data-sound-toggle]')) return;
      off();
      const s = useSettings.getState();
      if (s.soundOn || s.soundOptOut) return;
      useSettings.setState({ soundOn: true });
      void sound.setEnabled(true);
    }
    evs.forEach((e) => window.addEventListener(e, start, true));
    return off;
  }, []);

  // Re-measure scroll-driven animations once web fonts have settled.
  useEffect(() => {
    document.fonts?.ready.then(() => ScrollTrigger.refresh());
  }, []);

  return (
    <>
      <Intro />
      <ScrollProgress />
      <Navbar />
      <main id="main">
        <StorySection />
        <OffersSection />
        <MenuSection />
        <OurStory />
        <CraftedWithCare />
        <BulkOrders />
        <Gallery />
        <Reviews />
        <Finale />
        <VisitUs />
      </main>
      <Footer />
      <CartDrawer />
      <ProductSheet />
      <ChatWidget />
      <Toast />
      <div className="film-grain" aria-hidden />
    </>
  );
}
