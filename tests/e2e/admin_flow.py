"""Admin panel end-to-end tests — LOCAL build + LOCAL database only (see docs/TESTING.md).
python3 tests/e2e/admin_flow.py http://localhost:4300/
"""
import json, re, sys, time, uuid, os, urllib.request
from playwright.sync_api import sync_playwright

URL = sys.argv[1].rstrip('/') + '/'
assert URL.startswith('http://localhost'), 'local only'
API = 'http://localhost:54400'
OUT = 'tests/output/'
os.makedirs(OUT, exist_ok=True)
results = []

def check(name, cond, detail=''):
    results.append((name, bool(cond), detail))
    print(('PASS ' if cond else 'FAIL ') + name + (f' — {detail}' if detail else ''), flush=True)

def post(path, body, headers=None):
    req = urllib.request.Request(API + path, data=json.dumps(body).encode(), headers={'content-type': 'application/json', **(headers or {})}, method='POST')
    try:
        return json.loads(urllib.request.urlopen(req, timeout=15).read() or b'null')
    except urllib.error.HTTPError as e:
        return {'http_error': e.code, 'body': e.read().decode()[:200]}

def sql(q):
    return post('/__control', {'sql': q}).get('rows', [])

ADMIN, USER = str(uuid.uuid4()), str(uuid.uuid4())
sql(f"insert into auth.users (id, email, pw) values ('{ADMIN}', 'owner@test.local', 'test-password-123'), ('{USER}', 'staff@test.local', 'staff-password-123')")
sql(f"insert into public.admins (user_id) values ('{ADMIN}')")
sql("update public.restaurant_settings set opens_at='00:00', closes_at='23:59:59', min_lead_minutes=0, delivery_enabled=true, delivery_charge=30")
variants = {d['id']: d['variants'] for d in post('/rest/v1/rpc/get_storefront', {})['dishes']}
def place(name, phone, vid, qty=1):
    p = {'idempotency_key': str(uuid.uuid4()), 'access_token': uuid.uuid4().hex + uuid.uuid4().hex, 'name': name, 'phone': phone,
         'mode': 'pickup', 'confirm': True, 'items': [{'variant_id': vid, 'qty': qty}]}
    return post('/rest/v1/rpc/place_order', {'p': p})
o1 = place('Admin Test One', '9811111111', variants['mutton-biryani'][0]['id'], 2)
o2 = place('Admin Test Two', '9822222222', variants['chicken-dum-biryani'][0]['id'], 1)
lead = post('/rest/v1/rpc/submit_enquiry', {'p': {'kind': 'bulk', 'name': 'Wedding Family', 'phone': '9833333333', 'message': '12 kg', 'payload': {'kg': 12, 'variety': 'Paneer Biryani', 'mode': 'pickup', 'date': '2026-12-20', 'time': '12:00'}}})
check('Fixture orders placed through the real database functions', 'bill_number' in o1 and 'bill_number' in o2 and 'id' in lead, str(o1)[:120])

anon = urllib.request.Request(API + '/rest/v1/orders?select=*', headers={'apikey': 'x'})
try:
    urllib.request.urlopen(anon, timeout=10); anon_ok = True
except urllib.error.HTTPError:
    anon_ok = False
check('Visitor (no login) cannot read orders through the API', not anon_ok)

IGNORE = ('WebSocket', 'realtime', 'Failed to load resource', 'net::ERR')
with sync_playwright() as pw:
    b = pw.chromium.launch()
    ctx = b.new_context(viewport={'width': 1366, 'height': 860}, accept_downloads=True)
    page = ctx.new_page()
    errs = []
    page.on('pageerror', lambda e: errs.append(str(e)))
    page.on('console', lambda m: errs.append(m.text) if m.type == 'error' and not any(i in m.text for i in IGNORE) else None)
    page.goto(URL + 'admin.html')
    page.get_by_label('Email').fill('owner@test.local')
    page.get_by_label('Password').fill('wrong')
    page.get_by_role('button', name='Sign in').click()
    page.wait_for_selector('text=Login failed', timeout=10000)
    check('Wrong password is refused', True)

    page.get_by_label('Email').fill('staff@test.local')
    page.get_by_label('Password').fill('staff-password-123')
    page.get_by_role('button', name='Sign in').click()
    page.wait_for_selector('text=is not an admin', timeout=10000)
    check('Logged-in non-admin is kept out of the panel', True)
    page.get_by_role('button', name='Sign out').click()

    page.get_by_label('Email').fill('owner@test.local')
    page.get_by_label('Password').fill('test-password-123')
    page.get_by_role('button', name='Sign in').click()
    page.wait_for_selector('h1:has-text("Dashboard")', timeout=15000)
    page.wait_for_timeout(1500)
    page.screenshot(path=OUT + 'admin_dashboard.png', full_page=True)
    dash = page.locator('main').inner_text()
    check('Dashboard shows real counts (2 orders today, 2 pending)', re.search(r'2\s*Orders in range', dash) is not None and re.search(r'2\s*Pending right now', dash) is not None, dash[:160].replace('\n', ' '))
    nav = page.get_by_role('navigation', name='Admin sections').first
    labels = nav.locator('ul a').all_inner_texts()
    check('Sidebar has all 17 sections (+ View site / Sign out)', len(labels) == 17 and nav.get_by_role('link', name='View site').count() == 1, str(len(labels)))

    # every section opens without errors
    inventory = []
    for lab in [l.split('\n')[0].strip() for l in labels]:
        nav.get_by_role('link', name=re.compile('^' + re.escape(lab))).click()
        page.wait_for_timeout(900)
        h = page.locator('main h1').first.inner_text() if page.locator('main h1').count() else ''
        inventory.append((lab, h))
    bad = [x for x in inventory if not x[1]]
    check('All 17 admin sections open and render a heading', not bad, str(bad))
    json.dump(inventory, open(OUT + 'admin_sections.json', 'w'))

    # ── Orders ──
    nav.get_by_role('link', name=re.compile('^Orders')).click()
    page.wait_for_timeout(1200)
    card1 = page.locator('li', has_text=o1['bill_number'])
    check('New orders are highlighted', card1.get_by_text('NEW').count() == 1)
    card1.get_by_role('button', name='Accept').click()
    page.wait_for_timeout(1200)
    st = sql(f"select status from public.orders where id='{o1['id']}'")[0]['status']
    check('Accept → order confirmed in database', st == 'confirmed', st)
    card1.get_by_role('button', name='Details').click()
    m = page.get_by_role('dialog', name=f"Order {o1['bill_number']}")
    m.get_by_role('button', name='Mark preparing').click(); page.wait_for_timeout(900)
    page.locator('li', has_text=o1['bill_number']).get_by_role('button', name='Details').click() if not m.is_visible() else None
    m = page.get_by_role('dialog', name=f"Order {o1['bill_number']}")
    m.get_by_role('button', name='Mark ready for pickup').click(); page.wait_for_timeout(900)
    m.get_by_role('button', name='Mark completed').click(); page.wait_for_timeout(900)
    check('Status steps saved: preparing → ready → completed', sql(f"select string_agg(to_status, ',' order by id) s from public.order_status_history where order_id='{o1['id']}'")[0]['s'] == 'pending,confirmed,preparing,ready,completed')
    m.get_by_label('Payment status').select_option('paid')
    m.get_by_label('Method').select_option('upi')
    m.get_by_role('button', name='Save payment').click(); page.wait_for_timeout(900)
    pay = sql(f"select payment_status, payment_method from public.orders where id='{o1['id']}'")[0]
    check('Payment recorded separately (paid via UPI)', pay['payment_status'] == 'paid' and pay['payment_method'] == 'upi')
    with page.expect_download(timeout=20000) as dl:
        m.get_by_role('button', name='Receipt PDF').click()
    check('Admin can download the receipt PDF', dl.value.suggested_filename == o1['bill_number'] + '.pdf')
    m.get_by_role('button', name='Close').first.click()
    page.wait_for_timeout(500)

    page.get_by_label('Status').select_option('all')
    card2 = page.locator('li', has_text=o2['bill_number'])
    card2.get_by_role('button', name='Details').click()
    m2 = page.get_by_role('dialog', name=f"Order {o2['bill_number']}")
    m2.get_by_role('button', name='Reject').click()
    r = page.get_by_role('dialog', name='Reject order')
    check('Reject asks for a reason first (button disabled)', r.get_by_role('button', name='Reject order').is_disabled())
    r.get_by_label('Reason *').fill('Chicken finished for today')
    r.get_by_role('button', name='Reject order').click(); page.wait_for_timeout(1000)
    rej = sql(f"select status, status_reason from public.orders where id='{o2['id']}'")[0]
    check('Rejected with reason saved', rej['status'] == 'rejected' and rej['status_reason'] == 'Chicken finished for today')
    page.keyboard.press('Escape'); page.wait_for_timeout(400)

    # ── Bills ──
    nav.get_by_role('link', name=re.compile('^Bills')).click(); page.wait_for_timeout(1000)
    page.get_by_placeholder(re.compile('Bill number')).fill(o2['bill_number'])
    page.wait_for_timeout(400)
    check('Bill search finds exactly that bill', page.locator('main li').count() == 1)

    # ── Offers ──
    nav.get_by_role('link', name=re.compile('^Coupons')).click(); page.wait_for_timeout(800)
    page.get_by_role('button', name='Create coupon').click()
    f = page.get_by_role('dialog', name='Create coupon')
    f.get_by_label('Title *').fill('Twenty off')
    f.get_by_label(re.compile('^Coupon code')).fill('test20')
    f.get_by_label('Discount %').fill('20')
    f.get_by_label('Discount %').fill('150')
    check('Offer form blocks a discount over 100%', f.get_by_text('cannot be over 100%').count() == 1 and f.get_by_role('button', name='Save offer').is_disabled())
    f.get_by_label('Discount %').fill('20')
    f.get_by_text('Customers can use it now').click()
    f.get_by_role('button', name='Save offer').click(); page.wait_for_timeout(1000)
    off = sql("select code, is_active, discount_value from public.offers where code='TEST20'")
    check('Offer saved with uppercase code and active', len(off) == 1 and off[0]['is_active'] and float(off[0]['discount_value']) == 20, str(off))
    sf = post('/rest/v1/rpc/get_storefront', {})
    check('New public offer appears on the website data', any(o['code'] == 'TEST20' for o in sf['offers']))

    # coupon used by a real order → stats + usage list
    cp = {'idempotency_key': str(uuid.uuid4()), 'access_token': uuid.uuid4().hex + uuid.uuid4().hex, 'name': 'Coupon Buyer', 'phone': '9844444444',
          'mode': 'pickup', 'confirm': True, 'coupon': 'TEST20', 'items': [{'variant_id': variants['mutton-biryani'][0]['id'], 'qty': 1}]}
    oc = post('/rest/v1/rpc/place_order', {'p': cp})
    check('Order with the new coupon gets the discount from the database', float(oc.get('discount', 0)) > 0 and oc.get('coupon_code') == 'TEST20', str(oc)[:150])
    page.get_by_role('button', name=re.compile('Refresh')).click(); page.wait_for_timeout(900)
    check('Coupon summary shows live count, uses and discount given', page.get_by_test_id('stat-used').inner_text() == '1' and '₹' in page.get_by_test_id('stat-given').inner_text() and page.get_by_test_id('stat-live').inner_text() == '1', page.get_by_test_id('stat-given').inner_text())
    page.locator('li', has_text='Twenty off').get_by_role('button', name=re.compile('Actions for')).click()
    page.get_by_role('menuitem', name='View usage').click()
    u = page.get_by_role('dialog', name=re.compile('Usage'))
    page.wait_for_timeout(1200)
    check('Usage list shows the bill number that used the coupon', u.get_by_text(oc['bill_number']).count() == 1, u.inner_text()[:200].replace('\n',' '))
    u.get_by_role('button', name=re.compile('Close', re.I)).first.click(); page.wait_for_timeout(300)
    page.locator('li', has_text='Twenty off').get_by_role('button', name=re.compile('Actions for')).click()
    page.get_by_role('menuitem', name='Edit').click()
    ed = page.get_by_role('dialog', name=re.compile('Edit coupon'))
    ed.get_by_label('Discount %').fill('25'); ed.get_by_label(re.compile('^Maximum discount')).fill('50')
    ed.get_by_role('button', name='Save offer').click(); page.wait_for_timeout(900)
    e2 = sql("select discount_value, max_discount from public.offers where code='TEST20'")[0]
    check('Coupon edit (25%, max Rs 50) saved', float(e2['discount_value']) == 25 and float(e2['max_discount']) == 50, str(e2))
    page.locator('li', has_text='Twenty off').get_by_role('button', name=re.compile('Actions for')).click()
    page.get_by_role('menuitem', name=re.compile('^Delete')).click()
    page.get_by_role('dialog').get_by_role('button', name=re.compile('Switch off & delete|Delete permanently')).click(); page.wait_for_timeout(1200)
    gone = sql("select count(*)::int n from public.offers where code='TEST20'")[0]['n']
    kept = sql(f"select coupon_code, discount from public.orders where id='{oc['id']}'")[0]
    check('A used coupon can be deleted (V3.7) — its bill keeps the code and discount', gone == 0 and kept['coupon_code'] == 'TEST20' and float(kept['discount']) > 0, str(kept))

    # ── Menu ──
    nav.get_by_role('link', name=re.compile('^Menu')).click(); page.wait_for_timeout(1000)
    page.locator('li', has_text='Mutton Biryani').get_by_role('button', name='Mark sold out').click(); page.wait_for_timeout(900)
    check('Mark sold out saved', sql("select is_sold_out from public.dishes where id='mutton-biryani'")[0]['is_sold_out'] is True)
    page.locator('li', has_text='Chicken Dum Biryani').first.get_by_role('button', name=re.compile('^Chicken Dum Biryani')).click()
    e = page.get_by_role('dialog', name=re.compile('Edit — Chicken Dum'))
    e.get_by_label('Price in rupees').first.fill('115')
    e.get_by_role('button', name='Save').click(); page.wait_for_timeout(1200)
    pr = sql("select price from public.dish_variants where dish_id='chicken-dum-biryani' order by sort_order")
    check('Price edit saved (Regular → 115) and other portion unchanged', float(pr[0]['price']) == 115 and float(pr[1]['price']) == 150, str(pr))
    vid_before = variants['chicken-dum-biryani'][0]['id']
    check('Editing a price keeps the stable portion id (old carts keep working)', sql(f"select count(*)::int n from public.dish_variants where id='{vid_before}'")[0]['n'] == 1)

    # ── Customers ──
    nav.get_by_role('link', name=re.compile('^Customers')).click(); page.wait_for_timeout(1000)
    cust = page.locator('li', has_text='Admin Test Two')
    cust.get_by_role('button', name=re.compile('Actions for')).click()
    page.get_by_role('menuitem', name=re.compile('Delete personal data')).click()
    c = page.get_by_role('dialog', name=re.compile('Delete this customer'))
    check('Customer deletion explains what is kept and needs typed confirmation', c.get_by_text('Bill numbers, items and amounts stay').count() == 1 and c.get_by_role('button', name='Anonymise').is_disabled())
    c.get_by_label('Type DELETE to confirm').fill('DELETE')
    c.get_by_role('button', name='Anonymise').click(); page.wait_for_timeout(1200)
    an = sql(f"select customer_phone, bill_number, total from public.orders where id='{o2['id']}'")[0]
    check('Anonymised: phone removed, bill + total kept', an['customer_phone'] is None and an['bill_number'] == o2['bill_number'])

    # ── Bulk ──
    nav.get_by_role('link', name=re.compile('^Bulk')).click(); page.wait_for_timeout(1000)
    bl = page.locator('li', has_text='Wedding Family')
    check('Convert is disabled until a quotation is saved', bl.get_by_role('button', name='Convert to order').is_disabled())
    bl.get_by_label('Quotation (₹)').fill('4200')
    bl.get_by_role('button', name='Save quote').click(); page.wait_for_timeout(900)
    bl.get_by_role('button', name='Convert to order').click()
    page.get_by_role('dialog', name=re.compile('Create an order')).get_by_role('button', name='Create order').click()
    page.wait_for_selector('text=Share this private link', timeout=10000)
    link = page.locator('p.font-mono').inner_text()
    conv = sql("select o.bill_number, o.total, o.source from public.orders o join public.leads l on l.converted_order_id = o.id where l.name='Wedding Family'")
    check('Bulk quote converted into a real order once, with a share link', len(conv) == 1 and conv[0]['source'] == 'bulk' and float(conv[0]['total']) == 4200 and '/track.html#' in link, link[:60])
    page.keyboard.press('Escape'); page.wait_for_timeout(400)

    # ── Notifications ──
    nav.get_by_role('link', name=re.compile('^Notifications')).click(); page.wait_for_timeout(1000)
    check('Notifications list real events (4 orders + 1 bulk)', page.locator('main li').count() == 5, str(page.locator('main li').count()))
    page.get_by_role('button', name='Mark all as read').click(); page.wait_for_timeout(1000)
    check('Mark all as read clears the unread badge', page.locator('main li').get_by_text('Unread', exact=True).count() == 0 and sql("select count(*)::int n from public.notification_reads")[0]['n'] >= 5)

    # ── Settings ──
    nav.get_by_role('link', name=re.compile('^Restaurant')).click(); page.wait_for_timeout(1000)
    page.get_by_label('WhatsApp number (digits with country code)').fill('12')
    check('Invalid WhatsApp number blocks saving', page.get_by_text(re.compile('WhatsApp number: digits only')).count() == 1)
    page.get_by_label('WhatsApp number (digits with country code)').fill('919766888897')
    page.get_by_text('Delivery available', exact=True).click()
    page.get_by_role('button', name='Save changes').first.click(); page.wait_for_timeout(1200)
    check('Turning delivery off is saved', sql('select delivery_enabled from public.restaurant_settings')[0]['delivery_enabled'] is False)
    nav.get_by_role('link', name=re.compile('^Music')).click(); page.wait_for_timeout(1000)
    page.get_by_text('Also show it to returning visitors').click()
    page.get_by_role('button', name='Save changes').first.click(); page.wait_for_timeout(1200)
    check('Intro setting saved', sql('select intro_for_returning from public.website_settings')[0]['intro_for_returning'] is True)
    nav.get_by_role('link', name=re.compile('^Account')).click(); page.wait_for_timeout(1200)
    check('Activity log shows the changes made', page.locator('main li').count() >= 5)
    check('No unexpected errors in the admin panel', not errs, '; '.join(errs[:3]))
    ctx.close()

    # ── Mobile admin ──
    ctx = b.new_context(**pw.devices['Pixel 7'])
    page = ctx.new_page()
    page.goto(URL + 'admin.html')
    page.get_by_label('Email').fill('owner@test.local')
    page.get_by_label('Password').fill('test-password-123')
    page.get_by_role('button', name='Sign in').click()
    page.wait_for_selector('h1:has-text("Dashboard")', timeout=15000)
    page.get_by_role('button', name='Open admin menu').click()
    page.get_by_role('dialog', name='Admin menu').get_by_role('link', name=re.compile('^Orders')).click()
    page.wait_for_timeout(1200)
    check('Mobile: menu button opens navigation and switches section', page.locator('main h1').inner_text() == 'Orders')
    check('Mobile: no horizontal overflow', page.evaluate('document.documentElement.scrollWidth - innerWidth') <= 1)
    page.screenshot(path=OUT + 'admin_mobile_orders.png')
    ctx.close()
    b.close()

passed = sum(1 for r in results if r[1])
print(f'\n{passed}/{len(results)} admin checks passed')
json.dump([{'name': n, 'pass': p, 'detail': d} for n, p, d in results], open(OUT + 'admin_flow_results.json', 'w'), indent=1)
sys.exit(0 if passed == len(results) else 1)
