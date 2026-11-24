import { restaurant } from '../../data/restaurant';
import { asset } from '../../utils/format';
import { telUrl } from '../../utils/order';
import { scrollToTarget } from '../../utils/scroll';
import { NAV_LINKS } from '../navigation/Navbar';
import { GoogleIcon, InstagramIcon, YouTubeIcon } from '../ui/Bits';

export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="relative border-t border-gold/15 bg-smoke pb-28 pt-16 sm:pb-16">
      <div className="mx-auto grid max-w-[1400px] gap-12 px-5 sm:px-8 md:grid-cols-[1.3fr_1fr_1fr] lg:px-14">
        <div>
          <div className="flex items-center gap-4">
            <img src={asset('assets/images/logo-256.png')} alt="" className="h-16 w-16" />
            <div>
              <p className="font-display text-2xl text-ivory">{restaurant.name}</p>
              <p className="t-eyebrow mt-1 text-gold">{restaurant.tagline}</p>
            </div>
          </div>
          <p className="mt-6 max-w-sm text-sm leading-relaxed text-ivory/55">
            {restaurant.address.line1}, {restaurant.address.line2}, {restaurant.address.city}, {restaurant.address.state}{' '}
            {restaurant.address.postalCode}
            <br />
            Open {restaurant.hours.display} ·{' '}
            <a className="inline-flex min-h-[40px] items-center font-num hover:text-gold" href={telUrl}>
              {restaurant.phone.display}
            </a>
          </p>
          <div className="mt-6 flex gap-2">
            {[
              { href: restaurant.social.instagram, label: 'Instagram', icon: <InstagramIcon /> },
              { href: restaurant.social.youtube, label: 'YouTube', icon: <YouTubeIcon /> },
              { href: restaurant.social.google, label: 'Google Business profile', icon: <GoogleIcon /> },
            ].map((s) => (
              <a
                key={s.label}
                href={s.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={s.label}
                className="grid h-11 w-11 place-items-center rounded-full text-ivory/80 ring-1 ring-gold/25 transition hover:bg-gold/10 hover:text-gold"
              >
                {s.icon}
              </a>
            ))}
          </div>
        </div>

        <nav aria-label="Footer">
          <p className="t-eyebrow text-gold">Explore</p>
          <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1 text-sm md:grid-cols-1">
            {NAV_LINKS.map((l) => (
              <li key={l.id}>
                <a
                  href={`#${l.id}`}
                  onClick={(e) => {
                    e.preventDefault();
                    scrollToTarget(l.id);
                  }}
                  className="inline-flex min-h-[40px] items-center text-ivory/65 transition hover:text-gold"
                >
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div id="privacy" className="scroll-mt-28 text-sm text-ivory/55">
          <p className="t-eyebrow text-gold">Privacy</p>
          <p className="mt-4 leading-relaxed">
            When you place an order or send a bulk enquiry, your name, mobile number, the items, your timing and (for delivery) your
            address are stored securely with the restaurant so it can prepare and hand over your order. Only the restaurant’s staff can see
            them. They are not sold or shared, and you can ask the restaurant to delete them.
          </p>
          <p className="mt-4 leading-relaxed">
            This site uses no advertising cookies or analytics. Your cart, preferences and links to your own orders are kept in this
            browser; your details are remembered only if you tick “Remember my details”.
          </p>
          <p className="mt-4 leading-relaxed">
            <a className="inline-flex min-h-[40px] items-center underline hover:text-gold" href="track.html">My orders on this device</a>
          </p>
          <p className="mt-4 leading-relaxed">
            Dish and gallery images are representative promotional artwork. Dawat Anna is a fictional virtual host.
          </p>
        </div>
      </div>
      <div className="mx-auto mt-12 flex max-w-[1400px] flex-wrap justify-between gap-3 px-5 text-xs text-ivory/40 sm:px-8 lg:px-14">
        <p>
          © {year} {restaurant.name}, Bhiwandi.
        </p>
        <p lang="mr" className="font-deva">
          दावत मध्ये आपले स्वागत आहे
        </p>
      </div>
    </footer>
  );
}
