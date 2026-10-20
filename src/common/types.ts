/**
 * MooVN 核心数据模型
 * 所有场景以 YAML 为准，此文件定义 YAML 映射的 TypeScript 类型。
 */

export type ScriptLang = 'lua' | 'teal' | 'javascript' | 'typescript' | 'python';

/** 角色在舞台上的水平位置：预设三档，或 0~1 的小数（屏幕宽度比例） */
export type StageX = 'left' | 'center' | 'right' | number;

export interface SceneCharacterState {
  /** 引用 project.characters[].id */
  ref: string;
  position: StageX;
  /** 垂直偏移比例（0=贴底，负值上移），默认 0 */
  y?: number;
  /** 表情标签（自由文本，用于立绘差分命名，如 smile / angry） */
  expression?: string;
  /** 是否可见，默认 true */
  visible?: boolean;
  /** 是否压暗（非说话角色） */
  dim?: boolean;
  scale?: number;
}

export interface ChoiceOption {
  text: string;
  /** 跳转到场景内的节点 id */
  next?: string | null;
  /** 或直接跳转场景 id（优先级低于 next） */
  scene?: string;
  /** 选中后的数值效果，如 { "yuki.affection": 1 } */
  effects?: Record<string, number>;
  /** 选项显示条件（与分支相同语法），为空则始终显示 */
  condition?: string;
}

export type FlowNodeType =
  | 'start'
  | 'dialogue'
  | 'narration'
  | 'choice'
  | 'branch'
  | 'setvar'
  | 'background'
  | 'bgm'
  | 'sfx'
  | 'character'
  | 'jump'
  | 'ending'
  | 'script'
  | 'wait';

export type VarOp = 'set' | 'add' | 'sub';

export interface FlowNode {
  id: string;
  type: FlowNodeType;
  /** 编辑器画布坐标 */
  x?: number;
  y?: number;

  /* dialogue / narration */
  character?: string;
  text?: string;

  /* choice */
  options?: ChoiceOption[];

  /* branch */
  condition?: string;
  /** 条件成立时的目标（节点 id 或场景 id，前缀 "scene:" 表示场景） */
  true?: string;
  /** 条件不成立时的目标 */
  false?: string;

  /* setvar */
  target?: string;
  op?: VarOp;
  value?: string | number;

  /* background / bgm / sfx */
  asset?: string;
  /** 媒体切换过渡时间 ms */
  fade?: number;
  loop?: boolean;

  /* character 指令节点 */
  action?: 'show' | 'hide' | 'move';
  ref?: string;
  position?: StageX;

  /* jump / ending */
  scene?: string;
  endingId?: string;
  endingTitle?: string;
  endingKind?: 'good' | 'normal' | 'bad' | 'true';

  /* script */
  lang?: ScriptLang;
  code?: string;

  /* wait */
  ms?: number;

  /** 线性后继；choice/branch/ending/start 可为 null */
  next?: string | null;
}

export interface Scene {
  format: 'moovn-scene';
  version: 1;
  id: string;
  /** 所属章节 id */
  chapter: string;
  title: string;
  background?: string;
  bgm?: string;
  /** 场景初始时的角色站位/属性（可视化编辑器直接编辑这里） */
  characters: SceneCharacterState[];
  flow: FlowNode[];
  /** flow 自然走完后的默认下一场景 */
  next?: string | null;
}

export interface Chapter {
  id: string;
  title: string;
  /** 有序场景 id 列表 */
  scenes: string[];
}

export interface CharacterAttributeDef {
  key: string;
  label: string;
  type: 'number' | 'string' | 'boolean';
  default?: number | string | boolean;
}

export interface CharacterDef {
  id: string;
  name: string;
  /** 名牌/对话框主题色 */
  color: string;
  sprite?: string;
  /** 角色属性（好感度 affection 固定存在） */
  attributes: CharacterAttributeDef[];
}

export interface ProjectScript {
  id: string;
  name: string;
  lang: ScriptLang;
  code: string;
}

export interface Project {
  format: 'moovn-project';
  version: 1;
  id: string;
  title: string;
  author?: string;
  /** 使用的模板：'blue' | ''（无模板时编辑器等价于纯可视化编辑器） */
  template?: string;
  /** 资源根目录（相对路径） */
  assetsRoot?: string;
  /** 开场场景 */
  startScene: string;
  characters: CharacterDef[];
  chapters: Chapter[];
  /** 全部场景，按 id 索引（每个场景可独立导出为 YAML 文件） */
  scenes: Record<string, Scene>;
  scripts: ProjectScript[];
  settings?: {
    /** 文字速度：毫秒/字符 */
    textSpeed?: number;
    /** 自动模式换行后停留毫秒基数 */
    autoSpeed?: number;
    bgmVolume?: number;
    sfxVolume?: number;
  };
}

/** 由场景 YAML 字符串解析（详见 common/yaml.ts） */
export const NODE_TYPE_LABELS: Record<FlowNodeType, string> = {
  start: '开始',
  dialogue: '对话',
  narration: '旁白',
  choice: '选项',
  branch: '条件分支',
  setvar: '设置变量',
  background: '背景',
  bgm: '背景音乐',
  sfx: '音效',
  character: '角色',
  jump: '跳转场景',
  ending: '结局',
  script: '脚本',
  wait: '等待'
};

export const NODE_TYPE_COLORS: Record<FlowNodeType, string> = {
  start: '#22c55e',
  dialogue: '#3b82f6',
  narration: '#64748b',
  choice: '#f59e0b',
  branch: '#a855f7',
  setvar: '#14b8a6',
  background: '#0ea5e9',
  bgm: '#ec4899',
  sfx: '#f97316',
  character: '#6366f1',
  jump: '#eab308',
  ending: '#ef4444',
  script: '#8b5cf6',
  wait: '#78716c'
};
