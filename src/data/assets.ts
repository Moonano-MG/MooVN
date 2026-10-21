import type { MediaKind } from "../types";

export interface BackgroundAsset {
  id: string;
  name: string;
  mood: string;
  url: string;
  mediaKind: MediaKind;
  /** 多图片序列帧动画的帧图片列表 */
  frames?: string[];
  fps?: number;
  /** 动态渲染效果标识（用于视频/动态场景流） */
  animatedEffect?: "sakura" | "sunset" | "shrine_fireflies" | "cafe_rain";
}

export interface SpriteAsset {
  id: string;
  name: string;
  role: string;
  url: string;
  mediaKind: MediaKind;
  /** 多图片动画序列帧（例如呼吸/眨眼关键帧） */
  frames?: string[];
  fps?: number;
}

export interface AudioAsset {
  id: string;
  name: string;
  kind: "bgm" | "sfx";
  tempo: string;
}

export const BACKGROUNDS: BackgroundAsset[] = [
  {
    id: "bg-classroom",
    name: "午后教室",
    mood: "日常 · 晴朗",
    url: "/images/bg-classroom.jpg",
    mediaKind: "static",
    frames: ["/images/bg-classroom.jpg", "/images/bg-rooftop.jpg"],
    fps: 2,
    animatedEffect: "sakura",
  },
  {
    id: "bg-rooftop",
    name: "学园天台 · 晚霞",
    mood: "黄昏 · 告白",
    url: "/images/bg-rooftop.jpg",
    mediaKind: "tween",
    frames: ["/images/bg-rooftop.jpg", "/images/bg-shrine.jpg"],
    fps: 2,
    animatedEffect: "sunset",
  },
  {
    id: "bg-shrine",
    name: "山间神社 · 樱落",
    mood: "静谧 · 约定",
    url: "/images/bg-shrine.jpg",
    mediaKind: "frame_sequence",
    frames: ["/images/bg-shrine.jpg", "/images/bg-rooftop.jpg", "/images/bg-classroom.jpg"],
    fps: 1,
    animatedEffect: "shrine_fireflies",
  },
  {
    id: "bg-cafe",
    name: "街角咖啡馆 · 夜雨",
    mood: "温暖 · 夜雨",
    url: "/images/bg-cafe.jpg",
    mediaKind: "video",
    frames: ["/images/bg-cafe.jpg"],
    fps: 24,
    animatedEffect: "cafe_rain",
  },
];

export const SPRITES: SpriteAsset[] = [
  {
    id: "sp-yuki",
    name: "苏雨晴（校服透明立绘）",
    role: "女主角 · 文学社社长",
    url: "/images/char-yuki.png",
    mediaKind: "tween",
    frames: ["/images/char-yuki.png"],
    fps: 6,
  },
  {
    id: "sp-chen",
    name: "陈默（校服透明立绘）",
    role: "挚友 · 摄影部",
    url: "/images/char-chen.png",
    mediaKind: "static",
    frames: ["/images/char-chen.png"],
    fps: 6,
  },
  {
    id: "sp-shiratori",
    name: "白鸟凛（洋装透明立绘）",
    role: "神秘学姐 · 图书委员",
    url: "/images/char-shiratori.png",
    mediaKind: "frame_sequence",
    frames: ["/images/char-shiratori.png", "/images/char-yuki.png"],
    fps: 2,
  },
];

export const AUDIO_TRACKS: AudioAsset[] = [
  { id: "bgm-spring", name: "樱风序曲 (Piano)", kind: "bgm", tempo: "Andante" },
  { id: "bgm-sunset", name: "天台余晖 (Strings)", kind: "bgm", tempo: "Adagio" },
  { id: "bgm-shrine", name: "千年风铃 (Ambient)", kind: "bgm", tempo: "Lento" },
  { id: "bgm-rain", name: "雨夜咖啡 (Lo-Fi)", kind: "bgm", tempo: "Moderato" },
  { id: "sfx-bell", name: "下课钟声", kind: "sfx", tempo: "One-shot" },
  { id: "sfx-wind", name: "微风吹拂", kind: "sfx", tempo: "One-shot" },
];

export const CHARACTER_COLORS = [
  "#f472b6",
  "#38bdf8",
  "#c084fc",
  "#34d399",
  "#fbbf24",
  "#fb7185",
  "#60a5fa",
  "#a3e635",
];

export function backgroundById(id: string | null | undefined): BackgroundAsset | undefined {
  if (!id) return undefined;
  return BACKGROUNDS.find((b) => b.id === id);
}

export function spriteById(id: string | null | undefined): SpriteAsset | undefined {
  if (!id) return undefined;
  return SPRITES.find((s) => s.id === id);
}

export function audioById(id: string | null | undefined): AudioAsset | undefined {
  if (!id) return undefined;
  return AUDIO_TRACKS.find((a) => a.id === id);
}
