/**
 * MooVN 占位音频合成脚本
 * 生成蓝色模板所需的 BGM / SFX WAV（无外部依赖，纯 PCM 合成）。
 * 运行：node scripts/gen-audio.mjs
 * 输出：public/assets/audio/*.wav
 */
import fs from 'fs';
import path from 'path';

const SR = 16000; // 16kHz mono 足够用于占位环境音
const OUT = path.resolve(process.cwd(), 'public/assets/audio');
fs.mkdirSync(OUT, { recursive: true });

/** 写 16bit 单声道 WAV */
function writeWav(file, samples) {
  const n = samples.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(s * 32767), 44 + i * 2);
  }
  fs.writeFileSync(path.join(OUT, file), buf);
  console.log('wrote', file, `${(buf.length / 1024).toFixed(0)}KB`);
}

const sec = (s) => Math.floor(SR * s);

/* ---------------- BGM：雨夜氛围（10s 无缝循环） ---------------- */
function bgmRain() {
  const n = sec(10);
  const out = new Float32Array(n);
  let lp = 0;
  // 简易和弦垫
  const chords = [
    [220 / 2, 261.63 / 2, 329.63 / 2], // Am
    [196 / 2, 246.94 / 2, 293.66 / 2]  // Gm-ish
  ];
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    // 雨声：低通白噪声 + 慢速幅度起伏
    const white = Math.random() * 2 - 1;
    lp = lp + 0.06 * (white - lp);
    const rain = lp * 0.34 * (0.8 + 0.2 * Math.sin(t * 0.9));
    // 和弦垫（交叉渐变，保证首尾同值 → 循环无缝）
    const cyc = (t % 10) / 10 * 2; // 0..2
    const ci = cyc < 1 ? 0 : 1;
    const blend = Math.min(1, Math.max(0, (cyc - 0.85) * 4)) * (ci === 0 ? 1 : -1) + (ci === 0 ? 0 : 1);
    const chord = chords[ci === 0 ? 0 : 1];
    let pad = 0;
    for (const f of chord) {
      pad += Math.sin(2 * Math.PI * f * t + Math.sin(t * 0.5) * 0.4);
    }
    pad = (pad / 3) * 0.1;
    // 保证循环：首尾淡入淡出到中值
    const fade = Math.min(1, i / (SR * 0.8), (n - i) / (SR * 0.8));
    out[i] = (rain * 0.7 + pad) * fade * 0.9;
  }
  return out;
}

/* ---------------- BGM：主题旋律（12s） ---------------- */
function bgmTheme() {
  const n = sec(12);
  const out = new Float32Array(n);
  // 简单五声音阶琶音
  const scale = [523.25, 587.33, 659.25, 783.99, 880, 659.25, 587.33, 493.88];
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const step = Math.floor(t / 1.5) % scale.length;
    const f = scale[step] / 2;
    const local = t % 1.5;
    const env = Math.exp(-local * 1.4) * (local < 0.03 ? local / 0.03 : 1);
    const tone = Math.sin(2 * Math.PI * f * t) * 0.12 + Math.sin(2 * Math.PI * f * 2 * t) * 0.03;
    // 低音铺底
    const bass = Math.sin(2 * Math.PI * (f / 4) * t) * 0.07;
    const fade = Math.min(1, i / (SR * 0.6), (n - i) / (SR * 0.6));
    out[i] = (tone * env + bass) * fade;
  }
  return out;
}

/* ---------------- SFX：确认 / 保存 / 点击 ---------------- */
function sfxConfirm() {
  const n = sec(0.5);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const f = t < 0.12 ? 660 : 880;
    const env = Math.exp(-t * 7);
    out[i] = Math.sin(2 * Math.PI * f * t) * env * 0.5;
  }
  return out;
}

function sfxSave() {
  const n = sec(0.9);
  const out = new Float32Array(n);
  const notes = [523.25, 659.25, 783.99];
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const idx = Math.min(2, Math.floor(t / 0.22));
    const local = t - idx * 0.22;
    const env = Math.exp(-local * 6) * (t < 0.66 ? 1 : Math.exp(-(t - 0.66) * 8));
    out[i] = Math.sin(2 * Math.PI * notes[idx] * t) * env * 0.45;
  }
  return out;
}

function sfxClick() {
  const n = sec(0.12);
  const out = new Float32Array(n);
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const white = Math.random() * 2 - 1;
    lp = lp + 0.5 * (white - lp);
    out[i] = lp * Math.exp(-t * 60) * 0.6;
  }
  return out;
}

writeWav('bgm-rain.wav', bgmRain());
writeWav('bgm-theme.wav', bgmTheme());
writeWav('sfx-confirm.wav', sfxConfirm());
writeWav('sfx-save.wav', sfxSave());
writeWav('sfx-click.wav', sfxClick());
console.log('audio done');
