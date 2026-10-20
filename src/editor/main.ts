import type { Project } from '../common/types';
import { KEYS, storage } from '../common/storage';
import { installBootGuard } from '../common/bootguard';
import { EditorApp } from './EditorApp';
import { loadBlueTemplate } from '../template-blue/data';

/**
 * 编辑器入口：
 * 优先载入 localStorage 中自动保存的项目，否则载入蓝色模板示例。
 */
async function boot(): Promise<void> {
  installBootGuard('editor');
  const host = document.getElementById('app')!;
  const saved = await storage.get<Project>(KEYS.editorProject);
  const project = saved && saved.format === 'moovn-project' && saved.scenes ? saved : loadBlueTemplate();

  new EditorApp(project, host, {
    toast: (msg) => {
      const el = document.createElement('div');
      el.className = 'ed-toast';
      el.textContent = msg;
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 2200);
    }
  });
}

void boot();
