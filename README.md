# Dawat Biryani House — The Royal Digital Experience

A cinematic, scroll-driven 3D restaurant website for **Dawat Biryani House**, Dhamankar Naka, Bhiwandi.

Built with React 19, Vite 8, TypeScript, Tailwind CSS 4, Three.js / React Three Fiber / Drei, GSAP ScrollTrigger, Lenis, Framer Motion, Zustand and the Web Audio API.

---

## 1. Quick start (beginner friendly)

**You need:** [Node.js](https://nodejs.org) **20.19 or newer** (22 LTS recommended).

```bash
# 1. open a terminal in this folder, then install everything (one time)
npm install

# 2. start the development server
npm run dev
#    → open the address it prints, usually http://localhost:5173

# 3. make the production build (outputs to the dist/ folder)
npm run build

# 4. preview the production build locally
npm run preview
#    → http://localhost:4173
```

Other commands: `npm run typecheck` (TypeScript only) and `npm run lint`.

### Deploying

`dist/` is a static website — upload it to any static host (Netlify, Vercel, Cloudflare Pages, GitHub Pages, cPanel hosting…). The build uses relative paths, so it also works from a sub-folder.

For absolute SEO URLs and a `sitemap.xml`, set your domain at build time:

```bash
SITE_URL=https://www.your-domain.in npm run build
```

---

## 2. Editing restaurant information

**Everything business-related lives in one file:** `src/data/restaurant.ts`

| What | Where in the file |
|---|---|
| Name, taglines, founder, address, phone, hours | `restaurant` |
| WhatsApp number (+ `confirmed` flag) | `restaurant.whatsapp` |
| Social links + dated follower snapshot | `restaurant.social`, `restaurant.socialSnapshot` |
| Menu items, prices, portions, veg/non-veg | `menu`, `portionLabels` |
| Bulk-order rules, event types, per-kg prices | `restaurant.bulk` |
| Hot-box warmth claim (hidden until verified) | `restaurant.hotBox` |
| Gallery images, YouTube videos, kitchen photos | `gallery`, `videos`, `careMedia` |
| Genuine customer reviews | `reviews` |

Items marked **CONFIRM** in the file are waiting for the owner. Until then the site shows honest wording (for example "Price on enquiry" or "portion names are provisional").

### Replacing images
Put new files in `public/assets/images/…` and update the paths in `restaurant.ts`. Set `imageKind: 'photo'` for real photographs so the "Promotional artwork" label disappears.

### Adding YouTube Shorts
Add entries like `{ youtubeId: 'abc123XYZ', title: 'Dum opening' }` to `videos` — the gallery shows a poster grid and a modal player (no autoplay of multiple videos).

---

## 3. What's inside

| Feature | Notes |
|---|---|
| **Brand video intro** (~10 s) | The restaurant's own film (`public/assets/videos/`, 720p + 480p for slow connections, poster frame). Muted autoplay + playsinline, optional sound, premium *Skip intro* (top-right), fades into the homepage when the film ends, once per browser session, never with reduced motion, admin on/off + preview. Falls back to the site on any playback problem (never a black screen). |
| **Master scroll story** | One pinned section, one GSAP timeline (`scrub: 1.2`) synced with Lenis. Chapter I sealed handi → II lid breaks the dough seal, steam rises → III exploded ingredient symphony with labelled leader lines and cursor reaction → IV ingredients settle onto a plated biryani → dissolve into the menu. Fully reversible. |
| **Procedural 3D** | Lathe-geometry hammered-brass handi with procedural normal/roughness maps, engraved band, dough seal that cracks into segments, lid, charcoal bed with flickering glow, GPU steam, golden dust, instanced rice/saffron/spices/leaves/chicken/paneer, brass thali. No downloaded 3D files or HDRIs. |
| **Dawat Anna (virtual host)** | Procedural stylised character with real hierarchical joints: idle breathing, head movement, blinking, namaste, wave, point, present-a-plate, celebrate, thank-you. Context-aware speech bubbles, *Talk to Anna*, menu guidance, hide, optional voice (Web Speech API) with captions. Starts minimised on phones/tablets. |
| **Menu** | Category tabs, live search, two-portion picker, quantity, add to order, 3D tilt + cursor spotlight, shared-element product sheet with per-dish instructions and related items. |
| **Cart** | Zustand + localStorage, live subtotal, remove/clear, details form with validation and consent, WhatsApp enquiry, copy order, call. No invented taxes/delivery fees. |
| **Bulk & Special Orders** | Per-kg bulk menu from the database (separate from plate prices), filters + search, 1–20 kg slider / ± / typed kg, live estimate, multi-dish bulk order with a 20 kg total limit, 3D handi on a spring, server-priced enquiry (no duplicates), WhatsApp/copy/call; admin manages the bulk menu and turns quotations into bills. See `docs/V3_6_BULK_SPECIAL_ORDERS.md`. |
| **Other sections** | Story & heritage, Crafted with Care, Gallery & social (lightbox), Reviews (no fabricated reviews), Finale banner, Visit Us with live open/closed status (Asia/Kolkata) and click-to-load map. |
| **Performance** | Auto quality (PerformanceMonitor) + manual High/Medium/Low; DPR clamped 1–1.5; instancing; 3D canvases lazy-loaded and paused off-screen; bloom only on High. |
| **Accessibility** | Semantic landmarks, skip link, focus-trapped dialogs with Escape, visible focus, ≥44 px targets, `prefers-reduced-motion` support, captions for voice, no autoplay audio. |
| **Fallback** | Without WebGL the site shows a static hero; menu, cart and enquiries keep working. |
| **Sound** | Original synthesised (Web Audio) tanpura-like drone, lid clink, sizzle, chimes — muted by default, volume control. |
| **SEO** | Restaurant JSON-LD generated from the config (no ratings), Open Graph/Twitter tags, favicon set from the logo, manifest, robots.txt, optional sitemap. |

### Project structure

```
src/
  data/            restaurant.ts (single source of truth), types.ts
  stores/          cartStore, uiStore (settings + UI), hostStore (Anna)
  utils/           order messages, hours, scroll (Lenis), sound, device, format
  hooks/           media queries, in-view, active section
  components/
    intro/ navigation/ story/ three/ character/ menu/ cart/
    bulk-orders/ heritage/ care/ gallery/ reviews/ location/ finale/ motion/ ui/
public/assets/     images (logo, dishes, art), models/, textures/, audio/ (reserved)
tests/e2e_test.py  Playwright end-to-end test (see docs/TESTING.md)
```

---

## 4. Honesty notes & things the owner should confirm

* **Logo** — cropped from the supplied promotional mockup (the original logo file was not supplied separately). Replace `public/assets/images/logo.png` with the high-resolution original when available.
* **Dish images** — cropped from the brand's promotional artwork and labelled as such; they are not photographs of actual servings.
* **3D character** — the archive `south-indian-men-traditional-fit.zip` was **not received**. Dawat Anna was therefore modelled procedurally from the supplied reference image. See `docs/CHARACTER.md` for how to drop in a GLB later.
* **Portion names** "Regular / Large", **WhatsApp ordering**, **opening days**, **hot-box duration**, **delivery** and **per-kg bulk prices** are all flagged `CONFIRM` in the config.
* Social figures are shown as a **dated snapshot (24 Nov 2026)**, not live numbers.
* No reviews, ratings, awards or certifications are invented.

## 5. Admin dashboard

Not included as a fake panel. Persistent editing needs a backend — see `docs/ADMIN.md` for the recommended setup and which features depend on it. Until then, edit `src/data/restaurant.ts` and rebuild.

## 6. Testing

See `docs/TESTING.md` for what was tested, results, and known limitations.

## Backend & admin panel
The site now reads dishes/prices from Supabase and saves enquiries as leads; the owner manages both at `/admin`.
Setup steps (admin login, Vercel deploy, env variables): see `docs/BACKEND_SETUP.md`. Env template: `.env.example`.

## V2.0 — real ordering & restaurant management (Nov 2026)
- Customers place real orders (no payment online): server-checked prices, unique bill numbers, receipt PDF/print, tracking page.
- Admin panel at `/admin` with 14 sections (orders, customers, bills, offers, menu, bulk, enquiries, notifications, analytics, appearance, music & intro, settings, security).
- Database migrations: `supabase/migrations/` (already applied to production; additive only).
- Reports and guides: `docs/V2_REPORT.md`, `docs/ADMIN_GUIDE.md`, `docs/DEPLOY_AND_ROLLBACK.md`, `docs/TESTING.md`.

