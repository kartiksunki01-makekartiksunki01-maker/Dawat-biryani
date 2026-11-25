"""Live chat end-to-end (LOCAL build + local database via the mock API; never production).
Two real browsers: a customer on a phone and the admin on a desktop, talking through the real database functions."""
import sys, re, time, json, urllib.request
from playwright.sync_api import sync_playwright
URL = sys.argv[1]; assert URL.startswith('http://localhost')
MOCK = 'http://localhost:54400/__control'
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
OUT = 'tests/output/'
res = []
def check(n, c, d=''):
    res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + (f' — {d}' if d else ''), flush=True)
def rt():
    r = urllib.request.Request(MOCK, data=b'{}', headers={'content-type': 'application/json'}, method='POST')
    return json.loads(urllib.request.urlopen(r, timeout=10).read())['realtime']
def sql(q):
    r = urllib.request.Request(MOCK, data=json.dumps({'sql': q}).encode(), headers={'content-type': 'application/json'}, method='POST')
    return json.loads(urllib.request.urlopen(r, timeout=10).read()).get('rows', [])
sql("update public.chat_settings set enabled=true, admin_online=false, admin_seen_at=null, welcome_message='Namaste! Welcome to Dawat Biryani House. How can we help you today?', offline_message='We are offline right now. Leave your message and we will reply as soon as we are back. For urgent orders please call us.' where id=1")
sql("update public.website_settings set intro_enabled=false")
sql("delete from public.chat_conversations")
import uuid
ADMIN = str(uuid.uuid4())
sql(f"insert into auth.users (id, email, pw) values ('{ADMIN}', 'owner@test.local', 'test-password-123') on conflict do nothing")
sql(f"insert into public.admins (user_id) select '{ADMIN}' where not exists (select 1 from auth.users u join public.admins a on a.user_id=u.id where u.email='owner@test.local')")
IGNORE = ('WebSocket', 'realtime', 'Failed to load resource', 'net::ERR', 'GPU stall', 'GL Driver', 'swiftshader', 'WebGL-', 'Automatic fallback', 'THREE')

with sync_playwright() as pw:
    b = pw.chromium.launch(args=ARGS)
    cust_ctx = b.new_context(**pw.devices['Pixel 7']); cust = cust_ctx.new_page()
    errs = []
    cust.on('pageerror', lambda e: errs.append(str(e)))
    cust.on('console', lambda m: errs.append(m.text) if m.type == 'error' and not any(i in m.text for i in IGNORE) else None)
    cust.goto(URL, wait_until='domcontentloaded')
    launcher = cust.get_by_test_id('chat-launcher'); launcher.wait_for(state='visible', timeout=15000)
    bb = launcher.bounding_box()
    check('Chat launcher is where Ask Anna used to be (bottom-right) and compact', bb['x'] + bb['width'] > 340 and bb['y'] + bb['height'] > 700 and bb['width'] <= 60, str(bb))
    check('Old "Ask Anna" widget is gone', cust.get_by_text('Ask Anna').count() == 0)
    cust.screenshot(path=OUT + 'chat_launcher.jpg', type='jpeg', quality=70)
    launcher.click()
    win = cust.get_by_role('dialog', name=re.compile('Live chat'))
    win.wait_for(state='visible')
    check('Window opens; offline status + welcome and offline text shown', 'Offline' in cust.get_by_test_id('chat-presence').inner_text() and 'offline right now' in cust.get_by_test_id('chat-intro').inner_text())
    box = win.bounding_box()
    check('Window fits inside the phone screen', box['x'] >= 0 and box['x'] + box['width'] <= 412 and box['y'] >= 0 and box['y'] + box['height'] <= 915, str(box))
    check('Send is disabled until something is typed', cust.get_by_role('button', name='Send message').is_disabled())
    cust.get_by_label('Your name (optional)').fill('Asha')
    cust.get_by_label('Type your message').fill('Do you have mutton biryani today?')
    cust.get_by_role('button', name='Send message').click()
    try: cust.wait_for_selector('[data-sender="customer"]:has-text("mutton biryani")', timeout=8000)
    except Exception: print('DEBUG', cust.locator('[role=log]').inner_text(), sql('select count(*) from public.chat_messages')); raise
    cust.wait_for_selector('[data-sender="system"]:has-text("offline right now")', timeout=8000)
    rows = sql("select sender, kind, body from public.chat_messages order by created_at")
    check('Message really stored in the database + auto replies', [r['sender'] for r in rows] == ['system', 'customer', 'system'], str(rows))
    check('Message shows a timestamp', win.locator('time').count() >= 2 and re.search(r'\d{1,2}:\d{2}\s?(am|pm)', win.locator('time').first.inner_text(), re.I) is not None, win.locator('time').first.inner_text())
    check('Conversation named from the optional name field', sql("select customer_name from public.chat_conversations")[0]['customer_name'] == 'Asha')
    cust.screenshot(path=OUT + 'chat_customer.jpg', type='jpeg', quality=70)

    # persistence across refresh
    cust.reload(wait_until='domcontentloaded')
    cust.get_by_test_id('chat-launcher').wait_for(state='visible', timeout=15000); cust.get_by_test_id('chat-launcher').click()
    cust.wait_for_selector('[data-sender="customer"]:has-text("mutton biryani")', timeout=8000)
    check('History is still there after refreshing the page', True)
    cust.get_by_role('button', name='Close chat').click()

    # ── admin ──
    adm_ctx = b.new_context(viewport={'width': 1366, 'height': 860}); adm = adm_ctx.new_page()
    adm.on('pageerror', lambda e: errs.append('ADMIN ' + str(e)))
    adm.goto(URL + 'admin.html')
    adm.get_by_label('Email').fill('owner@test.local'); adm.get_by_label('Password').fill('test-password-123'); adm.get_by_role('button', name='Sign in').click()
    adm.wait_for_selector('h1:has-text("Dashboard")', timeout=15000)
    nav = adm.get_by_role('navigation', name='Admin sections').first
    for _ in range(20):
        if '1' in nav.get_by_role('link', name=re.compile('^Live Chat')).inner_text(): break
        adm.wait_for_timeout(500)
    check('Sidebar shows unread chat count', nav.get_by_role('link', name=re.compile('^Live Chat')).inner_text().strip().endswith('1') or '1' in nav.get_by_role('link', name=re.compile('^Live Chat')).inner_text(), nav.get_by_role('link', name=re.compile('^Live Chat')).inner_text().replace('\n', ' '))
    nav.get_by_role('link', name=re.compile('^Live Chat')).click()
    adm.wait_for_selector('h1:has-text("Live Chat")')
    item = adm.get_by_test_id('conv-list').locator('li').first
    item.wait_for(timeout=8000)
    check('Admin sees the conversation with unread badge and preview', 'Asha' in item.inner_text() and 'mutton' in item.inner_text() and item.get_by_label('1 unread').count() == 1, item.inner_text().replace('\n', ' '))
    item.click()
    adm.wait_for_selector('[data-from="customer"]:has-text("mutton biryani")')
    adm.wait_for_timeout(1500)
    check('Opening the conversation marks it read', sql("select admin_unread from public.chat_conversations")[0]['admin_unread'] == 0)
    check('Admin is shown as Offline until they switch on', adm.get_by_text('You are Offline').count() == 1)
    adm.get_by_text('Available for chat', exact=True).click(); adm.wait_for_selector('text=You are Online', timeout=6000)
    check('Availability saved in the database', sql("select admin_online from public.chat_settings")[0]['admin_online'] is True)

    # reply → customer receives it live (customer window open)
    cust.get_by_test_id('chat-launcher').click(); cust.get_by_role('dialog').wait_for(state='visible')
    adm.get_by_label('Reply to customer').fill('Yes! Mutton biryani is ready. Pickup or delivery?')
    adm.get_by_role('button', name='Send reply').click()
    t0 = time.time()
    cust.wait_for_selector('[data-sender="admin"]:has-text("Mutton biryani is ready")', timeout=10000)
    dt = time.time() - t0
    check('Customer receives the admin reply by real-time push (< 3 s; polling is only every 20 s)', dt < 3, f'{dt:.1f}s, broadcasts={rt()["broadcasts"]}')
    check('Customer sees admin Online', 'Online' in cust.get_by_test_id('chat-presence').inner_text())
    check('Latest message is scrolled into view', cust.locator('[role=log]').evaluate("el=>el.scrollHeight-el.scrollTop-el.clientHeight<80"))
    cust.screenshot(path=OUT + 'chat_customer2.jpg', type='jpeg', quality=70)

    # unread badge while the widget is closed
    cust.get_by_role('button', name='Close chat').click()
    adm.get_by_label('Reply to customer').fill('Also, we have a family pack today.')
    adm.get_by_role('button', name='Send reply').click()
    t0 = time.time()
    cust.get_by_test_id('chat-unread').wait_for(state='visible', timeout=25000)
    dt = time.time() - t0
    check('Closed widget shows an unread badge for the admin reply, pushed (< 3 s; closed-window polling is 60 s)', cust.get_by_test_id('chat-unread').inner_text() == '1' and dt < 3, f'{dt:.1f}s')
    check('A short preview of the new reply appears above the chat button', 'family pack' in cust.get_by_test_id('chat-peek').inner_text())
    check('Browser tab title shows the unread count', cust.title().startswith('(1) New message'), cust.title())
    cust.screenshot(path=OUT + 'chat_peek.jpg', type='jpeg', quality=70)
    cust.get_by_test_id('chat-launcher').click()
    cust.wait_for_selector('[data-sender="admin"]:has-text("family pack")')
    cust.wait_for_timeout(500)
    check('Opening the chat clears the unread badge', sql("select customer_unread from public.chat_conversations")[0]['customer_unread'] == 0)
    check('Tab title restored once read', not cust.title().startswith('('), cust.title())

    # minimize keeps the conversation
    cust.get_by_role('button', name='Minimize chat').click()
    check('Minimize collapses to just the header', not cust.locator('[role=log]').is_visible() and cust.get_by_role('dialog').is_visible())
    cust.get_by_role('button', name='Expand chat').click()
    check('Expand restores the conversation', cust.locator('[data-sender="admin"]').count() >= 2)
    cust.keyboard.press('Escape'); cust.wait_for_timeout(500)
    check('Escape closes the window', cust.get_by_role('dialog').count() == 0)

    # cart open hides the chat so it cannot cover ordering buttons
    cust.get_by_role('button', name=re.compile('Add')).first.click() if cust.get_by_role('button', name=re.compile('^Add')).count() else None

    # admin: search, resolve, archive, restore
    adm.get_by_label('Search conversations').fill('zzzz'); adm.wait_for_timeout(300)
    check('Search with no match shows empty state', adm.get_by_text('No match').count() == 1)
    adm.get_by_label('Search conversations').fill('asha'); adm.wait_for_timeout(300)
    check('Search finds the conversation by customer name', adm.get_by_test_id('conv-list').locator('li').count() == 1)
    adm.get_by_role('button', name='Resolve').click(); adm.wait_for_timeout(900)
    check('Resolve saved', sql("select status from public.chat_conversations")[0]['status'] == 'resolved')
    adm.get_by_role('tab', name=re.compile('^resolved')).click(); adm.wait_for_timeout(400)
    check('Resolved tab lists it', adm.get_by_test_id('conv-list').locator('li').count() == 1)
    adm.get_by_test_id('conv-list').locator('li').first.click()
    adm.get_by_role('button', name='Archive').click(); adm.wait_for_timeout(900)
    check('Archive saved', sql("select status from public.chat_conversations")[0]['status'] == 'archived')
    adm.get_by_role('tab', name=re.compile('^archived')).click(); adm.get_by_test_id('conv-list').locator('li').first.click()
    adm.get_by_role('button', name='Restore').click(); adm.wait_for_timeout(900)
    check('Restore saved', sql("select status from public.chat_conversations")[0]['status'] == 'open')

    # customer writes again → admin sees new unread live
    cust.get_by_test_id('chat-launcher').click(); cust.get_by_label('Type your message').fill('Delivery please, Dhamankar Naka'); cust.keyboard.press('Enter')
    cust.wait_for_selector('[data-sender="customer"]:has-text("Delivery please")')
    t0 = time.time()
    adm.get_by_role('tab', name=re.compile('^active')).click()
    adm.wait_for_selector('[data-from="customer"]:has-text("Delivery please")', timeout=12000)
    dt = time.time() - t0
    check('Admin receives the new customer message by real-time push (< 3 s; polling is every 32 s when live)', dt < 3, f'{dt:.1f}s, db changes seen={rt()["changes"]}')
    check('Admin panel says live updates are connected', adm.get_by_text('Live updates connected.').count() == 1)

    # settings: change welcome, disable widget
    adm.get_by_role('button', name='Chat settings').click()
    adm.get_by_label(re.compile('^Automatic welcome message')).fill('Hello from the kitchen!')
    adm.get_by_role('button', name='Save chat settings').click(); adm.wait_for_timeout(900)
    check('Welcome message saved', sql("select welcome_message from public.chat_settings")[0]['welcome_message'] == 'Hello from the kitchen!')
    c2 = b.new_context(**pw.devices['Pixel 7']); p2 = c2.new_page(); p2.goto(URL, wait_until='domcontentloaded')
    p2.get_by_test_id('chat-launcher').wait_for(state='visible', timeout=15000); p2.get_by_test_id('chat-launcher').click()
    p2.wait_for_selector('text=Hello from the kitchen!')
    check('A different visitor starts with the new welcome and sees NONE of the other customer\'s messages', p2.get_by_role('dialog').get_by_text('mutton biryani').count() == 0 and p2.get_by_role('dialog').get_by_text('Delivery please').count() == 0 and p2.locator('[data-sender="customer"]').count() == 0)
    c2.close()
    adm.get_by_text('Show the live chat widget on the website', exact=True).click()
    adm.get_by_role('button', name='Save chat settings').click(); adm.wait_for_timeout(900)
    cust.reload(wait_until='domcontentloaded'); cust.wait_for_timeout(3500)
    check('Admin disabled the widget: it disappears from the website', cust.get_by_test_id('chat-launcher').count() == 0)
    check('No console/page errors on customer or admin pages', not errs, str(errs[:3]))
    b.close()
print(f'\n{sum(res)}/{len(res)} checks passed'); sys.exit(0 if all(res) else 1)
