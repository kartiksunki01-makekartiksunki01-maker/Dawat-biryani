# Dawat Biryani House: V3 completion report

**Date:** 25 Nov 2026
**Branch:** `v2` (Vercel preview). The live site (`main`) has **not** been changed and is waiting for your approval.

Every result below comes from a script that actually ran. Unless marked "production", it ran against a local copy of the database, never the real one.

---

## 1. WhatsApp: root cause and fix (priority 1)

**What you reported:** on an Android tablet with WhatsApp installed, tapping *Message the restaurant about this order* did nothing.

**Root cause (two problems, fixed together):**

1. **The link type.** The button was a *new-tab* link (`target="_blank"`). The site was open inside an **in-app browser**: the browser that opens when you tap a link inside another app. Your screenshot shows its toolbar (✕, ⌄, share, ⋮). In-app browsers silently ignore new-tab links, so nothing happens and no error appears.
   - Our earlier tests passed because they used a normal browser, where new tabs work.
   - The original V1 bug (`window.open(...,'noopener')`, which Chrome blocks silently) had already been removed in V2.
2. **The number.** The site sent WhatsApp messages to +91 98233 24553, which is the calling number. You confirmed the restaurant's WhatsApp number is **+91 97668 88897**. Once the link opened, WhatsApp would have said "number not on WhatsApp".

**Fix:**
- **Phones and tablets:** every WhatsApp button is now a plain *same-tab* link to `https://wa.me/919766888897?text=<message>`. A real tap on a real link is what Android App Links and iOS Universal Links need to hand off to the WhatsApp app. In-app browsers handle it too.
- **Desktop:** the button opens a new tab, where wa.me offers WhatsApp Desktop or WhatsApp Web.
- **No app installed:** wa.me shows WhatsApp's own web page, which works as the browser fallback.
- **Safety net:** if nothing opens within 2.5 seconds, a panel appears with four options:
  - **Open WhatsApp app** (`whatsapp://` on phones) or **WhatsApp Web** (on desktop)
  - Call
  - Copy message
  - Copy number

  On phones the panel also tells the customer to open the site in Chrome if it is inside another app.
- **Number source:** the number comes from Admin → Restaurant Settings (production now holds `919766888897`, marked confirmed). The built-in fallback in the code was updated too.
- **Calling number:** +91 98233 24553 is unchanged.
- **Coverage:** all 8 WhatsApp buttons use one shared component:
  - navbar menu
  - finale
  - menu "Enquire"
  - product sheet
  - cart (ordering paused)
  - bulk enquiry ×2
  - receipt

**What I could not prove:** opening the real WhatsApp app on a real phone. A test server cannot install WhatsApp.

**Please check on your tablet:** open the preview → place a test order → tap the green button. WhatsApp should open with the bill number already typed.

---

## 2. Coupons & Discounts (priority 2)

**Admin → Coupons & Discounts → Create coupon** lets you set:
- a code
- % or fixed ₹ discount
- minimum order
- maximum discount
- start and expiry date/time (India time)
- total uses
- uses per phone number
- whether it applies to the whole menu, chosen dishes or chosen categories
- Active on/off
- whether it shows on the website or is a secret code
- an optional banner

Other admin actions:
- **Edit**, **Duplicate**, **Activate/Deactivate** and **Archive/Restore**.
- **Delete** works only for a coupon that was never used. A used coupon is archived instead, and the database itself now refuses to delete it, so old bills stay explained.
- **Usage statistics:** summary tiles (live coupons, times used, total discount given) and **View usage** (bill number, date, discount, order total).

Customer side:
- **Apply Coupon Code** box in the cart and at checkout. It shows "✓ CODE applied, you save ₹X" or the exact reason it was refused.
- **Validation is server-side** (expiry, limits, minimum order, per-phone).
- The discount and code appear on the receipt (screen, PDF, print, share) and in Admin → Orders.

---

## 3. Logo intro (priority 3)

- The old cinematic intro is gone. The new one has a deep royal-maroon background, a soft golden glow, the **original Dawat logo** with a fade, scale and light sweep, then the name, a gold rule and the tagline, with 10 slow golden motes (CSS only).
- **Length: 2.41 s measured** (admin can set 2–3 s). The old 1.8 s default was lifted to 2.4 s in production.
- **Exit is staged:** the logo and words fade first, then the backdrop dissolves into the homepage, so text never overlaps.
- **Skip intro** button (44 px).
- Shown once per browser session, whether watched or skipped. It does not come back on reload or when moving between pages.
- Reduced-motion users get no intro.
- Admin toggle: Music & Animations → "Show the intro".
- No 3D loads during the intro.

---

## 4. Live chat (replaces Ask Anna) (priority 4)

### Customer
- Gold chat button where Ask Anna was. It opens a compact window with:
  - logo
  - Online/Offline status
  - timestamps and day separators
  - auto-scroll to the newest message
  - minimize, close and Esc
  - history that survives a refresh
  - Retry on a failed send
- **Unread signals:** an unread badge, a **short preview bubble of new replies**, and an **unread count in the browser tab title**.
- The window hides while the cart, menu or product sheet is open, so it never covers ordering buttons.

### Admin → Live Chat & Customer Support
- Inbox with unread counts, search, and Active / Resolved / Archived tabs.
- Reply, mark read, resolve/re-open, archive/restore, delete.
- **Available for chat** toggle.
- Welcome and offline messages, widget on/off, retention days.
- Sidebar badge and notification entry.

### Real time (genuine two-way)
- **Customer receives replies by push.** When the restaurant replies, the database sends a content-free "changed" signal on the customer's own channel. The widget then re-reads its conversation with its secret key, so the signal itself carries no message text.
- **Admin receives customer messages** through Supabase Realtime database changes. Only admins can receive these.
- **Polling is only a safety net:** every 20 s (open) or 60 s (closed) while push works, and 4 s / 20 s if push is unavailable.
- Measured on the local stand-in: customer received a reply in **1.6 s**, admin received a customer message in **0.3 s**.

### Security
- No visitor can read the chat tables directly.
- A customer reaches only their own conversation, through a random secret kept on their device. The database stores only its SHA-256.
- Admins cannot read that secret or the abuse fingerprint.
- Duplicate-proof message ids.
- One notification per unread streak.
- Rate limits: 15 messages/min per chat, 5 new chats/hour per device, 300/hour overall.
- 1000-character limit.
- Retention: chats older than the retention setting are deleted when a new chat starts, or via the admin button.

**Online status** shows only when you switched availability on **and** the admin panel was open in the last 5 minutes.

---

## 5. Bugs fixed in this round

1. WhatsApp did nothing in in-app browsers (new-tab link). Fixed as in §1.
2. WhatsApp went to the wrong number (98233 24553). Now 97668 88897.
3. The cart coupon line could say "applied" when the discount came from a different offer. It now checks the coupon code itself.
4. A used coupon could be hard-deleted by a direct database call. Now blocked by a trigger.
5. The intro exit overlapped the homepage text mid-fade. Exit is now staged.
6. The intro test measured screenshot time, not the intro (reported 4.3 s; the real length is 2.4 s). The test now measures in the page.
7. The customer chat only polled every 3 s (no push). It now uses Realtime push with polling as a fallback.
8. The admin chat subscribed to a table with column-level permissions. It now listens only to chat messages (safe with Realtime).
9. Dead controls were left after Anna was removed: "Anna's voice", "Show Dawat Anna", "Reset Anna's tips" and the footer line. All removed.
10. Old tests still expected the old WhatsApp number. Updated.

Fixed in the earlier V3 draft, re-verified now:
- The first chat message could vanish while the conversation was being created.
- The intro could flash when the admin had disabled it.

---

## 6. Files

**New:**
- `src/components/ui/WhatsAppLink.tsx`
- `src/components/chat/ChatWidget.tsx`
- `src/lib/chatApi.ts`
- `src/admin/chat.tsx`
- `src/admin/sections/LiveChat.tsx`
- `supabase/migrations/20261125085000_v3_settings.sql`
- `supabase/migrations/20261125090000_v3_chat_coupons.sql`
- Tests: `tests/e2e/whatsapp.py`, `intro.py`, `chat_flow.py`, `chat_fallback.py`, `mock_realtime.mjs`

**Changed:**
- Components: `App.tsx`, `Intro.tsx`, `CartDrawer.tsx`, `Receipt.tsx`, `Navbar.tsx`, `Finale.tsx`, `Footer.tsx`, `MenuCard.tsx`, `ProductSheet.tsx`, `BulkOrders.tsx`, `SettingsPanel.tsx`
- Admin: `AdminApp.tsx`, `Offers.tsx`, `Appearance.tsx`, `MusicAnimations.tsx`, `notifications.tsx`, `NotificationsPage.tsx`
- Other source: `utils/order.ts`, `data/restaurant.ts`, `index.css`
- Test infrastructure: `tests/db/*`, `mock_supabase.mjs`, older suites
- Docs and packaging: `docs/*`, `package.json` (dev-only `ws`, used by the local test server)

---

## 7. Database changes (production, applied and verified)

Two migrations were applied to the existing Supabase project. Both are additive; nothing was dropped and no customer data was touched.

1. **`dawat_v3_settings`** (data only, conditional):
   - WhatsApp number → `919766888897`, marked confirmed. Changed only because it was still the old default.
   - Intro 1800 → 2400 ms. Changed only because it was still below 2 s.
   - Both changes appear in the Activity log.
2. **`dawat_v3_chat_coupons`:**
   - New tables `chat_settings`, `chat_conversations`, `chat_messages`, all with RLS.
   - Chat functions.
   - `notifications.kind` now also allows `new_chat`, plus a nullable `conversation_id` column.
   - `chat_messages` added to the Realtime publication.
   - Push trigger.
   - Coupon delete-protection trigger.

**Verified after applying (read-only):**
- **Data intact.** Row counts before and after are identical: dishes 12, variants 12, categories 5, leads 7, orders 1, customers 1, admins 1, notifications 1, receipts 1.
- **Locked down to visitors:**
  - The three chat tables return 401.
  - An admin chat function returns "permission denied".
  - A random chat id returns only `not_found`.
  - Visitors can call only `chat_status`, `chat_send` and `chat_fetch`.
  - Signed-in users cannot read `token_hash`.
- **Settings live:** the public storefront now returns WhatsApp `919766888897` and intro 2400.
- **Supabase security advisor:** no new errors. The warnings are the intended public functions (same pattern as V2). Leaked-password protection is still off; that is a dashboard setting.

---

## 8. Tests (all executed on 25 Nov 2026, local database + local build)

| Suite | Result |
|---|---|
| TypeScript | 0 errors |
| Lint | 0 errors (1 warning: fast-refresh style) |
| Database (RLS, orders, coupons, chat, push, delete-protection, number) | **153 / 153** |
| Ordering (Android phone) | **51 / 51** |
| Site regression (3D story, menu, cart, bulk, layouts, reduced motion, no-WebGL) | **51 / 51** |
| Admin panel (all sections, coupons create/edit/usage/archive) | **39 / 39** |
| WhatsApp (Android phone + **Android tablet** + iPhone + iPad + desktop, tablet receipt, cart, menu overlay, fallback) | **36 / 36** (run 4 times) |
| Logo intro | **15 / 15** |
| Live chat, two real browsers, with push | **37 / 37** |
| Live chat with Realtime switched off (polling fallback) | **2 / 2** |

Screenshots: `tests/output/` (receipt on tablet, cart coupon, admin coupons, coupon form, live chat, intro frames).

---

## 9. Not tested / remaining (honest)

- **Real WhatsApp hand-off on your device.** Please do the tablet check in §1.
- **Real Supabase Realtime push** (needs the real project; tested against a local stand-in that speaks the same protocol). If your project's Realtime were set to "private channels only", the customer side falls back to polling (tested). Default projects allow public channels.
- Chat on real phone keyboards, and real-device speed.
- No live test messages were sent in production. Send one yourself from the preview, reply from `/admin`, then archive or delete it.
- **The live site (`main`) still runs the old version** (old WhatsApp button and number) until you say "live karo".

---

## 10. Deploy

1. **Database:** already done (both migrations applied and verified).
2. **Preview:** branch `v2` builds automatically on Vercel.
3. **Test it:**
   - On your tablet/phone: WhatsApp button, a coupon at checkout, the intro (open in a new private tab).
   - Live chat: Admin → Live Chat → "Available for chat" ON; send a message from your phone; reply.
4. **Go live:** say **"live karo"** → merge `v2` → `main` (GitHub pull request). Vercel deploys in 1–2 minutes.
5. **Rollback:**
   - Code: Vercel → Deployments → previous Production → **Promote / Instant Rollback**, or reset to `backup/pre-v3-fixes-2026-11-25` / `backup/pre-v2-2026-11-24`.
   - Database: nothing to undo. The new tables are harmless to older code.
   - Chat can be switched off without code: Live Chat → Chat settings.
