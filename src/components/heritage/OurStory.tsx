import { restaurant } from '../../data/restaurant';
import { asset, formatDate } from '../../utils/format';
import { ImageReveal, Reveal, LightSweep } from '../motion/Motion';
import { SectionHeading } from '../ui/Bits';

export function OurStory() {
  return (
    <section id="our-story" className="relative scroll-mt-24 overflow-hidden bg-smoke py-28 sm:py-36" aria-labelledby="story-title">
      <div className="pointer-events-none absolute -right-40 top-10 h-[480px] w-[480px] rounded-full bg-maroon/30 blur-[120px]" aria-hidden />
      <div className="relative mx-auto grid max-w-[1400px] gap-16 px-5 sm:px-8 lg:grid-cols-[1.05fr_1fr] lg:gap-20 lg:px-14">
        <div id="story-title">
          <SectionHeading
            eyebrow="Our Story & Heritage"
            title="Born in Bhiwandi."
            accent="Inspired by Hyderabad."
            devanagari="दावत"
            intro={
              <>
                <span className="font-display text-ivory">Dawat</span> means a feast you are invited to. At {restaurant.name}, that
                invitation is the royal identity of Hyderabadi biryani, served near Dhamankar Naka with warm South Indian hospitality.
              </>
            }
          />

          <Reveal delay={0.1} className="mt-10">
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-maroon/50 to-emerald/40 p-6 ring-1 ring-gold/30 sm:p-8">
              <LightSweep delay={1} repeatDelay={9} />
              <p className="t-eyebrow text-gold">Founder & Owner</p>
              <p className="mt-3 font-display text-3xl text-ivory">{restaurant.founder}</p>
              <p className="mt-3 max-w-md text-sm text-ivory/70">
                Built around taste, cleanliness, quality and fair prices — so every guest leaves satisfied.
              </p>
            </div>
          </Reveal>

          <Reveal delay={0.15} className="mt-12">
            <p className="t-eyebrow text-gold">Milestones</p>
            <ol className="relative mt-6 space-y-8 border-l border-gold/30 pl-8">
              {restaurant.timeline.map((e) => (
                <li key={e.date} className="relative">
                  <span className="absolute -left-[37px] top-1.5 h-3 w-3 rounded-full bg-gold shadow-[0_0_0_5px_rgba(212,175,55,0.18)]" aria-hidden />
                  <time dateTime={e.date} className="font-num text-sm text-gold/90">
                    {formatDate(e.date)}
                  </time>
                  <p className="mt-1 font-display text-xl text-ivory">{e.title}</p>
                  <p className="mt-1 text-sm text-ivory/60">{e.note}</p>
                </li>
              ))}
            </ol>
          </Reveal>
        </div>

        <div className="relative">
          <ImageReveal
            src={asset('assets/images/art/handi-feast.webp')}
            alt="Open copper handi of chicken biryani with rising steam"
            className="aspect-[4/5] rounded-[2rem] ring-1 ring-gold/25 lg:ml-10"
            label="Promotional artwork"
          />
          <ImageReveal
            src={asset('assets/images/art/menu-handi.webp')}
            alt="Copper handi of biryani on a maroon cloth"
            className="absolute -bottom-10 -left-2 aspect-[4/3] w-[55%] rounded-[1.5rem] shadow-2xl ring-1 ring-gold/30 sm:-left-6"
            label="Promotional artwork"
          />
        </div>
      </div>

      <div className="relative mx-auto mt-28 max-w-[1400px] px-5 sm:px-8 lg:px-14">
        <Reveal>
          <p className="t-eyebrow text-center text-gold">What we stand for</p>
        </Reveal>
        <ul className="mt-10 grid gap-px overflow-hidden rounded-3xl bg-gold/15 ring-1 ring-gold/15 sm:grid-cols-2 lg:grid-cols-4">
          {restaurant.values.map((v, i) => (
            <li key={v.title} className="group relative bg-smoke p-7 transition-colors duration-500 hover:bg-clove">
              <Reveal delay={i * 0.05}>
                <span className="font-num text-sm text-gold/60">{String(i + 1).padStart(2, '0')}</span>
                <p className="mt-4 font-display text-2xl text-ivory">{v.title}</p>
                <p className="mt-2 text-sm text-ivory/60">{v.text}</p>
              </Reveal>
            </li>
          ))}
          <li className="relative grid place-items-center bg-gradient-to-br from-maroon/60 to-smoke p-7 text-center">
            <p className="font-display text-2xl italic text-gold-gradient">{restaurant.creativeTagline}</p>
          </li>
        </ul>
      </div>
    </section>
  );
}
