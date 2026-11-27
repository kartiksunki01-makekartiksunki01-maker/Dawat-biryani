-- V3.6 — Bulk & Special Orders
-- A separate per-kilogram bulk menu (regular plate prices are never touched), server-priced multi-dish
-- bulk enquiries, and an extended quotation → order conversion.
-- ADDITIVE ONLY: one new table, new columns with defaults, a widened status check, new/replaced functions.
-- No existing row is changed or deleted. Safe to run more than once.

-- ───────────── leads: 'rejected' status + duplicate-submission protection ─────────────
alter table public.leads drop constraint if exists leads_status_check;
alter table public.leads add constraint leads_status_check
  check (status in ('new','contacted','confirmed','rejected','closed'));
alter table public.leads add column if not exists idempotency_key uuid;
create unique index if not exists leads_idempotency_key_idx on public.leads (idempotency_key) where idempotency_key is not null;

-- ───────────── menu-wide bulk rule ─────────────
alter table public.restaurant_settings
  add column if not exists bulk_max_total_kg smallint not null default 20 check (bulk_max_total_kg between 1 and 500);

-- ───────────── bulk menu ─────────────
create table if not exists public.bulk_menu_items (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  name text not null check (char_length(btrim(name)) between 2 and 120),
  category text not null check (category in ('chicken','mutton','seafood','vegetarian','gravies','chicken-specials','starters')),
  diet text not null default 'unconfirmed' check (diet in ('veg','non-veg','unconfirmed')),
  price_per_kg numeric(10,2) not null check (price_per_kg > 0 and price_per_kg <= 100000),
  description text not null default '' check (char_length(description) <= 400),
  image_path text check (char_length(image_path) <= 500),
  image_kind text check (image_kind in ('promotional','photo')),
  is_available boolean not null default false,          -- shown on the website (new dishes start hidden)
  is_sold_out boolean not null default false,
  min_kg smallint not null default 1 check (min_kg between 1 and 50),
  max_kg smallint not null default 20 check (max_kg between 1 and 50),
  notice_free_up_to_kg smallint not null default 5 check (notice_free_up_to_kg between 0 and 50),
  advance_notice_hours smallint not null default 2 check (advance_notice_hours between 0 and 168),
  timing_confirmed boolean not null default false,      -- the restaurant has confirmed the timing rule for this dish
  admin_note text check (char_length(admin_note) <= 500),  -- private, never sent to the website
  display_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  check (min_kg <= max_kg)
);
create index if not exists bulk_menu_items_order_idx on public.bulk_menu_items (display_order, name);

create or replace trigger bulk_menu_items_touch before update on public.bulk_menu_items
  for each row execute function public.touch_updated_at();
create or replace trigger bulk_menu_items_audit after insert or update or delete on public.bulk_menu_items
  for each row execute function public._audit('name','price_per_kg','category','is_available','is_sold_out','min_kg','max_kg',
                                              'notice_free_up_to_kg','advance_notice_hours','archived_at');

alter table public.bulk_menu_items enable row level security;
drop policy if exists "public reads published bulk items" on public.bulk_menu_items;
create policy "public reads published bulk items" on public.bulk_menu_items for select to anon, authenticated
  using (archived_at is null and is_available);
drop policy if exists "admin manages bulk items" on public.bulk_menu_items;
create policy "admin manages bulk items" on public.bulk_menu_items for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
-- least privilege (Supabase's default grants are wider): visitors may read the public columns only
-- (the private admin_note is not granted); signed-in users get plain DML, which RLS limits to admins
revoke all on public.bulk_menu_items from anon, authenticated;
grant select (id, slug, name, category, diet, price_per_kg, description, image_path, image_kind, is_available, is_sold_out,
              min_kg, max_kg, notice_free_up_to_kg, advance_notice_hours, timing_confirmed, display_order,
              created_at, updated_at, archived_at) on public.bulk_menu_items to anon;
grant select, insert, update, delete on public.bulk_menu_items to authenticated;

-- Seed: the 12 dishes supplied by the restaurant (₹ per kg). ON CONFLICT DO NOTHING — re-running never
-- overwrites prices or anything else an administrator has edited since.
insert into public.bulk_menu_items
  (slug, name, category, diet, price_per_kg, image_path, image_kind, is_available, timing_confirmed, admin_note, display_order) values
  ('chicken-dum-biryani',         'Chicken Dum Biryani',                'chicken',          'non-veg',  800, 'assets/images/dishes/chicken-dum.webp',   'promotional', true,  false, null, 10),
  ('chicken-tikka-biryani',       'Chicken Tikka Biryani',              'chicken',          'non-veg', 1200, 'assets/images/dishes/chicken-tikka.webp', 'promotional', true,  false, null, 20),
  ('chicken-malai-tikka-biryani', 'Chicken Malai Tikka Biryani',        'chicken',          'non-veg', 1400, null, null, false, false,
     'Price read as ₹1,400 per kg from a WhatsApp screenshot — confirm the unit with the restaurant, then switch on “Show on website”.', 30),
  ('chicken-italian-biryani',     'Chicken Italian Biryani',            'chicken',          'non-veg', 1400, null, null, true,  false, null, 40),
  ('prawns-biryani',              'Prawns Biryani',                     'seafood',          'non-veg', 1400, 'assets/images/dishes/prawns.webp',        'promotional', true,  false,
     'Spelling to confirm with the restaurant.', 50),
  ('mutton-biryani',              'Mutton Biryani',                     'mutton',           'non-veg', 1600, 'assets/images/dishes/mutton.webp',        'promotional', true,  false, null, 60),
  ('mutton-tikka-biryani',        'Mutton Tikka Biryani',               'mutton',           'non-veg', 1800, null, null, true,  false, null, 70),
  ('chicken-gravy',               'Chicken Gravy',                      'gravies',          'non-veg',  700, 'assets/images/dishes/chicken-gravy.webp', 'promotional', true,  false, null, 80),
  ('chicken-sukha-lapeta',        'Chicken Sukha Lapeta',               'chicken-specials', 'non-veg',  900, null, null, true,  false,
     'Spelling to confirm with the restaurant.', 90),
  ('chicken-kabab',               'Chicken Kabab',                      'starters',         'non-veg',  700, null, null, true,  false, null, 100),
  ('veg-paneer-biryani',          'Veg Vegetable Paneer Biryani',       'vegetarian',       'veg',      800, 'assets/images/dishes/veg-paneer.webp',    'promotional', true,  true,
     'Timing rule (1–5 kg during business hours, 6–20 kg with 2 hours’ notice) is from the restaurant’s Paneer Biryani poster.', 110),
  ('veg-paneer-tikka-biryani',    'Veg Vegetable Paneer Tikka Biryani', 'vegetarian',       'veg',     1200, null, null, true,  false, null, 120)
on conflict (slug) do nothing;

-- ───────────── helpers ─────────────
-- Indian digit grouping: 120000 → "₹1,20,000"
create or replace function public._inr_text(p numeric) returns text
language plpgsql immutable set search_path = '' as $$
declare v_int text := trunc(abs(p))::bigint::text; v_dec numeric := round(abs(p) - trunc(abs(p)), 2); v_out text;
begin
  if char_length(v_int) > 3 then
    v_out := regexp_replace(left(v_int, char_length(v_int) - 3), '(\d)(?=(\d{2})+$)', '\1,', 'g') || ',' || right(v_int, 3);
  else
    v_out := v_int;
  end if;
  if v_dec > 0 then v_out := v_out || substr(to_char(v_dec, 'FM0.00'), 2); end if;
  return case when p < 0 then '-' else '' end || '₹' || v_out;
end $$;

-- ───────────── storefront (adds the 'bulk' key; everything else unchanged) ─────────────
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
      from public.website_settings w where w.id = 1),
    -- V3.6: per-kilogram Bulk & Special Orders menu (separate from regular plate prices)
    'bulk', jsonb_build_object(
      'max_total_kg', (select s2.bulk_max_total_kg from public.restaurant_settings s2 where s2.id = 1),
      'items', coalesce((select jsonb_agg(jsonb_build_object(
          'id', b.id, 'slug', b.slug, 'name', b.name, 'category', b.category, 'diet', b.diet,
          'price_per_kg', b.price_per_kg, 'description', b.description, 'image_path', b.image_path, 'image_kind', b.image_kind,
          'is_sold_out', b.is_sold_out, 'min_kg', b.min_kg, 'max_kg', b.max_kg,
          'notice_free_up_to_kg', b.notice_free_up_to_kg, 'advance_notice_hours', b.advance_notice_hours,
          'timing_confirmed', b.timing_confirmed) order by b.display_order, b.name)
        from public.bulk_menu_items b where b.archived_at is null and b.is_available), '[]'::jsonb)))
$$;

-- ───────────── server-priced multi-dish bulk enquiry ─────────────
-- Prices, totals, availability, quantities and timing are all checked here; prices sent by the browser are
-- only used to tell the customer that a price changed since they looked.
create or replace function public.submit_bulk_enquiry(p jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  s public.restaurant_settings;
  v_key uuid; v_lead public.leads;
  v_name text; v_phone text; v_mode text; v_event text; v_instr text; v_date date; v_time time;
  v_at timestamptz; v_local timestamp;
  v_items jsonb := p -> 'items';
  v_seen jsonb := coalesce(p -> 'seen_prices', '{}'::jsonb);
  it jsonb; b public.bulk_menu_items; v_kg numeric; v_bid uuid; v_ids uuid[] := '{}';
  v_lines jsonb := '[]'::jsonb; v_issues jsonb := '[]'::jsonb; v_moved jsonb := '[]'::jsonb;
  v_total_kg int := 0; v_total numeric(12,2) := 0; v_need int := 0; v_need_name text; v_need_kg int;
  v_msg text; v_id uuid; v_n int; v_line text := '';
begin
  if p is null or jsonb_typeof(p) <> 'object' then raise exception 'invalid_request' using errcode = '22023'; end if;
  if coalesce(p ->> 'idempotency_key', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'invalid_request' using errcode = '22023', detail = 'idempotency_key';
  end if;
  v_key := (p ->> 'idempotency_key')::uuid;

  -- the same submission sent twice (double tap, retry after a timeout) returns the first result
  select * into v_lead from public.leads where idempotency_key = v_key;
  if found then
    return jsonb_build_object('id', v_lead.id, 'created_at', v_lead.created_at, 'duplicate', true,
      'items', v_lead.payload -> 'items', 'total_kg', v_lead.payload -> 'total_kg', 'estimated_total', v_lead.payload -> 'estimated_total');
  end if;

  select * into s from public.restaurant_settings where id = 1;
  if jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) = 0 then
    raise exception 'bulk_enquiry_invalid' using errcode = 'P0001',
      detail = '[{"code":"empty","message":"Please add at least one dish to your bulk order."}]';
  end if;
  if jsonb_array_length(v_items) > 30 then raise exception 'invalid_request' using errcode = '22023'; end if;

  for it in select value from jsonb_array_elements(v_items) loop
    if jsonb_typeof(it) <> 'object' or coalesce(it ->> 'id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or jsonb_typeof(it -> 'kg') <> 'number' then
      raise exception 'invalid_request' using errcode = '22023', detail = 'items';
    end if;
    v_bid := (it ->> 'id')::uuid;
    if v_bid = any (v_ids) then raise exception 'invalid_request' using errcode = '22023', detail = 'duplicate item'; end if;
    v_ids := v_ids || v_bid;
    v_kg := (it ->> 'kg')::numeric;
    select * into b from public.bulk_menu_items where id = v_bid;
    if not found or b.archived_at is not null or not b.is_available or b.is_sold_out then
      v_issues := v_issues || jsonb_build_object('code', 'unavailable', 'bulk_id', v_bid, 'name', b.name,
        'message', coalesce(b.name, 'A dish in your order') || ' is not available for bulk orders right now. Please remove it to continue.');
      continue;
    end if;
    if v_kg <> trunc(v_kg) or v_kg < b.min_kg or v_kg > b.max_kg then
      v_issues := v_issues || jsonb_build_object('code', 'qty_invalid', 'bulk_id', v_bid, 'name', b.name,
        'message', format('%s can be ordered from %s to %s kg (whole kilograms).', b.name, b.min_kg, b.max_kg));
      continue;
    end if;
    if v_seen ? v_bid::text and jsonb_typeof(v_seen -> v_bid::text) = 'number'
       and (v_seen ->> v_bid::text)::numeric <> b.price_per_kg then
      v_moved := v_moved || jsonb_build_object('code', 'price_changed', 'bulk_id', v_bid, 'name', b.name,
        'old_price', (v_seen ->> v_bid::text)::numeric, 'new_price', b.price_per_kg,
        'message', format('The price of %s changed from %s to %s per kg. Please review your order and send it again.',
                          b.name, public._inr_text((v_seen ->> v_bid::text)::numeric), public._inr_text(b.price_per_kg)));
    end if;
    v_total_kg := v_total_kg + v_kg::int;
    v_total := v_total + b.price_per_kg * v_kg;
    if v_kg > b.notice_free_up_to_kg and b.advance_notice_hours > v_need then
      v_need := b.advance_notice_hours; v_need_name := b.name; v_need_kg := v_kg::int;
    end if;
    v_lines := v_lines || jsonb_build_object('id', b.id, 'slug', b.slug, 'name', b.name, 'price_per_kg', b.price_per_kg,
                                             'kg', v_kg::int, 'subtotal', b.price_per_kg * v_kg);
    v_line := v_line || format(E'\n• %s: %s kg × %s/kg = %s', b.name, v_kg::int, public._inr_text(b.price_per_kg), public._inr_text(b.price_per_kg * v_kg));
  end loop;

  -- availability and price problems are reported first: the website refreshes the menu and shows them
  if jsonb_array_length(v_issues) > 0 and exists (select 1 from jsonb_array_elements(v_issues) e where e ->> 'code' = 'unavailable') then
    raise exception 'bulk_enquiry_invalid' using errcode = 'P0001', detail = v_issues::text;
  end if;
  if jsonb_array_length(v_moved) > 0 then
    raise exception 'bulk_enquiry_invalid' using errcode = 'P0001', detail = v_moved::text;
  end if;
  if v_total_kg > s.bulk_max_total_kg then
    v_issues := v_issues || jsonb_build_object('code', 'total_too_large',
      'message', format('Bulk enquiries can be up to %s kg in total online (yours is %s kg). Please call the restaurant for larger orders.', s.bulk_max_total_kg, v_total_kg));
  end if;

  v_name := btrim(coalesce(p ->> 'name', ''));
  v_phone := public._norm_phone(p ->> 'phone');
  v_mode := coalesce(p ->> 'mode', 'pickup');
  v_event := left(btrim(coalesce(p ->> 'event_type', '')), 60);
  v_instr := left(btrim(coalesce(p ->> 'instructions', '')), 400);
  if char_length(v_name) < 2 or char_length(v_name) > 100 then
    v_issues := v_issues || '{"code":"name_invalid","message":"Please enter your name."}'::jsonb;
  end if;
  if v_phone is null then
    v_issues := v_issues || '{"code":"phone_invalid","message":"Please enter a valid 10-digit Indian mobile number."}'::jsonb;
  end if;
  if v_mode not in ('pickup','delivery') then raise exception 'invalid_request' using errcode = '22023', detail = 'mode'; end if;
  if coalesce(p ->> 'consent', '') <> 'true' then
    v_issues := v_issues || '{"code":"consent_required","message":"Please confirm that the restaurant may contact you."}'::jsonb;
  end if;

  -- preferred date and time, Asia/Kolkata
  begin
    v_date := (p ->> 'date')::date;
    v_time := (p ->> 'time')::time;
  exception when others then v_date := null; v_time := null;
  end;
  if v_date is null or v_time is null then
    v_issues := v_issues || '{"code":"time_required","message":"Please choose a preferred date and time."}'::jsonb;
  else
    v_at := (v_date + v_time) at time zone 'Asia/Kolkata';
    v_local := v_at at time zone 'Asia/Kolkata';
    if v_at < now() - interval '2 minutes' then
      v_issues := v_issues || '{"code":"time_past","message":"The chosen time has already passed. Please choose a later time."}'::jsonb;
    elsif v_need > 0 and v_at < now() + make_interval(hours => v_need) - interval '2 minutes' then
      v_issues := v_issues || jsonb_build_object('code', 'notice_required',
        'message', format('For %s kg of %s, please choose a time at least %s hours from now.', v_need_kg, v_need_name, v_need));
    elsif v_at > now() + interval '365 days' then
      v_issues := v_issues || '{"code":"time_too_far","message":"Please choose a date within the next 12 months."}'::jsonb;
    elsif not (extract(dow from v_local)::smallint = any (s.open_days)) or v_local::date = any (s.closed_dates) then
      v_issues := v_issues || '{"code":"closed_day","message":"The restaurant is closed on the chosen day. Please choose another day."}'::jsonb;
    elsif v_local::time < s.opens_at or v_local::time > s.closes_at then
      v_issues := v_issues || jsonb_build_object('code', 'outside_hours',
        'message', format('Please choose a time within opening hours (%s – %s).', to_char(s.opens_at, 'HH12:MI AM'), to_char(s.closes_at, 'HH12:MI AM')));
    end if;
  end if;

  if jsonb_array_length(v_issues) > 0 then
    raise exception 'bulk_enquiry_invalid' using errcode = 'P0001', detail = v_issues::text;
  end if;

  select count(*) into v_n from public.leads where phone = v_phone and created_at > now() - interval '10 minutes';
  if v_n >= 5 then raise exception 'rate_limited' using errcode = 'P0001', hint = 'Please wait a few minutes before sending another enquiry.'; end if;

  v_msg := left(format(E'%s — BULK & SPECIAL ORDER ENQUIRY\n%s\n\nTotal quantity: %s kg\nEstimated total: %s (estimate — the restaurant confirms the final price)\n\nEvent: %s\nPreferred: %s at %s\n%s\nName: %s\nMobile: %s\nInstructions: %s',
                 upper(s.name), v_line, v_total_kg, public._inr_text(v_total), coalesce(nullif(v_event, ''), '—'),
                 to_char(v_date, 'DD Mon YYYY'), to_char(v_time, 'HH12:MI AM'),
                 case when v_mode = 'delivery' then 'Delivery (if available)' else 'Pickup' end,
                 v_name, v_phone, coalesce(nullif(v_instr, ''), 'None')), 2000);

  insert into public.leads (kind, name, phone, message, payload, idempotency_key)
  values ('bulk', v_name, v_phone, v_msg,
          jsonb_build_object('version', 2, 'items', v_lines, 'total_kg', v_total_kg, 'estimated_total', v_total,
            'event_type', v_event, 'eventType', v_event, 'date', v_date, 'time', to_char(v_time, 'HH24:MI'), 'mode', v_mode,
            'instructions', v_instr, 'kg', v_total_kg,
            'variety', (select string_agg(x ->> 'name', ', ') from jsonb_array_elements(v_lines) x)),
          v_key)
  on conflict (idempotency_key) where idempotency_key is not null do nothing
  returning * into v_lead;
  if v_lead.id is null then   -- a parallel request with the same key won the race
    select * into v_lead from public.leads where idempotency_key = v_key;
    return jsonb_build_object('id', v_lead.id, 'created_at', v_lead.created_at, 'duplicate', true,
      'items', v_lead.payload -> 'items', 'total_kg', v_lead.payload -> 'total_kg', 'estimated_total', v_lead.payload -> 'estimated_total');
  end if;
  return jsonb_build_object('id', v_lead.id, 'created_at', v_lead.created_at, 'duplicate', false,
                            'items', v_lines, 'total_kg', v_total_kg, 'estimated_total', v_total);
end $$;

-- ───────────── quotation → order (extended for multi-dish bulk enquiries) ─────────────
-- Old single-variety enquiries convert exactly as before. Multi-dish enquiries get one receipt line per dish
-- (kg × price per kg as submitted); the difference to the quoted amount is shown as a discount or an adjustment line,
-- so the bill total always equals the quotation.
create or replace function public.admin_convert_lead(p_lead_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare l public.leads; v_phone text; v_bill text; v_id uuid; v_token text; v_today date := (now() at time zone 'Asia/Kolkata')::date;
        v_cust uuid; v_mode text; v_at timestamptz;
        v_lines jsonb; x jsonb; v_est numeric(12,2) := 0; v_ok boolean := false; v_disc numeric(10,2) := 0; v_adj numeric(10,2) := 0;
        v_i int := 0; v_event text;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into l from public.leads where id = p_lead_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if l.converted_order_id is not null then raise exception 'already_converted' using errcode = '22023'; end if;
  if l.status = 'rejected' then raise exception 'lead_rejected' using errcode = '22023', hint = 'This enquiry was rejected. Change its status before creating an order.'; end if;
  if l.quote_amount is null or l.quote_amount <= 0 then raise exception 'quote_required' using errcode = '22023', hint = 'Save a quotation amount first.'; end if;
  v_phone := public._norm_phone(l.phone);
  v_mode := case when l.payload ->> 'mode' = 'delivery' then 'delivery' else 'pickup' end;
  begin
    v_at := ((l.payload ->> 'date') || ' ' || coalesce(nullif(l.payload ->> 'time', ''), '12:00'))::timestamp at time zone 'Asia/Kolkata';
  exception when others then v_at := null; end;

  -- multi-dish lines (V3.6 enquiries); anything unexpected falls back to the single-line format
  if jsonb_typeof(l.payload -> 'items') = 'array' and jsonb_array_length(l.payload -> 'items') between 1 and 30 then
    v_ok := true;
    for x in select value from jsonb_array_elements(l.payload -> 'items') loop
      if jsonb_typeof(x -> 'kg') <> 'number' or jsonb_typeof(x -> 'price_per_kg') <> 'number' or coalesce(x ->> 'name', '') = ''
         or (x ->> 'kg')::numeric not between 1 and 50 or (x ->> 'kg')::numeric <> trunc((x ->> 'kg')::numeric)
         or (x ->> 'price_per_kg')::numeric <= 0 then
        v_ok := false; exit;
      end if;
      v_est := v_est + (x ->> 'kg')::numeric * (x ->> 'price_per_kg')::numeric;
    end loop;
    if v_ok then
      if l.quote_amount < v_est then v_disc := v_est - l.quote_amount; else v_adj := l.quote_amount - v_est; end if;
    end if;
  end if;

  if v_phone is not null then
    insert into public.customers (name, phone) values (coalesce(nullif(btrim(l.name), ''), 'Customer'), v_phone)
    on conflict (phone) do update set name = public.customers.name returning id into v_cust;
  end if;
  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  v_bill := public._next_bill_number(v_today);
  v_event := nullif(btrim(coalesce(l.payload ->> 'event_type', l.payload ->> 'eventType', '')), '');
  insert into public.orders (bill_number, order_date, customer_id, customer_name, customer_phone, mode, delivery_address,
                             scheduled_for, instructions, status, subtotal, discount, total, idempotency_key, access_token_hash,
                             source, lead_id, admin_notes)
  values (v_bill, v_today, v_cust, coalesce(nullif(btrim(l.name), ''), 'Customer'), v_phone, v_mode,
          case when v_mode = 'delivery' then 'To be confirmed with customer' end,
          v_at, left(l.payload ->> 'instructions', 500), 'confirmed',
          case when v_ok then v_est + v_adj else l.quote_amount end,
          case when v_ok then v_disc else 0 end,
          l.quote_amount,
          gen_random_uuid(), sha256(convert_to(v_token, 'UTF8')), 'bulk', l.id,
          case when v_event is not null then 'Bulk enquiry · Event: ' || v_event end)
  returning id into v_id;
  if v_ok then
    for x in select value from jsonb_array_elements(l.payload -> 'items') loop
      v_i := v_i + 1;
      insert into public.order_items (order_id, dish_name, variant_label, unit_price, qty, line_total, sort_order)
      values (v_id, 'Bulk: ' || left(x ->> 'name', 110), 'per kg', (x ->> 'price_per_kg')::numeric, (x ->> 'kg')::int,
              (x ->> 'kg')::numeric * (x ->> 'price_per_kg')::numeric, v_i);
    end loop;
    if v_adj > 0 then
      insert into public.order_items (order_id, dish_name, variant_label, unit_price, qty, line_total, sort_order)
      values (v_id, 'Quotation adjustment', '', v_adj, 1, v_adj, v_i + 1);
    end if;
  else
    insert into public.order_items (order_id, dish_name, variant_label, unit_price, qty, line_total)
    values (v_id, 'Bulk order: ' || coalesce(l.payload ->> 'variety', 'Biryani'),
            coalesce((l.payload ->> 'kg') || ' kg', ''), l.quote_amount, 1, l.quote_amount);
  end if;
  insert into public.receipts (order_id, bill_number, data) values (v_id, v_bill, public._receipt_snapshot());
  update public.leads set converted_order_id = v_id, status = 'confirmed' where id = l.id;
  return jsonb_build_object('order_id', v_id, 'bill_number', v_bill, 'access_token', v_token);
end $$;

-- ───────────── grants ─────────────
revoke all on function public._inr_text(numeric) from public, anon, authenticated;
revoke all on function public.submit_bulk_enquiry(jsonb) from public;
grant execute on function public.submit_bulk_enquiry(jsonb) to anon, authenticated;
revoke all on function public.admin_convert_lead(uuid) from public, anon;
grant execute on function public.admin_convert_lead(uuid) to authenticated;
revoke all on function public.get_storefront() from public;
grant execute on function public.get_storefront() to anon, authenticated;
