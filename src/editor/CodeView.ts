import { EditorState } from '@codemirror/state';
import { EditorView, basicSetup } from 'codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { StreamLanguage } from '@codemirror/language';
import { lua } from '@codemirror/legacy-modes/mode/lua';
import { yaml } from '@codemirror/legacy-modes/mode/yaml';
import { oneDark } from '@codemirror/theme-one-dark';
import type { Project, Scene, ScriptLang } from '../common/types';
import { parseSceneYaml, sceneToYaml, projectToYaml, parseProjectYaml } from '../common/yaml';

export interface CodeViewCtx {
  getProject(): Project;
  getSceneId(): string | null;
  getScene(): Scene | null;
  /** 将编辑器中的 YAML 应用回数据模型 */
  applySceneYaml(yamlText: string): void;
  applyProjectYaml(yamlText: string): void;
  updateScript(id: string, code: string): void;
  onSceneChanged(): void;
}

interface FileTab {
  key: string;
  label: string;
  lang: 'yaml' | 'javascript' | 'typescript' | 'python' | 'lua' | 'teal';
  getContent(): string;
  apply?(content: string): void;
  doc?: string;
}

/**
 * 代码视图：
 * - 场景 YAML（双向：编辑 → 应用）
 * - project.yaml（项目元信息/角色/章节）
 * - 全局脚本（Lua / Teal / JavaScript / TypeScript / Python）
 */
export class CodeView {
  private host: HTMLElement;
  private ctx: CodeViewCtx;
  private view: EditorView | null = null;
  private tabs: FileTab[] = [];
  private activeKey = 'scene';
  private root: HTMLElement;

  constructor(host: HTMLElement, ctx: CodeViewCtx) {
    this.host = host;
    this.ctx = ctx;
    this.root = document.createElement('div');
    this.root.className = 'ed-code';
    this.host.appendChild(this.root);
  }

  private buildTabs(): FileTab[] {
    const ctx = this.ctx;
    const project = ctx.getProject();
    const scene = ctx.getScene();
    const tabs: FileTab[] = [];
    if (scene) {
      tabs.push({
        key: 'scene',
        label: `场景 · ${scene.id}.yaml`,
        lang: 'yaml',
        getContent: () => sceneToYaml(scene),
        apply: (t) => ctx.applySceneYaml(t),
        doc: '编辑后点击「应用到场景」。保留节点画布坐标（按节点 id 匹配）。'
      });
    }
    tabs.push({
      key: 'project',
      label: 'project.yaml',
      lang: 'yaml',
      getContent: () => projectToYaml(project),
      apply: (t) => ctx.applyProjectYaml(t),
      doc: '项目元信息：标题 / 角色 / 章节 / 全局脚本。场景单独存放在各场景 YAML 中。'
    });
    for (const s of project.scripts ?? []) {
      tabs.push({
        key: `script:${s.id}`,
        label: `脚本 · ${s.name}`,
        lang: s.lang,
        getContent: () => s.code,
        apply: (t) => ctx.updateScript(s.id, t)
      });
    }
    return tabs;
  }

  private langExt(lang: FileTab['lang']) {
    switch (lang) {
      case 'yaml': return StreamLanguage.define(yaml);
      case 'javascript': return javascript();
      case 'typescript': return javascript({ typescript: true });
      case 'python': return python();
      case 'lua':
      case 'teal': return StreamLanguage.define(lua);
    }
  }

  render(): void {
    this.tabs = this.buildTabs();
    if (!this.tabs.find((t) => t.key === this.activeKey)) this.activeKey = this.tabs[0]?.key ?? 'scene';
    this.root.innerHTML = `
      <div class="ed-code-files"></div>
      <div class="ed-code-editor"></div>
      <div class="ed-code-actions">
        <button class="ed-btn primary ed-apply" style="display:none">应用到模型</button>
        <button class="ed-btn ed-download">下载此文件</button>
        <span class="ed-code-doc" style="font-size:11px;color:var(--ed-dim)"></span>
      </div>
    `;
    const filesEl = this.root.querySelector('.ed-code-files')!;
    for (const t of this.tabs) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ed-code-file' + (t.key === this.activeKey ? ' active' : '');
      b.textContent = t.label;
      b.addEventListener('click', () => {
        this.activeKey = t.key;
        this.render();
      });
      filesEl.appendChild(b);
    }

    const active = this.tabs.find((t) => t.key === this.activeKey) ?? this.tabs[0];
    const editorHost = this.root.querySelector('.ed-code-editor') as HTMLElement;
    const applyBtn = this.root.querySelector('.ed-apply') as HTMLButtonElement;
    const docEl = this.root.querySelector('.ed-code-doc') as HTMLElement;

    if (!active) return;
    docEl.textContent = active.doc ?? '';

    if (active.apply) applyBtn.style.display = '';
    applyBtn.onclick = () => {
      if (!this.view || !active.apply) return;
      try {
        active.apply(this.view.state.doc.toString());
        this.toast?.('已应用');
      } catch (err) {
        this.toast?.(`应用失败：${String(err)}`);
      }
    };
    this.root.querySelector('.ed-download')!.addEventListener('click', () => {
      if (!this.view) return;
      const text = this.view.state.doc.toString();
      const blob = new Blob([text], { type: 'text/yaml;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = active.key === 'scene' ? `${this.ctx.getSceneId() ?? 'scene'}.yaml` : active.key === 'project' ? 'project.yaml' : `${active.label.replace(/^脚本 · /, '')}.txt`;
      a.click();
      URL.revokeObjectURL(a.href);
    });

    this.view = new EditorView({
      state: EditorState.create({
        doc: active.getContent(),
        extensions: [
          basicSetup,
          this.langExt(active.lang),
          oneDark,
          EditorView.lineWrapping
        ]
      }),
      parent: editorHost
    });
  }

  toast: ((msg: string) => void) | null = null;

  refresh(): void {
    this.render();
  }

  destroy(): void {
    this.view?.destroy();
    this.root.remove();
  }
}
