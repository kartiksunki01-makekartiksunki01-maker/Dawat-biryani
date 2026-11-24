# Dawat Biryani House — V2.0 upgrade report

Date: 24 Nov 2026 · Branch: `v2` (backup of the previous live code: `backup/pre-v2-2026-11-24`)

Everything below was measured or executed. Nothing marked "tested" was assumed.

---

## 1. Root causes of the reported problems

| Reported problem | Root cause found | Fix |
|---|---|---|
| WhatsApp / order buttons "not working" | `CartDrawer` and `BulkOrders` opened WhatsApp with `window.open(url, '_blank', 'noopener,noreferrer')`. Chrome treats the features string as a pop-up and **silently opens nothing** (reproduced: 0 tabs opened on Android and desktop Chrome; a plain link opened 1). The site still showed "Opening WhatsApp…" and Anna said "Thank you!" — a false success. | All WhatsApp actions are now plain `<a href target="_blank">` links started by the customer's tap. WhatsApp is optional: orders and bulk enquiries are saved in the database first, with a real confirmation. |
| Enquiry not reaching the restaurant reliably | `saveLead()` was fire-and-forget; failures were swallowed and success was shown anyway. | Replaced by `place_order` / `submit_enquiry` database functions. The UI waits for the stored result; failures show an honest message and keep the customer's input. |
| "Add to Order" could silently do nothing | Menu cards remembered the old position-based portion id (`small`/`large`) after the live menu (database ids) replaced the built-in one. | Cards/sheet always resolve to a valid portion; `useAddToOrder` reports unavailable items instead of returning silently. Cart ids are now stable database ids, with a one-time migration of old saved carts (tested). |
| Intro laggy / too long | 6.4 s timeline + up to 10 s wait for the 3D scene; the 3D scene compiled **during** the intro and blocked the main thread (measured 3.6 s for a 1.8 s intro). | 1.8 s intro (admin-adjustable 1–3 s), the 3D scene now starts after the intro, returning visitors skip it. Measured 1.8–2.7 s on software rendering. |
| Repeated pop-ups for returning visitors | Anna's "already shown" flags lived in `sessionStorage`. | `localStorage` with per-event rules (once ever / once per visit); never interrupts typing in a form. |
| Old privacy text was untrue | Footer said no personal data is collected, while enquiries were stored in Supabase. | Rewritten to describe exactly what is stored and why. |
| Empty menu showed old cached items | `if (!data?.length) return` kept the cache. | A genuinely empty menu from the database is shown as empty. |
| Cart stored name/phone without asking | `persist` saved details always. | Saved only with "Remember my details"; "Forget my saved details" + "Clear cart" + "Forget order links" controls added. Old saved details are dropped on upgrade. |

## 2. Feature status

### Implemented and tested
- Real ordering: Place Order → server recalculates prices → atomic order + items + receipt + history + notification → unique bill number `DBH-YYYYMMDD-NNNN` (Asia/Kolkata date).
- Duplicate prevention: idempotency key + secret token. Tested: 3 instant taps → 1 order; 8 parallel requests with one key → 1 order; response lost after saving → retry returns the same order.
- Concurrency: 25 simultaneous orders → 25 unique, consecutive bill numbers. Numbers are never reused after cancellation.
- Server validation: prices, availability, sold-out, "price on enquiry" dishes, hidden dishes, quantity 1–50, phone, address, opening hours, closed days, special closing dates, lead time, max days ahead, minimum order, delivery on/off, delivery charge + free-delivery threshold, rate limits.
- Price change while in cart: detected, shown to the customer, never charged silently; re-confirmed order uses the new price.
- Receipt: ivory/gold receipt, PDF download (jsPDF), print (hidden frame), share/copy, track link. Shows "Order receipt, not a tax invoice". Price snapshots kept.
- Order tracking page (`/track.html#<id>.<token>`), auto-refresh every 30 s, "My orders on this device". Wrong token → refused.
- Offers: percent/fixed, coupon or automatic, whole menu/dishes/categories, min order, max discount, start/end, total and per-phone usage limits, activate/deactivate/duplicate/archive/delete, banner image, website banner + menu badges + checkout coupon with clear reasons.
- Admin panel (14 sections): Dashboard, Orders, Customers, Bills & Receipts, Offers, Menu, Bulk Orders, Enquiries & Leads, Notifications, Analytics, Website Appearance, Music & Animations, Restaurant Settings, Account & Security.
- Order workflow with enforced status transitions, reasons for reject/cancel, separate payment status (unpaid/paid/refunded + method), prep time shown to customer, archive, CSV export.
- Customers: built from real orders, history, notes, archive/restore, delete (no orders) or anonymise (keeps bills and amounts) with typed confirmation.
- Bulk: database-confirmed enquiry, quotation by restaurant, one-time conversion into a real order with bill number + share link.
- Notifications: one per event (DB-deduplicated), unread/read per admin, mark all read, optional sound and browser notifications, never re-announced after refresh. Realtime with 30 s polling fallback.
- Audit log of order, price, offer, settings and customer changes (without copying customer phone numbers).
- Returning-visitor memory, opt-in saved details, legacy cart migration.
- Security: RLS on every table, least-privilege grants, admin checks inside every admin function, storage uploads admin-only with type/size limits.

### Implemented, not fully tested
- **Supabase Realtime** push in the admin panel — the local test stack has no realtime server, so the polling fallback was what got tested. On production it should connect automatically. The panel says "Live updates connected / not connected".
- **Image and music uploads to Supabase Storage** — the admin UI and the storage rules (admin-only, size and type limits) are in production, but the local test only simulated the upload.
- **Uploaded background-music playback** (fade-in/out, loop, volume) — no real music file was available. The built-in ambience fallback works.
- **Browser notifications** — these depend on the device's permission prompt.
- **Real-device performance** — all measurements are from software rendering in a test browser.

### Blocked (missing credentials, assets or decisions)
- Online payment (UPI/cards): needs a payment provider account and keys. Orders are "pay at restaurant / on delivery"; the site never claims "paid".
- Cross-device "My orders" with customer login: needs customer authentication (OTP/SMS provider). Today orders are tied to the device that placed them, plus the private link.
- First-order-only and combo offers: these need verified customer identity or more rules. Percent/fixed offers on dishes and categories cover most cases.
- Licensed restaurant music: not supplied. Upload is ready.
- Real dish photos: not supplied. Upload is ready.

### Requires owner approval / confirmation
- WhatsApp number 919823324553 is unconfirmed. Turn on "confirmed" in Restaurant Settings once the owner confirms it.
- Delivery: **off** by default. Set the charge and area, then switch it on.
- Opening hours 10:00–22:00 on all days. Confirm any weekly off day.
- Tax/GST: off. Turn it on only if legally required; never enter a GSTIN you don't have.
- **Promoting the `v2` preview to the live site** (merge to `main`).
- Placing one real test order on the preview (it would create a real bill number in the live database).

## 3. Tests run (latest results in `tests/output/`)

| Suite | Where it ran | Result |
|---|---|---|
| Database (`tests/db/test_db.mjs`) — RLS, roles, ordering, idempotency, concurrency, offers, transitions, audit, anonymise, bulk | Local Postgres with the same migrations | **103 / 103** |
| Ordering E2E (`tests/e2e/order_flow.py`) — Android-sized Chrome, real DB functions | Local build + local DB | **51 / 51** |
| Regression E2E (`tests/e2e_test.py`) — 3D story, menu, cart, bulk, mobile/tablet, reduced motion, no-WebGL | Local build + local DB | **52 / 52** |
| Admin E2E (`tests/e2e/admin_flow.py`) — login, non-admin block, all 14 sections, orders, payments, bills, offers, menu, customers, bulk, notifications, settings, mobile | Local build + local DB | **34 / 34** |
| Production checks after the migration | Live Supabase API (read-only / refused-before-write probes) | All passed (section 5) |

Production was never used for test orders.

## 4. Button and icon inventory

An automated scan of every visible link, button and form control was run at 360 px, 768 px and 1280 px:

| Viewport | Controls | Without a name | Empty or placeholder `href` | Covered by an overlay | Horizontal overflow |
|---|---|---|---|---|---|
| Phone 360 | 96 | 0 | 0 | 0 | 0 px |
| Tablet 768 | 98 | 0 | 0 | 0 | 0 px |
| Desktop 1280 | 113 | 0 | 0 | 0 | 0 px |

These controls were smaller than 40 px and have been enlarged to 40 px: the quantity −/+ buttons, "Details & instructions", the footer links and the footer phone link. The full list is in `tests/output/controls_audit.json`.

Behaviour verified by the tests:

| Element | Where | Expected | Result |
|---|---|---|---|
| Skip intro | Intro | Visible immediately, closes the intro | Pass |
| Add to Order (card + sheet) | Menu | Adds the stable portion; sold-out is disabled | Pass |
| Portion selector, qty ± | Menu, cart | Changes portion and quantity | Pass |
| Cart icon | Navbar | Opens the drawer | Pass |
| Remove item, Clear order | Cart | Removes or clears with confirmation | Pass |
| Continue to checkout, Back | Cart | Switches steps | Pass |
| Pickup/Delivery, ASAP/Schedule, date/time | Checkout | Follows settings and hours | Pass |
| Coupon Apply/Remove | Checkout | Server validation with a reason | Pass |
| Remember / Forget details | Checkout, Settings | Opt-in storage | Pass |
| Place order | Checkout | One order, honest errors, retry-safe | Pass |
| Download PDF, Print, Share, Track, View receipt | Receipt | Each works | Pass (share falls back to copy) |
| WhatsApp links (navbar, menu enquire, receipt, bulk) | Several | Open `wa.me/919823324553` with encoded text | Pass |
| Call links | Several | `tel:+919823324553` | Pass |
| Send enquiry (bulk) | Bulk | Saved in the DB, then optional WhatsApp | Pass |
| Settings panel: quality, sound, music, effects, voice, Anna, data controls | Navbar | Toggles persist | Pass (sound needs a tap — browser rule) |
| Admin: login/logout, every sidebar item, accept/reject/status/payment/notes/archive, receipt PDF, offer CRUD, sold-out/price edit, customer anonymise, bulk quote/convert, mark all read, settings save | Admin | Writes the right row; invalid input blocked | Pass |

## 5. Security verification

**Local database tests**

- A visitor can read the menu and settings only.
- A visitor cannot read orders, customers, receipts, notifications, the audit log, bill counters or admins.
- A visitor cannot change prices or settings, cannot create offers or orders directly, and cannot run admin or internal functions.
- A signed-in user who is not an admin sees no orders and cannot change anything.
- The admin cannot edit the bill number or amounts of an order.
- Invalid status or payment changes are refused.

**Production checks after the migration**

- All 13 private tables return 401 to visitors.
- Visitor writes to settings, orders and offers are refused (401).
- Admin and internal functions are not callable by visitors.
- An order with an invalid phone number is rejected before anything is written.
- A wrong order token is refused.
- The old website's menu query still works.

**Integrity**

- 25 of the 26 database functions in production are byte-identical to the tested ones.
- The remaining one (`_next_bill_number`) differs only by a removed code comment; this was verified by rebuilding it and comparing the hash.

**Supabase advisors after the migration**

The intended public functions (storefront, quote, place order, order receipt, my orders, enquiry) are flagged as "callable by visitors". This is on purpose: each one validates its own input, and order data is returned only with the secret token.

- `is_admin` was made non-public.
- `bill_counters` has no policies on purpose; only the order functions can use it.
- **Leaked-password protection** is off. Turn it on in Supabase → Authentication → Passwords if your plan includes it.

**Other measures**

- Customer IPs are not stored. Only a daily-salted hash is kept, for rate limits.
- CSV exports neutralise spreadsheet formulas.
- Admin and track pages are sent with `noindex`, `X-Frame-Options: DENY` and `no-referrer`.

## 6. Performance (local build, software-rendered Chrome, no network throttling — not a real phone)

| Scenario | LCP | CLS | Tap → next paint |
|---|---|---|---|
| Phone, first visit | 0.68 s | 0.026 | 129 ms |
| Phone, returning | 0.28 s | 0 | 125 ms |
| Desktop, returning | 0.38 s | 0.009 | 277 ms |

Initial JavaScript (gzip):

- Home page: 282 KB. The 3D scene (~272 KB gzip) loads only after the intro.
- Track page: 190 KB.
- Admin: 167 KB.
- The PDF library loads only when "Download PDF" is pressed.

Real-network and real-device numbers must be measured on the preview, for example with PageSpeed Insights.
