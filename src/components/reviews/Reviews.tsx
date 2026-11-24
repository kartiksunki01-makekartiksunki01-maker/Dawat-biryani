import { PenLine, Quote, Star } from 'lucide-react';
import { restaurant, reviews } from '../../data/restaurant';
import { Reveal } from '../motion/Motion';
import { GoogleIcon, SectionHeading, YouTubeIcon } from '../ui/Bits';

export function Reviews() {
  return (
    <section id="reviews" className="relative scroll-mt-24 overflow-hidden bg-smoke py-28 sm:py-36" aria-labelledby="reviews-title">
      <div className="pointer-events-none absolute -left-40 bottom-0 h-[420px] w-[420px] rounded-full bg-emerald/40 blur-[120px]" aria-hidden />
      <div className="relative mx-auto max-w-[1400px] px-5 sm:px-8 lg:px-14">
        <div id="reviews-title">
          <SectionHeading eyebrow="Customer Reviews" title="Guest" accent="Voices." align="center" />
        </div>

        {reviews.length > 0 ? (
          <ul className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {reviews.map((r, i) => (
              <li key={`${r.author}-${i}`}>
                <Reveal delay={(i % 3) * 0.08} className="h-full">
                  <figure className="glass flex h-full flex-col rounded-3xl p-7">
                    <Quote className="text-gold/60" size={26} aria-hidden />
                    {typeof r.rating === 'number' && (
                      <p className="mt-3 flex gap-0.5 text-saffron" aria-label={`${r.rating} out of 5 stars`}>
                        {Array.from({ length: 5 }, (_, k) => (
                          <Star key={k} size={16} className={k < Math.round(r.rating!) ? 'fill-current' : 'opacity-30'} aria-hidden />
                        ))}
                      </p>
                    )}
                    <blockquote className="mt-4 flex-1 text-ivory/85">“{r.text}”</blockquote>
                    <figcaption className="mt-5 text-sm text-ivory/60">
                      — {r.author} · {r.source}
                      {r.date ? ` · ${r.date}` : ''}
                    </figcaption>
                  </figure>
                </Reveal>
              </li>
            ))}
          </ul>
        ) : (
          <Reveal className="mx-auto mt-14 max-w-3xl">
            <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-clove to-smoke p-8 text-center ring-1 ring-gold/25 sm:p-12">
              <Quote className="mx-auto text-gold/50" size={40} aria-hidden />
              <p className="mt-6 font-display text-2xl leading-snug text-ivory sm:text-3xl">
                Every review you read about us should be real.
              </p>
              <p className="mx-auto mt-4 max-w-xl text-ivory/65">
                That’s why we don’t copy or rewrite reviews here. Read what guests are saying — and share your own experience — on our
                Google Business profile.
              </p>
            </div>
          </Reveal>
        )}

        <Reveal className="mt-10 flex flex-wrap justify-center gap-3">
          <a href={restaurant.social.google} target="_blank" rel="noopener noreferrer" className="btn btn-gold">
            <span className="grid h-6 w-6 place-items-center rounded-full bg-white">
              <GoogleIcon size={14} />
            </span>
            Read All Google Reviews
          </a>
          <a href={restaurant.social.google} target="_blank" rel="noopener noreferrer" className="btn btn-ghost">
            <PenLine size={17} /> Write a Review
          </a>
          <a href={restaurant.social.youtube} target="_blank" rel="noopener noreferrer" className="btn btn-ghost">
            <YouTubeIcon size={17} /> Guest videos on YouTube
          </a>
        </Reveal>
      </div>
    </section>
  );
}
