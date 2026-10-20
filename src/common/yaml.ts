import { parse, stringify } from 'yaml';
import type { Project, Scene } from './types';

/** 解析单个场景 YAML */
export function parseSceneYaml(raw: string): Scene {
  const doc = parse(raw);
  if (!doc || typeof doc !== 'object') throw new Error('场景 YAML 为空或格式不正确');
  if (doc.format && doc.format !== 'moovn-scene') {
    throw new Error(`不是 MooVN 场景文件（format=${doc.format}）`);
  }
  if (!Array.isArray(doc.flow)) throw new Error('场景缺少 flow 数组');
  doc.version = doc.version ?? 1;
  doc.characters = doc.characters ?? [];
  return doc as Scene;
}

export function sceneToYaml(scene: Scene): string {
  const out: Record<string, unknown> = {
    format: 'moovn-scene',
    version: 1,
    id: scene.id,
    chapter: scene.chapter,
    title: scene.title
  };
  if (scene.background) out.background = scene.background;
  if (scene.bgm) out.bgm = scene.bgm;
  if (scene.characters.length) out.characters = scene.characters;
  out.flow = scene.flow;
  out.next = scene.next ?? null;
  return stringify(out, { lineWidth: 0, singleQuote: true });
}

/** 解析项目级 YAML（元信息 + 角色 + 章节，不含 scenes） */
export function parseProjectYaml(raw: string): Partial<Project> {
  const doc = parse(raw);
  if (!doc || typeof doc !== 'object') throw new Error('项目 YAML 为空或格式不正确');
  return doc;
}

export function projectToYaml(project: Project): string {
  return stringify(
    {
      format: 'moovn-project',
      version: 1,
      id: project.id,
      title: project.title,
      author: project.author ?? '',
      template: project.template ?? '',
      assetsRoot: project.assetsRoot ?? 'assets',
      startScene: project.startScene,
      characters: project.characters,
      chapters: project.chapters,
      settings: project.settings ?? {},
      scripts: project.scripts ?? []
    },
    { lineWidth: 0, singleQuote: true }
  );
}

export function newId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;
}
