import { AudioAsset } from '../types';

class SoundEngine {
  private ctx: AudioContext | null = null;
  private timer: number | null = null;

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

  public playBgm(asset: AudioAsset) {
    this.stopBgm();
    const ctx = this.ensureContext();
    if (!ctx || !asset.notes || asset.notes.length === 0) return;

    let step = 0;
    const intervalMs = Math.max(220, Math.round((60 / (asset.tempo || 100)) * 1000));

    const playNextNote = () => {
      if (!this.ctx) return;
      const freq = asset.notes[step % asset.notes.length];
      step += 1;

      try {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = asset.waveType || 'sine';
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);

        gain.gain.setValueAtTime(0.001, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.035, this.ctx.currentTime + 0.06);
        gain.gain.exponentialRampToValueAtTime(0.0008, this.ctx.currentTime + intervalMs / 1000);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + intervalMs / 1000);
      } catch {
        // ignore audio errors
      }
    };

    playNextNote();
    this.timer = window.setInterval(playNextNote, intervalMs);
  }

  public stopBgm() {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

export const soundEngine = new SoundEngine();
