import { useEffect, useState } from 'react';
import { Btn, Card, Confirm, errText, Field, fmtDT, Input, Notice, PageHeader, Skeleton, useAdmin } from '../ui';

interface Audit { id: number; actor: string | null; action: string; entity: string; entity_id: string | null; details: Record<string, unknown>; created_at: string }

export function Account() {
  const { sb, user, toast } = useAdmin();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [logs, setLogs] = useState<Audit[] | null>(null);
  const [logErr, setLogErr] = useState('');
  const [confirmAll, setConfirmAll] = useState(false);

  useEffect(() => {
    void sb.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(100).then(({ data, error }) => {
      if (error) setLogErr(errText(error)); else setLogs(data as Audit[]);
    });
  }, [sb]);

  const pwProblem = pw && pw.length < 10 ? 'Use at least 10 characters.' : pw2 && pw !== pw2 ? 'Passwords do not match.' : '';
  return (
    <section aria-label="Account and security">
      <PageHeader title="Account & Security" />
      <div className="space-y-4">
        <Card>
          <p className="text-sm">Signed in as <b>{user.email}</b></p>
          <p className="text-xs text-ivory/50">Last sign-in {fmtDT(user.last_sign_in_at)}</p>
        </Card>
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-gold">Change password</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="New password"><Input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
            <Field label="Repeat new password"><Input type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></Field>
          </div>
          {pwProblem && <p className="mt-2 text-xs text-red-300">{pwProblem}</p>}
          <Btn tone="gold" className="mt-3" busy={busy} disabled={!pw || !!pwProblem || pw !== pw2} onClick={async () => {
            setBusy(true);
            const { error } = await sb.auth.updateUser({ password: pw });
            setBusy(false);
            if (error) toast(errText(error, 'Could not change the password.'), 'err'); else { toast('Password changed.'); setPw(''); setPw2(''); }
          }}>Update password</Btn>
        </Card>
        <Card>
          <h2 className="mb-2 text-sm font-semibold text-gold">Sessions</h2>
          <p className="mb-3 text-xs text-ivory/55">Lost a phone or used a shared computer? Sign out everywhere.</p>
          <Btn tone="danger" onClick={() => setConfirmAll(true)}>Sign out on all devices</Btn>
        </Card>
        <Card>
          <h2 className="mb-2 text-sm font-semibold text-gold">Activity log</h2>
          <p className="mb-3 text-xs text-ivory/55">Changes to orders, prices, offers, settings and customers (last 100). Customer phone numbers are not copied into this log.</p>
          {logErr && <Notice kind="err">{logErr}</Notice>}
          {!logs ? <Skeleton rows={2} /> : !logs.length ? <p className="text-sm text-ivory/55">No activity yet.</p> : (
            <ul className="max-h-[420px] space-y-1 overflow-y-auto text-xs">
              {logs.map((l) => (
                <li key={l.id} className="rounded-lg bg-white/[0.03] px-3 py-2">
                  <span className="text-ivory/50">{fmtDT(l.created_at)}</span> · <b>{l.action}</b> {l.entity} <span className="font-mono text-ivory/45">{l.entity_id?.slice(0, 18)}</span>
                  {l.actor === user.id && <span className="text-gold"> · you</span>}
                  {l.action === 'update' && <span className="block text-ivory/60">{Object.entries(l.details).map(([k, v]) => `${k}: ${JSON.stringify((v as unknown[])[0])} → ${JSON.stringify((v as unknown[])[1])}`).join('; ').slice(0, 240)}</span>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <Confirm open={confirmAll} onClose={() => setConfirmAll(false)} title="Sign out on all devices?" body={<p>Every device signed in with this account (including this one) will need to log in again.</p>}
        confirmLabel="Sign out everywhere" danger onConfirm={async () => { await sb.auth.signOut({ scope: 'global' }); }} />
    </section>
  );
}
