// Database tests for V3.7 delete / bulk delete / cleanup / media. LOCAL Postgres only — never production.
import pg from 'pg';
import { randomUUID, randomBytes } from 'node:crypto';

const DB_URL = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:54329/dawat';
if (/supabase\.(co|com)/.test(DB_URL)) throw new Error('Refusing to run tests against Supabase production.');
let pass = 0, fail = 0;
const check = (name, cond, detail = '') => { if (cond) pass++; else fail++; console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`); };
const pool = new pg.Pool({ connectionString: DB_URL, max: 10 });
const ADMIN = randomUUID(), USER = randomUUID();
async function as(role, sub, sql, params = []) {
  const c = await pool.connect();
  try {
    await c.query('begin');
    await c.query(`set local role ${role}`);
    await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(sub ? { sub, role } : { role })]);
    const r = await c.query(sql, params);
    await c.query('commit');
    return { rows: r.rows, rowCount: r.rowCount };
  } catch (e) { await c.query('rollback').catch(() => {}); return { error: e }; } finally { c.release(); }
}
const anon = (s, p) => as('anon', null, s, p);
const admin = (s, p) => as('authenticated', ADMIN, s, p);
const user = (s, p) => as('authenticated', USER, s, p);
const su = (s, p) => pool.query(s, p);
const one = async (s, p) => (await su(s, p)).rows[0];
const errInfo = (r) => (r.error ? `${r.error.message} ${r.error.hint ?? ''}`.trim() : 'no error');
let ph = 9100000000;

await su(`insert into auth.users (id, email) values ($1,'clean-admin@test.local'), ($2,'clean-user@test.local')`, [ADMIN, USER]);
await su(`insert into public.admins (user_id) values ($1)`, [ADMIN]);
await su(`update public.restaurant_settings set opens_at='00:00', closes_at='23:59:59', min_lead_minutes=0, open_days='{0,1,2,3,4,5,6}', closed_dates='{}', online_ordering_enabled=true, pickup_enabled=true, min_order_value=0`);
const sf = (await anon('select public.get_storefront() s')).rows[0].s;
const vid = sf.dishes.find((d) => d.id === 'chicken-dum-biryani').variants[0].id;
async function order(phone, status = 'pending') {
  const r = await anon(`select public.place_order($1::jsonb) o`, [JSON.stringify({ idempotency_key: randomUUID(), access_token: randomBytes(24).toString('base64url'), name: 'Clean Test', phone, mode: 'pickup', confirm: true, items: [{ variant_id: vid, qty: 2 }] })]);
  const o = r.rows?.[0]?.o;
  if (!o) throw new Error('order failed ' + errInfo(r));
  const path = { completed: ['confirmed', 'preparing', 'ready', 'completed'], cancelled: ['cancelled'], rejected: ['rejected'], confirmed: ['confirmed'] }[status] ?? [];
  for (const s of path) await admin(`update public.orders set status=$2, status_reason=case when $2 in ('cancelled','rejected') then 'test' end where id=$1`, [o.id, s]);
  if (status === 'completed') await admin(`update public.orders set payment_status='paid', payment_method='cash' where id=$1`, [o.id]);
  return o;
}

// ───────── orders ─────────
const pDone = String(++ph), pAct = String(++ph);
const done = await order(pDone, 'completed');
const canc = await order(pDone, 'cancelled');
const act = await order(pAct, 'confirmed');
const pend = await order(pAct);
check('Visitors cannot delete orders', !!(await anon(`select public.admin_delete_orders($1::uuid[])`, [[done.id]])).error);
check('A non-admin cannot delete orders', /forbidden/.test(errInfo(await user(`select public.admin_delete_orders($1::uuid[])`, [[done.id]]))));
const before = await one(`select total, bill_number from public.orders where id=$1`, [done.id]);
const dr = (await admin(`select public.admin_delete_orders($1::uuid[]) r`, [[done.id, canc.id, act.id, pend.id]])).rows?.[0]?.r;
check('Finished orders deleted, active ones skipped with a reason', dr?.deleted === 2 && dr.skipped.length === 2 && dr.skipped.every((s) => /active/.test(s.reason)), JSON.stringify(dr));
check('Deleted orders are really gone from the database', (await one(`select count(*)::int n from public.orders where id = any($1)`, [[done.id, canc.id]])).n === 0);
check('Their items, receipts, history and notifications are gone too', (await one(`select (select count(*) from public.order_items where order_id = any($1)) + (select count(*) from public.receipts where order_id = any($1)) + (select count(*) from public.order_status_history where order_id = any($1)) + (select count(*) from public.notifications where order_id = any($1)) n`, [[done.id, canc.id]])).n == 0);
check('Active orders are untouched', (await one(`select count(*)::int n from public.orders where id = any($1)`, [[act.id, pend.id]])).n === 2);
const reg = await one(`select * from public.bill_register where bill_number=$1`, [before.bill_number]);
check('Bill register keeps bill number, date, total, payment — no name/phone', reg && Number(reg.total) === Number(before.total) && reg.status === 'completed' && reg.payment_status === 'paid' && reg.items_count === 2 && reg.delete_reason === 'manual' && !('customer_name' in reg));
check('Cancelled bill also kept in the register', !!(await one(`select 1 x from public.bill_register where bill_number=$1`, [canc.bill_number])));
check('Visitors and non-admins cannot read the bill register', !!(await anon(`select * from public.bill_register`)).error && ((await user(`select * from public.bill_register`)).rows?.length ?? 0) === 0);
check('Admin can read the bill register', (await admin(`select count(*)::int n from public.bill_register`)).rows?.[0]?.n >= 2);
const nx = await order(String(++ph));
check('Bill numbers are never reused after deletion', nx.bill_number > act.bill_number && nx.bill_number !== before.bill_number && nx.bill_number !== canc.bill_number, `${before.bill_number} ${nx.bill_number}`);

// ───────── enquiries ─────────
const lead = (await anon(`select public.submit_enquiry($1::jsonb) e`, [JSON.stringify({ kind: 'bulk', name: 'Conv', phone: String(++ph), message: 'x', payload: { kg: 3, variety: 'Paneer Biryani', mode: 'pickup' } })])).rows[0].e.id;
await admin(`update public.leads set quote_amount = 2000 where id=$1`, [lead]);
const lo = (await admin(`select public.admin_convert_lead($1) r`, [lead])).rows[0].r;
const dl = await admin(`delete from public.leads where id=$1`, [lead]);
check('A converted enquiry can now be deleted (was blocked before); its order stays with its bill', !dl.error && dl.rowCount === 1 && (await one(`select lead_id, total from public.orders where id=$1`, [lo.order_id])).lead_id === null, errInfo(dl));
check('Changing an order’s enquiry link to another enquiry is still refused', /order_locked_fields/.test(errInfo(await admin(`update public.orders set lead_id = gen_random_uuid() where id=$1`, [lo.order_id]))));
await anon(`select public.submit_enquiry($1::jsonb)`, [JSON.stringify({ kind: 'contact', name: 'Keep me', phone: String(++ph), message: 'x' })]);
const nLeads = (await one(`select count(*)::int n from public.leads`)).n;
await anon(`delete from public.leads`);
const nAfter = (await one(`select count(*)::int n from public.leads`)).n;
check('Visitors cannot delete enquiries', nLeads > 0 && nAfter === nLeads, `${nLeads} -> ${nAfter}`);

// ───────── customers ─────────
const cDone = (await one(`select id from public.customers where phone=$1`, [pDone])).id;
const cAct = (await one(`select id from public.customers where phone=$1`, [pAct])).id;
await order(pDone, 'completed');
const cr = (await admin(`select public.admin_delete_customers($1::uuid[]) r`, [[cDone, cAct]])).rows?.[0]?.r;
check('Customer with an active order is protected; the other is deleted', cr?.deleted === 1 && cr.skipped.length === 1 && cr.skipped[0].id === cAct, JSON.stringify(cr));
const kept = (await su(`select customer_name, customer_phone, customer_id, total from public.orders where customer_name='Deleted customer'`)).rows;
check('Deleted customer’s orders are kept, without name or phone', kept.length >= 1 && kept.every((o) => o.customer_phone === null && o.customer_id === null && Number(o.total) > 0));
check('Customer row really removed', (await one(`select count(*)::int n from public.customers where id=$1`, [cDone])).n === 0);
check('A non-admin cannot delete customers', /forbidden/.test(errInfo(await user(`select public.admin_delete_customers($1::uuid[])`, [[cAct]]))));

// ───────── notifications & chats ─────────
const nIds = (await su(`select id from public.notifications limit 2`)).rows.map((r) => r.id);
check('Visitors cannot delete notifications', ((await anon(`delete from public.notifications`)).error || true) && (await one(`select count(*)::int n from public.notifications where id = any($1)`, [nIds])).n === nIds.length);
check('A non-admin cannot delete notifications', ((await user(`delete from public.notifications`)).rowCount ?? 0) === 0);
const nd = await admin(`delete from public.notifications where id = any($1)`, [nIds]);
check('Admin deletes selected notifications permanently', !nd.error && nd.rowCount === nIds.length && (await one(`select count(*)::int n from public.notifications where id = any($1)`, [nIds])).n === 0, errInfo(nd));
const conv = randomUUID();
await anon(`select public.chat_send($1::jsonb)`, [JSON.stringify({ conversation_id: conv, token: randomBytes(32).toString('hex'), body: 'hello', client_id: randomUUID() })]);
check('A non-admin cannot bulk-delete chats', /forbidden/.test(errInfo(await user(`select public.admin_delete_conversations($1::uuid[])`, [[conv]]))));
const cd = (await admin(`select public.admin_delete_conversations($1::uuid[]) n`, [[conv]])).rows?.[0]?.n;
check('Admin bulk-deletes chats with their messages', cd === 1 && (await one(`select count(*)::int n from public.chat_messages where conversation_id=$1`, [conv])).n === 0);

// ───────── cleanup ─────────
const cs = await one(`select * from public.cleanup_settings`);
check('Automatic cleanup is OFF by default (90/90/30/90/30 days)', cs.auto_enabled === false && cs.orders_days === 90 && cs.notifications_days === 30);
check('Visitors cannot read or change cleanup settings', !!(await anon(`update public.cleanup_settings set auto_enabled = true`)).error && (await one(`select auto_enabled from public.cleanup_settings`)).auto_enabled === false);
const old = await order(String(++ph), 'completed');
const oldCanc = await order(String(++ph), 'cancelled');
const oldAct = await order(String(++ph), 'confirmed');
await su(`alter table public.orders disable trigger user`);
await su(`update public.orders set created_at = now() - interval '100 days' where id = any($1)`, [[old.id, oldCanc.id, oldAct.id]]);
await su(`alter table public.orders enable trigger user`);
const l1 = (await anon(`select public.submit_enquiry($1::jsonb) e`, [JSON.stringify({ kind: 'contact', name: 'Old closed', phone: String(++ph), message: 'x' })])).rows[0].e.id;
const l2 = (await anon(`select public.submit_enquiry($1::jsonb) e`, [JSON.stringify({ kind: 'contact', name: 'Old new', phone: String(++ph), message: 'x' })])).rows[0].e.id;
await su(`update public.leads set status = case when id=$1 then 'closed' else 'new' end, created_at = now() - interval '100 days' where id = any($2)`, [l1, [l1, l2]]);
await su(`update public.notifications set created_at = now() - interval '40 days' where lead_id = $1`, [l2]);
await su(`insert into public.offers (title, discount_type, discount_value, code, is_active, ends_at, starts_at) values ('Old Diwali', 'percent', 10, 'OLDDIWALI', false, now() - interval '40 days', now() - interval '60 days')`);
const pv = (await admin(`select public.admin_cleanup_preview() p`)).rows?.[0]?.p;
check('Preview lists only old finished orders (not the old active one)', pv && pv.orders.includes(old.id) && pv.orders.includes(oldCanc.id) && !pv.orders.includes(oldAct.id), JSON.stringify(pv?.orders));
check('Preview lists old closed enquiries, not old “new” ones', pv.leads.includes(l1) && !pv.leads.includes(l2));
check('Preview lists old notifications and long-expired coupons', pv.notifications.length >= 1 && pv.coupons.length === 1);
check('Auto cleanup does nothing while switched off', (await admin(`select public.admin_cleanup_auto() r`)).rows?.[0]?.r === null && (await one(`select count(*)::int n from public.orders where id=$1`, [old.id])).n === 1);
check('A non-admin cannot run cleanup', /forbidden/.test(errInfo(await user(`select public.admin_cleanup_run()`))));
await admin(`update public.cleanup_settings set auto_enabled = true, orders_days = 60`);
const ar = (await admin(`select public.admin_cleanup_auto() r`)).rows?.[0]?.r;
check('Auto cleanup runs once switched on', ar && ar.orders === 2 && ar.leads === 1 && ar.coupons === 1 && ar.mode === 'auto-cleanup', JSON.stringify(ar));
check('Old active order and old “new” enquiry survive cleanup', (await one(`select count(*)::int n from public.orders where id=$1`, [oldAct.id])).n === 1 && (await one(`select count(*)::int n from public.leads where id=$1`, [l2])).n === 1);
check('Cleaned orders are in the bill register (auto-cleanup)', (await one(`select count(*)::int n from public.bill_register where delete_reason='auto-cleanup' and bill_number = any($1)`, [[old.bill_number, oldCanc.bill_number]])).n === 2);
check('Auto cleanup runs at most once a day', (await admin(`select public.admin_cleanup_auto() r`)).rows?.[0]?.r === null);
check('Last run time and result are recorded', !!(await one(`select last_run_at, last_result from public.cleanup_settings`)).last_run_at);
await admin(`update public.cleanup_settings set auto_enabled = false, orders_days = 90`);
check('A category set to 0 days is never cleaned', !(await admin(`update public.cleanup_settings set leads_days = 0`)).error && (await admin(`select public.admin_cleanup_preview() p`)).rows[0].p.leads.length === 0);
check('Invalid cleanup period refused (3 days)', !!(await admin(`update public.cleanup_settings set orders_days = 3`)).error);

// ───────── media ─────────
await su(`insert into storage.objects (bucket_id, name, metadata) values ('images','dishes/used.webp','{"size":120000,"mimetype":"image/webp"}'), ('images','bulk/unused.webp','{"size":900000,"mimetype":"image/webp"}')`);
await su(`update public.dishes set image_path = 'http://localhost:54400/storage/v1/object/public/images/dishes/used.webp', image_kind='photo' where id='mutton-biryani'`);
const ml = (await admin(`select public.admin_media_list() m`)).rows?.[0]?.m ?? [];
const used = ml.find((m) => m.name === 'dishes/used.webp'), unused = ml.find((m) => m.name === 'bulk/unused.webp');
check('Media list shows size and where each file is used', used && used.size === 120000 && used.used_by.includes('Menu: Mutton Biryani') && unused && unused.used_by.length === 0, JSON.stringify(ml));
check('A non-admin cannot list media', /forbidden/.test(errInfo(await user(`select public.admin_media_list()`))));
check('Visitors cannot list storage objects', ((await anon(`select * from storage.objects`)).rows?.length ?? 0) === 0);

// ───────── nothing else touched ─────────
check('Regular menu prices untouched', (await one(`select count(*)::int n from public.dish_variants where price <= 0`)).n === 0 && (await anon('select public.get_storefront() s')).rows[0].s.dishes.length === 12);

console.log(`\n${pass}/${pass + fail} cleanup database checks passed`);
await pool.end();
process.exit(fail ? 1 : 0);
