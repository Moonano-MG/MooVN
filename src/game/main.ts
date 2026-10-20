import { BlueTemplate } from '../template-blue/BlueTemplate';
import { loadBlueTemplate, loadEditorProject } from '../template-blue/data';
import { installBootGuard } from '../common/bootguard';

/**
 * 游戏运行时入口。
 * URL 参数：
 *   ?scene=<id>        从指定场景开始（编辑器试运行）
 *   ?project=editor    使用编辑器保存的项目
 */
async function boot(): Promise<void> {
  installBootGuard('game');
  const params = new URLSearchParams(location.search);
  const host = document.getElementById('game')!;

  const isEditorRun = params.get('project') === 'editor';
  let project = isEditorRun ? loadEditorProject() : null;
  if (!project) project = loadBlueTemplate();

  // 编辑器试运行：从指定场景开始
  const sceneParam = params.get('scene');
  if (sceneParam && project.scenes[sceneParam]) {
    project = { ...project, startScene: sceneParam };
  }

  const template = new BlueTemplate(project, host);
  await template.init();

  if (isEditorRun) {
    console.info('[MooVN] 编辑器试运行模式');
  }
}

void boot();
