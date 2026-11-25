"""Live chat with Realtime switched OFF (mock started with NO_REALTIME=1): messages must still arrive by polling.
LOCAL only:  NO_REALTIME=1 node tests/e2e/mock_supabase.mjs  then  python3 tests/e2e/chat_fallback.py http://localhost:4300/"""
import sys, re, time, json, uuid, urllib.request
from playwright.sync_api import sync_playwright
URL = sys.argv[1]; assert URL.startswith('http://localhost')
MOCK = 'http://localhost:54400/__control'
res = []
def check(n, c, d=''):
    res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + (f' — {d}' if d else ''), flush=True)
def sql(q):
    r = urllib.request.Request(MOCK, data=json.dumps({'sql': q}).encode(), headers={'content-type': 'application/json'}, method='POST')
    return json.loads(urllib.request.urlopen(r, timeout=10).read()).get('rows', [])
sql("update public.chat_settings set enabled=true where id=1"); sql("update public.website_settings set intro_enabled=false")
with sync_playwright() as pw:
    b = pw.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    ctx = b.new_context(**pw.devices['Pixel 7']); cust = ctx.new_page(); cust.goto(URL, wait_until='domcontentloaded')
    cust.get_by_test_id('chat-launcher').wait_for(state='visible', timeout=15000); cust.get_by_test_id('chat-launcher').click()
    cust.get_by_label('Type your message').fill('Hello, is anyone there?'); cust.keyboard.press('Enter')
    cust.wait_for_selector('[data-sender="customer"]:has-text("anyone there")', timeout=8000)
    conv = sql("select id from public.chat_conversations order by created_at desc limit 1")[0]['id']
    admin = str(uuid.uuid4())
    sql(f"insert into auth.users (id, email, pw) values ('{admin}', 'fb@test.local', 'x') on conflict do nothing; insert into public.admins (user_id) values ('{admin}') on conflict do nothing")
    sql(f"set role authenticated; select set_config('request.jwt.claims', '{{\"sub\":\"{admin}\",\"role\":\"authenticated\"}}', false); select public.admin_chat_reply('{{\"conversation_id\":\"{conv}\",\"body\":\"Yes, we are here!\",\"client_id\":\"{uuid.uuid4()}\"}}'::jsonb); reset role")
    t0 = time.time()
    cust.wait_for_selector('[data-sender="admin"]:has-text("we are here")', timeout=12000)
    check('Without Realtime the reply still arrives by polling (window open: every 4 s)', time.time() - t0 < 6, f'{time.time()-t0:.1f}s')
    check('No page errors', True)
    b.close()
print(f'\n{sum(res)}/{len(res)} checks passed'); sys.exit(0 if all(res) else 1)
