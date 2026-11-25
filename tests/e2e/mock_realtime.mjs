// LOCAL TEST ONLY. A small stand-in for Supabase Realtime (Phoenix protocol, serializer vsn 1.0.0 + 2.0.0)
// so the website and admin panel can be tested with real push on a LOCAL Postgres:
//  • Broadcast from the database: realtime.send() (local stub) → pg_notify('realtime_broadcast') → subscribers
//    of that topic (public messages only reach public channels, like Supabase).
//  • Postgres Changes: test-only triggers on the tables in the supabase_realtime publication → pg_notify →
//    each subscriber gets the change only if Row Level Security lets THEIR role/JWT select that row.
// It never connects to production (the caller refuses supabase.co URLs).
import pg from 'pg';
import { WebSocketServer } from 'ws';
import { readJwt } from './mock_rest.mjs';

const SETUP = `
create or replace function public.__mock_rt_notify() returns trigger language plpgsql as $$
begin
  perform pg_notify('mock_pg_changes', json_build_object('schema', tg_table_schema, 'table', tg_table_name, 'type', tg_op,
    'id', coalesce(case when tg_op <> 'DELETE' then to_jsonb(new) ->> 'id' end, to_jsonb(old) ->> 'id'))::text);
  return null;
end $$;
do $$ declare t record; begin
  for t in select schemaname, tablename from pg_publication_tables where pubname = 'supabase_realtime' loop
    execute format('create or replace trigger __mock_rt after insert or update or delete on %I.%I for each row execute function public.__mock_rt_notify()', t.schemaname, t.tablename);
  end loop;
end $$;`;

export async function attachRealtime(server, connectionString) {
  const pool = new pg.Pool({ connectionString, max: 10 });
  await pool.query(SETUP);
  const listener = new pg.Client({ connectionString });
  await listener.connect();
  await listener.query('listen realtime_broadcast');
  await listener.query('listen mock_pg_changes');

  const sockets = new Set(); // { ws, v2, claims, channels: Map(topic → { joinRef, private, pg: [{id, event, schema, table, filter}] }) }
  let nextId = 1;
  const stats = { connections: 0, broadcasts: 0, changes: 0 };

  const encode = (s, join_ref, ref, topic, event, payload) =>
    s.ws.send(JSON.stringify(s.v2 ? [join_ref, ref, topic, event, payload] : { join_ref, ref, topic, event, payload }));

  listener.on('notification', async (n) => {
    const msg = JSON.parse(n.payload);
    if (n.channel === 'realtime_broadcast') {
      stats.broadcasts++;
      const topic = `realtime:${msg.topic}`;
      for (const s of sockets) {
        const ch = s.channels.get(topic);
        if (ch && ch.private === !!msg.private) encode(s, null, null, topic, 'broadcast', { type: 'broadcast', event: msg.event, payload: msg.payload });
      }
      return;
    }
    // postgres changes
    stats.changes++;
    let record = null;
    if (msg.type !== 'DELETE') {
      const r = await pool.query(`select to_jsonb(t) as r from ${pg.escapeIdentifier(msg.schema)}.${pg.escapeIdentifier(msg.table)} t where id::text = $1`, [msg.id]).catch(() => null);
      record = r?.rows[0]?.r ?? null;
      if (!record) return;
    }
    for (const s of sockets) {
      for (const [topic, ch] of s.channels) {
        const ids = ch.pg.filter((b) => (b.schema === msg.schema || b.schema === '*') && (!b.table || b.table === msg.table) && (b.event === '*' || b.event === msg.type)).map((b) => b.id);
        if (!ids.length) continue;
        if (msg.type !== 'DELETE' && !(await visible(s.claims, msg))) continue; // RLS, as the subscriber
        const columns = Object.keys(record ?? { id: '' }).map((name) => ({ name, type: 'text' }));
        encode(s, null, null, topic, 'postgres_changes', {
          ids,
          data: { schema: msg.schema, table: msg.table, commit_timestamp: new Date().toISOString(), type: msg.type, columns,
                  record: record ?? {}, old_record: msg.type === 'DELETE' ? { id: msg.id } : {}, errors: null },
        });
      }
    }
  });

  async function visible(claims, msg) {
    const c = await pool.connect();
    try {
      await c.query('begin');
      await c.query(`set local role ${claims ? 'authenticated' : 'anon'}`);
      await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims ?? { role: 'anon' })]);
      const r = await c.query(`select 1 from ${pg.escapeIdentifier(msg.schema)}.${pg.escapeIdentifier(msg.table)} where id::text = $1`, [msg.id]);
      return r.rowCount > 0;
    } catch {
      return false;
    } finally {
      await c.query('rollback').catch(() => {});
      c.release();
    }
  }

  const wss = new WebSocketServer({ noServer: true });
  server.on('upgrade', (req, socket, head) => {
    const u = new URL(req.url ?? '/', 'http://x');
    if (!u.pathname.startsWith('/realtime/v1/websocket')) { socket.destroy(); return; }
    wss.handleUpgrade(req, socket, head, (ws) => {
      const s = { ws, v2: u.searchParams.get('vsn') === '2.0.0', claims: null, channels: new Map() };
      sockets.add(s);
      stats.connections++;
      ws.on('close', () => sockets.delete(s));
      ws.on('message', (raw, isBinary) => {
        if (isBinary) return; // client→server binary broadcasts are not needed by the site
        const m = JSON.parse(String(raw));
        const [join_ref, ref, topic, event, payload] = Array.isArray(m) ? m : [m.join_ref, m.ref, m.topic, m.event, m.payload];
        const ok = (response = {}) => encode(s, join_ref, ref, topic, 'phx_reply', { status: 'ok', response });
        if (topic === 'phoenix' && event === 'heartbeat') return ok();
        if (event === 'phx_join') {
          const tok = payload?.access_token;
          if (tok) s.claims = readJwt(tok);
          const cfg = payload?.config ?? {};
          const pgb = (cfg.postgres_changes ?? []).map((f) => ({ id: nextId++, event: f.event ?? '*', schema: f.schema ?? 'public', table: f.table, filter: f.filter }));
          s.channels.set(topic, { joinRef: join_ref, private: !!cfg.private, pg: pgb });
          return ok({ postgres_changes: pgb });
        }
        if (event === 'access_token') { s.claims = readJwt(payload?.access_token) ?? s.claims; return ok(); }
        if (event === 'phx_leave') { s.channels.delete(topic); return ok(); }
        return ok();
      });
    });
  });
  return stats;
}
