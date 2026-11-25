"""Heading typography checks (upright Playfair, gold gradient kept, sizes −1 %) on phone, tablet and desktop.
usage: typography.py <url> [out-prefix] [--before]   (--before = old build: only screenshots, no assertions)"""
import sys, json, re
from playwright.sync_api import sync_playwright
URL = sys.argv[1]; assert URL.startswith('http://localhost')
PREFIX = sys.argv[2] if len(sys.argv) > 2 and not sys.argv[2].startswith('--') else 'type'
BEFORE = '--before' in sys.argv
OUT = 'tests/output/'
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
SKIP_INTRO = "try{localStorage.setItem('dawat-visited-v2','1');sessionStorage.setItem('dawat-intro-seen','1')}catch(e){}"
res = []
def check(n, c, d=''):
    res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + (f' — {d}' if d else ''), flush=True)

def old_px(kind, w):  # the pre-update clamp() formulas, in px (1rem = 16px)
    lo, base, vw, hi = {'hero': (2.6, 1.2, 5.2, 6.4), 'h2': (2.2, 1.3, 3.6, 4.9)}[kind]
    return min(hi * 16, max(lo * 16, base * 16 + vw * w / 100))

AUDIT = """() => {
  const out = [];
  const els = document.querySelectorAll('h1, h2, h1 *, h2 *, .text-gold-gradient');
  for (const el of els) {
    const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
    const s = getComputedStyle(el);
    const m = s.transform === 'none' ? [1,0,0,1] : s.transform.replace(/^matrix\\(|\\)$/g,'').split(',').slice(0,4).map(Number);
    out.push({ tag: el.tagName, text: (el.textContent||'').trim().slice(0,40), style: s.fontStyle, synth: s.fontSynthesis,
      tilt: Math.abs(m[1]) > 0.001 || Math.abs(m[2]) > 0.001, family: s.fontFamily, gold: el.classList.contains('text-gold-gradient'),
      clip: s.backgroundClip || s.webkitBackgroundClip });
  }
  return out;
}"""

def visit(page, sel, name):
    page.evaluate(f"document.querySelector('{sel}').scrollIntoView({{block:'start'}})")
    page.wait_for_timeout(2200)  # word reveal (0.95 s + stagger) fully settled
    page.screenshot(path=f'{OUT}{PREFIX}_{name}.jpg', type='jpeg', quality=72)

with sync_playwright() as pw:
    b = pw.chromium.launch(args=ARGS)
    for label, kw in [('phone', pw.devices['Pixel 7']), ('tablet', pw.devices['Galaxy Tab S4']), ('tabletL', pw.devices['Galaxy Tab S4 landscape']), ('desktop', {'viewport': {'width': 1440, 'height': 900}})]:
        ctx = b.new_context(**kw); page = ctx.new_page(); page.add_init_script(SKIP_INTRO)
        errs = []; page.on('pageerror', lambda e: errs.append(str(e))); page.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        page.goto(URL, wait_until='networkidle'); page.wait_for_timeout(2500)
        page.screenshot(path=f'{OUT}{PREFIX}_{label}_hero.jpg', type='jpeg', quality=72)
        # hero (chapter I) heading: sealed in tradition / awakened by fire
        hero = page.evaluate("(()=>{const h=[...document.querySelectorAll('.t-hero')].find(e=>e.getBoundingClientRect().height>0); if(!h) return null; const s=getComputedStyle(h); return {fs: parseFloat(s.fontSize), w: innerWidth}})()")
        rows = []
        for sel, name in [('#menu', 'menu'), ('#our-story', 'story'), ('#finale-title', 'finale')]:
            visit(page, sel, f'{label}_{name}')
            rows += page.evaluate(AUDIT)
        h2 = page.evaluate("(()=>{const s=getComputedStyle(document.querySelector('#menu-title .t-h2')); return {fs: parseFloat(s.fontSize), w: innerWidth}})()")
        if BEFORE:
            ctx.close(); continue
        heads = [r for r in rows if r['tag'] in ('H1', 'H2')]
        golds = [r for r in rows if r['gold']]
        slanted = [r['text'] for r in rows if r['style'] != 'normal']
        tilted = [r['text'] for r in rows if r['tilt']]
        check(f'{label}: every visible heading + gold word is upright (font-style normal)', heads and golds and not slanted, ', '.join(slanted[:4]) or f'{len(heads)} headings, {len(golds)} gold spans')
        check(f'{label}: no skew/rotate on heading words after the reveal', not tilted, ', '.join(tilted[:4]))
        check(f'{label}: headings still use Playfair Display', all('Playfair' in r['family'] for r in heads), heads[0]['family'] if heads else '')
        check(f'{label}: golden gradient kept on highlighted words', all(r['clip'] == 'text' for r in golds), golds[0]['clip'] if golds else '')
        r2 = h2['fs'] / old_px('h2', h2['w'])
        check(f'{label}: section heading (.t-h2) is 1% smaller', abs(r2 - 0.99) < 0.002, f"{h2['fs']:.2f}px vs old {old_px('h2', h2['w']):.2f}px")
        if hero:
            rh = hero['fs'] / old_px('hero', hero['w'])
            check(f'{label}: display heading (.t-hero) is 1% smaller', abs(rh - 0.99) < 0.002, f"{hero['fs']:.2f}px vs old {old_px('hero', hero['w']):.2f}px")
        italic = page.evaluate("(async()=>{await document.fonts.ready; return [...document.fonts].filter(f=>/Playfair/.test(f.family)&&f.style==='italic'&&f.status==='loaded').length})()")
        check(f'{label}: the Playfair italic font is never needed on the page', italic == 0, str(italic))
        check(f'{label}: no console errors', not errs, ' | '.join(errs[:3]))
        ctx.close()
    b.close()
if not BEFORE:
    print(f'\n{sum(res)}/{len(res)} checks passed'); sys.exit(0 if all(res) else 1)
