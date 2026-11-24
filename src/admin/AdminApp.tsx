import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { backendConfigured, createAdminClient } from '../lib/supabase';
import { Dishes } from './Dishes';
import { Leads } from './Leads';
import { Btn, Field, Input, Notice } from './ui';

type Gate = 'loading' | 'signed-out' | 'not-admin' | 'ok';

export function AdminApp() {
  const sb = useMemo<SupabaseClient | null>(() => createAdminClient(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [gate, setGate] = useState<Gate>('loading');
  const [tab, setTab] = useState<'leads' | 'dishes'>('leads');

  useEffect(() => {
    if (!sb) return;
    void sb.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (!data.session) setGate('signed-out');
    });
    const { data: sub } = sb.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (!s) setGate('signed-out');
    });
    return () => sub.subscription.unsubscribe();
  }, [sb]);

  // After login, confirm this account is on the admins list (the database enforces it too).
  useEffect(() => {
    if (!sb || !session) return;
    let live = true;
    setGate('loading');
    void sb
      .from('admins')
      .select('user_id')
      .maybeSingle()
      .then(({ data }) => {
        if (live) setGate(data ? 'ok' : 'not-admin');
      });
    return () => {
      live = false;
    };
  }, [sb, session]);

  if (!backendConfigured || !sb) {
    return (
      <Shell>
        <Notice kind="err">
          Backend is not connected. Add VITE_SUPABASE_URL and VITE_SUPABASE_KEY in the project's environment variables, then rebuild.
        </Notice>
      </Shell>
    );
  }
  if (gate === 'loading') return <Shell><Notice kind="info">Loading…</Notice></Shell>;
  if (gate === 'signed-out') return <Shell><Login sb={sb} /></Shell>;
  if (gate === 'not-admin') {
    return (
      <Shell>
        <div className="space-y-3">
          <Notice kind="err">
            This account ({session?.user.email}) is not an admin. Ask the site owner to add it to the admins list.
          </Notice>
          <Btn onClick={() => void sb.auth.signOut()}>Sign out</Btn>
        </div>
      </Shell>
    );
  }

  return (
    <Shell wide>
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl text-ivory">Dawat Biryani House · Admin</h1>
          <p className="text-xs text-ivory/50">Signed in as {session?.user.email}</p>
        </div>
        <div className="flex gap-2">
          <a className="inline-flex min-h-[40px] items-center rounded-lg border border-white/20 px-4 text-sm text-ivory hover:bg-white/10" href="./">
            View website
          </a>
          <Btn onClick={() => void sb.auth.signOut()}>Sign out</Btn>
        </div>
      </header>
      <nav className="mb-6 flex gap-2" aria-label="Admin sections">
        {(['leads', 'dishes'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            aria-current={tab === t ? 'page' : undefined}
            className={`min-h-[42px] rounded-full px-5 text-sm font-semibold ${tab === t ? 'bg-gold text-smoke' : 'border border-white/20 text-ivory/80 hover:bg-white/10'}`}
          >
            {t === 'leads' ? 'Enquiries & Leads' : 'Dishes & Prices'}
          </button>
        ))}
      </nav>
      {tab === 'leads' ? <Leads sb={sb} /> : <Dishes sb={sb} />}
    </Shell>
  );
}

function Shell({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="min-h-screen bg-smoke px-4 py-8 font-sans text-ivory sm:px-8">
      <div className={`mx-auto ${wide ? 'max-w-5xl' : 'max-w-md'}`}>{children}</div>
    </div>
  );
}

function Login({ sb }: { sb: SupabaseClient }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) setErr('Login failed. Check the email and password.');
  };

  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
      <h1 className="font-display text-2xl">Admin login</h1>
      <Field label="Email">
        <Input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Field label="Password">
        <Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      {err && <Notice kind="err">{err}</Notice>}
      <Btn tone="gold" type="submit" disabled={busy} className="w-full">
        {busy ? 'Signing in…' : 'Sign in'}
      </Btn>
    </form>
  );
}
