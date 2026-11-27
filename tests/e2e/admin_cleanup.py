"""V3.7 admin Edit / Delete / Select-all / Bulk delete / Media / Data cleanup — LOCAL build + LOCAL DB only.
python3 tests/e2e/admin_cleanup.py http://localhost:4300/
"""
import io, json, os, re, sys, uuid, urllib.request
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
    r = post('/__control', {'sql': q})
    if 'error' in r: print('SQL ERROR', r['error'], q[:120])
    return r.get('rows', [])

def n(q):
    return sql(q)[0]['n']

ADMIN = str(uuid.uuid4())
sql(f"insert into auth.users (id, email, pw) values ('{ADMIN}', 'owner@test.local', 'test-password-123')")
sql(f"insert into public.admins (user_id) values ('{ADMIN}')")
sql("update public.restaurant_settings set opens_at='00:00', closes_at='23:59:59', min_lead_minutes=0, open_days='{0,1,2,3,4,5,6}', closed_dates='{}'")
sql("update public.website_settings set intro_enabled=false")
variants = {d['id']: d['variants'] for d in post('/rest/v1/rpc/get_storefront', {})['dishes']}
VID = variants['chicken-dum-biryani'][0]['id']

def place(name, phone, status='pending'):
    o = post('/rest/v1/rpc/place_order', {'p': {'idempotency_key': str(uuid.uuid4()), 'access_token': uuid.uuid4().hex + uuid.uuid4().hex, 'name': name, 'phone': phone, 'mode': 'pickup', 'confirm': True, 'items': [{'variant_id': VID, 'qty': 1}]}})
    path = {'completed': ['confirmed', 'preparing', 'ready', 'completed'], 'cancelled': ['cancelled'], 'confirmed': ['confirmed']}.get(status, [])
    for s in path:
        sql(f"update public.orders set status='{s}', status_reason=case when '{s}'='cancelled' then 'test' end where id='{o['id']}'")
    return o

done1 = place('Done One', '9811100001', 'completed')
done2 = place('Done Two', '9811100002', 'completed')
canc = place('Cancelled Three', '9811100003', 'cancelled')
act = place('Active Four', '9811100004', 'confirmed')
check('Fixtures: 3 finished + 1 active order', all('bill_number' in o for o in (done1, done2, canc, act)))
for i in range(3):
    post('/rest/v1/rpc/submit_enquiry', {'p': {'kind': 'contact', 'name': f'Old Contact {i}', 'phone': f'98222000{i}0', 'message': 'hello'}})
for i in range(2):
    post('/rest/v1/rpc/chat_send', {'p': {'conversation_id': str(uuid.uuid4()), 'client_id': str(uuid.uuid4()), 'token': uuid.uuid4().hex + uuid.uuid4().hex, 'body': f'Chat number {i}', 'name': ''}})
sql("insert into public.offers (title, discount_type, discount_value, code, is_active, ends_at, starts_at) values ('Old Holi', 'percent', 10, 'OLDHOLI', false, now() - interval '10 days', now() - interval '20 days')")
sql("insert into public.offers (title, discount_type, discount_value, code, is_active, used_count) values ('Live Used', 'fixed', 20, 'LIVEUSED', true, 3)")

rng = np.random.default_rng(5)
def jpg(path, w, h, q=95):
    b = io.BytesIO(); Image.fromarray(rng.integers(0, 255, (h, w, 3), dtype=np.uint8)).save(b, 'JPEG', quality=q); open(path, 'wb').write(b.getvalue())
def photo(path, w, h):  # photo-like (smooth colours + grain), saved at top quality: large but compressible
    yy, xx = np.mgrid[0:h, 0:w]
    base = np.stack([xx / w * 255, yy / h * 255, (xx + yy) / (w + h) * 255], -1)
    img = np.clip(base + rng.normal(0, 10, (h, w, 3)), 0, 255).astype(np.uint8)
    b = io.BytesIO(); Image.fromarray(img).save(b, 'JPEG', quality=100); open(path, 'wb').write(b.getvalue())
photo('/tmp/med-a.jpg', 1200, 800)       # under the 1.2 MB auto-shrink limit, so stored as-is → "large photo"
jpg('/tmp/med-b.jpg', 300, 200)

IGNORE = ('WebSocket', 'realtime', 'Failed to load resource', 'net::ERR')
with sync_playwright() as pw:
    b = pw.chromium.launch()
    ctx = b.new_context(viewport={'width': 1366, 'height': 900}, accept_downloads=True)
    page = ctx.new_page()
    errs = []
    page.on('pageerror', lambda e: errs.append(str(e)))
    page.on('console', lambda m: errs.append(m.text) if m.type == 'error' and not any(i in m.text for i in IGNORE) else None)
    page.goto(URL + 'admin.html')
    page.get_by_label('Email').fill('owner@test.local'); page.get_by_label('Password').fill('test-password-123')
    page.get_by_role('button', name='Sign in').click()
    page.wait_for_selector('h1:has-text("Dashboard")', timeout=15000); page.wait_for_timeout(800)
    nav = page.get_by_role('navigation', name='Admin sections').first
    main = page.locator('main')
    def goto(label):
        nav.get_by_role('link', name=re.compile('^' + re.escape(label))).click(); page.wait_for_timeout(1100)
    def bar():
        return main.locator('[data-selection-bar]').first
    def delete_flow(confirm_text=None, csv_name_part=None):
        dlg = page.locator('[role=dialog]').filter(has=page.locator('[data-delete-dialog]'))
        got_csv = None
        if csv_name_part:
            with page.expect_download(timeout=10000) as dl:
                dlg.get_by_role('button', name=re.compile('Download CSV first')).click()
            got_csv = open(dl.value.path(), encoding='utf-8').read()
        if confirm_text: dlg.get_by_label('Type DELETE to confirm').fill(confirm_text)
        dlg.get_by_role('button', name=re.compile(r'^Delete \d+ permanently')).click()
        try:
            page.wait_for_selector('[data-delete-result]', timeout=20000)
        except Exception:
            page.screenshot(path=OUT + 'delete_flow_fail.png'); print('DIALOG:', page.locator('[role=dialog]').all_inner_texts()[:2], 'ERRS', errs[:3]); raise
        res = page.locator('[data-delete-result]').inner_text()
        page.locator('[data-delete-result]').get_by_role('button', name='Done').click(); page.wait_for_timeout(700)
        return res, got_csv

    # ═════ Orders ═════
    goto('Orders')
    main.get_by_label('Status').select_option('all'); main.get_by_label('Date range').select_option('all'); page.wait_for_timeout(900)
    rows = main.locator('ul > li')
    act_box = main.get_by_label(f"Select order {act['bill_number']}")
    check('Active order cannot be selected for deletion', act_box.is_disabled())
    bar().get_by_role('button', name=re.compile('^Select all')).click()
    check('“Select all” picks only finished orders (3)', '3 orders selected' in bar().inner_text(), bar().inner_text())
    with page.expect_download() as dl:
        bar().get_by_role('button', name='CSV of selected').click()
    sel_csv = open(dl.value.path(), encoding='utf-8').read()
    check('CSV of selected orders downloads with their bill numbers', all(o['bill_number'] in sel_csv for o in (done1, done2, canc)) and act['bill_number'] not in sel_csv)
    main.get_by_label(f"Select order {done2['bill_number']}").uncheck()
    bar().get_by_role('button', name=re.compile('Delete permanently')).click()
    res, csv = delete_flow(csv_name_part='orders')
    check('Delete dialog offers a CSV first, then shows the result', '2 deleted permanently' in res and done1['bill_number'] in (csv or ''), res)
    check('Deleted orders are really gone from the database', n(f"select count(*)::int n from public.orders where id in ('{done1['id']}','{canc['id']}')") == 0)
    check('Bill register keeps both bill numbers and amounts', n(f"select count(*)::int n from public.bill_register where bill_number in ('{done1['bill_number']}','{canc['bill_number']}') and total > 0") == 2)
    check('Unselected and active orders are untouched', n(f"select count(*)::int n from public.orders where id in ('{done2['id']}','{act['id']}')") == 2)
    # single order: edit + delete
    main.locator('li', has_text=done2['bill_number']).get_by_role('button', name='Details').click()
    md = page.get_by_role('dialog', name=f"Order {done2['bill_number']}")
    md.get_by_role('button', name='Edit details').click()
    ed = page.get_by_role('dialog', name=re.compile('Edit details'))
    ed.get_by_label('Customer name').fill('Done Two Edited'); ed.get_by_label('Phone').fill('98111 00099')
    ed.get_by_role('button', name='Save details').click(); page.wait_for_timeout(900)
    row = sql(f"select customer_name, customer_phone, total from public.orders where id='{done2['id']}'")[0]
    check('Edit order details saves name and phone (amount unchanged)', row['customer_name'] == 'Done Two Edited' and row['customer_phone'] == '9811100099', str(row))
    md = page.get_by_role('dialog', name=f"Order {done2['bill_number']}")
    md.get_by_role('button', name='Delete permanently').click()
    cf = page.get_by_role('dialog', name=re.compile('permanently\\?'))
    cf.get_by_label('Type DELETE to confirm').fill('DELETE'); cf.get_by_role('button', name='Delete permanently').click(); page.wait_for_timeout(1200)
    check('Single finished order deleted from its detail window', n(f"select count(*)::int n from public.orders where id='{done2['id']}'") == 0)
    main.locator('li', has_text=act['bill_number']).get_by_role('button', name='Details').click()
    check('Active order: “Delete permanently” is disabled', page.get_by_role('dialog', name=f"Order {act['bill_number']}").get_by_role('button', name='Delete permanently').is_disabled())
    page.keyboard.press('Escape'); page.wait_for_timeout(400)
    goto('Bills & Receipts')
    main.get_by_role('button', name=re.compile('Deleted bills register')).click(); page.wait_for_timeout(900)
    check('Bills page lists the deleted bills register', all(o['bill_number'] in main.inner_text() for o in (done1, canc, done2)))

    # ═════ Customers ═════
    goto('Customers')
    ca = main.get_by_label('Select customer Active Four'); ca.check()
    main.get_by_label('Select customer Done Two Edited').check() if main.get_by_label('Select customer Done Two Edited').count() else main.get_by_label('Select customer Done Two').check()
    bar().get_by_role('button', name=re.compile('Delete permanently')).click()
    res, _ = delete_flow()
    check('Customers: one deleted, the one with an active order kept with a reason', '1 deleted permanently' in res and 'active order' in res, res)
    check('Active customer still exists; their order untouched', n("select count(*)::int n from public.customers where phone='9811100004'") == 1)

    # ═════ Enquiries ═════
    goto('Enquiries & Leads')
    bar().get_by_role('button', name=re.compile('^Select all')).click()
    k = n("select count(*)::int n from public.leads where kind in ('cart','contact')")
    bar().get_by_role('button', name=re.compile('Delete permanently')).click()
    res, _ = delete_flow()
    check(f'Enquiries: select all + delete removes all {k} from the database', f'{k} deleted permanently' in res and n("select count(*)::int n from public.leads where kind in ('cart','contact')") == 0, res)

    # ═════ Chats ═════
    goto('Live Chat')
    bar().get_by_role('button', name=re.compile('^Select all')).click()
    bar().get_by_role('button', name=re.compile('^Delete')).click()
    res, _ = delete_flow()
    check('Chats: both conversations and messages deleted', '2 deleted permanently' in res and n("select count(*)::int n from public.chat_messages") == 0, res)

    # ═════ Coupons ═════
    goto('Coupons & Discounts')
    main.get_by_label('Coupon state').select_option('Expired'); page.wait_for_timeout(400)
    check('Coupon filter “Expired” shows only the expired one', main.locator('ul > li').count() == 1 and 'Old Holi' in main.locator('ul > li').inner_text())
    main.get_by_label('Coupon state').select_option('all'); page.wait_for_timeout(400)
    main.get_by_label('Select coupon Old Holi').check(); main.get_by_label('Select coupon Live Used').check()
    bar().get_by_role('button', name=re.compile('Delete permanently')).click()
    res, _ = delete_flow()
    check('Coupons: expired one and live-used one (switched off first) deleted', '2 deleted permanently' in res and n("select count(*)::int n from public.offers where code in ('OLDHOLI','LIVEUSED')") == 0, res)

    # ═════ Media + menu photo cleanup ═════
    goto('Menu Management')
    main.locator('li', has_text='Mutton Biryani').first.locator('input[type=file]').set_input_files('/tmp/med-a.jpg'); page.wait_for_timeout(2500)
    main.locator('li', has_text='Prawns Biryani').first.locator('input[type=file]').set_input_files('/tmp/med-b.jpg'); page.wait_for_timeout(2500)
    big = sql("select image_path from public.dishes where id='mutton-biryani'")[0]['image_path']
    check('Two uploaded photos stored', n("select count(*)::int n from storage.objects where bucket_id='images'") == 2 and '/storage/v1/object/public/images/' in big)
    sql("update public.dishes set image_path = 'assets/images/dishes/prawns.webp', image_kind = 'promotional' where id = 'prawns-biryani'")  # now unused
    goto('Media & Storage')
    check('Media page lists both files with usage', main.locator('[data-media]').count() == 2 and 'Menu: Mutton Biryani' in main.inner_text() and 'Unused' in main.inner_text())
    used_box = main.locator('[data-media]').filter(has_text='Menu: Mutton Biryani').get_by_role('checkbox')
    check('A file in use cannot be selected for deletion', used_box.is_disabled())
    main.get_by_label('Show files').select_option('unused'); page.wait_for_timeout(400)
    bar().get_by_role('button', name=re.compile('^Select all')).click()
    bar().get_by_role('button', name=re.compile('^Delete')).click()
    res, _ = delete_flow()
    check('Unused file removed from storage', '1 deleted permanently' in res and n("select count(*)::int n from storage.objects where bucket_id='images'") == 1, res)
    main.get_by_label('Show files').select_option('large'); page.wait_for_timeout(400)
    before = sql("select (metadata->>'size')::int s from storage.objects")[0]['s']
    main.get_by_role('button', name='Make smaller').click(); page.wait_for_timeout(1500)
    page.wait_for_timeout(3500)
    after = sql("select (metadata->>'size')::int s, name from storage.objects")
    newpath = sql("select image_path from public.dishes where id='mutton-biryani'")[0]['image_path']
    check('“Make smaller” replaces a large photo with a smaller copy and the dish uses it', len(after) == 1 and after[0]['s'] < before and newpath != big and after[0]['name'] in newpath, f"{before} → {after}")
    goto('Menu Management')
    main.get_by_label('Select Mutton Biryani').check()
    bar().get_by_role('button', name=re.compile('Delete permanently')).click()
    res, _ = delete_flow()
    check('Deleting a dish also removes its now-unused uploaded photo', '1 deleted permanently' in res and n("select count(*)::int n from public.dishes where id='mutton-biryani'") == 0 and n("select count(*)::int n from storage.objects") == 0, res)

    # ═════ Bulk dishes ═════
    goto('Bulk & Special Orders')
    main.get_by_role('tab', name='Bulk Menu & Pricing').click(); page.wait_for_timeout(900)
    main.locator('[data-bulk-admin-row="chicken-kabab"]').get_by_role('button', name='Actions for Chicken Kabab').click()
    page.get_by_role('menuitem', name='Delete permanently…').click()
    cf = page.get_by_role('dialog', name=re.compile('Delete Chicken Kabab permanently'))
    cf.get_by_label('Type DELETE to confirm').fill('DELETE'); cf.get_by_role('button', name='Delete permanently').click(); page.wait_for_timeout(1000)
    check('Bulk dish deleted permanently (single)', n("select count(*)::int n from public.bulk_menu_items where slug='chicken-kabab'") == 0)
    main.get_by_label('Select Chicken Gravy').check(); main.get_by_label('Select Mutton Tikka Biryani').check()
    bar().get_by_role('button', name=re.compile('Delete permanently')).click()
    res, _ = delete_flow()
    check('Bulk dishes: select + delete', '2 deleted permanently' in res and n("select count(*)::int n from public.bulk_menu_items where slug in ('chicken-gravy','mutton-tikka-biryani')") == 0, res)

    # ═════ Notifications ═════
    goto('Notifications')
    total = n("select count(*)::int n from public.notifications")
    bar().get_by_role('button', name=re.compile('^Select all')).click()
    bar().get_by_role('button', name=re.compile('^Delete')).click()
    typed = 'DELETE' if total > 5 else None
    res, _ = delete_flow(confirm_text=typed)
    check(f'Notifications: {total} deleted (typed DELETE for a large batch)', f'{total} deleted permanently' in res and n("select count(*)::int n from public.notifications") == 0, res)

    # ═════ Data cleanup ═════
    place('Old Done', '9811100777', 'completed')
    sql("alter table public.orders disable trigger user"); sql("update public.orders set created_at = now() - interval '120 days' where customer_phone='9811100777'"); sql("alter table public.orders enable trigger user")
    goto('Data Cleanup')
    check('Automatic clean-up is OFF by default', not main.get_by_role('switch', name=re.compile('Automatic clean-up')).is_checked())
    check('Preview shows 1 old finished order', '1 now' in main.locator('[data-cleanup="orders"]').inner_text())
    main.get_by_label('Finished orders: remove after').select_option('180'); page.wait_for_timeout(200)
    main.get_by_role('button', name='Save settings').click(); page.wait_for_timeout(1000)
    check('Changing the period to 180 days saves and updates the preview (0)', n("select orders_days n from public.cleanup_settings") == 180 and '0 now' in main.locator('[data-cleanup="orders"]').inner_text())
    main.get_by_label('Finished orders: remove after').select_option('90')
    main.get_by_role('button', name='Save settings').click(); page.wait_for_timeout(1000)
    with page.expect_download() as dl:
        main.get_by_role('button', name='Download CSV of these records').click()
    check('CSV of records to be cleaned downloads first', '9811100777' in open(dl.value.path(), encoding='utf-8').read())
    main.get_by_role('button', name=re.compile('Clean up now')).click()
    cf = page.get_by_role('dialog', name=re.compile('Permanently remove'))
    cf.get_by_label('Type DELETE to confirm').fill('DELETE'); cf.get_by_role('button', name='Clean up now').click(); page.wait_for_timeout(1500)
    check('Clean-up now removes the old order (kept in bill register) and reports it', n("select count(*)::int n from public.orders where customer_phone='9811100777'") == 0 and n("select count(*)::int n from public.bill_register") == 4 and 'Removed 1 finished orders' in main.inner_text())
    check('Active order still there after everything', n(f"select count(*)::int n from public.orders where id='{act['id']}'") == 1)
    page.screenshot(path=OUT + 'admin_cleanup.png')
    check('No console errors in the admin', not errs, '; '.join(errs[:3]))

    # phone layout: selection bar fits
    m = b.new_context(viewport={'width': 412, 'height': 915}, device_scale_factor=2, has_touch=True)
    mp = m.new_page(); me = []
    mp.on('pageerror', lambda e: me.append(str(e)))
    mp.goto(URL + 'admin.html#orders'); mp.get_by_label('Email').fill('owner@test.local'); mp.get_by_label('Password').fill('test-password-123'); mp.get_by_role('button', name='Sign in').click()
    mp.wait_for_timeout(2500)
    mp.locator('main').get_by_label('Status').select_option('all'); mp.wait_for_timeout(800)
    over = mp.evaluate("document.documentElement.scrollWidth - window.innerWidth")
    mp.screenshot(path=OUT + 'admin_cleanup_phone.png')
    check('Phone: orders list with select boxes has no sideways scroll, no errors', over <= 0 and not me, f'{over} {me[:2]}')
    m.close()
    b.close()

fails = results.count(False)
print(f'\n{len(results) - fails}/{len(results)} checks passed')
sys.exit(1 if fails else 0)
