import type { Session, SupabaseClient } from '@supabase/supabase-js';
import {
  BadgePercent, Bell, ChartColumn, ClipboardList, Inbox, LayoutDashboard, LogOut, Menu as MenuIcon, Music, Package, Palette,
  ReceiptText, ShieldCheck, Store, Users, UtensilsCrossed, X, MessagesSquare, HardDrive, Eraser,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { backendConfigured, createAdminClient } from '../lib/supabase';
import { AdminContext, Btn, Field, Input, Notice } from './ui';
import { NotificationsProvider, useNotifications } from './notifications';
import { Dashboard } from './sections/Dashboard';
import { Orders } from './sections/Orders';
import { Customers } from './sections/Customers';
import { Offers } from './sections/Offers';
import { LiveChat } from './sections/LiveChat';
import { ChatProvider, useChatAdmin } from './chat';
import { Dishes } from './Dishes';
import { Bulk } from './sections/Bulk';
import { Leads } from './Leads';
import { NotificationsPage } from './sections/NotificationsPage';
import { MediaLibrary } from './sections/MediaLibrary';
import { DataCleanup } from './sections/DataCleanup';
import { Analytics } from './sections/Analytics';
import { Appearance } from './sections/Appearance';
import { MusicAnimations } from './sections/MusicAnimations';
import { RestaurantSettingsPage } from './sections/RestaurantSettings';
import { Account } from './sections/Account';

type Gate = 'loading' | 'signed-out' | 'not-admin' | 'ok' | 'error';

const SECTIONS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, el: <Dashboard /> },
  { id: 'orders', label: 'Orders', icon: ClipboardList, el: <Orders /> },
  { id: 'customers', label: 'Customers', icon: Users, el: <Customers /> },
  { id: 'bills', label: 'Bills & Receipts', icon: ReceiptText, el: <Orders billsMode /> },
  { id: 'offers', label: 'Coupons & Discounts', icon: BadgePercent, el: <Offers /> },
  { id: 'menu', label: 'Menu Management', icon: UtensilsCrossed, el: <Dishes /> },
  { id: 'chat', label: 'Live Chat', icon: MessagesSquare, el: <LiveChat /> },
  { id: 'bulk', label: 'Bulk & Special Orders', icon: Package, el: <Bulk /> },
  { id: 'leads', label: 'Enquiries & Leads', icon: Inbox, el: <Leads /> },
  { id: 'notifications', label: 'Notifications', icon: Bell, el: <NotificationsPage /> },
  { id: 'analytics', label: 'Business Analytics', icon: ChartColumn, el: <Analytics /> },
  { id: 'appearance', label: 'Website Appearance', icon: Palette, el: <Appearance /> },
  { id: 'media', label: 'Music & Animations', icon: Music, el: <MusicAnimations /> },
  { id: 'files', label: 'Media & Storage', icon: HardDrive, el: <MediaLibrary /> },
  { id: 'cleanup', label: 'Data Cleanup', icon: Eraser, el: <DataCleanup /> },
  { id: 'settings', label: 'Restaurant Settings', icon: Store, el: <RestaurantSettingsPage /> },
  { id: 'account', label: 'Account & Security', icon: ShieldCheck, el: <Account /> },
] as const;
type SectionId = (typeof SECTIONS)[number]['id'];
const isSection = (s: string): s is SectionId => SECTIONS.some((x) => x.id === s);
const fromHash = (): SectionId => {
  const h = location.hash.replace('#', '').split('/')[0];
  return isSection(h) ? h : 'dashboard';
};

export function AdminApp() {
  const sb = useMemo<SupabaseClient | null>(() => createAdminClient(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [gate, setGate] = useState<Gate>('loading');

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

  useEffect(() => {
    if (!sb || !session) return;
    let live = true;
    void sb.from('admins').select('user_id').maybeSingle().then(({ data, error }) => {
      if (!live) return;
      if (error) setGate('error');
      else setGate(data ? 'ok' : 'not-admin');
    });
    return () => {
      live = false;
    };
  }, [sb, session]);

  if (!backendConfigured || !sb) {
    return <Center><Notice kind="err">Backend is not connected. Add VITE_SUPABASE_URL and VITE_SUPABASE_KEY in the project’s environment variables, then rebuild.</Notice></Center>;
  }
  if (gate === 'loading') return <Center><Notice kind="info">Loading…</Notice></Center>;
  if (gate === 'signed-out') return <Center><Login sb={sb} /></Center>;
  if (gate === 'error') {
    return <Center><Notice kind="err">Could not check your admin access (network problem). <button className="underline" onClick={() => location.reload()}>Reload</button></Notice></Center>;
  }
  if (gate === 'not-admin') {
    return (
      <Center>
        <div className="space-y-3">
          <Notice kind="err">This account ({session?.user.email}) is not an admin. Ask the site owner to add it to the admins list.</Notice>
          <Btn onClick={() => void sb.auth.signOut()}>Sign out</Btn>
        </div>
      </Center>
    );
  }
  return <Shell sb={sb} session={session!} />;
}

function Center({ children }: { children: ReactNode }) {
  return (
    <main className="grid min-h-screen place-items-center bg-smoke px-4 font-sans text-ivory">
      <div className="w-full max-w-md">{children}</div>
    </main>
  );
}

function Shell({ sb, session }: { sb: SupabaseClient; session: Session }) {
  const [section, setSection] = useState<SectionId>(fromHash);
  const [navOpen, setNavOpen] = useState(false);
  const [toast, setToast] = useState<{ id: number; text: string; kind: 'ok' | 'err' } | null>(null);

  useEffect(() => {
    const on = () => setSection(fromHash());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4500);
    return () => window.clearTimeout(t);
  }, [toast]);
  // automatic clean-up (only if the owner switched it on; the database runs it at most once a day)
  useEffect(() => {
    void sb.rpc('admin_cleanup_auto').then(({ data, error }) => {
      if (error || !data) return;
      const r = data as Record<string, number>;
      const n = ['orders', 'leads', 'notifications', 'chats', 'coupons'].reduce((a, k) => a + (Number(r[k]) || 0), 0);
      if (n) setToast({ id: Date.now(), text: `Automatic clean-up removed ${n} old record(s). See Data Cleanup.`, kind: 'ok' });
    });
  }, [sb]);

  const go = useCallback((s: string) => {
    location.hash = s;
    setNavOpen(false);
    window.scrollTo({ top: 0 });
  }, []);
  const ctx = useMemo(
    () => ({ sb, user: session.user, toast: (text: string, kind: 'ok' | 'err' = 'ok') => setToast({ id: Date.now(), text, kind }), go }),
    [sb, session.user, go],
  );
  const current = SECTIONS.find((s) => s.id === section)!;

  return (
    <AdminContext.Provider value={ctx}>
      <NotificationsProvider>
        <ChatProvider>
        <div className="min-h-screen bg-smoke font-sans text-ivory">
          <a href="#admin-main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-gold focus:px-3 focus:py-2 focus:text-smoke">Skip to content</a>
          {/* mobile top bar */}
          <div className="sticky top-0 z-30 flex items-center justify-between border-b border-white/10 bg-smoke/95 px-4 py-3 backdrop-blur lg:hidden">
            <button type="button" onClick={() => setNavOpen(true)} className="grid h-11 w-11 place-items-center rounded-lg hover:bg-white/10" aria-label="Open admin menu">
              <MenuIcon size={22} />
            </button>
            <p className="font-display text-lg">{current.label}</p>
            <BellButton go={go} />
          </div>
          <div className="flex">
            <Sidebar section={section} go={go} open={navOpen} onClose={() => setNavOpen(false)} email={session.user.email ?? ''} onSignOut={() => void sb.auth.signOut()} />
            <main id="admin-main" className="min-w-0 flex-1 px-4 py-6 sm:px-8 lg:py-10">
              <div className="mx-auto max-w-6xl">{current.el}</div>
            </main>
          </div>
          {toast && (
            <div role="status" aria-live="polite" className={`fixed bottom-4 left-1/2 z-[60] -translate-x-1/2 rounded-xl px-4 py-3 text-sm shadow-xl ring-1 ${toast.kind === 'err' ? 'bg-red-950 text-red-100 ring-red-400/40' : 'bg-[#1d150f] text-ivory ring-gold/40'}`}>
              {toast.text}
            </div>
          )}
        </div>
        </ChatProvider>
      </NotificationsProvider>
    </AdminContext.Provider>
  );
}

function BellButton({ go }: { go: (s: string) => void }) {
  const { unread } = useNotifications();
  return (
    <button type="button" onClick={() => go('notifications')} className="relative grid h-11 w-11 place-items-center rounded-lg hover:bg-white/10" aria-label={`Notifications, ${unread} unread`}>
      <Bell size={20} />
      {unread > 0 && <span className="absolute right-1.5 top-1.5 min-w-[18px] rounded-full bg-red-600 px-1 text-center text-[10px] font-bold leading-[18px] text-white">{unread > 99 ? '99+' : unread}</span>}
    </button>
  );
}

function Sidebar({ section, go, open, onClose, email, onSignOut }: { section: SectionId; go: (s: string) => void; open: boolean; onClose: () => void; email: string; onSignOut: () => void }) {
  const { unread, pendingOrders } = useNotifications();
  const chatUnread = useChatAdmin().unread;
  const nav = (
    <nav aria-label="Admin sections" className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 px-4 pb-4 pt-5">
        <div className="flex items-center gap-3">
          <img src="assets/images/logo-256.webp" alt="" className="h-10 w-10 rounded-full" />
          <div>
            <p className="font-display text-base leading-tight">Dawat Biryani</p>
            <p className="text-[10px] uppercase tracking-[0.2em] text-gold">Management</p>
          </div>
        </div>
        <button type="button" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-lg hover:bg-white/10 lg:hidden" aria-label="Close admin menu"><X size={18} /></button>
      </div>
      <ul className="flex-1 space-y-0.5 overflow-y-auto px-2">
        {SECTIONS.map((s) => {
          const Icon = s.icon;
          const count = s.id === 'notifications' ? unread : s.id === 'orders' ? pendingOrders : s.id === 'chat' ? chatUnread : 0;
          return (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                onClick={(e) => { e.preventDefault(); go(s.id); }}
                aria-current={section === s.id ? 'page' : undefined}
                className={`flex min-h-[42px] items-center gap-3 rounded-lg px-3 text-sm transition ${section === s.id ? 'bg-gold/15 text-gold ring-1 ring-gold/30' : 'text-ivory/75 hover:bg-white/5 hover:text-ivory'}`}
              >
                <Icon size={18} aria-hidden />
                <span className="flex-1">{s.label}</span>
                {count > 0 && <span className="rounded-full bg-red-600 px-1.5 text-[10px] font-bold text-white">{count}</span>}
              </a>
            </li>
          );
        })}
      </ul>
      <div className="border-t border-white/10 p-3 text-xs text-ivory/55">
        <p className="truncate px-1" title={email}>{email}</p>
        <div className="mt-2 flex gap-2">
          <a href="./" className="inline-flex min-h-[40px] flex-1 items-center justify-center rounded-lg border border-white/15 hover:bg-white/10">View site</a>
          <button type="button" onClick={onSignOut} className="inline-flex min-h-[40px] flex-1 items-center justify-center gap-1 rounded-lg border border-white/15 hover:bg-white/10"><LogOut size={14} /> Sign out</button>
        </div>
      </div>
    </nav>
  );
  return (
    <>
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r border-white/10 bg-[#0e0a08] lg:block">{nav}</aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Admin menu">
          <div className="absolute inset-0 bg-black/70" onClick={onClose} />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-[#0e0a08] shadow-2xl">{nav}</aside>
        </div>
      )}
    </>
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
    if (error) setErr(/fetch/i.test(error.message) ? 'Network problem — try again.' : 'Login failed. Check the email and password.');
  };
  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
      <img src="assets/images/logo-256.webp" alt="" className="h-14 w-14 rounded-full" />
      <h1 className="font-display text-2xl">Admin login</h1>
      <Field label="Email"><Input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
      <Field label="Password"><Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
      {err && <Notice kind="err">{err}</Notice>}
      <Btn tone="gold" type="submit" busy={busy} className="w-full">Sign in</Btn>
    </form>
  );
}
