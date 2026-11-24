"""WhatsApp button tests (LOCAL build only). wa.me / web.whatsapp.com are stubbed — a real WhatsApp app cannot be
tested from a server; these tests prove the link is correct, tappable (not covered by anything) and opens/falls back."""
import sys, re, urllib.parse
from playwright.sync_api import sync_playwright
URL = sys.argv[1]
assert URL.startswith('http://localhost')
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
res = []
def check(n, c, d=''):
    res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + (f' — {d}' if d else ''), flush=True)

def prep(page):
    page.add_init_script("try{localStorage.setItem('dawat-visited-v2','1');sessionStorage.setItem('dawat-intro-seen','1')}catch(e){}")
    page.goto(URL, wait_until='domcontentloaded')
    page.wait_for_timeout(1500)
    page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
    page.wait_for_timeout(800)

def topmost(page, loc):
    """True when the element under the centre of the control is the control itself (nothing overlaps it)."""
    loc.scroll_into_view_if_needed()
    return loc.evaluate("""el => { const r=el.getBoundingClientRect(); const t=document.elementFromPoint(r.left+r.width/2, r.top+r.height/2); return !!t && (el===t || el.contains(t)); }""")

with sync_playwright() as pw:
    b = pw.chromium.launch(args=ARGS)
    for label, dev in [('Android phone', pw.devices['Pixel 7']), ('iPhone', pw.devices['iPhone 14']), ('Desktop', {'viewport': {'width': 1366, 'height': 800}})]:
        mobile = label != 'Desktop'
        ctx = b.new_context(**dev)
        hits = []
        ctx.route(re.compile(r'https://(wa\.me|web\.whatsapp\.com)/.*'), lambda r: (hits.append(r.request.url), r.fulfill(status=200, content_type='text/html', body='<title>wa stub</title>'))[1])
        page = ctx.new_page()
        prep(page)
        links = page.locator('a[data-wa]')
        n = links.count()
        check(f'[{label}] WhatsApp buttons present on the page', n >= 1, f'{n} found')
        hrefs = page.eval_on_selector_all('a[data-wa]', 'els=>els.map(e=>e.href)')
        ok = all(re.match(r'^https://wa\.me/919823324553\?text=.+', h) for h in hrefs)
        check(f'[{label}] every link is wa.me/<91 country code + number> with prefilled text', ok, hrefs[0][:90] if hrefs else '')
        vis = [l for l in range(n) if links.nth(l).is_visible()]
        check(f'[{label}] visible WhatsApp button is not covered by any overlay', vis and all(topmost(page, links.nth(i)) for i in vis))
        btn = links.nth(vis[-1])
        btn.scroll_into_view_if_needed()
        before = len(ctx.pages)
        if mobile:
            with page.expect_navigation(timeout=5000):
                btn.click()
            check(f'[{label}] tap opens WhatsApp link in the same tab (hand-off to the app)', hits and hits[-1].startswith('https://wa.me/919823324553?text=') and urllib.parse.unquote(hits[-1]).startswith('https://wa.me/919823324553?text=Namaste'), hits[-1][:60] if hits else 'none')
        else:
            with ctx.expect_page(timeout=5000) as pop:
                btn.click()
            p2 = pop.value; p2.wait_for_load_state()
            check(f'[{label}] click opens wa.me in a new tab', hits and 'wa.me/919823324553' in hits[-1])
        ctx.close()

    # fallback: WhatsApp unavailable (same-tab nav is blocked, page stays) → helper panel appears with working options
    ctx = b.new_context(**pw.devices['Pixel 7'])
    ctx.route(re.compile(r'https://wa\.me/.*'), lambda r: r.fulfill(status=204))  # 204 = browser stays on the page, nothing opens
    page = ctx.new_page(); prep(page)
    btn = page.locator('a[data-wa]:visible').last
    btn.scroll_into_view_if_needed()
    btn.click()
    panel = page.locator('[data-wa-fallback]')
    panel.wait_for(state='visible', timeout=6000)
    check('Fallback panel appears when WhatsApp does not open', panel.is_visible())
    check('Fallback offers WhatsApp Web, Call, Copy message, Copy number', all(panel.get_by_text(t).count() for t in ['WhatsApp Web', 'Call', 'Copy message', 'Copy +919823324553']))
    check('Fallback WhatsApp Web link is web.whatsapp.com with number', 'web.whatsapp.com/send?phone=919823324553' in panel.get_by_role('link', name=re.compile('WhatsApp Web')).get_attribute('href'))
    check('Fallback is not hidden behind anything', topmost(page, panel.get_by_role('link', name=re.compile('Call'))))
    panel.get_by_role('button', name='Close').click()
    check('Fallback can be closed', panel.count() == 0)
    ctx.close(); b.close()
print(f'\n{sum(res)}/{len(res)} checks passed')
sys.exit(0 if all(res) else 1)
