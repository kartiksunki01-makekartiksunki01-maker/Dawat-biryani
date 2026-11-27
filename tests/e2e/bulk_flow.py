"""V3.6 Bulk & Special Orders — customer side. LOCAL build + LOCAL database only (never production).
python3 tests/e2e/bulk_flow.py http://localhost:4300/ http://localhost:4301/
"""
import datetime, json, os, re, sys, urllib.request, urllib.parse
from playwright.sync_api import sync_playwright

URL = sys.argv[1].rstrip('/') + '/'
STATIC = (sys.argv[2].rstrip('/') + '/') if len(sys.argv) > 2 else None
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

sql("update public.restaurant_settings set opens_at='00:00', closes_at='23:59:59', open_days='{0,1,2,3,4,5,6}', closed_dates='{}'")
sql("update public.website_settings set intro_enabled=false")
regular_before = sql("select dish_id, label, price::text p from public.dish_variants order by 1, 2")

IGNORE = ('WebSocket', 'realtime', 'Failed to load resource', 'net::ERR')
EXPECT = {'chicken-dum-biryani': 800, 'chicken-tikka-biryani': 1200, 'chicken-italian-biryani': 1400, 'prawns-biryani': 1400, 'mutton-biryani': 1600,
          'mutton-tikka-biryani': 1800, 'chicken-gravy': 700, 'chicken-sukha-lapeta': 900, 'chicken-kabab': 700, 'veg-paneer-biryani': 800, 'veg-paneer-tikka-biryani': 1200}

def settle(loc, want, ms=3000):
    # exit animations keep removed cards in the page for a moment — poll until the count settles
    import time as _t
    end = _t.time() + ms / 1000
    n = loc.count()
    while _t.time() < end and n != want:
        _t.sleep(0.1); n = loc.count()
    return n

def inr(n):
    s = str(int(n))
    if len(s) <= 3: return '₹' + s
    head, tail = s[:-3], s[-3:]
    head = re.sub(r'(\d)(?=(\d{2})+$)', r'\1,', head)
    return f'₹{head},{tail}'

with sync_playwright() as pw:
    b = pw.chromium.launch()
    ctx = b.new_context(viewport={'width': 1440, 'height': 900})
    ctx.grant_permissions(['clipboard-read', 'clipboard-write'], origin=URL.rstrip('/'))
    page = ctx.new_page()
    errs = []
    page.on('pageerror', lambda e: errs.append(str(e)))
    page.on('console', lambda m: errs.append(m.text) if m.type == 'error' and not any(i in m.text for i in IGNORE) else None)
    page.goto(URL + '#bulk-orders'); page.wait_for_timeout(3500)
    sec = page.locator('#bulk-orders')
    sec.scroll_into_view_if_needed(); page.wait_for_timeout(1500)

    # ── naming & menu ──
    check('Section renamed “Bulk & Special Orders” (same #bulk-orders link)', 'Bulk & Special Orders' in sec.locator('h2').inner_text().replace('\xa0', ' ') and 'Royal feasts for family functions' in sec.inner_text())
    check('Navigation label renamed', page.get_by_role('navigation', name='Main').get_by_role('link', name='Bulk & Special Orders').count() == 1)
    cards = sec.locator('[data-bulk-card]')
    check('11 published bulk dishes shown (Malai Tikka hidden until its unit is confirmed)', cards.count() == 11 and sec.locator('[data-bulk-card="chicken-malai-tikka-biryani"]').count() == 0, str(cards.count()))
    bad = [s for s, p in EXPECT.items() if inr(p) not in sec.locator(f'[data-bulk-card="{s}"]').inner_text()]
    check('Every card shows the correct ₹ per kg', not bad, str(bad))
    check('Cards show diet, category, availability and a quantity selector', all(x in sec.locator('[data-bulk-card="veg-paneer-biryani"]').inner_text() for x in ['VEGETARIAN', 'per kg', 'Available']) and sec.locator('[data-bulk-card="veg-paneer-biryani"] [aria-label="Vegetarian"]').count() == 1 and sec.locator('[data-bulk-card="mutton-biryani"] [aria-label="Non-vegetarian"]').count() == 1)
    check('Dishes without a photo show a “photo coming soon” placeholder, never another dish’s picture', sec.locator('[data-bulk-card="chicken-kabab"] [aria-label="Chicken Kabab — photo coming soon"]').count() == 1 and sec.locator('[data-bulk-card="chicken-kabab"] img').count() == 0)
    check('Promotional pictures are labelled as artwork', 'ARTWORK' in sec.locator('[data-bulk-card="mutton-biryani"]').inner_text().upper())

    # ── filters & search ──
    want = {'Chicken': 3, 'Mutton': 2, 'Seafood': 1, 'Vegetarian': 2, 'Gravies': 1, 'Specials & Starters': 2, 'All': 11}
    got = {}
    for label in want:
        sec.get_by_role('tab', name=label, exact=True).click()
        got[label] = settle(cards, want[label])
    check('Category filters: Chicken 3, Mutton 2, Seafood 1, Vegetarian 2, Gravies 1, Specials & Starters 2, All 11', got == want, str(got))
    sec.get_by_placeholder('Search bulk dishes…').fill('paneer')
    n_paneer = settle(cards, 2)
    sec.get_by_placeholder('Search bulk dishes…').fill('kabab')
    n_kabab = settle(cards, 1)
    sec.get_by_placeholder('Search bulk dishes…').fill('pizza')
    check('Search: “paneer” 2, “kabab” 1, unknown → friendly empty message', n_paneer == 2 and n_kabab == 1 and settle(cards, 0) == 0 and 'No bulk dishes match' in sec.inner_text(), f'{n_paneer} {n_kabab}')
    sec.get_by_role('button', name='Clear search').click(); settle(cards, 11)

    # ── automatic price calculation (selector beside the handi) ──
    stage = sec.locator('[data-bulk-stage]')
    selector = sec.get_by_label('Quantity selector')
    def focus(slug):
        sec.locator(f'[data-bulk-card="{slug}"] button[aria-pressed]').click(); page.wait_for_timeout(500)
    def estimate():
        page.wait_for_timeout(650)
        return selector.locator('dl').inner_text()
    focus('chicken-dum-biryani')
    check('5 kg Chicken Dum Biryani = ₹4,000 (default 5 kg)', '₹4,000' in estimate() and '5 kg' in estimate(), estimate().replace('\n', ' '))
    focus('chicken-tikka-biryani')
    inp = selector.get_by_label('Quantity of Chicken Tikka Biryani in kilograms')
    inp.fill('3'); inp.press('Enter')
    check('3 kg Chicken Tikka Biryani = ₹3,600 (typed whole kg)', '₹3,600' in estimate(), estimate().replace('\n', ' '))
    focus('mutton-biryani')
    selector.locator('input[type=range]').fill('10')
    check('10 kg Mutton Biryani = ₹16,000 (slider)', '₹16,000' in estimate() and stage.locator('[data-stage-kg="10"]').count() == 1, estimate().replace('\n', ' '))
    focus('veg-paneer-tikka-biryani')
    check('5 kg Veg Paneer Tikka Biryani = ₹6,000', '₹6,000' in estimate())
    selector.get_by_role('button', name='Increase Quantity of Veg Vegetable Paneer Tikka Biryani').click()
    check('Plus button: 6 kg = ₹7,200, updates instantly', '₹7,200' in estimate())
    inp = selector.get_by_label('Quantity of Veg Vegetable Paneer Tikka Biryani in kilograms')
    inp.fill('25'); inp.press('Enter'); page.wait_for_timeout(300)
    hi = inp.input_value()
    inp.fill('0'); inp.press('Enter'); page.wait_for_timeout(300)
    check('Quantity is kept within 1–20 kg (25 → 20, 0 → 1)', hi == '20' and inp.input_value() == '1', f'{hi} {inp.input_value()}')
    check('Minus is disabled at the minimum', selector.get_by_role('button', name='Decrease Quantity of Veg Vegetable Paneer Tikka Biryani').is_disabled())
    check('Stage shows the selected dish name and per-kg price', 'Veg Vegetable Paneer Tikka Biryani' in stage.inner_text() and '₹1,200 / kg' in stage.inner_text())
    canvas = stage.locator('canvas')
    if canvas.count():
        page.evaluate("document.querySelector('[data-bulk-stage] canvas').__marker = 42")
        focus('prawns-biryani')
        check('Changing the dish does not remount the 3D handi canvas', page.evaluate("document.querySelector('[data-bulk-stage] canvas').__marker") == 42)
    else:
        check('Handi fallback drawing shown when WebGL is unavailable', stage.locator('svg').count() >= 1)

    # ── multi-dish bulk order ──
    def add(slug, kg):
        c = sec.locator(f'[data-bulk-card="{slug}"]')
        c.get_by_label(re.compile(r'in kilograms$')).fill(str(kg)); c.get_by_label(re.compile(r'in kilograms$')).press('Enter')
        c.get_by_role('button', name=re.compile(rf'^(Add|Update) .*{kg} kg')).click(); page.wait_for_timeout(500)
    add('chicken-dum-biryani', 5); add('chicken-gravy', 2); add('veg-paneer-biryani', 3)
    summ = sec.locator('#bulk-summary')
    page.wait_for_timeout(600)
    st = summ.inner_text()
    check('Multi-dish order: 3 lines, total 10 kg, estimate ₹7,800', summ.locator('[data-bulk-line]').count() == 3 and '10 kg' in st and '₹7,800' in st, st.replace('\n', ' | ')[:200])
    check('Each line shows kg × price per kg = subtotal', all(x in st for x in ['5 kg × ₹800/kg = ₹4,000', '2 kg × ₹700/kg = ₹1,400', '3 kg × ₹800/kg = ₹2,400']))
    check('Estimate wording: no delivery/packaging/tax/discount invented', 'Estimate only' in st and 'No delivery, packaging, tax or discounts are added' in st)
    summ.get_by_role('button', name='Increase Quantity of Chicken Gravy in bulk order').click(); page.wait_for_timeout(700)
    check('Editing a quantity in the summary updates the total (Gravy 3 kg → ₹8,500)', '₹8,500' in summ.inner_text() and '11 kg' in summ.inner_text())
    summ.get_by_role('button', name='Remove Veg Vegetable Paneer Biryani from bulk order').click(); page.wait_for_timeout(800)
    check('Removing a dish updates the total (8 kg, ₹6,100)', summ.locator('[data-bulk-line]').count() == 2 and '₹6,100' in summ.inner_text() and '8 kg' in summ.inner_text())
    regular = page.evaluate("JSON.parse(localStorage.getItem('dawat-cart-v1') || '{\"state\":{\"lines\":[]}}').state.lines.length")
    check('Bulk dishes never go into the regular plate cart', regular == 0, str(regular))
    focus('mutton-biryani')
    selector.locator('input[type=range]').fill('15')
    selector.get_by_role('button', name=re.compile('^Add to Bulk Order')).click(); page.wait_for_timeout(500)
    check('Combined limit: 8 kg + 15 kg is refused against the 20 kg total', summ.locator('[data-bulk-line]').count() == 2 and 'up to 20 kg in total' in sec.inner_text())

    # ── WhatsApp / copy / call ──
    form = sec.get_by_role('form', name='Bulk order enquiry')
    form.scroll_into_view_if_needed(); page.wait_for_timeout(900)
    wa = form.get_by_role('link', name=re.compile('WhatsApp enquiry'))
    msg = urllib.parse.unquote(wa.get_attribute('href').split('text=', 1)[1])
    check('WhatsApp enquiry: configured number + full breakdown in Indian format', wa.get_attribute('href').startswith('https://wa.me/919766888897?text=') and 'Chicken Dum Biryani: 5 kg x Rs. 800/kg = Rs. 4,000' in msg and 'Chicken Gravy: 3 kg x Rs. 700/kg = Rs. 2,100' in msg and 'Total Quantity: 8 kg' in msg and 'Estimated Total: Rs. 6,100 (estimate' in msg, msg[:300])
    form.get_by_role('button', name='Copy order details').click(); page.wait_for_timeout(500)
    clip = page.evaluate('navigator.clipboard.readText()')
    check('Copy order details copies the same breakdown', 'BULK & SPECIAL ORDER ENQUIRY' in clip and 'Rs. 6,100' in clip)
    check('Call restaurant is a real phone link', (form.get_by_role('link', name='Call restaurant').get_attribute('href') or '').startswith('tel:'))

    # ── timing (Asia/Kolkata) ──
    d, t = ist(-3)
    form.get_by_label('Preferred date *').fill(d); form.get_by_label('Preferred time *').fill(t); page.wait_for_timeout(300)
    check('A past time is flagged', 'already passed' in form.inner_text())
    summ.get_by_role('button', name='Increase Quantity of Chicken Dum Biryani in bulk order').click(); page.wait_for_timeout(300)  # 6 kg → notice
    d, t = ist(1)
    form.get_by_label('Preferred date *').fill(d); form.get_by_label('Preferred time *').fill(t); page.wait_for_timeout(300)
    check('6 kg needs 2 hours’ notice — 1 hour ahead is flagged', 'at least 2 hours from now' in form.inner_text())
    d, t = ist(3)
    form.get_by_label('Preferred date *').fill(d); form.get_by_label('Preferred time *').fill(t); page.wait_for_timeout(300)
    check('3 hours ahead is accepted', form.get_by_role('alert').count() == 0)

    # ── price change while the customer is on the page ──
    sql("update public.bulk_menu_items set price_per_kg = 750 where slug = 'chicken-gravy'")
    form.get_by_label('Your name *').fill('Asha Kulkarni')
    form.get_by_label('Mobile number *').fill('98201 23456')
    form.get_by_label('Event type').select_option('Birthday')
    form.get_by_label('Special instructions').fill('For 60 guests, medium spice')
    form.locator('input[type=checkbox]').check()
    form.get_by_role('button', name=re.compile('^Submit Bulk Order Enquiry')).click()
    page.wait_for_timeout(2500)
    check('Changed price is caught before sending: nothing saved, customer told ₹700 → ₹750', sql("select count(*)::int n from public.leads where phone='9820123456'")[0]['n'] == 0 and 'changed from ₹700 to ₹750' in sec.inner_text(), sec.locator('[role=alert]').all_inner_texts()[:3])
    check('Summary already shows the new estimate (6×800 + 3×750 = ₹7,050)', '₹7,050' in summ.inner_text())

    # ── unavailable dish ──
    sql("update public.bulk_menu_items set is_sold_out = true where slug = 'chicken-gravy'")
    page.reload(); page.wait_for_timeout(3500)
    sec.scroll_into_view_if_needed(); summ.scroll_into_view_if_needed(); page.wait_for_timeout(1500)
    check('Saved bulk order survives a reload (dishes + kg only)', summ.locator('[data-bulk-line]').count() == 2)
    check('Sold-out dish is flagged in the saved order', 'no longer available' in summ.inner_text() and sec.locator('[data-bulk-card="chicken-gravy"]').inner_text().find('Sold out') >= 0)
    form.scroll_into_view_if_needed(); page.wait_for_timeout(900)
    form.get_by_label('Your name *').fill('Asha Kulkarni'); form.get_by_label('Mobile number *').fill('98201 23456')
    d, t = ist(3)
    form.get_by_label('Preferred date *').fill(d); form.get_by_label('Preferred time *').fill(t)
    form.get_by_label('Event type').select_option('Birthday')
    form.get_by_label('Special instructions').fill('For 60 guests, medium spice')
    form.locator('input[type=checkbox]').check()
    form.get_by_role('button', name=re.compile('^Submit Bulk Order Enquiry')).click(); page.wait_for_timeout(1200)
    check('Cannot send while an unavailable dish is in the order', sql("select count(*)::int n from public.leads where phone='9820123456'")[0]['n'] == 0 and 'Remove the dish that is no longer available' in sec.inner_text())
    summ.get_by_role('button', name='Remove Chicken Gravy from bulk order').click(); page.wait_for_timeout(600)
    sql("update public.bulk_menu_items set is_sold_out = false, price_per_kg = 700 where slug = 'chicken-gravy'")

    # ── submit (double-click must not duplicate) ──
    form.get_by_role('button', name=re.compile('^Submit Bulk Order Enquiry')).dblclick()
    page.wait_for_selector('text=Enquiry received by the restaurant', timeout=15000)
    leads = sql("select id, kind, status, payload, message, quote_amount, converted_order_id from public.leads where phone='9820123456'")
    check('Double-tapping Submit stores exactly one enquiry', len(leads) == 1, str(len(leads)))
    L = leads[0] if leads else {'payload': {}}
    p = L['payload'] if isinstance(L['payload'], dict) else json.loads(L['payload'])
    check('Stored: dish, kg, price per kg at submission, subtotal, totals (6 kg × ₹800 = ₹4,800)', p.get('items') and p['items'][0]['name'] == 'Chicken Dum Biryani' and p['items'][0]['kg'] == 6 and float(p['items'][0]['price_per_kg']) == 800 and float(p['estimated_total']) == 4800 and p['total_kg'] == 6, json.dumps(p)[:200])
    check('Stored: event, date, time, pickup, instructions', p.get('event_type') == 'Birthday' and p.get('date') == d and p.get('time') == t and p.get('mode') == 'pickup' and p.get('instructions') == 'For 60 guests, medium spice')
    check('Submitted enquiry is not described as a confirmed order', 'not a confirmed order yet' in form.inner_text() and L.get('status') == 'new' and L.get('quote_amount') is None)
    check('Bulk order is cleared after sending', summ.locator('[data-bulk-line]').count() == 0)
    wa2 = form.get_by_role('link', name=re.compile('Also send on WhatsApp')).get_attribute('href')
    check('Optional WhatsApp after sending uses the server-priced breakdown', 'Rs.%204%2C800' in wa2 or 'Rs. 4,800' in urllib.parse.unquote(wa2))
    page.screenshot(path=OUT + 'bulk_desktop_sent.png')

    # ── regular menu untouched ──
    check('Regular plate prices unchanged in the database', sql("select dish_id, label, price::text p from public.dish_variants order by 1, 2") == regular_before)
    page.evaluate("document.getElementById('menu').scrollIntoView()"); page.wait_for_timeout(1200)
    check('Regular menu still shows plate prices (Chicken Dum from ₹110)', '₹110' in page.locator('#menu').inner_text())
    check('No console errors on desktop', not errs, '; '.join(errs[:3]))

    # ── tablet (Xiaomi Pad 6 landscape ≈ 1280×800) & phone ──
    for name, vp, scale in [('tablet', {'width': 1280, 'height': 800}, 2), ('phone', {'width': 412, 'height': 915}, 2)]:
        c2 = b.new_context(viewport=vp, device_scale_factor=scale, has_touch=True, is_mobile=(name == 'phone'))
        p2 = c2.new_page()
        e2 = []
        p2.on('pageerror', lambda e: e2.append(str(e)))
        p2.on('console', lambda m: e2.append(m.text) if m.type == 'error' and not any(i in m.text for i in IGNORE) else None)
        p2.goto(URL + '#bulk-orders'); p2.wait_for_timeout(3500)
        s2 = p2.locator('#bulk-orders'); s2.scroll_into_view_if_needed(); p2.wait_for_timeout(1200)
        over = p2.evaluate("document.documentElement.scrollWidth - window.innerWidth")
        check(f'{name}: no sideways scrolling', over <= 0, str(over))
        small = p2.evaluate("""[...document.querySelectorAll('#bulk-orders button, #bulk-orders a, #bulk-orders [role=tab]')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.height < 36 && !e.closest('[data-bulk-card] [aria-pressed]') }).length""")
        check(f'{name}: touch targets are comfortable (no buttons under 36 px)', small == 0, str(small))
        s2.locator('[data-bulk-card="mutton-biryani"]').get_by_role('button', name=re.compile('^Add')).tap(); p2.wait_for_timeout(600)
        s2.locator('[data-bulk-card="chicken-dum-biryani"]').scroll_into_view_if_needed(); p2.wait_for_timeout(700)
        if name == 'phone':
            pill = p2.locator('[data-bulk-pill]')
            check('phone: floating “Bulk order” pill appears while browsing dishes', pill.is_visible() and '₹8,000' in pill.inner_text(), pill.inner_text() if pill.count() else 'none')
            pill.tap(); p2.wait_for_timeout(1400)
            box = p2.locator('#bulk-summary').bounding_box()
            check('phone: tapping the pill brings the bulk order summary into view', box and box['y'] < 915 and box['y'] + 60 > 0, str(box))
            p2.screenshot(path=OUT + 'bulk_phone_summary.png')
        else:
            nav = p2.get_by_role('navigation', name='Main')
            if nav.is_visible():
                boxes = [l.bounding_box() for l in nav.get_by_role('link').all()]
                overlap = any(boxes[i]['x'] + boxes[i]['width'] > boxes[i + 1]['x'] for i in range(len(boxes) - 1))
                check('tablet: renamed nav label fits without overlapping', not overlap)
            else:
                check('tablet: navigation uses the menu button at this width', p2.get_by_role('button', name=re.compile('menu', re.I)).count() >= 1)
            p2.screenshot(path=OUT + 'bulk_tablet.png', full_page=False)
        check(f'{name}: no console errors', not e2, '; '.join(e2[:3]))
        c2.close()

    # ── reduced motion ──
    c3 = b.new_context(viewport={'width': 1280, 'height': 860}, reduced_motion='reduce')
    p3 = c3.new_page(); e3 = []
    p3.on('pageerror', lambda e: e3.append(str(e)))
    p3.goto(URL + '#bulk-orders'); p3.wait_for_timeout(3000)
    s3 = p3.locator('#bulk-orders'); s3.scroll_into_view_if_needed(); p3.wait_for_timeout(800)
    s3.locator('[data-bulk-card="mutton-biryani"] button[aria-pressed]').click()
    s3.get_by_label('Quantity selector').locator('input[type=range]').fill('12'); p3.wait_for_timeout(60)
    check('Reduced motion: totals update immediately (no counting animation)', '₹19,200' in s3.get_by_label('Quantity selector').locator('dl').inner_text())
    check('Reduced motion: no errors', not e3)
    c3.close()

    # ── no backend (static build) ──
    if STATIC:
        c4 = b.new_context(viewport={'width': 1280, 'height': 860})
        p4 = c4.new_page(); e4 = []
        p4.on('pageerror', lambda e: e4.append(str(e)))
        p4.goto(STATIC + '#bulk-orders'); p4.wait_for_timeout(3000)
        s4 = p4.locator('#bulk-orders'); s4.scroll_into_view_if_needed(); p4.wait_for_timeout(800)
        check('No backend: built-in bulk menu still shows 11 dishes with prices', s4.locator('[data-bulk-card]').count() == 11 and '₹1,600' in s4.inner_text())
        s4.locator('[data-bulk-card="chicken-dum-biryani"]').get_by_role('button', name=re.compile('^Add')).click(); p4.wait_for_timeout(400)
        f4 = s4.get_by_role('form', name='Bulk order enquiry'); f4.scroll_into_view_if_needed(); p4.wait_for_timeout(800)
        f4.get_by_label('Your name *').fill('Offline Test'); f4.get_by_label('Mobile number *').fill('9876500000')
        d, t = ist(4)
        f4.get_by_label('Preferred date *').fill(d); f4.get_by_label('Preferred time *').fill(t)
        f4.locator('input[type=checkbox]').check()
        f4.get_by_role('button', name=re.compile('^Submit Bulk Order Enquiry')).click(); p4.wait_for_timeout(1200)
        check('No backend: honest “not sent” message, WhatsApp and Call still offered', 'The enquiry was not sent' in f4.inner_text() and f4.get_by_role('link', name=re.compile('WhatsApp enquiry')).count() == 1)
        check('No backend: no page errors', not e4, '; '.join(e4[:3]))
        c4.close()
    b.close()

fails = results.count(False)
print(f'\n{len(results) - fails}/{len(results)} checks passed')
sys.exit(1 if fails else 0)
