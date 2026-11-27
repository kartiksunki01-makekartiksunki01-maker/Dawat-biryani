-- V3.7 — Admin delete / bulk delete, data cleanup, media library, indexes.
-- Owner decisions (27 Nov 2026):
--   * Permanently deleting a finished order removes its items, customer details and history for good, but keeps a
--     small bill-register row (bill number, date, amounts, status) for accounts. Bill numbers are never reused.
--   * Deleting a customer keeps their orders (name/phone removed from them) — bills stay correct.
--   * Active orders can never be deleted. Automatic cleanup exists but is OFF until the owner switches it on.
-- Additive: new tables/functions/policies/indexes; two existing functions are replaced with relaxed-but-safe rules.

-- ───────────── orders: allow the database to clear lead_id / offer_id when that enquiry/coupon is deleted ─────────────
-- (previously deleting a converted enquiry or a used coupon failed with order_locked_fields)
create or replace function public._order_before_update() returns trigger
language plpgsql set search_path = '' as $$
declare ok boolean;
begin
  if new.bill_number is distinct from old.bill_number or new.order_date is distinct from old.order_date
     or new.idempotency_key is distinct from old.idempotency_key or new.access_token_hash is distinct from old.access_token_hash
     or new.subtotal is distinct from old.subtotal or new.discount is distinct from old.discount
     or new.delivery_charge is distinct from old.delivery_charge or new.tax is distinct from old.tax
     or new.total is distinct from old.total or new.created_at is distinct from old.created_at
     or (new.lead_id is distinct from old.lead_id and new.lead_id is not null)
     or (new.offer_id is distinct from old.offer_id and new.offer_id is not null) then
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

-- ───────────── bill register (what remains of a permanently deleted order) ─────────────
create table if not exists public.bill_register (
  bill_number text primary key,
  order_date date not null,
  order_created_at timestamptz not null,
  status text not null,
  source text not null,
  mode text,
  subtotal numeric(10,2) not null,
  discount numeric(10,2) not null default 0,
  delivery_charge numeric(10,2) not null default 0,
  tax numeric(10,2) not null default 0,
  total numeric(10,2) not null,
  payment_status text not null,
  payment_method text,
  coupon_code text,
  items_count int not null default 0,
  deleted_at timestamptz not null default now(),
  deleted_by uuid,
  delete_reason text not null default 'manual' check (delete_reason in ('manual','auto-cleanup'))
);
create index if not exists bill_register_date_idx on public.bill_register (order_date desc);
alter table public.bill_register enable row level security;
drop policy if exists "admin reads bill register" on public.bill_register;
create policy "admin reads bill register" on public.bill_register for select to authenticated using (public.is_admin());
revoke all on public.bill_register from anon, authenticated;
grant select on public.bill_register to authenticated;

-- internal: delete finished orders, keeping a register row each. Active orders are never touched.
create or replace function public._delete_finished_orders(p_ids uuid[], p_reason text) returns int
language plpgsql volatile security definer set search_path = '' as $$
declare n int;
begin
  insert into public.bill_register (bill_number, order_date, order_created_at, status, source, mode, subtotal, discount,
                                    delivery_charge, tax, total, payment_status, payment_method, coupon_code, items_count,
                                    deleted_by, delete_reason)
  select o.bill_number, o.order_date, o.created_at, o.status, o.source, o.mode, o.subtotal, o.discount, o.delivery_charge,
         o.tax, o.total, o.payment_status, o.payment_method, o.coupon_code,
         (select coalesce(sum(i.qty), 0) from public.order_items i where i.order_id = o.id), auth.uid(), p_reason
    from public.orders o
   where o.id = any (p_ids) and o.status in ('completed','cancelled','rejected')
  on conflict (bill_number) do nothing;
  delete from public.orders o where o.id = any (p_ids) and o.status in ('completed','cancelled','rejected');
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.admin_delete_orders(p_ids uuid[]) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare v_skipped jsonb; n int;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_ids is null or cardinality(p_ids) = 0 or cardinality(p_ids) > 500 then raise exception 'invalid_request' using errcode = '22023'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'bill_number', o.bill_number,
           'reason', 'Still active (' || o.status || ') — finish or cancel it first.')), '[]'::jsonb)
    into v_skipped from public.orders o where o.id = any (p_ids) and o.status not in ('completed','cancelled','rejected');
  perform 1 from public.orders where id = any (p_ids) for update;
  n := public._delete_finished_orders(p_ids, 'manual');
  return jsonb_build_object('deleted', n, 'skipped', v_skipped);
end $$;

-- ───────────── customers: delete the person, keep their (anonymised) orders ─────────────
create or replace function public.admin_delete_customers(p_ids uuid[]) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare v_skipped jsonb; v_ok uuid[]; n int; m int;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_ids is null or cardinality(p_ids) = 0 or cardinality(p_ids) > 500 then raise exception 'invalid_request' using errcode = '22023'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'reason', 'Has an active order — finish it first.')), '[]'::jsonb)
    into v_skipped from public.customers c
   where c.id = any (p_ids) and exists (select 1 from public.orders o where o.customer_id = c.id and o.status not in ('completed','cancelled','rejected'));
  select coalesce(array_agg(c.id), '{}') into v_ok from public.customers c
   where c.id = any (p_ids) and not exists (select 1 from public.orders o where o.customer_id = c.id and o.status not in ('completed','cancelled','rejected'));
  update public.orders set customer_name = 'Deleted customer', customer_phone = null,
         delivery_address = case when mode = 'delivery' then '[removed]' end, instructions = null, customer_id = null
   where customer_id = any (v_ok);
  get diagnostics m = row_count;
  delete from public.customers where id = any (v_ok);
  get diagnostics n = row_count;
  return jsonb_build_object('deleted', n, 'orders_kept', m, 'skipped', v_skipped);
end $$;

-- ───────────── coupons: a used coupon may be deleted once it is no longer live ─────────────
-- (orders keep the coupon code and the discount amount; only live, used coupons are protected)
create or replace function public._offer_before_delete() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (old.used_count > 0 or exists (select 1 from public.offer_redemptions r where r.offer_id = old.id))
     and old.is_active and old.archived_at is null and (old.ends_at is null or old.ends_at > now()) then
    raise exception 'offer_used' using errcode = 'P0001',
      hint = 'This coupon is live and has been used. Switch it off (or let it expire) first — old bills keep their coupon code and discount.';
  end if;
  return old;
end $$;

-- ───────────── notifications: admins may delete ─────────────
drop policy if exists "admin deletes notifications" on public.notifications;
create policy "admin deletes notifications" on public.notifications for delete to authenticated using (public.is_admin());
grant delete on public.notifications to authenticated;

-- ───────────── chats: bulk delete ─────────────
create or replace function public.admin_delete_conversations(p_ids uuid[]) returns int
language plpgsql volatile security definer set search_path = '' as $$
declare n int;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_ids is null or cardinality(p_ids) > 500 then raise exception 'invalid_request' using errcode = '22023'; end if;
  delete from public.chat_conversations where id = any (p_ids);
  get diagnostics n = row_count;
  return n;
end $$;

-- ───────────── data cleanup (manual, or automatic once the owner switches it on) ─────────────
create table if not exists public.cleanup_settings (
  id smallint primary key default 1 check (id = 1),
  auto_enabled boolean not null default false,
  orders_days smallint not null default 90 check (orders_days = 0 or orders_days between 7 and 3650),
  leads_days smallint not null default 90 check (leads_days = 0 or leads_days between 7 and 3650),
  notifications_days smallint not null default 30 check (notifications_days = 0 or notifications_days between 7 and 3650),
  chats_days smallint not null default 90 check (chats_days = 0 or chats_days between 7 and 3650),
  coupons_days smallint not null default 30 check (coupons_days = 0 or coupons_days between 7 and 3650),
  last_run_at timestamptz,
  last_result jsonb,
  updated_at timestamptz not null default now()
);
insert into public.cleanup_settings (id) values (1) on conflict (id) do nothing;
alter table public.cleanup_settings enable row level security;
drop policy if exists "admin manages cleanup settings" on public.cleanup_settings;
create policy "admin manages cleanup settings" on public.cleanup_settings for all to authenticated using (public.is_admin()) with check (public.is_admin());
revoke all on public.cleanup_settings from anon, authenticated;
grant select, update on public.cleanup_settings to authenticated;
create or replace trigger cleanup_settings_touch before update on public.cleanup_settings for each row execute function public.touch_updated_at();
create or replace trigger cleanup_settings_audit after update on public.cleanup_settings for each row execute function public._audit();

-- what each rule would delete (ids, so the admin panel can export them before deleting)
create or replace function public._cleanup_targets(s public.cleanup_settings) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'orders', case when s.orders_days = 0 then '[]'::jsonb else coalesce((select jsonb_agg(o.id) from public.orders o
        where o.status in ('completed','cancelled','rejected') and o.created_at < now() - make_interval(days => s.orders_days)), '[]'::jsonb) end,
    'leads', case when s.leads_days = 0 then '[]'::jsonb else coalesce((select jsonb_agg(l.id) from public.leads l
        where (l.status in ('rejected','closed') or l.converted_order_id is not null or l.archived_at is not null)
          and l.created_at < now() - make_interval(days => s.leads_days)), '[]'::jsonb) end,
    'notifications', case when s.notifications_days = 0 then '[]'::jsonb else coalesce((select jsonb_agg(n.id) from public.notifications n
        where n.created_at < now() - make_interval(days => s.notifications_days)), '[]'::jsonb) end,
    'chats', case when s.chats_days = 0 then '[]'::jsonb else coalesce((select jsonb_agg(c.id) from public.chat_conversations c
        where c.status in ('resolved','archived') and c.last_message_at < now() - make_interval(days => s.chats_days)), '[]'::jsonb) end,
    'coupons', case when s.coupons_days = 0 then '[]'::jsonb else coalesce((select jsonb_agg(f.id) from public.offers f
        where (f.ends_at is not null and f.ends_at < now() - make_interval(days => s.coupons_days))
           or (f.archived_at is not null and f.archived_at < now() - make_interval(days => s.coupons_days))), '[]'::jsonb) end)
$$;

create or replace function public.admin_cleanup_preview() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare s public.cleanup_settings;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into s from public.cleanup_settings where id = 1;
  return public._cleanup_targets(s);
end $$;

create or replace function public._cleanup_run(p_reason text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare s public.cleanup_settings; t jsonb; r jsonb; n_o int; n_l int; n_n int; n_c int; n_f int;
begin
  select * into s from public.cleanup_settings where id = 1 for update;
  t := public._cleanup_targets(s);
  n_o := public._delete_finished_orders(array(select jsonb_array_elements_text(t -> 'orders'))::uuid[], p_reason);
  delete from public.leads where id = any (array(select jsonb_array_elements_text(t -> 'leads'))::uuid[]);
  get diagnostics n_l = row_count;
  delete from public.notifications where id = any (array(select jsonb_array_elements_text(t -> 'notifications'))::uuid[]);
  get diagnostics n_n = row_count;
  delete from public.chat_conversations where id = any (array(select jsonb_array_elements_text(t -> 'chats'))::uuid[]);
  get diagnostics n_c = row_count;
  delete from public.offers where id = any (array(select jsonb_array_elements_text(t -> 'coupons'))::uuid[]);
  get diagnostics n_f = row_count;
  r := jsonb_build_object('orders', n_o, 'leads', n_l, 'notifications', n_n, 'chats', n_c, 'coupons', n_f, 'mode', p_reason, 'at', now());
  update public.cleanup_settings set last_run_at = now(), last_result = r where id = 1;
  return r;
end $$;

create or replace function public.admin_cleanup_run() returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return public._cleanup_run('manual');
end $$;

-- called when the admin panel opens: runs at most once a day, and only if the owner switched it on
create or replace function public.admin_cleanup_auto() returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare s public.cleanup_settings;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into s from public.cleanup_settings where id = 1;
  if not s.auto_enabled or (s.last_run_at is not null and s.last_run_at > now() - interval '20 hours') then return null; end if;
  return public._cleanup_run('auto-cleanup');
end $$;

-- ───────────── media library ─────────────
drop policy if exists "admin lists media" on storage.objects;
create policy "admin lists media" on storage.objects for select to authenticated
  using (bucket_id = any (array['images','audio']) and public.is_admin());

create or replace function public.admin_media_list() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v jsonb;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  with refs as (
    select 'Menu: ' || d.name as label, coalesce(d.image_path, '') as txt from public.dishes d
    union all select 'Bulk menu: ' || b.name, coalesce(b.image_path, '') from public.bulk_menu_items b
    union all select 'Coupon: ' || f.title, coalesce(f.banner_url, '') from public.offers f
    union all select 'Website settings', to_jsonb(w)::text from public.website_settings w
    union all select 'Restaurant settings', to_jsonb(r)::text from public.restaurant_settings r
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'bucket', o.bucket_id, 'name', o.name, 'size', coalesce((o.metadata ->> 'size')::bigint, 0),
      'mimetype', o.metadata ->> 'mimetype', 'created_at', o.created_at,
      'used_by', coalesce((select jsonb_agg(distinct r.label) from refs r
                           where position(('/' || o.bucket_id || '/' || o.name) in r.txt) > 0), '[]'::jsonb))
      order by o.created_at desc), '[]'::jsonb)
    into v
    from storage.objects o where o.bucket_id in ('images','audio');
  return v;
end $$;

-- ───────────── indexes (Supabase performance advisor: unindexed foreign keys) ─────────────
create index if not exists dishes_category_idx on public.dishes (category_id);
create index if not exists notifications_conversation_idx on public.notifications (conversation_id);
create index if not exists notifications_lead_idx on public.notifications (lead_id);
create index if not exists notifications_order_idx on public.notifications (order_id);
create index if not exists orders_offer_idx on public.orders (offer_id);
create index if not exists leads_kind_created_idx on public.leads (kind, created_at desc);

-- ───────────── grants ─────────────
revoke all on function public._delete_finished_orders(uuid[], text), public._cleanup_targets(public.cleanup_settings),
  public._cleanup_run(text) from public, anon, authenticated;
revoke all on function public.admin_delete_orders(uuid[]), public.admin_delete_customers(uuid[]), public.admin_delete_conversations(uuid[]),
  public.admin_cleanup_preview(), public.admin_cleanup_run(), public.admin_cleanup_auto(), public.admin_media_list() from public, anon;
grant execute on function public.admin_delete_orders(uuid[]), public.admin_delete_customers(uuid[]), public.admin_delete_conversations(uuid[]),
  public.admin_cleanup_preview(), public.admin_cleanup_run(), public.admin_cleanup_auto(), public.admin_media_list() to authenticated;
