import type { Project, Scene, CharacterDef, Chapter } from '../common/types';
import { parseSceneYaml, parseProjectYaml } from '../common/yaml';

/** 内嵌的蓝色模板 YAML 数据（构建期打包） */
const raw = import.meta.glob('/template-blue/data/**/*.yaml', {
  query: '?raw',
  import: 'default',
  eager: true
}) as Record<string, string>;

/** 解析内嵌蓝色模板项目 */
export function loadBlueTemplate(): Project {
  let meta: ReturnType<typeof parseProjectYaml> | null = null;
  const scenes: Record<string, Scene> = {};

  for (const [path, content] of Object.entries(raw)) {
    if (path.endsWith('/project.yaml')) {
      meta = parseProjectYaml(content);
    } else if (path.includes('/scenes/')) {
      const scene = parseSceneYaml(content);
      scenes[scene.id] = scene;
    }
  }

  if (!meta) throw new Error('蓝色模板缺少 project.yaml');

  const project: Project = {
    format: 'moovn-project',
    version: 1,
    id: meta.id ?? 'blue-template-demo',
    title: meta.title ?? '雨夜之约',
    author: meta.author,
    template: 'blue',
    assetsRoot: meta.assetsRoot ?? 'assets',
    startScene: meta.startScene ?? Object.keys(scenes)[0],
    characters: (meta.characters ?? []) as CharacterDef[],
    chapters: (meta.chapters ?? []) as Chapter[],
    scenes,
    scripts: meta.scripts ?? [],
    settings: meta.settings
  };
  return project;
}

/** 编辑器项目（localStorage）→ 运行时 */
export function loadEditorProject(): Project | null {
  try {
    const rawStr = localStorage.getItem('moovn.editor.project.v1');
    if (!rawStr) return null;
    const p = JSON.parse(rawStr) as Project;
    if (!p || p.format !== 'moovn-project' || !p.scenes) return null;
    return p;
  } catch (err) {
    console.warn('[MooVN] 编辑器项目载入失败:', err);
    return null;
  }
}
