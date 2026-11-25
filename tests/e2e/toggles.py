"""Royal toggles: site settings panel + admin switches — look, keyboard, state, and the sound behaviour behind them."""
import sys, json, uuid, urllib.request
from playwright.sync_api import sync_playwright
URL = sys.argv[1]; assert URL.startswith('http://localhost')
MOCK = 'http://localhost:54400/__control'; OUT = 'tests/output/'
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
SKIP = "try{localStorage.setItem('dawat-visited-v2','1');sessionStorage.setItem('dawat-intro-seen','1')}catch(e){}"
res = []
def check(n, c, d=''):
    res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + (f' — {d}' if d else ''), flush=True)
def sql(q):
    r = urllib.request.Request(MOCK, data=json.dumps({'sql': q}).encode(), headers={'content-type': 'application/json'}, method='POST'); return json.loads(urllib.request.urlopen(r, timeout=10).read())
A = str(uuid.uuid4())
sql(f"insert into auth.users (id, email, pw) values ('{A}', 'owner2@test.local', 'test-password-123')"); sql(f"insert into public.admins (user_id) values ('{A}')")
SW = "e=>{const s=getComputedStyle(e), a=getComputedStyle(e,'::after'); return {w:s.width,h:s.height,bg:s.backgroundImage.slice(0,40),thumb:a.transform}}"
with sync_playwright() as pw:
    b = pw.chromium.launch(args=ARGS)
    for label, kw in [('desktop', {'viewport': {'width': 1440, 'height': 900}}), ('phone', pw.devices['Pixel 7'])]:
        ctx = b.new_context(**kw); page = ctx.new_page(); page.add_init_script(SKIP)
        errs = []; page.on('pageerror', lambda e: errs.append(str(e))); page.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        page.goto(URL, wait_until='networkidle'); page.wait_for_timeout(1500)
        page.locator('[aria-controls="settings-panel"]').click(); page.wait_for_timeout(700)
        panel = page.locator('#settings-panel')
        check(f'{label}: settings panel opens with title', panel.is_visible() and 'Sound & preferences' in panel.inner_text())
        check(f'{label}: old "Graphics quality" control removed (3D story is gone)', 'Graphics quality' not in panel.inner_text())
        sw = page.locator('#settings-panel input[role=switch]').nth(0)
        check(f'{label}: Sound is ON after the first tap (music started)', sw.is_checked())
        off = page.eval_on_selector('#settings-panel .royal-switch', SW)
        check(f'{label}: royal switch rendered (gold gradient track, 49.6×28 px)', abs(float(off['w'][:-2]) - 49.6) < 0.1 and off['h'] == '28px' and 'gradient' in off['bg'], json.dumps(off))
        page.screenshot(path=f'{OUT}toggles_{label}_on.jpg', type='jpeg', quality=82, clip=panel.bounding_box())
        page.locator('#settings-panel label').first.click(); page.wait_for_timeout(700)
        check(f'{label}: tapping the row turns Sound off', not sw.is_checked())
        check(f'{label}: Music/Effects dim + disabled while Sound is off', page.locator('#settings-panel input[role=switch]').nth(1).is_disabled() and page.locator('#settings-panel input[role=switch]').nth(2).is_disabled())
        page.screenshot(path=f'{OUT}toggles_{label}_off.jpg', type='jpeg', quality=82, clip=panel.bounding_box())
        sw.focus(); page.keyboard.press('Space'); page.wait_for_timeout(500)
        check(f'{label}: keyboard Space toggles it back on', sw.is_checked())
        th = page.eval_on_selector('#settings-panel .royal-switch', SW)['thumb']
        check(f'{label}: thumb slid to the ON side', th != 'none', th)
        check(f'{label}: no console errors', not errs, ' | '.join(errs[:3]))
        ctx.close()
    # admin switches
    ctx = b.new_context(viewport={'width': 1366, 'height': 900}); page = ctx.new_page()
    page.goto(URL.rstrip('/') + '/admin.html#media', wait_until='domcontentloaded')
    page.get_by_label('Email').fill('owner2@test.local'); page.get_by_label('Password').fill('test-password-123'); page.get_by_role('button', name='Sign in').click()
    page.get_by_role('switch', name='Show the intro', exact=True).wait_for(timeout=15000); page.wait_for_timeout(800)
    s1 = page.get_by_role('switch', name='Show the intro', exact=True)
    check('admin: switches use the royal style', page.locator('.royal-switch').count() >= 3)
    before = s1.is_checked(); page.locator('label', has_text='Show the intro').first.click(); page.wait_for_timeout(400)
    check('admin: clicking a switch changes it', s1.is_checked() != before)
    page.locator('label', has_text='Show the intro').first.click()
    page.screenshot(path=f'{OUT}toggles_admin.jpg', type='jpeg', quality=80)
    ctx.close(); b.close()
print(f'\n{sum(res)}/{len(res)} checks passed'); sys.exit(0 if all(res) else 1)
