# Backend + Admin setup (free tier) — Dawat Biryani House

Stack: **Supabase** (database + login, free plan) and **Vercel** (hosting). Both values below are public by design.

## What exists
| Table | Purpose | Who can do what |
|---|---|---|
| `dishes`, `dish_variants`, `categories` | Menu, portions, prices | Everyone can **read** visible dishes. Only admins can change. |
| `leads` | Every WhatsApp enquiry sent from the site (order + bulk) | Visitors can only **add**. Only admins can read, update, delete. |
| `admins` | Which logins are allowed into `/admin` | Admin can see own row only. |

The website keeps working if Supabase is down: it falls back to the menu built into `src/data/restaurant.ts`
and the last menu it fetched in that browser.

## 1) Create the admin login (one time)
1. Supabase → **Authentication → Users → Add user → Create new user**. Enter email + a strong password. Tick *Auto Confirm User*.
2. Supabase → **SQL Editor** → run (use the same email):
   ```sql
   insert into public.admins (user_id)
   select id from auth.users where email = 'YOUR-EMAIL@example.com';
   ```
3. Supabase → **Authentication → Sign In / Providers** → switch **off** "Allow new users to sign up".

## 2) Put the project on GitHub, then deploy on Vercel
1. Create a GitHub repo and upload the project (do **not** upload `node_modules`).
2. Vercel → **Add New → Project** → import the repo. Preset: **Vite**. Build command `npm run build`, output `dist`.
3. Vercel → Project → **Settings → Environment Variables** → add (Production + Preview):
   - `VITE_SUPABASE_URL` = `https://mbnkkhwxpxjbhgfslerb.supabase.co`
   - `VITE_SUPABASE_KEY` = the **publishable** key (`sb_publishable_…`) from Supabase → Project Settings → API Keys
   - Never use a `service_role` / secret key in these.
4. Deploy. The site is at `/`, the admin panel at `/admin`.

## 3) Daily use
- `/admin` → **Dishes & Prices**: edit name, portions, price, availability, hide/show, add new dish.
- `/admin` → **Enquiries & Leads**: call / WhatsApp the customer, set status, add private notes, export CSV.

## Notes
- Vercel's free *Hobby* plan is meant for personal, non-commercial use. A restaurant site is commercial — check
  Vercel's current terms, or host the same `dist/` folder on Cloudflare Pages / Netlify (both have free tiers).
- Supabase free projects can pause after a period of inactivity; open the dashboard to resume if that happens.
- Still not built (needs your input): image upload from the admin panel, per-order online payment, delivery zones.
