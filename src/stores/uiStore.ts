import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { guessQuality, type QualityTier } from '../utils/device';

export type QualityMode = 'auto' | QualityTier;

interface SettingsState {
  qualityMode: QualityMode;
  soundOn: boolean;
  volume: number; // 0..1
  /** true once the visitor moved the volume slider themselves */
  volumeChosen: boolean;
  voiceOn: boolean;
  hostVisible: boolean;
  musicOn: boolean;
  sfxOn: boolean;
  setMusicOn: (v: boolean) => void;
  setSfxOn: (v: boolean) => void;
  setQualityMode: (q: QualityMode) => void;
  setSoundOn: (v: boolean) => void;
  setVolume: (v: number) => void;
  setVoiceOn: (v: boolean) => void;
  setHostVisible: (v: boolean) => void;
}

/** Persisted user preferences. Sound is always off until the visitor turns it on. */
export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      qualityMode: 'auto',
      soundOn: false,
      volume: 0.6,
      volumeChosen: false,
      voiceOn: false,
      hostVisible: true,
      musicOn: true,
      sfxOn: true,
      setMusicOn: (musicOn) => set({ musicOn }),
      setSfxOn: (sfxOn) => set({ sfxOn }),
      setQualityMode: (qualityMode) => set({ qualityMode }),
      setSoundOn: (soundOn) => set({ soundOn }),
      setVolume: (volume) => set({ volume, volumeChosen: true }),
      setVoiceOn: (voiceOn) => set({ voiceOn }),
      setHostVisible: (hostVisible) => set({ hostVisible }),
    }),
    {
      name: 'dawat-settings-v1',
      storage: createJSONStorage(() => localStorage),
      // Never restore "sound on" automatically — audio must start from a user gesture.
      partialize: (s) => ({ qualityMode: s.qualityMode, volume: s.volume, volumeChosen: s.volumeChosen, hostVisible: s.hostVisible, musicOn: s.musicOn, sfxOn: s.sfxOn }),
    },
  ),
);

interface UIState {
  introDone: boolean;
  sceneReady: boolean;
  autoTier: QualityTier;
  cartOpen: boolean;
  navOpen: boolean;
  settingsOpen: boolean;
  productId: string | null;
  activeSection: string;
  storyChapter: number;
  toast: { id: number; text: string } | null;
  setIntroDone: () => void;
  setSceneReady: () => void;
  setAutoTier: (t: QualityTier) => void;
  setCartOpen: (v: boolean) => void;
  setNavOpen: (v: boolean) => void;
  setSettingsOpen: (v: boolean) => void;
  openProduct: (id: string | null) => void;
  setActiveSection: (id: string) => void;
  setStoryChapter: (n: number) => void;
  showToast: (text: string) => void;
}

export const useUI = create<UIState>()((set) => ({
  introDone: false,
  sceneReady: false,
  autoTier: guessQuality(),
  cartOpen: false,
  navOpen: false,
  settingsOpen: false,
  productId: null,
  activeSection: 'home',
  storyChapter: 0,
  toast: null,
  setIntroDone: () => set({ introDone: true }),
  setSceneReady: () => set({ sceneReady: true }),
  setAutoTier: (autoTier) => set({ autoTier }),
  setCartOpen: (cartOpen) => set({ cartOpen, navOpen: false, settingsOpen: false }),
  setNavOpen: (navOpen) => set({ navOpen }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  openProduct: (productId) => set({ productId }),
  setActiveSection: (activeSection) => set({ activeSection }),
  setStoryChapter: (storyChapter) => set({ storyChapter }),
  showToast: (text) => set({ toast: { id: Date.now(), text } }),
}));

/** Effective graphics tier (manual choice wins over auto). */
export const useQuality = (): QualityTier => {
  const mode = useSettings((s) => s.qualityMode);
  const auto = useUI((s) => s.autoTier);
  return mode === 'auto' ? auto : mode;
};
