export type ScriptLanguage = 'typescript' | 'javascript' | 'lua' | 'teal' | 'python';

export type NodeCategory =
  | 'control'
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
  // 3. 控制 (Flow Control)
  | 'choice'
  | 'timed_choice'
  | 'condition'
  | 'switch_branch'
  | 'wait_timer'
  | 'jump_chapter'
  | 'random_branch'
  | 'end'
  // 4. 角色 (Character & Expression)
  | 'char_enter'
  | 'char_exit'
  | 'char_expression'
  | 'char_move'
  | 'char_action'
  | 'char_highlight'
  | 'affection_change'
  // 5. 视觉 (Visual, Fade & Camera)
  | 'bg_switch'
  | 'fade'
  | 'camera_pan_zoom'
  | 'camera_shake'
  | 'screen_flash'
  | 'weather_particles'
  | 'color_filter'
  | 'frame_animation'
  // 6. 音频 (Audio)
  | 'bgm_play'
  | 'bgm_stop'
  | 'sfx_play'
  | 'voice_play'
  // 7. 界面 (In-Game UI)
  | 'ui_visibility'
  | 'popup_toast'
  | 'clue_unlock'
  | 'ui_theme_switch'
  // 8. 数据与脚本 (Data & Script Bridge)
  | 'set_variable'
  | 'script';

export interface NodeTypeMeta {
  type: WorkflowNodeType;
  category: NodeCategory;
  categoryLabel: string; // 类型标，例如 "控制"、"屏幕文字"、"角色"
  title: string;
  description: string;
  accentColor: string;
  badgeBg: string;
  badgeText: string;
}

export interface CharacterCustomAttribute {
  id: string;
  key: string;
  label: string;
  value: number | string | boolean;
}

export interface CharacterExpressionVariant {
  id: string;
  label: string; // 例如 "微笑"、"惊讶"、"害羞"、"抱猫"
  spriteId: string;
}

export interface CharacterProfile {
  id: string;
  name: string;
  titleRole: string;
  color: string;
  spriteId: string;
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
  x: number; // 0-100 stage percentage
  y: number; // 0-100 stage percentage
  scale: number; // 0.5-2.0
  opacity?: number; // 0-1
  flipX?: boolean;
  highlight?: boolean;
  enterAnimation?: 'none' | 'fade' | 'slide-left' | 'slide-right' | 'bounce' | 'shake' | 'nod' | 'jump';
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
  charAction?: 'none' | 'bounce' | 'shake' | 'nod' | 'slide-in';
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
}

export interface GlobalVariable {
  key: string;
  label: string;
  type: 'number' | 'boolean' | 'string';
  value: number | boolean | string;
}

export interface GameUIConfig {
  presetId: 'classic_blue' | 'glass_cyan' | 'sakura_romance' | 'obsidian_gold' | 'minimal_cinema';
  dialogueBox: {
    bottomOffset: number; // px from bottom (0 - 120)
    widthPercent: number; // 60 - 100%
    heightPx: number; // 130 - 260px
    paddingPx: number; // 14 - 36px
    bgColor: string; // hex
    bgOpacity: number; // 0.1 - 1.0
    borderColor: string; // hex
    borderWidth: number; // 0 - 6px
    borderRadius: number; // 0 - 28px
    backdropBlur: boolean;
    speakerFontSize: number; // 15 - 30px
    speakerTagMode: 'inside' | 'floating_badge';
    textFontSize: number; // 14 - 28px
    textColor: string; // hex
    lineHeight: number; // 1.3 - 2.2
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

export interface VNProject {
  id: string;
  title: string;
  author: string;
  version: string;
  resolution: { width: number; height: number };
  defaultLanguage: ScriptLanguage;
  startNodeId: string;
  chapters: StoryChapter[];
  characters: CharacterProfile[];
  nodes: SceneNode[];
  variables: GlobalVariable[];
  uiConfig: GameUIConfig;
}

export interface BackgroundAsset {
  id: string;
  name: string;
  category: string;
  path: string;
  accent: string;
  timeOfDay?: '晴日' | '黄昏' | '夜晚' | '室内';
}

export interface CharacterSpriteAsset {
  id: string;
  name: string;
  characterGroup: string;
  expressionLabel: string;
  role: string;
  path: string;
  themeColor: string;
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
}

export type AiApiFormat =
  | 'openai_compatible'
  | 'anthropic_claude'
  | 'google_gemini'
  | 'ollama_local';

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

export interface AiChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  appliedActions?: string[];
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
  | 'ai_agent';

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
