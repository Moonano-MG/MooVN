export type EditorTheme = 'dark' | 'light';

export type ProjectTemplateMode = 'blue_template' | 'godot_blank';

export type SupportedScriptLang = 'lua' | 'teal' | 'python' | 'typescript';

export type CharacterExpression = 'normal' | 'smile' | 'shy' | 'surprised' | 'sad' | 'serious';

export interface CustomAttribute {
  key: string;
  label: string;
  type: 'number' | 'string' | 'boolean';
  value: number | string | boolean;
}

export interface CharacterDef {
  id: string;
  name: string;
  roleTitle: string;
  themeColor: string;
  hairColor: string;
  eyeColor: string;
  outfitColor: string;
  bio: string;
  initialAffection: number;
  affection: number;
  maxAffection: number;
  expressions: CharacterExpression[];
  customAttributes: CustomAttribute[];
}

export interface StageCharacterPlacement {
  characterId: string;
  expression: CharacterExpression;
  /** X position normalized 0..100 (percentage of stage width) */
  x: number;
  /** Y position normalized 0..100 (percentage of stage height) */
  y: number;
  scale: number;
  alpha: number;
  flipX: boolean;
  zIndex: number;
  animation: 'none' | 'fade_in' | 'slide_left' | 'slide_right' | 'bounce' | 'breathe' | 'shake';
  speakingHighlight?: boolean;
}

export interface SceneChoice {
  id: string;
  text: string;
  targetSceneId: string;
  affectionChanges?: { characterId: string; delta: number }[];
  attributeChanges?: { characterId: string; key: string; deltaOrValue: number | string | boolean }[];
  condition?: {
    characterId: string;
    metric: 'affection' | string;
    operator: '>=' | '<=' | '==' | '>';
    value: number;
  };
}

export type BackgroundPresetId =
  | 'rainy_station'
  | 'deep_sea_observatory'
  | 'starlight_deck'
  | 'blue_classroom'
  | 'cyber_archive'
  | 'dawn_harbor';

export type WeatherEffectType = 'none' | 'rain' | 'snow' | 'bubbles' | 'starlight' | 'fireflies';

export interface SceneAudioConfig {
  bgmId: 'none' | 'blue_nocturne' | 'rain_echo' | 'starlight_waltz' | 'tension_pulse' | 'dawn_promise';
  bgmVolume: number;
  sfxId: 'none' | 'rain_ambience' | 'train_bell' | 'heartbeat' | 'page_turn' | 'chime' | 'wave_crash';
}

export interface SceneDialogue {
  speakerId: string | null; // null = Narrator
  speakerName: string;
  text: string;
  affectionDelta?: { characterId: string; delta: number };
}

export interface SceneDef {
  id: string;
  chapterId: string;
  /** 1-based global scene number across the game (Scene 1 .. Scene 12+) */
  globalNumber: number;
  title: string;
  storylineId: string;
  background: {
    presetId: BackgroundPresetId;
    customUrl?: string;
    weather: WeatherEffectType;
    tint: string;
    blur: number;
    isAnimated: boolean;
  };
  audio: SceneAudioConfig;
  characters: StageCharacterPlacement[];
  dialogue: SceneDialogue;
  choices: SceneChoice[];
  nextSceneId: string | null;
  endingId?: string;
  scriptBinding?: {
    language: SupportedScriptLang;
    code: string;
  };
}

export interface ChapterDef {
  id: string;
  number: number;
  title: string;
  subtitle: string;
  storylineId: string;
  description: string;
}

export interface StorylineDef {
  id: string;
  name: string;
  color: string;
  description: string;
  unlockCondition: string;
}

export interface EndingDef {
  id: string;
  code: string;
  title: string;
  type: 'TRUE' | 'GOOD' | 'NORMAL' | 'BAD';
  storylineId: string;
  conditionText: string;
  description: string;
  bgPreset: BackgroundPresetId;
}

export type WorkflowNodeType =
  | 'start'
  | 'background'
  | 'character'
  | 'audio'
  | 'dialogue'
  | 'choice'
  | 'condition'
  | 'script'
  | 'ending';

export interface WorkflowNode {
  id: string;
  type: WorkflowNodeType;
  title: string;
  subtitle: string;
  x: number;
  y: number;
  sceneId?: string;
  config: Record<string, any>;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

export interface VisualCodeBlock {
  id: string;
  category: 'scene' | 'character' | 'dialogue' | 'audio' | 'logic' | 'variable';
  command: string;
  params: Record<string, string | number>;
}

export interface ScriptFile {
  id: string;
  name: string;
  path: string;
  language: SupportedScriptLang;
  content: string;
  visualBlocks: VisualCodeBlock[];
}

export type SaveFolderTab =
  | 'Auto'
  | '快速'
  | '1'
  | '2'
  | '3'
  | '4'
  | '5'
  | '6'
  | '7'
  | '8'
  | '9'
  | '0';

export const SAVE_FOLDER_TABS: SaveFolderTab[] = [
  'Auto',
  '快速',
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '0',
];

export interface SaveSlotData {
  slotKey: string; // e.g. "1_0" .. "1_5"
  folder: SaveFolderTab;
  indexInFolder: number; // 0..5 (6 slots per folder tab)
  isEmpty: boolean;
  savedAt?: string;
  sceneId?: string;
  globalSceneNumber?: number;
  chapterTitle?: string;
  sceneTitle?: string;
  speakerName?: string;
  dialogueText?: string;
  thumbnailDataUrl?: string;
  isAnimatedScene?: boolean;
  affectionState?: Record<string, number>;
  customAttributesState?: Record<string, Record<string, number | string | boolean>>;
  historySceneIds?: string[];
}

export interface GameSettings {
  // General settings (通用设置)
  textSpeed: number; // 10..100 chars per sec
  autoPlayDelayMs: number; // 800..5000 ms
  bgmVolume: number; // 0..100
  sfxVolume: number; // 0..100
  voiceVolume: number; // 0..100
  fullscreen: boolean;
  // Advanced settings (高级设置)
  skipMode: 'played_only' | 'all'; // Standard expects played_only so Scene 10 stops fast-forward if >10 unplayed
  transitionEffect: 'fade' | 'blur' | 'instant';
  particleQuality: 'high' | 'medium' | 'low';
  showAffectionToast: boolean;
  dialogueBoxOpacity: number; // 60..100
  hardwareAcceleration: boolean;
  targetPlatformPreview: 'desktop_16_9' | 'android_mobile' | 'ios_tablet';
}

export interface GodotNode2D {
  id: string;
  name: string;
  type: 'Node2D' | 'Sprite2D' | 'Camera2D' | 'AudioStreamPlayer' | 'CanvasLayer' | 'Label' | 'ParticleEmitter2D';
  parentId: string | null;
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  visible: boolean;
  color: string;
  scriptLang?: SupportedScriptLang;
  scriptCode?: string;
}
