// LOCAL TEST ONLY — a small subset of Supabase Auth + PostgREST, enough for the admin panel's queries,
// executed against the local Postgres with the same roles and Row Level Security as production.
import { createHmac } from 'node:crypto';

const SECRET = 'local-test-secret';
const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
export function makeJwt(sub, email) {
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ alg: 'HS256', typ: 'JWT' });
  const body = b64({ sub, email, role: 'authenticated', aud: 'authenticated', iat: now, exp: now + 3600 });
  return `${head}.${body}.${createHmac('sha256', SECRET).update(`${head}.${body}`).digest('base64url')}`;
}
export function readJwt(token) {
  const [h, b, s] = (token ?? '').split('.');
  if (!s || createHmac('sha256', SECRET).update(`${h}.${b}`).digest('base64url') !== s) return null;
  const claims = JSON.parse(Buffer.from(b, 'base64url').toString());
  return claims.exp > Date.now() / 1000 ? claims : null;
}

const ident = (s) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(s)) throw Object.assign(new Error(`bad identifier ${s}`), { code: 'PGRST100' });
  return `"${s}"`;
};
// child tables: parent -> { childName: fkColumnOnChild }, parents: child -> { parentName: fkColumnOnChild }
const CHILDREN = { orders: { order_items: 'order_id' }, dishes: { dish_variants: 'dish_id' } };
const PARENTS = { order_items: { orders: 'order_id' }, dish_variants: { dishes: 'dish_id' } };

function splitTop(s) {
  const out = []; let depth = 0, cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

const OPS = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=' };
function filterSql(col, raw, params, alias) {
  let neg = false, v = raw;
  if (v.startsWith('not.')) { neg = true; v = v.slice(4); }
  const dot = v.indexOf('.');
  const op = v.slice(0, dot), val = v.slice(dot + 1);
  let sql;
  if (op === 'is') sql = `${alias}.${ident(col)} is ${val === 'null' ? 'null' : val === 'true' ? 'true' : 'false'}`;
  else if (op === 'in') {
    const items = val.replace(/^\(|\)$/g, '').split(',').map((x) => x.replace(/^"|"$/g, ''));
    sql = `${alias}.${ident(col)} = any($${params.push(items)})`;
  } else if (OPS[op]) sql = `${alias}.${ident(col)} ${OPS[op]} $${params.push(val)}`;
  else throw Object.assign(new Error(`unsupported operator ${op}`), { code: 'PGRST100' });
  return neg ? `not (${sql})` : sql;
}

function selectSql(table, select, params) {
  const parts = splitTop(select || '*');
  const cols = [];
  for (const p of parts) {
    const m = /^([a-z_]+)(!inner)?\((.*)\)$/.exec(p);
    if (!m) { cols.push(p === '*' ? 't.*' : `t.${ident(p)}`); continue; }
    const [, rel, , inner] = m;
    const innerCols = splitTop(inner).map((c) => `'${c}', r.${ident(c)}`).join(', ');
    if (CHILDREN[table]?.[rel]) {
      const fk = CHILDREN[table][rel];
      cols.push(`(select coalesce(json_agg(json_build_object(${innerCols})), '[]') from public.${ident(rel)} r where r.${ident(fk)} = t.id) as ${ident(rel)}`);
    } else if (PARENTS[table]?.[rel]) {
      const fk = PARENTS[table][rel];
      cols.push(`(select json_build_object(${innerCols}) from public.${ident(rel)} r where r.id = t.${ident(fk)}) as ${ident(rel)}`);
    } else throw Object.assign(new Error(`unknown relation ${rel}`), { code: 'PGRST200' });
  }
  return cols.join(', ');
}

function whereSql(table, query, params) {
  const conds = [];
  const embedded = {};
  for (const [k, v] of query) {
    if (['select', 'order', 'limit', 'offset', 'columns', 'on_conflict'].includes(k)) continue;
    if (k.includes('.')) {
      const [rel, col] = k.split('.');
      (embedded[rel] ??= []).push(filterSql(col, v, params, 'p'));
    } else conds.push(filterSql(k, v, params, 't'));
  }
  for (const [rel, cs] of Object.entries(embedded)) {
    const fk = PARENTS[table]?.[rel];
    if (!fk) throw Object.assign(new Error(`unknown relation ${rel}`), { code: 'PGRST200' });
    conds.push(`exists (select 1 from public.${ident(rel)} p where p.id = t.${ident(fk)} and ${cs.join(' and ')})`);
  }
  return conds.length ? `where ${conds.join(' and ')}` : '';
}

/** Returns { status, body, headers } */
export async function handleRest(client, method, table, query, body, prefer, accept) {
  ident(table);
  const params = [];
  const single = /vnd\.pgrst\.object/.test(accept ?? '');
  const wantRep = /return=representation/.test(prefer ?? '');
  const sel = query.get('select');
  if (method === 'GET' || method === 'HEAD') {
    const where = whereSql(table, query, params);
    const order = (query.getAll('order').join(',') || '').split(',').filter(Boolean)
      .map((o) => { const [c, dir, nulls] = o.split('.'); return `t.${ident(c)} ${dir === 'desc' ? 'desc' : 'asc'}${nulls === 'nullslast' ? ' nulls last' : nulls === 'nullsfirst' ? ' nulls first' : ''}`; });
    const limit = query.get('limit') ? `limit ${Number(query.get('limit'))}` : '';
    const sqlRows = `select ${selectSql(table, sel, params)} from public.${ident(table)} t ${where} ${order.length ? 'order by ' + order.join(', ') : ''} ${limit}`;
    const r = await client.query(`select coalesce(json_agg(x), '[]'::json) as rows, count(*)::int as n from (${sqlRows}) x`, params);
    const rows = r.rows[0].rows;
    const headers = /count=exact/.test(prefer ?? '') ? { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` } : {};
    if (method === 'HEAD') return { status: 200, body: undefined, headers };
    if (single) {
      if (rows.length !== 1) return { status: 406, body: { code: 'PGRST116', details: `The result contains ${rows.length} rows`, hint: null, message: 'JSON object requested, multiple (or no) rows returned' } };
      return { status: 200, body: rows[0], headers };
    }
    return { status: 200, body: rows, headers };
  }
  if (method === 'POST') {
    const list = Array.isArray(body) ? body : [body];
    const out = [];
    for (const row of list) {
      const keys = Object.keys(row);
      const vals = keys.map((k) => params.push(row[k]) && `$${params.length}`);
      const r = await client.query(`insert into public.${ident(table)} (${keys.map(ident).join(', ')}) values (${vals.join(', ')}) returning *`, params.splice(0));
      out.push(...r.rows);
    }
    return { status: 201, body: wantRep ? (single ? out[0] : out) : undefined };
  }
  if (method === 'PATCH') {
    const keys = Object.keys(body);
    const sets = keys.map((k) => `${ident(k)} = $${params.push(body[k])}`);
    const where = whereSql(table, query, params);
    const r = await client.query(`update public.${ident(table)} t set ${sets.join(', ')} ${where} returning *`, params);
    if (single) return r.rows.length === 1 ? { status: 200, body: r.rows[0] } : { status: 406, body: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: null, hint: null } };
    return { status: wantRep ? 200 : 204, body: wantRep ? r.rows : undefined };
  }
  if (method === 'DELETE') {
    const where = whereSql(table, query, params);
    const r = await client.query(`delete from public.${ident(table)} t ${where} returning *`, params);
    return { status: wantRep ? 200 : 204, body: wantRep ? r.rows : undefined };
  }
  return { status: 405, body: { message: 'method not allowed' } };
}
