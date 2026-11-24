-- APPLIED IN PRODUCTION on 2026-11-24 (migration: dawat_v2_ordering). Additive; do not re-run.
-- ════════════════════════════════════════════════════════════════════════════
--  Dawat Biryani House — V2: real ordering, bills, receipts, offers, customers,
--  notifications, settings and audit log.
--  ADDITIVE ONLY: no table/column is dropped, no existing row is changed
--  (apart from one policy that is tightened). Safe to run once on production.
--  Money: numeric(10,2) INR. Restaurant-local time: Asia/Kolkata.
-- ════════════════════════════════════════════════════════════════════════════

-- ───────────────────────── helpers ─────────────────────────
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admins a where a.user_id = (select auth.uid()))
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- 10-digit Indian mobile, or null when invalid
create or replace function public._norm_phone(p text) returns text
language plpgsql immutable set search_path = '' as $$
declare d text := regexp_replace(coalesce(p, ''), '\D', '', 'g');
begin
  if length(d) = 12 and left(d, 2) = '91' then d := right(d, 10); end if;
  if length(d) = 11 and left(d, 1) = '0' then d := right(d, 10); end if;
  if d ~ '^[6-9][0-9]{9}$' then return d; end if;
  return null;
end $$;

-- ───────────────────── existing tables: additive columns ─────────────────────
alter table public.dishes
  add column if not exists is_sold_out boolean not null default false,
  add column if not exists is_chef_special boolean not null default false,
  add column if not exists spice_level smallint check (spice_level between 1 and 3),
  add column if not exists archived_at timestamptz;

alter table public.dish_variants
  add column if not exists is_available boolean not null default true;

alter table public.leads
  add column if not exists quote_amount numeric(10,2) check (quote_amount >= 0 and quote_amount <= 10000000),
  add column if not exists archived_at timestamptz,
  add column if not exists converted_order_id uuid,
  add column if not exists updated_at timestamptz not null default now();

-- visitors (old website version) may still insert leads directly — but never with admin-only fields
alter policy "anyone can submit a lead" on public.leads
  with check (status = 'new' and notes is null and quote_amount is null and archived_at is null and converted_order_id is null);

-- ───────────────────────── settings (single rows) ─────────────────────────
create table if not exists public.restaurant_settings (
  id smallint primary key default 1 check (id = 1),
  name text not null check (char_length(name) between 2 and 80),
  address text not null default '' check (char_length(address) <= 300),
  phone_e164 text not null check (phone_e164 ~ '^\+[0-9]{10,15}$'),
  phone_display text not null check (char_length(phone_display) <= 30),
  whatsapp_number text check (whatsapp_number ~ '^[0-9]{10,15}$'),
  whatsapp_confirmed boolean not null default false,
  opens_at time not null default '10:00',
  closes_at time not null default '22:00',
  open_days smallint[] not null default '{0,1,2,3,4,5,6}',
  closed_dates date[] not null default '{}',
  online_ordering_enabled boolean not null default true,
  pickup_enabled boolean not null default true,
  delivery_enabled boolean not null default false,
  delivery_charge numeric(10,2) not null default 0 check (delivery_charge >= 0 and delivery_charge <= 10000),
  free_delivery_above numeric(10,2) check (free_delivery_above >= 0),
  delivery_area_note text not null default '' check (char_length(delivery_area_note) <= 300),
  min_order_value numeric(10,2) not null default 0 check (min_order_value >= 0),
  default_prep_minutes int not null default 30 check (default_prep_minutes between 5 and 240),
  min_lead_minutes int not null default 20 check (min_lead_minutes between 0 and 720),
  max_days_ahead int not null default 7 check (max_days_ahead between 0 and 60),
  tax_enabled boolean not null default false,
  tax_label text not null default 'Tax' check (char_length(tax_label) <= 30),
  tax_rate numeric(5,2) not null default 0 check (tax_rate between 0 and 40),
  gstin text check (gstin ~ '^[0-9A-Z]{15}$'),
  receipt_footer text not null default 'Thank you for choosing Dawat Biryani House!' check (char_length(receipt_footer) <= 200),
  order_notice text not null default '' check (char_length(order_notice) <= 300),
  updated_at timestamptz not null default now(),
  check (closes_at > opens_at)
);

create table if not exists public.website_settings (
  id smallint primary key default 1 check (id = 1),
  announcement_enabled boolean not null default false,
  announcement_text text not null default '' check (char_length(announcement_text) <= 160),
  intro_enabled boolean not null default true,
  intro_duration_ms int not null default 1800 check (intro_duration_ms between 1000 and 3000),
  intro_for_returning boolean not null default false,
  music_enabled boolean not null default true,
  music_url text check (music_url ~ '^https://'),
  music_title text not null default '' check (char_length(music_title) <= 80),
  music_volume numeric(3,2) not null default 0.5 check (music_volume between 0 and 1),
  sfx_enabled boolean not null default true,
  character_enabled boolean not null default true,
  character_messages jsonb not null default '{}'::jsonb check (jsonb_typeof(character_messages) = 'object'),
  featured_dish_ids text[] not null default '{}',
  updated_at timestamptz not null default now()
);

insert into public.restaurant_settings (id, name, address, phone_e164, phone_display, whatsapp_number, whatsapp_confirmed)
values (1, 'Dawat Biryani House',
        'Opposite Padmashree School, B.N.N. College Road, Dhamankar Naka, Bhiwandi, Maharashtra 421305',
        '+919823324553', '+91 98233 24553', '919823324553', false)
on conflict (id) do nothing;
insert into public.website_settings (id) values (1) on conflict (id) do nothing;

-- ───────────────────────── customers ─────────────────────────
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  phone text unique check (phone ~ '^[6-9][0-9]{9}$'),
  notes text check (char_length(notes) <= 2000),
  archived_at timestamptz,
  anonymised_at timestamptz,
  created_at timestamptz not null default now()
);

-- ───────────────────────── offers ─────────────────────────
create table if not exists public.offers (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 2 and 80),
  description text not null default '' check (char_length(description) <= 300),
  discount_type text not null check (discount_type in ('percent','fixed')),
  discount_value numeric(10,2) not null check (discount_value > 0),
  code text unique check (code ~ '^[A-Z0-9]{3,20}$'),
  is_public boolean not null default true,
  applies_to text not null default 'all' check (applies_to in ('all','dishes','categories')),
  dish_ids text[] not null default '{}',
  category_ids text[] not null default '{}',
  min_order numeric(10,2) not null default 0 check (min_order >= 0),
  max_discount numeric(10,2) check (max_discount > 0),
  starts_at timestamptz,
  ends_at timestamptz,
  usage_limit int check (usage_limit > 0),
  per_phone_limit int check (per_phone_limit > 0),
  used_count int not null default 0 check (used_count >= 0),
  is_active boolean not null default false,
  priority int not null default 0,
  banner_url text check (banner_url ~ '^https://'),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (discount_type <> 'percent' or discount_value <= 100),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);

-- ───────────────────────── orders ─────────────────────────
create table if not exists public.bill_counters (
  bill_date date primary key,
  last_value int not null check (last_value > 0)
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  bill_number text not null unique,
  order_date date not null,
  customer_id uuid references public.customers(id) on delete set null,
  customer_name text not null check (char_length(customer_name) between 1 and 80),
  customer_phone text check (customer_phone ~ '^[6-9][0-9]{9}$'),
  mode text not null check (mode in ('pickup','delivery')),
  delivery_address text check (char_length(delivery_address) <= 300),
  scheduled_for timestamptz,
  instructions text check (char_length(instructions) <= 500),
  status text not null default 'pending' check (status in
    ('pending','confirmed','preparing','ready','out_for_delivery','completed','cancelled','rejected')),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid','paid','refunded')),
  payment_method text check (payment_method in ('cash','upi','card','other')),
  subtotal numeric(10,2) not null check (subtotal >= 0),
  discount numeric(10,2) not null default 0 check (discount >= 0),
  delivery_charge numeric(10,2) not null default 0 check (delivery_charge >= 0),
  tax numeric(10,2) not null default 0 check (tax >= 0),
  total numeric(10,2) not null check (total >= 0),
  offer_id uuid references public.offers(id) on delete set null,
  coupon_code text,
  prep_minutes int check (prep_minutes between 1 and 600),
  status_reason text check (char_length(status_reason) <= 300),
  admin_notes text check (char_length(admin_notes) <= 2000),
  source text not null default 'website' check (source in ('website','bulk','admin')),
  lead_id uuid unique references public.leads(id) on delete set null,
  idempotency_key uuid not null unique,
  access_token_hash bytea not null,
  client_fp bytea,                      -- daily-salted hash of the visitor's IP, only for abuse limits
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (total = subtotal - discount + delivery_charge + tax),
  check (mode <> 'delivery' or delivery_address is not null)
);
create index if not exists orders_created_idx on public.orders (created_at desc);
create index if not exists orders_status_idx on public.orders (status);
create index if not exists orders_customer_idx on public.orders (customer_id);
create index if not exists orders_phone_recent_idx on public.orders (customer_phone, created_at desc);
create index if not exists orders_fp_recent_idx on public.orders (client_fp, created_at desc) where client_fp is not null;

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  dish_id text,
  variant_id uuid,
  dish_name text not null,
  variant_label text not null default '',
  unit_price numeric(10,2) not null check (unit_price >= 0),
  qty int not null check (qty between 1 and 50),
  line_total numeric(10,2) not null check (line_total >= 0),
  note text check (char_length(note) <= 200),
  sort_order int not null default 0
);
create index if not exists order_items_order_idx on public.order_items (order_id);

create table if not exists public.receipts (
  order_id uuid primary key references public.orders(id) on delete cascade,
  bill_number text not null unique,
  issued_at timestamptz not null default now(),
  data jsonb not null
);

create table if not exists public.order_status_history (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  from_status text,
  to_status text not null,
  note text,
  changed_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists order_status_history_order_idx on public.order_status_history (order_id, created_at);

create table if not exists public.offer_redemptions (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.offers(id) on delete cascade,
  order_id uuid not null unique references public.orders(id) on delete cascade,
  customer_phone text,
  discount numeric(10,2) not null,
  created_at timestamptz not null default now()
);
create index if not exists offer_redemptions_offer_phone_idx on public.offer_redemptions (offer_id, customer_phone);

-- ─────────────────────── notifications & audit ───────────────────────
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  kind text not null check (kind in ('new_order','order_update','new_bulk','new_enquiry')),
  title text not null,
  body text not null default '',
  order_id uuid references public.orders(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists notifications_created_idx on public.notifications (created_at desc);

create table if not exists public.notification_reads (
  notification_id uuid not null references public.notifications(id) on delete cascade,
  admin_id uuid not null default auth.uid(),
  read_at timestamptz not null default now(),
  primary key (notification_id, admin_id)
);

create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  actor uuid,
  action text not null,
  entity text not null,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_logs_created_idx on public.audit_logs (created_at desc);

-- ───────────────────────── triggers ─────────────────────────
create or replace function public._audit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_old jsonb; v_new jsonb; v_diff jsonb := '{}'::jsonb; k text; v_keys text[] := coalesce(tg_argv, '{}'::text[]);
begin
  if tg_op <> 'INSERT' then v_old := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then v_new := to_jsonb(new); end if;
  if tg_op = 'UPDATE' then
    for k in select jsonb_object_keys(v_new) loop
      if k <> 'updated_at' and (coalesce(cardinality(v_keys), 0) = 0 or k = any (v_keys)) and v_new -> k is distinct from v_old -> k then
        v_diff := v_diff || jsonb_build_object(k, jsonb_build_array(v_old -> k, v_new -> k));
      end if;
    end loop;
    if v_diff = '{}'::jsonb then return new; end if;
  elsif coalesce(cardinality(v_keys), 0) > 0 then
    select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) into v_diff
    from jsonb_each(coalesce(v_new, v_old)) e where e.key = any (v_keys);
  else
    v_diff := coalesce(v_new, v_old);
  end if;
  insert into public.audit_logs (actor, action, entity, entity_id, details)
  values (auth.uid(), lower(tg_op), tg_table_name, coalesce(v_new ->> 'id', v_old ->> 'id'), v_diff);
  return coalesce(new, old);
end $$;

create or replace function public._order_before_update() returns trigger
language plpgsql set search_path = '' as $$
declare ok boolean;
begin
  if new.bill_number is distinct from old.bill_number or new.order_date is distinct from old.order_date
     or new.idempotency_key is distinct from old.idempotency_key or new.access_token_hash is distinct from old.access_token_hash
     or new.subtotal is distinct from old.subtotal or new.discount is distinct from old.discount
     or new.delivery_charge is distinct from old.delivery_charge or new.tax is distinct from old.tax
     or new.total is distinct from old.total or new.created_at is distinct from old.created_at
     or new.lead_id is distinct from old.lead_id or new.offer_id is distinct from old.offer_id then
    raise exception 'order_locked_fields' using errcode = '42501',
      hint = 'Bill number, amounts and dates of an order cannot be changed.';
  end if;
  if new.status is distinct from old.status then
    ok := case old.status
      when 'pending'          then new.status in ('confirmed','rejected','cancelled')
      when 'confirmed'        then new.status in ('preparing','ready','out_for_delivery','cancelled')
      when 'preparing'        then new.status in ('ready','out_for_delivery','cancelled')
      when 'ready'            then new.status in ('completed','cancelled')
      when 'out_for_delivery' then new.status in ('completed','cancelled')
      else false end;
    if ok and new.status = 'ready' and new.mode <> 'pickup' then ok := false; end if;
    if ok and new.status = 'out_for_delivery' and new.mode <> 'delivery' then ok := false; end if;
    if not ok then
      raise exception 'invalid_status_transition' using errcode = '22023',
        detail = format('%s -> %s (%s)', old.status, new.status, new.mode);
    end if;
    if new.status in ('rejected','cancelled') and coalesce(btrim(new.status_reason), '') = '' then
      raise exception 'reason_required' using errcode = '22023', hint = 'Give a reason when rejecting or cancelling.';
    end if;
  end if;
  if new.payment_status is distinct from old.payment_status then
    if not (   (old.payment_status = 'unpaid' and new.payment_status = 'paid')
            or (old.payment_status = 'paid' and new.payment_status in ('unpaid','refunded'))) then
      raise exception 'invalid_payment_transition' using errcode = '22023',
        detail = format('%s -> %s', old.payment_status, new.payment_status);
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;

create or replace function public._order_after_write() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.order_status_history (order_id, from_status, to_status, note, changed_by)
    values (new.id, null, new.status, case when new.source = 'website' then 'Placed on website' else 'Created by restaurant' end, auth.uid());
    insert into public.notifications (event_key, kind, title, body, order_id)
    values ('order:' || new.id, 'new_order', 'New order ' || new.bill_number,
            new.customer_name || ' · ' || new.mode || ' · Rs. ' || new.total, new.id)
    on conflict (event_key) do nothing;
  elsif new.status is distinct from old.status then
    insert into public.order_status_history (order_id, from_status, to_status, note, changed_by)
    values (new.id, old.status, new.status, new.status_reason, auth.uid());
  end if;
  return new;
end $$;

create or replace function public._lead_after_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notifications (event_key, kind, title, body, lead_id)
  values ('lead:' || new.id,
          case when new.kind = 'bulk' then 'new_bulk' else 'new_enquiry' end,
          case when new.kind = 'bulk' then 'New bulk-order enquiry' else 'New enquiry' end,
          coalesce(new.name, 'Customer') || coalesce(' · ' || new.phone, ''), new.id)
  on conflict (event_key) do nothing;
  return new;
end $$;

create or replace trigger orders_before_update before update on public.orders
  for each row execute function public._order_before_update();
create or replace trigger orders_after_write after insert or update on public.orders
  for each row execute function public._order_after_write();
create or replace trigger orders_audit after update on public.orders
  for each row execute function public._audit('status','payment_status','payment_method','prep_minutes','archived_at','status_reason');
create or replace trigger leads_after_insert after insert on public.leads
  for each row execute function public._lead_after_insert();
create or replace trigger leads_touch before update on public.leads
  for each row execute function public.touch_updated_at();

create or replace trigger offers_touch before update on public.offers for each row execute function public.touch_updated_at();
create or replace trigger rs_touch before update on public.restaurant_settings for each row execute function public.touch_updated_at();
create or replace trigger ws_touch before update on public.website_settings for each row execute function public.touch_updated_at();

create or replace trigger offers_audit after insert or update or delete on public.offers for each row execute function public._audit();
create or replace trigger rs_audit after update on public.restaurant_settings for each row execute function public._audit();
create or replace trigger ws_audit after update on public.website_settings for each row execute function public._audit();
create or replace trigger variants_audit after insert or update or delete on public.dish_variants for each row execute function public._audit('dish_id','label','price','is_available');
create or replace trigger dishes_audit after insert or update or delete on public.dishes for each row execute function public._audit('name','status','is_visible','is_sold_out','archived_at');
create or replace trigger customers_audit after update or delete on public.customers for each row execute function public._audit('archived_at','anonymised_at');

-- ───────────────────────── order logic ─────────────────────────
-- Is `p_at` (null = as soon as possible) an acceptable time for an order? Returns an issue or null.
create or replace function public._schedule_issue(s public.restaurant_settings, p_at timestamptz) returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  v_now timestamptz := now();
  v_at timestamptz := coalesce(p_at, v_now + make_interval(mins => s.min_lead_minutes));
  v_local timestamp := v_at at time zone 'Asia/Kolkata';
begin
  if p_at is not null and p_at < v_now + make_interval(mins => s.min_lead_minutes) - interval '2 minutes' then
    return jsonb_build_object('code','time_too_soon','message',
      format('Please choose a time at least %s minutes from now.', s.min_lead_minutes));
  end if;
  if p_at is not null and p_at > v_now + make_interval(days => s.max_days_ahead + 1) then
    return jsonb_build_object('code','time_too_far','message',
      format('Orders can be scheduled up to %s days ahead.', s.max_days_ahead));
  end if;
  if not (extract(dow from v_local)::smallint = any (s.open_days)) or v_local::date = any (s.closed_dates) then
    return jsonb_build_object('code','closed_day','message',
      case when p_at is null then 'The restaurant is closed today. Please choose another day.'
           else 'The restaurant is closed on the chosen day.' end);
  end if;
  if v_local::time < s.opens_at or v_local::time > s.closes_at then
    return jsonb_build_object('code','outside_hours','message',
      format('%s Opening hours: %s – %s.',
        case when p_at is null then 'The restaurant is not taking orders right now. Please schedule a time.'
             else 'The chosen time is outside opening hours.' end,
        to_char(s.opens_at, 'HH12:MI AM'), to_char(s.closes_at, 'HH12:MI AM')));
  end if;
  return null;
end $$;

-- Authoritative price calculation. Never trusts prices sent by the browser.
create or replace function public._compute_quote(p jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  s public.restaurant_settings;
  v_items jsonb := coalesce(p -> 'items', '[]'::jsonb);
  v_mode text := coalesce(p ->> 'mode', 'pickup');
  v_code text := nullif(upper(btrim(coalesce(p ->> 'coupon', ''))), '');
  v_phone text := public._norm_phone(p ->> 'phone');
  v_at timestamptz;
  v_lines jsonb := '[]'::jsonb;
  v_issues jsonb := '[]'::jsonb;
  v_sub numeric(10,2) := 0;
  v_disc numeric(10,2) := 0;
  v_deliv numeric(10,2) := 0;
  v_tax numeric(10,2) := 0;
  v_offer public.offers;
  v_best public.offers;
  v_best_disc numeric(10,2) := 0;
  v_try numeric(10,2);
  v_reason text;
  it jsonb; r record; v_vid uuid; v_qty int; v_exp numeric;
  v_seen uuid[] := '{}';
begin
  select * into s from public.restaurant_settings where id = 1;
  if not s.online_ordering_enabled then
    v_issues := v_issues || jsonb_build_object('code','ordering_paused','message','Online ordering is paused right now. Please call the restaurant.');
  end if;
  if v_mode not in ('pickup','delivery') then
    v_issues := v_issues || jsonb_build_object('code','mode_invalid','message','Choose pickup or delivery.');
  elsif v_mode = 'delivery' and not s.delivery_enabled then
    v_issues := v_issues || jsonb_build_object('code','delivery_unavailable','message','Delivery is not available at the moment. Please choose pickup.');
  elsif v_mode = 'pickup' and not s.pickup_enabled then
    v_issues := v_issues || jsonb_build_object('code','pickup_unavailable','message','Pickup is not available at the moment.');
  end if;

  begin
    v_at := nullif(p ->> 'scheduled_for', '')::timestamptz;
  exception when others then
    v_issues := v_issues || jsonb_build_object('code','time_invalid','message','The chosen date or time is not valid.');
  end;
  if public._schedule_issue(s, v_at) is not null then
    v_issues := v_issues || public._schedule_issue(s, v_at);
  end if;

  if jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) = 0 then
    v_issues := v_issues || jsonb_build_object('code','empty_cart','message','Your order is empty.');
  elsif jsonb_array_length(v_items) > 30 then
    v_issues := v_issues || jsonb_build_object('code','too_many_lines','message','Too many different items in one order.');
  else
    for it in select * from jsonb_array_elements(v_items) loop
      if coalesce(it ->> 'variant_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        v_issues := v_issues || jsonb_build_object('code','item_unavailable','message','An item in your order is no longer on the menu.','variant_id', it ->> 'variant_id');
        continue;
      end if;
      v_vid := (it ->> 'variant_id')::uuid;
      if v_vid = any (v_seen) then continue; end if;
      v_seen := v_seen || v_vid;
      v_qty := case when coalesce(it ->> 'qty', '') ~ '^[0-9]{1,3}$' then (it ->> 'qty')::int else 0 end;
      if v_qty < 1 or v_qty > 50 then
        v_issues := v_issues || jsonb_build_object('code','qty_invalid','message','Quantity must be between 1 and 50.','variant_id', v_vid);
        continue;
      end if;
      select v.id, v.label, v.price, v.is_available, d.id as dish_id, d.name, d.category_id, d.status,
             d.is_visible, d.is_sold_out, d.archived_at,
             (select count(*) from public.dish_variants v2 where v2.dish_id = d.id) as n_variants
        into r
        from public.dish_variants v join public.dishes d on d.id = v.dish_id
       where v.id = v_vid;
      if not found then
        v_issues := v_issues || jsonb_build_object('code','item_unavailable','message','An item in your order is no longer on the menu.','variant_id', v_vid);
      elsif not r.is_visible or r.archived_at is not null or r.status <> 'available' or r.is_sold_out or not r.is_available then
        v_issues := v_issues || jsonb_build_object('code','item_unavailable','variant_id', v_vid,
          'message', r.name || case when r.is_sold_out then ' is sold out right now.' else ' is not available for online orders right now.' end);
      else
        v_exp := case when coalesce(it ->> 'expected_price', '') ~ '^[0-9]+(\.[0-9]{1,2})?$' then (it ->> 'expected_price')::numeric end;
        if v_exp is not null and v_exp <> r.price then
          v_issues := v_issues || jsonb_build_object('code','price_changed','variant_id', v_vid, 'new_price', r.price,
            'message', format('The price of %s%s is now Rs. %s (was Rs. %s).', r.name,
              case when r.n_variants > 1 then ' (' || r.label || ')' else '' end, r.price, v_exp));
        end if;
        v_lines := v_lines || jsonb_build_object(
          'variant_id', r.id, 'dish_id', r.dish_id, 'category_id', r.category_id, 'name', r.name,
          'variant_label', case when r.n_variants > 1 then r.label else '' end,
          'unit_price', r.price, 'qty', v_qty, 'line_total', r.price * v_qty,
          'note', left(nullif(btrim(coalesce(it ->> 'note', '')), ''), 200));
        v_sub := v_sub + r.price * v_qty;
      end if;
    end loop;
  end if;

  if v_sub > 0 and v_sub < s.min_order_value then
    v_issues := v_issues || jsonb_build_object('code','min_order','message',
      format('Minimum order value is Rs. %s.', s.min_order_value));
  end if;

  -- offers ---------------------------------------------------------------
  if v_code is not null then
    select * into v_offer from public.offers where code = v_code and archived_at is null;
    if not found or not v_offer.is_active then
      v_reason := 'This coupon code is not valid.';
    else
      v_reason := public._offer_reason(v_offer, v_lines, v_sub, v_phone);
    end if;
    if v_reason is null then
      v_best := v_offer;
      v_best_disc := public._offer_discount(v_offer, v_lines, v_sub);
    else
      v_issues := v_issues || jsonb_build_object('code','coupon_invalid','message', v_reason);
    end if;
  else
    for v_offer in
      select * from public.offers o
       where o.code is null and o.is_active and o.archived_at is null
         and (o.starts_at is null or o.starts_at <= now()) and (o.ends_at is null or o.ends_at > now())
       order by o.priority desc, o.created_at
    loop
      if public._offer_reason(v_offer, v_lines, v_sub, v_phone) is null then
        v_try := public._offer_discount(v_offer, v_lines, v_sub);
        if v_try > v_best_disc then v_best := v_offer; v_best_disc := v_try; end if;
      end if;
    end loop;
  end if;
  v_disc := least(v_best_disc, v_sub);

  if v_mode = 'delivery' and s.delivery_enabled then
    v_deliv := case when s.free_delivery_above is not null and v_sub - v_disc >= s.free_delivery_above then 0 else s.delivery_charge end;
  end if;
  if s.tax_enabled and s.tax_rate > 0 then
    v_tax := round((v_sub - v_disc) * s.tax_rate / 100, 2);
  end if;

  return jsonb_build_object(
    'lines', v_lines,
    'subtotal', v_sub,
    'discount', v_disc,
    'offer', case when v_best.id is not null and v_disc > 0
                  then jsonb_build_object('id', v_best.id, 'title', v_best.title, 'code', v_best.code) end,
    'delivery_charge', v_deliv,
    'tax', v_tax,
    'tax_label', case when v_tax > 0 then s.tax_label end,
    'total', v_sub - v_disc + v_deliv + v_tax,
    'issues', v_issues,
    'blocking', jsonb_array_length(v_issues) > 0,
    'currency', 'INR');
end $$;

-- Why an offer does not apply (null = it applies)
create or replace function public._offer_reason(o public.offers, p_lines jsonb, p_sub numeric, p_phone text) returns text
language plpgsql stable set search_path = '' as $$
begin
  if not o.is_active or o.archived_at is not null then return 'This offer is not active.'; end if;
  if o.starts_at is not null and o.starts_at > now() then return 'This offer has not started yet.'; end if;
  if o.ends_at is not null and o.ends_at <= now() then return 'This offer has expired.'; end if;
  if o.usage_limit is not null and o.used_count >= o.usage_limit then return 'This offer has been fully used.'; end if;
  if o.per_phone_limit is not null and p_phone is not null and
     (select count(*) from public.offer_redemptions r where r.offer_id = o.id and r.customer_phone = p_phone) >= o.per_phone_limit then
    return 'You have already used this offer the maximum number of times.';
  end if;
  if p_sub < o.min_order then return format('Add items worth Rs. %s or more to use this offer.', o.min_order); end if;
  if public._offer_discount(o, p_lines, p_sub) <= 0 then return 'This offer does not apply to the items in your order.'; end if;
  return null;
end $$;

create or replace function public._offer_discount(o public.offers, p_lines jsonb, p_sub numeric) returns numeric
language plpgsql stable set search_path = '' as $$
declare v_elig numeric := 0; v_d numeric;
begin
  select coalesce(sum((l ->> 'line_total')::numeric), 0) into v_elig
    from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) l
   where o.applies_to = 'all'
      or (o.applies_to = 'dishes' and (l ->> 'dish_id') = any (o.dish_ids))
      or (o.applies_to = 'categories' and (l ->> 'category_id') = any (o.category_ids));
  if v_elig <= 0 then return 0; end if;
  v_d := case o.discount_type when 'percent' then round(v_elig * o.discount_value / 100, 2) else least(o.discount_value, v_elig) end;
  if o.max_discount is not null then v_d := least(v_d, o.max_discount); end if;
  return least(v_d, p_sub);
end $$;

create or replace function public._order_json(p_order_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', o.id, 'bill_number', o.bill_number, 'created_at', o.created_at, 'order_date', o.order_date,
    'customer_name', o.customer_name, 'customer_phone', o.customer_phone,
    'mode', o.mode, 'delivery_address', o.delivery_address, 'scheduled_for', o.scheduled_for,
    'instructions', o.instructions, 'status', o.status, 'status_reason', o.status_reason,
    'payment_status', o.payment_status, 'prep_minutes', o.prep_minutes,
    'subtotal', o.subtotal, 'discount', o.discount, 'delivery_charge', o.delivery_charge,
    'tax', o.tax, 'total', o.total, 'coupon_code', o.coupon_code, 'updated_at', o.updated_at,
    'receipt', r.data,
    'items', coalesce((select jsonb_agg(jsonb_build_object('name', i.dish_name, 'variant_label', i.variant_label,
                'unit_price', i.unit_price, 'qty', i.qty, 'line_total', i.line_total, 'note', i.note) order by i.sort_order)
              from public.order_items i where i.order_id = o.id), '[]'::jsonb),
    'history', coalesce((select jsonb_agg(jsonb_build_object('status', h.to_status, 'at', h.created_at) order by h.created_at)
              from public.order_status_history h where h.order_id = o.id), '[]'::jsonb))
  from public.orders o left join public.receipts r on r.order_id = o.id
  where o.id = p_order_id
$$;

create or replace function public._next_bill_number(p_date date) returns text
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  insert into public.bill_counters (bill_date, last_value) values (p_date, 1)
  on conflict (bill_date) do update set last_value = public.bill_counters.last_value + 1
  returning last_value into n;   -- the row lock makes this safe under concurrency
  return 'DBH-' || to_char(p_date, 'YYYYMMDD') || '-' || case when n < 10000 then lpad(n::text, 4, '0') else n::text end;
end $$;

create or replace function public._receipt_snapshot() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'title', 'Order Receipt', 'restaurant', s.name, 'address', s.address, 'phone', s.phone_display,
    'phone_e164', s.phone_e164, 'whatsapp', case when s.whatsapp_confirmed then s.whatsapp_number end,
    'gstin', s.gstin, 'footer', s.receipt_footer)
  from public.restaurant_settings s where s.id = 1
$$;

-- ═══════════════════════ PUBLIC API (called by the website) ═══════════════════════
create or replace function public.get_storefront() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'server_time', now(),
    'categories', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'label', c.label) order by c.sort_order) from public.categories c), '[]'::jsonb),
    'dishes', coalesce((select jsonb_agg(jsonb_build_object(
        'id', d.id, 'name', d.name, 'category_id', d.category_id, 'diet', d.diet, 'status', d.status,
        'image_path', d.image_path, 'image_kind', d.image_kind, 'description', d.description,
        'is_sold_out', d.is_sold_out, 'is_chef_special', d.is_chef_special, 'spice_level', d.spice_level,
        'variants', coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'label', v.label, 'price', v.price,
                      'is_available', v.is_available, 'sort_order', v.sort_order) order by v.sort_order, v.id)
                    from public.dish_variants v where v.dish_id = d.id), '[]'::jsonb))
        order by d.sort_order, d.id)
      from public.dishes d where d.is_visible and d.archived_at is null), '[]'::jsonb),
    'offers', coalesce((select jsonb_agg(jsonb_build_object(
        'id', o.id, 'title', o.title, 'description', o.description, 'discount_type', o.discount_type,
        'discount_value', o.discount_value, 'code', o.code, 'applies_to', o.applies_to, 'dish_ids', o.dish_ids,
        'category_ids', o.category_ids, 'min_order', o.min_order, 'max_discount', o.max_discount,
        'ends_at', o.ends_at, 'banner_url', o.banner_url) order by o.priority desc, o.created_at)
      from public.offers o
      where o.is_public and o.is_active and o.archived_at is null
        and (o.starts_at is null or o.starts_at <= now()) and (o.ends_at is null or o.ends_at > now())
        and (o.usage_limit is null or o.used_count < o.usage_limit)), '[]'::jsonb),
    'restaurant', (select jsonb_build_object(
        'name', s.name, 'address', s.address, 'phone_e164', s.phone_e164, 'phone_display', s.phone_display,
        'whatsapp_number', s.whatsapp_number, 'whatsapp_confirmed', s.whatsapp_confirmed,
        'opens_at', to_char(s.opens_at, 'HH24:MI'), 'closes_at', to_char(s.closes_at, 'HH24:MI'),
        'open_days', s.open_days, 'closed_dates', s.closed_dates,
        'online_ordering_enabled', s.online_ordering_enabled, 'pickup_enabled', s.pickup_enabled,
        'delivery_enabled', s.delivery_enabled, 'delivery_charge', s.delivery_charge,
        'free_delivery_above', s.free_delivery_above, 'delivery_area_note', s.delivery_area_note,
        'min_order_value', s.min_order_value, 'default_prep_minutes', s.default_prep_minutes,
        'min_lead_minutes', s.min_lead_minutes, 'max_days_ahead', s.max_days_ahead, 'order_notice', s.order_notice)
      from public.restaurant_settings s where s.id = 1),
    'website', (select jsonb_build_object(
        'announcement_enabled', w.announcement_enabled, 'announcement_text', w.announcement_text,
        'intro_enabled', w.intro_enabled, 'intro_duration_ms', w.intro_duration_ms, 'intro_for_returning', w.intro_for_returning,
        'music_enabled', w.music_enabled, 'music_url', w.music_url, 'music_title', w.music_title, 'music_volume', w.music_volume,
        'sfx_enabled', w.sfx_enabled, 'character_enabled', w.character_enabled, 'character_messages', w.character_messages,
        'featured_dish_ids', w.featured_dish_ids)
      from public.website_settings w where w.id = 1))
$$;

create or replace function public.quote_order(p jsonb) returns jsonb
language sql stable security definer set search_path = '' as $$
  select public._compute_quote(p)
$$;

create or replace function public.place_order(p jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_key uuid; v_token text; v_hash bytea; v_existing record;
  v_name text; v_phone text; v_mode text; v_addr text; v_instr text; v_at timestamptz;
  q jsonb; v_cust uuid; v_bill text; v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_id uuid; v_offer_id uuid; v_n int; v_ip text; v_fp bytea;
begin
  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception 'invalid_request' using errcode = '22023';
  end if;
  if coalesce(p ->> 'idempotency_key', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'invalid_request' using errcode = '22023', detail = 'idempotency_key';
  end if;
  v_key := (p ->> 'idempotency_key')::uuid;
  v_token := coalesce(p ->> 'access_token', '');
  if v_token !~ '^[A-Za-z0-9_-]{32,128}$' then
    raise exception 'invalid_request' using errcode = '22023', detail = 'access_token';
  end if;
  v_hash := sha256(convert_to(v_token, 'UTF8'));

  -- replay of a request we already stored (double tap, refresh, network retry)
  select id, access_token_hash into v_existing from public.orders where idempotency_key = v_key;
  if found then
    if v_existing.access_token_hash <> v_hash then
      raise exception 'idempotency_conflict' using errcode = '22023';
    end if;
    return public._order_json(v_existing.id) || jsonb_build_object('replayed', true);
  end if;

  v_name := btrim(regexp_replace(coalesce(p ->> 'name', ''), '\s+', ' ', 'g'));
  v_phone := public._norm_phone(p ->> 'phone');
  v_mode := coalesce(p ->> 'mode', '');
  v_addr := nullif(btrim(coalesce(p ->> 'address', '')), '');
  v_instr := nullif(btrim(coalesce(p ->> 'instructions', '')), '');
  if char_length(v_name) < 2 or char_length(v_name) > 80 then
    raise exception 'order_invalid' using errcode = 'P0001', detail = '[{"code":"name_invalid","message":"Please enter your name (2–80 characters)."}]';
  end if;
  if v_phone is null then
    raise exception 'order_invalid' using errcode = 'P0001', detail = '[{"code":"phone_invalid","message":"Please enter a valid 10-digit Indian mobile number."}]';
  end if;
  if v_mode = 'delivery' and (v_addr is null or char_length(v_addr) < 8 or char_length(v_addr) > 300) then
    raise exception 'order_invalid' using errcode = 'P0001', detail = '[{"code":"address_invalid","message":"Please enter the full delivery address."}]';
  end if;
  if v_mode = 'pickup' then v_addr := null; end if;
  if char_length(coalesce(v_instr, '')) > 500 then
    raise exception 'order_invalid' using errcode = 'P0001', detail = '[{"code":"instructions_too_long","message":"Instructions are too long (max 500 characters)."}]';
  end if;
  if coalesce(p ->> 'confirm', '') <> 'true' then
    raise exception 'order_invalid' using errcode = 'P0001', detail = '[{"code":"confirm_required","message":"Please confirm your order details."}]';
  end if;

  -- simple abuse protection
  select count(*) into v_n from public.orders where customer_phone = v_phone and created_at > now() - interval '10 minutes';
  if v_n >= 5 then
    raise exception 'rate_limited' using errcode = 'P0001', hint = 'Too many orders from this number. Please wait a few minutes or call the restaurant.';
  end if;
  begin
    v_ip := btrim(split_part(coalesce(nullif(current_setting('request.headers', true), '')::json ->> 'x-forwarded-for', ''), ',', 1));
  exception when others then v_ip := ''; end;
  if coalesce(v_ip, '') <> '' then
    v_fp := sha256(convert_to(v_ip || '|' || v_today::text || '|dawat', 'UTF8'));
    select count(*) into v_n from public.orders where client_fp = v_fp and created_at > now() - interval '10 minutes';
    if v_n >= 10 then
      raise exception 'rate_limited' using errcode = 'P0001', hint = 'Too many orders from this device. Please wait a few minutes or call the restaurant.';
    end if;
  end if;
  select count(*) into v_n from public.orders where created_at > now() - interval '1 minute';
  if v_n >= 120 then
    raise exception 'rate_limited' using errcode = 'P0001', hint = 'The restaurant is receiving many orders. Please try again in a minute.';
  end if;

  q := public._compute_quote(p);
  if (q ->> 'blocking')::boolean then
    raise exception 'order_invalid' using errcode = 'P0001', detail = (q -> 'issues')::text;
  end if;
  v_at := nullif(p ->> 'scheduled_for', '')::timestamptz;
  v_offer_id := nullif(q #>> '{offer,id}', '')::uuid;

  begin
    insert into public.customers (name, phone) values (v_name, v_phone)
    on conflict (phone) do update set name = public.customers.name
    returning id into v_cust;

    if v_offer_id is not null then
      update public.offers set used_count = used_count + 1
       where id = v_offer_id and (usage_limit is null or used_count < usage_limit);
      if not found then
        raise exception 'order_invalid' using errcode = 'P0001', detail = '[{"code":"coupon_invalid","message":"This offer has just been fully used."}]';
      end if;
    end if;

    v_bill := public._next_bill_number(v_today);
    insert into public.orders (bill_number, order_date, customer_id, customer_name, customer_phone, mode, delivery_address,
                               scheduled_for, instructions, subtotal, discount, delivery_charge, tax, total,
                               offer_id, coupon_code, idempotency_key, access_token_hash, source, client_fp)
    values (v_bill, v_today, v_cust, v_name, v_phone, v_mode, v_addr, v_at, v_instr,
            (q ->> 'subtotal')::numeric, (q ->> 'discount')::numeric, (q ->> 'delivery_charge')::numeric,
            (q ->> 'tax')::numeric, (q ->> 'total')::numeric,
            v_offer_id, case when v_offer_id is not null then q #>> '{offer,code}' end, v_key, v_hash, 'website', v_fp)
    returning id into v_id;

    insert into public.order_items (order_id, dish_id, variant_id, dish_name, variant_label, unit_price, qty, line_total, note, sort_order)
    select v_id, l ->> 'dish_id', (l ->> 'variant_id')::uuid, l ->> 'name', coalesce(l ->> 'variant_label', ''),
           (l ->> 'unit_price')::numeric, (l ->> 'qty')::int, (l ->> 'line_total')::numeric, l ->> 'note', ord
      from jsonb_array_elements(q -> 'lines') with ordinality as t(l, ord);

    if v_offer_id is not null then
      insert into public.offer_redemptions (offer_id, order_id, customer_phone, discount)
      values (v_offer_id, v_id, v_phone, (q ->> 'discount')::numeric);
    end if;

    insert into public.receipts (order_id, bill_number, data) values (v_id, v_bill, public._receipt_snapshot());
  exception when unique_violation then
    -- a parallel request with the same idempotency key won the race
    select id, access_token_hash into v_existing from public.orders where idempotency_key = v_key;
    if found and v_existing.access_token_hash = v_hash then
      return public._order_json(v_existing.id) || jsonb_build_object('replayed', true);
    end if;
    raise;
  end;

  return public._order_json(v_id) || jsonb_build_object('replayed', false);
end $$;

-- Receipt / tracking: only with the secret token that was created with the order.
create or replace function public.get_order(p_order_id uuid, p_token text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_hash bytea;
begin
  select access_token_hash into v_hash from public.orders where id = p_order_id;
  if v_hash is null or p_token is null or v_hash <> sha256(convert_to(p_token, 'UTF8')) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  return public._order_json(p_order_id);
end $$;

-- "My orders" on this device: up to 20 (id, token) pairs kept in the customer's own browser.
create or replace function public.get_my_orders(p jsonb) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'bill_number', o.bill_number, 'created_at', o.created_at,
            'status', o.status, 'total', o.total, 'mode', o.mode) order by o.created_at desc), '[]'::jsonb)
  from (select (e ->> 'id') as id_text, e ->> 'token' as token
          from jsonb_array_elements(case when jsonb_typeof(p) = 'array' then p else '[]'::jsonb end) with ordinality t(e, n)
         where n <= 20) x
  join public.orders o
    on x.id_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   and o.id = x.id_text::uuid
   and o.access_token_hash = sha256(convert_to(coalesce(x.token, ''), 'UTF8'))
$$;

-- Enquiries (bulk / contact) with a real confirmation instead of fire-and-forget.
create or replace function public.submit_enquiry(p jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare v_kind text := coalesce(p ->> 'kind', ''); v_name text; v_phone text; v_msg text; v_id uuid; v_n int;
begin
  if v_kind not in ('bulk','contact') then raise exception 'invalid_request' using errcode = '22023'; end if;
  v_name := btrim(coalesce(p ->> 'name', ''));
  v_phone := public._norm_phone(p ->> 'phone');
  v_msg := left(coalesce(p ->> 'message', ''), 2000);
  if char_length(v_name) < 2 or char_length(v_name) > 100 then
    raise exception 'enquiry_invalid' using errcode = 'P0001', detail = '[{"code":"name_invalid","message":"Please enter your name."}]';
  end if;
  if v_phone is null then
    raise exception 'enquiry_invalid' using errcode = 'P0001', detail = '[{"code":"phone_invalid","message":"Please enter a valid 10-digit Indian mobile number."}]';
  end if;
  select count(*) into v_n from public.leads where phone = v_phone and created_at > now() - interval '10 minutes';
  if v_n >= 5 then raise exception 'rate_limited' using errcode = 'P0001', hint = 'Please wait a few minutes before sending another enquiry.'; end if;
  insert into public.leads (kind, name, phone, message, payload)
  values (v_kind, v_name, v_phone, v_msg,
          case when jsonb_typeof(p -> 'payload') = 'object' and length((p -> 'payload')::text) < 4000 then p -> 'payload' else '{}'::jsonb end)
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'created_at', now());
end $$;

-- ═══════════════════════ ADMIN API ═══════════════════════
create or replace function public.admin_get_order(p_order_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return public._order_json(p_order_id);
end $$;

create or replace function public.admin_stats(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v jsonb;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  with o as (select * from public.orders where order_date between p_from and p_to)
  select jsonb_build_object(
    'orders', (select count(*) from o),
    'by_status', coalesce((select jsonb_object_agg(status, n) from (select status, count(*) n from o group by status) x), '{}'::jsonb),
    'order_value', (select coalesce(sum(total), 0) from o where status not in ('cancelled','rejected')),
    'completed_value', (select coalesce(sum(total), 0) from o where status = 'completed'),
    'paid_value', (select coalesce(sum(total), 0) from o where payment_status = 'paid'),
    'unique_customers', (select count(distinct customer_id) from o),
    'returning_customers', (select count(*) from (select customer_id from o where customer_id is not null group by customer_id) c
                              where (select count(*) from public.orders o2 where o2.customer_id = c.customer_id and o2.order_date < p_from) > 0
                                 or (select count(*) from o o3 where o3.customer_id = c.customer_id) > 1),
    'daily', coalesce((select jsonb_agg(jsonb_build_object('date', d::date, 'orders', coalesce(x.n, 0),
                         'completed_value', coalesce(x.cv, 0), 'paid_value', coalesce(x.pv, 0)) order by d)
                       from generate_series(p_from, p_to, interval '1 day') d
                       left join (select order_date, count(*) n, sum(total) filter (where status = 'completed') cv,
                                         sum(total) filter (where payment_status = 'paid') pv
                                    from o group by order_date) x on x.order_date = d::date), '[]'::jsonb),
    'new_enquiries', (select count(*) from public.leads where status = 'new' and archived_at is null),
    'active_offers', (select count(*) from public.offers where is_active and archived_at is null and (ends_at is null or ends_at > now())),
    'available_dishes', (select count(*) from public.dishes where is_visible and archived_at is null and not is_sold_out and status = 'available'),
    'sold_out_dishes', (select count(*) from public.dishes where is_visible and archived_at is null and is_sold_out),
    'pending_now', (select count(*) from public.orders where status = 'pending' and archived_at is null))
  into v;
  return v;
end $$;

create or replace function public.admin_customers() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', c.id, 'name', c.name, 'phone', c.phone, 'notes', c.notes, 'archived_at', c.archived_at,
      'anonymised_at', c.anonymised_at, 'created_at', c.created_at,
      'first_order_at', s.first_at, 'last_order_at', s.last_at, 'orders', coalesce(s.n, 0),
      'completed', coalesce(s.done, 0), 'cancelled', coalesce(s.cancelled, 0), 'value', coalesce(s.value, 0))
      order by s.last_at desc nulls last)
    from public.customers c
    left join (select customer_id, min(created_at) first_at, max(created_at) last_at, count(*) n,
                      count(*) filter (where status = 'completed') done,
                      count(*) filter (where status in ('cancelled','rejected')) cancelled,
                      sum(total) filter (where status not in ('cancelled','rejected')) value
                 from public.orders group by customer_id) s on s.customer_id = c.id), '[]'::jsonb);
end $$;

-- Delete a customer with no orders; otherwise anonymise (orders, amounts and bill numbers are kept).
create or replace function public.admin_remove_customer(p_customer_id uuid) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare v_has boolean;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select exists (select 1 from public.orders where customer_id = p_customer_id) into v_has;
  if not v_has then
    delete from public.customers where id = p_customer_id;
    if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
    return 'deleted';
  end if;
  update public.customers set name = 'Anonymised customer', phone = null, notes = null, anonymised_at = now()
   where id = p_customer_id;
  update public.orders set customer_name = 'Anonymised customer', customer_phone = null,
         delivery_address = case when mode = 'delivery' then '[removed]' end, instructions = null
   where customer_id = p_customer_id;
  return 'anonymised';
end $$;

-- Turn a quoted bulk enquiry into a real order (once).
create or replace function public.admin_convert_lead(p_lead_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare l public.leads; v_phone text; v_bill text; v_id uuid; v_token text; v_today date := (now() at time zone 'Asia/Kolkata')::date;
        v_cust uuid; v_mode text; v_at timestamptz;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into l from public.leads where id = p_lead_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if l.converted_order_id is not null then raise exception 'already_converted' using errcode = '22023'; end if;
  if l.quote_amount is null or l.quote_amount <= 0 then raise exception 'quote_required' using errcode = '22023', hint = 'Save a quotation amount first.'; end if;
  v_phone := public._norm_phone(l.phone);
  v_mode := case when l.payload ->> 'mode' = 'delivery' then 'delivery' else 'pickup' end;
  begin
    v_at := ((l.payload ->> 'date') || ' ' || coalesce(nullif(l.payload ->> 'time', ''), '12:00'))::timestamp at time zone 'Asia/Kolkata';
  exception when others then v_at := null; end;
  if v_phone is not null then
    insert into public.customers (name, phone) values (coalesce(nullif(btrim(l.name), ''), 'Customer'), v_phone)
    on conflict (phone) do update set name = public.customers.name returning id into v_cust;
  end if;
  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  v_bill := public._next_bill_number(v_today);
  insert into public.orders (bill_number, order_date, customer_id, customer_name, customer_phone, mode, delivery_address,
                             scheduled_for, instructions, status, subtotal, total, idempotency_key, access_token_hash, source, lead_id)
  values (v_bill, v_today, v_cust, coalesce(nullif(btrim(l.name), ''), 'Customer'), v_phone, v_mode,
          case when v_mode = 'delivery' then 'To be confirmed with customer' end,
          v_at, left(l.payload ->> 'instructions', 500), 'confirmed', l.quote_amount, l.quote_amount,
          gen_random_uuid(), sha256(convert_to(v_token, 'UTF8')), 'bulk', l.id)
  returning id into v_id;
  insert into public.order_items (order_id, dish_name, variant_label, unit_price, qty, line_total)
  values (v_id, 'Bulk order: ' || coalesce(l.payload ->> 'variety', 'Biryani'),
          coalesce((l.payload ->> 'kg') || ' kg', ''), l.quote_amount, 1, l.quote_amount);
  insert into public.receipts (order_id, bill_number, data) values (v_id, v_bill, public._receipt_snapshot());
  update public.leads set converted_order_id = v_id, status = 'confirmed' where id = l.id;
  return jsonb_build_object('order_id', v_id, 'bill_number', v_bill, 'access_token', v_token);
end $$;

create or replace function public.admin_mark_all_read() returns int
language plpgsql volatile security definer set search_path = '' as $$
declare n int;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  insert into public.notification_reads (notification_id, admin_id)
  select n2.id, auth.uid() from public.notifications n2
   where not exists (select 1 from public.notification_reads r where r.notification_id = n2.id and r.admin_id = auth.uid());
  get diagnostics n = row_count;
  return n;
end $$;

-- ─────────────────────────── RLS ───────────────────────────
alter table public.restaurant_settings enable row level security;
alter table public.website_settings enable row level security;
alter table public.customers enable row level security;
alter table public.offers enable row level security;
alter table public.bill_counters enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.receipts enable row level security;
alter table public.order_status_history enable row level security;
alter table public.offer_redemptions enable row level security;
alter table public.notifications enable row level security;
alter table public.notification_reads enable row level security;
alter table public.audit_logs enable row level security;

create policy "public reads restaurant settings" on public.restaurant_settings for select to anon, authenticated using (true);
create policy "admin updates restaurant settings" on public.restaurant_settings for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "public reads website settings" on public.website_settings for select to anon, authenticated using (true);
create policy "admin updates website settings" on public.website_settings for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "admin manages customers" on public.customers for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin manages offers" on public.offers for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin reads orders" on public.orders for select to authenticated using (public.is_admin());
create policy "admin updates orders" on public.orders for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin reads order items" on public.order_items for select to authenticated using (public.is_admin());
create policy "admin reads receipts" on public.receipts for select to authenticated using (public.is_admin());
create policy "admin reads status history" on public.order_status_history for select to authenticated using (public.is_admin());
create policy "admin reads redemptions" on public.offer_redemptions for select to authenticated using (public.is_admin());
create policy "admin reads notifications" on public.notifications for select to authenticated using (public.is_admin());
create policy "admin manages own reads" on public.notification_reads for all to authenticated
  using (public.is_admin() and admin_id = (select auth.uid())) with check (public.is_admin() and admin_id = (select auth.uid()));
create policy "admin reads audit log" on public.audit_logs for select to authenticated using (public.is_admin());

-- ─────────────────────────── grants (least privilege) ───────────────────────────
grant select on public.restaurant_settings, public.website_settings to anon, authenticated;
grant update on public.restaurant_settings, public.website_settings to authenticated;
grant select, insert, update, delete on public.customers, public.offers to authenticated;
grant select, update on public.orders to authenticated;
grant select on public.order_items, public.receipts, public.order_status_history, public.offer_redemptions,
              public.notifications, public.audit_logs to authenticated;
grant select, insert, delete on public.notification_reads to authenticated;

revoke all on function public._norm_phone(text), public._audit(), public._order_before_update(), public._order_after_write(),
  public._lead_after_insert(), public._schedule_issue(public.restaurant_settings, timestamptz), public._compute_quote(jsonb),
  public._offer_reason(public.offers, jsonb, numeric, text), public._offer_discount(public.offers, jsonb, numeric),
  public._order_json(uuid), public._next_bill_number(date), public._receipt_snapshot() from public, anon, authenticated;

revoke all on function public.get_storefront(), public.quote_order(jsonb), public.place_order(jsonb),
  public.get_order(uuid, text), public.get_my_orders(jsonb), public.submit_enquiry(jsonb) from public;
grant execute on function public.get_storefront(), public.quote_order(jsonb), public.place_order(jsonb),
  public.get_order(uuid, text), public.get_my_orders(jsonb), public.submit_enquiry(jsonb) to anon, authenticated;

revoke all on function public.admin_get_order(uuid), public.admin_stats(date, date), public.admin_customers(),
  public.admin_remove_customer(uuid), public.admin_convert_lead(uuid), public.admin_mark_all_read() from public, anon;
grant execute on function public.admin_get_order(uuid), public.admin_stats(date, date), public.admin_customers(),
  public.admin_remove_customer(uuid), public.admin_convert_lead(uuid), public.admin_mark_all_read() to authenticated;

-- ─────────────────────────── realtime ───────────────────────────
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications') then
      alter publication supabase_realtime add table public.notifications;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'orders') then
      alter publication supabase_realtime add table public.orders;
    end if;
  end if;
end $$;

-- ─────────────────────────── storage (admin uploads) ───────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('images', 'images', true, 5242880, array['image/jpeg','image/png','image/webp']),
  ('audio', 'audio', true, 15728640, array['audio/mpeg','audio/ogg','audio/mp4','audio/aac','audio/x-m4a','audio/wav'])
on conflict (id) do nothing;

create policy "admin uploads media" on storage.objects for insert to authenticated
  with check (bucket_id in ('images','audio') and public.is_admin());
create policy "admin updates media" on storage.objects for update to authenticated
  using (bucket_id in ('images','audio') and public.is_admin()) with check (bucket_id in ('images','audio') and public.is_admin());
create policy "admin deletes media" on storage.objects for delete to authenticated
  using (bucket_id in ('images','audio') and public.is_admin());
