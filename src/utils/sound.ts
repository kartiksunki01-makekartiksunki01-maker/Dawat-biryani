/**
 * Original, fully synthesised sound design (Web Audio API) — no third-party audio files,
 * so there is nothing to license. Muted by default; starts only after a user gesture.
 */
export type SfxName = 'click' | 'lid' | 'chime' | 'whoosh' | 'add';

class SoundEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private ambienceBus!: GainNode;
  private sfxBus!: GainNode;
  private reverb!: ConvolverNode;
  private droneNodes: AudioScheduledSourceNode[] = [];
  private pluckTimer: number | null = null;
  private sizzleGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private enabled = false;
  private volume = 0.6;
  // background track (uploaded by the restaurant in the admin panel) — plain <audio>, no CORS needed
  private track: HTMLAudioElement | null = null;
  private trackUrl: string | null = null;
  private fadeTimer: number | null = null;
  private musicAllowed = true; // admin switch
  private sfxAllowed = true; //   admin switch
  private userMusic = true; //    visitor switch
  private userSfx = true; //      visitor switch
  private held = false; //        true while the intro video is on screen (its own audio must never overlap ours)

  /** Admin settings from the backend. */
  configure(o: { musicUrl?: string | null; musicEnabled?: boolean; sfxEnabled?: boolean; defaultVolume?: number }) {
    if (o.musicEnabled !== undefined) this.musicAllowed = o.musicEnabled;
    if (o.sfxEnabled !== undefined) this.sfxAllowed = o.sfxEnabled;
    if (o.musicUrl !== undefined && o.musicUrl !== this.trackUrl) {
      this.disposeTrack();
      this.trackUrl = o.musicUrl;
    }
    this.applyMusic();
  }

  /** Visitor preferences (saved on this device). */
  setUserPrefs(o: { music: boolean; sfx: boolean }) {
    this.userMusic = o.music;
    this.userSfx = o.sfx;
    this.applyMusic();
  }

  get hasUploadedTrack() {
    return !!this.trackUrl;
  }

  private wantsMusic() {
    return this.enabled && !this.held && this.musicAllowed && this.userMusic;
  }

  /** Silence all site audio (music, ambience, effects) while the intro video plays; release restores it. */
  setHeld(on: boolean) {
    if (this.held === on) return;
    this.held = on;
    if (this.ctx) this.master.gain.setTargetAtTime(on || !this.enabled ? 0 : this.volume, this.ctx.currentTime, 0.15);
    this.applyMusic();
  }

  private applyMusic() {
    if (!this.ctx && !this.track) {
      if (!this.enabled) return;
    }
    if (this.wantsMusic()) {
      if (this.trackUrl) {
        this.stopAmbience();
        this.playTrack();
      } else {
        this.fadeTrack(0, true);
        this.startAmbience();
      }
    } else {
      this.fadeTrack(0, true);
      this.stopAmbience();
    }
  }

  private playTrack() {
    if (!this.trackUrl) return;
    if (!this.track) {
      const a = new Audio();
      a.src = this.trackUrl;
      a.loop = true;
      a.preload = 'auto';
      a.volume = 0;
      this.track = a;
    }
    const a = this.track;
    a.play()
      .then(() => this.fadeTrack(Math.min(1, this.volume * 0.85), false))
      .catch(() => {
        /* autoplay refused or file failed — fall back to the built-in ambience */
        this.startAmbience();
      });
  }

  private fadeTrack(target: number, pauseAtEnd: boolean) {
    const a = this.track;
    if (!a) return;
    if (this.fadeTimer) window.clearInterval(this.fadeTimer);
    const start = a.volume;
    const steps = 16;
    let i = 0;
    this.fadeTimer = window.setInterval(() => {
      i++;
      a.volume = Math.max(0, Math.min(1, start + ((target - start) * i) / steps));
      if (i >= steps) {
        if (this.fadeTimer) window.clearInterval(this.fadeTimer);
        this.fadeTimer = null;
        if (pauseAtEnd && target === 0) a.pause();
      }
    }, 50);
  }

  private disposeTrack() {
    if (this.fadeTimer) window.clearInterval(this.fadeTimer);
    this.fadeTimer = null;
    if (this.track) {
      this.track.pause();
      this.track.removeAttribute('src');
      this.track.load();
      this.track = null;
    }
  }

  private ensure() {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(ctx.destination);

    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.makeImpulse(2.6);
    const wet = ctx.createGain();
    wet.gain.value = 0.35;
    this.reverb.connect(wet).connect(this.master);

    this.ambienceBus = ctx.createGain();
    this.ambienceBus.gain.value = 0.5;
    this.ambienceBus.connect(this.master);
    this.ambienceBus.connect(this.reverb);

    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = 0.9;
    this.sfxBus.connect(this.master);
    this.sfxBus.connect(this.reverb);

    this.noiseBuffer = this.makeNoise(2);
    return ctx;
  }

  private makeNoise(seconds: number) {
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  private makeImpulse(seconds: number) {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    return buf;
  }

  get isEnabled() {
    return this.enabled;
  }

  setVolume(v: number) {
    this.volume = v;
    if (this.ctx && this.enabled && !this.held) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.1);
    if (this.track && this.wantsMusic() && !this.track.paused) this.fadeTrack(Math.min(1, v * 0.85), false);
  }

  async setEnabled(on: boolean) {
    this.enabled = on;
    if (on) {
      const ctx = this.ensure();
      if (!ctx) return;
      if (ctx.state === 'suspended') await ctx.resume();
      this.master.gain.setTargetAtTime(this.held ? 0 : this.volume, ctx.currentTime, 0.4);
      this.applyMusic();
    } else {
      this.fadeTrack(0, true);
      if (this.ctx) {
        this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.15);
        window.setTimeout(() => {
          if (!this.enabled) this.stopAmbience();
        }, 900);
      }
    }
  }

  /* ── Ambience: a soft tanpura-like drone (Sa–Pa) with gentle plucks ── */
  private startAmbience() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    if (!ctx || this.droneNodes.length) return;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 700;
    const droneGain = ctx.createGain();
    droneGain.gain.value = 0.0;
    droneGain.gain.setTargetAtTime(0.05, ctx.currentTime, 2);
    filter.connect(droneGain).connect(this.ambienceBus);
    [130.81, 196.0, 261.63, 130.81 * 1.003].forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = i === 1 ? 'triangle' : 'sawtooth';
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = i === 2 ? 0.25 : 0.4;
      o.connect(g).connect(filter);
      o.start();
      this.droneNodes.push(o);
    });
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 220;
    lfo.connect(lfoGain).connect(filter.frequency);
    lfo.start();
    this.droneNodes.push(lfo);

    const pattern = [98.0, 130.81 * 2, 130.81 * 2, 65.41 * 2];
    let step = 0;
    this.pluckTimer = window.setInterval(() => {
      if (!this.enabled) return;
      this.pluck(pattern[step % pattern.length]);
      step++;
    }, 1150);

    // cooking ambience (sizzle) — level driven by the 3D story
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const hp = ctx.createBiquadFilter();
    hp.type = 'bandpass';
    hp.frequency.value = 4200;
    hp.Q.value = 0.6;
    this.sizzleGain = ctx.createGain();
    this.sizzleGain.gain.value = 0;
    src.connect(hp).connect(this.sizzleGain).connect(this.ambienceBus);
    src.start();
    this.droneNodes.push(src);
  }

  private stopAmbience() {
    this.droneNodes.forEach((n) => {
      try {
        n.stop();
      } catch {
        /* already stopped */
      }
    });
    this.droneNodes = [];
    if (this.pluckTimer) window.clearInterval(this.pluckTimer);
    this.pluckTimer = null;
    this.sizzleGain = null;
  }

  private pluck(freq: number) {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(2600, t);
    lp.frequency.exponentialRampToValueAtTime(500, t + 2.2);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.06, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 3.6);
    lp.connect(g).connect(this.ambienceBus);
    [0, 3].forEach((cents) => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = freq;
      o.detune.value = cents;
      o.connect(lp);
      o.start(t);
      o.stop(t + 3.7);
    });
  }

  /** 0..1 — cooking sizzle intensity */
  setSizzle(level: number) {
    if (!this.ctx || !this.sizzleGain) return;
    this.sizzleGain.gain.setTargetAtTime(level * 0.035, this.ctx.currentTime, 0.3);
  }

  play(name: SfxName) {
    if (!this.enabled || this.held || !this.sfxAllowed || !this.userSfx) return;
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime;
    switch (name) {
      case 'click':
        this.noiseBurst(t, 0.025, 3800, 0.18);
        break;
      case 'whoosh': {
        const src = ctx.createBufferSource();
        src.buffer = this.noiseBuffer;
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.Q.value = 1.2;
        bp.frequency.setValueAtTime(300, t);
        bp.frequency.exponentialRampToValueAtTime(2400, t + 0.5);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.22, t + 0.18);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
        src.connect(bp).connect(g).connect(this.sfxBus);
        src.start(t);
        src.stop(t + 0.75);
        break;
      }
      case 'lid':
        // inharmonic metallic partials + a short scrape
        [[523, 1.4], [1307, 0.9], [2093, 0.7], [2987, 0.45], [3651, 0.3]].forEach(([f, d], i) =>
          this.tone(t, f, d, 0.08 / (i + 1), 'sine'),
        );
        this.noiseBurst(t, 0.12, 6000, 0.12);
        break;
      case 'chime':
      case 'add':
        [1046.5, 1318.5, 1568].forEach((f, i) => {
          this.tone(t + i * 0.075, f, 1.1, 0.07, 'sine');
          this.tone(t + i * 0.075, f * 2.76, 0.5, 0.015, 'sine');
        });
        break;
    }
  }

  private tone(t: number, freq: number, decay: number, peak: number, type: OscillatorType) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    o.connect(g).connect(this.sfxBus);
    o.start(t);
    o.stop(t + decay + 0.05);
  }

  private noiseBurst(t: number, dur: number, freq: number, peak: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp).connect(g).connect(this.sfxBus);
    src.start(t);
    src.stop(t + dur + 0.02);
  }
}

export const sound = new SoundEngine();

/* ── Optional voice for the virtual host (Web Speech API). Requires the visitor to enable it. ── */
export function speak(text: string) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return false;
  const synth = window.speechSynthesis;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const voices = synth.getVoices();
  u.voice =
    voices.find((v) => v.lang === 'en-IN' && /male/i.test(v.name)) ??
    voices.find((v) => v.lang === 'en-IN') ??
    voices.find((v) => v.lang.startsWith('en')) ??
    null;
  u.lang = u.voice?.lang ?? 'en-IN';
  u.rate = 0.98;
  u.pitch = 0.9;
  synth.speak(u);
  return true;
}

export const stopSpeaking = () => {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
};
