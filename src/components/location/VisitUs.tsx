import { Clock, MapPin, Navigation, Phone, ShoppingBag } from 'lucide-react';
import { useState } from 'react';
import { restaurant } from '../../data/restaurant';
import { useUI } from '../../stores/uiStore';
import { directionsUrl, telUrl } from '../../utils/order';
import { Reveal } from '../motion/Motion';
import { GoogleIcon, SectionHeading } from '../ui/Bits';
import { OpenStatusChip } from '../ui/OpenStatus';

export function VisitUs() {
  const [mapLoaded, setMapLoaded] = useState(false);
  const setCartOpen = useUI((s) => s.setCartOpen);
  const a = restaurant.address;
  const embed = `https://maps.google.com/maps?q=${encodeURIComponent(restaurant.mapsQuery)}&z=16&output=embed`;

  return (
    <section id="visit" className="relative scroll-mt-24 bg-clove py-28 sm:py-36" aria-labelledby="visit-title">
      <div className="relative mx-auto grid max-w-[1400px] gap-12 px-5 sm:px-8 lg:grid-cols-[0.95fr_1.05fr] lg:px-14">
        <div>
          <div id="visit-title">
            <SectionHeading eyebrow="Visit Us" title="Find your way" accent="to Dawat." devanagari="पत्ता" />
          </div>
          <Reveal delay={0.1}>
            <address className="mt-10 not-italic">
              <p className="font-display text-3xl text-ivory">{restaurant.name}</p>
              <p className="mt-3 flex gap-3 text-lg leading-relaxed text-ivory/80">
                <MapPin className="mt-1 shrink-0 text-gold" size={20} aria-hidden />
                <span>
                  {a.line1}
                  <br />
                  {a.line2}
                  <br />
                  {a.city}, {a.state} {a.postalCode}
                </span>
              </p>
              <p className="mt-4 flex items-center gap-3 text-ivory/80">
                <Clock className="shrink-0 text-gold" size={20} aria-hidden />
                <span>
                  Opening hours: <span className="font-num">{restaurant.hours.display}</span>
                </span>
              </p>
              <div className="mt-2 pl-8">
                <OpenStatusChip />
                <p className="mt-1 text-xs text-ivory/45">Based on our usual hours in India time — actual hours may vary on holidays.</p>
              </div>
              <p className="mt-4 flex items-center gap-3 text-ivory/80">
                <Phone className="shrink-0 text-gold" size={20} aria-hidden />
                <a href={telUrl} className="font-num text-lg underline-offset-4 hover:text-gold hover:underline">
                  {restaurant.phone.display}
                </a>
              </p>
            </address>
          </Reveal>
          <Reveal delay={0.15} className="mt-10 flex flex-wrap gap-3">
            <a href={directionsUrl} target="_blank" rel="noopener noreferrer" className="btn btn-gold">
              <Navigation size={17} /> Get Directions
            </a>
            <a href={telUrl} className="btn btn-emerald">
              <Phone size={17} /> Call Now
            </a>
            <button type="button" className="btn btn-ghost" onClick={() => setCartOpen(true)}>
              <ShoppingBag size={17} /> Order Enquiry
            </button>
            <a href={restaurant.social.google} target="_blank" rel="noopener noreferrer" className="btn btn-ghost">
              <span className="grid h-6 w-6 place-items-center rounded-full bg-white">
                <GoogleIcon size={14} />
              </span>
              Google Profile
            </a>
          </Reveal>
        </div>

        <Reveal delay={0.1}>
          <div className="relative h-[420px] overflow-hidden rounded-[2rem] bg-smoke ring-1 ring-gold/30 sm:h-[520px]">
            {mapLoaded ? (
              <iframe
                title={`Map showing ${restaurant.name}`}
                src={embed}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                className="h-full w-full"
                style={{ filter: 'grayscale(0.35) sepia(0.35) contrast(1.05) brightness(0.85)' }}
              />
            ) : (
              <div className="bg-jali relative grid h-full place-items-center p-8 text-center">
                <div className="absolute inset-0 bg-[radial-gradient(50%_50%_at_50%_50%,rgba(212,175,55,0.12),transparent)]" aria-hidden />
                <div className="relative">
                  <span className="relative mx-auto grid h-20 w-20 place-items-center rounded-full bg-maroon ring-2 ring-gold">
                    <span className="absolute inset-0 animate-ping rounded-full bg-gold/20" aria-hidden />
                    <MapPin className="text-gold" size={34} aria-hidden />
                  </span>
                  <p className="mt-6 font-display text-2xl text-ivory">Dhamankar Naka, Bhiwandi</p>
                  <p className="mt-2 text-sm text-ivory/60">Opposite Padmashree School, B.N.N. College Road</p>
                  <button type="button" className="btn btn-ghost mt-6" onClick={() => setMapLoaded(true)}>
                    Load Google Map
                  </button>
                  <p className="mt-3 text-[11px] text-ivory/40">Loading the map connects to Google Maps.</p>
                </div>
              </div>
            )}
            <span className="pointer-events-none absolute inset-3 rounded-[1.6rem] ring-1 ring-gold/20" aria-hidden />
          </div>
        </Reveal>
      </div>
    </section>
  );
}
