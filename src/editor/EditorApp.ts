import type { Project, Scene, FlowNode, Chapter, CharacterDef, FlowNodeType } from '../common/types';
import { newId, sceneToYaml, parseSceneYaml, parseProjectYaml, projectToYaml } from '../common/yaml';
import { KEYS, storage } from '../common/storage';
import { WorkflowCanvas } from './WorkflowCanvas';
import { ScenePreview } from './ScenePreview';
import { CodeView } from './CodeView';
import { FileManager, CharacterPanel, Inspector } from './Panels';
import './editor.css';

export type EditorMode = 'workflow' | 'scene' | 'code';

interface EditorCtx {
  toast(msg: string): void;
}

/**
 * MooVN 编辑器主应用
 * 三种模式：工作流（Dify 式节点）/ 场景可视化（拖拽站位）/ 代码（YAML + 多语言脚本）
 * 黑白双主题；项目自动保存；导入导出 .moovnproj（ZIP）
 */
export class EditorApp {
  project: Project;
  mode: EditorMode = 'workflow';
  theme: 'black' | 'white' = 'black';
  sceneId: string | null = null;
  selectedNodeId: string | null = null;
  private ctx: EditorCtx;

  private root: HTMLElement;
  private centerHost!: HTMLElement;
  private canvas: WorkflowCanvas | null = null;
  private preview: ScenePreview | null = null;
  private code: CodeView | null = null;
  private fileMgr: FileManager;
  private charPanel: CharacterPanel;
  private inspector: Inspector;
  private saveTimer: number | null = null;

  constructor(project: Project, host: HTMLElement, ctx: EditorCtx) {
    this.project = project;
    this.ctx = ctx;
    this.root = document.createElement('div');
    this.root.className = 'ed-root';
    this.root.dataset.theme = this.theme;
    host.appendChild(this.root);

    this.buildShell();
    const sidebar = this.root.querySelector('.ed-sidebar')!;
    this.fileMgr = new FileManager(sidebar as HTMLElement, {
      getProject: () => this.project,
      getSceneId: () => this.sceneId,
      addChapter: () => this.addChapter(),
      renameChapter: (id, t) => {
        const ch = this.project.chapters.find((c) => c.id === id);
        if (ch) ch.title = t;
        this.commit(true);
      },
      deleteChapter: (id) => this.deleteChapter(id),
      addScene: (cid) => this.addScene(cid),
      deleteScene: (id) => this.deleteScene(id),
      moveScene: (cid, sid, dir) => this.moveScene(cid, sid, dir),
      openScene: (id) => this.openScene(id)
    });
    this.charPanel = new CharacterPanel(sidebar as HTMLElement, {
      getProject: () => this.project,
      addCharacter: () => this.addCharacter(),
      deleteCharacter: (id) => this.deleteCharacter(id),
      selectCharacter: (id) => {
        this.inspector.setSelection({ kind: 'character', id });
      }
    });
    const main = this.root.querySelector('.ed-main')!;
    this.centerHost = main.querySelector('.ed-center') as HTMLElement;
    this.inspector = new Inspector(main.querySelector('.ed-insp-slot') as HTMLElement, {
      getProject: () => this.project,
      getSceneId: () => this.sceneId,
      getScene: () => this.scene,
      commit: (full) => this.commit(full),
      deleteNode: (id) => {
        this.canvas?.removeNode(id);
        this.selectedNodeId = null;
        this.inspector.setSelection({ kind: 'scene' });
      },
      refreshInspector: () => this.inspector.render(),
      refreshScenePreview: async () => {
        await this.preview?.refresh();
      },
      downloadSceneYaml: () => this.downloadSceneYaml()
    });

    // 初始场景
    this.sceneId = project.startScene && project.scenes[project.startScene] ? project.startScene : (project.chapters[0]?.scenes[0] ?? null);
    void storage.get<'black' | 'white'>(KEYS.editorTheme).then((t) => {
      if (t === 'white' || t === 'black') {
        this.theme = t;
        this.root.dataset.theme = t;
        this.syncThemeBtn();
      }
    });
    this.refreshAll();
  }

  get scene(): Scene | null {
    return this.sceneId ? this.project.scenes[this.sceneId] ?? null : null;
  }

  /* ================= 壳层 ================= */
  private buildShell(): void {
    this.root.innerHTML = `
      <header class="ed-topbar">
        <span class="ed-logo"><span class="mark">M</span> MooVN</span>
        <input class="ed-title-input" name="proj-title" value="${escapeHtml(this.project.title)}" title="项目标题">
        <nav class="ed-modes" aria-label="编辑模式">
          <button class="ed-mode-btn" data-mode="workflow">工作流</button>
          <button class="ed-mode-btn" data-mode="scene">场景可视化</button>
          <button class="ed-mode-btn" data-mode="code">代码</button>
        </nav>
        <span class="ed-spacer"></span>
        <button class="ed-btn ghost" name="theme">🌙 黑</button>
        <button class="ed-btn" name="newproj">新建</button>
        <button class="ed-btn" name="loadtpl">载入蓝色模板</button>
        <button class="ed-btn" name="import">导入</button>
        <button class="ed-btn" name="export">导出</button>
        <button class="ed-btn primary" name="run">▶ 运行</button>
        <input type="file" name="file" accept=".zip,.yaml,.yml,.json" style="display:none">
      </header>
      <div class="ed-main">
        <aside class="ed-sidebar"></aside>
        <section class="ed-center"></section>
        <div class="ed-insp-slot" style="display:contents"></div>
      </div>
    `;

    // 标题
    const titleInput = this.root.querySelector('[name="proj-title"]') as HTMLInputElement;
    titleInput.addEventListener('input', () => {
      this.project.title = titleInput.value;
      this.commit(false);
    });

    // 模式切换
    this.root.querySelectorAll('.ed-mode-btn').forEach((b) => {
      b.addEventListener('click', () => {
        this.setMode((b as HTMLElement).dataset.mode as EditorMode);
      });
    });

    // 主题
    this.root.querySelector('[name="theme"]')!.addEventListener('click', () => {
      this.theme = this.theme === 'black' ? 'white' : 'black';
      this.root.dataset.theme = this.theme;
      void storage.set(KEYS.editorTheme, this.theme);
      this.syncThemeBtn();
    });

    // 新建
    this.root.querySelector('[name="newproj"]')!.addEventListener('click', () => {
      if (!confirm('新建空白项目？（当前项目将覆盖保存，可先导出备份）')) return;
      this.project = this.blankProject();
      this.afterProjectReplaced('已创建空白项目');
    });

    // 载入蓝色模板
    this.root.querySelector('[name="loadtpl"]')!.addEventListener('click', async () => {
      if (!confirm('载入蓝色模板示例项目？（当前项目将覆盖保存，可先导出备份）')) return;
      const { loadBlueTemplate } = await import('../template-blue/data');
      this.project = loadBlueTemplate();
      this.afterProjectReplaced('已载入蓝色模板');
    });

    // 导出
    this.root.querySelector('[name="export"]')!.addEventListener('click', () => void this.exportZip());

    // 导入
    const fileInput = this.root.querySelector('[name="file"]') as HTMLInputElement;
    this.root.querySelector('[name="import"]')!.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
      const f = fileInput.files?.[0];
      if (f) void this.importFile(f);
      fileInput.value = '';
    });

    // 运行
    this.root.querySelector('[name="run"]')!.addEventListener('click', () => {
      this.persistNow();
      const url = `./game.html?project=editor${this.sceneId ? `&scene=${this.sceneId}` : ''}`;
      window.open(url, '_blank');
    });

    this.syncModeBtns();
  }

  private syncModeBtns(): void {
    this.root.querySelectorAll('.ed-mode-btn').forEach((b) => {
      b.classList.toggle('active', (b as HTMLElement).dataset.mode === this.mode);
    });
  }

  private syncThemeBtn(): void {
    const btn = this.root.querySelector('[name="theme"]') as HTMLButtonElement;
    btn.textContent = this.theme === 'black' ? '🌙 黑' : '☀️ 白';
  }

  private afterProjectReplaced(msg: string): void {
    this.sceneId = this.project.chapters[0]?.scenes[0] ?? null;
    this.selectedNodeId = null;
    this.inspector.setSelection({ kind: 'none' });
    this.persistNow();
    this.refreshAll();
    this.ctx.toast(msg);
  }

  /* ================= 模式切换 ================= */
  setMode(mode: EditorMode): void {
    if (this.mode === mode) return;
    this.mode = mode;
    this.syncModeBtns();
    this.mountCenter();
  }

  private mountCenter(): void {
    this.canvas?.destroy();
    this.canvas = null;
    this.preview?.destroy();
    this.preview = null;
    this.code?.destroy();
    this.code = null;
    this.centerHost.innerHTML = '';

    if (this.mode === 'workflow') {
      const self = this;
      this.canvas = new WorkflowCanvas(this.centerHost, {
        getScene: () => self.scene,
        commit: () => self.commit(true),
        get selectedNodeId() { return self.selectedNodeId; },
        onSelectNode: (id) => {
          self.selectedNodeId = id;
          self.inspector.setSelection(id ? { kind: 'node', id } : { kind: 'scene' });
        },
        characterName: (id) => self.project.characters.find((c) => c.id === id)?.name ?? id,
        sceneTitle: (id) => self.project.scenes[id]?.title ?? id
      });
      this.canvas.render();
      this.inspector.setSelection(this.selectedNodeId ? { kind: 'node', id: this.selectedNodeId } : { kind: 'scene' });
    } else if (this.mode === 'scene') {
      if (!this.scene) {
        this.centerHost.innerHTML = `<div style="display:flex;flex:1;align-items:center;justify-content:center;color:var(--ed-dim)">请先在左侧选择或新建一个场景</div>`;
        return;
      }
      this.preview = new ScenePreview(this.centerHost, {
        getProject: () => this.project,
        getScene: () => this.scene,
        onSceneChanged: () => this.commit(false)
      });
      this.inspector.setSelection({ kind: 'scene' });
    } else {
      this.code = new CodeView(this.centerHost, {
        getProject: () => this.project,
        getSceneId: () => this.sceneId,
        getScene: () => this.scene,
        applySceneYaml: (t) => {
          if (!this.sceneId) return;
          const parsed = parseSceneYaml(t);
          const old = this.project.scenes[this.sceneId];
          // 保留画布坐标（按节点 id 匹配）
          for (const n of parsed.flow) {
            const o = old.flow.find((x) => x.id === n.id);
            if (o && n.x === undefined) {
              n.x = o.x;
              n.y = o.y;
            }
          }
          this.project.scenes[parsed.id] = parsed;
          this.sceneId = parsed.id;
          this.commit(true);
          this.code?.refresh();
        },
        applyProjectYaml: (t) => {
          const meta = parseProjectYaml(t);
          this.project.title = meta.title ?? this.project.title;
          this.project.author = meta.author ?? this.project.author;
          this.project.startScene = meta.startScene ?? this.project.startScene;
          this.project.characters = meta.characters ?? this.project.characters;
          this.project.chapters = meta.chapters ?? this.project.chapters;
          this.project.scripts = meta.scripts ?? this.project.scripts;
          this.project.settings = meta.settings ?? this.project.settings;
          this.commit(true);
        },
        updateScript: (id, code) => {
          const s = this.project.scripts.find((x) => x.id === id);
          if (s) s.code = code;
          this.commit(false);
        },
        onSceneChanged: () => this.commit(true)
      });
      this.code.toast = (m) => this.ctx.toast(m);
      this.code.render();
    }
  }

  /* ================= 数据操作 ================= */
  openScene(id: string): void {
    this.sceneId = id;
    this.selectedNodeId = null;
    this.refreshAll();
  }

  addChapter(): void {
    const title = prompt('章节标题', `第${this.project.chapters.length + 1}章`);
    if (!title) return;
    const ch: Chapter = { id: newId('ch'), title, scenes: [] };
    this.project.chapters.push(ch);
    this.addScene(ch.id);
  }

  renameChapter(id: string, title: string): void {
    const ch = this.project.chapters.find((c) => c.id === id);
    if (ch) ch.title = title;
    this.commit(true);
  }

  deleteChapter(id: string): void {
    const ch = this.project.chapters.find((c) => c.id === id);
    if (!ch) return;
    for (const sid of ch.scenes) {
      const scene = this.project.scenes[sid];
      if (scene && Object.values(this.project.chapters).filter((c) => c.scenes.includes(sid)).length <= 1) {
        delete this.project.scenes[sid];
      }
    }
    this.project.chapters = this.project.chapters.filter((c) => c.id !== id);
    if (this.sceneId && !this.project.scenes[this.sceneId]) {
      this.sceneId = Object.keys(this.project.scenes)[0] ?? null;
    }
    this.commit(true);
  }

  addScene(chapterId: string): void {
    const ch = this.project.chapters.find((c) => c.id === chapterId);
    if (!ch) return;
    const id = newId('sc');
    // 即使只改对话，也必须是一个独立场景
    const scene: Scene = {
      format: 'moovn-scene',
      version: 1,
      id,
      chapter: chapterId,
      title: `场景 ${ch.scenes.length + 1}`,
      characters: [],
      flow: [{ id: newId('n'), type: 'start', x: 160, y: 240, next: null }],
      next: null
    };
    this.project.scenes[id] = scene;
    ch.scenes.push(id);
    this.sceneId = id;
    this.selectedNodeId = null;
    this.commit(true);
    this.ctx.toast('已创建场景（每个对话改动都应是独立场景）');
  }

  deleteScene(id: string): void {
    delete this.project.scenes[id];
    for (const ch of this.project.chapters) {
      ch.scenes = ch.scenes.filter((s) => s !== id);
    }
    for (const s of Object.values(this.project.scenes)) {
      if (s.next === id) s.next = null;
      for (const n of s.flow) {
        if (n.next === id) n.next = null;
        if (n.true === `scene:${id}`) n.true = undefined;
        if (n.false === `scene:${id}`) n.false = undefined;
        if (n.scene === id) n.scene = undefined;
        for (const o of n.options ?? []) if (o.scene === id) o.scene = undefined;
      }
    }
    if (this.sceneId === id) this.sceneId = Object.keys(this.project.scenes)[0] ?? null;
    this.commit(true);
  }

  moveScene(chapterId: string, sceneId: string, dir: -1 | 1): void {
    const ch = this.project.chapters.find((c) => c.id === chapterId);
    if (!ch) return;
    const i = ch.scenes.indexOf(sceneId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= ch.scenes.length) return;
    [ch.scenes[i], ch.scenes[j]] = [ch.scenes[j], ch.scenes[i]];
    this.commit(true);
  }

  addCharacter(): void {
    const id = newId('char');
    const c: CharacterDef = {
      id,
      name: '新角色',
      color: '#9ecfff',
      sprite: `characters/${id}.jpg`,
      attributes: [{ key: 'affection', label: '好感度', type: 'number', default: 0 }]
    };
    this.project.characters.push(c);
    this.commit(true);
    this.inspector.setSelection({ kind: 'character', id });
  }

  deleteCharacter(id: string): void {
    this.project.characters = this.project.characters.filter((c) => c.id !== id);
    for (const s of Object.values(this.project.scenes)) {
      s.characters = s.characters.filter((c) => c.ref !== id);
    }
    this.commit(true);
  }

  /* ================= 刷新 / 持久化 ================= */
  refreshAll(): void {
    this.fileMgr.render();
    this.charPanel.render();
    this.inspector.render();
    this.mountCenter();
  }

  commit(full: boolean): void {
    if (full) {
      this.fileMgr.render();
      this.charPanel.render();
    }
    // 画布轻量刷新
    if (this.mode === 'workflow' && this.canvas) {
      this.canvas.render();
    }
    if (this.mode === 'scene' && this.preview) {
      void this.preview.refresh();
    }
    this.schedulePersist();
  }

  private schedulePersist(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => this.persistNow(), 400);
  }

  persistNow(): void {
    void storage.set(KEYS.editorProject, this.project);
  }

  /* ================= 导入导出 ================= */
  async exportZip(): Promise<void> {
    this.persistNow();
    const { default: JSZip } = await import('jszip');
    const zip = new JSZip();
    zip.file('project.yaml', projectToYaml(this.project));
    const scenes = zip.folder('scenes')!;
    for (const s of Object.values(this.project.scenes)) {
      scenes.file(`${s.id}.yaml`, sceneToYaml(s));
    }
    const blob = await zip.generateAsync({ type: 'blob' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${this.project.title || 'moovn-project'}.moovnproj.zip`;
    a.click();
    URL.revokeObjectURL(a.href);
    this.ctx.toast('已导出项目（project.yaml + scenes/*.yaml）');
  }

  downloadSceneYaml(): void {
    const scene = this.scene;
    if (!scene) return;
    const blob = new Blob([sceneToYaml(scene)], { type: 'text/yaml;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${scene.id}.yaml`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  private async importFile(f: File): Promise<void> {
    try {
      if (f.name.endsWith('.zip') || f.name.endsWith('.moovnproj.zip')) {
        const { default: JSZip } = await import('jszip');
        const zip = await JSZip.loadAsync(f);
        const metaFile = zip.file('project.yaml');
        if (!metaFile) throw new Error('缺少 project.yaml');
        const meta = parseProjectYaml(await metaFile.async('string'));
        const scenes: Project['scenes'] = {};
        const sf = zip.folder('scenes');
        if (sf) {
          for (const name of Object.keys(zip.files)) {
            if (name.startsWith('scenes/') && name.endsWith('.yaml')) {
              const sc = parseSceneYaml(await zip.file(name)!.async('string'));
              scenes[sc.id] = sc;
            }
          }
        }
        this.applyImported(meta, scenes);
      } else {
        const text = await f.text();
        const doc = parseProjectYaml(text);
        this.applyImported(doc, this.project.scenes);
      }
      this.ctx.toast('导入成功');
    } catch (err) {
      this.ctx.toast(`导入失败：${String(err)}`);
    }
  }

  private applyImported(meta: ReturnType<typeof parseProjectYaml>, scenes: Project['scenes']): void {
    this.project = {
      format: 'moovn-project',
      version: 1,
      id: meta.id ?? newId('proj'),
      title: meta.title ?? '导入的项目',
      author: meta.author,
      template: meta.template,
      assetsRoot: meta.assetsRoot ?? 'assets',
      startScene: meta.startScene ?? Object.keys(scenes)[0] ?? '',
      characters: (meta.characters ?? []) as CharacterDef[],
      chapters: (meta.chapters ?? []) as Chapter[],
      scenes,
      scripts: meta.scripts ?? [],
      settings: meta.settings
    };
    this.afterProjectReplaced('导入完成');
  }

  /* ================= 工厂 ================= */
  private blankProject(): Project {
    const chId = newId('ch');
    const scId = newId('sc');
    const scene: Scene = {
      format: 'moovn-scene',
      version: 1,
      id: scId,
      chapter: chId,
      title: '开场',
      characters: [],
      flow: [{ id: newId('n'), type: 'start', x: 160, y: 240, next: null }],
      next: null
    };
    return {
      format: 'moovn-project',
      version: 1,
      id: newId('proj'),
      title: '未命名项目',
      template: '',
      assetsRoot: 'assets',
      startScene: scId,
      characters: [],
      chapters: [{ id: chId, title: '第一章', scenes: [scId] }],
      scenes: { [scId]: scene },
      scripts: [],
      settings: { textSpeed: 28, autoSpeed: 900, bgmVolume: 0.6, sfxVolume: 0.8 }
    };
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}
