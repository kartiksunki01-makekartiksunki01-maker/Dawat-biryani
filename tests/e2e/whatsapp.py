"""WhatsApp button tests — LOCAL build + LOCAL database only (never production).

A real WhatsApp app cannot be opened from a test server, so wa.me / web.whatsapp.com are stubbed. What these
tests prove: every button carries the owner's number (+91 97668 88897) from the database settings with a
pre-filled message; on phones/tablets the button is a same-tab link (in-app browsers ignore new-tab links —
the root cause of "tap does nothing"); on desktop it opens a new tab; nothing covers any button; the receipt
button works on an Android tablet (the reported case); and the fallback panel appears when nothing opens.

  python3 tests/e2e/whatsapp.py http://localhost:4300/      (mock-backed build, mock_supabase.mjs running)
"""
import json, re, sys, urllib.parse, urllib.request
from playwright.sync_api import sync_playwright

URL = sys.argv[1]
assert URL.startswith('http://localhost'), 'local only'
MOCK = 'http://localhost:54400/__control'
NUM = '919766888897'
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
res = []

def check(n, c, d=''):
    res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + (f' — {d}' if d else ''), flush=True)

def sql(q):
    req = urllib.request.Request(MOCK, data=json.dumps({'sql': q}).encode(), headers={'content-type': 'application/json'}, method='POST')
    return json.loads(urllib.request.urlopen(req, timeout=10).read()).get('rows', [])

def prep(page, bottom=True):
    page.add_init_script("try{localStorage.setItem('dawat-visited-v2','1');sessionStorage.setItem('dawat-intro-seen','1')}catch(e){}")
    page.goto(URL, wait_until='domcontentloaded')
    page.wait_for_function("document.querySelectorAll('a[data-wa]').length > 0", timeout=15000)
    page.wait_for_timeout(1200)
    if bottom:
        page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
        page.wait_for_timeout(900)

def topmost(loc):
    """True when the element under the centre of the control is the control itself (no overlay, no invisible layer)."""
    loc.scroll_into_view_if_needed()
    return loc.evaluate("""el => { const r=el.getBoundingClientRect(); if (!r.width || !r.height) return false;
      const t=document.elementFromPoint(r.left+r.width/2, r.top+r.height/2); return !!t && (el===t || el.contains(t)); }""")

def hrefs_ok(page, num=NUM):
    hs = page.eval_on_selector_all('a[data-wa]', 'els=>els.map(e=>e.href)')
    return hs and all(re.match(rf'^https://wa\.me/{num}\?text=.+', h) for h in hs), hs

# fixtures (local DB): ordering open all day, owner's WhatsApp number
sql("""update public.restaurant_settings set opens_at='00:00', closes_at='23:59:59', min_lead_minutes=0, open_days='{0,1,2,3,4,5,6}',
       closed_dates='{}', pickup_enabled=true, online_ordering_enabled=true, min_order_value=0, whatsapp_number='919766888897'""")
sql("update public.dishes set is_sold_out=false")

DEVICES = [('Android phone', 'Pixel 7', True), ('Android tablet', 'Galaxy Tab S4', True), ('iPhone', 'iPhone 14', True),
           ('iPad', 'iPad Pro 11', True), ('Desktop', None, False)]

with sync_playwright() as pw:
    b = pw.chromium.launch(args=ARGS)

    # ── 1. every device profile: number, link type, overlay, tap behaviour ──
    for label, devname, touch in DEVICES:
        dev = pw.devices[devname] if devname else {'viewport': {'width': 1366, 'height': 800}}
        ctx = b.new_context(**dev)
        hits = []
        ctx.route(re.compile(r'https://(wa\.me|web\.whatsapp\.com)/.*'),
                  lambda r: (hits.append(r.request.url), r.fulfill(status=200, content_type='text/html', body='<title>wa stub</title>'))[1])
        page = ctx.new_page()
        prep(page)
        ok, hs = hrefs_ok(page)
        check(f'[{label}] every WhatsApp link = wa.me/{NUM} (+91 97668 88897) with a pre-filled message', ok, f'{len(hs)} links')
        targets = page.eval_on_selector_all('a[data-wa]', 'els=>els.map(e=>e.getAttribute("target"))')
        if touch:
            check(f'[{label}] links open in the SAME tab (no target=_blank, which in-app browsers ignore)', all(t is None for t in targets), str(set(targets)))
        else:
            check(f'[{label}] links open WhatsApp in a new tab', all(t == '_blank' for t in targets), str(set(targets)))
        links = page.locator('a[data-wa]')
        vis = [i for i in range(links.count()) if links.nth(i).is_visible()]
        check(f'[{label}] visible WhatsApp buttons are not covered by any overlay', vis and all(topmost(links.nth(i)) for i in vis), f'{len(vis)} visible')
        btn = links.nth(vis[-1])
        btn.scroll_into_view_if_needed()
        if touch:
            btn.tap()
            page.wait_for_url(re.compile(r'^https://wa\.me/'), wait_until='commit', timeout=20000)
            msg = urllib.parse.unquote(hits[-1]) if hits else ''
            check(f'[{label}] tap goes straight to WhatsApp (same tab → app hand-off), message pre-filled',
                  msg.startswith(f'https://wa.me/{NUM}?text=Namaste') and len(ctx.pages) == 1, msg[:70])
        else:
            with ctx.expect_page(timeout=6000) as pop:
                btn.click()
            pop.value.wait_for_load_state()
            check(f'[{label}] click opens wa.me in a new tab', bool(hits) and f'wa.me/{NUM}' in hits[-1])
        ctx.close()

    # ── 2. the number comes from Admin → Restaurant Settings (no redeploy needed) ──
    sql("update public.restaurant_settings set whatsapp_number='919999988888'")
    ctx = b.new_context(**pw.devices['Pixel 7']); page = ctx.new_page(); prep(page, bottom=False)
    ok, hs = hrefs_ok(page, '919999988888')
    check('Changing the number in admin settings changes every button', ok, hs[0][:40] if hs else '')
    ctx.close()
    sql("update public.restaurant_settings set whatsapp_number='919766888897'")

    # ── 3. the reported case: Android tablet, receipt after placing an order ──
    ctx = b.new_context(**pw.devices['Galaxy Tab S4'])
    hits = []
    ctx.route(re.compile(r'https://wa\.me/.*'), lambda r: (hits.append(r.request.url), r.fulfill(status=200, content_type='text/html', body='<title>wa stub</title>'))[1])
    page = ctx.new_page(); prep(page, bottom=False)
    page.evaluate("document.getElementById('menu').scrollIntoView()"); page.wait_for_timeout(1200)
    card = page.locator('article', has=page.get_by_role('heading', name='Chicken Dum Biryani'))
    card.get_by_role('button', name='Add to Order').click(no_wait_after=True)
    page.wait_for_function("document.body.innerText.includes('Added Chicken Dum Biryani')", timeout=15000)
    page.get_by_role('button', name=re.compile('Open your order')).first.click()
    dlg = page.get_by_role('dialog', name='Your order')
    dlg.get_by_role('button', name='Continue to checkout').click()
    dlg.get_by_label('Full name *').fill('Tablet Test')
    dlg.get_by_label('Mobile number *').fill('9800000777')
    dlg.locator('#co-confirm').check(force=True)
    page.wait_for_timeout(900)
    page.get_by_role('button', name=re.compile('^Place order')).click()
    page.wait_for_selector('text=Thank you, Tablet', timeout=20000)
    bill = sql("select bill_number from public.orders where customer_phone='9800000777' order by created_at desc limit 1")[0]['bill_number']
    wa = dlg.get_by_role('link', name=re.compile('Message the restaurant'))
    wa.scroll_into_view_if_needed(); page.wait_for_timeout(400)
    page.screenshot(path='tests/output/v3_receipt_whatsapp_tablet.png')
    check('[Tablet receipt] WhatsApp button is not covered by anything', topmost(wa))
    check('[Tablet receipt] same-tab link with bill number in the message', wa.get_attribute('target') is None and bill in urllib.parse.unquote(wa.get_attribute('href')), bill)
    wa.tap()
    page.wait_for_url(re.compile(r'^https://wa\.me/'), wait_until='commit', timeout=20000)  # software-rendered 3D page unloads slowly here
    check('[Tablet receipt] tap hands off to WhatsApp with the order message', bool(hits) and bill in urllib.parse.unquote(hits[-1]), urllib.parse.unquote(hits[-1])[:80] if hits else 'none')
    ctx.close()

    # ── 4. ordering paused → cart shows the WhatsApp enquiry button (tablet) ──
    sql("update public.restaurant_settings set online_ordering_enabled=false")
    ctx = b.new_context(**pw.devices['Galaxy Tab S4']); page = ctx.new_page(); prep(page, bottom=False)
    page.evaluate("document.getElementById('menu').scrollIntoView()"); page.wait_for_timeout(1200)
    page.locator('article', has=page.get_by_role('heading', name='Chicken Dum Biryani')).get_by_role('button', name=re.compile('Add to Order|Add')).first.click(no_wait_after=True)
    page.wait_for_timeout(800)
    page.get_by_role('button', name=re.compile('Open your order')).first.click()
    enq = page.get_by_role('dialog', name='Your order').get_by_role('link', name=re.compile('Enquire on WhatsApp'))
    check('[Ordering paused] cart WhatsApp enquiry button present, same-tab, not covered',
          enq.count() == 1 and enq.get_attribute('target') is None and topmost(enq) and f'wa.me/{NUM}' in enq.get_attribute('href'))
    ctx.close()
    sql("update public.restaurant_settings set online_ordering_enabled=true")

    # ── 5. phone menu overlay (navbar) WhatsApp button ──
    ctx = b.new_context(**pw.devices['Pixel 7']); page = ctx.new_page(); prep(page, bottom=False)
    page.get_by_role('button', name=re.compile('Open menu', re.I)).first.click(); page.wait_for_timeout(900)
    nav_wa = page.locator('a[data-wa]:visible').first
    check('[Phone menu] WhatsApp button in the menu overlay is tappable', nav_wa.count() == 1 and topmost(nav_wa) and nav_wa.get_attribute('target') is None)
    ctx.close()

    # ── 6. fallback: WhatsApp does not open (page stays) → helper panel ──
    for label, devname in [('Android phone', 'Pixel 7'), ('Desktop', None)]:
        dev = pw.devices[devname] if devname else {'viewport': {'width': 1366, 'height': 800}}
        ctx = b.new_context(**dev)
        ctx.route(re.compile(r'https://wa\.me/.*'), lambda r: r.fulfill(status=204))  # 204 = nothing opens, page stays
        page = ctx.new_page(); prep(page)
        btn = page.locator('a[data-wa]:visible').last
        btn.scroll_into_view_if_needed()
        if devname:
            btn.tap()
        else:
            btn.click()  # the stubbed new tab gets an empty 204 response, so nothing opens and this tab stays in front
        panel = page.locator('[data-wa-fallback]')
        panel.wait_for(state='visible', timeout=7000)
        first = 'Open WhatsApp app' if devname else 'WhatsApp Web'
        check(f'[{label}] fallback panel appears when WhatsApp does not open', panel.is_visible())
        check(f'[{label}] fallback offers {first}, Call, Copy message, Copy number',
              all(panel.get_by_text(t).count() for t in [first, 'Call', 'Copy message', f'Copy +{NUM}']))
        href = panel.get_by_role('link', name=re.compile(first)).get_attribute('href')
        want = f'whatsapp://send?phone={NUM}&text=' if devname else f'https://web.whatsapp.com/send?phone={NUM}&text='
        check(f'[{label}] fallback link is correct ({want.split(":")[0]})', href.startswith(want), href[:60])
        check(f'[{label}] fallback is on top of everything', topmost(panel.get_by_role('link', name=re.compile('Call'))))
        page.keyboard.press('Escape')
        check(f'[{label}] fallback closes with Escape', panel.count() == 0)
        ctx.close()
    b.close()
print(f'\n{sum(res)}/{len(res)} checks passed')
sys.exit(0 if all(res) else 1)
