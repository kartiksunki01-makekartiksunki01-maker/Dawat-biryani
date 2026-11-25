# V3.2 — Premium design refinement (typography + brand-video intro)

Branch `v2` (Vercel preview). Production (`main`) is unchanged until the owner approves.

## 1. Typography
- **Cause of the slant:** the golden highlighted words were set in *Playfair Display Italic* (`italic` class), and the word-reveal animation also tilted each word by 4° while it slid in.
- **Fix:** every heading and golden word is now upright Playfair Display. The gold gradient and the gold sweep are unchanged, and the reveal still slides up but no longer rotates.
  - Files: `ui/Bits.tsx` (all section headings, e.g. "Our Royal **Menu**", "Born in Bhiwandi. **Inspired by Hyderabad.**"), `story/StorySection.tsx` (hero "**Awakened by Fire.**", "**Ingredient Symphony**", "**to Your Plate.**"), `finale/Finale.tsx`, `heritage/OurStory.tsx`, `bulk-orders/HotBox.tsx`, `motion/Motion.tsx`.
- **Sizes:** `.t-hero` and `.t-h2` in `src/styles/index.css` are ×0.99, i.e. 1% smaller at every screen width. Old and new values:

  | Class | Old | New |
  |---|---|---|
  | `.t-hero` | `clamp(2.6rem, 1.2rem + 5.2vw, 6.4rem)` | `clamp(2.574rem, 1.188rem + 5.148vw, 6.336rem)` |
  | `.t-h2` | `clamp(2.2rem, 1.3rem + 3.6vw, 4.9rem)` | `clamp(2.178rem, 1.287rem + 3.564vw, 4.851rem)` |

- **Unchanged:** body text, buttons, prices, navigation and `.t-h3`.
- **Remaining italics:** only small notes in the receipt, cart and chat. None of these are headings.

## 2. Intro = the uploaded film
**Files.** The source is `121011.mp4`: 1280×720, 24 fps, 10.03 s, H.264 + AAC stereo, 6.6 MB. It was re-encoded and nothing in the picture was changed: same frames, colours, framing, 16:9 and audio.

| File | What | Size |
|---|---|---|
| `public/assets/videos/dawat-intro-720.mp4` | main copy. H.264 High, CRF 23, faststart, original audio copied untouched. SSIM 0.985 against the original (visually identical). | 2.8 MB |
| `public/assets/videos/dawat-intro-480.mp4` | light copy, used only on Data Saver / 2G / 3G | 0.97 MB |
| `public/assets/videos/dawat-intro-poster.jpg` | first frame, preloaded, so loading is never a black screen | 48 KB |

**Behaviour.** The intro is built in `src/components/intro/Intro.tsx`.

- **Overlay.** A full-screen overlay with `object-fit: contain`, so the film is never stretched or cropped. On tall phone screens it is letterboxed on a dark royal backdrop.
- **Playback.** It uses muted autoplay with `playsInline`. A **Sound** button (bottom-left) turns the audio on or off. While the film is on screen, all site audio (music, ambience, effects) is held, so the two can never overlap.
- **Skip intro** sits top-right and is available from the first frame.
  - Styling: dark glass, a thin gold border, Cinzel type, a subtle hover, a 46 px touch target and safe-area spacing.
  - The Escape key also skips.
  - Skipping stops the film at once and dissolves the overlay in about 0.35 s.
- **Natural end.** When the film ends, the last frame pushes in slightly and fades into the homepage over about 0.9 s.
- **When it shows.** At most once per browser session (marked as soon as it starts). Never during in-page navigation. Never with reduced motion. Never when the admin has turned it off. Returning visitors skip it unless the admin enables "returning visitors". `?intro=preview` always plays it.
- **Failure handling.** None of these can leave the visitor on a black screen:
  - A missing or broken file opens the site at once.
  - No playback within 5 s (for example a dead connection) opens the site.
  - If autoplay is refused (for example iPhone Low Power Mode), a "Play intro" button appears. If nobody taps it, the site opens after 8 s.
  - If playback freezes mid-film for 4.5 s, the site opens.
  - An absolute cap of 25 s applies in all cases.
- **Scroll lock.** Scrolling is locked during the film and released when the intro ends, by Skip, or on any failure. A safety net releases it even if the fade fails. `scroll.ts` now also stops Lenis if the lock started before Lenis existed. Before this fix, wheel scrolling could move the page behind a long intro.
- **3D story.** The main 3D story still starts right after the intro (it is not mounted during the film, so playback stays smooth).

**Admin (Music & Intro).** The intro on/off toggle, "returning visitors" and "Preview intro" all remain. The old 2–3 s duration slider is removed because the length now comes from the video. The `intro_duration_ms` column stays in the database, unused. No database change was made.

## 3. Tests (local build + local test database; nothing sent to production)
TypeScript 0 errors · lint 0 errors (57 warnings, same as before) · DB 153/153 · ordering 51/51 · regression 51/51 · admin 39/39 · WhatsApp 36/36 · **intro 55/55** · **typography 32/32** · chat 37/37 · chat without Realtime 2/2.

Devices emulated in Chromium:
- Pixel 7 (Android phone)
- Galaxy Tab S4 (Android tablet), portrait and landscape
- Desktop 1440×900

**Not tested:**
- Real phones and tablets. Software-rendered Chromium was used instead; real iOS Safari and Android Chrome playback have not been checked.
- Real 3G speed. Only the switch to the 480p copy was tested.

## 4. Note on the film
The bottom-right corner of the film has a small ✦ sparkle mark. It is part of the uploaded video and was kept as is.
