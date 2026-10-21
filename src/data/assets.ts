export interface BackgroundAsset {
  id: string;
  name: string;
  url: string;
  mood: string;
}

export interface SpriteAsset {
  id: string;
  name: string;
  url: string;
}

export interface AudioAsset {
  id: string;
  name: string;
  kind: "bgm" | "sfx";
}

export const BACKGROUNDS: BackgroundAsset[] = [
  { id: "bg-classroom", name: "教室 · 黄昏", url: "/images/bg-classroom.jpg", mood: "温暖 / 放学后" },
  { id: "bg-rooftop", name: "天台 · 暮色", url: "/images/bg-rooftop.jpg", mood: "告白 / 晚风" },
  { id: "bg-shrine", name: "神社 · 樱参道", url: "/images/bg-shrine.jpg", mood: "春日 / 约定" },
  { id: "bg-cafe", name: "咖啡馆 · 雨夜", url: "/images/bg-cafe.jpg", mood: "静谧 / 夜话" },
];

export const SPRITES: SpriteAsset[] = [
  { id: "sp-yuki", name: "雪乃 · 校服", url: "/images/char-yuki.png" },
  { id: "sp-chen", name: "陈默 · 校服", url: "/images/char-chen.png" },
  { id: "sp-shiratori", name: "白鸟 · 礼服", url: "/images/char-shiratori.png" },
];

export const AUDIO_TRACKS: AudioAsset[] = [
  { id: "bgm-sunset", name: "放学后的风琴 (BGM)", kind: "bgm" },
  { id: "bgm-rooftop", name: "暮色与晚风 (BGM)", kind: "bgm" },
  { id: "bgm-shrine", name: "樱参道之约 (BGM)", kind: "bgm" },
  { id: "bgm-rain", name: "雨夜咖啡馆 (BGM)", kind: "bgm" },
  { id: "sfx-bell", name: "下课钟声 (SFX)", kind: "sfx" },
  { id: "sfx-door", name: "推门声 (SFX)", kind: "sfx" },
  { id: "sfx-wind", name: "微风吹拂 (SFX)", kind: "sfx" },
];

export function backgroundById(id: string | null | undefined): BackgroundAsset | null {
  if (!id) return null;
  return BACKGROUNDS.find((b) => b.id === id) ?? null;
}

export function spriteById(id: string | null | undefined): SpriteAsset | null {
  if (!id) return null;
  return SPRITES.find((s) => s.id === id) ?? null;
}

export function audioById(id: string | null | undefined): AudioAsset | null {
  if (!id) return null;
  return AUDIO_TRACKS.find((a) => a.id === id) ?? null;
}

export const CHARACTER_COLORS = [
  "#38bdf8",
  "#60a5fa",
  "#fb7185",
  "#f43f5e",
  "#f59e0b",
  "#34d399",
  "#2dd4bf",
  "#a78bfa",
  "#f472b6",
  "#e4e4e7",
];
