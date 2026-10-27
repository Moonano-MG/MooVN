import { z } from 'zod';
import { NODE_REGISTRY } from '../data/nodeRegistry.ts';
import { AUDIO_ASSETS, BACKGROUND_ASSETS, CHARACTER_ASSETS } from '../data/assets.ts';
import type { NestedChildNode, VNProject } from '../types.ts';

const id = z.string().min(1).max(200).refine((value) => value.trim().length > 0, '标识符不能为空');
const text = z.string().max(1_000_000);
const mediaValue = z.string().max(16 * 1024 * 1024).refine((value) =>
  value === '' ||
  /^moovn-asset:\/\/[a-f0-9]{64}\.(png|jpe?g|gif|webp|apng|mp4|webm|mov|ogv)$/.test(value) ||
  /^data:(?:image\/(?:png|jpeg|gif|webp|apng)|video\/(?:mp4|webm|quicktime|ogg));base64,/i.test(value) ||
  /^https?:\/\//i.test(value) || /^\/images\//.test(value),
  '不支持的媒体引用或临时地址'
);
const smallText = z.string().max(4096);
const num = z.number().finite();
const primitive = z.union([text, num, z.boolean()]);
const nodeTypes = new Set<string>(NODE_REGISTRY.map((item) => item.type));
const spriteIds = new Set(CHARACTER_ASSETS.map((item) => item.id));
const backgroundIds = new Set(BACKGROUND_ASSETS.map((item) => item.id));
const audioIds = new Set(AUDIO_ASSETS.map((item) => item.id));
const nodeType = z.string().refine((value) => nodeTypes.has(value), '不支持的节点类型');
const scriptLanguage = z.enum(['typescript', 'javascript', 'csharp', 'cpp', 'rust']);
const characterMediaType = z.enum(['image', 'static', 'video', 'animated_image']);
const characterIdle = z.enum(['none', 'breathe']);
const layers = z.object({
  hair_back: mediaValue.optional(), body: mediaValue.optional(), eyes_open: mediaValue.optional(), eyes_closed: mediaValue.optional(),
  mouth_neutral: mediaValue.optional(), mouth_talk_a: mediaValue.optional(), mouth_talk_b: mediaValue.optional(),
  brow_neutral: mediaValue.optional(), brow_angry: mediaValue.optional(), brow_sad: mediaValue.optional(),
  blush: mediaValue.optional(), hair_front: mediaValue.optional(),
}).strict();
const character = z.object({
  id, name: smallText, titleRole: smallText, color: smallText, spriteId: smallText,
  mediaType: characterMediaType.optional(), mediaUrl: mediaValue.optional(), layerTextures: layers.optional(),
  videoLoop: z.boolean().optional(), videoPlaybackRate: num.optional(), chromaKeyColor: smallText.optional(),
  idleMotion: characterIdle.optional(),
  expressions: z.array(z.object({
    id, label: smallText, spriteId: smallText, mediaType: characterMediaType.optional(),
    mediaUrl: mediaValue.optional(), videoLoop: z.boolean().optional(), videoPlaybackRate: num.optional(),
    chromaKeyColor: smallText.optional(), idleMotion: characterIdle.optional(),
  }).strict()).max(500).optional(),
  initialAffection: num, maxAffection: num, bio: text,
  customAttributes: z.array(z.object({ id, key: id, label: smallText, value: primitive }).strict()).max(1000),
}).strict();
const placement = z.object({
  id, characterId: id, name: smallText, spriteId: smallText, expressionLabel: smallText.optional(),
  x: num.min(0).max(100), y: num.min(0).max(100), scale: num.positive().max(10),
  mediaType: characterMediaType.optional(), mediaUrl: mediaValue.optional(), layerTextures: layers.optional(),
  videoLoop: z.boolean().optional(), videoPlaybackRate: num.optional(), chromaKeyColor: smallText.optional(),
  idleMotion: characterIdle.optional(), opacity: num.min(0).max(1).optional(),
  flipX: z.boolean().optional(), highlight: z.boolean().optional(), tweenDurationMs: num.optional(),
  enterAnimation: z.enum(['none', 'fade', 'slide-left', 'slide-right', 'shake', 'nod']).optional(),
}).strict();
const dialogue = z.object({
  id, speakerId: id, speakerName: smallText, speakerColor: smallText, text,
  expressionSpriteId: smallText.optional(), voiceAudioId: smallText.optional(),
  charAction: z.enum(['none', 'shake', 'nod', 'slide-in']).optional(),
}).strict();
const choice = z.object({
  id, text, targetNodeId: smallText, affectionCharacterId: smallText.optional(), affectionDelta: num.optional(),
  conditionExpr: text.optional(), setVarKey: smallText.optional(), setVarValue: primitive.optional(),
}).strict();
const visualBlock = z.object({
  id, category: z.enum(['narrative', 'screen_text', 'character', 'visual', 'control', 'audio', 'ui', 'script']),
  kind: z.enum(['say', 'narrate', 'screen_text', 'chapter_banner', 'show_bg', 'fade_target', 'show_char',
    'switch_expr', 'move_char_tween', 'hide_char', 'play_anim_frames', 'play_bgm', 'play_sfx',
    'camera_effect', 'weather_effect', 'filter_effect', 'modify_affection', 'set_char_attr',
    'branch_if', 'wait_ms', 'toast_popup', 'call_bridge_script']),
  params: z.record(primitive),
}).strict();
const nestedNode: z.ZodType<NestedChildNode> = z.lazy(() => z.object({
  id, type: nodeType as z.ZodType<NestedChildNode['type']>, title: smallText,
  params: z.record(primitive), customCode: text.optional(),
  childrenNodes: z.array(nestedNode).max(1000).optional(),
  elseChildrenNodes: z.array(nestedNode).max(1000).optional(),
}).strict());
const conditionRule = z.object({
  variableType: z.enum(['affection', 'custom_attr', 'global_var']), characterId: smallText.optional(),
  attributeKey: smallText, operator: z.enum(['>=', '<=', '==', '>', '<', '!=']),
  compareValue: primitive, trueTargetNodeId: smallText, falseTargetNodeId: smallText,
}).strict();
const fadeConfig = z.object({
  targetType: z.enum(['character', 'background', 'screen']), direction: z.enum(['in', 'out']),
  characterId: smallText.optional(), backgroundId: smallText.optional(), durationMs: num,
  easing: z.enum(['linear', 'ease-in', 'ease-out', 'ease-in-out']), tintColor: smallText.optional(),
}).strict();
const screenTextConfig = z.object({
  text, subText: text.optional(), x: num, y: num, fontSize: num, color: smallText, strokeColor: smallText.optional(),
  align: z.enum(['left', 'center', 'right']), bgOverlay: z.enum(['none', 'dim', 'black', 'white', 'cinematic_bars']),
  animation: z.enum(['fade', 'typewriter', 'zoom_in', 'slide_up']), durationMs: num, holdOnScreen: z.boolean().optional(),
}).strict();
const cameraConfig = z.object({
  zoom: num, offsetX: num, offsetY: num, shakeIntensity: z.enum(['none', 'light', 'medium', 'heavy']).optional(),
  flashColor: smallText.optional(), durationMs: num,
}).strict();
const settingsActionConfig = z.object({
  targetPresetId: z.enum(['classic_blue', 'glass_cyan', 'sakura_romance', 'obsidian_gold', 'minimal_cinema']).optional(),
  dialogueBgOpacity: num.optional(), dialogueBgColor: smallText.optional(), dialogueBorderColor: smallText.optional(),
  textSpeedMs: num.optional(), autoPlayDelayMs: num.optional(), bgmVolumePercent: num.optional(),
  openSettingsPanel: z.boolean().optional(), preloadAheadScenes: num.optional(), unloadBehindScenes: num.optional(),
  targetMsvnChapterId: smallText.optional(),
}).strict();
const loopConfig = z.object({
  repeatCount: num.optional(), conditionExpr: text.optional(), iteratorVar: smallText.optional(),
  collectionTarget: z.enum(['characters', 'variables', 'clues']).optional(), breakMode: z.enum(['break', 'continue']).optional(),
}).strict();
const logicConfig = z.object({
  targetVar: smallText, mathOp: z.enum(['+=', '-=', '*=', '/=', '%=', '=', 'random', 'clamp']).optional(),
  operandValue: z.union([num, text]), clampMin: num.optional(), clampMax: num.optional(),
  formatTemplate: text.optional(), arrayAction: z.enum(['push', 'remove', 'clear']).optional(),
  functionName: smallText.optional(), functionArgs: text.optional(),
}).strict();
const mediaAnimation = z.object({
  mediaType: z.enum(['static', 'frame_sequence', 'video', 'tween']), frameAssetIds: z.array(smallText).max(1000).optional(),
  fps: num.optional(), loop: z.boolean().optional(), videoUrl: mediaValue.optional(), tweenTargetX: num.optional(),
  tweenTargetY: num.optional(), tweenTargetScale: num.optional(), tweenDurationMs: num.optional(),
}).strict();
const node = z.object({
  id, type: nodeType, title: smallText, chapterId: id, position: z.object({ x: num, y: num }).strict(),
  backgroundId: smallText, bgmId: smallText, sfxId: smallText.optional(),
  transition: z.enum(['fade', 'slide', 'dissolve', 'flash', 'curtain', 'none']),
  weatherEffect: z.enum(['none', 'sakura', 'rain', 'sunset_glow', 'fireflies', 'snow']).optional(),
  colorFilter: z.enum(['none', 'sepia', 'grayscale', 'night_blue', 'dream_bloom']).optional(),
  characters: z.array(placement).max(1000), dialogues: z.array(dialogue).max(10000),
  choices: z.array(choice).max(1000), visualBlocks: z.array(visualBlock).max(10000),
  timedChoiceSeconds: num.optional(), defaultTimeoutTargetId: smallText.optional(), conditionRule: conditionRule.optional(),
  fadeConfig: fadeConfig.optional(), screenTextConfig: screenTextConfig.optional(), cameraConfig: cameraConfig.optional(),
  settingsActionConfig: settingsActionConfig.optional(), loopConfig: loopConfig.optional(), logicConfig: logicConfig.optional(),
  childrenNodes: z.array(nestedNode).max(1000).optional(), elseChildrenNodes: z.array(nestedNode).max(1000).optional(),
  waitDurationMs: num.optional(), toastMessage: text.optional(), unlockedClueTitle: smallText.optional(), unlockedClueDesc: text.optional(),
  targetExpressionCharId: smallText.optional(), targetExpressionSpriteId: smallText.optional(),
  affectionTargetCharId: smallText.optional(), affectionDelta: num.optional(), variableKey: smallText.optional(),
  variableValue: primitive.optional(), mediaAnimation: mediaAnimation.optional(), nextNodeId: smallText.nullable(),
  endingType: z.enum(['good', 'true', 'normal', 'bad']).optional(), endingTitle: smallText.optional(),
  scriptLanguage: scriptLanguage.optional(), customScript: text.optional(), notes: text.optional(),
}).strict();
const chapter = z.object({
  id, index: num, title: smallText, subtitle: smallText, yamlFileName: smallText, description: text,
  minCharacterAffection: z.record(num).optional(), minVariables: z.record(num).optional(),
  isBaseRequired: z.boolean().optional(), msvnSizeEstimateMb: num.optional(),
}).strict();
const controls = z.object({ back: z.boolean(), auto: z.boolean(), skip: z.boolean(), hide: z.boolean(), settings: z.boolean() }).strict();
const ui = z.object({
  presetId: z.enum(['classic_blue', 'glass_cyan', 'sakura_romance', 'obsidian_gold', 'minimal_cinema']),
  dialogueBox: z.object({
    bottomOffset: num, widthPercent: num, heightPx: num, paddingPx: num, bgColor: smallText, bgOpacity: num,
    borderColor: smallText, borderWidth: num, borderRadius: num, backdropBlur: z.boolean(),
    speakerFontSize: num, speakerTagMode: z.enum(['inside', 'floating_badge']), textFontSize: num,
    textColor: smallText, lineHeight: num, controlPosition: z.enum(['bottom_right', 'top_right', 'bottom_center']),
    visibleControls: controls,
  }).strict(),
  choiceBox: z.object({
    position: z.enum(['above_left', 'above_center', 'screen_center']), bgColor: smallText, bgOpacity: num,
    borderColor: smallText, hoverAccentColor: smallText, textColor: smallText, fontSize: num, borderRadius: num,
  }).strict(),
  mainMenu: z.object({
    layout: z.enum(['left_panel', 'right_panel', 'center_card']), panelColor: smallText, accentColor: smallText,
    titleColor: smallText, backgroundId: smallText, showHeroCharacter: z.boolean(),
    heroCharacterSpriteId: smallText, subtitleText: smallText,
  }).strict(),
}).strict();
const performance = z.object({
  compressionFormat: z.enum(['moovn_lz77', 'xz', '7z', 'brotli']), compressionLevel: num,
  skipAlreadyCompressedPng: z.boolean().optional(), preloadSceneDistance: num.optional(), unloadSceneDistance: num.optional(), streamPreloadScenes: num.optional(),
  decompressTarget: z.enum(['memory', 'cache_file']).optional(), workerCpuBudgetPercent: num.optional(), modularMsvnEnabled: z.boolean().optional(),
}).strict();
const projectSchema = z.object({
  schemaVersion: z.enum(['1.0', '1.0.0', '1.1', '1.1.0']).optional(),
  id, title: smallText, author: smallText, version: smallText, projectPath: smallText.optional(), isTemplatePreset: z.boolean().optional(),
  resolution: z.object({ width: num.positive().max(16384), height: num.positive().max(16384) }).strict(),
  defaultLanguage: scriptLanguage, startNodeId: id,
  chapters: z.array(chapter).min(1).max(1000), characters: z.array(character).max(1000), nodes: z.array(node).min(1).max(5000),
  variables: z.array(z.object({ key: id, label: smallText, type: z.enum(['number', 'boolean', 'string']), value: primitive }).strict()
    .refine((variable) => typeof variable.value === variable.type, '变量值类型不匹配')).max(10000),
  uiConfig: ui, performanceConfig: performance.optional(),
  scriptFiles: z.array(z.object({ id, fileName: smallText, content: text, linkedNodeId: smallText.optional(), updatedAt: smallText.optional() }).strict()).max(1000).optional(),
}).strict();

export type ProjectValidationResult = { ok: true; project: VNProject } | { ok: false; error: string };

/** Check an existing object without adding defaults or modifying any input value. */
export function validateVNProjectShape(input: unknown): ProjectValidationResult {
  const stack: { value: unknown; depth: number; exit?: boolean }[] = [{ value: input, depth: 0 }];
  const active = new WeakSet<object>();
  const completed = new WeakSet<object>();
  let objects = 0;
  while (stack.length) {
    const { value, depth, exit } = stack.pop()!;
    if (!value || typeof value !== 'object') continue;
    if (exit) { active.delete(value); completed.add(value); continue; }
    if (active.has(value)) return { ok: false, error: 'ERR_SCHEMA_CYCLE: 工程对象包含循环引用' };
    if (completed.has(value)) continue;
    if (depth > 64 || ++objects > 100_000) return { ok: false, error: 'ERR_SCHEMA_COMPLEXITY: 对象嵌套或数量超过限制' };
    active.add(value);
    stack.push({ value, depth, exit: true });
    for (const [key, child] of Object.entries(value)) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
        return { ok: false, error: `ERR_PROTOTYPE_POLLUTION: 非法字段 ${key}` };
      }
      stack.push({ value: child, depth: depth + 1 });
    }
  }
  const parsed = projectSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: `ERR_SCHEMA_INVALID: ${issue.path.join('.') || 'project'}: ${issue.message}` };
  }
  const p = parsed.data;
  const duplicate = (items: { id: string }[], path: string): string | null => {
    const ids = new Set<string>();
    for (let i = 0; i < items.length; i++) {
      if (ids.has(items[i].id)) return `ERR_DUPLICATE_ID: ${path}[${i}].id = ${items[i].id}`;
      ids.add(items[i].id);
    }
    return null;
  };
  const duplicateGroups: [Array<{ id: string }>, string][] = [
    [p.nodes, 'nodes'], [p.chapters, 'chapters'], [p.characters, 'characters'], [p.scriptFiles || [], 'scriptFiles'],
    [p.nodes.flatMap((n) => n.dialogues), 'dialogues'], [p.nodes.flatMap((n) => n.choices), 'choices'],
    [p.nodes.flatMap((n) => n.characters), 'placements'], [p.nodes.flatMap((n) => n.visualBlocks), 'visualBlocks'],
  ];
  for (const c of p.characters) {
    duplicateGroups.push([c.expressions || [], `characters.${c.id}.expressions`]);
    duplicateGroups.push([c.customAttributes, `characters.${c.id}.customAttributes`]);
    const keys = new Set<string>();
    for (const attribute of c.customAttributes) {
      if (keys.has(attribute.key)) return { ok: false, error: `ERR_DUPLICATE_ID: characters.${c.id}.customAttributes.key = ${attribute.key}` };
      keys.add(attribute.key);
    }
  }
  const childNodes: NestedChildNode[] = [];
  const collectChildren = (children: NestedChildNode[] | undefined) => {
    for (const child of children || []) { childNodes.push(child); collectChildren(child.childrenNodes); collectChildren(child.elseChildrenNodes); }
  };
  for (const n of p.nodes) { collectChildren(n.childrenNodes); collectChildren(n.elseChildrenNodes); }
  duplicateGroups.push([childNodes, 'childrenNodes']);
  for (const [items, path] of duplicateGroups) {
    const err = duplicate(items, path);
    if (err) return { ok: false, error: err };
  }
  const variableNames = new Set<string>();
  for (const variable of p.variables) {
    if (variableNames.has(variable.key)) return { ok: false, error: `ERR_DUPLICATE_ID: variables.key = ${variable.key}` };
    variableNames.add(variable.key);
  }
  const nodes = new Set(p.nodes.map((n) => n.id));
  const chapters = new Set(p.chapters.map((c) => c.id));
  const characters = new Set(p.characters.map((c) => c.id));
  const dangling = (value: string | null | undefined, set: Set<string>, path: string): string | null =>
    value && !set.has(value) ? `ERR_DANGLING_REFERENCE: ${path} = ${value}` : null;
  const customSprites = new Set<string>();
  for (const c of p.characters) {
    if (c.mediaUrl && c.spriteId) customSprites.add(c.spriteId);
    for (const expr of c.expressions || []) if (expr.mediaUrl && expr.spriteId) customSprites.add(expr.spriteId);
  }
  const allSprites = new Set([...spriteIds, ...customSprites]);
  const refs: (string | null)[] = [
    dangling(p.startNodeId, nodes, 'startNodeId'),
    dangling(p.uiConfig.mainMenu.backgroundId, backgroundIds, 'uiConfig.mainMenu.backgroundId'),
    dangling(p.uiConfig.mainMenu.heroCharacterSpriteId, allSprites, 'uiConfig.mainMenu.heroCharacterSpriteId'),
  ];
  p.scriptFiles?.forEach((file, i) => refs.push(dangling(file.linkedNodeId, nodes, `scriptFiles[${i}].linkedNodeId`)));
  p.chapters.forEach((c, i) => Object.keys(c.minCharacterAffection || {}).forEach((key) => refs.push(dangling(key, characters, `chapters[${i}].minCharacterAffection`))));
  p.characters.forEach((c, i) => {
    refs.push(dangling(c.spriteId, allSprites, `characters[${i}].spriteId`));
    c.expressions?.forEach((expr, j) => refs.push(dangling(expr.spriteId, allSprites, `characters[${i}].expressions[${j}].spriteId`)));
  });
  p.nodes.forEach((n, i) => {
    const base = `nodes[${i}]`;
    refs.push(
      dangling(n.chapterId, chapters, `${base}.chapterId`), dangling(n.backgroundId, backgroundIds, `${base}.backgroundId`),
      dangling(n.bgmId, audioIds, `${base}.bgmId`), dangling(n.sfxId, audioIds, `${base}.sfxId`),
      dangling(n.nextNodeId, nodes, `${base}.nextNodeId`), dangling(n.defaultTimeoutTargetId, nodes, `${base}.defaultTimeoutTargetId`),
      dangling(n.targetExpressionCharId, characters, `${base}.targetExpressionCharId`),
      dangling(n.targetExpressionSpriteId, allSprites, `${base}.targetExpressionSpriteId`),
      dangling(n.affectionTargetCharId, characters, `${base}.affectionTargetCharId`),
      dangling(n.conditionRule?.characterId, characters, `${base}.conditionRule.characterId`),
      dangling(n.conditionRule?.trueTargetNodeId, nodes, `${base}.conditionRule.trueTargetNodeId`),
      dangling(n.conditionRule?.falseTargetNodeId, nodes, `${base}.conditionRule.falseTargetNodeId`),
      dangling(n.fadeConfig?.characterId, characters, `${base}.fadeConfig.characterId`),
      dangling(n.fadeConfig?.backgroundId, backgroundIds, `${base}.fadeConfig.backgroundId`),
      dangling(n.settingsActionConfig?.targetMsvnChapterId, chapters, `${base}.settingsActionConfig.targetMsvnChapterId`),
    );
    n.dialogues.forEach((line, j) => {
      if (line.speakerId !== 'narrator') refs.push(dangling(line.speakerId, characters, `${base}.dialogues[${j}].speakerId`));
      refs.push(dangling(line.expressionSpriteId, allSprites, `${base}.dialogues[${j}].expressionSpriteId`));
      refs.push(dangling(line.voiceAudioId, audioIds, `${base}.dialogues[${j}].voiceAudioId`));
    });
    n.characters.forEach((part, j) => {
      refs.push(dangling(part.characterId, characters, `${base}.characters[${j}].characterId`));
      if (!part.mediaUrl) refs.push(dangling(part.spriteId, allSprites, `${base}.characters[${j}].spriteId`));
    });
    n.choices.forEach((option, j) => {
      refs.push(dangling(option.targetNodeId, nodes, `${base}.choices[${j}].targetNodeId`));
      refs.push(dangling(option.affectionCharacterId, characters, `${base}.choices[${j}].affectionCharacterId`));
    });
  });
  const error = refs.find(Boolean);
  if (error) return { ok: false, error };
  return { ok: true, project: input as VNProject };
}
