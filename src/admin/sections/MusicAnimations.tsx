import { useState } from 'react';
import { Btn, Card, Field, Input, Notice, PageHeader, Skeleton, Toggle, useAdmin } from '../ui';
import type { WebsiteRow } from './Appearance';
import { useSingleton } from './settingsHook';
import { uploadAudio } from './upload';

export function MusicAnimations() {
  const { sb, toast } = useAdmin();
  const s = useSingleton<WebsiteRow>('website_settings');
  const [uploading, setUploading] = useState(false);
  const d = s.draft;
  return (
    <section aria-label="Music and animations">
      <PageHeader title="Music & Animations" intro="Background music always starts muted — visitors switch sound on themselves (browsers require it)."
        actions={<Btn tone="gold" disabled={!s.dirty} busy={s.busy} onClick={() => void s.save()}>Save changes</Btn>} />
      {s.err && <Notice kind="err">{s.err}</Notice>}
      {!d ? <Skeleton rows={3} /> : (
        <div className="space-y-4">
          <Card>
            <h2 className="mb-2 text-sm font-semibold text-gold">Background music</h2>
            <Toggle label="Background music enabled" hint="When off, only sound effects can play" checked={d.music_enabled} onChange={(v) => s.set({ music_enabled: v })} />
            <Toggle label="Sound effects enabled" hint="Taps, chimes, lid opening" checked={d.sfx_enabled} onChange={(v) => s.set({ sfx_enabled: v })} />
            <Field label={`Default volume for new visitors: ${Math.round(d.music_volume * 100)}%`}>
              <input type="range" min={0} max={1} step={0.05} value={d.music_volume} onChange={(e) => s.set({ music_volume: Number(e.target.value) })} className="w-full accent-[#D4AF37]" />
            </Field>
            <div className="mt-3 space-y-2 rounded-lg bg-white/5 p-3 text-sm">
              {d.music_url ? (
                <>
                  <p>Current track: <b>{d.music_title || 'Uploaded track'}</b></p>
                  <audio controls preload="none" src={d.music_url} className="w-full" />
                  <Btn tone="danger" onClick={() => s.set({ music_url: null, music_title: '' })}>Remove track (use built-in “Saffron and Gold”)</Btn>
                </>
              ) : (
                <p className="text-ivory/65">No track uploaded — the website plays its built-in background track “Saffron and Gold”. It starts with the visitor’s first tap (browsers block sound before that) and stays silent during the intro video.</p>
              )}
              <Field label="Upload a track (MP3, OGG, M4A, AAC or WAV, max 15 MB)" hint="Use only music you own or have a licence for — no film songs without permission.">
                <input type="file" accept="audio/mpeg,audio/ogg,audio/mp4,audio/aac,audio/x-m4a,audio/wav" disabled={uploading} className="text-xs" onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setUploading(true);
                  const r = await uploadAudio(sb, file);
                  setUploading(false);
                  if ('error' in r) toast(r.error, 'err');
                  else { s.set({ music_url: r.url, music_title: file.name.replace(/\.[^.]+$/, '').slice(0, 80) }); toast('Uploaded — preview it, then press Save changes.'); }
                }} />
              </Field>
              {uploading && <p className="text-xs text-ivory/60">Uploading…</p>}
              {d.music_url && <Field label="Track name"><Input maxLength={80} value={d.music_title} onChange={(e) => s.set({ music_title: e.target.value })} /></Field>}
            </div>
          </Card>
          <Card>
            <h2 className="mb-2 text-sm font-semibold text-gold">Intro video</h2>
            <Toggle label="Show the intro" checked={d.intro_enabled} onChange={(v) => s.set({ intro_enabled: v })} />
            <Toggle label="Also show it to returning visitors" hint="Off = only the first visit on each device" checked={d.intro_for_returning} onChange={(v) => s.set({ intro_for_returning: v })} />
            <p className="mt-1 text-xs leading-relaxed text-ivory/60">
              The intro is the Dawat brand film (about 10 seconds). It starts muted with an optional sound button, visitors can press
              “Skip intro” at any time, and it plays at most once per browser session. Its length comes from the video itself.
            </p>
            <a className="mt-2 inline-flex min-h-[40px] items-center rounded-lg border border-white/20 px-4 text-sm font-semibold hover:bg-white/10" href="./?intro=preview" target="_blank" rel="noopener noreferrer">Preview intro (save first)</a>
          </Card>
          {s.dirty && <div className="flex justify-end gap-2"><Btn onClick={s.reset}>Discard</Btn><Btn tone="gold" busy={s.busy} onClick={() => void s.save()}>Save changes</Btn></div>}
        </div>
      )}
    </section>
  );
}
