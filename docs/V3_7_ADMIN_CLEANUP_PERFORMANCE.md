# V3.7 — Admin edit & delete, data cleanup, media library, performance (27 Nov 2026)

## Fixes first (reported with screenshots)
- **"Could not find the table 'public.bulk_menu_items'"** in the admin panel, and **"Could not reach the restaurant's server"** on the Bulk enquiry form. Both errors had the same cause: the V3.6 database migration had not been applied yet.
  - The migration is now applied to the production database, with the owner's approval in the Supabase prompt.
  - Verified on production:
    - 12 bulk dishes, 11 of them published.
    - The public API returns the bulk menu.
    - A dry-run of the enquiry function returned 7 kg / ₹5,400 and was rolled back, so nothing was saved.
    - Regular menu prices and all orders and customers are unchanged.
- **Older bug found while testing:** deleting an enquiry that had been turned into an order failed with "order_locked_fields". Deleting a used coupon failed the same way. The database now lets those links be cleared. Changing them to anything else is still refused.

## Owner decisions
- **Deleting a finished order** removes its items, customer name/phone and history permanently.
  - A small **bill register** row stays: bill number, date, amounts, payment and status, with no personal data.
  - Bill numbers are never reused.
- **Deleting a customer** removes the customer record. Their orders are **kept**, shown as "Deleted customer" without name or phone.
- **Active orders can never be deleted.** Customers who have an active order are skipped.
- **Automatic cleanup exists but is OFF** until the owner switches it on.

## Admin panel
- **Select / Select all / Delete selected** in:
  - Orders and Bills: finished orders only; active ones cannot be ticked.
  - Customers, with a "No order for 30/60/90+ days" filter.
  - Bulk & Special Orders: enquiries and bulk dishes.
  - Enquiries & Leads.
  - Menu Management.
  - Coupons, with a state filter: Live, Scheduled, **Expired**, Used up, Inactive, Archived.
  - Live Chat conversations.
  - Notifications: All, Unread, Read, Older than 30 days.
  - **Media & Storage** (new).
- **The delete dialog** works the same way everywhere:
  1. It says plainly what will happen and that it is permanent.
  2. It offers **Download CSV first**.
  3. Batches of more than 5 need **DELETE** typed in.
  4. A **progress bar** runs in batches of 50.
  5. The result says how many were deleted, which were skipped and why, and any error.
- **Edit:**
  - Orders have a new **Edit details** option for customer name, phone, delivery address and instructions. Bill number, items, amounts and dates stay locked by the database.
  - Customers, menu dishes, bulk dishes, coupons and enquiries already had edit; it is unchanged.
- **Single deletes:**
  - Order window: **Delete permanently**, for finished orders only.
  - Bulk dish: **Delete permanently…** (archive is still available).
  - Coupons:
    - A used coupon can now be deleted once it is not live. If it is live, it is switched off first.
    - Bills keep the coupon code and discount amount.
- **Bills & Receipts → Deleted bills register:** a table of every deleted bill, with CSV export.
- **Storage cleanup:** deleting a dish, bulk dish or coupon also removes its uploaded photo from storage, but only if nothing else uses it. The built-in website pictures (assets/…) are never touched.
- **Media & Storage** (new page):
  - Lists every uploaded file with its size, upload date and **where it is used**.
  - Files in use cannot be ticked.
  - Unused files can be deleted. Usage is re-checked right before deleting.
  - **Make smaller** for photos over 400 KB:
    1. Uploads a compressed copy (WebP, up to 1400 px).
    2. Points the dish, bulk dish or coupon at it.
    3. Removes the original.
    In the test, a 949 KB photo became 148 KB.
- **Data Cleanup** (new page):
  - One rule per kind of record, each with a "Remove after" choice of Never, 30, 60, 90, 180 or 365 days:
    - Finished orders: 90 days by default.
    - Closed enquiries: 90 days by default. New or contacted enquiries are never removed.
    - Notifications: 30 days by default.
    - Resolved chats: 90 days by default. Open chats are never removed.
    - Expired coupons: 30 days by default.
  - The page shows a live count for each rule and offers a CSV of the records that would be removed.
  - **Clean up now** needs DELETE typed in.
  - **Automatic clean-up** is a switch that is off by default. When on, the database runs it **at most once a day, when the admin panel is opened**. pg_cron is not used, so no extension is enabled and nothing runs on a server timer.

## Database — `supabase/migrations/20261127120000_v3_7_admin_cleanup.sql`
- **New tables:**
  - `bill_register`: admins can read it; it is written only by database functions.
  - `cleanup_settings`: a single row, admin only, audited. Auto cleanup is off by default.
- **New functions** (all check `is_admin()` and have no access for visitors):
  - `admin_delete_orders(ids)`: finished orders only; returns deleted and skipped with reasons.
  - `admin_delete_customers(ids)`: orders are anonymised and kept; customers with active orders are skipped.
  - `admin_delete_conversations(ids)`.
  - `admin_cleanup_preview()`, `admin_cleanup_run()`, `admin_cleanup_auto()`.
  - `admin_media_list()`: storage objects with "used by".
- **New policies:** admins can delete notifications; admins can list the `images` and `audio` storage objects. Uploading and deleting still need the existing admin policies.
- **Replaced functions:**
  - `_order_before_update`: the only change is that it allows clearing `lead_id` / `offer_id` to NULL.
  - `_offer_before_delete`: only *live* used coupons are protected.
- **Indexes:** the Supabase performance advisor flagged 5 unindexed foreign keys, and all 5 now have indexes. There is also a new `leads (kind, created_at)` index.

## Performance (no design change)
- **Every visitor's chat status check:**
  - Before: every 60 s, even in background tabs.
  - Now: every 3 minutes, only while the tab is visible, plus a fresh check when the chat window is opened.
- **Admin notifications:**
  - Before: a full reload every 30 s even with live push working, and it read the admin's whole read-history each time.
  - Now: 30 s only while live push is down, and every 2 minutes as a safety net while it works. It reads only the read-marks inside the window shown, and refreshes once when you come back to the tab.
- **Admin chat:**
  - With live push working, the safety reload is every 2 minutes (before: 32 s). The presence ping is every 2 minutes (before: 60 s); the website's "Online" window is 5 minutes.
  - Without push, it is still every 8 s.
- **Pagination:** Orders and Enquiries load 100 at a time with **Load 100 more** (before: up to 500 at once).
- **Vercel caching** (`vercel.json`):
  - Hashed JS, CSS and fonts: cached for 1 year (`immutable`).
  - Pictures, video and audio: 1 day plus stale-while-revalidate for 7 days.
  - Before, browsers re-checked every file on every visit.
- **Images:**
  - The chat header logo went from 225 KB (PNG) to 5 KB (WebP).
  - The navbar, footer and admin logo went from 80 KB (PNG) to 17 KB (WebP).
  - The receipt/PDF keeps the PNG for compatibility.
- **Already in place and checked:** the 3D handi (three.js) and PDF libraries load only when needed, and they are not in the first page load.
- **Not measured:** real Supabase/Vercel usage numbers before and after. These changes reduce request counts by design.

## Tests (local database + local build only)
- `tests/db/test_cleanup.mjs`: 41 checks.
- `tests/e2e/admin_cleanup.py`: 35 checks.
- Existing suites:
  - The coupon test was updated to the new rule: a live used coupon is protected, and a switched-off one can be deleted.
  - The test mock now stores, serves and deletes uploaded files like Supabase Storage.

## Rollback
- **Website:** redeploy the previous Vercel deployment, or reset `main` to `backup/pre-v3.7-admin-2026-11-27`.
- **Database:** the migration is additive. The old website keeps working with it.
