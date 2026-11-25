-- ALREADY APPLIED IN PRODUCTION on 2026-11-24 (Supabase migrations: dawat_core_schema,
-- dawat_table_grants, dawat_fix_public_dish_policy). Kept here as the versioned record.
-- Do NOT re-run against production.

create table public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.categories (
  id text primary key,
  label text not null,
  sort_order int not null default 0
);

create table public.dishes (
  id text primary key,
  name text not null check (char_length(name) between 1 and 120),
  category_id text references public.categories(id) on delete set null,
  diet text not null default 'unconfirmed' check (diet in ('veg','non-veg','unconfirmed')),
  status text not null default 'available' check (status in ('available','enquire')),
  image_path text,
  image_kind text check (image_kind in ('promotional','photo')),
  description text not null default '' check (char_length(description) <= 600),
  is_visible boolean not null default true,
  sort_order int not null default 0,
  updated_at timestamptz not null default now()
);

create table public.dish_variants (
  id uuid primary key default gen_random_uuid(),
  dish_id text not null references public.dishes(id) on delete cascade,
  label text not null check (char_length(label) between 1 and 40),
  price numeric(10,2) not null check (price >= 0 and price <= 100000),
  sort_order int not null default 0
);
create index dish_variants_dish_idx on public.dish_variants(dish_id);

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'cart' check (kind in ('cart','bulk','contact')),
  name text check (char_length(name) <= 100),
  phone text check (char_length(phone) <= 20),
  message text check (char_length(message) <= 2000),
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'new' check (status in ('new','contacted','confirmed','closed')),
  notes text check (char_length(notes) <= 2000),
  created_at timestamptz not null default now()
);
create index leads_created_idx on public.leads(created_at desc);

create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;
create trigger dishes_touch before update on public.dishes
for each row execute function public.touch_updated_at();

alter table public.admins enable row level security;
alter table public.categories enable row level security;
alter table public.dishes enable row level security;
alter table public.dish_variants enable row level security;
alter table public.leads enable row level security;

create policy "admin reads own row" on public.admins for select to authenticated
  using (user_id = (select auth.uid()));
create policy "public reads categories" on public.categories for select to anon, authenticated using (true);
create policy "admin writes categories" on public.categories for all to authenticated
  using (exists (select 1 from public.admins a where a.user_id = (select auth.uid())))
  with check (exists (select 1 from public.admins a where a.user_id = (select auth.uid())));
create policy "public reads visible dishes" on public.dishes for select to anon, authenticated
  using (is_visible);
create policy "admin writes dishes" on public.dishes for all to authenticated
  using (exists (select 1 from public.admins a where a.user_id = (select auth.uid())))
  with check (exists (select 1 from public.admins a where a.user_id = (select auth.uid())));
create policy "public reads variants" on public.dish_variants for select to anon, authenticated using (true);
create policy "admin writes variants" on public.dish_variants for all to authenticated
  using (exists (select 1 from public.admins a where a.user_id = (select auth.uid())))
  with check (exists (select 1 from public.admins a where a.user_id = (select auth.uid())));
create policy "anyone can submit a lead" on public.leads for insert to anon, authenticated
  with check (status = 'new' and notes is null);
create policy "admin reads leads" on public.leads for select to authenticated
  using (exists (select 1 from public.admins a where a.user_id = (select auth.uid())));
create policy "admin updates leads" on public.leads for update to authenticated
  using (exists (select 1 from public.admins a where a.user_id = (select auth.uid())))
  with check (exists (select 1 from public.admins a where a.user_id = (select auth.uid())));
create policy "admin deletes leads" on public.leads for delete to authenticated
  using (exists (select 1 from public.admins a where a.user_id = (select auth.uid())));

grant usage on schema public to anon, authenticated;
grant select on public.categories, public.dishes, public.dish_variants to anon;
grant insert on public.leads to anon;
grant select on public.categories, public.dishes, public.dish_variants to authenticated;
grant insert, update, delete on public.categories, public.dishes, public.dish_variants to authenticated;
grant select, insert, update, delete on public.leads to authenticated;
grant select on public.admins to authenticated;

-- Seed (same data as the website's built-in menu)
insert into public.categories (id,label,sort_order) values
 ('chicken','Chicken',1),('mutton','Mutton',2),('seafood','Seafood',3),('vegetarian','Vegetarian',4),('gravies','Gravies',5);
insert into public.dishes (id,name,category_id,diet,status,image_path,image_kind,description,sort_order) values
 ('chicken-dum-biryani','Chicken Dum Biryani','chicken','non-veg','available','assets/images/dishes/chicken-dum.webp','promotional','Hyderabadi-style chicken dum biryani with aromatic basmati rice.',1),
 ('chicken-fry-piece-biryani','Chicken Fry Piece Biryani','chicken','non-veg','available','assets/images/dishes/chicken-fry-piece.webp','promotional','Biryani served with fried chicken pieces.',2),
 ('chicken-tikka-biryani','Chicken Tikka Biryani','chicken','non-veg','available','assets/images/dishes/chicken-tikka.webp','promotional','Biryani paired with chicken tikka.',3),
 ('mutton-biryani','Mutton Biryani','mutton','non-veg','available','assets/images/dishes/mutton.webp','promotional','Hyderabadi-style biryani with mutton.',4),
 ('prawns-biryani','Prawns Biryani','seafood','non-veg','available','assets/images/dishes/prawns.webp','promotional','Biryani with prawns.',5),
 ('chicken-gravy','Chicken Gravy','gravies','non-veg','available','assets/images/dishes/chicken-gravy.webp','promotional','Chicken in a rich gravy — a companion for your biryani.',6),
 ('vajdi-gravy','Vajdi Gravy','gravies','non-veg','available','assets/images/dishes/vajdi-gravy.webp','promotional','A non-vegetarian house gravy. Ask the restaurant about its ingredients.',7),
 ('vegetable-paneer-biryani','Vegetable Paneer Biryani','vegetarian','veg','available','assets/images/dishes/veg-paneer.webp','promotional','Vegetarian biryani with vegetables and paneer.',8),
 ('veg-dum-biryani','Veg Dum Biryani','vegetarian','veg','enquire',null,null,'Price and availability on enquiry.',9),
 ('paneer-tikka-biryani','Paneer Tikka Biryani','vegetarian','veg','enquire',null,null,'Price and availability on enquiry.',10),
 ('malai-tikka-biryani','Malai Tikka Biryani',null,'unconfirmed','enquire',null,null,'Price, details and availability on enquiry.',11),
 ('banar-biryani','Banar Biryani',null,'unconfirmed','enquire',null,null,'Price, details and availability on enquiry.',12);
insert into public.dish_variants (dish_id,label,price,sort_order) values
 ('chicken-dum-biryani','Regular',110,1),('chicken-dum-biryani','Large',150,2),
 ('chicken-fry-piece-biryani','Regular',130,1),('chicken-fry-piece-biryani','Large',170,2),
 ('chicken-tikka-biryani','Standard',180,1),
 ('mutton-biryani','Standard',220,1),
 ('prawns-biryani','Standard',220,1),
 ('chicken-gravy','Regular',120,1),('chicken-gravy','Large',160,2),
 ('vajdi-gravy','Standard',140,1),
 ('vegetable-paneer-biryani','Regular',110,1),('vegetable-paneer-biryani','Large',150,2);
