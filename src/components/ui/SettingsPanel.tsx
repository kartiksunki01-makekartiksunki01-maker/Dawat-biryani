import { useCart } from '../../stores/cartStore';
import { useMyOrders } from '../../lib/myOrders';
import { motion } from 'framer-motion';
import { Music2, Sparkles, Volume1, Volume2, VolumeX, X, type LucideIcon } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useSettings, useUI } from '../../stores/uiStore';
import { sound } from '../../utils/sound';

/** Premium royal switch row (gold track, ivory pearl thumb). */
function Toggle({ checked, onChange, label, hint, icon: Icon, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string; icon?: LucideIcon; disabled?: boolean }) {
  return (
    <label className={`royal-row flex min-h-[56px] items-center gap-3 rounded-2xl px-3 py-2 ${disabled ? 'opacity-45' : 'cursor-pointer'}`}>
      {Icon && (
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ring-1 transition-colors duration-300 ${checked && !disabled ? 'bg-gold/15 text-gold ring-gold/40' : 'bg-ivory/5 text-ivory/45 ring-ivory/10'}`} aria-hidden>
          <Icon size={16} />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-ivory">{label}</span>
        {hint && <span className="block truncate text-[11px] text-ivory/50">{hint}</span>}
      </span>
      <input type="checkbox" role="switch" className="sr-only" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="royal-switch" aria-hidden />
    </label>
  );
}

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const s = useSettings();

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

  const VolIcon = !s.soundOn || s.volume === 0 ? VolumeX : s.volume < 0.5 ? Volume1 : Volume2;

  return (
    <motion.div
      ref={ref}
      id="settings-panel"
      role="dialog"
      aria-label="Experience settings"
      className="royal-panel absolute right-0 top-14 w-[min(90vw,340px)] overflow-hidden rounded-[1.75rem] text-left"
      initial={{ opacity: 0, y: -8, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.97 }}
      transition={{ duration: 0.25 }}
    >
      <div className="flex items-center justify-between border-b border-gold/15 px-5 pb-3 pt-4">
        <div>
          <p className="t-eyebrow text-gold">Experience</p>
          <p className="mt-0.5 font-display text-lg text-ivory">Sound &amp; preferences</p>
        </div>
        <button type="button" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-full text-ivory/60 ring-1 ring-ivory/10 transition hover:bg-ivory/10 hover:text-ivory" aria-label="Close settings">
          <X size={16} />
        </button>
      </div>

      <div className="space-y-1 p-3">
        <Toggle
          label="Sound"
          hint="Music & effects"
          icon={Volume2}
          checked={s.soundOn}
          onChange={async (v) => {
            s.setSoundOn(v);
            await sound.setEnabled(v);
          }}
        />
        <div className={`rounded-2xl px-3 py-1 transition-opacity ${s.soundOn ? '' : 'opacity-45'}`}>
          <label className="flex items-center gap-3 text-xs text-ivory/60">
            <VolIcon size={16} className="shrink-0 text-gold/80" aria-hidden />
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
            <span className="w-9 text-right font-num tabular-nums text-ivory/70">{Math.round(s.volume * 100)}%</span>
          </label>
        </div>
        <Toggle label="Background music" hint={sound.hasUploadedTrack ? 'Restaurant’s music' : '“Saffron and Gold”'} icon={Music2} checked={s.musicOn} disabled={!s.soundOn} onChange={s.setMusicOn} />
        <Toggle label="Sound effects" hint="Taps & chimes" icon={Sparkles} checked={s.sfxOn} disabled={!s.soundOn} onChange={s.setSfxOn} />
      </div>
      <div className="px-5 pb-5">
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
    <div className="space-y-2 border-t border-gold/15 pt-4 text-xs text-ivory/70">
      <p className="t-eyebrow text-gold">Your data on this device</p>
      <a className="royal-chip royal-chip-gold w-full justify-between" href="track.html">
        <span>View my orders</span>
        <span className="rounded-full bg-black/25 px-2 py-0.5 font-num tabular-nums">{orders.length}</span>
      </a>
      <div className="flex flex-wrap gap-1.5">
        <button type="button" className="royal-chip" disabled={!remember} onClick={() => { forgetDetails(); showToast('Saved details removed.'); }}>
          Forget my saved details
        </button>
        <button type="button" className="royal-chip" disabled={!lines.length} onClick={() => { clear(); showToast('Cart cleared.'); }}>
          Clear cart
        </button>
        <button type="button" className="royal-chip" disabled={!orders.length} onClick={() => { forgetAll(); showToast('Order links removed from this device.'); }}>
          Forget order links
        </button>
      </div>
    </div>
  );
}
