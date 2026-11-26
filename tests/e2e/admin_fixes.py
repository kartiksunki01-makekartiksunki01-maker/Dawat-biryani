"""V3.5 admin fixes — LOCAL build + LOCAL database only (never production).
  1. Open orders from earlier days are listed (the red Orders badge and the list agree).
  2. Opening a chat also clears its bell notification (no phantom red badge).
  3. Dish photos: one-tap upload from the menu row, big Add/Change button in the edit form, big phone photos shrink automatically.
python3 tests/e2e/admin_fixes.py http://localhost:4300/
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
    return post('/__control', {'sql': q}).get('rows', [])

def num(text):
    m = re.findall(r'\d+', text or '')
    return int(m[-1]) if m else 0

ADMIN = str(uuid.uuid4())
sql(f"insert into auth.users (id, email, pw) values ('{ADMIN}', 'owner@test.local', 'test-password-123')")
sql(f"insert into public.admins (user_id) values ('{ADMIN}')")
sql("update public.restaurant_settings set opens_at='00:00', closes_at='23:59:59', min_lead_minutes=0")
sql("update public.website_settings set intro_enabled=false")
sql("delete from public.chat_conversations")

# ── fixtures: an open order placed "yesterday" and a visitor chat message ──
variants = {d['id']: d['variants'] for d in post('/rest/v1/rpc/get_storefront', {})['dishes']}
o = post('/rest/v1/rpc/place_order', {'p': {'idempotency_key': str(uuid.uuid4()), 'access_token': uuid.uuid4().hex + uuid.uuid4().hex, 'name': 'Old Pending Order', 'phone': '9811111111',
     'mode': 'pickup', 'confirm': True, 'items': [{'variant_id': variants['mutton-biryani'][0]['id'], 'qty': 1}]}})
check('Fixture order placed through the real database function', 'bill_number' in o, str(o)[:150])
# local test database only: the real database refuses to change an order's date, so lift that guard for this one fixture row
sql("alter table public.orders disable trigger user; update public.orders set created_at = created_at - interval '1 day', order_date = order_date - 1 where customer_name = 'Old Pending Order'; alter table public.orders enable trigger user")
conv = str(uuid.uuid4())
c = post('/rest/v1/rpc/chat_send', {'p': {'conversation_id': conv, 'client_id': str(uuid.uuid4()), 'token': uuid.uuid4().hex + uuid.uuid4().hex, 'body': 'Ohh, I loved the website', 'name': ''}})
check('Fixture chat message created through the real database function', 'http_error' not in c, str(c)[:150])
check('Fixture: chat notification exists and is unread', sql("select count(*)::int n from public.notifications where kind='new_chat'")[0]['n'] == 1)
check('Fixture: the order is yesterday and still pending', sql("select count(*)::int n from public.orders where status='pending' and order_date < (now() at time zone 'Asia/Kolkata')::date")[0]['n'] == 1)

# test pictures
rng = np.random.default_rng(7)
big = io.BytesIO()
Image.fromarray(rng.integers(0, 255, (3000, 4000, 3), dtype=np.uint8)).save(big, 'JPEG', quality=96)
open('/tmp/big-phone-photo.jpg', 'wb').write(big.getvalue())
small = io.BytesIO()
Image.fromarray(rng.integers(0, 255, (200, 300, 3), dtype=np.uint8)).save(small, 'PNG')
open('/tmp/small-dish.png', 'wb').write(small.getvalue())
open('/tmp/not-a-picture.jpg', 'wb').write(b'this is just text, not a picture')
check('Test photo is a realistic big phone photo (> 5 MB)', len(big.getvalue()) > 5 * 1024 * 1024, f'{len(big.getvalue()) / 1048576:.1f} MB')

IGNORE = ('WebSocket', 'realtime', 'Failed to load resource', 'net::ERR')
uploads = []
with sync_playwright() as pw:
    b = pw.chromium.launch()
    ctx = b.new_context(viewport={'width': 1366, 'height': 860})
    page = ctx.new_page()
    errs = []
    page.on('pageerror', lambda e: errs.append(str(e)))
    page.on('console', lambda m: errs.append(m.text) if m.type == 'error' and not any(i in m.text for i in IGNORE) else None)
    def on_req(r):
        if '/storage/v1/object/images/dishes/' in r.url and r.method in ('POST', 'PUT'):
            uploads.append({'url': r.url, 'size': int(r.header_value('content-length') or 0)})
    page.on('request', on_req)
    page.goto(URL + 'admin.html')
    page.get_by_label('Email').fill('owner@test.local')
    page.get_by_label('Password').fill('test-password-123')
    page.get_by_role('button', name='Sign in').click()
    page.wait_for_selector('h1:has-text("Dashboard")', timeout=15000)
    page.wait_for_timeout(1500)
    nav = page.get_by_role('navigation', name='Admin sections').first

    # ── 1. Orders ──
    badge_orders = num(nav.get_by_role('link', name=re.compile('^Orders')).inner_text())
    check('Orders badge shows the 1 open order', badge_orders == 1, str(badge_orders))
    nav.get_by_role('link', name=re.compile('^Orders')).click(); page.wait_for_timeout(1200)
    check('The open order from yesterday is LISTED (badge and list agree)', page.locator('main').get_by_text('Old Pending Order').count() >= 1, page.locator('main').inner_text()[:200].replace('\n', ' '))
    check('Date filter is switched off while "Open orders" is chosen (with a plain explanation)', page.get_by_label('Date range').is_disabled() and page.get_by_text('from any day').count() >= 1)
    page.get_by_label('Status').select_option('all'); page.wait_for_timeout(900)
    check('With another status the date filter works again (Today hides yesterday)', page.get_by_label('Date range').is_enabled() and page.locator('main').get_by_text('Old Pending Order').count() == 0)
    page.get_by_label('Date range').select_option('7d'); page.wait_for_timeout(900)
    check('Last 7 days shows it again', page.locator('main').get_by_text('Old Pending Order').count() >= 1)
    page.get_by_label('Status').select_option('open'); page.wait_for_timeout(900)
    check('Back to Open orders: still listed', page.locator('main').get_by_text('Old Pending Order').count() >= 1)

    # ── 2. Chat notification ──
    live = nav.get_by_role('link', name=re.compile('^Live Chat'))
    notif = nav.get_by_role('link', name=re.compile('^Notifications'))
    check('Live Chat badge shows 1 before opening', num(live.inner_text()) == 1, live.inner_text().replace('\n', ' '))
    before = num(notif.inner_text())
    check('Notifications badge counts the chat message too', before >= 2, str(before))
    live.click(); page.wait_for_timeout(900)
    page.locator('main').get_by_text('Ohh, I loved the website').first.click(); page.wait_for_timeout(2500)
    check('After opening the chat the Live Chat badge is gone', num(live.inner_text()) == 0 and 'Live Chat' in live.inner_text(), live.inner_text().replace('\n', ' '))
    after = num(notif.inner_text()) if re.search(r'\d', notif.inner_text()) else 0
    check('...and the Notifications badge dropped by exactly the chat message', after == before - 1, f'{before} -> {after}')
    check('The read is stored in the database for this admin', sql(f"select count(*)::int n from public.notification_reads r join public.notifications n on n.id=r.notification_id where n.kind='new_chat' and r.admin_id='{ADMIN}'")[0]['n'] == 1)

    # ── 3. Dish photos ──
    nav.get_by_role('link', name=re.compile('^Menu')).click(); page.wait_for_timeout(1200)
    orig_mutton = sql("select image_path from public.dishes where id='mutton-biryani'")[0]['image_path']
    row = page.locator('li', has_text='Mutton Biryani').first
    inp = row.locator('input[type=file]')
    check('Every menu row has its own photo picker (camera badge)', inp.count() == 1 and row.locator('label').first.bounding_box()['height'] >= 44, str(row.locator('label').first.bounding_box()))
    inp.set_input_files('/tmp/big-phone-photo.jpg'); page.wait_for_timeout(5000)
    new = sql("select image_path, image_kind from public.dishes where id='mutton-biryani'")[0]
    check('Big phone photo (>5 MB) saved straight from the menu row', '/storage/v1/object/public/images/dishes/' in (new['image_path'] or '') and new['image_kind'] == 'photo', str(new))
    check('It was shrunk before upload (measured request size, far below the 11+ MB original)', uploads and 1000 < uploads[-1]['size'] < 4.5 * 1024 * 1024, str(uploads[-1:]))
    check('Uploaded as WebP/JPEG, not the original huge file', uploads and re.search(r'\.(webp|jpg)$', uploads[-1]['url']) is not None, uploads[-1]['url'][-40:] if uploads else '')

    page.locator('li', has_text='Chicken Dum Biryani').first.get_by_role('button', name=re.compile('^Chicken Dum Biryani')).click()
    e = page.get_by_role('dialog', name=re.compile('Edit — Chicken Dum'))
    add = e.locator('label', has_text=re.compile('(Add|Change) photo'))
    bb = add.bounding_box()
    check('Edit form has a big, obvious "Add/Change photo" button at the top', bb is not None and bb['height'] >= 44 and bb['width'] >= 120, str(bb))
    page.screenshot(path=OUT + 'dish_photo_form.png')
    orig_chicken = sql("select image_path from public.dishes where id='chicken-dum-biryani'")[0]['image_path']
    e.locator('input[type=file]').set_input_files('/tmp/not-a-picture.jpg'); page.wait_for_timeout(1500)
    check('A file that is not a picture gives a clear message and changes nothing', page.get_by_text('could not be read').count() >= 1 and sql("select image_path from public.dishes where id='chicken-dum-biryani'")[0]['image_path'] == orig_chicken)
    e.locator('input[type=file]').set_input_files('/tmp/small-dish.png'); page.wait_for_timeout(2500)
    check('Small picture uploads and shows "press Save"', e.get_by_text('press Save').count() >= 1)
    check('Small picture was uploaded as chosen (PNG, not re-encoded)', uploads and uploads[-1]['url'].endswith('.png'), uploads[-1]['url'][-30:] if uploads else '')
    check('Edit form now offers a way back to the original', e.get_by_role('button', name='Go back to the original picture').count() == 1)
    e.get_by_role('button', name='Go back to the original picture').click(); page.wait_for_timeout(300)
    check('"Go back to the original" in the same session undoes the new photo', e.get_by_text('press Save').count() == 0 and e.get_by_role('button', name=re.compile('original picture|Remove photo')).count() == 0)
    e.locator('input[type=file]').set_input_files('/tmp/small-dish.png'); page.wait_for_timeout(2500)
    e.get_by_role('button', name='Save').click(); page.wait_for_timeout(1500)
    saved = sql("select image_path, image_kind from public.dishes where id='chicken-dum-biryani'")[0]
    check('Saved: dish now uses the uploaded photo', '/storage/v1/object/public/images/dishes/' in (saved['image_path'] or '') and saved['image_kind'] == 'photo', str(saved))
    page.locator('li', has_text='Chicken Dum Biryani').first.get_by_role('button', name=re.compile('^Chicken Dum Biryani')).click()
    e = page.get_by_role('dialog', name=re.compile('Edit — Chicken Dum'))
    e.get_by_role('button', name='Remove photo').click(); page.wait_for_timeout(300)
    e.get_by_role('button', name='Save').click(); page.wait_for_timeout(1500)
    gone = sql("select image_path, image_kind from public.dishes where id='chicken-dum-biryani'")[0]
    check('"Remove photo" clears it cleanly (dish shows the no-picture design)', gone['image_path'] is None and gone['image_kind'] is None, str(gone))
    check('No console errors in the admin during all of this', not errs, str(errs[:3]))

    # phone-size look of the edit form
    mctx = b.new_context(viewport={'width': 412, 'height': 915}, device_scale_factor=2, has_touch=True)
    mp = mctx.new_page()
    mp.goto(URL + 'admin.html'); mp.get_by_label('Email').fill('owner@test.local'); mp.get_by_label('Password').fill('test-password-123'); mp.get_by_role('button', name='Sign in').click()
    mp.wait_for_selector('h1:has-text("Dashboard")', timeout=15000)
    mp.get_by_role('button', name='Open admin menu').click()
    mp.get_by_role('dialog', name='Admin menu').get_by_role('link', name=re.compile('^Menu')).click(); mp.wait_for_timeout(1200)
    mp.screenshot(path=OUT + 'dish_photo_list_phone.png')
    mp.locator('li', has_text='Mutton Biryani').first.get_by_role('button', name=re.compile('^Mutton Biryani')).click(); mp.wait_for_timeout(600)
    mp.screenshot(path=OUT + 'dish_photo_form_phone.png')
    mb = mp.get_by_role('dialog').locator('label', has_text=re.compile('(Add|Change) photo')).bounding_box()
    check('Phone: photo button is fully on screen and ≥ 44 px tall', mb is not None and mb['x'] >= 0 and mb['x'] + mb['width'] <= 412 and mb['height'] >= 44, str(mb))
    b.close()

fails = results.count(False)
print(f'\n{len(results) - fails}/{len(results)} checks passed')
sys.exit(1 if fails else 0)
