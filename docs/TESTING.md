# Testing (never against production)

All suites run on a **local** Postgres with the same migrations as production, plus a small local
stand-in for the Supabase API (`tests/e2e/mock_supabase.mjs`). Every script refuses to run against
a `supabase.co` address or a non-localhost site.

## 1. Local database
```bash
mkdir -p /tmp/staging && cd /tmp/staging && npm init -y && npm i embedded-postgres pg
# start Postgres on port 54329 (see the startdb.mjs example in this file's history), then apply:
#   tests/db/supabase_stub.sql  (roles anon/authenticated, auth.uid(), storage, realtime stand-ins)
#   supabase/migrations/*.sql   (in order)
```

## 2. Suites
| Command | What it checks |
|---|---|
| `node tests/db/test_db.mjs` | RLS/roles, ordering rules, idempotency, concurrent bills, coupons (limits, expiry, delete-protection), status/payment rules, audit, anonymise, bulk, live chat (isolation, forged tokens, spam, purge), real-time push trigger, WhatsApp number migration (154 checks) |
| `node tests/db/test_bulk.mjs` | V3.6 bulk menu: all 12 dishes + prices, seed re-run never overwrites admin edits, regular prices untouched, public/admin/non-admin permissions, private note column, server pricing (4 examples + multi-dish ₹7,800), browser prices never trusted, price-change and unavailable detection, kg/total limits, IST timing + advance notice, duplicates (sequential and parallel), rate limit, quotation → order (discount / adjustment line, unique bills, rejected, legacy enquiries) (79 checks) |
| `node tests/db/test_cleanup.mjs` | V3.7 deletes: finished orders only (active refused), bill register rows, cascades, bill numbers never reused, converted-enquiry/used-coupon links cleared safely, customer delete keeps anonymised orders, notifications/chats delete, cleanup preview/run/auto (off by default, once a day), period limits, media list + 'used by', visitor/non-admin refused (41 checks) |
| `node tests/e2e/mock_supabase.mjs` | starts the local API on :54400 **with a local Realtime stand-in** (`mock_realtime.mjs`: broadcast + Postgres Changes with RLS). `NO_REALTIME=1` starts it without push |
| `VITE_SUPABASE_URL=http://localhost:54400 VITE_SUPABASE_KEY=test npx vite build --outDir /tmp/dist-e2e` then serve on :4300 | test build |
| `python3 tests/e2e/order_flow.py http://localhost:4300/ [http://localhost:4301/]` | customer ordering on an Android-sized Chrome (51 checks); 2nd URL = a build without backend |
| `python3 tests/e2e_test.py http://localhost:4300/` | 3D story, menu, cart, bulk, phone/tablet layouts, reduced motion, no-WebGL (51 checks; needs opening hours open all day) |
| `python3 tests/e2e/admin_flow.py http://localhost:4300/` | admin login, all sections, orders, payments, coupons, menu, customers, bulk, notifications, settings, used coupon delete (39 checks) |
| `python3 tests/e2e/admin_fixes.py http://localhost:4300/` | open orders from earlier days are listed (badge = list), opening a chat clears its bell notification, dish photo upload from the menu row and the edit form, >5 MB phone photo shrinks before upload, bad file message, remove / go back to original, phone-size layout (30 checks) |
| `python3 tests/e2e/bulk_flow.py http://localhost:4300/ http://localhost:4301/` | Bulk & Special Orders customer side: rename, 11 published dishes and prices, photo placeholder, filters + search, calculator (slider, typed kg, ±, limits), handi canvas not remounted, multi-dish totals, edit/remove, separate from the plate cart, 20 kg total limit, WhatsApp/copy/call text, IST timing, live price change caught before sending, sold-out dish, double-tap creates one enquiry, stored snapshot, phone/tablet layout + pill, reduced motion, no-backend build (59 checks) |
| `python3 tests/e2e/bulk_admin.py http://localhost:4300/` | Bulk admin: renamed nav + two tabs, enquiry details (dishes, kg, ₹/kg, totals, event, date, delivery, notes), use-estimate/save/confirm/convert (bill, per-dish receipt lines), reject, status filter, CSV, price edit validation + preview + persistence + storefront sync + history kept, show/hide, sold out, row photo upload, reorder, add/archive/restore, filters, total limit, apply-to-all rule, phone layout (47 checks) |
| `python3 tests/e2e/admin_cleanup.py http://localhost:4300/` | V3.7 admin: select-all/CSV/bulk delete with progress for orders, customers, enquiries, bulk enquiries, dishes, bulk dishes, coupons (expired filter, live used coupon), chats, notifications, media; order edit + single delete; active orders protected; deleted-bills register; media in-use protection, delete unused, make-smaller; dish photo removed with dish; Data Cleanup settings/CSV/clean now; phone layout; no console errors (35 checks) |
| `python3 tests/e2e/whatsapp.py http://localhost:4300/` | every WhatsApp button on Android phone/tablet, iPhone, iPad, desktop; same-tab vs new-tab; overlays; tablet receipt; fallback panel (36 checks) |
| `python3 tests/e2e/intro.py http://localhost:4300/` | brand-video intro: real playback to the end + fade, muted autoplay/playsinline, 16:9 not stretched, Skip (stops at once, top-right, 44px+), Escape, sound toggle, scroll lock/release, no other site audio during the film, once per session, 3G → 480p copy, broken file, hanging download, autoplay refused, mid-film stall, reduced motion, returning visitors, admin off, preview (55 checks) |
| `python3 tests/e2e/typography.py http://localhost:4300/ type` | upright Playfair headings + gold words (no italic, no skew/rotate), gold gradient kept, `.t-hero`/`.t-h2` exactly 1% smaller, on phone / tablet / tablet landscape / desktop (32 checks) |
| `python3 tests/e2e/chat_flow.py http://localhost:4300/` | two browsers (customer phone + admin desktop): push delivery both ways, unread badge/preview/title, admin inbox actions, settings, isolation (37 checks) |
| `NO_REALTIME=1` mock + `python3 tests/e2e/chat_fallback.py http://localhost:4300/` | chat still delivers by polling when Realtime is unavailable (2 checks) |
| `python3 tests/e2e/audit_controls.py http://localhost:4300/` | inventory of every button/link: names, hrefs, overlays, touch-target size, overflow, LCP/CLS |
| `npm run typecheck && npm run lint && npm run build` | static checks |

Reset the database between suites (they create fixtures). Results are written to `tests/output/`.
