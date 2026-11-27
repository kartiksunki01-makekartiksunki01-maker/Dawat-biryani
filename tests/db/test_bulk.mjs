// Database tests for V3.6 Bulk & Special Orders. LOCAL / staging Postgres only — never production.
//   DATABASE_URL=postgres://... node tests/db/test_bulk.mjs
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const DB_URL = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:54329/dawat';
if (/supabase\.(co|com)/.test(DB_URL)) throw new Error('Refusing to run tests against Supabase production.');
const MIGRATION = new URL('../../supabase/migrations/20261127090000_v3_6_bulk_menu.sql', import.meta.url);

let pass = 0, fail = 0;
const check = (name, cond, detail = '') => {
  if (cond) pass++; else fail++;
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
};
const pool = new pg.Pool({ connectionString: DB_URL, max: 20 });
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
  } catch (e) {
    await c.query('rollback').catch(() => {});
    return { error: e };
  } finally { c.release(); }
}
const anon = (s, p) => as('anon', null, s, p);
const admin = (s, p) => as('authenticated', ADMIN, s, p);
const user = (s, p) => as('authenticated', USER, s, p);
const su = (s, p) => pool.query(s, p);
const errInfo = (r) => (r.error ? `${r.error.message} ${r.error.detail ?? ''}`.trim() : 'no error');
const issues = (r) => { try { return JSON.parse(r.error?.detail ?? '[]'); } catch { return []; } };

let phoneSeq = 9300000000;
const nextPhone = () => String(++phoneSeq);
/** Asia/Kolkata date + time `hours` from now, as the website sends them. */
const ist = (hours) => {
  const d = new Date(Date.now() + hours * 36e5 + 5.5 * 36e5);
  return { date: d.toISOString().slice(0, 10), time: d.toISOString().slice(11, 16) };
};
const submit = (p, who = anon) => who('select public.submit_bulk_enquiry($1::jsonb) as r', [JSON.stringify(p)]);
const payload = (items, extra = {}) => ({
  idempotency_key: randomUUID(), name: 'Bulk Tester', phone: nextPhone(), mode: 'pickup', event_type: 'Birthday',
  consent: true, instructions: 'Less spicy please', ...ist(3), items, ...extra,
});

// ───────── setup ─────────
await su(`insert into auth.users (id, email) values ($1,'bulk-admin@test.local'), ($2,'bulk-user@test.local')`, [ADMIN, USER]);
await su(`insert into public.admins (user_id) values ($1)`, [ADMIN]);
await su(`update public.restaurant_settings set opens_at='00:00', closes_at='23:59:59', open_days='{0,1,2,3,4,5,6}', closed_dates='{}'`);
const regularBefore = (await su(`select md5(string_agg(dish_id || ':' || label || ':' || price::text, ',' order by dish_id, label)) h, count(*)::int n from public.dish_variants`)).rows[0];

// ───────── seed ─────────
const EXPECTED = {
  'Chicken Dum Biryani': [800, 'chicken'], 'Chicken Tikka Biryani': [1200, 'chicken'], 'Chicken Malai Tikka Biryani': [1400, 'chicken'],
  'Chicken Italian Biryani': [1400, 'chicken'], 'Prawns Biryani': [1400, 'seafood'], 'Mutton Biryani': [1600, 'mutton'],
  'Mutton Tikka Biryani': [1800, 'mutton'], 'Chicken Gravy': [700, 'gravies'], 'Chicken Sukha Lapeta': [900, 'chicken-specials'],
  'Chicken Kabab': [700, 'starters'], 'Veg Vegetable Paneer Biryani': [800, 'vegetarian'], 'Veg Vegetable Paneer Tikka Biryani': [1200, 'vegetarian'],
};
const all = (await su(`select * from public.bulk_menu_items where archived_at is null`)).rows;
check('All 12 supplied bulk dishes are in the bulk menu', all.length === 12 && Object.keys(EXPECTED).every((n) => all.some((r) => r.name === n)), all.map((r) => r.name).join(', '));
const wrong = all.filter((r) => !EXPECTED[r.name] || Number(r.price_per_kg) !== EXPECTED[r.name][0] || r.category !== EXPECTED[r.name][1]);
check('Every per-kg price and category matches the supplied table', wrong.length === 0, wrong.map((r) => `${r.name} ${r.price_per_kg} ${r.category}`).join('; '));
check('Veg dishes are veg, all others non-veg', all.every((r) => (r.category === 'vegetarian') === (r.diet === 'veg') && r.diet !== 'unconfirmed'));
const malai = all.find((r) => r.slug === 'chicken-malai-tikka-biryani');
check('Malai Tikka (unit not confirmed) is kept off the website until the restaurant confirms', malai && !malai.is_available && /confirm/i.test(malai.admin_note ?? ''));
check('Only the advertised Paneer Biryani has a confirmed timing rule', all.filter((r) => r.timing_confirmed).map((r) => r.slug).join() === 'veg-paneer-biryani');
check('Defaults keep the advertised rule: 1–20 kg, up to 5 kg without notice, 2 hours above', all.every((r) => r.min_kg === 1 && r.max_kg === 20 && r.notice_free_up_to_kg === 5 && r.advance_notice_hours === 2));
const byslug = Object.fromEntries(all.map((r) => [r.slug, r]));
const ID = (slug) => byslug[slug].id;

// ───────── storefront ─────────
const sf = (await anon('select public.get_storefront() s')).rows[0].s;
check('Storefront has a separate bulk menu with the 11 published dishes', sf.bulk?.items?.length === 11 && !sf.bulk.items.some((i) => i.slug === 'chicken-malai-tikka-biryani'), String(sf.bulk?.items?.length));
check('Storefront bulk menu never exposes the private admin note', !JSON.stringify(sf.bulk).includes('admin_note') && !JSON.stringify(sf.bulk).includes('WhatsApp screenshot'));
check('Storefront carries the menu-wide 20 kg limit', sf.bulk.max_total_kg === 20);
check('Regular plate menu unchanged (12 dishes, same portions)', sf.dishes.length === 12 && sf.dishes.find((d) => d.id === 'chicken-dum-biryani').variants.map((v) => Number(v.price)).join() === '110,150');

// ───────── authorization ─────────
const anonRead = await anon(`select slug from public.bulk_menu_items`);
check('Visitors can read published bulk dishes only (hidden Malai Tikka not visible)', !anonRead.error && anonRead.rows.length === 11, errInfo(anonRead));
check('Visitors cannot read the private admin note column', /permission denied/.test(errInfo(await anon(`select admin_note from public.bulk_menu_items`))));
check('Visitors cannot change a bulk price', (await anon(`update public.bulk_menu_items set price_per_kg = 1`)).error && (await su(`select count(*)::int n from public.bulk_menu_items where price_per_kg = 1`)).rows[0].n === 0);
check('Visitors cannot add a bulk dish', !!(await anon(`insert into public.bulk_menu_items (slug, name, category, price_per_kg) values ('x-x','Fake','chicken',1)`)).error);
check('Visitors cannot delete bulk dishes', ((await anon(`delete from public.bulk_menu_items`)).error || true) && (await su(`select count(*)::int n from public.bulk_menu_items`)).rows[0].n === 12);
const uu = await user(`update public.bulk_menu_items set price_per_kg = 2 returning id`);
check('A signed-in non-admin cannot change bulk prices', (uu.error || uu.rowCount === 0) && (await su(`select count(*)::int n from public.bulk_menu_items where price_per_kg = 2`)).rows[0].n === 0, errInfo(uu));
check('A signed-in non-admin cannot add bulk dishes', !!(await user(`insert into public.bulk_menu_items (slug, name, category, price_per_kg) values ('y-y','Fake','chicken',1)`)).error);
const ae = await admin(`update public.bulk_menu_items set price_per_kg = 850 where slug = 'chicken-dum-biryani' returning price_per_kg`);
check('Admin can change a bulk price', Number(ae.rows?.[0]?.price_per_kg) === 850, errInfo(ae));
check('Bulk price change is written to the audit log', (await su(`select count(*)::int n from public.audit_logs where entity='bulk_menu_items' and action='update' and details ? 'price_per_kg'`)).rows[0].n >= 1);
check('Database refuses an invalid price (0) or min > max', !!(await admin(`update public.bulk_menu_items set price_per_kg = 0 where slug='chicken-gravy'`)).error && !!(await admin(`update public.bulk_menu_items set min_kg = 10, max_kg = 5 where slug='chicken-gravy'`)).error);
const add = await admin(`insert into public.bulk_menu_items (slug, name, category, diet, price_per_kg) values ('test-special','Test Special','starters','non-veg',650) returning is_available`);
check('Admin can add a bulk dish; it starts hidden from the website', add.rows?.[0]?.is_available === false, errInfo(add));

// re-running the migration must not overwrite admin edits nor touch regular prices
await su(readFileSync(MIGRATION, 'utf8'));
check('Re-running the seed keeps the admin-edited price (₹850, not ₹800)', Number((await su(`select price_per_kg from public.bulk_menu_items where slug='chicken-dum-biryani'`)).rows[0].price_per_kg) === 850);
check('Re-running the seed adds no duplicates', (await su(`select count(*)::int n from public.bulk_menu_items`)).rows[0].n === 13);
const regularAfter = (await su(`select md5(string_agg(dish_id || ':' || label || ':' || price::text, ',' order by dish_id, label)) h, count(*)::int n from public.dish_variants`)).rows[0];
check('Regular plate prices are untouched by the migration', regularAfter.h === regularBefore.h && regularAfter.n === regularBefore.n);
await admin(`update public.bulk_menu_items set price_per_kg = 800 where slug = 'chicken-dum-biryani'`);

// ───────── automatic pricing (server-authoritative) ─────────
const one = async (slug, kg, extra = {}) => submit(payload([{ id: ID(slug), kg }], extra));
const examples = [['chicken-dum-biryani', 5, 4000], ['chicken-tikka-biryani', 3, 3600], ['mutton-biryani', 10, 16000], ['veg-paneer-tikka-biryani', 5, 6000]];
for (const [slug, kg, want] of examples) {
  const r = await one(slug, kg, kg > 5 ? ist(3) : {});
  check(`${kg} kg ${byslug[slug].name} = ₹${want}`, Number(r.rows?.[0]?.r?.estimated_total) === want, errInfo(r));
}
const multi = await submit(payload([{ id: ID('chicken-dum-biryani'), kg: 5 }, { id: ID('chicken-gravy'), kg: 2 }, { id: ID('veg-paneer-biryani'), kg: 3 }]));
const mr = multi.rows?.[0]?.r;
check('Multi-dish: 5 kg Dum + 2 kg Gravy + 3 kg Veg Paneer = 10 kg, ₹7,800', mr?.total_kg === 10 && Number(mr?.estimated_total) === 7800 && mr.items.length === 3, errInfo(multi));
const lead = (await su(`select * from public.leads where id=$1`, [mr.id])).rows[0];
check('Enquiry stored with per-dish price snapshot, kg and subtotal', lead.kind === 'bulk' && lead.status === 'new' && lead.payload.version === 2 &&
  lead.payload.items.map((i) => `${i.name}:${i.kg}:${Number(i.price_per_kg)}:${Number(i.subtotal)}`).join('|') === 'Chicken Dum Biryani:5:800:4000|Chicken Gravy:2:700:1400|Veg Vegetable Paneer Biryani:3:800:2400');
check('Enquiry message has the full breakdown in Indian format, marked as an estimate', /Chicken Dum Biryani: 5 kg × ₹800\/kg = ₹4,000/.test(lead.message) && /Total quantity: 10 kg/.test(lead.message) && /Estimated total: ₹7,800 \(estimate/.test(lead.message), lead.message);
check('Enquiry is not a confirmed order (no quote, no order)', lead.quote_amount === null && lead.converted_order_id === null);
check('Old admin fields still filled (total kg + varieties) for older screens', lead.payload.kg === 10 && /Chicken Gravy/.test(lead.payload.variety));
check('New bulk enquiry notifies the admin', (await su(`select count(*)::int n from public.notifications where lead_id=$1 and kind='new_bulk'`, [mr.id])).rows[0].n === 1);
check('Visitors cannot read other customers’ enquiries', (await anon(`select count(*)::int n from public.leads`)).error || (await anon(`select count(*)::int n from public.leads`)).rows[0].n === 0);

// prices from the browser are never trusted
const seenWrong = await submit(payload([{ id: ID('mutton-biryani'), kg: 2 }], { seen_prices: { [ID('mutton-biryani')]: 100 } }));
check('A price sent by the browser that differs from the database is refused with "price changed"', issues(seenWrong)[0]?.code === 'price_changed' && Number(issues(seenWrong)[0]?.new_price) === 1600, errInfo(seenWrong));
const fake = await submit(payload([{ id: ID('mutton-biryani'), kg: 2, price_per_kg: 1, subtotal: 2 }], { estimated_total: 2 }));
check('Fake totals/prices in the request are ignored — database price used (2 kg Mutton = ₹3,200)', Number(fake.rows?.[0]?.r?.estimated_total) === 3200, errInfo(fake));

// price change after submission keeps the snapshot
await admin(`update public.bulk_menu_items set price_per_kg = 900 where slug='chicken-gravy'`);
check('Later price change does not alter a submitted enquiry', Number((await su(`select payload->'items'->1->>'price_per_kg' p from public.leads where id=$1`, [mr.id])).rows[0].p) === 700);
const seenOld = await submit(payload([{ id: ID('chicken-gravy'), kg: 2 }], { seen_prices: { [ID('chicken-gravy')]: 700 } }));
check('Customer who saw the old price is told it changed (₹700 → ₹900)', issues(seenOld)[0]?.code === 'price_changed' && Number(issues(seenOld)[0].old_price) === 700 && Number(issues(seenOld)[0].new_price) === 900 && /₹700 to ₹900/.test(issues(seenOld)[0].message), errInfo(seenOld));
await admin(`update public.bulk_menu_items set price_per_kg = 700 where slug='chicken-gravy'`);

// availability
check('Hidden dish (Malai Tikka) cannot be ordered', issues(await one('chicken-malai-tikka-biryani', 2))[0]?.code === 'unavailable');
await admin(`update public.bulk_menu_items set is_sold_out = true where slug='chicken-kabab'`);
check('Sold-out dish cannot be ordered', issues(await one('chicken-kabab', 2))[0]?.code === 'unavailable');
await admin(`update public.bulk_menu_items set is_sold_out = false where slug='chicken-kabab'`);
await admin(`update public.bulk_menu_items set archived_at = now() where slug='test-special'`);
check('Archived dish cannot be ordered', issues(await submit(payload([{ id: (await su(`select id from public.bulk_menu_items where slug='test-special'`)).rows[0].id, kg: 2 }])))[0]?.code === 'unavailable');
check('Unknown dish id cannot be ordered', issues(await submit(payload([{ id: randomUUID(), kg: 2 }])))[0]?.code === 'unavailable');
check('The same dish twice in one request is refused', /invalid_request/.test(errInfo(await submit(payload([{ id: ID('mutton-biryani'), kg: 2 }, { id: ID('mutton-biryani'), kg: 3 }])))));
check('Empty bulk order is refused', issues(await submit(payload([])))[0]?.code === 'empty');

// quantities
for (const kg of [0, 21, 2.5]) check(`${kg} kg is refused (1–20 whole kg)`, issues(await one('mutton-biryani', kg))[0]?.code === 'qty_invalid');
const big = await submit(payload([{ id: ID('mutton-biryani'), kg: 12 }, { id: ID('chicken-gravy'), kg: 9 }], ist(3)));
check('Combined 21 kg is refused against the 20 kg menu-wide limit', issues(big).some((i) => i.code === 'total_too_large'), errInfo(big));
await admin(`update public.restaurant_settings set bulk_max_total_kg = 40 where id = 1`);
check('Admin can raise the combined limit (21 kg then accepted)', !!(await submit(payload([{ id: ID('mutton-biryani'), kg: 12 }, { id: ID('chicken-gravy'), kg: 9 }], ist(3)))).rows?.[0]?.r?.id);
await admin(`update public.restaurant_settings set bulk_max_total_kg = 20 where id = 1`);

// timing (Asia/Kolkata)
check('A past time is refused', issues(await one('mutton-biryani', 2, ist(-2)))[0]?.code === 'time_past');
check('6 kg one hour from now is refused (needs 2 hours’ notice)', issues(await one('veg-paneer-biryani', 6, ist(1)))[0]?.code === 'notice_required');
check('6 kg three hours from now is accepted', !!(await one('veg-paneer-biryani', 6, ist(3))).rows?.[0]?.r?.id);
check('5 kg one hour from now is accepted (no notice up to 5 kg)', !!(await one('veg-paneer-biryani', 5, ist(1))).rows?.[0]?.r?.id);
await admin(`update public.bulk_menu_items set notice_free_up_to_kg = 0, advance_notice_hours = 24 where slug='mutton-tikka-biryani'`);
check('Per-dish notice rule is enforced (Mutton Tikka set to 24 h)', issues(await one('mutton-tikka-biryani', 2, ist(5)))[0]?.code === 'notice_required' && !!(await one('mutton-tikka-biryani', 2, ist(26))).rows?.[0]?.r?.id);
await admin(`update public.bulk_menu_items set notice_free_up_to_kg = 5, advance_notice_hours = 2 where slug='mutton-tikka-biryani'`);
const day = ist(48).date;
await su(`update public.restaurant_settings set closed_dates = $1`, [[day]]);
check('A closed day is refused', issues(await one('mutton-biryani', 2, { date: day, time: '13:00' }))[0]?.code === 'closed_day');
await su(`update public.restaurant_settings set closed_dates = '{}', opens_at = '10:00', closes_at = '22:00'`);
check('A time outside opening hours is refused', issues(await one('mutton-biryani', 2, { date: day, time: '23:30' }))[0]?.code === 'outside_hours');
await su(`update public.restaurant_settings set opens_at='00:00', closes_at='23:59:59'`);
check('Missing date/time is refused', issues(await one('mutton-biryani', 2, { date: '', time: '' }))[0]?.code === 'time_required');

// identity / consent
check('Invalid phone refused', issues(await one('mutton-biryani', 2, { phone: '12345' })).some((i) => i.code === 'phone_invalid'));
check('Missing name refused', issues(await one('mutton-biryani', 2, { name: ' ' })).some((i) => i.code === 'name_invalid'));
check('Missing consent refused', issues(await one('mutton-biryani', 2, { consent: false })).some((i) => i.code === 'consent_required'));

// duplicates
const dupP = payload([{ id: ID('chicken-dum-biryani'), kg: 4 }]);
const d1 = await submit(dupP), d2 = await submit(dupP);
check('Sending the same enquiry twice creates it only once (same reference)', d1.rows?.[0]?.r?.id && d2.rows?.[0]?.r?.id === d1.rows[0].r.id && d2.rows[0].r.duplicate === true &&
  (await su(`select count(*)::int n from public.leads where idempotency_key=$1`, [dupP.idempotency_key])).rows[0].n === 1);
const par = payload([{ id: ID('chicken-dum-biryani'), kg: 3 }]);
const both = await Promise.all([submit(par), submit(par), submit(par)]);
check('Three parallel identical submissions still create one enquiry', both.every((r) => r.rows?.[0]?.r?.id === both[0].rows?.[0]?.r?.id) && (await su(`select count(*)::int n from public.leads where idempotency_key=$1`, [par.idempotency_key])).rows[0].n === 1, both.map(errInfo).join(' | '));
const flood = nextPhone(); let limited = false;
for (let i = 0; i < 7; i++) { const r = await submit(payload([{ id: ID('chicken-dum-biryani'), kg: 2 }], { phone: flood })); if (/rate_limited/.test(errInfo(r))) { limited = true; break; } }
check('Enquiry flooding from one number is rate-limited', limited);

// ───────── quotation → order ─────────
const cvt = (id, who = admin) => who(`select public.admin_convert_lead($1) as r`, [id]);
check('Visitors cannot convert an enquiry', /forbidden|permission/.test(errInfo(await cvt(mr.id, anon))));
check('A non-admin cannot convert an enquiry', /forbidden/.test(errInfo(await cvt(mr.id, user))));
check('Converting without a quotation is refused', /quote_required/.test(errInfo(await cvt(mr.id))));
await admin(`update public.leads set quote_amount = 7500, status = 'confirmed' where id=$1`, [mr.id]);
const c1 = await cvt(mr.id);
const o1 = c1.rows?.[0]?.r;
check('Confirmed quotation converts into a real order with a bill number', /^DBH-\d{8}-\d{4}$/.test(o1?.bill_number ?? ''), errInfo(c1));
const ord = (await su(`select * from public.orders where id=$1`, [o1.order_id])).rows[0];
const its = (await su(`select dish_name, variant_label, unit_price::float, qty, line_total::float from public.order_items where order_id=$1 order by sort_order`, [o1.order_id])).rows;
check('Order total = quotation ₹7,500; estimate ₹7,800 shown with a ₹300 discount', Number(ord.total) === 7500 && Number(ord.subtotal) === 7800 && Number(ord.discount) === 300 && ord.source === 'bulk' && ord.status === 'confirmed', JSON.stringify({ t: ord.total, s: ord.subtotal, d: ord.discount }));
check('One receipt line per dish: kg × submitted price per kg', its.length === 3 && its[0].dish_name === 'Bulk: Chicken Dum Biryani' && its[0].qty === 5 && its[0].unit_price === 800 && its[0].line_total === 4000 && its[1].unit_price === 700, JSON.stringify(its));
check('Receipt snapshot created for the bill', (await su(`select count(*)::int n from public.receipts where order_id=$1 and bill_number=$2`, [o1.order_id, o1.bill_number])).rows[0].n === 1);
check('Event type kept as a private order note', /Birthday/.test(ord.admin_notes ?? ''));
check('A quotation cannot be converted twice', /already_converted/.test(errInfo(await cvt(mr.id))));
const lead2 = (await submit(payload([{ id: ID('mutton-biryani'), kg: 3 }]))).rows[0].r;
await admin(`update public.leads set quote_amount = 5000 where id=$1`, [lead2.id]);
const o2 = (await cvt(lead2.id)).rows?.[0]?.r;
const ord2 = (await su(`select subtotal::float, discount::float, total::float from public.orders where id=$1`, [o2.order_id])).rows[0];
const adj = (await su(`select line_total::float v from public.order_items where order_id=$1 and dish_name='Quotation adjustment'`, [o2.order_id])).rows[0];
check('Quotation above the estimate (₹5,000 vs ₹4,800) adds a ₹200 adjustment line; total = quotation', ord2.total === 5000 && ord2.subtotal === 5000 && ord2.discount === 0 && adj?.v === 200, JSON.stringify(ord2));
check('Bill numbers are unique and sequential', o2.bill_number !== o1.bill_number && Number(o2.bill_number.slice(-4)) === Number(o1.bill_number.slice(-4)) + 1);
const lead3 = (await submit(payload([{ id: ID('mutton-biryani'), kg: 2 }]))).rows[0].r;
await admin(`update public.leads set quote_amount = 3000, status = 'rejected' where id=$1`, [lead3.id]);
check('Admin can mark an enquiry rejected; a rejected enquiry cannot be converted', /lead_rejected/.test(errInfo(await cvt(lead3.id))));
const pc = await Promise.all([lead2.id, lead2.id].map(() => cvt(lead2.id)));
check('Parallel convert attempts on a converted quotation are both refused', pc.every((r) => /already_converted/.test(errInfo(r))));

// legacy single-variety enquiry (old website version) still works and converts as before
const legacy = await anon(`select public.submit_enquiry($1::jsonb) as e`, [JSON.stringify({ kind: 'bulk', name: 'Old Form', phone: nextPhone(), message: 'Need 8 kg', payload: { kg: 8, variety: 'Paneer Biryani', eventType: 'Wedding', date: ist(30).date, time: '13:00', mode: 'pickup' } })]);
const lid = legacy.rows?.[0]?.e?.id;
await admin(`update public.leads set quote_amount = 6400 where id=$1`, [lid]);
const lo = (await cvt(lid)).rows?.[0]?.r;
const li = (await su(`select dish_name, variant_label, line_total::float from public.order_items where order_id=$1`, [lo?.order_id])).rows;
check('Old single-variety bulk enquiry still converts exactly as before', li.length === 1 && li[0].dish_name === 'Bulk order: Paneer Biryani' && li[0].variant_label === '8 kg' && li[0].line_total === 6400, JSON.stringify(li));
check('Visitors still cannot set a quote on a direct insert', !!(await anon(`insert into public.leads (kind, name, quote_amount) values ('bulk','x', 1)`)).error);

console.log(`\n${pass}/${pass + fail} bulk database checks passed`);
await pool.end();
process.exit(fail ? 1 : 0);
