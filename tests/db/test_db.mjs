// Database test-suite for the V2 migration. Runs ONLY against a local/staging Postgres
// (never production):   DATABASE_URL=postgres://... node tests/db/test_db.mjs
import pg from 'pg';
import { randomUUID, randomBytes } from 'node:crypto';

const URL = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:54329/dawat';
if (/supabase\.(co|com)/.test(URL)) throw new Error('Refusing to run tests against Supabase production.');

let pass = 0, fail = 0;
const results = [];
const check = (name, cond, detail = '') => {
  results.push([name, !!cond]);
  if (cond) pass++; else fail++;
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
};

const pool = new pg.Pool({ connectionString: URL, max: 30 });
const ADMIN = randomUUID();
const USER = randomUUID();

/** Run SQL as a Supabase role (anon / authenticated with a user id). */
async function as(role, sub, sql, params = []) {
  const c = await pool.connect();
  try {
    await c.query('begin');
    await c.query(`set local role ${role}`);
    await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(sub ? { sub, role } : { role })]);
    const r = await c.query(sql, params);
    await c.query('commit');
    return { rows: r.rows, rowCount: r.rowCount };
  } catch (e) {
    await c.query('rollback').catch(() => {});
    return { error: e };
  } finally { c.release(); }
}
const anon = (sql, p) => as('anon', null, sql, p);
const admin = (sql, p) => as('authenticated', ADMIN, sql, p);
const user = (sql, p) => as('authenticated', USER, sql, p);
const su = (sql, p) => pool.query(sql, p);

const token = () => randomBytes(24).toString('base64url');
let phoneSeq = 7000000000;
const nextPhone = () => String(++phoneSeq);

async function variants() {
  const r = await anon('select public.get_storefront() as s');
  const dishes = r.rows[0].s.dishes;
  const byDish = Object.fromEntries(dishes.map((d) => [d.id, d]));
  return { dishes, byDish };
}
function orderPayload(lines, extra = {}) {
  return {
    idempotency_key: randomUUID(), access_token: token(), name: 'Test Customer', phone: nextPhone(),
    mode: 'pickup', confirm: true, items: lines, ...extra,
  };
}
const place = (p, who = anon) => who('select public.place_order($1::jsonb) as o', [JSON.stringify(p)]);
const errInfo = (r) => (r.error ? `${r.error.message} ${r.error.detail ?? ''}`.trim() : 'no error');

// ───────────────────────── setup ─────────────────────────
await su(`insert into auth.users (id, email) values ($1,'admin@test.local'), ($2,'user@test.local')`, [ADMIN, USER]);
await su(`insert into public.admins (user_id) values ($1)`, [ADMIN]);
await su(`update public.restaurant_settings set opens_at='00:00', closes_at='23:59:59', min_lead_minutes=0, open_days='{0,1,2,3,4,5,6}', closed_dates='{}', delivery_enabled=false, pickup_enabled=true, online_ordering_enabled=true, min_order_value=0`);

const { dishes, byDish } = await variants();
check('Storefront returns all 12 visible dishes with stable variant ids', dishes.length === 12 && dishes.every((d) => d.variants.every((v) => /^[0-9a-f-]{36}$/.test(v.id))));
const CDB = byDish['chicken-dum-biryani'];
const MUT = byDish['mutton-biryani'];
const VEG = byDish['vegetable-paneer-biryani'];
const ENQ = byDish['veg-dum-biryani'];
const regular = CDB.variants[0], large = CDB.variants[1];

// ───────────────────────── anon security ─────────────────────────
for (const t of ['orders', 'order_items', 'customers', 'receipts', 'notifications', 'audit_logs', 'bill_counters', 'offer_redemptions', 'admins', 'leads']) {
  const r = await anon(`select count(*)::int n from public.${t}`);
  check(`Visitor cannot read ${t}`, !!r.error || r.rows[0].n === 0, r.error ? 'denied' : `${r.rows?.[0]?.n} rows`);
}
check('Visitor cannot insert an order directly', !!(await anon(`insert into public.orders (bill_number, order_date, customer_name, mode, subtotal, total, idempotency_key, access_token_hash) values ('X', current_date, 'x', 'pickup', 1, 1, gen_random_uuid(), '\\x00')`)).error);
check('Visitor cannot change a price', !!(await anon(`update public.dish_variants set price = 1`)).error || (await su('select count(*)::int n from public.dish_variants where price = 1')).rows[0].n === 0);
check('Visitor cannot change settings', !!(await anon(`update public.restaurant_settings set delivery_charge = 0`)).error);
check('Visitor cannot create offers', !!(await anon(`insert into public.offers (title, discount_type, discount_value, is_active) values ('Free', 'percent', 100, true)`)).error);
for (const fn of ['admin_stats(current_date, current_date)', 'admin_customers()', `admin_remove_customer('${randomUUID()}')`, 'admin_mark_all_read()', `_next_bill_number(current_date)`, `_compute_quote('{}')`]) {
  check(`Visitor cannot run ${fn.split('(')[0]}`, !!(await anon(`select public.${fn}`)).error);
}
check('Visitor cannot make themselves admin', !!(await anon(`insert into public.admins (user_id) values (gen_random_uuid())`)).error);
check('Visitor can read restaurant settings', !(await anon('select name from public.restaurant_settings')).error);

// ───────────────────────── ordering ─────────────────────────
const p1 = orderPayload([{ variant_id: regular.id, qty: 2, expected_price: 110 }, { variant_id: MUT.variants[0].id, qty: 1, expected_price: 220, note: 'Less spicy' }], { total: 1, subtotal: 1 });
const r1 = await place(p1);
const o1 = r1.rows?.[0]?.o;
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date()).replaceAll('-', '');
check('Order placed with server-calculated total (client total ignored)', o1 && Number(o1.total) === 440 && Number(o1.subtotal) === 440, errInfo(r1));
check('Bill number format DBH-YYYYMMDD-0001 (Asia/Kolkata date)', o1?.bill_number === `DBH-${today}-0001`, o1?.bill_number);
check('Order starts as pending + unpaid', o1?.status === 'pending' && o1?.payment_status === 'unpaid');
check('Receipt snapshot stored with restaurant details', o1?.receipt?.restaurant === 'Dawat Biryani House' && o1?.receipt?.title === 'Order Receipt');
check('Order items stored with price snapshot', o1?.items?.length === 2 && o1.items[1].note === 'Less spicy');

const r1b = await place(p1);
check('Same request again returns the SAME order (idempotent)', r1b.rows?.[0]?.o?.id === o1?.id && r1b.rows[0].o.replayed === true);
const r1c = await place({ ...p1, access_token: token() });
check('Same key with a different token is rejected', !!r1c.error && /idempotency_conflict/.test(r1c.error.message));

// concurrent duplicates with one key
const dup = orderPayload([{ variant_id: regular.id, qty: 1 }]);
const dupRes = await Promise.all(Array.from({ length: 8 }, () => place(dup)));
const dupIds = new Set(dupRes.map((r) => r.rows?.[0]?.o?.id).filter(Boolean));
const dupCount = (await su('select count(*)::int n from public.orders where idempotency_key = $1', [dup.idempotency_key])).rows[0].n;
check('8 parallel taps with one key create exactly 1 order', dupIds.size === 1 && dupCount === 1, `${dupIds.size} ids, ${dupCount} rows, errors: ${dupRes.filter((r) => r.error).map(errInfo).join('|')}`);

// concurrent distinct orders → unique, gap-free bill numbers
const many = await Promise.all(Array.from({ length: 25 }, () => place(orderPayload([{ variant_id: large.id, qty: 1 }]))));
const bills = many.map((r) => r.rows?.[0]?.o?.bill_number).filter(Boolean);
const nums = bills.map((b) => Number(b.split('-')[2])).sort((a, b) => a - b);
check('25 simultaneous orders get 25 unique bill numbers', new Set(bills).size === 25, `${bills.length} ok, errors: ${many.filter((r) => r.error).map(errInfo).slice(0, 2).join('|')}`);
check('Bill numbers are consecutive (no gaps, no duplicates)', nums.every((n, i) => i === 0 || n === nums[i - 1] + 1), `${nums[0]}..${nums.at(-1)}`);

// tampering & validation
const bad = async (name, payload, code) => {
  const r = await place(payload);
  const txt = errInfo(r);
  check(name, !!r.error && txt.includes(code), txt.slice(0, 140));
};
await bad('Changed price is detected (expected_price mismatch)', orderPayload([{ variant_id: regular.id, qty: 1, expected_price: 10 }]), 'price_changed');
await bad('Invalid phone rejected', { ...orderPayload([{ variant_id: regular.id, qty: 1 }]), phone: '12345' }, 'phone_invalid');
await bad('Missing name rejected', { ...orderPayload([{ variant_id: regular.id, qty: 1 }]), name: ' ' }, 'name_invalid');
await bad('Unconfirmed order rejected', { ...orderPayload([{ variant_id: regular.id, qty: 1 }]), confirm: false }, 'confirm_required');
await bad('Empty cart rejected', orderPayload([]), 'empty_cart');
await bad('Quantity 0 rejected', orderPayload([{ variant_id: regular.id, qty: 0 }]), 'qty_invalid');
await bad('Quantity 51 rejected', orderPayload([{ variant_id: regular.id, qty: 51 }]), 'qty_invalid');
await bad('Unknown item rejected', orderPayload([{ variant_id: randomUUID(), qty: 1 }]), 'item_unavailable');
await bad('Delivery rejected while delivery is off', orderPayload([{ variant_id: regular.id, qty: 1 }], { mode: 'delivery', address: 'Flat 1, Some Road, Bhiwandi' }), 'delivery_unavailable');
await su(`update public.restaurant_settings set delivery_enabled = true, delivery_charge = 30, free_delivery_above = 500`);
await bad('Delivery without address rejected', orderPayload([{ variant_id: regular.id, qty: 1 }], { mode: 'delivery' }), 'address_invalid');
const rd = await place(orderPayload([{ variant_id: regular.id, qty: 1 }], { mode: 'delivery', address: 'Flat 1, Some Road, Bhiwandi' }));
check('Delivery charge added below free-delivery threshold', Number(rd.rows?.[0]?.o?.delivery_charge) === 30 && Number(rd.rows[0].o.total) === 140, errInfo(rd));
const rd2 = await place(orderPayload([{ variant_id: MUT.variants[0].id, qty: 3 }], { mode: 'delivery', address: 'Flat 1, Some Road, Bhiwandi' }));
check('Free delivery above threshold', Number(rd2.rows?.[0]?.o?.delivery_charge) === 0 && Number(rd2.rows[0].o.total) === 660, errInfo(rd2));

await su(`update public.dishes set is_sold_out = true where id = 'mutton-biryani'`);
await bad('Sold-out dish rejected', orderPayload([{ variant_id: MUT.variants[0].id, qty: 1 }]), 'sold out');
await su(`update public.dishes set is_sold_out = false where id = 'mutton-biryani'`);
await su(`insert into public.dish_variants (dish_id, label, price) values ('veg-dum-biryani', 'Standard', 100)`);
const enqVar = (await su(`select id from public.dish_variants where dish_id = 'veg-dum-biryani'`)).rows[0].id;
await bad('"Price on enquiry" dish cannot be ordered online', orderPayload([{ variant_id: enqVar, qty: 1 }]), 'item_unavailable');
await su(`update public.dishes set is_visible = false where id = 'prawns-biryani'`);
await bad('Hidden dish rejected', orderPayload([{ variant_id: byDish['prawns-biryani'].variants[0].id, qty: 1 }]), 'item_unavailable');
await su(`update public.dishes set is_visible = true where id = 'prawns-biryani'`);
await su(`update public.restaurant_settings set min_order_value = 200`);
await bad('Minimum order value enforced', orderPayload([{ variant_id: regular.id, qty: 1 }]), 'min_order');
await su(`update public.restaurant_settings set min_order_value = 0`);

// opening hours
const istNow = new Date(Date.now() + 5.5 * 3600e3);
const h = istNow.getUTCHours();
const winStart = `${String((h + 2) % 24).padStart(2, '0')}:00`, winEnd = `${String((h + 2) % 24).padStart(2, '0')}:59`;
await su(`update public.restaurant_settings set opens_at = $1, closes_at = $2`, [winStart, winEnd]);
await bad('ASAP order outside opening hours rejected', orderPayload([{ variant_id: regular.id, qty: 1 }]), 'outside_hours');
await su(`update public.restaurant_settings set opens_at='00:00', closes_at='23:59:59', closed_dates = array[(now() at time zone 'Asia/Kolkata')::date]`);
await bad('Order on a closed date rejected', orderPayload([{ variant_id: regular.id, qty: 1 }]), 'closed_day');
await su(`update public.restaurant_settings set closed_dates = '{}', min_lead_minutes = 30`);
await bad('Scheduled time sooner than lead time rejected', orderPayload([{ variant_id: regular.id, qty: 1 }], { scheduled_for: new Date(Date.now() + 5 * 60e3).toISOString() }), 'time_too_soon');
await bad('Scheduled time too far ahead rejected', orderPayload([{ variant_id: regular.id, qty: 1 }], { scheduled_for: new Date(Date.now() + 30 * 86400e3).toISOString() }), 'time_too_far');
const rs = await place(orderPayload([{ variant_id: regular.id, qty: 1 }], { scheduled_for: new Date(Date.now() + 2 * 3600e3).toISOString() }));
check('Valid scheduled order accepted', !rs.error, errInfo(rs));
await su(`update public.restaurant_settings set min_lead_minutes = 0, online_ordering_enabled = false`);
await bad('Ordering paused switch respected', orderPayload([{ variant_id: regular.id, qty: 1 }]), 'ordering_paused');
await su(`update public.restaurant_settings set online_ordering_enabled = true`);

// rate limit
const rlPhone = nextPhone();
const rl = [];
for (let i = 0; i < 6; i++) rl.push(await place({ ...orderPayload([{ variant_id: regular.id, qty: 1 }]), phone: rlPhone }));
check('6th order from one number within 10 min is rate-limited', rl.slice(0, 5).every((r) => !r.error) && /rate_limited/.test(errInfo(rl[5])));

// receipts / tracking
const g1 = await anon('select public.get_order($1, $2) as o', [o1.id, p1.access_token]);
check('Receipt opens with the secret order link', g1.rows?.[0]?.o?.bill_number === o1.bill_number);
const g2 = await anon('select public.get_order($1, $2) as o', [o1.id, token()]);
check('Receipt refused with a wrong token', !!g2.error && /not_found/.test(g2.error.message));
const g3 = await anon('select public.get_order($1, $2) as o', [o1.id, null]);
check('Receipt refused with no token', !!g3.error);
const mo = await anon('select public.get_my_orders($1::jsonb) as o', [JSON.stringify([{ id: o1.id, token: p1.access_token }, { id: o1.id, token: 'guess' }])]);
check('"My orders" returns only orders with a valid token', mo.rows?.[0]?.o?.length === 1);

// ───────────────────────── offers ─────────────────────────
const offIns = await admin(`insert into public.offers (title, discount_type, discount_value, code, is_active, min_order, max_discount, usage_limit, per_phone_limit)
  values ('Ten off', 'percent', 10, 'DAWAT10', true, 200, 30, 3, 1) returning id`);
check('Admin can create an offer', !offIns.error, errInfo(offIns));
const offerId = offIns.rows?.[0]?.id;
const q1 = await anon('select public.quote_order($1::jsonb) as q', [JSON.stringify({ mode: 'pickup', coupon: 'dawat10', items: [{ variant_id: large.id, qty: 2 }] })]);
check('Coupon applies 10% (capped at Rs 30) in the quote', Number(q1.rows?.[0]?.q?.discount) === 30 && Number(q1.rows[0].q.total) === 270, JSON.stringify(q1.rows?.[0]?.q?.issues ?? errInfo(q1)));
const q2 = await anon('select public.quote_order($1::jsonb) as q', [JSON.stringify({ mode: 'pickup', coupon: 'DAWAT10', items: [{ variant_id: regular.id, qty: 1 }] })]);
check('Coupon below minimum order explains why', q2.rows?.[0]?.q?.issues?.some((i) => i.code === 'coupon_invalid' && /Rs\. 200/.test(i.message)));
const q3 = await anon('select public.quote_order($1::jsonb) as q', [JSON.stringify({ mode: 'pickup', coupon: 'NOPE', items: [{ variant_id: regular.id, qty: 3 }] })]);
check('Unknown coupon explained', q3.rows?.[0]?.q?.issues?.some((i) => i.code === 'coupon_invalid'));
const cPhone = nextPhone();
const oc = await place({ ...orderPayload([{ variant_id: large.id, qty: 2 }], { coupon: 'DAWAT10' }), phone: cPhone });
check('Order with coupon stores discount + redemption', Number(oc.rows?.[0]?.o?.discount) === 30 && oc.rows[0].o.coupon_code === 'DAWAT10', errInfo(oc));
const oc2 = await place({ ...orderPayload([{ variant_id: large.id, qty: 2 }], { coupon: 'DAWAT10' }), phone: cPhone });
check('Per-customer coupon limit enforced', /coupon_invalid/.test(errInfo(oc2)));
await place(orderPayload([{ variant_id: large.id, qty: 2 }], { coupon: 'DAWAT10' }));
await place(orderPayload([{ variant_id: large.id, qty: 2 }], { coupon: 'DAWAT10' }));
const oc4 = await place(orderPayload([{ variant_id: large.id, qty: 2 }], { coupon: 'DAWAT10' }));
check('Coupon usage limit (3) enforced', /coupon_invalid/.test(errInfo(oc4)) && (await su('select used_count from public.offers where id=$1', [offerId])).rows[0].used_count === 3);
await admin(`update public.offers set ends_at = now() - interval '1 minute', starts_at = now() - interval '1 day', usage_limit = null where id = $1`, [offerId]);
const q4 = await anon('select public.quote_order($1::jsonb) as q', [JSON.stringify({ mode: 'pickup', coupon: 'DAWAT10', phone: nextPhone(), items: [{ variant_id: large.id, qty: 2 }] })]);
check('Expired coupon rejected with reason', q4.rows?.[0]?.q?.issues?.some((i) => /expired/.test(i.message)));
await admin(`insert into public.offers (title, discount_type, discount_value, is_active, applies_to, category_ids) values ('Mutton day', 'fixed', 500, true, 'categories', '{mutton}')`);
const q5 = await anon('select public.quote_order($1::jsonb) as q', [JSON.stringify({ mode: 'pickup', items: [{ variant_id: MUT.variants[0].id, qty: 1 }, { variant_id: regular.id, qty: 1 }] })]);
check('Automatic category offer applies only to its category, never below zero', Number(q5.rows?.[0]?.q?.discount) === 220 && Number(q5.rows[0].q.total) === 110, JSON.stringify(q5.rows?.[0]?.q));
const sf = await anon('select public.get_storefront() as s');
check('Public storefront lists only active public offers', sf.rows[0].s.offers.length === 1 && sf.rows[0].s.offers[0].title === 'Mutton day');
await admin(`update public.offers set is_active = false where title = 'Mutton day'`);

// ───────────────────────── admin workflow ─────────────────────────
const ao = await admin('select count(*)::int n from public.orders');
check('Admin can read orders', ao.rows?.[0]?.n > 30, String(ao.rows?.[0]?.n));
const uo = await user('select count(*)::int n from public.orders');
check('Logged-in non-admin sees no orders', uo.rows?.[0]?.n === 0);
const uu = await user(`update public.orders set status = 'confirmed'`);
check('Logged-in non-admin cannot update orders', !!uu.error || uu.rowCount === 0);
const ux = await user(`select public.admin_stats(current_date, current_date)`);
check('Logged-in non-admin cannot read stats', !!ux.error);

const upd = (sql, p) => admin(sql, p);
check('Admin: pending → confirmed allowed', !(await upd(`update public.orders set status='confirmed', prep_minutes=25 where id=$1`, [o1.id])).error);
check('Admin: confirmed → completed (skipping steps) blocked', /invalid_status_transition/.test(errInfo(await upd(`update public.orders set status='completed' where id=$1`, [o1.id]))));
check('Admin: pickup order cannot go out for delivery', /invalid_status_transition/.test(errInfo(await upd(`update public.orders set status='out_for_delivery' where id=$1`, [o1.id]))));
check('Admin: confirmed → preparing → ready → completed', !(await upd(`update public.orders set status='preparing' where id=$1`, [o1.id])).error && !(await upd(`update public.orders set status='ready' where id=$1`, [o1.id])).error && !(await upd(`update public.orders set status='completed' where id=$1`, [o1.id])).error);
check('Admin: completed order cannot be reopened', /invalid_status_transition/.test(errInfo(await upd(`update public.orders set status='pending' where id=$1`, [o1.id]))));
check('Admin: cannot change bill number or total', /order_locked_fields/.test(errInfo(await upd(`update public.orders set total = 1 where id=$1`, [o1.id]))));
check('Admin: payment unpaid → paid', !(await upd(`update public.orders set payment_status='paid', payment_method='upi' where id=$1`, [o1.id])).error);
check('Admin: payment paid → refunded', !(await upd(`update public.orders set payment_status='refunded' where id=$1`, [o1.id])).error);
check('Admin: refunded → paid blocked', /invalid_payment_transition/.test(errInfo(await upd(`update public.orders set payment_status='paid' where id=$1`, [o1.id]))));
const rej = many[0].rows[0].o.id;
check('Admin: rejecting needs a reason', /reason_required/.test(errInfo(await upd(`update public.orders set status='rejected' where id=$1`, [rej]))));
check('Admin: rejecting with reason works', !(await upd(`update public.orders set status='rejected', status_reason='Out of stock' where id=$1`, [rej])).error);
const hist = await admin(`select to_status from public.order_status_history where order_id=$1 order by id`, [o1.id]);
check('Status history recorded for every change', hist.rows?.map((r) => r.to_status).join(',') === 'pending,confirmed,preparing,ready,completed');
const audit = await admin(`select count(*)::int n from public.audit_logs where entity='orders' and entity_id=$1`, [o1.id]);
check('Audit log records admin order changes', audit.rows?.[0]?.n >= 5, String(audit.rows?.[0]?.n));
const auditPii = await admin(`select count(*)::int n from public.audit_logs where entity='orders' and details::text like '%customer_phone%'`);
check('Audit log does not copy customer phone numbers', auditPii.rows?.[0]?.n === 0);

// bill numbers never reused after cancellation
const before = (await su(`select last_value from public.bill_counters order by bill_date desc limit 1`)).rows[0].last_value;
const nb = await place(orderPayload([{ variant_id: regular.id, qty: 1 }]));
check('New order after cancellations gets the next bill number', Number(nb.rows?.[0]?.o?.bill_number.split('-')[2]) === before + 1);

// notifications
const nn = await admin(`select count(*)::int n from public.notifications where kind='new_order'`);
const on = await su(`select count(*)::int n from public.orders`);
check('Exactly one notification per order (no duplicates)', nn.rows?.[0]?.n === on.rows[0].n, `${nn.rows?.[0]?.n} vs ${on.rows[0].n}`);
const mr = await admin('select public.admin_mark_all_read() as n');
const mr2 = await admin('select public.admin_mark_all_read() as n');
check('Mark all read works and is repeat-safe', mr.rows?.[0]?.n > 0 && mr2.rows?.[0]?.n === 0);

// stats
const st = await admin(`select public.admin_stats(current_date - 6, current_date) as s`);
const s = st.rows?.[0]?.s;
check('Stats: real counts, completed vs paid kept separate', s && s.orders === on.rows[0].n && Number(s.completed_value) === 440 && Number(s.paid_value) === 0 && s.daily.length === 7, JSON.stringify({ o: s?.orders, cv: s?.completed_value, pv: s?.paid_value }));

// customers
const lone = await admin(`insert into public.customers (name, phone) values ('No Orders', $1) returning id`, [nextPhone()]);
check('Customer without orders is deleted', (await admin(`select public.admin_remove_customer($1) as r`, [lone.rows[0].id])).rows?.[0]?.r === 'deleted');
const cid = (await su(`select customer_id from public.orders where id=$1`, [o1.id])).rows[0].customer_id;
const an = await admin(`select public.admin_remove_customer($1) as r`, [cid]);
const after = (await su(`select customer_name, customer_phone, total, bill_number from public.orders where id=$1`, [o1.id])).rows[0];
check('Customer with orders is anonymised, bill + total kept', an.rows?.[0]?.r === 'anonymised' && after.customer_phone === null && after.bill_number === o1.bill_number && Number(after.total) === 440);
const cl = await admin(`select public.admin_customers() as c`);
check('Customer list aggregates order counts', Array.isArray(cl.rows?.[0]?.c) && cl.rows[0].c.some((c) => c.orders > 0));

// enquiries / bulk
const e1 = await anon(`select public.submit_enquiry($1::jsonb) as e`, [JSON.stringify({ kind: 'bulk', name: 'Ravi', phone: '98200 00001', message: 'Need 10 kg', payload: { kg: 10, variety: 'Paneer Biryani', mode: 'pickup', date: '2026-12-01', time: '13:00' } })]);
check('Bulk enquiry saved with confirmation id', !!e1.rows?.[0]?.e?.id, errInfo(e1));
check('Bulk enquiry with bad phone rejected', /phone_invalid/.test(errInfo(await anon(`select public.submit_enquiry($1::jsonb)`, [JSON.stringify({ kind: 'bulk', name: 'Ravi', phone: '12' })]))));
const leadId = e1.rows[0].e.id;
check('Bulk enquiry created an admin notification', (await admin(`select count(*)::int n from public.notifications where lead_id=$1`, [leadId])).rows?.[0]?.n === 1);
check('Converting without a quotation is refused', /quote_required/.test(errInfo(await admin(`select public.admin_convert_lead($1)`, [leadId]))));
await admin(`update public.leads set quote_amount = 3500 where id=$1`, [leadId]);
const cv = await admin(`select public.admin_convert_lead($1) as r`, [leadId]);
check('Quoted bulk enquiry converts into a real order with a bill number', /^DBH-/.test(cv.rows?.[0]?.r?.bill_number ?? ''), errInfo(cv));
check('A bulk enquiry cannot be converted twice', /already_converted/.test(errInfo(await admin(`select public.admin_convert_lead($1)`, [leadId]))));
check('Old website direct lead insert still works', !(await anon(`insert into public.leads (kind, name, phone) values ('cart','Old site','9876543210')`)).error);
check('Visitor cannot insert a lead with a quote amount', !!(await anon(`insert into public.leads (kind, name, quote_amount) values ('bulk','x', 1)`)).error);

console.log(`\n${pass}/${pass + fail} database checks passed`);
await pool.end();
process.exit(fail ? 1 : 0);
