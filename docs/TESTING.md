# Testing & quality report

Date: 24 Nov 2026 · Build: `npm run build` (TypeScript 7 `tsc -b` + Vite 8) — **passes with no type errors**.

## Automated end-to-end test — 54 / 54 passed

`tests/e2e_test.py` (Playwright, Chrome with SwiftShader software WebGL) against the **production build** (`npm run preview`).

| Area | Checks |
|---|---|
| Intro | Skip control visible · intro unmounts after the scene is ready · seen-flag stored per session · returning visitors get the short version · Skip closes it |
| 3D story | Canvas renders · hero hides on forward scroll · **reverse scroll restores it** · chapter navigation state |
| Menu | Vegetarian (3) / Seafood (1) / All (12) filters · search · empty-search state · no crossed-out ₹150 for Chicken Tikka |
| Cart | Badge count · 2×₹150 + ₹220 = **₹520** · qty change → ₹740 · remove → ₹440 · empty-name and invalid-phone validation · WhatsApp URL to `+91 9823324553` · message contains every required field (see `docs/sample-order-message.txt`) · copy-to-clipboard · `tel:` link · Escape closes · **persists after reload** |
| Product sheet | Opens with details |
| Bulk | 8 kg + time < 2 h shows notice warning · valid enquiry produces "Quantity: 8 kg" quotation message |
| Settings / host | Quality switch to Low · Anna dock present · speech bubble on *Talk to Anna* |
| Links | Directions, Instagram, YouTube, Google |
| Responsive | No horizontal overflow on desktop 1440, Pixel 7, 1280×800 and 800×1280 (Xiaomi Pad 6 CSS viewport) · mobile nav drawer · touch targets ≥ 36 px in the menu (interactive buttons are 44 px+) |
| Reduced motion | Short intro · Lenis smooth scroll disabled · no console errors |
| No WebGL | Static fallback hero · ordering still works · *Experience the Dum* anchor works |
| Console | **No errors** and no warnings from site code in any scenario (filtered out: GPU-driver notices from software rendering and the library notice below) |

## Manual / visual checks

Screenshots in `docs/screenshots/` — every chapter of the scroll story (desktop, phone, tablet), menu, product sheet, cart, bulk, Anna's gestures (idle, namaste, point, present-plate, celebrate, thank-you), reduced-motion and no-WebGL fallback.

## Not verified here (please check on real devices)

* **Real-GPU frame rate.** Tests ran on CPU software rendering, so FPS numbers are not meaningful. The site targets 60 FPS on capable devices and lowers quality automatically, but no frame rate is guaranteed until tested on the actual Xiaomi Pad 6 and phones.
* **Real WhatsApp delivery** — the `wa.me` link format and message were verified; whether the number accepts WhatsApp orders must be confirmed by the owner.
* **Google Maps embed** — loads only after the visitor taps *Load Google Map*; the embed itself wasn't loaded in the sandbox (no internet to Google).
* **Voice** — uses the browser's Web Speech API; available voices differ per device.
* **YouTube player** — code path exists, but no video IDs were supplied, so it's hidden.
* **Safari / iOS** — not tested in this environment.

## Known limitations

* Logo and dish images are cropped from the supplied promotional mockups, so they're lower resolution than original files would be (dish images look soft in the large product view).
* The character ZIP wasn't supplied; Dawat Anna is procedural (see `docs/CHARACTER.md`).
* Admin dashboard needs a backend (see `docs/ADMIN.md`).
* React Three Fiber 9.8 prints a `THREE.Clock … deprecated` notice with Three.js r187 (library-level, harmless; disappears when R3F updates).
* In `npm run dev` only, React StrictMode prints "Attempted to synchronously unmount a root…" from Drei's `<Html>` labels; it does not occur in the production build.
* The main JS chunk is ~216 KB gzipped; the 3D engine (~272 KB gzipped) loads lazily during the intro.
