import sys, time, json, urllib.parse, datetime, re
import os; os.makedirs('tests/output', exist_ok=True)
# Usage:  npm run build && npm run preview   (in another terminal)
#         pip install playwright && python -m playwright install chromium
#         python tests/e2e_test.py http://localhost:4173/
# Optional: CHROME_PATH=/path/to/chrome to use an installed Chrome.
CHROME = os.environ.get('CHROME_PATH')
def launch(pw, args):
    return pw.chromium.launch(executable_path=CHROME, args=args) if CHROME else pw.chromium.launch(args=args)
from playwright.sync_api import sync_playwright, expect
URL = sys.argv[1]
assert URL.startswith('http://localhost'), 'run against a LOCAL build connected to the local test backend, never production'
OUT = 'tests/output/'
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
results = []
def check(name, cond, detail=''):
    results.append((name, bool(cond), detail))
    print(('PASS ' if cond else 'FAIL ') + name + (f' — {detail}' if detail else ''), flush=True)

IGNORE = ('GPU stall', 'Clock: This module', 'React DevTools', 'GL Driver', 'swiftshader', 'WebGL-', 'Automatic fallback')
def attach(page, errs):
    page.on('console', lambda m: errs.append(f'{m.type}: {m.text}') if m.type in ('error','warning') and not any(i in m.text for i in IGNORE) else None)
    page.on('pageerror', lambda e: errs.append(f'PAGEERROR: {e}'))

def scroll_story(page, frac):
    page.evaluate(f"() => {{ const el=document.getElementById('home'); window.scrollTo(0, el.offsetTop + (el.offsetHeight - innerHeight)*{frac}); }}")

def goto_section(page, sid):
    page.evaluate(f"() => {{ const el=document.getElementById('{sid}'); window.scrollTo(0, el.getBoundingClientRect().top + scrollY - 80); }}")
    time.sleep(1.2)

with sync_playwright() as p:
    b = launch(p, ARGS)

    # ── 1. Desktop: intro, story, menu, cart, bulk ──
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, permissions=['clipboard-read', 'clipboard-write'])
    page = ctx.new_page(); errs = []; attach(page, errs)
    t0 = time.time()
    page.goto(URL, wait_until='domcontentloaded')
    page.wait_for_timeout(600)
    check('Skip Intro control visible', page.get_by_role('button', name='Skip intro').is_visible())
    time.sleep(1.0); page.screenshot(path=OUT+'intro_1.png')
    time.sleep(1.4); page.screenshot(path=OUT+'intro_2.png')
    page.wait_for_selector('[aria-label$="— intro"]', state='detached', timeout=25000)
    check('Intro finishes and unmounts', True, f'{time.time()-t0:.1f}s after load')
    check('Visitor remembered (returning visitors skip the intro)', page.evaluate("localStorage.getItem('dawat-visited-v2')") == '1')
    time.sleep(1.5)
    check('3D scroll story removed: static royal hero, no 3D canvas', page.locator('#home[data-mode=static]').count() == 1 and page.locator('#home canvas').count() == 0)
    check('Hero headline + Dum callouts kept', page.get_by_text('Awakened by Fire.').first.is_visible() and page.locator('#dum-experience').count() == 1)
    check('Opening section is normal height (no long pinned scroll)', page.evaluate("document.getElementById('home').offsetHeight < innerHeight*2.2"), str(page.evaluate("document.getElementById('home').offsetHeight")))
    time.sleep(1)
    page.screenshot(path=OUT+'final_desktop_hero.png')


    # Menu filter + search
    goto_section(page, 'menu')
    page.get_by_role('tablist', name='Menu categories').get_by_role('tab', name='Vegetarian').click(); time.sleep(2.0)
    n_veg = page.locator('#menu-grid article').count()
    check('Vegetarian filter', n_veg == 3, f'{n_veg} cards')
    page.get_by_role('tablist', name='Menu categories').get_by_role('tab', name='Seafood').click(); time.sleep(2.0)
    check('Seafood filter', page.locator('#menu-grid article').count() == 1)
    page.get_by_role('tablist', name='Menu categories').get_by_role('tab', name='All').click(); time.sleep(2.0)
    check('All shows 12 items', page.locator('#menu-grid article').count() == 12, str(page.locator('#menu-grid article').count()))
    page.get_by_placeholder('Search biryani, gravy, paneer…').fill('mutton'); time.sleep(2.2)
    check('Search "mutton"', page.locator('#menu-grid article').count() == 1)
    page.get_by_placeholder('Search biryani, gravy, paneer…').fill('xyz'); time.sleep(0.8)
    check('Search empty state', page.get_by_text('No dishes match').is_visible())
    page.get_by_role('button', name='Clear search').click(); time.sleep(0.8)

    # Add to order
    card = page.locator('article', has=page.get_by_role('heading', name='Chicken Dum Biryani'))
    card.locator('label', has_text='Large').click()
    card.get_by_role('button', name='Increase quantity of Chicken Dum Biryani').click()
    card.get_by_role('button', name='Add to Order').click(); time.sleep(0.6)
    mcard = page.locator('article', has=page.get_by_role('heading', name='Mutton Biryani'))
    mcard.get_by_role('button', name='Add to Order').click(); time.sleep(0.6)
    badge = page.get_by_role('button', name='Open your order (3 items)')
    check('Cart badge shows 3', badge.count() == 1)
    page.screenshot(path=OUT+'final_desktop_menu.png')
    badge.click(); time.sleep(1)
    dlg = page.get_by_role('dialog', name='Your order')
    check('Cart drawer opens', dlg.is_visible())
    sub = dlg.locator('text=Items subtotal').locator('..').inner_text()
    check('Subtotal 2×150 + 220 = ₹520', '520' in sub, sub.replace('\n', ' '))
    dlg.get_by_role('button', name='Increase quantity of Mutton Biryani').click(); time.sleep(0.5)
    sub = dlg.locator('text=Items subtotal').locator('..').inner_text()
    check('Qty change → ₹740', '740' in sub, sub.replace('\n', ' '))
    dlg.get_by_role('button', name='Remove Chicken Dum Biryani').click(); time.sleep(0.8)
    sub = dlg.locator('text=Items subtotal').locator('..').inner_text()
    check('Remove line → ₹440', '440' in sub, sub.replace('\n', ' '))
    dlg.get_by_role('button', name='Continue to checkout').click(); time.sleep(0.8)
    check('Checkout opens with details form', dlg.get_by_label('Full name *').is_visible() and dlg.get_by_label('Mobile number *').is_visible())
    page.get_by_role('button', name=re.compile('^Place order')).click(); time.sleep(0.5)
    check('Validation blocks empty name', dlg.get_by_text('Please enter your name.').is_visible())
    dlg.get_by_label('Full name *').fill('Asha')
    dlg.get_by_label('Mobile number *').fill('12345')
    page.get_by_role('button', name=re.compile('^Place order')).click(); time.sleep(0.3)
    check('Validation flags invalid phone', dlg.get_by_text('Enter a valid 10-digit Indian mobile number.').is_visible())
    page.screenshot(path=OUT+'final_desktop_cart.png')
    dlg.get_by_role('button', name='Back to items').click(); time.sleep(0.5)
    check('Back returns to items', dlg.get_by_role('button', name='Continue to checkout').is_visible())
    page.keyboard.press('Escape'); time.sleep(2.5)
    check('Escape closes drawer', not page.get_by_role('dialog', name='Your order').is_visible())

    # Persistence
    page.reload(wait_until='domcontentloaded'); time.sleep(3)
    check('Cart persists after reload', page.get_by_role('button', name='Open your order (2 items)').count() == 1)

    # Product sheet
    goto_section(page, 'menu')
    page.locator('article', has=page.get_by_role('heading', name='Chicken Tikka Biryani')).get_by_role('button', name='Details & instructions').click()
    time.sleep(1.2)
    ps = page.get_by_role('dialog', name='Chicken Tikka Biryani')
    check('Product detail opens', ps.is_visible())
    page.screenshot(path=OUT+'final_desktop_product.png')
    check('No crossed-out ₹150 for Chicken Tikka', '₹150' not in ps.inner_text())
    page.keyboard.press('Escape'); time.sleep(0.8)

    # Bulk & Special Orders (V3.6: add a dish, then the enquiry; times are Asia/Kolkata)
    goto_section(page, 'bulk-orders'); time.sleep(1.5)
    card = page.locator('[data-bulk-card="chicken-dum-biryani"]')
    for _ in range(3): card.get_by_role('button', name=re.compile('^Increase')).click()
    card.get_by_role('button', name=re.compile('^Add 8 kg')).click(); time.sleep(0.6)
    check('Bulk: 8 kg Chicken Dum Biryani added to a separate bulk order (₹6,400)', page.locator('[data-bulk-line="chicken-dum-biryani"]').count() == 1 and '₹6,400' in page.locator('#bulk-summary').inner_text())
    form = page.get_by_role('form', name='Bulk order enquiry')
    form.scroll_into_view_if_needed(); time.sleep(0.8)
    ist_now = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=5, minutes=30)
    soon = ist_now + datetime.timedelta(minutes=50)
    form.get_by_label('Preferred date *').fill(soon.strftime('%Y-%m-%d'))
    form.get_by_label('Preferred time *').fill(soon.strftime('%H:%M'))
    time.sleep(0.4)
    check('Bulk 8 kg needs 2h notice warning', form.get_by_role('alert').count() == 1)
    later = ist_now + datetime.timedelta(hours=3)
    form.get_by_label('Preferred date *').fill(later.strftime('%Y-%m-%d'))
    form.get_by_label('Preferred time *').fill(later.strftime('%H:%M'))
    form.get_by_label('Your name *').fill('Ravi')
    form.get_by_label('Mobile number *').fill('98765 43210')
    form.locator('input[type=checkbox]').check()
    form.get_by_role('button', name=re.compile('^Submit Bulk Order Enquiry')).click()
    page.wait_for_selector('text=Enquiry received by the restaurant', timeout=15000)
    check('Bulk enquiry saved and confirmed by the server', form.get_by_role('link', name=re.compile('Also send on WhatsApp')).get_attribute('href').startswith('https://wa.me/919766888897?text='))
    page.screenshot(path=OUT+'final_desktop_bulk.png')

    # Settings: sound panel (graphics quality removed with the 3D story)
    page.get_by_role('button', name='Experience settings').click(); time.sleep(0.5)
    check('Settings panel shows the royal sound switches', page.locator('#settings-panel .royal-switch').count() == 3 and 'Graphics quality' not in page.locator('#settings-panel').inner_text())
    page.keyboard.press('Escape')

    # Live chat (replaced Ask Anna)
    check('Live chat launcher present (no-backend build hides it; mock build shows it)', page.get_by_test_id('chat-launcher').count() in (0, 1) and page.get_by_text('Ask Anna').count() == 0)

    # Links
    check('Directions link', 'google.com/maps/dir/?api=1&destination=' in (page.get_by_role('link', name='Get Directions').get_attribute('href') or ''))
    check('Instagram link', page.locator('a[href="https://www.instagram.com/dawat_biryani.house/"]').count() >= 1)
    check('YouTube link', page.locator('a[href="https://youtube.com/@DawatBiryani"]').count() >= 1)
    check('Google link', page.locator('a[href="https://share.google/KOk8JvC1YqLWS2DWb"]').count() >= 1)
    check('No horizontal overflow (desktop)', page.evaluate('document.documentElement.scrollWidth <= innerWidth'))
    check('Desktop console clean', len(errs) == 0, ' | '.join(errs[:6]))
    ctx.close()

    # ── 2. Mobile ──
    m = p.devices['Pixel 7']
    ctx = b.new_context(**m)
    page = ctx.new_page(); errs = []; attach(page, errs)
    page.add_init_script("localStorage.setItem('dawat-visited-v2','1')")
    page.goto(URL, wait_until='domcontentloaded'); time.sleep(5)
    page.screenshot(path=OUT+'final_mobile_hero.png')
    check('No horizontal overflow (mobile)', page.evaluate('document.documentElement.scrollWidth <= innerWidth'), str(page.evaluate('[document.documentElement.scrollWidth, innerWidth]')))
    page.get_by_role('button', name='Open menu').click(); time.sleep(1)
    nav = page.get_by_role('dialog', name='Site navigation')
    check('Mobile nav drawer opens', nav.is_visible())
    page.screenshot(path=OUT+'final_mobile_nav.png')
    nav.get_by_role('button', name='Signature Menu').click(); time.sleep(2.5)
    check('Mobile nav closes after selection', not page.get_by_role('dialog', name='Site navigation').is_visible())
    page.screenshot(path=OUT+'final_mobile_menu.png')
    small = page.evaluate("""() => [...document.querySelectorAll('#menu button, #menu a, #menu input:not(.sr-only)')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 2 && (r.height < 36 || r.width < 36); }).map(e => (e.getAttribute('aria-label') || e.textContent || '').trim().slice(0,30) + ':' + Math.round(e.getBoundingClientRect().height))""")
    check('Menu touch targets ≥36px', len(small) == 0, '; '.join(small[:6]))
    page.locator('article', has=page.get_by_role('heading', name='Vegetable Paneer Biryani')).get_by_role('button', name='Add to Order').tap()
    time.sleep(0.5)
    page.get_by_role('button', name='Open your order (1 item)').tap(); time.sleep(1)
    page.screenshot(path=OUT+'final_mobile_cart.png')
    page.keyboard.press('Escape'); time.sleep(0.6)
    for sid in ['our-story', 'bulk-orders', 'gallery', 'visit']:
        goto_section(page, sid); time.sleep(1.4)
        page.screenshot(path=OUT+f'final_mobile_{sid}.png')
    check('Mobile console clean', len(errs) == 0, ' | '.join(errs[:6]))
    ctx.close()

    # ── 3. Xiaomi Pad 6 (approx. CSS viewport) landscape + portrait ──
    for name, vp in [('tablet_landscape', {'width': 1280, 'height': 800}), ('tablet_portrait', {'width': 800, 'height': 1280})]:
        ctx = b.new_context(viewport=vp, device_scale_factor=2, is_mobile=True, has_touch=True)
        page = ctx.new_page(); errs = []; attach(page, errs)
        page.add_init_script("localStorage.setItem('dawat-visited-v2','1')")
        page.goto(URL, wait_until='domcontentloaded'); time.sleep(5)
        page.screenshot(path=OUT+f'final_{name}_hero.png')
        goto_section(page, 'menu'); time.sleep(1.2)
        page.screenshot(path=OUT+f'final_{name}_menu.png')
        check(f'{name}: no horizontal overflow', page.evaluate('document.documentElement.scrollWidth <= innerWidth'))
        check(f'{name}: console clean', len(errs) == 0, ' | '.join(errs[:4]))
        ctx.close()

    # ── 4. Reduced motion ──
    ctx = b.new_context(viewport={'width': 1280, 'height': 800}, reduced_motion='reduce')
    page = ctx.new_page(); errs = []; attach(page, errs)
    t0 = time.time()
    page.goto(URL, wait_until='domcontentloaded')
    page.wait_for_selector('[aria-label$="— intro"]', state='detached', timeout=10000)
    check('Reduced motion: no intro, page ready quickly', time.time() - t0 < 4.5, f'{time.time()-t0:.1f}s')
    check('Reduced motion: no smooth-scroll (Lenis) class', not page.evaluate("document.documentElement.classList.contains('lenis')"))
    scroll_story(page, 0.4); time.sleep(1.5)
    page.screenshot(path=OUT+'final_reduced_motion.png')
    check('Reduced motion console clean', len(errs) == 0, ' | '.join(errs[:4]))
    ctx.close()
    b.close()

    # ── 5. No WebGL fallback ──
    b = launch(p, ['--disable-webgl', '--disable-3d-apis', '--disable-gpu'])
    ctx = b.new_context(viewport={'width': 1280, 'height': 800})
    page = ctx.new_page(); errs = []; attach(page, errs)
    page.goto(URL, wait_until='domcontentloaded')
    page.wait_for_selector('[aria-label$="— intro"]', state='detached', timeout=25000)
    time.sleep(1)
    check('No-WebGL: static fallback hero', page.locator('#home[data-mode=static]').count() == 1)
    page.screenshot(path=OUT+'final_nowebgl.png')
    goto_section(page, 'menu')
    page.locator('article', has=page.get_by_role('heading', name='Prawns Biryani')).get_by_role('button', name='Add to Order').click(); time.sleep(0.5)
    check('No-WebGL: ordering still works', page.get_by_role('button', name='Open your order (1 item)').count() == 1)
    page.get_by_role('button', name='Experience the Dum').click(); time.sleep(1.5)
    check('No-WebGL: Dum Experience anchor works', page.evaluate("Math.abs(document.getElementById('dum-experience').getBoundingClientRect().top) < 200"))
    check('No-WebGL console clean', len(errs) == 0, ' | '.join(errs[:4]))
    b.close()

passed = sum(1 for r in results if r[1]); print(f'\n{passed}/{len(results)} checks passed')
json.dump(results, open(OUT+'results.json', 'w'), indent=1)
