import type { AudioAsset } from '../types';

type AudioErrorHandler = (message: string) => void;

/** Built-in assets are simple synthesised notes, not uploaded audio files. */
class SoundEngine {
  private ctx: AudioContext | null = null;
  private timer: number | null = null;
  private bgmGain: GainNode | null = null;
  private sfxGains = new Set<GainNode>();
  private bgmId: string | null = null;
  private bgmListeners = new Set<(assetId: string | null) => void>();

  /** Synchronise all controls that operate on this shared BGM channel. */
  public subscribeBgm(listener: (assetId: string | null) => void): () => void {
    this.bgmListeners.add(listener);
    listener(this.bgmId);
    return () => { this.bgmListeners.delete(listener); };
  }

  private setBgmId(assetId: string | null): void {
    if (this.bgmId === assetId) return;
    this.bgmId = assetId;
    for (const listener of this.bgmListeners) listener(assetId);
  }

  private report(error: unknown, handler?: AudioErrorHandler): void {
    const detail = error instanceof Error ? error.message : String(error);
    const message = `音频播放失败：${detail}`;
    if (handler) handler(message);
    else console.error(message);
  }

  private ensureContext(): AudioContext {
    if (typeof window === 'undefined') throw new Error('音频设备不可用');
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) throw new Error('浏览器不支持 Web Audio');
      this.ctx = new AudioCtx();
    }
    return this.ctx;
  }

  private validateAsset(asset: AudioAsset, volume: number): void {
    if (!Number.isFinite(volume) || volume < 0 || volume > 100) throw new Error('音量必须在 0–100 之间');
    if (!asset.notes.length || !asset.notes.every((note) => Number.isFinite(note) && note > 0) ||
        !Number.isFinite(asset.tempo) || asset.tempo <= 0) throw new Error('音频资源不包含有效音符');
  }

  /** Loop a built-in synthesized melody. Returns false when playback cannot start. */
  public playBgm(asset: AudioAsset, volume = 100, onError?: AudioErrorHandler): boolean {
    this.stopBgm();
    try {
      this.validateAsset(asset, volume);
      if (volume === 0) return true;
      const ctx = this.ensureContext();
      const master = ctx.createGain();
      master.gain.setValueAtTime(volume / 100, ctx.currentTime);
      master.connect(ctx.destination);
      this.bgmGain = master;
      if (ctx.state === 'suspended') {
        ctx.resume().catch((error: unknown) => {
          // An old resume rejection must not stop a newer BGM request.
          if (this.bgmGain === master) {
            this.stopBgm();
            this.report(error, onError);
          }
        });
      }
      let step = 0;
      const intervalMs = Math.max(220, Math.round((60 / asset.tempo) * 1000));
      const playNextNote = (): boolean => {
        try {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = asset.waveType || 'sine';
          osc.frequency.setValueAtTime(asset.notes[step % asset.notes.length], ctx.currentTime);
          step += 1;
          gain.gain.setValueAtTime(0.001, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.035, ctx.currentTime + 0.06);
          gain.gain.exponentialRampToValueAtTime(0.0008, ctx.currentTime + intervalMs / 1000);
          osc.connect(gain);
          gain.connect(master);
          osc.start();
          osc.stop(ctx.currentTime + intervalMs / 1000);
          return true;
        } catch (error: unknown) {
          this.stopBgm();
          this.report(error, onError);
          return false;
        }
      };
      if (!playNextNote()) return false;
      this.timer = window.setInterval(playNextNote, intervalMs);
      this.setBgmId(asset.id);
      return true;
    } catch (error: unknown) {
      this.stopBgm();
      this.report(error, onError);
      return false;
    }
  }

  /** Play all notes once, independently of the BGM track. */
  public playSfx(asset: AudioAsset, volume = 100, onError?: AudioErrorHandler): boolean {
    let master: GainNode | null = null;
    try {
      this.validateAsset(asset, volume);
      if (volume === 0) return true;
      const ctx = this.ensureContext();
      master = ctx.createGain();
      const output = master;
      output.gain.setValueAtTime(volume / 100, ctx.currentTime);
      output.connect(ctx.destination);
      this.sfxGains.add(output);
      if (ctx.state === 'suspended') {
        ctx.resume().catch((error: unknown) => {
          if (this.sfxGains.delete(output)) {
            output.disconnect();
            this.report(error, onError);
          }
        });
      }
      const noteDuration = Math.max(0.12, 60 / asset.tempo);
      let remaining = asset.notes.length;
      asset.notes.forEach((frequency, index) => {
        const start = ctx.currentTime + index * noteDuration;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = asset.waveType || 'sine';
        osc.frequency.setValueAtTime(frequency, start);
        gain.gain.setValueAtTime(0.001, start);
        gain.gain.exponentialRampToValueAtTime(0.035, start + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.0008, start + noteDuration);
        osc.connect(gain);
        gain.connect(output);
        osc.onended = () => {
          remaining -= 1;
          if (remaining === 0 && this.sfxGains.delete(output)) output.disconnect();
        };
        osc.start(start);
        osc.stop(start + noteDuration);
      });
      return true;
    } catch (error: unknown) {
      if (master && this.sfxGains.delete(master)) master.disconnect();
      this.report(error, onError);
      return false;
    }
  }

  public stopBgm(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.bgmGain) {
      this.bgmGain.disconnect();
      this.bgmGain = null;
    }
    this.setBgmId(null);
  }

  public stopSfx(): void {
    for (const gain of this.sfxGains) gain.disconnect();
    this.sfxGains.clear();
  }
}

export const soundEngine = new SoundEngine();
