import YAML from 'yaml';
import type { VNProject, SceneNode, StoryChapter, WorkflowNodeType } from '../types';
import { getNodeMeta } from '../data/nodeRegistry.ts';

export interface ChapterYamlDocument {
  moovn_schema: '1.0';
  chapter: {
    id: string;
    index: number;
    title: string;
    subtitle: string;
    yaml_file: string;
    scenes_count: number;
  };
  scenes: Array<{
    id: string;
    category: string;
    type: WorkflowNodeType;
    title: string;
    background: string;
    bgm: string;
    transition: SceneNode['transition'];
    screen_text?: {
      text: string;
      sub_text?: string;
      x: number;
      y: number;
      font_size: number;
    };
    characters: Array<{
      character_id: string;
      name: string;
      sprite_id: string;
      x: number;
      y: number;
      scale: number;
    }>;
    dialogues: Array<{
      speaker_id: string;
      speaker: string;
      expression?: string;
      text: string;
    }>;
    choices: Array<{
      id: string;
      text: string;
      target: string;
      affection_character_id?: string;
      affection_delta?: number;
    }>;
    next: string | null;
  }>;
}

/**
 * Serializes a chapter and its nodes into a canonical `moovn_schema: "1.0"` YAML document
 * using the `yaml` library so quotes, colons, `#`, and multi-line strings are safely escaped (`GPT-08`, `GPT-10`).
 */
export function generateChapterYaml(project: VNProject, chapterId: string): string {
  const chapter =
    project.chapters.find((c) => c.id === chapterId) || project.chapters[0];
  const chapterNodes = project.nodes.filter((n) => n.chapterId === chapter.id);

  const doc: ChapterYamlDocument = {
    moovn_schema: '1.0',
    chapter: {
      id: chapter.id,
      index: chapter.index,
      title: chapter.title,
      subtitle: chapter.subtitle || '',
      yaml_file: chapter.yamlFileName,
      scenes_count: chapterNodes.length,
    },
    scenes: chapterNodes.map((node) => {
      const meta = getNodeMeta(node.type);
      return {
        id: node.id,
        category: meta.categoryLabel,
        type: node.type,
        title: node.title,
        background: node.backgroundId,
        bgm: node.bgmId,
        transition: node.transition || 'fade',
        ...(node.screenTextConfig
          ? {
              screen_text: {
                text: node.screenTextConfig.text,
                ...(node.screenTextConfig.subText
                  ? { sub_text: node.screenTextConfig.subText }
                  : {}),
                x: node.screenTextConfig.x,
                y: node.screenTextConfig.y,
                font_size: node.screenTextConfig.fontSize,
              },
            }
          : {}),
        characters: node.characters.map((ch) => ({
          character_id: ch.characterId,
          name: ch.name,
          sprite_id: ch.spriteId,
          x: ch.x,
          y: ch.y,
          scale: ch.scale,
        })),
        dialogues: node.dialogues.map((d) => ({
          speaker_id: d.speakerId,
          speaker: d.speakerName,
          ...(d.expressionSpriteId ? { expression: d.expressionSpriteId } : {}),
          text: d.text,
        })),
        choices: node.choices.map((c) => ({
          id: c.id,
          text: c.text,
          target: c.targetNodeId,
          ...(c.affectionCharacterId
            ? { affection_character_id: c.affectionCharacterId }
            : {}),
          ...(typeof c.affectionDelta === 'number'
            ? { affection_delta: c.affectionDelta }
            : {}),
        })),
        next: node.nextNodeId ?? null,
      };
    }),
  };

  return YAML.stringify(doc, { indent: 2, lineWidth: 0 });
}

/**
 * Parses and validates a `moovn_schema: "1.0"` YAML string back into chapter metadata and `SceneNode[]`.
 */
export function parseChapterYaml(yamlText: string): {
  ok: boolean;
  chapter?: StoryChapter;
  nodes?: SceneNode[];
  error?: string;
} {
  try {
    const parsed = YAML.parse(yamlText) as Partial<ChapterYamlDocument>;
    if (!parsed || typeof parsed !== 'object') {
      return { ok: false, error: 'YAML 内容不是有效对象' };
    }
    if (parsed.moovn_schema !== '1.0') {
      return {
        ok: false,
        error: `不支持的 moovn_schema 版本: ${String(parsed.moovn_schema ?? 'missing')}（需要 "1.0"）`,
      };
    }
    if (!parsed.chapter || typeof parsed.chapter.id !== 'string' || !Array.isArray(parsed.scenes)) {
      return { ok: false, error: '缺少必填字段 chapter.id 或 scenes 数组' };
    }

    const ch: StoryChapter = {
      id: String(parsed.chapter.id),
      index: Number(parsed.chapter.index || 1),
      title: String(parsed.chapter.title || '未命名章节'),
      subtitle: String(parsed.chapter.subtitle || ''),
      yamlFileName: String(parsed.chapter.yaml_file || `${parsed.chapter.id}.yaml`),
      description: '',
    };

    const nodes: SceneNode[] = parsed.scenes.map((s, idx) => ({
      id: String(s.id || `node-${idx + 1}`),
      type: (s.type as WorkflowNodeType) || 'dialogue',
      title: String(s.title || `节点 ${idx + 1}`),
      chapterId: ch.id,
      position: { x: 120 + idx * 300, y: 160 },
      backgroundId: String(s.background || ''),
      bgmId: String(s.bgm || ''),
      transition: s.transition || 'fade',
      screenTextConfig: s.screen_text
        ? {
            text: String(s.screen_text.text || ''),
            subText: s.screen_text.sub_text ? String(s.screen_text.sub_text) : undefined,
            x: Number(s.screen_text.x ?? 50),
            y: Number(s.screen_text.y ?? 50),
            fontSize: Number(s.screen_text.font_size ?? 28),
            color: '#ffffff',
            align: 'center',
            bgOverlay: 'dim',
            animation: 'fade',
            durationMs: 2000,
          }
        : undefined,
      characters: Array.isArray(s.characters)
        ? s.characters.map((c, cIdx) => ({
            id: `pl-${idx}-${cIdx}`,
            characterId: String(c.character_id || ''),
            name: String(c.name || c.character_id || ''),
            spriteId: String(c.sprite_id || ''),
            x: Number(c.x ?? 50),
            y: Number(c.y ?? 82),
            scale: Number(c.scale ?? 1),
          }))
        : [],
      dialogues: Array.isArray(s.dialogues)
        ? s.dialogues.map((d, dIdx) => ({
            id: `dlg-${idx}-${dIdx}`,
            speakerId: String(d.speaker_id || 'narrator'),
            speakerName: String(d.speaker || '旁白'),
            speakerColor: '#38bdf8',
            expressionSpriteId: d.expression ? String(d.expression) : undefined,
            text: String(d.text || ''),
          }))
        : [],
      choices: Array.isArray(s.choices)
        ? s.choices.map((c, optIdx) => ({
            id: String(c.id || `opt-${idx}-${optIdx}`),
            text: String(c.text || ''),
            targetNodeId: String(c.target || ''),
            affectionCharacterId: c.affection_character_id,
            affectionDelta: c.affection_delta,
          }))
        : [],
      visualBlocks: [],
      nextNodeId: s.next ? String(s.next) : null,
    }));

    return { ok: true, chapter: ch, nodes };
  } catch (err: unknown) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'YAML 解析失败',
    };
  }
}

/**
 * Generates syntactically valid TypeScript code with every dynamic string serialized via `JSON.stringify` (`GPT-08`).
 */
export function generateTypeScriptEngineCode(project: VNProject): string {
  const lines: string[] = [
    `// ${project.title.replace(/\r?\n/g, ' ')} — TypeScript 节点脚本`,
    `export interface SceneContext {`,
    `  setBackground(bgId: string, transition: string): Promise<void> | void;`,
    `  showScreenText(text: string, opts: { x: number; y: number; fontSize: number }): Promise<void> | void;`,
    `  say(speaker: string, text: string, expression?: string): Promise<void> | void;`,
    `  jump(targetNodeId: string): Promise<void> | void;`,
    `}`,
    ``,
    `export const projectConfig = {`,
    `  projectId: ${JSON.stringify(project.id)},`,
    `  title: ${JSON.stringify(project.title)},`,
    `  resolution: { width: ${Number(project.resolution.width) || 1920}, height: ${Number(project.resolution.height) || 1080} },`,
    `  startNodeId: ${JSON.stringify(project.startNodeId)},`,
    `} as const;`,
    ``,
    `export const sceneHandlers: Record<string, (ctx: SceneContext) => Promise<void>> = {};`,
    ``,
  ];

  project.nodes.forEach((node) => {
    const meta = getNodeMeta(node.type);
    const safeComment = `[${meta.categoryLabel}] ${node.title} (${node.id})`.replace(/\r?\n/g, ' ');
    lines.push(`// ${safeComment}`);
    lines.push(`sceneHandlers[${JSON.stringify(node.id)}] = async (ctx: SceneContext) => {`);
    lines.push(
      `  await ctx.setBackground(${JSON.stringify(node.backgroundId)}, ${JSON.stringify(
        node.transition || 'fade'
      )});`
    );
    if (node.screenTextConfig) {
      lines.push(
        `  await ctx.showScreenText(${JSON.stringify(node.screenTextConfig.text)}, { x: ${Number(
          node.screenTextConfig.x
        )}, y: ${Number(node.screenTextConfig.y)}, fontSize: ${Number(
          node.screenTextConfig.fontSize
        )} });`
      );
    }
    node.dialogues.forEach((d) => {
      lines.push(
        `  await ctx.say(${JSON.stringify(d.speakerName)}, ${JSON.stringify(
          d.text
        )}, ${JSON.stringify(d.expressionSpriteId || '')});`
      );
    });
    if (node.nextNodeId) {
      lines.push(`  await ctx.jump(${JSON.stringify(node.nextNodeId)});`);
    }
    lines.push(`};`);
    lines.push(``);
  });

  return lines.join('\n');
}

export function exportProjectJson(project: VNProject) {
  const blob = new Blob([JSON.stringify(project, null, 2)], {
    type: 'application/json;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${project.id}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function exportChapterYaml(project: VNProject, chapterId: string) {
  const ch = project.chapters.find((c) => c.id === chapterId) || project.chapters[0];
  const yaml = generateChapterYaml(project, ch.id);
  const blob = new Blob([yaml], { type: 'text/yaml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = ch.yamlFileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
