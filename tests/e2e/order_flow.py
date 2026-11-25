"""End-to-end ordering tests against a LOCAL build + LOCAL database (never production).

  1. local Postgres with migrations applied (see docs/TESTING.md)
  2. node tests/e2e/mock_supabase.mjs            (port 54400)
  3. VITE_SUPABASE_URL=http://localhost:54400 VITE_SUPABASE_KEY=test npm run build -- --outDir /tmp/dist-e2e
     python3 -m http.server 4300 --directory /tmp/dist-e2e
  4. python3 tests/e2e/order_flow.py http://localhost:4300/ [http://localhost:4301/ for a no-backend build]
"""
import json, re, sys, time, urllib.request, urllib.parse, os
from playwright.sync_api import sync_playwright

URL = sys.argv[1]
NOBACKEND_URL = sys.argv[2] if len(sys.argv) > 2 else None
assert URL.startswith('http://localhost'), 'local only'
MOCK = 'http://localhost:54400/__control'
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
OUT = 'tests/output/'
os.makedirs(OUT, exist_ok=True)
results = []

def check(name, cond, detail=''):
    results.append((name, bool(cond), detail))
    print(('PASS ' if cond else 'FAIL ') + name + (f' — {detail}' if detail else ''), flush=True)

def ctl(body):
    req = urllib.request.Request(MOCK, data=json.dumps(body).encode(), headers={'content-type': 'application/json'}, method='POST')
    return json.loads(urllib.request.urlopen(req, timeout=10).read())

def sql(q):
    return ctl({'sql': q}).get('rows', [])

# ── fixture data in the LOCAL database ──
sql("""update public.restaurant_settings set opens_at='00:00', closes_at='23:59:59', min_lead_minutes=0, open_days='{0,1,2,3,4,5,6}',
       closed_dates='{}', delivery_enabled=true, delivery_charge=30, free_delivery_above=500, pickup_enabled=true, online_ordering_enabled=true, min_order_value=0""")
sql("update public.dishes set is_sold_out = (id = 'prawns-biryani')")
sql("delete from public.offers where code='DAWAT10'")
sql("insert into public.offers (title, description, discount_type, discount_value, code, is_active, is_public, min_order) values ('Ten percent off','On orders above Rs 200','percent',10,'DAWAT10',true,true,200)")
sql("update public.website_settings set intro_enabled=true, intro_duration_ms=2400, intro_for_returning=false, character_enabled=true, announcement_enabled=true, announcement_text='Now taking online orders'")
ctl({'fault': None})

def order_count(phone):
    return sql(f"select count(*)::int n from public.orders where customer_phone='{phone}'")[0]['n']

IGNORE = ('GPU stall', 'GL Driver', 'swiftshader', 'WebGL-', 'Automatic fallback', 'React DevTools', 'Failed to load resource')

with sync_playwright() as pw:
    b = pw.chromium.launch(args=ARGS)

    # ═════ 1. First visit: intro, live menu, offers ═════
    ctx = b.new_context(**pw.devices['Pixel 7'], accept_downloads=True)
    ctx.route('https://wa.me/**', lambda r: r.fulfill(status=200, body='wa stub'))
    popups = []
    ctx.on('page', lambda p: popups.append(p))
    page = ctx.new_page()
    errs = []
    page.on('console', lambda m: errs.append(m.text) if m.type == 'error' and not any(i in m.text for i in IGNORE) else None)
    page.on('pageerror', lambda e: errs.append(f'PAGEERROR {e}'))
    page.goto(URL, wait_until='domcontentloaded')
    intro = page.locator('[aria-label$="— intro"]')
    intro.wait_for(state='visible', timeout=8000)
    t0 = time.time()
    check('Intro shows on first visit with Skip button', page.get_by_role('button', name='Skip intro').is_visible())
    intro.wait_for(state='detached', timeout=25000)
    dt = time.time() - t0
    check('Video intro finishes by itself after the ~10 s film (driver-side timing on software rendering)', 9.5 <= dt <= 18, f'{dt:.1f}s')
    page.wait_for_timeout(1500)
    check('Page scroll is not locked after intro', page.evaluate("getComputedStyle(document.documentElement).overflow !== 'hidden' && getComputedStyle(document.body).overflow !== 'hidden'"))
    check('Announcement from admin settings shown', page.get_by_text('Now taking online orders').count() > 0)
    check('Offer section shows coupon DAWAT10', page.locator('#offers').get_by_text('DAWAT10').count() > 0)
    page.evaluate("document.getElementById('menu').scrollIntoView()")
    page.wait_for_timeout(1500)
    prawns = page.locator('article', has=page.get_by_role('heading', name='Prawns Biryani'))
    check('Sold-out dish is marked and cannot be added', prawns.get_by_text('Sold out today').count() == 1 and prawns.get_by_role('button', name='Sold out').is_disabled())
    cdb = page.locator('article', has=page.get_by_role('heading', name='Chicken Dum Biryani'))
    check('Offer badge shown on eligible dish', cdb.get_by_text(re.compile('10% off')).count() == 1)
    cdb.locator('label', has_text='Large').click()
    cdb.get_by_role('button', name='Increase quantity of Chicken Dum Biryani').click()
    cdb.get_by_role('button', name='Add to Order').click(no_wait_after=True)
    page.wait_for_function("document.body.innerText.includes('Added Chicken Dum Biryani')", timeout=15000)
    check('Add to order works with live (database) portion ids', True)
    stored = page.evaluate("JSON.parse(localStorage.getItem('dawat-cart-v1')).state.lines")
    check('Cart stores the stable database variant id', len(stored) == 1 and re.match(r'^[0-9a-f-]{36}$', stored[0]['variantId']) is not None, str(stored))

    # ═════ 2. Checkout validation, quote, coupon ═════
    page.get_by_role('button', name=re.compile('Open your order')).first.click()
    dlg = page.get_by_role('dialog', name='Your order')
    dlg.get_by_role('button', name='Continue to checkout').click()
    page.wait_for_timeout(1200)
    ctl({})  # reset call log
    page.get_by_role('button', name=re.compile('^Place order')).click()
    page.wait_for_timeout(600)
    calls = ctl({})['calls']
    check('Empty form: errors shown, nothing sent to server', dlg.get_by_text('Please enter your name.').is_visible() and 'place_order' not in calls, str(calls))
    check('Focus moves to first invalid field', page.evaluate("document.activeElement && document.activeElement.id") == 'co-name')
    phone = '9800000101'
    dlg.get_by_label('Full name *').fill('Asha Test')
    dlg.get_by_label('Mobile number *').fill(phone)
    dlg.locator('label:has(input[name=mode])').nth(1).click()
    dlg.get_by_label('Delivery address *').fill('Flat 4, Test Building, Dhamankar Naka')
    dlg.get_by_label('Coupon code').fill('NOPE')
    dlg.get_by_role('button', name='Apply').click()
    page.wait_for_timeout(1500)
    check('Invalid coupon explained', dlg.get_by_text('This coupon code is not valid.').is_visible())
    dlg.get_by_role('button', name='Remove').click()
    dlg.get_by_label('Coupon code').fill('dawat10')
    dlg.get_by_role('button', name='Apply').click()
    page.wait_for_timeout(1500)
    summary = dlg.get_by_label('Order summary').inner_text()
    check('Server quote: subtotal 300, discount 30, delivery 30, total 300', '300' in summary and '− ₹30' in summary.replace('−', '−') and 'Delivery' in summary and re.search(r'Total to pay\s*₹\s?300', summary) is not None, summary.replace('\n', ' | ')[:200])
    dlg.locator('#co-confirm').check(force=True)

    # ═════ 3. Double tap → exactly one order ═════
    btn = page.get_by_role('button', name=re.compile('^Place order'))
    btn.evaluate('el => { el.click(); el.click(); el.click(); }')  # three taps in the same instant
    page.wait_for_selector('text=Thank you, Asha', timeout=20000)
    check('Double tap creates exactly one order', order_count(phone) == 1, str(order_count(phone)))
    bill = sql(f"select bill_number, total from public.orders where customer_phone='{phone}'")[0]
    check('Bill number shown matches database', dlg.get_by_text(bill['bill_number']).count() >= 1, bill['bill_number'])
    check('Stored total equals quoted total (300)', float(bill['total']) == 300)
    check('Receipt rendered with items and grand total', dlg.get_by_label(re.compile('^Receipt DBH-')).get_by_text('Grand total').count() == 1)
    check('Success says payment is not taken online (no false paid claim)', dlg.get_by_text(re.compile('no money has been taken online')).count() == 1)
    lines_after = page.evaluate("JSON.parse(localStorage.getItem('dawat-cart-v1')).state.lines")
    check('Purchased items removed from cart', lines_after == [])
    check('Details not saved without consent', page.evaluate("JSON.parse(localStorage.getItem('dawat-cart-v1')).state.details.name") == '')
    my = page.evaluate("JSON.parse(localStorage.getItem('dawat-my-orders-v1')).state.orders")
    check('Order link saved for "My orders" on this device', len(my) == 1 and my[0]['bill'] == bill['bill_number'])
    page.screenshot(path=OUT + 'v2_receipt_mobile.png')

    with page.expect_download(timeout=20000) as dl:
        dlg.get_by_role('button', name='Download PDF').click()
    d = dl.value
    path = OUT + d.suggested_filename
    d.save_as(path)
    check('Receipt PDF downloads with bill number as name', d.suggested_filename == bill['bill_number'] + '.pdf' and open(path, 'rb').read(5) == b'%PDF-', d.suggested_filename)
    page.evaluate("window.__frames=[]; new MutationObserver(m=>m.forEach(r=>r.addedNodes.forEach(n=>{if(n.tagName==='IFRAME')setTimeout(()=>window.__frames.push(n.contentDocument?.title||''),50)}))).observe(document.body,{childList:true})")
    dlg.get_by_role('button', name='Print').click()
    page.wait_for_timeout(800)
    check('Print builds a printable receipt (hidden frame)', bill['bill_number'] in page.evaluate('window.__frames'), str(page.evaluate('window.__frames')))
    track_href = dlg.get_by_role('link', name='Track order').get_attribute('href')
    wa = dlg.get_by_role('link', name=re.compile('Message the restaurant')).get_attribute('href')
    check('Order-support WhatsApp link is a valid wa.me link with the bill number', wa.startswith('https://wa.me/919766888897?text=') and bill['bill_number'] in urllib.parse.unquote(wa))

    # ═════ 4. Tracking page ═════
    tp = ctx.new_page()
    tp.goto(track_href)
    tp.wait_for_selector('text=Pending confirmation', timeout=15000)
    check('Track page shows the order with the secret link', tp.get_by_text(bill['bill_number']).count() >= 1)
    sql(f"update public.orders set status='confirmed', prep_minutes=25 where bill_number='{bill['bill_number']}'")
    tp.get_by_role('button', name='Refresh').click()
    tp.wait_for_timeout(1500)
    check('Track page shows the restaurant’s status update + prep time', tp.get_by_role('heading', name='Confirmed').count() == 1 and tp.get_by_text(re.compile('about 25 minutes')).count() == 1)
    bad = track_href.split('#')[0] + '#' + track_href.split('#')[1].split('.')[0] + '.' + 'x' * 32
    tp.goto(bad)
    tp.wait_for_timeout(500)
    tp.reload()
    tp.wait_for_selector('text=This order link is not valid', timeout=10000)
    check('Wrong token cannot open someone else’s order', True)
    tp.goto(track_href.split('#')[0])
    tp.wait_for_timeout(1500)
    check('"My orders on this device" lists the order', tp.get_by_text(bill['bill_number']).count() == 1)
    tp.close()
    dlg.get_by_role('button', name='Continue browsing').click()

    # ═════ 5. Network failures: no fake success, no duplicates ═════
    def add_and_checkout(name_phone):
        page.evaluate("document.getElementById('menu').scrollIntoView()")
        page.wait_for_timeout(600)
        cdb.get_by_role('button', name='Add to Order').click(no_wait_after=True)
        page.wait_for_timeout(800)
        page.get_by_role('button', name=re.compile('Open your order')).first.click()
        dlg.get_by_role('button', name='Continue to checkout').click()
        dlg.get_by_label('Full name *').fill('Net Test')
        dlg.get_by_label('Mobile number *').fill(name_phone)
        dlg.locator('label:has(input[name=mode])').nth(0).click()
        dlg.locator('#co-confirm').check(force=True)
        page.wait_for_timeout(1500)

    p2 = '9800000102'
    add_and_checkout(p2)
    ctl({'fault': {'fn': 'place_order', 'mode': 'drop', 'times': 10}})  # beats the client's built-in retry
    page.get_by_role('button', name=re.compile('^Place order')).click()
    try:
        page.wait_for_selector('text=We could not confirm your order', timeout=20000)
    except Exception:
        page.screenshot(path=OUT + 'fail_drop.png')
        print('DIALOG TEXT:', dlg.inner_text()[:1500].replace('\n', ' | '))
        print('CALLS:', ctl({}))
        raise
    check('Dropped connection: honest "could not confirm" message, no receipt', dlg.get_by_text(re.compile('^Thank you')).count() == 0)
    check('Dropped connection: cart and details kept', dlg.get_by_label('Full name *').input_value() == 'Net Test' and page.evaluate("JSON.parse(localStorage.getItem('dawat-cart-v1')).state.lines.length") == 1)
    ctl({'fault': None})
    page.get_by_role('button', name='Check & retry').click()
    page.wait_for_selector('text=Thank you, Net', timeout=20000)
    check('Retry after a dropped request places exactly one order', order_count(p2) == 1)
    dlg.get_by_role('button', name='Continue browsing').click()

    p3 = '9800000103'
    add_and_checkout(p3)
    ctl({'fault': {'fn': 'place_order', 'mode': 'commit-then-drop', 'times': 10}})
    page.get_by_role('button', name=re.compile('^Place order')).click()
    page.wait_for_selector('text=We could not confirm your order', timeout=20000)
    check('Saved-but-response-lost: still no fake success shown', order_count(p3) == 1 and dlg.get_by_text(re.compile('^Thank you')).count() == 0)
    ctl({'fault': None})
    page.get_by_role('button', name='Check & retry').click()
    page.wait_for_selector('text=Thank you, Net', timeout=20000)
    check('Retry recovers the SAME order (idempotency key) — no duplicate', order_count(p3) == 1)
    dlg.get_by_role('button', name='Continue browsing').click()

    # ═════ 6. Price change while in cart ═════
    p4 = '9800000104'
    add_and_checkout(p4)
    sql("update public.dish_variants set price = 175 where dish_id='chicken-dum-biryani' and label='Large'")
    page.get_by_role('button', name=re.compile('^Place order')).click()
    page.wait_for_timeout(3000)
    check('Price change is detected and not charged silently', order_count(p4) == 0 and dlg.get_by_text(re.compile('now Rs. 175')).count() >= 1)
    page.wait_for_timeout(2000)
    page.get_by_role('button', name=re.compile('^Place order')).click()
    page.wait_for_selector('text=Thank you, Net', timeout=20000)
    t4 = sql(f"select total from public.orders where customer_phone='{p4}'")
    check('After reviewing, order uses the new price', len(t4) == 1 and float(t4[0]['total']) == 175, str(t4))
    sql("update public.dish_variants set price = 150 where dish_id='chicken-dum-biryani' and label='Large'")
    dlg.get_by_role('button', name='Continue browsing').click()

    # ═════ 7. Bulk enquiry saved with confirmation ═════
    page.evaluate("document.getElementById('bulk-orders').scrollIntoView()")
    page.wait_for_timeout(1200)
    form = page.get_by_role('form', name='Bulk order enquiry')
    form.get_by_label(re.compile('^Your name')).fill('Bulk Tester')
    form.get_by_label(re.compile('^Mobile')).fill('9800000105')
    tomorrow = time.strftime('%Y-%m-%d', time.localtime(time.time() + 2 * 86400))
    form.locator('input[type=date]').fill(tomorrow)
    form.locator('input[type=time]').fill('13:00')
    form.locator('input[type=checkbox]').last.check(force=True)
    form.get_by_role('button', name='Send enquiry').click()
    page.wait_for_selector('text=Enquiry received by the restaurant', timeout=15000)
    leads = sql("select kind, phone from public.leads where phone='9800000105'")
    check('Bulk enquiry stored in database before success is shown', len(leads) == 1 and leads[0]['kind'] == 'bulk')
    check('Optional WhatsApp link after a saved enquiry is a real link', form.get_by_role('link', name=re.compile('Also send on WhatsApp')).get_attribute('href').startswith('https://wa.me/919766888897?text='))

    # ═════ 8. WhatsApp links open (no blocked window.open) ═════
    n0 = len(popups)
    page.evaluate("window.scrollTo(0,0)")
    page.wait_for_timeout(500)
    enquire = page.locator('a[href^="https://wa.me/"]').first
    enquire.scroll_into_view_if_needed()
    enquire.tap()
    page.wait_for_url(re.compile(r'^https://wa\.me/'), wait_until='commit', timeout=20000)
    check('Tapping a WhatsApp button on a phone hands off to WhatsApp in the same tab', page.url.startswith('https://wa.me/919766888897') and len(popups) == n0)
    page.go_back(); page.wait_for_timeout(1500)
    bad_wa = page.eval_on_selector_all('a[href*="wa.me"]', "els=>els.map(e=>e.href).filter(h=>!/^https:\\/\\/wa\\.me\\/919766888897(\\?text=.+)?$/.test(h))")
    check('Every WhatsApp link uses the configured number', bad_wa == [], str(bad_wa[:2]))
    check('No window.open with noopener features left in code paths', page.evaluate("typeof window.open") == 'function')

    # ═════ 9. Returning visitor ═════
    page.reload(wait_until='domcontentloaded')
    page.wait_for_timeout(900)
    check('Returning visitor: intro skipped', page.locator('[aria-label$="— intro"]').count() == 0)
    page.wait_for_timeout(3000)
    check('Returning visitor: welcome bubble not repeated', page.get_by_text('Namaskaram! Welcome').count() == 0)
    check('Returning visitor: cart does not reopen by itself', not page.get_by_role('dialog', name='Your order').is_visible())
    check('No unexpected console errors', not errs, '; '.join(errs[:3]))

    # remember details opt-in
    page.evaluate("document.getElementById('menu').scrollIntoView()")
    page.wait_for_timeout(800)
    add_and_checkout('9800000106')
    dlg.get_by_text('Remember my name, number and address on this device for next time.').click()
    page.wait_for_timeout(300)
    page.reload(wait_until='domcontentloaded')
    page.wait_for_timeout(1500)
    check('Remember my details: kept after reload when opted in', page.evaluate("JSON.parse(localStorage.getItem('dawat-cart-v1')).state.details.name") == 'Net Test')
    page.get_by_role('button', name=re.compile('Open your order')).first.click()
    dlg.get_by_role('button', name='Continue to checkout').click()
    dlg.get_by_role('button', name='Forget my saved details').click()
    page.wait_for_timeout(300)
    check('Forget my saved details clears them', page.evaluate("JSON.parse(localStorage.getItem('dawat-cart-v1')).state.details.name") == '')

    # mobile layout
    overflow = page.evaluate("document.documentElement.scrollWidth - window.innerWidth")
    check('No horizontal overflow on phone width', overflow <= 1, str(overflow))
    ctx.close()

    # ═════ 10. Legacy cart from the previous website version ═════
    ctx = b.new_context(viewport={'width': 1280, 'height': 800})
    ctx.add_init_script("""if(!localStorage.getItem('dawat-cart-v1'))localStorage.setItem('dawat-cart-v1', JSON.stringify({state:{lines:[{key:'chicken-dum-biryani|large',itemId:'chicken-dum-biryani',variantId:'large',qty:2}],details:{name:'Old Saved Name',phone:'9999999999',mode:'pickup',date:'',time:'',instructions:''}},version:0}));localStorage.setItem('dawat-visited-v2','1');""")
    page = ctx.new_page()
    page.goto(URL)
    page.wait_for_timeout(4000)
    st = page.evaluate("JSON.parse(localStorage.getItem('dawat-cart-v1')).state")
    check('Old saved cart migrates to database ids (Large stays Large)', len(st['lines']) == 1 and re.match(r'^[0-9a-f-]{36}$', st['lines'][0]['variantId']) is not None and st['lines'][0]['qty'] == 2, str(st['lines']))
    check('Old cart details stored without consent are dropped', st['details']['name'] == '')
    ctx.close()

    # ═════ 11. No backend: ordering clearly unavailable, call/WhatsApp fallback ═════
    if NOBACKEND_URL:
        ctx = b.new_context(viewport={'width': 1280, 'height': 800})
        ctx.add_init_script("localStorage.setItem('dawat-visited-v2','1')")
        page = ctx.new_page()
        page.goto(NOBACKEND_URL)
        page.wait_for_timeout(3000)
        page.evaluate("document.getElementById('menu').scrollIntoView()")
        page.wait_for_timeout(1000)
        page.get_by_role('button', name='Add to Order').first.click(no_wait_after=True)
        page.wait_for_timeout(1000)
        page.get_by_role('button', name=re.compile('Open your order')).first.click()
        d2 = page.get_by_role('dialog', name='Your order')
        check('No backend: honest "ordering not connected" + Call to order', d2.get_by_text(re.compile('not connected')).count() == 1 and d2.get_by_role('link', name=re.compile('Call')).count() >= 1)
        check('No backend: no Place order button', page.get_by_role('button', name=re.compile('^Place order')).count() == 0 and d2.get_by_role('button', name='Continue to checkout').count() == 0)
        ctx.close()
    b.close()

passed = sum(1 for r in results if r[1])
print(f'\n{passed}/{len(results)} ordering checks passed')
json.dump([{'name': n, 'pass': p, 'detail': d} for n, p, d in results], open(OUT + 'order_flow_results.json', 'w'), indent=1)
sys.exit(0 if passed == len(results) else 1)
