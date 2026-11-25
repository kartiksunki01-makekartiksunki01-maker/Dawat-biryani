# Deploy, promote and roll back

## Where things are
- `main` branch → the live site (https://dawat-biryani.vercel.app). Vercel deploys every push to `main`.
- `v2` branch → V2 preview. Vercel builds a **Preview** link for it automatically.
- `backup/pre-v2-2026-11-24` → exact copy of the live site before V2.
- `backup/pre-v3-fixes-2026-11-25` → the `v2` preview just before the V3 fixes (WhatsApp, coupons, intro, live chat).
- Database: Supabase project `mbnkkhwxpxjbhgfslerb`. V2 and V3 migrations are already applied there (`dawat_v2_ordering`, `dawat_v2_1_hardening`, `dawat_v3_settings`, `dawat_v3_chat_coupons`). They only **add** tables, columns and functions, so the old live site keeps working.

## 1. Test the preview (before going live)
1. Vercel → project **dawat-biryani** → **Deployments** → the newest one from branch `v2` → **Visit**.
2. Preview links may ask you to log in to Vercel (that is normal protection).
3. The preview uses the **real** database. A test order there creates a real bill number. Place one, then in `/admin`
   reject it with reason "Test order". (Bill numbers are never reused, so the next real order simply gets the next number.)
4. Check on your phone: menu, add to cart, checkout, receipt PDF, track page, admin.

## 2. Go live (promote)
GitHub → repository → **Pull requests** → **New pull request** → base `main` ← compare `v2` → **Create** → **Merge**.
Vercel then deploys the live site in 1–2 minutes. Environment variables stay the same.

## 3. Roll back if something is wrong
- Fastest: Vercel → Deployments → pick the last good **Production** deployment → **⋯ → Promote to Production / Instant Rollback**.
- Or code: GitHub → revert the merge commit (or reset `main` to `backup/pre-v2-2026-11-24`).
- Database: nothing needs to be undone for a code rollback — the old site ignores the new tables.
  To stop new online orders immediately without any code change: Admin → Restaurant Settings → switch off **Accept online orders**.
- Never drop the new tables: they hold orders, bills and chat history.
- To turn off live chat without code: Admin → Live Chat → Chat settings → switch off the widget.

## Environment variables (Vercel → Settings → Environment Variables)
| Name | Value |
|---|---|
| `VITE_SUPABASE_URL` | `https://mbnkkhwxpxjbhgfslerb.supabase.co` |
| `VITE_SUPABASE_KEY` | the **publishable** key (`sb_publishable_…`) |
Never add a `service_role` / secret key here.

## Manual steps for the owner (one time)
- Supabase → Authentication → Sign In / Providers → keep **"Allow new users to sign up" OFF**.
- Supabase → Authentication → Passwords → enable leaked-password protection if your plan offers it.
- Supabase free projects pause after a long period without activity; open the dashboard to resume.
