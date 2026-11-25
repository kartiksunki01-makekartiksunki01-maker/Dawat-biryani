"""Brand-video intro tests — LOCAL build with the mock backend (admin toggle is read from website_settings).
Covers: real playback, muted autoplay + playsinline, aspect ratio, Skip (immediate), sound toggle, natural end with
fade, scroll lock + release, once per session, admin off, returning visitors, preview, reduced motion, slow network,
broken file, hanging download, autoplay refused, mid-film stall, and no other site audio during the film."""
import sys, time, json, urllib.request
from playwright.sync_api import sync_playwright
URL = sys.argv[1]; assert URL.startswith('http://localhost')
MOCK = 'http://localhost:54400/__control'
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
OUT = 'tests/output/'
res = []
def check(n, c, d=''):
    res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + (f' — {d}' if d else ''), flush=True)
def sql(q):
    r = urllib.request.Request(MOCK, data=json.dumps({'sql': q}).encode(), headers={'content-type': 'application/json'}, method='POST'); return json.loads(urllib.request.urlopen(r, timeout=10).read())
INTRO = '[aria-label$="— intro"]'
VID = INTRO + ' video'
def set_site(enabled=True, returning=False):
    sql(f"update public.website_settings set intro_enabled={str(enabled).lower()}, intro_for_returning={str(returning).lower()}")

# in-page probes: when the overlay appears/disappears, video events, and every other media/audio start
PROBE = """window.__t={}; window.__ev=[]; window.__otherMedia=0; window.__audioCtx=0;
new MutationObserver(()=>{const el=document.querySelector('[aria-label$="— intro"]'); const now=performance.now();
  if(el && !window.__t.start) window.__t.start=now; if(!el && window.__t.start && !window.__t.end) window.__t.end=now;}).observe(document,{subtree:true,childList:true});
for (const e of ['playing','ended','error','waiting','pause']) document.addEventListener(e, ev=>{ if(ev.target.tagName==='VIDEO') window.__ev.push([e, Math.round(performance.now())]); }, true);
const op=HTMLMediaElement.prototype.play; HTMLMediaElement.prototype.play=function(){ if(this.tagName!=='VIDEO' || !this.closest('[aria-label$="— intro"]')) window.__otherMedia++; return op.apply(this, arguments); };
document.addEventListener('click',e=>{ if(e.target.closest&&e.target.closest('[aria-label="Skip intro"]')) window.__t.click=performance.now(); },true);
const AC=window.AudioContext; if(AC) window.AudioContext=function(...a){ window.__audioCtx++; return new AC(...a); };"""
def errors(page, errs):
    page.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    page.on('pageerror', lambda e: errs.append(f'PAGEERROR {e}'))
def locked(page):
    return page.evaluate("document.documentElement.style.overflow === 'hidden'")
def new(b, pw, device=None, **kw):
    ctx = b.new_context(**(pw.devices[device] if device else {}), **kw); page = ctx.new_page(); page.add_init_script(PROBE); return ctx, page

with sync_playwright() as pw:
    b = pw.chromium.launch(args=ARGS)
    set_site(True)

    # ═════ 1. Android phone (Pixel 7): real playback to the end ═════
    ctx, page = new(b, pw, 'Pixel 7'); errs = []; errors(page, errs)
    page.goto(URL, wait_until='domcontentloaded')
    page.locator(INTRO).wait_for(state='visible', timeout=8000)
    skip = page.get_by_role('button', name='Skip intro')
    check('Skip intro is available immediately when the intro appears', skip.is_visible())
    v = page.locator(VID)
    info = page.eval_on_selector(VID, "v=>({src:v.currentSrc||v.src, poster:v.poster, muted:v.muted, inline:v.hasAttribute('playsinline'), fit:getComputedStyle(v).objectFit})")
    check('Intro uses the uploaded film from /assets/videos (720p)', info['src'].endswith('/assets/videos/dawat-intro-720.mp4'), info['src'])
    check('Poster frame set (no black screen while loading)', info['poster'].endswith('dawat-intro-poster.jpg'))
    check('Muted autoplay with playsinline', info['muted'] and info['inline'])
    check('Not stretched or cropped (object-fit: contain)', info['fit'] == 'contain')
    page.wait_for_function("document.querySelector('[aria-label$=\"— intro\"]')?.dataset.introPhase==='playing'", timeout=8000)
    page.wait_for_function("document.querySelector('[aria-label$=\"— intro\"] video').currentTime > 1", timeout=8000)
    meta = page.eval_on_selector(VID, "v=>({w:v.videoWidth,h:v.videoHeight,d:v.duration,t:v.currentTime,paused:v.paused})")
    check('Film really plays in the browser (decoded frames, time advancing)', meta['w'] == 1280 and meta['h'] == 720 and not meta['paused'] and meta['t'] > 1, json.dumps(meta))
    check('Original 16:9 aspect ratio and ~10 s length', abs(meta['w'] / meta['h'] - 16 / 9) < 0.01 and 9.9 < meta['d'] < 10.2, f"{meta['d']:.2f}s")
    bb = skip.bounding_box(); vw = page.viewport_size['width']
    check('Skip is top-right with a 44px+ touch target', bb['x'] + bb['width'] > vw - 40 and bb['y'] < 60 and bb['height'] >= 44, json.dumps(bb))
    style = page.eval_on_selector('button[aria-label="Skip intro"]', "e=>{const s=getComputedStyle(e);return {bf:s.backdropFilter, bc:s.borderTopColor, bw:s.borderTopWidth, ff:s.fontFamily}}")
    check('Skip: dark glass + thin gold border + royal serif type', 'blur' in style['bf'] and style['bw'] == '1px' and '212, 175, 55' in style['bc'] and 'Cinzel' in style['ff'], json.dumps(style))
    page.screenshot(path=OUT + 'intro_video_phone.jpg', type='jpeg', quality=72)
    check('Scroll is locked while the film plays', locked(page))
    page.mouse.wheel(0, 900); page.wait_for_timeout(300)
    check('Wheel/scroll does not move the page behind the film', page.evaluate('scrollY') == 0)
    check('No 3D canvas mounted during the film (keeps playback smooth)', page.locator('#home canvas').count() == 0)
    snd = page.get_by_role('button', name='Turn intro sound on')
    snd.click()
    check('Sound toggle turns the film audio on', page.eval_on_selector(VID, 'v=>!v.muted') and page.locator('button[aria-pressed="true"]').count() == 1)
    page.get_by_role('button', name='Mute intro sound').click()
    check('Sound toggle mutes it again', page.eval_on_selector(VID, 'v=>v.muted'))
    page.locator(INTRO).wait_for(state='detached', timeout=20000)
    t = page.evaluate('window.__t'); ev = page.evaluate('window.__ev')
    names = [e[0] for e in ev]
    play_at = next(e[1] for e in ev if e[0] == 'playing'); end_at = next((e[1] for e in ev if e[0] == 'ended'), None)
    check('Film plays to its end (ended event)', end_at is not None, ','.join(names))
    gone = (t['end'] - end_at) / 1000 if end_at else 99
    check('Then a short cinematic fade into the homepage (0.5–1.6 s)', 0.5 <= gone <= 1.6, f'{gone:.2f}s')
    total = (t['end'] - t['start']) / 1000
    check('Whole intro ≈ the 10 s film (+ load and fade)', 10.0 <= total <= 14.0, f'{total:.2f}s')
    page.wait_for_timeout(400)
    check('Scroll lock released after the film', not locked(page) and page.evaluate("getComputedStyle(document.documentElement).overflow") != 'hidden')
    page.mouse.wheel(0, 700); page.wait_for_timeout(900)
    check('Homepage scrolls normally afterwards', page.evaluate('scrollY') > 50, str(page.evaluate('scrollY')))
    page.evaluate('scrollTo(0,0)'); page.wait_for_timeout(600)
    check('Navbar revealed after the intro', page.evaluate("getComputedStyle(document.querySelector('header')).opacity") == '1')
    page.wait_for_selector('#home canvas', timeout=20000)
    check('Main 3D story starts after the intro', page.locator('#home canvas').count() >= 1)
    check('No other media or site audio started during the film', page.evaluate('window.__otherMedia') == 0 and page.evaluate('window.__audioCtx') == 0)
    check('Session flag remembered', page.evaluate("sessionStorage.getItem('dawat-intro-seen')") == '1')
    page.screenshot(path=OUT + 'intro_after_phone.jpg', type='jpeg', quality=72)
    page.reload(wait_until='domcontentloaded'); page.wait_for_timeout(1200)
    check('Reload in the same session: no intro', page.locator(INTRO).count() == 0)
    page.goto(URL.rstrip('/') + '/track.html', wait_until='domcontentloaded'); page.goto(URL + '#menu', wait_until='domcontentloaded'); page.wait_for_timeout(1200)
    check('Internal navigation / coming back: no intro', page.locator(INTRO).count() == 0)
    check('Phone run: no console errors', len(errs) == 0, ' | '.join(errs[:4]))
    ctx.close()

    # ═════ 2. Android tablet (Galaxy Tab S4, landscape): Skip stops at once ═════
    ctx, page = new(b, pw, 'Galaxy Tab S4 landscape'); errs = []; errors(page, errs)
    page.goto(URL, wait_until='domcontentloaded')
    page.wait_for_function("document.querySelector('[aria-label$=\"— intro\"]')?.dataset.introPhase==='playing'", timeout=8000)
    page.wait_for_timeout(1200)
    page.screenshot(path=OUT + 'intro_video_tablet.jpg', type='jpeg', quality=72)
    bb = page.get_by_role('button', name='Skip intro').bounding_box(); vw = page.viewport_size['width']
    check('Tablet: Skip top-right, 44px+', bb['x'] + bb['width'] > vw - 60 and bb['y'] < 70 and bb['height'] >= 44)
    page.get_by_role('button', name='Skip intro').click()
    st = page.evaluate("(()=>{const v=document.querySelector('[aria-label$=\"— intro\"] video'); return v ? {paused:v.paused, muted:v.muted} : {gone:true}})()")
    check('Skip stops the film immediately (paused + silent)', st.get('gone') or (st['paused'] and st['muted']), json.dumps(st))
    page.locator(INTRO).wait_for(state='detached', timeout=5000)
    t = page.evaluate('window.__t'); dt = (t['end'] - t['click']) / 1000
    check('Skip removes the overlay within ~0.5 s (measured in the page)', dt < 0.6, f'{dt:.2f}s')
    page.wait_for_timeout(300)
    check('Skip releases the scroll lock', not locked(page))
    page.mouse.wheel(0, 700); page.wait_for_timeout(900)
    check('Tablet scrolls after skip', page.evaluate('scrollY') > 50)
    check('Skip is remembered for the session', page.evaluate("sessionStorage.getItem('dawat-intro-seen')") == '1')
    page.reload(wait_until='domcontentloaded'); page.wait_for_timeout(1200)
    check('After skip + reload: no intro', page.locator(INTRO).count() == 0)
    check('Tablet run: no console errors', len(errs) == 0, ' | '.join(errs[:4]))
    ctx.close()

    # ═════ 3. Tablet portrait + desktop looks; Escape skips on desktop ═════
    ctx, page = new(b, pw, 'Galaxy Tab S4')
    page.goto(URL, wait_until='domcontentloaded')
    page.wait_for_function("document.querySelector('[aria-label$=\"— intro\"]')?.dataset.introPhase==='playing'", timeout=8000)
    page.wait_for_timeout(5200); page.screenshot(path=OUT + 'intro_video_tablet_portrait.jpg', type='jpeg', quality=72); ctx.close()
    ctx, page = new(b, pw, viewport={'width': 1440, 'height': 900}); errs = []; errors(page, errs)
    page.goto(URL, wait_until='domcontentloaded')
    page.wait_for_function("document.querySelector('[aria-label$=\"— intro\"]')?.dataset.introPhase==='playing'", timeout=8000)
    page.wait_for_timeout(2500); page.screenshot(path=OUT + 'intro_video_desktop.jpg', type='jpeg', quality=72)
    page.get_by_role('button', name='Skip intro').hover(); page.wait_for_timeout(400)
    page.screenshot(path=OUT + 'intro_skip_hover.jpg', type='jpeg', quality=80, clip={'x': 1100, 'y': 0, 'width': 340, 'height': 120})
    page.keyboard.press('Escape'); page.locator(INTRO).wait_for(state='detached', timeout=3000)
    check('Desktop: Escape key skips the intro', page.locator(INTRO).count() == 0 and not locked(page))
    check('Desktop run: no console errors', len(errs) == 0, ' | '.join(errs[:4]))
    ctx.close()

    # ═════ 4. Slow connection (3G / Data Saver) gets the light 480p copy ═════
    ctx, page = new(b, pw, 'Pixel 7')
    page.add_init_script("Object.defineProperty(Navigator.prototype,'connection',{get:()=>({effectiveType:'3g',saveData:false})})")
    page.goto(URL, wait_until='domcontentloaded'); page.locator(INTRO).wait_for(state='visible', timeout=8000)
    src = page.eval_on_selector(VID, 'v=>v.currentSrc||v.src')
    check('3G: 480p light version is used', src.endswith('dawat-intro-480.mp4'), src)
    page.wait_for_function("document.querySelector('[aria-label$=\"— intro\"] video')?.currentTime > 0.5", timeout=8000)
    check('3G: light version plays', page.eval_on_selector(VID, 'v=>v.videoWidth') == 854)
    ctx.close()

    # ═════ 5. Failures never leave a black screen ═════
    ctx, page = new(b, pw, 'Pixel 7'); errs = []
    page.route('**/dawat-intro-720.mp4', lambda r: r.fulfill(status=404, body='nope'))
    page.goto(URL, wait_until='domcontentloaded'); page.locator(INTRO).wait_for(state='visible', timeout=8000)
    page.locator(INTRO).wait_for(state='detached', timeout=6000)
    t = page.evaluate('window.__t'); dt = (t['end'] - t['start']) / 1000
    check('Broken/missing video: site opens straight away', dt < 1.5, f'{dt:.2f}s')
    page.wait_for_timeout(300); check('Broken video: scroll released', not locked(page))
    ctx.close()

    ctx, page = new(b, pw, 'Pixel 7')
    page.route('**/dawat-intro-720.mp4', lambda r: None)  # never answers (dead connection)
    page.goto(URL, wait_until='domcontentloaded'); page.locator(INTRO).wait_for(state='visible', timeout=8000)
    page.wait_for_timeout(1200)
    poster_ok = page.evaluate("fetch(document.querySelector('[aria-label$=\"— intro\"] video').poster).then(r=>r.ok)")
    check('Hanging download: poster frame is shown meanwhile (not black)', poster_ok)
    page.screenshot(path=OUT + 'intro_slow_poster.jpg', type='jpeg', quality=70)
    page.locator(INTRO).wait_for(state='detached', timeout=12000)
    t = page.evaluate('window.__t'); dt = (t['end'] - t['start']) / 1000
    check('Hanging download: site opens after ~5 s', 4.8 <= dt <= 6.2, f'{dt:.2f}s')
    page.wait_for_timeout(300); check('Hanging download: scroll released', not locked(page))
    ctx.close()

    # autoplay refused (e.g. iPhone Low Power Mode): Play button, then real playback after a tap
    BLOCK = "(()=>{const op=HTMLMediaElement.prototype.play; let n=0; HTMLMediaElement.prototype.play=function(){ if(this.tagName==='VIDEO' && n++===0) return Promise.reject(new DOMException('blocked','NotAllowedError')); return op.apply(this, arguments); };})()"
    ctx, page = new(b, pw, 'Pixel 7'); page.add_init_script(BLOCK)
    page.goto(URL, wait_until='domcontentloaded'); page.locator(INTRO).wait_for(state='visible', timeout=8000)
    page.get_by_role('button', name='Play intro').wait_for(timeout=4000)
    check('Autoplay refused: "Play intro" button + Skip shown over the poster', page.get_by_role('button', name='Play intro').is_visible() and page.get_by_role('button', name='Skip intro').is_visible())
    page.screenshot(path=OUT + 'intro_blocked.jpg', type='jpeg', quality=70)
    page.get_by_role('button', name='Play intro').click()
    page.wait_for_function("document.querySelector('[aria-label$=\"— intro\"] video')?.currentTime > 0.5", timeout=8000)
    check('Autoplay refused: tapping Play starts the film', page.locator(INTRO).get_attribute('data-intro-phase') == 'playing')
    ctx.close()
    ctx, page = new(b, pw, 'Pixel 7'); page.add_init_script(BLOCK)
    page.goto(URL, wait_until='domcontentloaded'); page.locator(INTRO).wait_for(state='visible', timeout=8000)
    page.locator(INTRO).wait_for(state='detached', timeout=15000)
    t = page.evaluate('window.__t'); dt = (t['end'] - t['start']) / 1000
    check('Autoplay refused and no tap: site opens by itself (~8 s)', 7.8 <= dt <= 9.2, f'{dt:.2f}s')
    page.wait_for_timeout(300); check('…and scroll is released', not locked(page))
    ctx.close()

    # mid-film stall (buffering that never recovers)
    ctx, page = new(b, pw, 'Pixel 7')
    page.goto(URL, wait_until='domcontentloaded')
    page.wait_for_function("document.querySelector('[aria-label$=\"— intro\"] video')?.currentTime > 1", timeout=8000)
    t0 = page.evaluate("(()=>{const v=document.querySelector('[aria-label$=\"— intro\"] video'); v.pause(); v.dispatchEvent(new Event('waiting')); return performance.now();})()")
    page.locator(INTRO).wait_for(state='detached', timeout=12000)
    t = page.evaluate('window.__t'); dt = (t['end'] - t0) / 1000
    check('Frozen mid-film: site opens after ~4.5 s instead of a stuck frame', 4.4 <= dt <= 5.4, f'{dt:.2f}s')
    ctx.close()

    # ═════ 6. Settings & preferences ═════
    ctx, page = new(b, pw, 'Pixel 7', reduced_motion='reduce'); page.goto(URL, wait_until='domcontentloaded'); page.wait_for_timeout(1500)
    check('Reduced motion: intro not shown, page usable', page.locator(INTRO).count() == 0 and not locked(page))
    ctx.close()
    ctx, page = new(b, pw, 'Pixel 7'); page.add_init_script("try{localStorage.setItem('dawat-visited-v2','1')}catch(e){}")
    page.goto(URL, wait_until='domcontentloaded'); page.wait_for_timeout(1500)
    check('Returning visitor: no intro (admin default)', page.locator(INTRO).count() == 0)
    ctx.close()
    set_site(True, returning=True)
    ctx, page = new(b, pw, 'Pixel 7'); page.add_init_script("try{localStorage.setItem('dawat-visited-v2','1')}catch(e){}")
    page.goto(URL, wait_until='domcontentloaded')
    check('Returning visitor with admin "show to returning" ON: intro shown', page.locator(INTRO).wait_for(state='visible', timeout=8000) is None)
    ctx.close()
    set_site(False)
    ctx, page = new(b, pw, 'Pixel 7'); page.goto(URL, wait_until='domcontentloaded'); page.wait_for_timeout(1800)
    check('Admin turned the intro off: not shown', page.locator(INTRO).count() == 0)
    check('…and the page is usable straight away', not locked(page))
    page.goto(URL + '?intro=preview', wait_until='domcontentloaded')
    check('Admin preview (?intro=preview) still plays it', page.locator(INTRO).wait_for(state='visible', timeout=8000) is None)
    page.wait_for_function("document.querySelector('[aria-label$=\"— intro\"] video')?.currentTime > 0.5", timeout=8000)
    check('Preview plays the film', page.locator(INTRO).get_attribute('data-intro-phase') == 'playing')
    ctx.close()
    set_site(True)
    b.close()
print(f'\n{sum(res)}/{len(res)} checks passed'); sys.exit(0 if all(res) else 1)
