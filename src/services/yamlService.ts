import YAML from 'yaml';
import { ChapterDef, CharacterDef, EndingDef, SceneDef, StorylineDef } from '../types/moovn';

export function sceneToYaml(scene: SceneDef, chapter?: ChapterDef): string {
  const docObj = {
    moovn_schema: '1.0',
    engine: 'MooVN (TypeScript + Tauri 2 + Pixi.js + YAML)',
    chapter: chapter
      ? {
          id: chapter.id,
          number: chapter.number,
          title: chapter.title,
        }
      : { id: scene.chapterId },
    scene: {
      id: scene.id,
      global_number: scene.globalNumber,
      title: scene.title,
      storyline_id: scene.storylineId,
      background: {
        preset_id: scene.background.presetId,
        custom_url: scene.background.customUrl || null,
        weather: scene.background.weather,
        tint: scene.background.tint,
        blur: scene.background.blur,
        is_animated: scene.background.isAnimated,
      },
      audio: {
        bgm_id: scene.audio.bgmId,
        bgm_volume: scene.audio.bgmVolume,
        sfx_id: scene.audio.sfxId,
      },
      characters: scene.characters.map((c) => ({
        character_id: c.characterId,
        expression: c.expression,
        position: { x: c.x, y: c.y },
        scale: c.scale,
        alpha: c.alpha,
        flip_x: c.flipX,
        z_index: c.zIndex,
        animation: c.animation,
        speaking_highlight: c.speakingHighlight ?? false,
      })),
      dialogue: {
        speaker_id: scene.dialogue.speakerId,
        speaker_name: scene.dialogue.speakerName,
        text: scene.dialogue.text,
        affection_delta: scene.dialogue.affectionDelta || null,
      },
      choices: scene.choices.map((ch) => ({
        id: ch.id,
        text: ch.text,
        target_scene_id: ch.targetSceneId,
        affection_changes: ch.affectionChanges || [],
        attribute_changes: ch.attributeChanges || [],
        condition: ch.condition || null,
      })),
      next_scene_id: scene.nextSceneId,
      ending_id: scene.endingId || null,
      script_binding: scene.scriptBinding || null,
    },
  };

  return YAML.stringify(docObj, { indent: 2 });
}

export function yamlToScene(yamlStr: string, fallbackScene: SceneDef): SceneDef {
  const parsed = YAML.parse(yamlStr);
  const s = parsed?.scene ?? parsed;
  if (!s || typeof s !== 'object') {
    throw new Error('YAML 格式无效：缺少 scene 根节点');
  }

  return {
    id: String(s.id ?? fallbackScene.id),
    chapterId: String(parsed?.chapter?.id ?? s.chapter_id ?? fallbackScene.chapterId),
    globalNumber: Number(s.global_number ?? fallbackScene.globalNumber),
    title: String(s.title ?? fallbackScene.title),
    storylineId: String(s.storyline_id ?? fallbackScene.storylineId),
    background: {
      presetId: s.background?.preset_id ?? fallbackScene.background.presetId,
      customUrl: s.background?.custom_url || undefined,
      weather: s.background?.weather ?? fallbackScene.background.weather,
      tint: String(s.background?.tint ?? fallbackScene.background.tint),
      blur: Number(s.background?.blur ?? fallbackScene.background.blur),
      isAnimated: Boolean(s.background?.is_animated ?? fallbackScene.background.isAnimated),
    },
    audio: {
      bgmId: s.audio?.bgm_id ?? fallbackScene.audio.bgmId,
      bgmVolume: Number(s.audio?.bgm_volume ?? fallbackScene.audio.bgmVolume),
      sfxId: s.audio?.sfx_id ?? fallbackScene.audio.sfxId,
    },
    characters: Array.isArray(s.characters)
      ? s.characters.map((c: any) => ({
          characterId: String(c.character_id ?? c.characterId ?? 'char_shizuki'),
          expression: c.expression ?? 'normal',
          x: Number(c.position?.x ?? c.x ?? 50),
          y: Number(c.position?.y ?? c.y ?? 56),
          scale: Number(c.scale ?? 1),
          alpha: Number(c.alpha ?? 1),
          flipX: Boolean(c.flip_x ?? c.flipX ?? false),
          zIndex: Number(c.z_index ?? c.zIndex ?? 2),
          animation: c.animation ?? 'none',
          speakingHighlight: Boolean(c.speaking_highlight ?? c.speakingHighlight ?? false),
        }))
      : fallbackScene.characters,
    dialogue: {
      speakerId: s.dialogue?.speaker_id !== undefined ? s.dialogue.speaker_id : fallbackScene.dialogue.speakerId,
      speakerName: String(s.dialogue?.speaker_name ?? fallbackScene.dialogue.speakerName),
      text: String(s.dialogue?.text ?? fallbackScene.dialogue.text),
      affectionDelta: s.dialogue?.affection_delta || undefined,
    },
    choices: Array.isArray(s.choices)
      ? s.choices.map((ch: any, idx: number) => ({
          id: String(ch.id ?? `choice_${idx + 1}`),
          text: String(ch.text ?? '选项'),
          targetSceneId: String(ch.target_scene_id ?? ch.targetSceneId ?? fallbackScene.nextSceneId ?? 'scene_01'),
          affectionChanges: ch.affection_changes || ch.affectionChanges || [],
          attributeChanges: ch.attribute_changes || ch.attributeChanges || [],
          condition: ch.condition || undefined,
        }))
      : fallbackScene.choices,
    nextSceneId: s.next_scene_id !== undefined ? s.next_scene_id : fallbackScene.nextSceneId,
    endingId: s.ending_id || undefined,
    scriptBinding: s.script_binding || fallbackScene.scriptBinding,
  };
}

export function projectToYaml(data: {
  chapters: ChapterDef[];
  scenes: SceneDef[];
  characters: CharacterDef[];
  storylines: StorylineDef[];
  endings: EndingDef[];
}): string {
  return YAML.stringify(
    {
      moovn_project: 'Blue Visual Novel Template (蓝色模板)',
      version: '0.1.0',
      targets: ['Windows', 'Android', 'iOS', 'macOS'],
      storylines: data.storylines,
      endings: data.endings,
      characters: data.characters,
      chapters: data.chapters.map((ch) => ({
        ...ch,
        scenes: data.scenes.filter((s) => s.chapterId === ch.id),
      })),
    },
    { indent: 2 }
  );
}

export function downloadTextFile(filename: string, content: string, mime = 'text/yaml;charset=utf-8') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
