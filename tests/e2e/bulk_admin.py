"""V3.6 Bulk & Special Orders — admin side. LOCAL build + LOCAL database only (never production).
python3 tests/e2e/bulk_admin.py http://localhost:4300/
"""
import datetime, io, json, os, re, sys, uuid, urllib.request
import numpy as np
from PIL import Image
from playwright.sync_api import sync_playwright

URL = sys.argv[1].rstrip('/') + '/'
assert URL.startswith('http://localhost'), 'local only'
API = 'http://localhost:54400'
OUT = 'tests/output/'
os.makedirs(OUT, exist_ok=True)
results = []

def check(name, cond, detail=''):
    results.append(bool(cond))
    print(('PASS ' if cond else 'FAIL ') + name + (f' — {detail}' if detail else ''), flush=True)

def post(path, body):
    req = urllib.request.Request(API + path, data=json.dumps(body).encode(), headers={'content-type': 'application/json', 'apikey': 'x'}, method='POST')
    try:
        return json.loads(urllib.request.urlopen(req, timeout=15).read() or b'null')
    except urllib.error.HTTPError as e:
        return {'http_error': e.code, 'body': e.read().decode()[:300]}

def sql(q):
    return post('/__control', {'sql': q}).get('rows', [])

def ist(hours):
    t = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=5.5 + hours)
    return t.strftime('%Y-%m-%d'), t.strftime('%H:%M')

def store():
    return post('/rest/v1/rpc/get_storefront', {})['bulk']

ADMIN = str(uuid.uuid4())
sql(f"insert into auth.users (id, email, pw) values ('{ADMIN}', 'owner@test.local', 'test-password-123')")
sql(f"insert into public.admins (user_id) values ('{ADMIN}')")
sql("update public.restaurant_settings set opens_at='00:00', closes_at='23:59:59', open_days='{0,1,2,3,4,5,6}', closed_dates='{}'")
sql("update public.website_settings set intro_enabled=false")
ids = {r['slug']: r['id'] for r in sql("select slug, id::text from public.bulk_menu_items")}

# fixtures: one V3.6 multi-dish enquiry through the real function, one from the old single-variety form
d, t = ist(30)
v2 = post('/rest/v1/rpc/submit_bulk_enquiry', {'p': {'idempotency_key': str(uuid.uuid4()), 'name': 'Sharma Wedding', 'phone': '9822222222', 'mode': 'delivery',
          'event_type': 'Wedding / engagement', 'date': d, 'time': '13:30', 'instructions': 'Pack in 2 kg handis', 'consent': True,
          'items': [{'id': ids['chicken-dum-biryani'], 'kg': 5}, {'id': ids['chicken-gravy'], 'kg': 2}, {'id': ids['veg-paneer-biryani'], 'kg': 3}]}})
check('Fixture: multi-dish enquiry priced by the database (₹7,800)', float(v2.get('estimated_total', 0)) == 7800, str(v2)[:160])
old = post('/rest/v1/rpc/submit_enquiry', {'p': {'kind': 'bulk', 'name': 'Old Form Family', 'phone': '9833333334', 'message': '8 kg', 'payload': {'kg': 8, 'variety': 'Paneer Biryani', 'mode': 'pickup', 'date': d, 'time': '12:00', 'eventType': 'Birthday'}}})
check('Fixture: old single-variety enquiry still accepted', 'id' in old, str(old)[:120])
rej = post('/rest/v1/rpc/submit_bulk_enquiry', {'p': {'idempotency_key': str(uuid.uuid4()), 'name': 'Late Request', 'phone': '9844444444', 'mode': 'pickup',
          'event_type': 'Other', 'date': d, 'time': '13:00', 'instructions': '', 'consent': True, 'items': [{'id': ids['mutton-biryani'], 'kg': 4}]}})

rng = np.random.default_rng(3)
buf = io.BytesIO(); Image.fromarray(rng.integers(0, 255, (2400, 3200, 3), dtype=np.uint8)).save(buf, 'JPEG', quality=95)
open('/tmp/bulk-photo.jpg', 'wb').write(buf.getvalue())

IGNORE = ('WebSocket', 'realtime', 'Failed to load resource', 'net::ERR')
with sync_playwright() as pw:
    b = pw.chromium.launch()
    ctx = b.new_context(viewport={'width': 1366, 'height': 900}, accept_downloads=True)
    page = ctx.new_page()
    errs, uploads = [], []
    page.on('pageerror', lambda e: errs.append(str(e)))
    page.on('console', lambda m: errs.append(m.text) if m.type == 'error' and not any(i in m.text for i in IGNORE) else None)
    page.on('request', lambda r: uploads.append(r.url) if '/storage/v1/object/images/bulk/' in r.url and r.method in ('POST', 'PUT') else None)
    page.goto(URL + 'admin.html')
    page.get_by_label('Email').fill('owner@test.local'); page.get_by_label('Password').fill('test-password-123')
    page.get_by_role('button', name='Sign in').click()
    page.wait_for_selector('h1:has-text("Dashboard")', timeout=15000); page.wait_for_timeout(1000)
    nav = page.get_by_role('navigation', name='Admin sections').first
    link = nav.get_by_role('link', name=re.compile('^Bulk & Special Orders'))
    check('Admin navigation renamed “Bulk & Special Orders”', link.count() == 1)
    link.click(); page.wait_for_timeout(1200)
    main = page.locator('main')
    check('Two tabs: Bulk Menu & Pricing / Bulk Order Enquiries', main.get_by_role('tab', name='Bulk Menu & Pricing').count() == 1 and main.get_by_role('tab', name='Bulk Order Enquiries').count() == 1)

    # ═════ Tab B: enquiries ═════
    main.get_by_role('tab', name='Bulk Order Enquiries').click(); page.wait_for_timeout(900)
    card = main.locator('li', has_text='Sharma Wedding').first
    ct = card.inner_text()
    check('Enquiry shows each dish, kg, ₹/kg at submission and line estimate', all(x in ct for x in ['Chicken Dum Biryani', '₹800', '₹4,000', 'Chicken Gravy', '₹700', '₹1,400', 'Veg Vegetable Paneer Biryani', '₹2,400']), ct[:300].replace('\n', ' | '))
    check('Enquiry shows total kg and estimated total', '10 kg' in ct and '₹7,800' in ct)
    check('Enquiry shows event, preferred date/time, delivery and instructions', 'Wedding / engagement' in ct and '1:30 PM' in ct and 'Delivery' in ct and 'Pack in 2 kg handis' in ct)
    check('Contact buttons (Call / WhatsApp) present', card.get_by_role('link', name='Call').count() == 1 and card.get_by_role('link', name='WhatsApp').count() == 1)
    oldc = main.locator('li', has_text='Old Form Family').first
    check('Old single-variety enquiry is still readable', '8 kg' in oldc.inner_text() and 'Paneer Biryani' in oldc.inner_text() and 'older enquiry form' in oldc.inner_text())
    check('Convert is disabled until a quotation is saved', card.get_by_role('button', name='Convert to order').is_disabled())
    card.get_by_role('button', name=re.compile('^Use estimate')).click()
    check('“Use estimate” fills ₹7,800', card.get_by_label(re.compile('Final quotation')).input_value() == '7800')
    card.get_by_label(re.compile('Final quotation')).fill('7500')
    card.get_by_role('button', name='Save quote').click(); page.wait_for_timeout(900)
    check('Final quotation saved (₹7,500)', float(sql("select quote_amount from public.leads where name='Sharma Wedding'")[0]['quote_amount']) == 7500)
    card.get_by_role('button', name='Confirm quotation').click(); page.wait_for_timeout(800)
    check('Quotation confirmed', sql("select status from public.leads where name='Sharma Wedding'")[0]['status'] == 'confirmed')
    card.get_by_role('button', name='Convert to order').click()
    page.get_by_role('dialog', name=re.compile('Create an order')).get_by_role('button', name='Create order').click()
    page.wait_for_selector('text=Share this private link', timeout=10000)
    conv = sql("select o.id, o.bill_number, o.total, o.subtotal, o.discount, o.source from public.orders o join public.leads l on l.converted_order_id = o.id where l.name='Sharma Wedding'")
    check('Converted into a real order with a bill number; total = quotation', len(conv) == 1 and re.match(r'^DBH-\d{8}-\d{4}$', conv[0]['bill_number']) and float(conv[0]['total']) == 7500 and float(conv[0]['discount']) == 300 and conv[0]['source'] == 'bulk', str(conv))
    items = sql(f"select dish_name, qty, unit_price::float, line_total::float from public.order_items where order_id='{conv[0]['id']}' order by sort_order") if conv else []
    check('Receipt lines: one per dish (kg × ₹/kg)', [(i['dish_name'], i['qty'], i['unit_price']) for i in items] == [('Bulk: Chicken Dum Biryani', 5, 800.0), ('Bulk: Chicken Gravy', 2, 700.0), ('Bulk: Veg Vegetable Paneer Biryani', 3, 800.0)], str(items))
    check('Receipt snapshot exists for the bill', sql(f"select count(*)::int n from public.receipts where order_id='{conv[0]['id']}'")[0]['n'] == 1 if conv else False)
    page.keyboard.press('Escape'); page.wait_for_timeout(600)
    card = main.locator('li', has_text='Sharma Wedding').first
    check('Converted enquiry shows “Converted” and no second convert button', 'Converted into an order' in card.inner_text() and card.get_by_role('button', name='Convert to order').count() == 0)
    lr = main.locator('li', has_text='Late Request').first
    lr.get_by_role('button', name=re.compile('^Reject')).click()
    page.get_by_role('dialog', name=re.compile('Reject this bulk enquiry')).get_by_role('button', name='Reject enquiry').click(); page.wait_for_timeout(900)
    lr = main.locator('li', has_text='Late Request').first
    check('Reject marks the enquiry rejected; convert stays disabled', sql("select status from public.leads where name='Late Request'")[0]['status'] == 'rejected' and lr.get_by_role('button', name='Convert to order').is_disabled())
    main.get_by_label('Enquiry status filter').select_option('rejected'); page.wait_for_timeout(500)
    check('Status filter shows only rejected enquiries', main.locator('ul > li').count() == 1)
    main.get_by_label('Enquiry status filter').select_option('all'); page.wait_for_timeout(500)
    with page.expect_download(timeout=15000) as dl:
        main.get_by_role('button', name='Export CSV').click()
    csv = open(dl.value.path(), encoding='utf-8').read()
    check('CSV export: one row per dish with price at submission', dl.value.suggested_filename.startswith('dawat-bulk-enquiries-') and csv.count('Sharma Wedding') == 3 and 'Chicken Gravy' in csv and 'Old Form Family' in csv)

    # ═════ Tab A: menu & pricing ═════
    main.get_by_role('tab', name='Bulk Menu & Pricing').click(); page.wait_for_timeout(1200)
    rows = main.locator('[data-bulk-admin-row]')
    check('All 12 bulk dishes listed (incl. hidden Malai Tikka)', rows.count() == 12, str(rows.count()))
    mal = main.locator('[data-bulk-admin-row="chicken-malai-tikka-biryani"]')
    check('Malai Tikka shows “Hidden” and the unit-confirmation note', 'Hidden' in mal.inner_text() and 'confirm the unit' in mal.inner_text())
    check('Prices listed per kg', '₹800' in main.locator('[data-bulk-admin-row="chicken-dum-biryani"]').inner_text() and '₹1,800' in main.locator('[data-bulk-admin-row="mutton-tikka-biryani"]').inner_text())

    # edit price
    main.locator('[data-bulk-admin-row="chicken-dum-biryani"]').get_by_role('button', name='Edit', exact=True).click()
    dlg = page.get_by_role('dialog', name=re.compile('Edit bulk dish — Chicken Dum Biryani'))
    dlg.get_by_label('Price per kg (₹)').fill('0'); page.wait_for_timeout(200)
    check('Invalid price: clear message and Save disabled', 'Enter a price per kg' in dlg.inner_text() and dlg.get_by_role('button', name='Save changes').is_disabled())
    dlg.get_by_label('Min kg').fill('10'); dlg.get_by_label('Max kg').fill('5'); page.wait_for_timeout(200)
    check('Min > max is refused with a message', 'minimum ≤ maximum' in dlg.inner_text())
    dlg.get_by_label('Min kg').fill('1'); dlg.get_by_label('Max kg').fill('20')
    dlg.get_by_label('Price per kg (₹)').fill('850'); page.wait_for_timeout(200)
    check('Customer preview updates (5 kg = ₹4,250)', '5 kg = ₹4,250' in dlg.get_by_label('Customer preview').inner_text())
    dlg.get_by_role('button', name='Save changes').click(); page.wait_for_timeout(1200)
    check('New price saved in the database', float(sql("select price_per_kg from public.bulk_menu_items where slug='chicken-dum-biryani'")[0]['price_per_kg']) == 850)
    check('Storefront shows the new price at once', any(float(i['price_per_kg']) == 850 for i in store()['items'] if i['slug'] == 'chicken-dum-biryani'))
    check('Earlier enquiry keeps its submitted price (₹800)', float(sql("select payload->'items'->0->>'price_per_kg' p from public.leads where name='Sharma Wedding'")[0]['p']) == 800)
    check('Converted bill keeps its amount', float(sql(f"select total from public.orders where id='{conv[0]['id']}'")[0]['total']) == 7500 if conv else False)
    check('Price change written to the audit log', sql("select count(*)::int n from public.audit_logs where entity='bulk_menu_items' and details ? 'price_per_kg'")[0]['n'] >= 1)

    # availability toggles
    mal.locator('label', has_text='On website').first.click(); page.wait_for_timeout(900)
    check('Switching on Malai Tikka publishes it (12 on website)', len(store()['items']) == 12)
    mal.locator('label', has_text='On website').first.click(); page.wait_for_timeout(900)
    check('Switching it off hides it again (11)', len(store()['items']) == 11)
    kb = main.locator('[data-bulk-admin-row="chicken-kabab"]')
    kb.locator('label', has_text='Sold out').first.click(); page.wait_for_timeout(900)
    check('Sold out reaches the storefront', any(i['is_sold_out'] for i in store()['items'] if i['slug'] == 'chicken-kabab'))
    kb.locator('label', has_text='Sold out').first.click(); page.wait_for_timeout(700)

    # photo
    main.locator('[data-bulk-admin-row="chicken-kabab"] input[type=file]').set_input_files('/tmp/bulk-photo.jpg'); page.wait_for_timeout(4500)
    ph = sql("select image_path, image_kind from public.bulk_menu_items where slug='chicken-kabab'")[0]
    check('Photo upload from the row saves a real photo (bulk folder)', '/storage/v1/object/public/images/bulk/' in (ph['image_path'] or '') and ph['image_kind'] == 'photo' and uploads, str(ph))

    # reorder
    before = [i['slug'] for i in store()['items']][:2]
    main.get_by_role('button', name='Move Chicken Tikka Biryani up').click(); page.wait_for_timeout(1500)
    after = [i['slug'] for i in store()['items']][:2]
    check('Reordering changes the website order', before == ['chicken-dum-biryani', 'chicken-tikka-biryani'] and after == ['chicken-tikka-biryani', 'chicken-dum-biryani'], f'{before} → {after}')

    # add / archive / restore
    main.get_by_role('button', name='Add bulk dish').click()
    ad = page.get_by_role('dialog', name='Add a bulk dish')
    ad.get_by_label('Dish name').fill('Mutton Kheema')
    ad.get_by_label('Category').select_option('mutton')
    ad.get_by_label('Price per kg (₹)').fill('1500')
    ad.get_by_role('button', name='Add dish').click(); page.wait_for_timeout(1200)
    new = sql("select slug, is_available, price_per_kg from public.bulk_menu_items where name='Mutton Kheema'")
    check('New bulk dish added (hidden, slug made from the name)', len(new) == 1 and new[0]['slug'] == 'mutton-kheema' and new[0]['is_available'] is False and float(new[0]['price_per_kg']) == 1500, str(new))
    ed = page.get_by_role('dialog', name=re.compile('Edit bulk dish — Mutton Kheema'))
    check('Editor opens for the new dish', ed.count() == 1)
    ed.locator('label', has_text='Show on website').first.click()
    ed.get_by_role('button', name='Save changes').click(); page.wait_for_timeout(1200)
    check('New dish published after “Show on website”', any(i['slug'] == 'mutton-kheema' for i in store()['items']))
    main.locator('[data-bulk-admin-row="mutton-kheema"]').get_by_role('button', name='Actions for Mutton Kheema').click()
    page.get_by_role('menuitem', name='Archive…').click()
    page.get_by_role('dialog', name=re.compile('Archive Mutton Kheema')).get_by_role('button', name='Archive').click(); page.wait_for_timeout(1000)
    check('Archive removes it from the website, record kept', not any(i['slug'] == 'mutton-kheema' for i in store()['items']) and sql("select archived_at is not null a from public.bulk_menu_items where slug='mutton-kheema'")[0]['a'])
    main.get_by_label('Availability').select_option('archived'); page.wait_for_timeout(500)
    check('Archived filter lists it', main.locator('[data-bulk-admin-row="mutton-kheema"]').count() == 1)
    main.locator('[data-bulk-admin-row="mutton-kheema"]').get_by_role('button', name='Actions for Mutton Kheema').click()
    page.get_by_role('menuitem', name=re.compile('^Restore')).click(); page.wait_for_timeout(900)
    check('Restore brings it back hidden', sql("select archived_at is null and not is_available r from public.bulk_menu_items where slug='mutton-kheema'")[0]['r'])
    main.get_by_label('Availability').select_option('active')

    # filters
    main.get_by_label('Category').select_option('vegetarian'); page.wait_for_timeout(400)
    nveg = rows.count()
    main.get_by_label('Category').select_option('all')
    main.get_by_placeholder('Search bulk dishes').fill('tikka'); page.wait_for_timeout(400)
    ntik = rows.count()
    main.get_by_placeholder('Search bulk dishes').fill('')
    main.get_by_label('Availability').select_option('hidden'); page.wait_for_timeout(400)
    nhid = rows.count()
    main.get_by_label('Availability').select_option('active')
    check('Admin filters: category (2 veg), search (“tikka” 4), availability (2 hidden)', nveg == 2 and ntik == 4 and nhid == 2, f'{nveg} {ntik} {nhid}')

    # menu-wide rules
    main.get_by_label('Maximum total kilograms per enquiry').fill('30')
    main.get_by_role('button', name='Save limit').click(); page.wait_for_timeout(800)
    check('Menu-wide total limit saved (30 kg) and published', sql("select bulk_max_total_kg n from public.restaurant_settings")[0]['n'] == 30 and store()['max_total_kg'] == 30)
    main.get_by_text('Apply one quantity & notice rule to every bulk dish').click()
    main.get_by_label('Notice above that (hours)').fill('3')
    main.get_by_role('button', name='Apply to all…').click()
    page.get_by_role('dialog', name=re.compile('Apply this rule')).get_by_role('button', name='Apply to all').click(); page.wait_for_timeout(1200)
    check('Rule applied to every active bulk dish (3 h notice)', sql("select count(*)::int n from public.bulk_menu_items where archived_at is null and advance_notice_hours <> 3")[0]['n'] == 0)
    page.screenshot(path=OUT + 'bulk_admin_menu.png')
    check('No console errors in the admin', not errs, '; '.join(errs[:3]))

    # phone-size admin
    m = b.new_context(viewport={'width': 412, 'height': 915}, device_scale_factor=2, has_touch=True)
    mp = m.new_page(); me = []
    mp.on('pageerror', lambda e: me.append(str(e)))
    mp.goto(URL + 'admin.html'); mp.get_by_label('Email').fill('owner@test.local'); mp.get_by_label('Password').fill('test-password-123'); mp.get_by_role('button', name='Sign in').click()
    mp.wait_for_selector('h1:has-text("Dashboard")', timeout=15000)
    mp.get_by_role('button', name='Open admin menu').click()
    mp.get_by_role('dialog', name='Admin menu').get_by_role('link', name=re.compile('^Bulk & Special')).click(); mp.wait_for_timeout(1200)
    over = mp.evaluate("document.documentElement.scrollWidth - window.innerWidth")
    mp.screenshot(path=OUT + 'bulk_admin_phone.png')
    check('Phone: bulk admin has no sideways scrolling and no errors', over <= 0 and not me, f'{over} {me[:2]}')
    m.close()
    b.close()

fails = results.count(False)
print(f'\n{len(results) - fails}/{len(results)} checks passed')
sys.exit(1 if fails else 0)
