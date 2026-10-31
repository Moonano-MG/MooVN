export type ScriptLanguage =
  | 'typescript'
  | 'javascript'
  | 'csharp'
  | 'cpp'
  | 'rust';

export type NodeCategory =
  | 'control'
  | 'loop_logic'
  | 'narrative'
  | 'screen_text'
  | 'character'
  | 'visual'
  | 'audio'
  | 'ui'
  | 'script';

export type WorkflowNodeType =
  // 1. 叙事 (Narrative)
  | 'dialogue'
  | 'narration'
  | 'cg_caption'
  | 'inner_monologue'
  // 2. 屏幕文字 (Screen Text)
  | 'screen_text'
  | 'chapter_title'
  | 'floating_subtitle'
  | 'banner_notice'
  // 3. 控制 (Flow Control & Streaming/Chapter Package)
  | 'choice'
  | 'timed_choice'
  | 'condition'
  | 'switch_branch'
  | 'wait_timer'
  | 'jump_chapter'
  | 'random_branch'
  | 'stream_preload_hint'
  | 'msvn_chapter_load'
  | 'end'
  // 4. 循环与多重容器逻辑 (Scratch-style Multi-Nesting Containers & Fine Logic)
  | 'repeat_loop'
  | 'while_loop'
  | 'for_each_loop'
  | 'if_else_container'
  | 'parallel_container'
  | 'try_catch_container'
  | 'math_operation'
  | 'string_format'
  | 'array_operation'
  | 'break_continue'
  // 5. 角色 (Character & Expression)
  | 'char_enter'
  | 'char_exit'
  | 'char_expression'
  | 'char_move'
  | 'char_action'
  | 'char_highlight'
  | 'affection_change'
  // 6. 视觉 (Visual, Fade & Camera)
  | 'bg_switch'
  | 'fade'
  | 'camera_pan_zoom'
  | 'camera_shake'
  | 'screen_flash'
  | 'weather_particles'
  | 'color_filter'
  | 'frame_animation'
  // 7. 音频 (Audio)
  | 'bgm_play'
  | 'bgm_stop'
  | 'sfx_play'
  | 'voice_play'
  // 8. 界面与设置 (In-Game UI & Settings Nodes)
  | 'ui_visibility'
  | 'popup_toast'
  | 'clue_unlock'
  | 'ui_theme_switch'
  | 'ui_style_switch'
  | 'game_settings_modify'
  // 9. 数据与脚本 (Data & Script Bridge)
  | 'set_variable'
  | 'function_call'
  | 'script';

export interface NodeTypeMeta {
  type: WorkflowNodeType;
  category: NodeCategory;
  categoryLabel: string; // 类型标，例如 "控制"、"循环"、"屏幕文字"、"角色"
  title: string;
  description: string;
  accentColor: string;
  badgeBg: string;
  badgeText: string;
  isContainer?: boolean; // 是否为可多重嵌套子节点的容器节点（如重复循环、如果否则、并行块）
  hasDualSlots?: boolean; // 是否包含主分支槽 + 否则/异常副槽
}

export interface CharacterCustomAttribute {
  id: string;
  key: string;
  label: string;
  value: number | string | boolean;
}

export type CharacterMediaType =
  | 'image'
  | 'static'
  | 'video'
  | 'animated_image';

export type CharacterIdleMotion = 'none' | 'breathe';

export type AvatarLayerTextureMap = Partial<
  Record<
    | 'hair_back'
    | 'body'
    | 'eyes_open'
    | 'eyes_closed'
    | 'mouth_neutral'
    | 'mouth_talk_a'
    | 'mouth_talk_b'
    | 'brow_neutral'
    | 'brow_angry'
    | 'brow_sad'
    | 'blush'
    | 'hair_front',
    string
  >
>;

export interface CharacterExpressionVariant {
  id: string;
  label: string;
  spriteId: string;
  mediaType?: CharacterMediaType;
  mediaUrl?: string;
  videoLoop?: boolean;
  videoPlaybackRate?: number;
  chromaKeyColor?: string;
  idleMotion?: CharacterIdleMotion;
}

export interface CharacterProfile {
  id: string;
  name: string;
  titleRole: string;
  color: string;
  spriteId: string;
  mediaType?: CharacterMediaType;
  mediaUrl?: string;
  layerTextures?: AvatarLayerTextureMap;
  videoLoop?: boolean;
  videoPlaybackRate?: number;
  chromaKeyColor?: string;
  idleMotion?: CharacterIdleMotion;
  expressions?: CharacterExpressionVariant[];
  initialAffection: number;
  maxAffection: number;
  bio: string;
  customAttributes: CharacterCustomAttribute[];
}

export interface CharacterPlacement {
  id: string;
  characterId: string;
  name: string;
  spriteId: string;
  expressionLabel?: string;
  mediaType?: CharacterMediaType;
  mediaUrl?: string;
  layerTextures?: AvatarLayerTextureMap;
  videoLoop?: boolean;
  videoPlaybackRate?: number;
  chromaKeyColor?: string;
  idleMotion?: CharacterIdleMotion;
  x: number; // 0-100 stage percentage, horizontal center of the portrait
  y: number; // 0-100 stage percentage, bottom-center (feet) anchor
  scale: number; // 0.5-2.0
  opacity?: number; // 0-1
  flipX?: boolean;
  highlight?: boolean;
  enterAnimation?: 'none' | 'fade' | 'slide-left' | 'slide-right' | 'shake' | 'nod';
  tweenDurationMs?: number;
}

export interface DialogueLine {
  id: string;
  speakerId: string;
  speakerName: string;
  speakerColor: string;
  text: string;
  expressionSpriteId?: string;
  voiceAudioId?: string;
  charAction?: 'none' | 'shake' | 'nod' | 'slide-in';
}

export interface ChoiceOption {
  id: string;
  text: string;
  targetNodeId: string;
  affectionCharacterId?: string;
  affectionDelta?: number;
  conditionExpr?: string;
  setVarKey?: string;
  setVarValue?: string | number | boolean;
}

export interface ConditionBranchRule {
  variableType: 'affection' | 'custom_attr' | 'global_var';
  characterId?: string;
  attributeKey: string;
  operator: '>=' | '<=' | '==' | '>' | '<' | '!=';
  compareValue: number | string | boolean;
  trueTargetNodeId: string;
  falseTargetNodeId: string;
}

export interface FadeActionConfig {
  targetType: 'character' | 'background' | 'screen';
  direction: 'in' | 'out';
  characterId?: string;
  backgroundId?: string;
  durationMs: number;
  easing: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';
  tintColor?: string;
}

export interface ScreenTextConfig {
  text: string;
  subText?: string;
  x: number; // 0-100%
  y: number; // 0-100%
  fontSize: number; // px
  color: string;
  strokeColor?: string;
  align: 'left' | 'center' | 'right';
  bgOverlay: 'none' | 'dim' | 'black' | 'white' | 'cinematic_bars';
  animation: 'fade' | 'typewriter' | 'zoom_in' | 'slide_up';
  durationMs: number;
  holdOnScreen?: boolean;
}

export interface CameraActionConfig {
  zoom: number; // 1.0 - 2.5
  offsetX: number; // -50 to 50
  offsetY: number; // -50 to 50
  shakeIntensity?: 'none' | 'light' | 'medium' | 'heavy';
  flashColor?: string;
  durationMs: number;
}

export interface NodeSettingsActionConfig {
  targetPresetId?: GameUIConfig['presetId'];
  dialogueBgOpacity?: number;
  dialogueBgColor?: string;
  dialogueBorderColor?: string;
  textSpeedMs?: number;
  autoPlayDelayMs?: number;
  bgmVolumePercent?: number;
  openSettingsPanel?: boolean;
  preloadAheadScenes?: number;
  unloadBehindScenes?: number;
  targetMsvnChapterId?: string;
}

export type VisualBlockCategory =
  | 'narrative'
  | 'screen_text'
  | 'character'
  | 'visual'
  | 'control'
  | 'audio'
  | 'ui'
  | 'script';

export type VisualBlockKind =
  | 'say'
  | 'narrate'
  | 'screen_text'
  | 'chapter_banner'
  | 'show_bg'
  | 'fade_target'
  | 'show_char'
  | 'switch_expr'
  | 'move_char_tween'
  | 'hide_char'
  | 'play_anim_frames'
  | 'play_bgm'
  | 'play_sfx'
  | 'camera_effect'
  | 'weather_effect'
  | 'filter_effect'
  | 'modify_affection'
  | 'set_char_attr'
  | 'branch_if'
  | 'wait_ms'
  | 'toast_popup'
  | 'call_bridge_script';

export interface VisualScriptBlock {
  id: string;
  category: VisualBlockCategory;
  kind: VisualBlockKind;
  params: Record<string, string | number | boolean>;
}

export interface MediaAnimationConfig {
  mediaType: 'static' | 'frame_sequence' | 'video' | 'tween';
  frameAssetIds?: string[];
  fps?: number;
  loop?: boolean;
  videoUrl?: string;
  tweenTargetX?: number;
  tweenTargetY?: number;
  tweenTargetScale?: number;
  tweenDurationMs?: number;
}

export interface NestedChildNode {
  id: string;
  type: WorkflowNodeType;
  title: string;
  params: Record<string, string | number | boolean>;
  customCode?: string;
  /**
   * 支持多重递归嵌套：例如在「重复循环」下添加「如果否则」，「如果否则」下再添加「台词/变量/重复循环」
   */
  childrenNodes?: NestedChildNode[];
  elseChildrenNodes?: NestedChildNode[];
}

export interface LoopContainerConfig {
  repeatCount?: number; // for repeat_loop (e.g. 3)
  conditionExpr?: string; // for while_loop / if_else_container (e.g. "affection.yukina >= 60")
  iteratorVar?: string; // for for_each_loop (e.g. "char")
  collectionTarget?: 'characters' | 'variables' | 'clues';
  breakMode?: 'break' | 'continue';
}

export interface LogicOperationConfig {
  targetVar: string;
  mathOp?: '+=' | '-=' | '*=' | '/=' | '%=' | '=' | 'random' | 'clamp';
  operandValue: number | string;
  clampMin?: number;
  clampMax?: number;
  formatTemplate?: string; // e.g. "第 ${day_count} 天 · 好感 ${yukina}"
  arrayAction?: 'push' | 'remove' | 'clear';
  functionName?: string;
  functionArgs?: string;
}

export interface SceneNode {
  id: string;
  type: WorkflowNodeType;
  title: string;
  chapterId: string;
  position: { x: number; y: number };
  backgroundId: string;
  bgmId: string;
  sfxId?: string;
  transition: 'fade' | 'slide' | 'dissolve' | 'flash' | 'curtain' | 'none';
  weatherEffect?: 'none' | 'sakura' | 'rain' | 'sunset_glow' | 'fireflies' | 'snow';
  colorFilter?: 'none' | 'sepia' | 'grayscale' | 'night_blue' | 'dream_bloom';
  characters: CharacterPlacement[];
  dialogues: DialogueLine[];
  choices: ChoiceOption[];
  timedChoiceSeconds?: number;
  defaultTimeoutTargetId?: string;
  conditionRule?: ConditionBranchRule;
  fadeConfig?: FadeActionConfig;
  screenTextConfig?: ScreenTextConfig;
  cameraConfig?: CameraActionConfig;
  settingsActionConfig?: NodeSettingsActionConfig;
  loopConfig?: LoopContainerConfig;
  logicConfig?: LogicOperationConfig;
  childrenNodes?: NestedChildNode[];
  elseChildrenNodes?: NestedChildNode[];
  waitDurationMs?: number;
  toastMessage?: string;
  unlockedClueTitle?: string;
  unlockedClueDesc?: string;
  targetExpressionCharId?: string;
  targetExpressionSpriteId?: string;
  affectionTargetCharId?: string;
  affectionDelta?: number;
  variableKey?: string;
  variableValue?: string | number | boolean;
  mediaAnimation?: MediaAnimationConfig;
  visualBlocks: VisualScriptBlock[];
  nextNodeId: string | null;
  endingType?: 'good' | 'true' | 'normal' | 'bad';
  endingTitle?: string;
  scriptLanguage?: ScriptLanguage;
  customScript?: string;
  notes?: string;
}

export interface StoryChapter {
  id: string;
  index: number;
  title: string;
  subtitle: string;
  yamlFileName: string;
  description: string;
  /** Legacy metadata retained for existing projects; chapter mounting is not implemented. */
  minCharacterAffection?: Record<string, number>;
  minVariables?: Record<string, number>;
  isBaseRequired?: boolean;
  msvnSizeEstimateMb?: number;
}

export interface GlobalVariable {
  key: string;
  label: string;
  type: 'number' | 'boolean' | 'string';
  value: number | boolean | string;
}

// Legacy format names remain readable, but new output uses MooVN's internal codec.
export type AssetCompressionFormat = 'moovn_lz77' | 'xz' | '7z' | 'brotli';

export interface GamePerformanceConfig {
  compressionFormat: AssetCompressionFormat;
  compressionLevel: number; // 0 = raw, 1–9 = internal LZ77 search window
  // Legacy fields remain optional for reading older projects; they do not enable a runtime loader.
  skipAlreadyCompressedPng?: boolean;
  preloadSceneDistance?: number;
  unloadSceneDistance?: number;
  streamPreloadScenes?: number;
  decompressTarget?: 'memory' | 'cache_file';
  workerCpuBudgetPercent?: number;
  modularMsvnEnabled?: boolean;
}

export interface GameUIConfig {
  presetId: 'classic_blue' | 'glass_cyan' | 'sakura_romance' | 'obsidian_gold' | 'minimal_cinema';
  dialogueBox: {
    bottomOffset: number;
    widthPercent: number;
    heightPx: number;
    paddingPx: number;
    bgColor: string;
    bgOpacity: number;
    borderColor: string;
    borderWidth: number;
    borderRadius: number;
    backdropBlur: boolean;
    speakerFontSize: number;
    speakerTagMode: 'inside' | 'floating_badge';
    textFontSize: number;
    textColor: string;
    lineHeight: number;
    controlPosition: 'bottom_right' | 'top_right' | 'bottom_center';
    visibleControls: {
      back: boolean;
      auto: boolean;
      skip: boolean;
      hide: boolean;
      settings: boolean;
    };
  };
  choiceBox: {
    position: 'above_left' | 'above_center' | 'screen_center';
    bgColor: string;
    bgOpacity: number;
    borderColor: string;
    hoverAccentColor: string;
    textColor: string;
    fontSize: number;
    borderRadius: number;
  };
  mainMenu: {
    layout: 'left_panel' | 'right_panel' | 'center_card';
    panelColor: string;
    accentColor: string;
    titleColor: string;
    backgroundId: string;
    showHeroCharacter: boolean;
    heroCharacterSpriteId: string;
    subtitleText: string;
  };
}

export interface ProjectScriptFile {
  id: string;
  fileName: string;
  content: string;
  linkedNodeId?: string;
  updatedAt?: string;
}

export interface VNProject {
  /** Coordinate semantics of this project, independent of the game's display version. */
  schemaVersion?: '1.0' | '1.0.0' | '1.1' | '1.1.0';
  id: string;
  title: string;
  author: string;
  version: string;
  projectPath?: string;
  isTemplatePreset?: boolean;
  resolution: { width: number; height: number };
  defaultLanguage: ScriptLanguage;
  startNodeId: string;
  chapters: StoryChapter[];
  characters: CharacterProfile[];
  nodes: SceneNode[];
  variables: GlobalVariable[];
  uiConfig: GameUIConfig;
  performanceConfig?: GamePerformanceConfig;
  scriptFiles?: ProjectScriptFile[];
}

export interface BackgroundAsset {
  id: string;
  name: string;
  category: string;
  path: string;
  accent: string;
  timeOfDay?: '晴日' | '黄昏' | '夜晚' | '室内';
  mediaType?: 'image' | 'video';
}

export interface CharacterSpriteAsset {
  id: string;
  name: string;
  characterGroup: string;
  expressionLabel: string;
  role: string;
  path: string;
  themeColor: string;
  mediaType?: CharacterMediaType;
  videoLoop?: boolean;
  chromaKeyColor?: string;
  idleMotion?: CharacterIdleMotion;
}

export interface AudioAsset {
  id: string;
  name: string;
  type: 'bgm' | 'sfx' | 'voice';
  duration: string;
  tempo: number;
  notes: number[];
  waveType: OscillatorType;
}

export type SaveTabId =
  | 'auto'
  | 'quick'
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

export interface SaveSlotData {
  slotKey: string;
  tabId: SaveTabId;
  slotIndex: number;
  savedAt: string;
  chapterTitle: string;
  nodeId: string;
  nodeTitle: string;
  dialogueIndex: number;
  speakerName: string;
  textPreview: string;
  backgroundId: string;
  affectionSnapshot: Record<string, number>;
  customAttrSnapshot: Record<string, Record<string, number | string | boolean>>;
  variablesSnapshot: Record<string, number | string | boolean>;
  unlockedClues?: string[];
  /** Versioned fields for Studio/Web preview saves, not Engine or HTML saves. */
  previewSnapshotVersion?: 1;
  clueSnapshot?: { title: string; desc: string }[];
  textSpeedSnapshot?: number;
  timedRemainingSnapshot?: number | null;
}

export type AiApiFormat =
  | 'openai_compatible'
  | 'anthropic_claude'
  | 'google_gemini'
  | 'ollama_local';

export type AiCardProviderType =
  | 'google_studio'
  | 'openai_compatible'
  | 'anthropic_claude'
  | 'ollama_local'
  | 'local_hub';

export type ModelHubSource = 'modelscope_cn' | 'modelscope_intl' | 'huggingface' | 'local_disk';

export interface AiModelCard {
  id: string;
  title: string;
  providerType: AiCardProviderType;
  endpointUrl: string;
  modelName: string;
  totalCalls: number;
  enabled: boolean;
}

export interface AiProviderConfig {
  mode: 'local_model' | 'api_key';
  apiFormat: AiApiFormat;
  endpointUrl: string;
  apiKey: string;
  modelName: string;
  localModelId: string;
  localModelDownloaded: boolean;
  agentAutoApply: boolean;
}

export interface AiAgentConfig {
  provider: 'openai_compatible' | 'anthropic' | 'gemini' | 'ollama_local';
  apiKey: string;
  baseUrl: string;
  modelName: string;
  temperature: number;
  enableThinking?: boolean;
  thinkingBudgetTokens?: number;
  autoExecuteWorkflow?: boolean;
  allowScriptEdit?: boolean;
  allowProjectSettingsEdit?: boolean;
  customSystemPrompt?: string;
}

export interface AiChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  /** True only when this response was requested in Agent mode. */
  allowAgentActions?: boolean;
  targetNodeId?: string;
  modelCardTitle?: string;
  usedKeyBadge?: string;
  appliedActions?: string[];
}

export interface MooVNSystemSettings {
  platform: 'windows' | 'android' | 'ios' | 'macos' | 'web';
  workspaceRootPath: string;
  projectsDirectoryPath: string;
  exportOutputDirectoryPath: string;
  cacheDirectoryPath: string;
  settingsFilePath: string;
  webMountedFolderName?: string;
  editorConfig: {
    autoSaveIntervalSec: number;
    coloredNodeCategories: boolean;
    defaultScriptLang: ScriptLanguage;
  };
  defaultGameSettings: {
    textSpeedMs: number;
    autoPlayDelayMs: number;
    bgmVolume: number;
    sfxVolume: number;
    motionLevel?: 'off' | 'subtle' | 'full';
  };
  performanceConfig: GamePerformanceConfig;
}

export interface SavedProjectMeta {
  id: string;
  title: string;
  author: string;
  version: string;
  path: string;
  updatedAt: string;
  chaptersCount: number;
  nodesCount: number;
  isTemplatePreset?: boolean;
  /** Present only in legacy localStorage records. New records contain metadata only. */
  projectData?: VNProject;
}

export type PanelId =
  | 'explorer'
  | 'node_library'
  | 'canvas'
  | 'stage'
  | 'ui_customizer'
  | 'ts_code'
  | 'yaml_code'
  | 'inspector'
  | 'characters'
  | 'ai_agent'
  | 'terminal'
  | 'asset_studio'
  | 'settings';

export type DockZoneId = 'left' | 'center' | 'right' | 'bottom';

export interface FloatingWindowConfig {
  id: string;
  panelId: PanelId;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
}

export type ExportPlatform = 'windows' | 'android' | 'macos' | 'ios' | 'web';
