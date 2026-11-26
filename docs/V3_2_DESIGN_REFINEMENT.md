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

## V3.3 (owner request, 25 Nov)
- **Intro film replaced** with `121027.mp4` (1280×720, 10.0 s), re-encoded the same way (720p 2.8 MB, SSIM 0.986; 480p 0.94 MB; poster frame). File names unchanged.
- **Skip intro (or Esc) → straight to the menu** (`#menu`, where orders are placed). If the film plays to its end, the visitor lands on the homepage top.
- **Background music = "Saffron and Gold"** (`public/assets/audio/saffron-and-gold.mp3`, 2:57, 128 kbps, 2.8 MB, loops).
  - It is the built-in track whenever no track is uploaded in admin (production has none, so this one plays). An admin upload still overrides it.
  - Browsers forbid sound before the visitor interacts, so it starts on the first tap/click/key (for example the Skip tap). It stays silent while the intro film is on screen.
  - The navbar sound button / Settings → Sound mutes it, and that choice is remembered on the device. The admin "music on/off" switch is still respected.
- **3D handi scroll story removed.** The site opens on the static royal hero (same headline, buttons, open-status chip and Dum Experience callouts). The old component is kept as `ScrollStory3D` (not rendered) for an easy restore.
- **No database, repository or other feature change.**

Tests: intro 64/64, typography 32/32, regression 50/50 (3D checks replaced by static-hero checks), ordering 51/51, admin 39/39, WhatsApp 36/36, chat 37/37 + 2/2, DB 153/153, TypeScript 0 errors.

## V3.5 (owner request, 26 Nov) — admin fixes
Reported after going live: "can't add dish photos" and "a notification badge shows although there is nothing there". No database change, no new repository.

- **Dish photos.** The only upload control was a small native "Choose file" button inside the dish edit form, easy to miss on a tablet, and any phone photo over 5 MB was refused.
  - Every row of **Menu Management** now has a photo with a camera badge: tap it, pick a picture (gallery or camera), and it is saved at once.
  - The dish edit form shows the photo at the top with a large **Add photo / Change photo** button, a **Remove photo** button, and **Go back to the original picture** while editing a built-in picture.
  - Photos are shrunk in the browser before upload (longest side 1600 px, WebP/JPEG) when larger than about 1.2 MB, so normal 5–15 MB phone photos work. Small pictures are uploaded as chosen. An unreadable file (for example an iPhone HEIC) gives a clear message.
  - Uses the same existing `images` storage bucket and admin-only upload policy.
- **Orders badge vs. list.** The red Orders badge counts every pending order from any day, but the Orders page opened on "Today", so two pending orders from the day before were counted yet hidden. **Open orders** now lists every open order from any day (the date filter is disabled for that status, with a one-line explanation). Other statuses still use the date filter.
- **Chat badge.** Opening a conversation already cleared the Live Chat badge, but its "New chat message" entry stayed unread in the Notifications bell. Opening (or marking read / resolving / archiving) a conversation now marks that entry read too.
- The two old pending orders in production were not touched; mark them Completed or Cancelled in Orders if they were only tests.

Tests: new `tests/e2e/admin_fixes.py` (30 checks). Run against the previous code it fails 4 of them (orders hidden, date filter, bell count, read record), and passes 30/30 with the fixes.
