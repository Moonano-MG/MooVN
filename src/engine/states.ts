import { storage, KEYS } from '../common/storage';

/** 运行时角色舞台状态 */
export interface RuntimeCharacter {
  ref: string;
  position: number; // 归一化 x（0~1）
  y: number; // 垂直偏移
  expression: string;
  visible: boolean;
  dim: boolean;
  scale: number;
}

/** 引擎运行时状态（可序列化，存档即它的快照） */
export interface GameState {
  sceneId: string;
  nodeIndex: number;
  /** 扁平变量表：如 yuki.affection=2, flag.metYuki=true */
  vars: Record<string, unknown>;
  /** 已读场景集合（快进依据：只允许跳过已玩过的场景） */
  seenScenes: string[];
  /** 后退用历史栈（场景级） */
  history: Array<{ sceneId: string; nodeIndex: number }>;
  /** 舞台视觉状态 */
  background: string;
  bgm: string;
  characters: RuntimeCharacter[];
  /** 游戏累计时长（毫秒） */
  playTime: number;
  /** 通关结局记录 */
  endings: Array<{ id: string; title: string; kind: string; time: number }>;
}

export function newGameState(startScene: string): GameState {
  return {
    sceneId: startScene,
    nodeIndex: 0,
    vars: {},
    seenScenes: [],
    history: [],
    background: '',
    bgm: '',
    characters: [],
    playTime: 0,
    endings: []
  };
}

/* ------------------------------------------------------------------ */
/* 存档：Auto / 快速 / 1..0 共 12 个选项卡，每卡 6 档                   */
/* ------------------------------------------------------------------ */

export type TabId = 'auto' | 'quick' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10';

export const TAB_IDS: TabId[] = ['auto', 'quick', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
export const TAB_LABELS: Record<TabId, string> = {
  auto: 'Auto',
  quick: '快速',
  '1': '1', '2': '2', '3': '3', '4': '4', '5': '5',
  '6': '6', '7': '7', '8': '8', '9': '9', '10': '10'
};
export const SLOTS_PER_TAB = 6;
/** Auto 选项卡：系统自动轮换写入的槽位数 */
export const AUTO_ROTATE_SLOTS = 6;

export interface SaveSlot {
  empty: false;
  sceneId: string;
  sceneTitle: string;
  chapterTitle: string;
  nodeIndex: number;
  /** 场景画面缩略图（dataURL，若为动画则为开头帧） */
  thumbnail: string;
  /** 保存时间（epoch ms） */
  saveTime: number;
  playTime: number;
  state: GameState;
}

export type Slot = SaveSlot | null; // null = 空档案

export interface SaveData {
  version: 1;
  tabs: Record<TabId, Slot[]>;
}

export function newSaveData(): SaveData {
  const tabs = {} as Record<TabId, Slot[]>;
  for (const id of TAB_IDS) tabs[id] = new Array(SLOTS_PER_TAB).fill(null);
  return { version: 1, tabs };
}

/** 读档/存档档案互通：同一份 SaveData */
export async function loadSaveData(): Promise<SaveData> {
  const data = await storage.get<SaveData>(KEYS.saveData);
  if (!data || !data.tabs) return newSaveData();
  const base = newSaveData();
  for (const id of TAB_IDS) {
    if (Array.isArray(data.tabs[id])) {
      base.tabs[id] = data.tabs[id].slice(0, SLOTS_PER_TAB);
      while (base.tabs[id].length < SLOTS_PER_TAB) base.tabs[id].push(null);
    }
  }
  return base;
}

export async function persistSaveData(data: SaveData): Promise<void> {
  await storage.set(KEYS.saveData, data);
}

/** 写入一个存档槽 */
export async function writeSlot(
  tab: TabId,
  index: number,
  slot: SaveSlot
): Promise<SaveData> {
  const data = await loadSaveData();
  data.tabs[tab][index] = slot;
  await persistSaveData(data);
  return data;
}

/** Auto 选项卡轮换写入 */
export async function writeAutoSlot(slot: SaveSlot): Promise<SaveData> {
  const data = await loadSaveData();
  const tabs = data.tabs.auto;
  // 找最早的空位，否则覆盖最旧
  let idx = tabs.findIndex((s) => s === null);
  if (idx < 0) {
    idx = 0;
    let oldest = Infinity;
    tabs.forEach((s, i) => {
      if (s && s.saveTime < oldest) {
        oldest = s.saveTime;
        idx = i;
      }
    });
  }
  data.tabs.auto[idx] = slot;
  await persistSaveData(data);
  return data;
}

/** 全局进度（独立于存档，用于"快进只跳过已读"） */
export interface Progress {
  seenScenes: string[];
  endings: Array<{ id: string; title: string; kind: string; time: number }>;
}

export async function loadProgress(): Promise<Progress> {
  return (await storage.get<Progress>(KEYS.progress)) ?? { seenScenes: [], endings: [] };
}
export async function persistProgress(p: Progress): Promise<void> {
  await storage.set(KEYS.progress, p);
}

/** 游戏设置 */
export interface GameSettings {
  /** 毫秒/字符，越小越快 */
  textSpeed: number;
  /** 自动模式每句停留基数 ms */
  autoSpeed: number;
  bgmVolume: number;
  sfxVolume: number;
  /** 快进是否只限已读场景（规范要求始终为 true，此开关供高级设置展示） */
  skipOnlyRead: boolean;
}

export const DEFAULT_SETTINGS: GameSettings = {
  textSpeed: 28,
  autoSpeed: 900,
  bgmVolume: 0.6,
  sfxVolume: 0.8,
  skipOnlyRead: true
};

export async function loadSettings(): Promise<GameSettings> {
  return { ...DEFAULT_SETTINGS, ...((await storage.get<GameSettings>(KEYS.settings)) ?? {}) };
}
export async function persistSettings(s: GameSettings): Promise<void> {
  await storage.set(KEYS.settings, s);
}

export function formatPlayTime(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}

export function formatSaveTime(epoch: number): string {
  const d = new Date(epoch);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
