// LOCAL TEST ONLY. A small stand-in for Supabase (Auth + REST + RPC) that runs the real database
// functions and Row Level Security on a LOCAL Postgres, so the website and admin panel can be tested
// end-to-end without touching production. Supports fault injection (dropped connections).
//   DATABASE_URL=postgres://postgres:postgres@localhost:54329/dawat node tests/e2e/mock_supabase.mjs
import http from 'node:http';
import pg from 'pg';
import { handleRest, makeJwt, readJwt } from './mock_rest.mjs';

const URL = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:54329/dawat';
if (/supabase\.(co|com)/.test(URL)) throw new Error('Never point the mock at production.');
const PORT = Number(process.env.PORT ?? 54400);
const pool = new pg.Pool({ connectionString: URL, max: 20 });

const SIG = {
  get_storefront: [], quote_order: [['p', 'jsonb']], place_order: [['p', 'jsonb']],
  get_order: [['p_order_id', 'uuid'], ['p_token', 'text']], get_my_orders: [['p', 'jsonb']], submit_enquiry: [['p', 'jsonb']],
  admin_stats: [['p_from', 'date'], ['p_to', 'date']], admin_customers: [], admin_remove_customer: [['p_customer_id', 'uuid']],
  admin_convert_lead: [['p_lead_id', 'uuid']], admin_mark_all_read: [], admin_get_order: [['p_order_id', 'uuid']],
};
let fault = null; // { fn, mode: 'drop' | 'commit-then-drop' | 'commit-then-hang', times }
const calls = [];

const send = (res, status, body, headers = {}) => {
  res.writeHead(status, {
    'content-type': 'application/json',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': '*',
    'access-control-allow-methods': 'GET,POST,PATCH,DELETE,HEAD,OPTIONS',
    'access-control-expose-headers': 'content-range',
    ...headers,
  });
  res.end(body === undefined ? '' : JSON.stringify(body));
};
const pgErr = (e) => ({ code: e.code ?? 'P0001', message: e.message, details: e.detail ?? null, hint: e.hint ?? null });

async function asRole(req, fn) {
  const claims = readJwt((req.headers.authorization ?? '').replace(/^Bearer /, ''));
  const c = await pool.connect();
  try {
    await c.query('begin');
    await c.query(`set local role ${claims ? 'authenticated' : 'anon'}`);
    await c.query(`select set_config('request.jwt.claims', $1, true), set_config('request.headers', $2, true)`, [
      JSON.stringify(claims ?? { role: 'anon' }),
      JSON.stringify({ 'x-forwarded-for': '10.0.0.' + (1 + (Number(process.env.IP_SPREAD ?? 0) ? calls.length % 250 : 0)) }),
    ]);
    const out = await fn(c);
    await c.query('commit');
    return out;
  } catch (e) {
    await c.query('rollback').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

function session(user) {
  const now = Math.floor(Date.now() / 1000);
  return {
    access_token: makeJwt(user.id, user.email), token_type: 'bearer', expires_in: 3600, expires_at: now + 3600, refresh_token: `r-${user.id}`,
    user: { id: user.id, aud: 'authenticated', role: 'authenticated', email: user.email, app_metadata: { provider: 'email' }, user_metadata: {}, created_at: new Date().toISOString(), last_sign_in_at: new Date().toISOString() },
  };
}

http
  .createServer(async (req, res) => {
    if (req.method === 'OPTIONS') return send(res, 204);
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const u = new globalThis.URL(req.url ?? '/', 'http://x');

    if (u.pathname === '/__control' && req.method === 'POST') {
      const b = JSON.parse(raw || '{}');
      if ('fault' in b) fault = b.fault;
      if (b.sql) {
        try { const r = await pool.query(b.sql); return send(res, 200, { rows: r.rows }); } catch (e) { return send(res, 400, { error: e.message }); }
      }
      return send(res, 200, { ok: true, calls: calls.splice(0) });
    }

    // ── auth ──
    if (u.pathname === '/auth/v1/token') {
      const b = JSON.parse(raw || '{}');
      let user = null;
      if (u.searchParams.get('grant_type') === 'password') {
        const r = await pool.query('select id, email from auth.users where lower(email) = lower($1) and pw = $2', [b.email ?? '', b.password ?? '']);
        user = r.rows[0];
        if (!user) return send(res, 400, { error: 'invalid_grant', error_description: 'Invalid login credentials', code: 'invalid_credentials', message: 'Invalid login credentials' });
      } else {
        const r = await pool.query('select id, email from auth.users where id::text = $1', [String(b.refresh_token ?? '').slice(2)]);
        user = r.rows[0];
        if (!user) return send(res, 400, { error: 'invalid_grant', message: 'Invalid refresh token' });
      }
      return send(res, 200, session(user));
    }
    if (u.pathname === '/auth/v1/user') {
      const claims = readJwt((req.headers.authorization ?? '').replace(/^Bearer /, ''));
      if (!claims) return send(res, 401, { message: 'invalid token' });
      if (req.method === 'PUT') return send(res, 200, session({ id: claims.sub, email: claims.email }).user);
      return send(res, 200, session({ id: claims.sub, email: claims.email }).user);
    }
    if (u.pathname === '/auth/v1/logout') return send(res, 204);

    // ── storage (accepts admin uploads; nothing is stored) ──
    if (u.pathname.startsWith('/storage/v1/object/')) {
      const claims = readJwt((req.headers.authorization ?? '').replace(/^Bearer /, ''));
      const isAdmin = claims && (await pool.query('select 1 from public.admins where user_id = $1', [claims.sub])).rowCount;
      if (!isAdmin) return send(res, 403, { statusCode: '403', error: 'Unauthorized', message: 'new row violates row-level security policy' });
      return send(res, 200, { Key: u.pathname.replace('/storage/v1/object/', ''), Id: 'test' });
    }

    // ── rpc ──
    const m = /^\/rest\/v1\/rpc\/([a-z_]+)$/.exec(u.pathname);
    if (m) {
      const fn = m[1];
      if (!(fn in SIG)) return send(res, 404, { code: 'PGRST202', message: 'not in this mock' });
      calls.push(fn);
      const args = raw ? JSON.parse(raw) : {};
      const f = fault && fault.fn === fn && fault.times > 0 ? fault : null;
      if (f) f.times--;
      if (f?.mode === 'drop') { req.socket.destroy(); return; }
      const params = SIG[fn].map(([name, type]) => (type === 'jsonb' ? JSON.stringify(args[name] ?? null) : args[name] ?? null));
      const sql = `select public.${fn}(${SIG[fn].map(([name, type], i) => `${name} => $${i + 1}::${type}`).join(', ')}) as r`;
      try {
        const r = await asRole(req, (c) => c.query(sql, params));
        if (f?.mode === 'commit-then-drop') { req.socket.destroy(); return; }
        if (f?.mode === 'commit-then-hang') { setTimeout(() => req.socket.destroy(), 40000); return; }
        return send(res, 200, r.rows[0].r);
      } catch (e) {
        return send(res, e.code === '42501' ? 403 : 400, pgErr(e));
      }
    }

    // ── tables ──
    const t = /^\/rest\/v1\/([a-z_]+)$/.exec(u.pathname);
    if (t) {
      try {
        const out = await asRole(req, (c) =>
          handleRest(c, req.method, t[1], u.searchParams, raw ? JSON.parse(raw) : null, req.headers.prefer, req.headers.accept));
        return send(res, out.status, out.body, out.headers);
      } catch (e) {
        return send(res, e.code === '42501' ? 403 : 400, pgErr(e));
      }
    }
    return send(res, 404, { message: 'not in this mock' });
  })
  .listen(PORT, () => console.log(`mock supabase on ${PORT}`));
