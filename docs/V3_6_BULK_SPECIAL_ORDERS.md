# V3.6 — Bulk & Special Orders (27 Nov 2026)

This is a targeted upgrade of the existing Bulk Orders section and its admin page. Nothing else on the site was redesigned. It uses the same GitHub repository, Supabase project and Vercel project.

## What changed for customers
- The section is now called **Bulk & Special Orders**. It keeps the same link (`#bulk-orders`), and the navigation label was updated. Subtitle: *Royal feasts for family functions, celebrations, parties and every special occasion.*
- **Per-kilogram bulk menu loaded from the database.** These prices are separate from the regular plate menu, which is unchanged.
  - Each card shows the photo (or a "photo coming soon" placeholder, never another dish's photo; the restaurant's promotional pictures are labelled "Artwork"), name, veg/non-veg mark, category, ₹ per kg, availability, a kg selector and an **Add** button.
  - Filters: All, Chicken, Mutton, Seafood, Vegetarian, Gravies, Specials & Starters. There is also a search box.
- **Calculator beside the 3D handi.**
  - Ways to set the quantity: the existing 1–20 kg slider, **−/+** buttons and whole-kg typing (clamped to the dish's min/max).
  - It shows the dish, ₹/kg, kg and the estimate, with Indian number grouping (₹1,20,000).
  - Numbers glide to their new value. The handi grows on a soft spring and a warm gold light swells when the quantity or dish changes. Saffron motes are skipped on low-power devices and with reduced motion. The canvas is never remounted when the dish changes, and the no-WebGL drawing still works.
- **Multi-dish bulk order.**
  - Customers can add several dishes, then edit or remove each line. Each line shows kg × ₹/kg = subtotal, plus total kg and the estimated total (labelled an estimate; no delivery, packaging, tax or discount is invented).
  - It is kept separately from the plate cart, on this device only. Only dishes and kilograms are saved, never name or phone.
  - The combined total is limited by an admin setting (default 20 kg).
  - On phones and tablets, a small gold pill jumps to the summary.
- **Live checks while the page is open.**
  - The bulk menu is re-fetched when the section comes into view or the tab returns (at most every 2 minutes), and again if a submission is refused.
  - If a price changed, the customer sees "price of X changed from ₹a to ₹b" and the estimate updates.
  - A sold-out or removed dish is flagged and must be removed before sending.
- **Enquiry.**
  - Fields: name, mobile, event type, preferred date and time (Asia/Kolkata), pickup/delivery, instructions, consent.
  - Buttons: **Submit Bulk Order Enquiry**, **WhatsApp enquiry**, **Copy order details** and **Call restaurant**. The WhatsApp and copy text contain the full per-dish breakdown.
  - Success says "Enquiry received… This is not a confirmed order yet".
  - Double taps and retries after a network drop never create a second enquiry.
- **Timing rules.**
  - Per dish: up to *N* kg needs no advance notice; above that, *H* hours' notice is needed. The default is 5 kg / 2 hours, which is the restaurant's advertised Paneer Biryani rule.
  - Only **Veg Vegetable Paneer Biryani** is marked "timing confirmed". For the other dishes customers read "preparation time is confirmed by the restaurant with your quotation".
  - Past times, closed days and times outside opening hours are refused.

## What changed in the admin panel (Bulk & Special Orders)
- **Tab A: Bulk Menu & Pricing.**
  - View all bulk dishes. Add a dish (it starts hidden). In the editor, change the name, ₹/kg (validated), category, veg/non-veg, description, min/max kg, the "no notice up to" kg, notice hours and "timing confirmed", and add a private note. The editor has a customer preview and a Save changes button with loading and validation messages.
  - Upload or replace photos straight from the row or in the editor. Big phone photos are shrunk before upload.
  - Switch dishes on or off the website and mark them sold out. Reorder with ↑ ↓. Archive and restore.
  - Search plus category and availability filters.
  - Menu-wide settings: the maximum total kg per online enquiry, and "apply one rule to every dish".
- **Tab B: Bulk Order Enquiries.**
  - Each enquiry shows a per-dish table (kg, ₹/kg at submission, estimate), total kg, estimated total, event, preferred date and time, pickup/delivery, instructions, status and created time.
  - Actions:
    - Call or WhatsApp the customer.
    - **Use estimate**, edit and **Save** the final quotation.
    - **Confirm quotation** or **Reject…**.
    - Keep private notes.
    - **Convert to order**: creates a bill number and receipt only once, and is refused for rejected enquiries.
    - **Export CSV** with one row per dish.
  - Old single-variety enquiries still display and convert exactly as before.

## Database (migration `supabase/migrations/20261127090000_v3_6_bulk_menu.sql`)
This migration is additive only. No existing row is changed or deleted, and it is safe to run again.
- **New table `bulk_menu_items`.**
  - Columns: id, slug, name, category, diet, price_per_kg, description, image_path, image_kind, is_available, is_sold_out, min_kg, max_kg, notice_free_up_to_kg, advance_notice_hours, timing_confirmed, admin_note, display_order, created_at, updated_at, archived_at.
  - Has check constraints, an `updated_at` trigger and an audit-log trigger.
- **RLS.**
  - Visitors read published, non-archived rows only, and every column except the private `admin_note`.
  - Only admins can insert, update or delete.
- **Seed.** The 12 supplied dishes use `ON CONFLICT (slug) DO NOTHING`, so re-running never overwrites admin edits.
  - **Chicken Malai Tikka Biryani** is seeded hidden, because its ₹1,400 was read from a WhatsApp screenshot and its unit is unconfirmed.
  - Prawns Biryani and Chicken Sukha Lapeta carry a "confirm spelling" note.
- **Changes to existing tables.**
  - `restaurant_settings.bulk_max_total_kg` (default 20).
  - `leads.idempotency_key` (unique when set).
  - The `leads.status` check gains `rejected`.
- **`get_storefront()`** now also returns `bulk` (published items + total limit). All other keys are unchanged.
- **`submit_bulk_enquiry(p)`** (new, public).
  - Prices every line from the database. Browser prices are only compared, to report "price changed".
  - Checks the dish exists and is available, whole kg within limits, the total limit, IST date/time, open day, opening hours and advance notice, name, phone and consent.
  - Rate-limits per phone number and is idempotent.
  - Stores a price snapshot per line.
- **`admin_convert_lead(id)`** (extended, backward compatible).
  - Multi-dish enquiries get one receipt line per dish (qty = kg, unit price = ₹/kg as submitted). If the quotation is lower, the difference is a discount; if higher, it is a "Quotation adjustment" line. The bill total always equals the quotation.
  - Rejected enquiries are refused.
  - Old enquiries convert exactly as before. The duplicate-conversion guard is unchanged.

**Deploy order:** apply the migration to the database *before* the new website code goes live. The new page calls `submit_bulk_enquiry`; the old page keeps working with the migrated database.

## Files
- New:
  - `src/data/bulk.ts`
  - `src/components/bulk-orders/BulkParts.tsx`
  - `src/admin/sections/BulkMenu.tsx`
  - `src/admin/photo.tsx`
  - `supabase/migrations/20261127090000_v3_6_bulk_menu.sql`
  - `tests/db/test_bulk.mjs`
  - `tests/e2e/bulk_flow.py`
  - `tests/e2e/bulk_admin.py`
  - this file
- Changed:
  - `src/components/bulk-orders/BulkOrders.tsx`
  - `src/components/bulk-orders/BulkHandi3D.tsx`
  - `src/admin/sections/Bulk.tsx`
  - `src/admin/Leads.tsx` (`rejected` status)
  - `src/admin/AdminApp.tsx` (label)
  - `src/components/navigation/Navbar.tsx` (label)
  - `src/data/menuSync.ts`
  - `src/lib/api.ts`
  - `src/utils/order.ts`
  - `src/components/motion/Motion.tsx` (`CountUp`)
  - `src/styles/index.css` (`.bulk-sweep`)
  - `tests/e2e/mock_supabase.mjs`
  - `tests/e2e_test.py` and `tests/e2e/order_flow.py` (new bulk steps)
  - docs

## Things the restaurant should confirm
1. **Chicken Malai Tikka Biryani**: is ₹1,400 per kg? It stays hidden until someone switches it on.
2. **Spellings**: Prawns Biryani, Chicken Sukha Lapeta.
3. **Preparation time for the 11 non-paneer dishes.** Customers are currently told it is confirmed with the quotation; switch "timing confirmed" on per dish once agreed.
4. **The 20 kg combined online limit.** Raise it in the admin if larger mixed orders should be accepted online.
5. **Real photos** for Italian, Mutton Tikka, Sukha Lapeta, Kabab, Veg Paneer Tikka and Malai Tikka.

## Notes
- The 3D scroll story and the Dawat Anna character were removed earlier at the owner's request (V3 / V3.3). They were not brought back.
- 60 FPS is not claimed. The new motion uses transform/opacity only, and heavier effects are reduced on low-power devices and with reduced motion. It has not been measured on a real Xiaomi Pad 6.

## Rollback
- **Website:** redeploy the previous production deployment in Vercel, or reset `main` to the `backup/pre-v3.6-bulk-2026-11-27` branch.
- **Database:** the migration can stay. The older website ignores the new table, functions and columns, and old enquiries convert as before.
