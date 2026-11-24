import { CookingPot, HeartHandshake, Package, Salad, ShieldCheck, Sparkles } from 'lucide-react';
import { careMedia, restaurant } from '../../data/restaurant';
import { asset } from '../../utils/format';
import { ImageReveal, Reveal } from '../motion/Motion';
import { InstagramIcon, SectionHeading, YouTubeIcon } from '../ui/Bits';

const PILLARS = [
  { icon: Sparkles, title: 'Kitchen cleanliness', text: 'A clean kitchen is where every Dawat begins.' },
  { icon: Salad, title: 'Ingredient preparation', text: 'Rice, spices and produce prepared with attention.' },
  { icon: CookingPot, title: 'Cooking utensils', text: 'Handis and vessels kept ready for every batch.' },
  { icon: ShieldCheck, title: 'Food handling', text: 'Careful handling from the kitchen to your plate.' },
  { icon: Package, title: 'Packaging', text: 'Packed to travel well for takeaway and bulk orders.' },
  { icon: HeartHandshake, title: 'Customer service', text: 'South Indian hospitality — you are our guest.' },
];

export function CraftedWithCare() {
  return (
    <section id="care" className="relative scroll-mt-24 overflow-hidden bg-silk py-28 sm:py-36" aria-labelledby="care-title">
      <div className="bg-jali pointer-events-none absolute inset-0 opacity-50" aria-hidden />
      <div className="relative mx-auto max-w-[1400px] px-5 sm:px-8 lg:px-14">
        <div id="care-title">
          <SectionHeading
            eyebrow="Our commitments"
            title="Crafted with Care."
            accent="Served with Pride."
            align="center"
            intro="The standards we hold ourselves to, every single day."
          />
        </div>

        <ul className="mt-16 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {PILLARS.map((p, i) => (
            <li key={p.title}>
              <Reveal delay={(i % 3) * 0.08} className="group h-full">
                <div className="relative h-full overflow-hidden rounded-3xl bg-smoke/60 p-7 ring-1 ring-gold/15 transition duration-500 hover:-translate-y-1 hover:ring-gold/40">
                  <span className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-saffron/10 blur-2xl transition group-hover:bg-saffron/20" aria-hidden />
                  <span className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-gold/30 to-maroon/40 text-gold ring-1 ring-gold/40">
                    <p.icon size={22} aria-hidden />
                  </span>
                  <p className="mt-6 font-display text-2xl text-ivory">{p.title}</p>
                  <p className="mt-2 text-sm leading-relaxed text-ivory/65">{p.text}</p>
                </div>
              </Reveal>
            </li>
          ))}
        </ul>

        {careMedia.length > 0 && (
          <div className="mt-16 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {careMedia.map((m) => (
              <figure key={m.src}>
                <ImageReveal src={asset(m.src)} alt={m.alt} className="aspect-[4/3] rounded-3xl" label={m.kind === 'promotional' ? 'Promotional artwork' : undefined} />
                <figcaption className="mt-3 text-sm text-ivory/70">{m.caption}</figcaption>
              </figure>
            ))}
          </div>
        )}

        <Reveal className="mt-14 flex flex-wrap items-center justify-center gap-3 text-sm text-ivory/70">
          <span>See the kitchen and food behind the scenes:</span>
          <a href={restaurant.social.instagram} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm">
            <InstagramIcon size={16} /> Instagram
          </a>
          <a href={restaurant.social.youtube} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm">
            <YouTubeIcon size={16} /> YouTube
          </a>
        </Reveal>
      </div>
    </section>
  );
}
