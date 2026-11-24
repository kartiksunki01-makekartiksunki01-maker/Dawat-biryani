import { useCart } from '../../stores/cartStore';
import { useMyOrders } from '../../lib/myOrders';
import { motion } from 'framer-motion';
import { useEffect, useRef } from 'react';
import { useQuality, useSettings, useUI, type QualityMode } from '../../stores/uiStore';
import { sound, stopSpeaking } from '../../utils/sound';

const MODES: { id: QualityMode; label: string }[] = [
  { id: 'auto', label: 'Auto' },
  { id: 'high', label: 'High' },
  { id: 'medium', label: 'Medium' },
  { id: 'low', label: 'Low' },
];

function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex min-h-[44px] cursor-pointer items-center justify-between gap-4">
      <span>
        <span className="block text-sm text-ivory">{label}</span>
        {hint && <span className="block text-xs text-ivory/50">{hint}</span>}
      </span>
      <span className="relative">
        <input type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="block h-6 w-11 rounded-full bg-ivory/15 transition peer-checked:bg-gold/80 peer-focus-visible:ring-2 peer-focus-visible:ring-saffron" />
        <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-ivory shadow transition peer-checked:translate-x-5" />
      </span>
    </label>
  );
}

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const s = useSettings();
  const effective = useQuality();

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node) && !(e.target as HTMLElement).closest('[aria-controls="settings-panel"]')) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <motion.div
      ref={ref}
      id="settings-panel"
      role="dialog"
      aria-label="Experience settings"
      className="glass absolute right-0 top-14 w-[min(86vw,320px)] rounded-3xl p-5 text-left"
      initial={{ opacity: 0, y: -8, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.97 }}
      transition={{ duration: 0.25 }}
    >
      <fieldset>
        <legend className="t-eyebrow text-gold">Graphics quality</legend>
        <div className="mt-3 grid grid-cols-4 gap-1 rounded-full bg-ivory/5 p-1 ring-1 ring-gold/20">
          {MODES.map((m) => (
            <label key={m.id} className="relative">
              <input
                type="radio"
                name="quality"
                className="peer sr-only"
                checked={s.qualityMode === m.id}
                onChange={() => s.setQualityMode(m.id)}
              />
              <span className="grid min-h-[40px] cursor-pointer place-items-center rounded-full text-xs text-ivory/70 transition peer-checked:bg-gold peer-checked:font-semibold peer-checked:text-clove peer-focus-visible:ring-2 peer-focus-visible:ring-saffron">
                {m.label}
              </span>
            </label>
          ))}
        </div>
        <p className="mt-2 text-xs text-ivory/50">
          Rendering at <span className="capitalize text-ivory/80">{effective}</span>
          {s.qualityMode === 'auto' && ' — adjusts automatically if frames drop.'}
        </p>
      </fieldset>

      <div className="hairline my-4" />

      <div className="space-y-1">
        <Toggle
          label="Sound"
          hint="Ambient music & effects (off by default)"
          checked={s.soundOn}
          onChange={async (v) => {
            s.setSoundOn(v);
            await sound.setEnabled(v);
          }}
        />
        <label className="flex items-center gap-3 py-1 text-xs text-ivory/60">
          Volume
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={s.volume}
            onChange={(e) => {
              const v = Number(e.target.value);
              s.setVolume(v);
              sound.setVolume(v);
            }}
            className="gold-range flex-1"
            style={{ ['--fill' as string]: `${s.volume * 100}%` }}
            aria-label="Volume"
          />
        </label>
        <Toggle label="Background music" hint={sound.hasUploadedTrack ? 'Restaurant’s music' : 'Soft built-in ambience'} checked={s.musicOn} onChange={s.setMusicOn} />
        <Toggle label="Sound effects" hint="Taps, chimes" checked={s.sfxOn} onChange={s.setSfxOn} />
        <Toggle
          label="Anna’s voice"
          hint="Spoken dialogue with on-screen captions"
          checked={s.voiceOn}
          onChange={(v) => {
            s.setVoiceOn(v);
            if (!v) stopSpeaking();
          }}
        />
        <Toggle label="Show Dawat Anna" hint="Your virtual host" checked={s.hostVisible} onChange={s.setHostVisible} />
        <YourData />
      </div>
    </motion.div>
  );
}

/** Customer controls for what this device remembers. */
function YourData() {
  const remember = useCart((c) => c.remember);
  const forgetDetails = useCart((c) => c.forgetDetails);
  const lines = useCart((c) => c.lines);
  const clear = useCart((c) => c.clear);
  const orders = useMyOrders((o) => o.orders);
  const forgetAll = useMyOrders((o) => o.forgetAll);
  const showToast = useUI((u) => u.showToast);
  return (
    <div className="mt-3 space-y-2 border-t border-gold/15 pt-3 text-xs text-ivory/70">
      <p className="t-eyebrow text-gold">Your data on this device</p>
      <a className="flex min-h-[40px] items-center underline hover:text-gold" href="track.html">
        View my orders ({orders.length})
      </a>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <button type="button" className="min-h-[40px] underline disabled:opacity-40" disabled={!remember} onClick={() => { forgetDetails(); showToast('Saved details removed.'); }}>
          Forget my saved details
        </button>
        <button type="button" className="min-h-[40px] underline disabled:opacity-40" disabled={!lines.length} onClick={() => { clear(); showToast('Cart cleared.'); }}>
          Clear cart
        </button>
        <button type="button" className="min-h-[40px] underline disabled:opacity-40" disabled={!orders.length} onClick={() => { forgetAll(); showToast('Order links removed from this device.'); }}>
          Forget order links
        </button>
        <button type="button" className="min-h-[40px] underline" onClick={() => { try { localStorage.removeItem('dawat-host-seen-v2'); sessionStorage.removeItem('dawat-host-session-v2'); } catch { /* ignore */ } showToast('Anna’s tips will show again.'); }}>
          Reset Anna’s tips
        </button>
      </div>
    </div>
  );
}
