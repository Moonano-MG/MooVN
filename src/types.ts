export type EditorTheme = "dark" | "light";

export type NodeType =
  | "dialogue"
  | "choice"
  | "character"
  | "background"
  | "audio"
  | "script"
  | "end";

export type EndingKind = "true" | "good" | "normal" | "bad";

export type ScriptLang = "lua" | "teal" | "python" | "typescript";
export type ScriptLanguage = ScriptLang;

export type SettingsSection = "general" | "advanced" | "load" | "save";

export interface CharacterAttribute {
  key: string;
  label: string;
  value: string | number;
}

export interface Character {
  id: string;
  name: string;
  /** 名字牌与高亮色 */
  color: string;
  /** 绑定的立绘资源 id，null 表示无立绘（主角第一人称常用） */
  spriteId: string | null;
  description: string;
  /** 初始好感度 */
  initialAffection: number;
  /** 当前好感度 */
  affection: number;
  /** 可自由扩展的角色属性 */
  attributes: CharacterAttribute[];
}

export interface StageCharacterPlacement {
  characterId: string;
  /** 舞台水平位置百分比 (0 ~ 100) */
  x: number;
  /** 舞台底部对齐偏移百分比 (0 ~ 100, 默认 50) */
  y: number;
  /** 缩放倍率 (0.5 ~ 1.5) */
  scale: number;
  /** 透明度 (0.1 ~ 1.0) */
  opacity: number;
  flipX?: boolean;
}

export interface DialogueLine {
  id: string;
  /** null 表示旁白 */
  characterId: string | null;
  text: string;
}

export interface ChoiceOption {
  id: string;
  text: string;
  targetNodeId: string | null;
  /** 选择后变更的角色好感度 */
  affectionCharacterId?: string | null;
  affectionDelta?: number;
  /** 选项解锁所需最低好感度 */
  requiredAffection?: number;
}

export interface VisualBlock {
  id: string;
  action: "say" | "bg" | "char" | "bgm" | "affection";
  param1: string;
  param2: string;
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
  /** 进入该场景时切换的背景资源 id */
  backgroundId: string | null;
  /** 背景音乐与音效 */
  bgmId?: string | null;
  sfxId?: string | null;
  /** 场景舞台上的角色摆放配置 */
  stageCharacters: StageCharacterPlacement[];
  /** 台词序列 */
  lines: DialogueLine[];
  /** 分支选项 */
  choices: ChoiceOption[];
  /** 播放完毕后的去向 */
  nextNodeId: string | null;
  /** 结局配置 */
  endingKind?: EndingKind;
  endingDescription?: string;
  /** 剧情线标签 */
  storyline?: string;
  /** 节点脚本与可视化代码块 */
  scriptLang?: ScriptLang;
  scriptCode?: string;
  visualBlocks?: VisualBlock[];
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
  updatedAt: string;
}

/** 画布连线引用：from 节点 + 输出端口（-1 = 主输出，>=0 = 第 n 个选项） */
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
  index: number; // 0..5 (每个选项卡 6 个档案)
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

export const ENDING_LABELS: Record<EndingKind, string> = {
  true: "True End",
  good: "Good End",
  normal: "Normal End",
  bad: "Bad End",
};

export const NODE_TYPE_LABELS: Record<NodeType, string> = {
  dialogue: "对话场景",
  choice: "分支选择",
  character: "角色节点",
  background: "背景节点",
  audio: "音效节点",
  script: "脚本节点",
  end: "结局节点",
};
