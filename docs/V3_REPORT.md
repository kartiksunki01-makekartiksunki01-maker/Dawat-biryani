# Dawat Biryani House — V3 update report (WhatsApp fix, coupons, logo intro, live chat)

Branch: `v2` (preview). Production (`main`) is unchanged until you approve.
Everything below was tested on a LOCAL database + local build (never on production data). "Tested" means a script ran and passed; see §7 for what could NOT be tested.

## 1. WhatsApp
**What I could and could not prove.** The previous fix (plain `<a target=_blank>`) was correct in code, but it still relied on a new tab that Chrome Custom Tabs / in-app browsers / tablets without the WhatsApp app handle badly, and it gave the customer no way out when nothing opened. I cannot open the real WhatsApp app from a server, so I cannot claim your exact device failure is "fixed" — I fixed everything that can be verified and added a safety net:
- One shared `WhatsAppLink` component now powers **all 8 WhatsApp buttons** (navbar, finale, menu card, product sheet, cart, bulk enquiry ×2, receipt).
- Phones/tablets: opens `https://wa.me/919823324553?text=…` in the **same tab** (the app/universal-link hand-off works; a blank new tab often doesn't). Desktop: new tab (wa.me offers app or WhatsApp Web).
- If nothing opens within 2.2 s, a panel appears: **WhatsApp Web, Call, Copy message, Copy number**.
- Number: `919823324553` = +91 (India) + 9823324553, same as the restaurant phone. **I cannot verify that this number is registered on WhatsApp.** If it isn't, wa.me shows "phone number invalid" — that alone would explain "button not working". Please open wa.me/919823324553 on your phone once; if it fails, set a WhatsApp-enabled number in Admin → Restaurant Settings (no redeploy needed).
- Tested (17 checks): Android + iPhone + desktop profiles; link format; nothing overlays the button (elementFromPoint); same-tab/new-tab behaviour; fallback panel + its links.

## 2. Coupons & Discounts (admin) + cart
Backend (offers table, server-side validation, redemptions) already existed from V2 but was easy to miss ("Offers & Discounts / New offer"). Now:
- Sidebar: **Coupons & Discounts**, button **Create coupon**.
- Percent/fixed, min order, max discount, start/expiry, total + per-phone limits, active toggle, edit, duplicate, archive/delete (used coupons are archived to keep history).
- Summary tiles (live coupons, times used, total discount given) + **View usage** list (bill number, date, discount).
- Customer: coupon box now in the **cart** (live check: "✓ CODE applied — you save ₹X" or the exact reason) and in checkout; discount is on the receipt (screen, PDF, print) and in admin order detail.
- Tested: create → order with coupon → DB discount → stats → usage list → edit → archive (admin 39/39).

## 3. Intro
Removed the cinematic intro (hand/pot/arch). New: royal-maroon background, golden glow, **original logo** reveal, name + gold rule + tagline, 10 CSS golden motes. 2.4 s total (admin-adjustable 2–3 s). **Skip intro** button (44 px). Remembered per **session** (viewed or skipped); not shown again on reload/navigation; reduced-motion = no intro; admin toggle = Music & Animations → "Show the intro". No 3D during the intro.
Bug found & fixed while testing: on a first visit the intro could flash even when the admin had disabled it (settings not loaded yet). It now waits ≤0.9 s behind a plain dark cover.

## 4. Live chat (replaces Ask Anna)
- Customer: launcher in the old Ask Anna spot (56 px), compact window, timestamps, day separators, admin online/offline, unread badge, auto-scroll, minimize / close / Esc, history survives refresh, optimistic send + Retry on failure, hides while cart/menu overlays are open.
- Admin → **Live Chat**: inbox, unread counts, search, Active/Resolved/Archived, reply, mark read, resolve/re-open, archive/restore, delete, availability toggle, welcome + offline messages, widget on/off, retention days + "delete expired now", sidebar unread badge, notification entry.
- Backend (`20261125090000_v3_live_chat.sql`): `chat_settings`, `chat_conversations`, `chat_messages`; customer access only via `chat_send/chat_fetch/chat_status` functions using a random secret token (only its SHA-256 stored); duplicate-proof (client message id); rate limits (15 msgs/min/chat, 5 new chats/h/device, 300/h global); 1000-char limit; RLS: admin-only read, **no** table access for visitors; admin cannot even read token hash; notification once per unread streak; auto offline reply once per 30 min.
- "Online" = you switched availability on **and** the admin panel pinged in the last 5 minutes (so it can't say Online while you're away).
- Retention: chats older than the retention days are deleted when a new chat starts, or via the admin button (no scheduler needed).
- Tested: DB 144/144 (41 chat checks incl. cross-customer isolation, forged tokens, spam, purge); browser 33/33 with two real browsers (customer phone + admin desktop).

## 5. Bugs fixed during this work
1. First chat message could vanish from the screen (poll raced the conversation creation) — fixed.
2. Intro flashing when admin-disabled — fixed.
3. Old Anna admin controls and footer text removed (no dead settings).

## 6. Files
New: `src/components/ui/WhatsAppLink.tsx`, `src/components/chat/ChatWidget.tsx`, `src/lib/chatApi.ts`, `src/admin/chat.tsx`, `src/admin/sections/LiveChat.tsx`, `supabase/migrations/20261125090000_v3_live_chat.sql`, tests `tests/e2e/{whatsapp,intro,chat_flow}.py`.
Changed: Intro, CartDrawer, Receipt, Navbar, Finale, MenuCard, ProductSheet, BulkOrders, App, Footer, AdminApp, Offers, Appearance, MusicAnimations, notifications, NotificationsPage, utils/order, index.css, existing tests.

## 7. Not tested / limits (honest)
- Real WhatsApp app hand-off on a real phone, and whether the number is on WhatsApp.
- Supabase Realtime push for admin (needs the real Supabase); polling every 8 s is tested and is the fallback. The customer side uses 3 s polling (not push).
- Chat on real mobile keyboards (visual viewport), real-device performance.
- The only DB change to an existing object: `notifications.kind` CHECK widened (adds `new_chat`) + one nullable column. Nothing dropped, no data touched.

## 8. Deploy
1. Apply `20261125090000_v3_live_chat.sql` (Supabase SQL editor, or I apply it on your OK). 2. Preview deploy of `v2` builds automatically. 3. Test: admin → Live Chat → switch "Available" on; open the site on a phone, send a message, reply. 4. Say "live karo" → merge `v2` → `main`. Rollback: Vercel → Deployments → previous → Promote; chat tables can stay (harmless).
