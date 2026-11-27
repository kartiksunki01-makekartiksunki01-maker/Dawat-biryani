import { Phone, ShoppingBag } from 'lucide-react';
import { restaurant } from '../../data/restaurant';
import { countOf, useCart } from '../../stores/cartStore';
import { useUI } from '../../stores/uiStore';
import { asset } from '../../utils/format';
import {telUrl} from '../../utils/order';
import { WhatsAppLink } from '../ui/WhatsAppLink';
import { scrollToTarget } from '../../utils/scroll';
import { ArchOutline, GoldDivider, LightSweep, Magnetic, Reveal, SplitReveal } from '../motion/Motion';
import { WhatsAppIcon } from '../ui/Bits';

/** Chapter V — the golden royal banner. */
export function Finale() {
  const count = useCart((s) => countOf(s.lines));
  const setCartOpen = useUI((s) => s.setCartOpen);
  return (
    <section className="relative overflow-hidden bg-smoke px-3 py-16 sm:px-6" aria-labelledby="finale-title">
      <div className="relative mx-auto max-w-[1400px] overflow-hidden rounded-[2.5rem] bg-gradient-to-br from-maroon via-[#3d0808] to-[#1a0505] px-6 py-20 text-center ring-1 ring-gold/50 sm:px-12 sm:py-28">
        <LightSweep repeatDelay={7} />
        <div className="bg-jali pointer-events-none absolute inset-0 opacity-70" aria-hidden />
        <ArchOutline className="pointer-events-none absolute left-1/2 top-6 h-[110%] w-[min(90%,760px)] -translate-x-1/2 text-gold/25" />
        <div className="pointer-events-none absolute inset-4 rounded-[2rem] ring-1 ring-gold/25" aria-hidden />
        <div className="relative">
          <Reveal>
            <img src={asset('assets/images/logo-256.webp')} alt="" className="mx-auto h-24 w-24 drop-shadow-[0_0_30px_rgba(212,175,55,0.45)]" />
            <p className="t-eyebrow mt-6 text-gold">Chapter V · Your Royal Dawat Awaits</p>
          </Reveal>
          <h2 id="finale-title" className="t-h2 mx-auto mt-5 max-w-4xl font-display text-ivory">
            <SplitReveal text="Your Next Royal Feast" /> <SplitReveal text="Awaits." wordClassName="text-gold-gradient" delay={0.2} />
          </h2>
          <GoldDivider className="mx-auto mt-6" />
          <Reveal delay={0.1}>
            <p className="mx-auto mt-5 max-w-xl text-ivory/75">
              Open <span className="font-num">{restaurant.hours.display}</span> · {restaurant.address.line1}, Dhamankar Naka, Bhiwandi
            </p>
          </Reveal>
          <Reveal delay={0.2} className="mt-10 flex flex-wrap justify-center gap-3">
            <Magnetic>
              <button
                type="button"
                className="btn btn-gold shimmer"
                onClick={() => (count > 0 ? setCartOpen(true) : scrollToTarget('menu'))}
              >
                <ShoppingBag size={18} /> {count > 0 ? `Review my order (${count})` : 'Order Now'}
              </button>
            </Magnetic>
            <WhatsAppLink className="btn btn-emerald" text={`Namaste! I'd like to place an order enquiry with ${restaurant.name}.`}>
              <WhatsAppIcon /> WhatsApp
            </WhatsAppLink>
            <a className="btn btn-ghost" href={telUrl}>
              <Phone size={18} /> {restaurant.phone.display}
            </a>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
