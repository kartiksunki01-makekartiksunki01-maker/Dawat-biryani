"""Logo intro tests — LOCAL build with the mock backend (admin toggle is read from website_settings)."""
import sys, time, json, urllib.request
from playwright.sync_api import sync_playwright
URL = sys.argv[1]; assert URL.startswith('http://localhost')
MOCK = 'http://localhost:54400/__control'
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
res = []
def check(n, c, d=''):
    res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + (f' — {d}' if d else ''), flush=True)
def sql(q):
    r = urllib.request.Request(MOCK, data=json.dumps({'sql': q}).encode(), headers={'content-type': 'application/json'}, method='POST'); return json.loads(urllib.request.urlopen(r, timeout=10).read())
INTRO = '[aria-label$="— intro"]'
def set_site(enabled=True, dur=2400, returning=False):
    sql(f"update public.website_settings set intro_enabled={str(enabled).lower()}, intro_duration_ms={dur}, intro_for_returning={str(returning).lower()}")

with sync_playwright() as pw:
    b = pw.chromium.launch(args=ARGS)
    set_site(True, 2400)
    ctx = b.new_context(**pw.devices['Pixel 7']); page = ctx.new_page()
    t0 = time.time(); page.goto(URL, wait_until='domcontentloaded')
    page.locator(INTRO).wait_for(state='visible', timeout=8000); t0 = time.time()
    page.wait_for_timeout(600); page.screenshot(path='tests/output/intro_a.jpg', type='jpeg', quality=70)
    page.wait_for_timeout(900); page.screenshot(path='tests/output/intro_b.jpg', type='jpeg', quality=70)
    check('Intro shows the original logo image', page.locator(INTRO + ' img[alt$="logo"]').is_visible() and page.eval_on_selector(INTRO + ' img', 'i=>i.naturalWidth>0'))
    check('Skip intro button visible, 44px tall', page.get_by_role('button', name='Skip intro').is_visible() and page.get_by_role('button', name='Skip intro').bounding_box()['height'] >= 44)
    check('No 3D canvas is mounted during the intro', page.locator('canvas').count() == 0)
    page.locator(INTRO).wait_for(state='detached', timeout=8000)
    dur = time.time() - t0
    check('Intro length (from first frame) is within 2–3 s', 1.8 <= dur <= 3.4, f'{dur:.2f}s')
    check('Scroll is unlocked afterwards', page.evaluate("getComputedStyle(document.body).overflow !== 'hidden'"))
    check('Session flag remembered', page.evaluate("sessionStorage.getItem('dawat-intro-seen')") == '1')
    page.reload(wait_until='domcontentloaded'); page.wait_for_timeout(800)
    check('Reload in the same session: no intro', page.locator(INTRO).count() == 0)
    page.goto(URL.rstrip('/') + '/track.html', wait_until='domcontentloaded'); page.goto(URL, wait_until='domcontentloaded'); page.wait_for_timeout(800)
    check('Navigating away and back: no intro', page.locator(INTRO).count() == 0)
    ctx.close()

    # skip → remembered, immediate
    ctx = b.new_context(**pw.devices['Pixel 7']); page = ctx.new_page(); page.goto(URL, wait_until='domcontentloaded')
    page.get_by_role('button', name='Skip intro').click(); t1 = time.time()
    page.locator(INTRO).wait_for(state='detached', timeout=3000)
    check('Skip closes the intro quickly', time.time() - t1 < 1.5, f'{time.time()-t1:.2f}s')
    check('Skip is remembered for the session', page.evaluate("sessionStorage.getItem('dawat-intro-seen')") == '1')
    page.reload(wait_until='domcontentloaded'); page.wait_for_timeout(600)
    check('After skip + reload: no intro', page.locator(INTRO).count() == 0)
    ctx.close()

    # reduced motion
    ctx = b.new_context(**pw.devices['Pixel 7'], reduced_motion='reduce'); page = ctx.new_page(); page.goto(URL, wait_until='domcontentloaded'); page.wait_for_timeout(900)
    check('Reduced motion: intro not shown', page.locator(INTRO).count() == 0)
    ctx.close()

    # admin toggle off
    set_site(False)
    ctx = b.new_context(**pw.devices['Pixel 7']); page = ctx.new_page(); page.goto(URL, wait_until='domcontentloaded'); page.wait_for_timeout(1500)
    check('Admin disabled the intro: it is not shown', page.locator(INTRO).count() == 0)
    check('Page is usable straight away', page.evaluate("getComputedStyle(document.body).overflow !== 'hidden'"))
    ctx.close()
    # desktop look
    set_site(True, 2400)
    ctx = b.new_context(viewport={'width': 1366, 'height': 800}); page = ctx.new_page(); page.goto(URL, wait_until='domcontentloaded'); page.wait_for_timeout(1500)
    page.screenshot(path='tests/output/intro_desktop.jpg', type='jpeg', quality=70); ctx.close(); b.close()
print(f'\n{sum(res)}/{len(res)} checks passed'); sys.exit(0 if all(res) else 1)
