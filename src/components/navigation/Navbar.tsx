import { AnimatePresence, motion } from 'framer-motion';
import { Menu as MenuIcon, Phone, Settings2, ShoppingBag, Volume2, VolumeX, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { restaurant } from '../../data/restaurant';
import { countOf, useCart } from '../../stores/cartStore';
import { useSettings, useUI } from '../../stores/uiStore';
import { asset } from '../../utils/format';
import { scrollToTarget } from '../../utils/scroll';
import { sound } from '../../utils/sound';
import {telUrl} from '../../utils/order';
import { WhatsAppLink } from '../ui/WhatsAppLink';
import { useDialog } from '../ui/Sheet';
import { InstagramIcon, WhatsAppIcon, YouTubeIcon } from '../ui/Bits';
import { SettingsPanel } from '../ui/SettingsPanel';

export const NAV_LINKS = [
  { id: 'home', label: 'Home' },
  { id: 'our-story', label: 'Our Story' },
  { id: 'menu', label: 'Signature Menu' },
  { id: 'dum-experience', label: 'The Dum Experience' },
  { id: 'bulk-orders', label: 'Bulk & Special Orders' },
  { id: 'gallery', label: 'Gallery' },
  { id: 'reviews', label: 'Reviews' },
  { id: 'visit', label: 'Visit Us' },
];

const ease = [0.22, 1, 0.36, 1] as const;

export function Navbar() {
  const introDone = useUI((s) => s.introDone);
  const active = useUI((s) => s.activeSection);
  const navOpen = useUI((s) => s.navOpen);
  const setNavOpen = useUI((s) => s.setNavOpen);
  const setCartOpen = useUI((s) => s.setCartOpen);
  const settingsOpen = useUI((s) => s.settingsOpen);
  const setSettingsOpen = useUI((s) => s.setSettingsOpen);
  const lines = useCart((s) => s.lines);
  const addPulse = useCart((s) => s.addPulse);
  const soundOn = useSettings((s) => s.soundOn);
  const setSoundOn = useSettings((s) => s.setSoundOn);
  const count = countOf(lines);
  const [scrolled, setScrolled] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const go = (id: string) => {
    setNavOpen(false);
    sound.play('click');
    scrollToTarget(id);
  };

  const orderNow = () => {
    sound.play('click');
    if (count > 0) setCartOpen(true);
    else scrollToTarget('menu');
  };

  const toggleSound = async () => {
    const next = !soundOn;
    setSoundOn(next);
    await sound.setEnabled(next);
    if (next) sound.play('chime');
  };

  const underlineId = hovered ?? active;

  return (
    <>
      <motion.header
        className="fixed inset-x-0 top-0 z-[75] px-3 pt-3 sm:px-5 sm:pt-4"
        initial={false}
        animate={introDone ? { y: 0, opacity: 1 } : { y: -30, opacity: 0 }}
        transition={{ duration: 0.9, ease }}
      >
        <div
          className={`mx-auto flex max-w-[1440px] items-center gap-2 rounded-full py-1.5 pl-1.5 pr-1.5 transition-[background,box-shadow] duration-500 sm:gap-3 ${
            scrolled ? 'glass' : 'bg-transparent'
          }`}
        >
          <motion.button
            type="button"
            onClick={() => go('home')}
            className="relative shrink-0 rounded-full"
            aria-label={`${restaurant.name} — back to top`}
            initial={false}
            animate={introDone ? { scale: 1, opacity: 1 } : { scale: 0.7, opacity: 0 }}
            transition={{ duration: 0.8, ease, delay: 0.1 }}
          >
            <img
              src={asset('assets/images/logo-256.webp')}
              alt=""
              width={56}
              height={56}
              className="h-12 w-12 drop-shadow-[0_0_18px_rgba(212,175,55,0.35)] sm:h-14 sm:w-14"
            />
          </motion.button>

          <nav aria-label="Main" className="hidden flex-1 justify-center xl:flex">
            <ul className="flex items-center gap-0.5" onMouseLeave={() => setHovered(null)}>
              {NAV_LINKS.map((l, i) => (
                <motion.li
                  key={l.id}
                  initial={false}
                  animate={introDone ? { opacity: 1, y: 0 } : { opacity: 0, y: -8 }}
                  transition={{ duration: 0.6, ease, delay: 0.2 + i * 0.05 }}
                >
                  <a
                    href={`#${l.id}`}
                    onClick={(e) => {
                      e.preventDefault();
                      go(l.id);
                    }}
                    onMouseEnter={() => setHovered(l.id)}
                    onFocus={() => setHovered(l.id)}
                    onBlur={() => setHovered(null)}
                    aria-current={active === l.id ? 'true' : undefined}
                    className={`relative block rounded-full px-3 py-3 text-[13px] tracking-wide transition-colors ${
                      active === l.id ? 'text-gold' : 'text-ivory/80 hover:text-ivory'
                    }`}
                  >
                    {l.label}
                    {underlineId === l.id && (
                      <motion.span
                        layoutId="nav-underline"
                        className="absolute inset-x-3 bottom-1.5 h-px bg-gradient-to-r from-transparent via-gold to-transparent"
                        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                      />
                    )}
                  </a>
                </motion.li>
              ))}
            </ul>
          </nav>

          <div className="ml-auto flex items-center gap-1 sm:gap-1.5 xl:ml-0">
            <button
              type="button"
              onClick={toggleSound}
              data-sound-toggle
              className="hidden h-11 w-11 place-items-center rounded-full text-ivory/80 transition hover:bg-ivory/10 hover:text-ivory sm:grid"
              aria-pressed={soundOn}
              aria-label={soundOn ? 'Mute sound' : 'Turn sound on'}
              title={soundOn ? 'Mute sound' : 'Sound (off)'}
            >
              {soundOn ? <Volume2 size={19} /> : <VolumeX size={19} />}
            </button>
            <div className="relative">
              <button
                type="button"
                onClick={() => setSettingsOpen(!settingsOpen)}
                className="grid h-11 w-11 place-items-center rounded-full text-ivory/80 transition hover:bg-ivory/10 hover:text-ivory"
                aria-expanded={settingsOpen}
                aria-controls="settings-panel"
                aria-label="Experience settings"
              >
                <Settings2 size={19} />
              </button>
              <AnimatePresence>{settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}</AnimatePresence>
            </div>
            <button
              type="button"
              onClick={() => {
                sound.play('click');
                setCartOpen(true);
              }}
              className="relative grid h-11 w-11 place-items-center rounded-full text-ivory/90 transition hover:bg-ivory/10"
              aria-label={`Open your order (${count} item${count === 1 ? '' : 's'})`}
            >
              <motion.span
                key={addPulse}
                initial={addPulse ? { scale: 1.35, rotate: -12 } : false}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 400, damping: 12 }}
                className="grid place-items-center"
              >
                <ShoppingBag size={20} />
              </motion.span>
              <AnimatePresence>
                {count > 0 && (
                  <motion.span
                    key="badge"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0 }}
                    className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-chilli px-1 font-num text-[11px] font-bold text-white"
                  >
                    {count}
                  </motion.span>
                )}
              </AnimatePresence>
            </button>
            <button type="button" onClick={orderNow} className="btn btn-gold btn-sm shimmer hidden sm:inline-flex">
              Order Now
            </button>
            <button
              type="button"
              onClick={() => setNavOpen(true)}
              className="grid h-11 w-11 place-items-center rounded-full text-ivory transition hover:bg-ivory/10 xl:hidden"
              aria-label="Open menu"
              aria-expanded={navOpen}
            >
              <MenuIcon size={22} />
            </button>
          </div>
        </div>
      </motion.header>
      <MobileDrawer open={navOpen} onClose={() => setNavOpen(false)} go={go} active={active} orderNow={orderNow} />
    </>
  );
}

function MobileDrawer({
  open,
  onClose,
  go,
  active,
  orderNow,
}: {
  open: boolean;
  onClose: () => void;
  go: (id: string) => void;
  active: string;
  orderNow: () => void;
}) {
  const ref = useDialog(open, onClose);
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={ref}
          role="dialog"
          aria-modal="true"
          aria-label="Site navigation"
          data-lenis-prevent
          className="fixed inset-0 z-[90] overflow-y-auto bg-smoke/95 backdrop-blur-xl"
          initial={{ clipPath: 'circle(0% at 100% 0%)' }}
          animate={{ clipPath: 'circle(150% at 100% 0%)' }}
          exit={{ clipPath: 'circle(0% at 100% 0%)' }}
          transition={{ duration: 0.7, ease }}
        >
          <div className="bg-jali absolute inset-0 opacity-60" aria-hidden />
          <div className="relative flex min-h-full flex-col px-6 pb-10 pt-5">
            <div className="flex items-center justify-between">
              <img src={asset('assets/images/logo-256.webp')} alt={restaurant.name} className="h-14 w-14" />
              <button
                type="button"
                onClick={onClose}
                className="grid h-12 w-12 place-items-center rounded-full ring-1 ring-gold/40"
                aria-label="Close menu"
              >
                <X size={22} />
              </button>
            </div>
            <nav aria-label="Mobile" className="mt-8 flex-1">
              <ul className="space-y-1">
                {NAV_LINKS.map((l, i) => (
                  <motion.li
                    key={l.id}
                    initial={{ opacity: 0, x: 30 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.15 + i * 0.05, duration: 0.6, ease }}
                  >
                    <button
                      type="button"
                      onClick={() => go(l.id)}
                      className={`flex min-h-[52px] w-full items-baseline gap-4 py-2 text-left font-display text-3xl ${
                        active === l.id ? 'text-gold' : 'text-ivory'
                      }`}
                      aria-current={active === l.id ? 'true' : undefined}
                    >
                      <span className="font-num text-xs text-gold/60">{String(i + 1).padStart(2, '0')}</span>
                      {l.label}
                    </button>
                  </motion.li>
                ))}
              </ul>
            </nav>
            <div className="mt-8 grid gap-3">
              <button
                type="button"
                className="btn btn-gold"
                onClick={() => {
                  onClose();
                  orderNow();
                }}
              >
                Order Now
              </button>
              <div className="grid grid-cols-2 gap-3">
                <a className="btn btn-ghost" href={telUrl}>
                  <Phone size={17} /> Call
                </a>
                <WhatsAppLink className="btn btn-emerald" text={`Namaste! I'd like to place an order enquiry with ${restaurant.name}.`}>
                  <WhatsAppIcon /> WhatsApp
                </WhatsAppLink>
              </div>
              <div className="mt-4 flex items-center justify-center gap-4 text-ivory/70">
                <a href={restaurant.social.instagram} target="_blank" rel="noopener noreferrer" className="grid h-11 w-11 place-items-center" aria-label="Instagram">
                  <InstagramIcon />
                </a>
                <a href={restaurant.social.youtube} target="_blank" rel="noopener noreferrer" className="grid h-11 w-11 place-items-center" aria-label="YouTube">
                  <YouTubeIcon />
                </a>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
