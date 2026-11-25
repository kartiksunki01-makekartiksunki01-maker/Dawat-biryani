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
| `node tests/db/test_db.mjs` | RLS/roles, ordering rules, idempotency, concurrent bills, coupons (limits, expiry, delete-protection), status/payment rules, audit, anonymise, bulk, live chat (isolation, forged tokens, spam, purge), real-time push trigger, WhatsApp number migration (153 checks) |
| `node tests/e2e/mock_supabase.mjs` | starts the local API on :54400 **with a local Realtime stand-in** (`mock_realtime.mjs`: broadcast + Postgres Changes with RLS). `NO_REALTIME=1` starts it without push |
| `VITE_SUPABASE_URL=http://localhost:54400 VITE_SUPABASE_KEY=test npx vite build --outDir /tmp/dist-e2e` then serve on :4300 | test build |
| `python3 tests/e2e/order_flow.py http://localhost:4300/ [http://localhost:4301/]` | customer ordering on an Android-sized Chrome (51 checks); 2nd URL = a build without backend |
| `python3 tests/e2e_test.py http://localhost:4300/` | 3D story, menu, cart, bulk, phone/tablet layouts, reduced motion, no-WebGL (51 checks; needs opening hours open all day) |
| `python3 tests/e2e/admin_flow.py http://localhost:4300/` | admin login, all sections, orders, payments, coupons, menu, customers, bulk, notifications, settings (39 checks) |
| `python3 tests/e2e/whatsapp.py http://localhost:4300/` | every WhatsApp button on Android phone/tablet, iPhone, iPad, desktop; same-tab vs new-tab; overlays; tablet receipt; fallback panel (36 checks) |
| `python3 tests/e2e/intro.py http://localhost:4300/` | logo intro length (measured in-page), skip, session memory, reduced motion, admin toggle (15 checks) |
| `python3 tests/e2e/chat_flow.py http://localhost:4300/` | two browsers (customer phone + admin desktop): push delivery both ways, unread badge/preview/title, admin inbox actions, settings, isolation (37 checks) |
| `NO_REALTIME=1` mock + `python3 tests/e2e/chat_fallback.py http://localhost:4300/` | chat still delivers by polling when Realtime is unavailable (2 checks) |
| `python3 tests/e2e/audit_controls.py http://localhost:4300/` | inventory of every button/link: names, hrefs, overlays, touch-target size, overflow, LCP/CLS |
| `npm run typecheck && npm run lint && npm run build` | static checks |

Reset the database between suites (they create fixtures). Results are written to `tests/output/`.
