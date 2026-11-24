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
| `node tests/db/test_db.mjs` | RLS/roles, ordering rules, idempotency, 25 concurrent bills, offers, status/payment rules, audit, anonymise, bulk (103 checks) |
| `node tests/e2e/mock_supabase.mjs` | starts the local API on :54400 (keep running) |
| `VITE_SUPABASE_URL=http://localhost:54400 VITE_SUPABASE_KEY=test npx vite build --outDir /tmp/dist-e2e` then serve on :4300 | test build |
| `python3 tests/e2e/order_flow.py http://localhost:4300/ [http://localhost:4301/]` | customer ordering on an Android-sized Chrome (51 checks); 2nd URL = a build without backend |
| `python3 tests/e2e_test.py http://localhost:4300/` | 3D story, menu, cart, bulk, phone/tablet layouts, reduced motion, no-WebGL (52 checks) |
| `python3 tests/e2e/admin_flow.py http://localhost:4300/` | admin login, all 14 sections, orders, payments, offers, menu, customers, bulk, notifications, settings (34 checks) |
| `python3 tests/e2e/audit_controls.py http://localhost:4300/` | inventory of every button/link: names, hrefs, overlays, touch-target size, overflow, LCP/CLS |
| `npm run typecheck && npm run lint && npm run build` | static checks |

Reset the database between suites (they create fixtures). Results are written to `tests/output/`.
