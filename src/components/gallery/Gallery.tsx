import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Play, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { gallery, restaurant, videos } from '../../data/restaurant';
import { asset, formatDate } from '../../utils/format';
import { useDialog } from '../ui/Sheet';
import { InstagramIcon, PromoLabel, SectionHeading, YouTubeIcon } from '../ui/Bits';
import { Reveal } from '../motion/Motion';

const ease = [0.22, 1, 0.36, 1] as const;
const SPANS = ['sm:col-span-2 sm:row-span-2', '', '', 'sm:col-span-2', 'sm:col-span-2', 'sm:col-span-2'];

function Lightbox({ index, onClose, onNav }: { index: number | null; onClose: () => void; onNav: (d: 1 | -1) => void }) {
  const ref = useDialog(index !== null, onClose);
  useEffect(() => {
    if (index === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') onNav(1);
      if (e.key === 'ArrowLeft') onNav(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, onNav]);
  const item = index !== null ? gallery[index] : null;
  return (
    <AnimatePresence>
      {item && (
        <motion.div
          ref={ref}
          role="dialog"
          aria-modal="true"
          aria-label={item.caption}
          className="fixed inset-0 z-[90] grid place-items-center bg-black/90 p-4 backdrop-blur"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.figure
            key={item.src}
            className="relative max-h-[85svh] max-w-5xl"
            initial={{ scale: 0.94, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.45, ease }}
            onClick={(e) => e.stopPropagation()}
          >
            <img src={asset(item.src)} alt={item.alt} className="max-h-[78svh] w-auto rounded-2xl object-contain" />
            <figcaption className="mt-3 flex items-center justify-between gap-3 text-sm text-ivory/80">
              <span className="font-display text-lg">{item.caption}</span>
              {item.kind === 'promotional' && <PromoLabel />}
            </figcaption>
          </motion.figure>
          <button type="button" onClick={onClose} className="absolute right-4 top-4 grid h-12 w-12 place-items-center rounded-full bg-ivory/10 text-ivory" aria-label="Close">
            <X size={22} />
          </button>
          <button type="button" onClick={(e) => { e.stopPropagation(); onNav(-1); }} className="absolute left-3 top-1/2 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-ivory/10 text-ivory" aria-label="Previous image">
            <ChevronLeft size={24} />
          </button>
          <button type="button" onClick={(e) => { e.stopPropagation(); onNav(1); }} className="absolute right-3 top-1/2 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-ivory/10 text-ivory" aria-label="Next image">
            <ChevronRight size={24} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function VideoModal({ id, onClose }: { id: string | null; onClose: () => void }) {
  const ref = useDialog(!!id, onClose);
  return (
    <AnimatePresence>
      {id && (
        <motion.div
          ref={ref}
          role="dialog"
          aria-modal="true"
          aria-label="Video player"
          className="fixed inset-0 z-[90] grid place-items-center bg-black/90 p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <div className="aspect-[9/16] h-[min(80svh,720px)] overflow-hidden rounded-2xl ring-1 ring-gold/30" onClick={(e) => e.stopPropagation()}>
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&rel=0`}
              title="Dawat Biryani House video"
              allow="autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
              className="h-full w-full"
            />
          </div>
          <button type="button" onClick={onClose} className="absolute right-4 top-4 grid h-12 w-12 place-items-center rounded-full bg-ivory/10 text-ivory" aria-label="Close video">
            <X size={22} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function Gallery() {
  const [open, setOpen] = useState<number | null>(null);
  const [video, setVideo] = useState<string | null>(null);
  const nav = useCallback((d: 1 | -1) => setOpen((i) => (i === null ? i : (i + d + gallery.length) % gallery.length)), []);
  const snap = restaurant.socialSnapshot;

  return (
    <section id="gallery" className="relative scroll-mt-24 bg-clove py-28 sm:py-36" aria-labelledby="gallery-title">
      <div className="relative mx-auto max-w-[1400px] px-5 sm:px-8 lg:px-14">
        <div className="flex flex-col justify-between gap-8 lg:flex-row lg:items-end">
          <div id="gallery-title">
            <SectionHeading eyebrow="Gallery & Social" title="Moments from" accent="Dawat." />
          </div>
          <Reveal className="text-sm text-ivory/55 lg:max-w-xs lg:text-right">
            Artwork below is the brand’s promotional imagery. Follow us for real-time updates from the kitchen.
          </Reveal>
        </div>

        <div className="mt-14 grid auto-rows-[220px] gap-4 sm:grid-cols-4 sm:auto-rows-[200px] lg:auto-rows-[240px]">
          {gallery.map((g, i) => (
            <motion.button
              key={g.src}
              type="button"
              onClick={() => setOpen(i)}
              className={`group relative overflow-hidden rounded-3xl text-left ring-1 ring-gold/15 ${SPANS[i] ?? ''}`}
              initial={{ opacity: 0, y: 40, clipPath: 'inset(10% 10% 10% 10% round 24px)' }}
              whileInView={{ opacity: 1, y: 0, clipPath: 'inset(0% 0% 0% 0% round 24px)' }}
              viewport={{ once: true, margin: '0px 0px -10% 0px' }}
              transition={{ duration: 1, ease, delay: (i % 3) * 0.08 }}
              aria-label={`Open image: ${g.caption}`}
            >
              <img src={asset(g.src)} alt={g.alt} loading="lazy" decoding="async" className="h-full w-full object-cover transition duration-[1.4s] ease-out group-hover:scale-110" />
              <span className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-transparent opacity-80 transition group-hover:opacity-100" aria-hidden />
              <span className="absolute bottom-4 left-4 right-4 font-display text-lg text-ivory">{g.caption}</span>
              {g.kind === 'promotional' && <PromoLabel className="absolute right-3 top-3" />}
            </motion.button>
          ))}
        </div>

        {/* Social */}
        <div className="mt-16 grid gap-5 lg:grid-cols-2">
          <Reveal>
            <a
              href={restaurant.social.instagram}
              target="_blank"
              rel="noopener noreferrer"
              className="group relative flex h-full items-center gap-6 overflow-hidden rounded-3xl bg-gradient-to-br from-maroon/70 via-[#4a0c2a]/60 to-smoke p-7 ring-1 ring-gold/20 transition hover:ring-gold/50"
            >
              <span className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-[#f58529] via-[#dd2a7b] to-[#8134af] text-white">
                <InstagramIcon size={30} />
              </span>
              <span className="flex-1">
                <span className="block text-sm text-ivory/60">Instagram</span>
                <span className="block font-display text-2xl text-ivory">{restaurant.social.instagramHandle}</span>
                <span className="mt-1 block text-sm text-ivory/70">
                  <span className="font-num font-semibold text-gold">{snap.instagramFollowers}</span> followers
                </span>
              </span>
              <span className="btn btn-ghost btn-sm hidden sm:inline-flex">Follow</span>
            </a>
          </Reveal>
          <Reveal delay={0.08}>
            <a
              href={restaurant.social.youtube}
              target="_blank"
              rel="noopener noreferrer"
              className="group relative flex h-full items-center gap-6 overflow-hidden rounded-3xl bg-gradient-to-br from-[#3a0707] to-smoke p-7 ring-1 ring-gold/20 transition hover:ring-gold/50"
            >
              <span className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-[#ff0000] text-white">
                <YouTubeIcon size={30} />
              </span>
              <span className="flex-1">
                <span className="block text-sm text-ivory/60">YouTube</span>
                <span className="block font-display text-2xl text-ivory">{restaurant.social.youtubeHandle}</span>
                <span className="mt-1 block text-sm text-ivory/70">
                  <span className="font-num font-semibold text-gold">{snap.youtubeSubscribers}</span> subscribers ·{' '}
                  <span className="font-num font-semibold text-gold">{snap.youtubeVideos}</span> videos · Shorts with{' '}
                  {snap.shortsViews.map((v, i) => (
                    <span key={v}>
                      <span className="font-num text-gold">{v}</span>
                      {i < snap.shortsViews.length - 1 ? ' and ' : ''}
                    </span>
                  ))}{' '}
                  views
                </span>
              </span>
              <span className="btn btn-ghost btn-sm hidden sm:inline-flex">Watch</span>
            </a>
          </Reveal>
        </div>
        <p className="mt-3 text-xs text-ivory/40">Social figures are a snapshot from {formatDate(snap.date)}, not live statistics.</p>

        {videos.length > 0 && (
          <div className="mt-14">
            <p className="t-eyebrow text-gold">Watch</p>
            <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              {videos.map((v) => (
                <button
                  key={v.youtubeId}
                  type="button"
                  onClick={() => setVideo(v.youtubeId)}
                  className="group relative aspect-[9/16] overflow-hidden rounded-2xl ring-1 ring-gold/20"
                  aria-label={`Play video: ${v.title}`}
                >
                  <img
                    src={`https://i.ytimg.com/vi/${encodeURIComponent(v.youtubeId)}/hqdefault.jpg`}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover transition duration-700 group-hover:scale-105"
                  />
                  <span className="absolute inset-0 grid place-items-center bg-black/30">
                    <span className="grid h-14 w-14 place-items-center rounded-full bg-gold text-clove">
                      <Play size={22} className="translate-x-0.5 fill-current" />
                    </span>
                  </span>
                  <span className="absolute inset-x-2 bottom-2 text-left text-xs text-ivory">{v.title}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      <Lightbox index={open} onClose={() => setOpen(null)} onNav={nav} />
      <VideoModal id={video} onClose={() => setVideo(null)} />
    </section>
  );
}
