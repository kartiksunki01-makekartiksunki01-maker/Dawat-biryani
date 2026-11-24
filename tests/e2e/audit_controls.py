"""Inventory of every visible button/link on the customer site (LOCAL build): accessible name,
section, action, touch-target size and whether anything covers it. Also records basic web-vitals.
python3 tests/e2e/audit_controls.py http://localhost:4300/
"""
import json, sys, time, os
from playwright.sync_api import sync_playwright

URL = sys.argv[1]
assert URL.startswith('http://localhost')
OUT = 'tests/output/'
os.makedirs(OUT, exist_ok=True)
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']

SCAN = '''() => {
  const out = [];
  for (const e of document.querySelectorAll('a[href],button,[role=button],input[type=checkbox],input[type=radio],select')) {
    const r = e.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const cs = getComputedStyle(e);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    const sec = e.closest('section[id],header,footer,nav,[role=dialog]');
    const name = (e.getAttribute('aria-label') || e.innerText || e.getAttribute('title') || e.labels?.[0]?.innerText || '').trim().replace(/\\s+/g, ' ').slice(0, 60);
    const href = e.getAttribute('href') || '';
    let covered = false;
    if (r.top >= 0 && r.bottom <= innerHeight) {
      const h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      covered = !!h && h !== e && !e.contains(h) && !h.contains(e) && !(e.labels && [...e.labels].some(l => l.contains(h)));
    }
    out.push({ name, tag: e.tagName.toLowerCase(), section: sec ? (sec.id || sec.getAttribute('aria-label') || sec.tagName.toLowerCase()) : 'page',
      action: href ? (href.startsWith('#') ? 'scroll ' + href : href.split('?')[0]) : (e.type === 'submit' ? 'submit' : 'handler'),
      w: Math.round(r.width), h: Math.round(r.height), covered, emptyHref: href === '#' || href === '' && e.tagName === 'A', noName: !name });
  }
  return out;
}'''

with sync_playwright() as pw:
    b = pw.chromium.launch(args=ARGS)
    report = {}
    for label, opts in [('desktop-1280', {'viewport': {'width': 1280, 'height': 800}}), ('phone-360', {'viewport': {'width': 360, 'height': 740}, 'is_mobile': True, 'has_touch': True}),
                        ('tablet-768', {'viewport': {'width': 768, 'height': 1024}, 'is_mobile': True, 'has_touch': True})]:
        ctx = b.new_context(**opts)
        ctx.add_init_script("""
          window.__lcp = 0; window.__cls = 0;
          new PerformanceObserver(l => { for (const e of l.getEntries()) window.__lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
          new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
        """)
        page = ctx.new_page()
        t0 = time.time()
        page.goto(URL, wait_until='load')
        load_s = time.time() - t0
        page.wait_for_selector('[aria-label$="— intro"]', state='detached', timeout=15000)
        page.wait_for_timeout(2500)
        seen = {}
        for y in range(0, page.evaluate('document.documentElement.scrollHeight'), 700):
            page.evaluate(f'window.scrollTo(0,{y})')
            page.wait_for_timeout(120)
            for c in page.evaluate(SCAN):
                key = (c['section'], c['name'], c['action'])
                if key not in seen or (seen[key]['covered'] and not c['covered']):
                    seen[key] = c
        vit = page.evaluate('({lcp: window.__lcp, cls: window.__cls})')
        report[label] = {'load_s': round(load_s, 2), 'lcp_ms': round(vit['lcp']), 'cls': round(vit['cls'], 3), 'controls': list(seen.values()),
                         'overflow_px': page.evaluate('document.documentElement.scrollWidth - innerWidth')}
        ctx.close()
    b.close()

json.dump(report, open(OUT + 'controls_audit.json', 'w'), indent=1)
for k, v in report.items():
    cs = v['controls']
    small = [c for c in cs if min(c['w'], c['h']) < 40 and c['tag'] in ('a', 'button')]
    print(f"{k}: {len(cs)} controls | no-name {sum(c['noName'] for c in cs)} | empty-href {sum(c['emptyHref'] for c in cs)} | covered {sum(c['covered'] for c in cs)} | <40px {len(small)} | overflow {v['overflow_px']}px | load {v['load_s']}s | LCP {v['lcp_ms']}ms | CLS {v['cls']}")
    for c in [c for c in cs if c['covered'] or c['noName'] or c['emptyHref']][:8]:
        print('   !', c)
    for c in small[:6]:
        print('   small', c['name'], c['w'], 'x', c['h'], c['section'])
