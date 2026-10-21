class AudioSynthService {
  private ctx: AudioContext | null = null;
  private bgmTimer: number | null = null;
  private currentBgmId: string = 'none';

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public playSfx(sfxId: string, volume = 80) {
    if (sfxId === 'none' || volume <= 0) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const gain = ctx.createGain();
    const vol = Math.min(0.25, (volume / 100) * 0.2);
    gain.gain.setValueAtTime(vol, now);
    gain.connect(ctx.destination);

    const osc = ctx.createOscillator();
    if (sfxId === 'chime') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.18);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
      osc.connect(gain);
      osc.start(now);
      osc.stop(now + 0.45);
    } else if (sfxId === 'train_bell') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(783.99, now);
      osc.frequency.setValueAtTime(659.25, now + 0.16);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
      osc.connect(gain);
      osc.start(now);
      osc.stop(now + 0.5);
    } else if (sfxId === 'heartbeat') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(110, now);
      osc.frequency.exponentialRampToValueAtTime(55, now + 0.25);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      osc.connect(gain);
      osc.start(now);
      osc.stop(now + 0.3);
    } else {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(523.25, now + 0.12);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      osc.connect(gain);
      osc.start(now);
      osc.stop(now + 0.22);
    }
  }

  public startBgm(bgmId: string, volume = 75) {
    if (this.currentBgmId === bgmId) return;
    this.stopBgm();
    this.currentBgmId = bgmId;
    if (bgmId === 'none' || volume <= 0) return;

    const chords: Record<string, number[]> = {
      rain_echo: [261.63, 311.13, 392.0, 466.16],
      blue_nocturne: [293.66, 349.23, 440.0, 523.25],
      starlight_waltz: [329.63, 392.0, 493.88, 587.33],
      tension_pulse: [220.0, 261.63, 311.13, 370.0],
      dawn_promise: [261.63, 329.63, 392.0, 523.25],
    };

    const notes = chords[bgmId] || chords.blue_nocturne;
    let step = 0;

    this.bgmTimer = window.setInterval(() => {
      const ctx = this.ensureContext();
      if (!ctx || ctx.state !== 'running') return;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(notes[step % notes.length], now);
      const maxGain = Math.min(0.06, (volume / 100) * 0.05);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(maxGain, now + 0.2);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + 1.4);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 1.45);
      step++;
    }, 1600);
  }

  public stopBgm() {
    if (this.bgmTimer !== null) {
      clearInterval(this.bgmTimer);
      this.bgmTimer = null;
    }
    this.currentBgmId = 'none';
  }
}

export const audioSynth = new AudioSynthService();
