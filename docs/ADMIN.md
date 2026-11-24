# Admin dashboard — what it needs

A secure admin dashboard was **not** shipped as a front-end-only panel, because it would only *pretend* to save data. Everything it would edit currently lives in `src/data/restaurant.ts`; changing that file and rebuilding is the safe interim workflow.

## Features that require a backend

| Feature | Needs |
|---|---|
| Add / edit menu items, prices, portion names, availability, veg/non-veg | Database table + authenticated API |
| Upload product / gallery photographs | Object storage (e.g. Supabase Storage, Cloudflare R2, S3) |
| Bulk-order per-kg pricing | Database |
| Business hours, offers, promotional banners, social links | Database |
| Enable / disable Dawat Anna | Database (or a remote config flag) |
| Receive and manage enquiries on the server | API endpoint + database + rate limiting + privacy notice update |

## Recommended setup

1. **Supabase** (Postgres + Auth + Storage) *or* **Turso** (libSQL) with a small server (e.g. Hono on Cloudflare Workers).
2. **Server-side authentication** — Supabase Auth with email magic link or password; restrict to the owner's account with Row Level Security (`auth.uid() = owner_id`).
3. **Never** put database secrets, service-role keys or admin passwords in front-end code. The browser only ever gets the public anon key; writes go through RLS-protected tables or a server function.
4. The public site fetches the menu/config from the database at load (with `src/data/restaurant.ts` kept as an offline fallback).
5. Server-side validation (zod) and rate limiting on any enquiry endpoint; update the footer privacy text when enquiries are stored.

## Suggested tables

```sql
create table menu_items (
  id text primary key,
  name text not null,
  category text check (category in ('chicken','mutton','seafood','vegetarian','gravies')),
  diet text check (diet in ('veg','non-veg','unconfirmed')),
  description text,
  image_url text,
  image_kind text check (image_kind in ('promotional','photo')),
  status text check (status in ('available','enquire','hidden')) default 'available',
  sort int default 0
);
create table menu_variants (
  item_id text references menu_items(id) on delete cascade,
  id text, label text not null, price_inr int not null check (price_inr > 0),
  primary key (item_id, id)
);
create table settings (key text primary key, value jsonb not null);   -- hours, social, bulk rules, host toggle, banners
create table enquiries (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  kind text check (kind in ('order','bulk')),
  payload jsonb not null,
  consent boolean not null check (consent)
);
```

Provide the backend credentials (project URL + anon key, with RLS configured) and the dashboard can be built against this schema.
