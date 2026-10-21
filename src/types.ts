export type EditorTheme = "dark" | "light";

export type NodeType =
  | "dialogue"
  | "choice"
  | "fade"
  | "screen_text"
  | "character"
  | "background"
  | "audio"
  | "script"
  | "end";

export type EndingKind = "true" | "good" | "normal" | "bad";

/** 主支持语言为 TypeScript/JavaScript；其他语言通过 TS/JS Bridge 桥接执行 */
export type ScriptLang = "typescript" | "javascript" | "lua" | "teal" | "python";
export type ScriptLanguage = ScriptLang;

export type SettingsSection = "general" | "advanced" | "load" | "save";

/** 媒体资源与动画类型：纯静态图、多图片序列帧动画、视频、补间动画 */
export type MediaKind = "static" | "frame_sequence" | "video" | "tween";

export type TweenPreset = "none" | "breathe" | "bounce" | "shake" | "float" | "slide_in";

export interface CharacterAttribute {
  key: string;
  label: string;
  value: string | number;
}

export interface Character {
  id: string;
  name: string;
  color: string;
  spriteId: string | null;
  description: string;
  initialAffection: number;
  affection: number;
  attributes: CharacterAttribute[];
}

export interface StageCharacterPlacement {
  characterId: string;
  /** 舞台水平位置百分比 (0 ~ 100) */
  x: number;
  /** 舞台垂直位置百分比 (0 ~ 100) */
  y: number;
  /** 缩放倍率 (0.5 ~ 1.6) */
  scale: number;
  /** 透明度 (0 ~ 1.0) */
  opacity: number;
  flipX?: boolean;
  /** 角色动画模式（静态、多图序列帧呼吸眨眼、补间动画） */
  mediaKind?: MediaKind;
  tween?: TweenPreset;
  fps?: number;
}

/** 淡入 / 淡出效果配置（可作用于角色、背景场景或整屏） */
export interface FadeConfig {
  target: "character" | "background" | "screen";
  characterId?: string | null;
  direction: "in" | "out";
  durationMs: number;
  targetOpacity: number;
  color?: string;
}

/** 屏幕自由文字（可自定义大小、颜色、坐标位置、淡入时长） */
export interface ScreenTextItem {
  id: string;
  text: string;
  x: number; // 0..100 %
  y: number; // 0..100 %
  fontSize: number; // px
  color: string;
  fontWeight?: "normal" | "bold";
  align?: "left" | "center" | "right";
  fadeDurationMs?: number;
}

export interface DialogueLine {
  id: string;
  characterId: string | null;
  text: string;
}

export interface ChoiceOption {
  id: string;
  text: string;
  targetNodeId: string | null;
  affectionCharacterId?: string | null;
  affectionDelta?: number;
  requiredAffection?: number;
}

/** Dify + Scratch 节点内积木块（底层统一生成 TypeScript/JavaScript） */
export type ScratchBlockKind =
  | "say"
  | "bg"
  | "char"
  | "fade"
  | "screen_text"
  | "animate"
  | "affection"
  | "ts_code"
  | "bridge_call";

export interface ScratchBlock {
  id: string;
  kind: ScratchBlockKind;
  /**
   * 积木参数（例如 speaker, text, target, direction, durationMs, fontSize, color, x, y,
   * mediaKind, tween, fps, bridgeLang, code 等）
   */
  params: Record<string, any>;
}

export interface Chapter {
  id: string;
  title: string;
  order: number;
}

export interface StoryNode {
  id: string;
  chapterId: string;
  type: NodeType;
  title: string;
  x: number;
  y: number;
  backgroundId: string | null;
  /** 背景媒体模式：静态图 / 多图片序列帧 / 视频 / 动态粒子 */
  backgroundMediaKind?: MediaKind;
  backgroundFps?: number;
  bgmId?: string | null;
  sfxId?: string | null;
  stageCharacters: StageCharacterPlacement[];
  /** 节点淡入淡出配置 */
  fadeConfig?: FadeConfig | null;
  /** 屏幕自定义文字叠加层 */
  screenTexts?: ScreenTextItem[];
  /** 节点内嵌的 Scratch 可拖拽积木列表（底层直接转为 TypeScript） */
  blocks?: ScratchBlock[];
  lines: DialogueLine[];
  choices: ChoiceOption[];
  nextNodeId: string | null;
  endingKind?: EndingKind;
  endingDescription?: string;
  storyline?: string;
  scriptLang?: ScriptLang;
  scriptCode?: string;
}

export interface Project {
  id: string;
  name: string;
  author: string;
  version: string;
  startNodeId: string;
  chapters: Chapter[];
  characters: Character[];
  nodes: StoryNode[];
  aiSpecContent?: string;
  updatedAt: string;
}

export interface EdgeRef {
  fromNodeId: string;
  port: number;
}

export interface ValidationIssue {
  id: string;
  nodeId: string | null;
  level: "error" | "warning";
  message: string;
}

export type SaveFolderTab =
  | "Auto"
  | "快速"
  | "1"
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "0";

export const SAVE_FOLDER_TABS: SaveFolderTab[] = [
  "Auto",
  "快速",
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "0",
];

export interface SaveSlotData {
  slotKey: string;
  folder: SaveFolderTab;
  index: number;
  nodeId: string;
  lineIndex: number;
  chapterTitle: string;
  sceneTitle: string;
  previewText: string;
  thumbnailUrl: string;
  savedAt: string;
  affectionMap?: Record<string, number>;
  playedNodeIds?: string[];
}

/** 4 种常见 AI API 格式 */
export type AiApiFormat = "openai" | "anthropic" | "gemini" | "ollama";

export interface AiProviderConfig {
  mode: "local" | "api";
  localModelId: string;
  localModelDownloaded: boolean;
  apiFormat: AiApiFormat;
  endpoint: string;
  apiKey: string;
  modelName: string;
}

/** VS Code 风格可拖拽停靠面板 */
export type WorkspacePanelId = "workflow" | "stage" | "code" | "inspector" | "ai";
export type DockSlot = "center" | "right" | "bottom" | "floating";

export interface FloatingPanelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const ENDING_LABELS: Record<EndingKind, string> = {
  true: "True End",
  good: "Good End",
  normal: "Normal End",
  bad: "Bad End",
};

export const NODE_TYPE_LABELS: Record<NodeType, string> = {
  dialogue: "对话场景",
  choice: "分支选择",
  fade: "淡入淡出",
  screen_text: "屏幕文字",
  character: "角色动作",
  background: "场景切换",
  audio: "音乐音效",
  script: "TS脚本桥接",
  end: "结局节点",
};

export const SCRATCH_BLOCK_META: Record<
  ScratchBlockKind,
  { label: string; color: string; badge: string }
> = {
  say: { label: "台词对白", color: "border-sky-500/40 bg-sky-500/15 text-sky-200", badge: "moovn.say" },
  bg: { label: "背景/媒体切换", color: "border-emerald-500/40 bg-emerald-500/15 text-emerald-200", badge: "moovn.bg" },
  char: { label: "角色位移/动画", color: "border-violet-500/40 bg-violet-500/15 text-violet-200", badge: "moovn.char" },
  fade: { label: "淡入/淡出控制", color: "border-cyan-500/40 bg-cyan-500/15 text-cyan-200", badge: "moovn.fade" },
  screen_text: { label: "屏幕自由文字", color: "border-amber-500/40 bg-amber-500/15 text-amber-200", badge: "moovn.screenText" },
  animate: { label: "多帧/视频/补间动画", color: "border-pink-500/40 bg-pink-500/15 text-pink-200", badge: "moovn.animate" },
  affection: { label: "好感度变更", color: "border-rose-500/40 bg-rose-500/15 text-rose-200", badge: "moovn.addAffection" },
  ts_code: { label: "TypeScript 原生代码", color: "border-blue-500/40 bg-blue-500/15 text-blue-200", badge: "TS/JS" },
  bridge_call: { label: "跨语言桥接 (Lua/Py/Teal)", color: "border-indigo-500/40 bg-indigo-500/15 text-indigo-200", badge: "moovn.bridge" },
};
