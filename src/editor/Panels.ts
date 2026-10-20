import type { Project, Chapter, Scene, FlowNode, CharacterDef, CharacterAttributeDef, SceneCharacterState } from '../common/types';
import { NODE_TYPE_LABELS } from '../common/types';
import { newId } from '../common/yaml';
import { snapX } from './ScenePreview';

/* ================================================================== */
/* 文件管理器：章节 > 场景                                              */
/* ================================================================== */
export class FileManager {
  root: HTMLElement;
  private ctx: FileManagerCtx;

  constructor(host: HTMLElement, ctx: FileManagerCtx) {
    this.ctx = ctx;
    this.root = document.createElement('div');
    this.root.className = 'ed-side-section files';
    host.appendChild(this.root);
  }

  render(): void {
    const p = this.ctx.getProject();
    this.root.innerHTML = `
      <div class="ed-side-head">
        <span>文件管理器</span>
        <span class="actions">
          <button class="ed-icon-btn" data-act="add-chapter" title="新建章节">＋</button>
        </span>
      </div>
      <div class="ed-tree"></div>
    `;
    this.root.querySelector('[data-act="add-chapter"]')!.addEventListener('click', () => this.ctx.addChapter());

    const tree = this.root.querySelector('.ed-tree')!;
    for (const ch of p.chapters) {
      const chap = document.createElement('div');
      chap.className = 'ed-chapter';
      const collapsed = this.collapsed.has(ch.id);
      const row = document.createElement('div');
      row.className = 'ed-chapter-row' + (collapsed ? ' collapsed' : '');
      row.innerHTML = `
        <span class="tw">▼</span>
        <span class="label" title="点击重命名">📁 ${escapeHtml(ch.title)}</span>
        <span class="row-actions">
          <button class="ed-icon-btn" data-act="add-scene" title="新建场景">＋</button>
          <button class="ed-icon-btn" data-act="del-chapter" title="删除章节">🗑</button>
        </span>
      `;
      row.querySelector('.tw')!.addEventListener('click', (e) => {
        e.stopPropagation();
        if (collapsed) this.collapsed.delete(ch.id);
        else this.collapsed.add(ch.id);
        this.render();
      });
      row.querySelector('.label')!.addEventListener('click', () => {
        const t = prompt('重命名章节', ch.title);
        if (t && t.trim()) {
          this.ctx.renameChapter(ch.id, t.trim());
        }
      });
      row.addEventListener('click', () => {
        if (collapsed) this.collapsed.delete(ch.id);
        else this.collapsed.add(ch.id);
        this.render();
      });
      row.querySelector('[data-act="add-scene"]')!.addEventListener('click', (e) => {
        e.stopPropagation();
        this.ctx.addScene(ch.id);
      });
      row.querySelector('[data-act="del-chapter"]')!.addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm(`删除章节「${ch.title}」及其全部场景？`)) this.ctx.deleteChapter(ch.id);
      });
      chap.appendChild(row);

      if (!collapsed) {
        for (const sid of ch.scenes) {
          const scene = p.scenes[sid];
          if (!scene) continue;
          const srow = document.createElement('div');
          srow.className = 'ed-scene-row' + (sid === this.ctx.getSceneId() ? ' active' : '');
          srow.innerHTML = `
            <span class="ic">📄</span>
            <span title="${escapeHtml(scene.id)}">${escapeHtml(scene.title)}</span>
            <span class="row-actions">
              <button class="ed-icon-btn" data-act="up" title="上移">↑</button>
              <button class="ed-icon-btn" data-act="down" title="下移">↓</button>
              <button class="ed-icon-btn" data-act="del" title="删除场景">🗑</button>
            </span>
          `;
          srow.addEventListener('click', () => this.ctx.openScene(sid));
          srow.querySelector('[data-act="up"]')!.addEventListener('click', (e) => { e.stopPropagation(); this.ctx.moveScene(ch.id, sid, -1); });
          srow.querySelector('[data-act="down"]')!.addEventListener('click', (e) => { e.stopPropagation(); this.ctx.moveScene(ch.id, sid, 1); });
          srow.querySelector('[data-act="del"]')!.addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm(`删除场景「${scene.title}」？`)) this.ctx.deleteScene(sid);
          });
          chap.appendChild(srow);
        }
      }
      tree.appendChild(chap);
    }
  }

  private collapsed = new Set<string>();
}

/* ================================================================== */
/* 角色系统（好感度 + 自定义属性）                                       */
/* ================================================================== */
export class CharacterPanel {
  root: HTMLElement;
  private ctx: CharacterPanelCtx;

  constructor(host: HTMLElement, ctx: CharacterPanelCtx) {
    this.ctx = ctx;
    this.root = document.createElement('div');
    this.root.className = 'ed-side-section chars';
    host.appendChild(this.root);
  }

  render(): void {
    const p = this.ctx.getProject();
    this.root.innerHTML = `
      <div class="ed-side-head">
        <span>角色系统</span>
        <span class="actions">
          <button class="ed-icon-btn" data-act="add" title="新建角色">＋</button>
        </span>
      </div>
      <div class="ed-tree"></div>
    `;
    this.root.querySelector('[data-act="add"]')!.addEventListener('click', () => this.ctx.addCharacter());
    const tree = this.root.querySelector('.ed-tree')!;

    for (const c of p.characters) {
      const card = document.createElement('div');
      card.className = 'ed-char-card';
      const attrs = c.attributes.map((a) => `${a.label}(${a.key})`).join(' · ');
      card.innerHTML = `
        <div class="name">
          <span class="cdot" style="background:${escapeHtml(c.color)}"></span>
          <span>${escapeHtml(c.name)}</span>
          <span class="ed-icon-btn del" title="删除角色" style="margin-left:auto">🗑</span>
        </div>
        <div class="meta">${escapeHtml(attrs) || '（无属性）'}</div>
      `;
      card.addEventListener('click', () => this.ctx.selectCharacter(c.id));
      card.querySelector('.del')!.addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm(`删除角色「${c.name}」？场景中的引用将保留为文本。`)) this.ctx.deleteCharacter(c.id);
      });
      tree.appendChild(card);
    }
  }
}

/* ================================================================== */
/* 右侧检查器：节点属性 / 场景设置 / 角色编辑                            */
/* ================================================================== */
export type InspectorSelection =
  | { kind: 'none' }
  | { kind: 'scene' }
  | { kind: 'node'; id: string }
  | { kind: 'character'; id: string };

export class Inspector {
  root: HTMLElement;
  private ctx: InspectorCtx;
  private sel: InspectorSelection = { kind: 'none' };

  constructor(host: HTMLElement, ctx: InspectorCtx) {
    this.ctx = ctx;
    this.root = document.createElement('div');
    this.root.className = 'ed-inspector';
    host.appendChild(this.root);
  }

  setSelection(sel: InspectorSelection): void {
    this.sel = sel;
    this.render();
  }

  render(): void {
    const p = this.ctx.getProject();
    const head = { scene: '场景设置', node: '节点属性', character: '角色编辑', none: '属性' }[this.sel.kind];
    this.root.innerHTML = `<div class="ed-insp-head">${head}</div><div class="ed-insp-body"></div>`;
    const body = this.root.querySelector('.ed-insp-body') as HTMLElement;

    if (this.sel.kind === 'node') {
      const nodeId = (this.sel as { id: string }).id;
      const node = this.ctx.getScene()?.flow.find((n) => n.id === nodeId);
      if (node) this.renderNode(body, node);
      else body.innerHTML = `<div class="ed-insp-empty">节点不存在</div>`;
      return;
    }
    if (this.sel.kind === 'scene') {
      this.renderScene(body);
      return;
    }
    if (this.sel.kind === 'character') {
      this.renderCharacter(body);
      return;
    }
    body.innerHTML = `
      <div class=" ed-insp-empty">
        选中一个节点查看属性。<br><br>
        · 工作流模式：画布上点击节点<br>
        · 场景模式：调整背景 / 角色站位<br>
        · 代码模式：直接编辑场景 YAML / Lua / Teal / JS / TS / Python
      </div>
    `;
  }

  /* ---------- 节点属性 ---------- */
  private renderNode(body: HTMLElement, node: FlowNode): void {
    const ctx = this.ctx;
    const scene = ctx.getScene();
    const p = ctx.getProject();
    const F = (label: string, input: string, oninput: (el: HTMLInputElement) => void) => {
      const d = document.createElement('div');
      d.className = 'ed-field';
      d.innerHTML = `<label>${label}</label>${input}`;
      const el = d.querySelector('input, select, textarea') as HTMLInputElement;
      el.addEventListener('input', () => {
        oninput(el);
        ctx.commit(false);
      });
      if (el.tagName === 'TEXTAREA') {
        el.addEventListener('input', () => {
          oninput(el);
          ctx.commit(false);
        });
      }
      body.appendChild(d);
      return d;
    };
    const idLabel = document.createElement('div');
    idLabel.className = 'ed-insp-empty';
    idLabel.style.marginBottom = '12px';
    idLabel.textContent = `${NODE_TYPE_LABELS[node.type]} · ${node.id}`;
    body.appendChild(idLabel);

    const charOptions = (sel?: string) =>
      ['<option value="">（无）</option>']
        .concat(p.characters.map((c) => `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${escapeHtml(c.name)} (${c.id})</option>`))
        .join('');
    const sceneOptions = (sel?: string | null) =>
      ['<option value="">（无）</option>']
        .concat(Object.values(p.scenes).map((s) => `<option value="${s.id}" ${s.id === sel ? 'selected' : ''}>${escapeHtml(s.title)} (${s.id})</option>`))
        .join('');
    const nodeOptions = (sel?: string | null) =>
      ['<option value="">（无）</option>']
        .concat((scene?.flow ?? []).filter((n) => n.id !== node.id).map((n) => `<option value="${n.id}" ${n.id === sel ? 'selected' : ''}>${NODE_TYPE_LABELS[n.type]} · ${n.id}</option>`))
        .join('');

    switch (node.type) {
      case 'dialogue':
        F('角色', `<select name="c">${charOptions(node.character)}</select>`, (el) => { node.character = el.value; });
        F('台词', `<textarea name="t">${escapeHtml(node.text ?? '')}</textarea>`, (el) => { node.text = el.value; });
        break;
      case 'narration':
        F('旁白文本', `<textarea name="t">${escapeHtml(node.text ?? '')}</textarea>`, (el) => { node.text = el.value; });
        break;
      case 'choice': {
        (node.options ?? []).forEach((o, i) => {
          const wrap = document.createElement('div');
          wrap.style.border = '1px solid var(--ed-border-soft)';
          wrap.style.borderRadius = '8px';
          wrap.style.padding = '9px';
          wrap.style.marginBottom = '8px';
          wrap.innerHTML = `
            <div class="ed-field"><label>选项 ${i + 1} 文本</label><input type="text" value="${escapeHtml(o.text)}"></div>
            <div class="ed-field"><label>跳转节点</label><select>${nodeOptions(o.next)}</select></div>
            <div class="ed-field"><label>或跳转场景</label><select>${sceneOptions(o.scene)}</select></div>
            <div class="ed-field"><label>数值效果（如 yuki.affection）</label>
              <div class="ed-field-row">
                <input type="text" class="eff-k" placeholder="yuki.affection" value="${o.effects ? escapeHtml(Object.keys(o.effects)[0] ?? '') : ''}">
                <input type="number" class="eff-v" placeholder="1" value="${o.effects ? Object.values(o.effects)[0] ?? 0 : 0}">
              </div>
            </div>
            <button class="ed-btn danger" style="width:100%">删除此选项</button>
          `;
          const inputs = wrap.querySelectorAll('input, select');
          (inputs[0] as HTMLInputElement).addEventListener('input', () => { o.text = (inputs[0] as HTMLInputElement).value; ctx.commit(false); });
          (inputs[1] as HTMLSelectElement).addEventListener('change', () => { o.next = (inputs[1] as HTMLSelectElement).value || undefined; ctx.commit(true); });
          (inputs[2] as HTMLSelectElement).addEventListener('change', () => { o.scene = (inputs[2] as HTMLSelectElement).value || undefined; ctx.commit(true); });
          const effK = wrap.querySelector('.eff-k') as HTMLInputElement;
          const effV = wrap.querySelector('.eff-v') as HTMLInputElement;
          const syncEff = () => {
            o.effects = effK.value.trim() ? { [effK.value.trim()]: Number(effV.value) || 0 } : undefined;
            ctx.commit(false);
          };
          effK.addEventListener('input', syncEff);
          effV.addEventListener('input', syncEff);
          wrap.querySelector('button')!.addEventListener('click', () => {
            node.options?.splice(i, 1);
            ctx.commit(true);
          });
          body.appendChild(wrap);
        });
        const add = document.createElement('button');
        add.className = 'ed-btn';
        add.style.width = '100%';
        add.textContent = '＋ 添加选项';
        add.addEventListener('click', () => {
          (node.options ??= []).push({ text: '新选项' });
          ctx.commit(true);
        });
        body.appendChild(add);
        break;
      }
      case 'branch':
        F('条件表达式', `<input type="text" value="${escapeHtml(node.condition ?? '')}">`, (el) => { node.condition = el.value; });
        F('成立 → 节点', `<select>${nodeOptions(node.true)}</select>`, (el) => { node.true = (el as unknown as HTMLSelectElement).value || undefined; });
        {
          const selTrue = body.querySelectorAll('select')[0] as HTMLSelectElement;
          selTrue.addEventListener('change', () => { node.true = selTrue.value || undefined; ctx.commit(true); });
          const wrap = document.createElement('div');
          wrap.className = 'ed-field';
          wrap.innerHTML = `<label>成立 → 场景</label><select>${sceneOptions(node.true?.startsWith('scene:') ? node.true.slice(6) : '')}</select>`;
          (wrap.querySelector('select') as HTMLSelectElement).addEventListener('change', (e) => {
            const v = (e.target as HTMLSelectElement).value;
            node.true = v ? `scene:${v}` : undefined;
            ctx.commit(true);
          });
          body.appendChild(wrap);
        }
        {
          const wrap = document.createElement('div');
          wrap.className = 'ed-field';
          wrap.innerHTML = `<label>不成立 → 节点</label><select>${nodeOptions(node.false)}</select>`;
          (wrap.querySelector('select') as HTMLSelectElement).addEventListener('change', (e) => {
            node.false = (e.target as HTMLSelectElement).value || undefined;
            ctx.commit(true);
          });
          body.appendChild(wrap);
        }
        {
          const wrap = document.createElement('div');
          wrap.className = 'ed-field';
          wrap.innerHTML = `<label>不成立 → 场景</label><select>${sceneOptions(node.false?.startsWith('scene:') ? node.false.slice(6) : '')}</select>`;
          (wrap.querySelector('select') as HTMLSelectElement).addEventListener('change', (e) => {
            const v = (e.target as HTMLSelectElement).value;
            node.false = v ? `scene:${v}` : undefined;
            ctx.commit(true);
          });
          body.appendChild(wrap);
        }
        break;
      case 'setvar':
        F('目标变量', `<input type="text" value="${escapeHtml(node.target ?? '')}" placeholder="yuki.affection">`, (el) => { node.target = el.value; });
        {
          const wrap = document.createElement('div');
          wrap.className = 'ed-field';
          wrap.innerHTML = `<label>操作</label><select>
            <option value="set" ${node.op === 'set' ? 'selected' : ''}>赋值 =</option>
            <option value="add" ${node.op === 'add' ? 'selected' : ''}>增加 +</option>
            <option value="sub" ${node.op === 'sub' ? 'selected' : ''}>减少 −</option>
          </select>`;
          (wrap.querySelector('select') as HTMLSelectElement).addEventListener('change', (e) => {
            node.op = (e.target as HTMLSelectElement).value as FlowNode['op'];
            ctx.commit(false);
          });
          body.appendChild(wrap);
        }
        F('值', `<input type="text" value="${escapeHtml(String(node.value ?? 0))}">`, (el) => { node.value = el.value; });
        break;
      case 'background':
        F('背景图路径', `<input type="text" value="${escapeHtml(node.asset ?? '')}">`, (el) => { node.asset = el.value; });
        F('过渡毫秒', `<input type="number" value="${node.fade ?? 700}">`, (el) => { node.fade = Number(el.value); });
        break;
      case 'bgm':
      case 'sfx':
        F('音频路径', `<input type="text" value="${escapeHtml(node.asset ?? '')}">`, (el) => { node.asset = el.value; });
        break;
      case 'character':
        F('动作', `<select>
          <option value="show" ${node.action === 'show' ? 'selected' : ''}>登场</option>
          <option value="hide" ${node.action === 'hide' ? 'selected' : ''}>退场</option>
          <option value="move" ${node.action === 'move' ? 'selected' : ''}>移动</option>
        </select>`, (el) => { node.action = el.value as FlowNode['action']; });
        F('角色', `<select>${charOptions(node.ref)}</select>`, (el) => { node.ref = (el as unknown as HTMLSelectElement).value; });
        {
          const sel = body.querySelector('select') as HTMLSelectElement;
          sel.addEventListener('change', () => { node.ref = sel.value; ctx.commit(false); });
        }
        F('位置（left/center/right 或 0~1）', `<input type="text" value="${typeof node.position === 'number' ? node.position : node.position ?? 'left'}">`, (el) => {
          const v = el.value.trim();
          node.position = /^\d+(\.\d+)?$/.test(v) ? Number(v) : (v as FlowNode['position']);
        });
        break;
      case 'jump':
        F('目标场景', `<select>${sceneOptions(node.scene)}</select>`, (el) => { node.scene = (el as unknown as HTMLSelectElement).value; });
        break;
      case 'ending':
        F('结局 ID', `<input type="text" value="${escapeHtml(node.endingId ?? '')}">`, (el) => { node.endingId = el.value; });
        F('结局标题', `<input type="text" value="${escapeHtml(node.endingTitle ?? '')}">`, (el) => { node.endingTitle = el.value; });
        F('结局类型', `<select>
          <option value="good" ${node.endingKind === 'good' ? 'selected' : ''}>Good End</option>
          <option value="normal" ${node.endingKind === 'normal' ? 'selected' : ''}>Normal End</option>
          <option value="bad" ${node.endingKind === 'bad' ? 'selected' : ''}>Bad End</option>
          <option value="true" ${node.endingKind === 'true' ? 'selected' : ''}>True End</option>
        </select>`, (el) => { node.endingKind = el.value as FlowNode['endingKind']; });
        break;
      case 'script': {
        F('语言', `<select>
          ${(['javascript', 'lua', 'teal', 'typescript', 'python'] as const).map((l) => `<option value="${l}" ${node.lang === l ? 'selected' : ''}>${l}</option>`).join('')}
        </select>`, (el) => { node.lang = el.value as FlowNode['lang']; ctx.refreshInspector(); });
        F('脚本代码', `<textarea name="code" style="min-height:180px;font-family:ui-monospace,monospace">${escapeHtml(node.code ?? '')}</textarea>`, (el) => { node.code = el.value; });
        break;
      }
      case 'wait':
        F('等待毫秒', `<input type="number" value="${node.ms ?? 500}">`, (el) => { node.ms = Number(el.value); });
        break;
      default:
        body.insertAdjacentHTML('beforeend', `<div class="ed-insp-empty">开始节点：场景流程入口。</div>`);
    }

    if (node.type !== 'start') {
      const wrap = document.createElement('div');
      wrap.className = 'ed-field';
      wrap.innerHTML = `<label>后继节点（next）</label><select>${nodeOptions(node.next)}</select>`;
      (wrap.querySelector('select') as HTMLSelectElement).addEventListener('change', (e) => {
        node.next = (e.target as HTMLSelectElement).value || null;
        ctx.commit(true);
      });
      body.appendChild(wrap);
    }

    const del = document.createElement('button');
    del.className = 'ed-btn danger';
    del.style.width = '100%';
    del.style.marginTop = '8px';
    del.textContent = '删除节点';
    del.addEventListener('click', () => ctx.deleteNode(node.id));
    body.appendChild(del);
  }

  /* ---------- 场景设置 ---------- */
  private renderScene(body: HTMLElement): void {
    const ctx = this.ctx;
    const scene = ctx.getScene();
    const p = ctx.getProject();
    if (!scene) {
      body.innerHTML = `<div class="ed-insp-empty">尚未选择场景</div>`;
      return;
    }
    body.innerHTML = `
      <div class="ed-field"><label>场景标题</label><input type="text" name="title" value="${escapeHtml(scene.title)}"></div>
      <div class="ed-field"><label>背景图路径</label><input type="text" name="bg" value="${escapeHtml(scene.background ?? '')}"></div>
      <div class="ed-field"><label>BGM 路径</label><input type="text" name="bgm" value="${escapeHtml(scene.bgm ?? '')}"></div>
      <div class="ed-field"><label>流程结束后的下一场景</label><select name="next">
        <option value="">（无）</option>
        ${Object.values(p.scenes).filter((s) => s.id !== scene.id).map((s) => `<option value="${s.id}" ${s.id === scene.next ? 'selected' : ''}>${escapeHtml(s.title)} (${s.id})</option>`).join('')}
      </select></div>
      <hr class="ed-sep">
      <div class="ed-insp-empty" style="margin-bottom:8px">场景角色站位（切换到「场景可视化」可拖拽）</div>
      <div class="ed-scene-chars"></div>
      <button class="ed-btn" name="addchar" style="width:100%">＋ 添加角色到场景</button>
      <hr class="ed-sep">
      <button class="ed-btn" name="dlyaml" style="width:100%">导出场景 YAML</button>
    `;

    const bind = (name: string, fn: (v: string) => void) => {
      const el = body.querySelector(`[name="${name}"]`) as HTMLInputElement;
      el.addEventListener('input', () => { fn(el.value); ctx.commit(false); });
      if (el.tagName === 'SELECT') el.addEventListener('change', () => { fn(el.value); ctx.commit(true); });
    };
    bind('title', (v) => { scene.title = v; });
    bind('bg', (v) => { scene.background = v; });
    bind('bgm', (v) => { scene.bgm = v; });
    bind('next', (v) => { scene.next = v || null; });

    const charsEl = body.querySelector('.ed-scene-chars') as HTMLElement;
    const renderChars = () => {
      charsEl.innerHTML = '';
      scene.characters.forEach((sc, i) => {
        const def = p.characters.find((c) => c.id === sc.ref);
        const row = document.createElement('div');
        row.className = 'ed-attr-row';
        row.innerHTML = `
          <span class="k">${escapeHtml(def?.name ?? sc.ref)}</span>
          <select class="pos">
            ${['left', 'center', 'right'].map((pp) => `<option value="${pp}" ${sc.position === pp ? 'selected' : ''}>${pp}</option>`).join('')}
            <option value="_num" ${typeof sc.position === 'number' ? 'selected' : ''}>${typeof sc.position === 'number' ? sc.position : '自定义'}</option>
          </select>
          <input type="number" class="yv" step="0.01" min="-0.2" max="0.2" value="${sc.y ?? 0}" title="垂直偏移" style="width:64px">
          <label class="ed-check" title="压暗"><input type="checkbox" class="dim" ${sc.dim ? 'checked' : ''}>暗</label>
          <label class="ed-check" title="可见"><input type="checkbox" class="vis" ${sc.visible !== false ? 'checked' : ''}>显</label>
          <button class="ed-icon-btn del">✕</button>
        `;
        const pos = row.querySelector('.pos') as HTMLSelectElement;
        pos.addEventListener('change', () => {
          if (pos.value === '_num') {
            sc.position = typeof sc.position === 'number' ? sc.position : 0.5;
          } else {
            sc.position = pos.value as SceneCharacterState['position'];
          }
          ctx.commit(true);
          void ctx.refreshScenePreview();
        });
        row.querySelector('.yv')!.addEventListener('input', (e) => { sc.y = Number((e.target as HTMLInputElement).value); ctx.commit(false); void ctx.refreshScenePreview(); });
        row.querySelector('.dim')!.addEventListener('change', (e) => { sc.dim = (e.target as HTMLInputElement).checked; ctx.commit(false); void ctx.refreshScenePreview(); });
        row.querySelector('.vis')!.addEventListener('change', (e) => { sc.visible = (e.target as HTMLInputElement).checked; ctx.commit(false); void ctx.refreshScenePreview(); });
        row.querySelector('.del')!.addEventListener('click', () => {
          scene.characters.splice(i, 1);
          ctx.commit(true);
          void ctx.refreshScenePreview();
          renderChars();
        });
        charsEl.appendChild(row);
      });
    };
    renderChars();

    body.querySelector('[name="addchar"]')!.addEventListener('click', () => {
      const used = new Set(scene.characters.map((c) => c.ref));
      const free = p.characters.find((c) => !used.has(c.id));
      if (!free) {
        alert('所有角色都已在场景中，或请先在左下角「角色系统」新建角色');
        return;
      }
      scene.characters.push({ ref: free.id, position: 'left', visible: true, dim: false });
      ctx.commit(true);
      void ctx.refreshScenePreview();
      renderChars();
    });

    body.querySelector('[name="dlyaml"]')!.addEventListener('click', () => {
      ctx.downloadSceneYaml();
    });
  }

  /* ---------- 角色编辑 ---------- */
  private renderCharacter(body: HTMLElement): void {
    const p = this.ctx.getProject();
    const c = p.characters.find((x) => x.id === (this.sel as { id: string }).id);
    if (!c) {
      body.innerHTML = `<div class="ed-insp-empty">角色不存在</div>`;
      return;
    }
    body.innerHTML = `
      <div class="ed-field"><label>ID（不可修改）</label><input type="text" value="${escapeHtml(c.id)}" disabled></div>
      <div class="ed-field"><label>名称</label><input type="text" name="name" value="${escapeHtml(c.name)}"></div>
      <div class="ed-field"><label>名牌颜色</label><input type="color" name="color" value="${escapeHtml(c.color)}" style="height:36px;padding:2px"></div>
      <div class="ed-field"><label>立绘路径</label><input type="text" name="sprite" value="${escapeHtml(c.sprite ?? '')}" placeholder="characters/${c.id}.jpg"></div>
      <hr class="ed-sep">
      <div class="ed-insp-empty" style="margin-bottom:8px">角色属性（好感度固定存在）</div>
      <div class="ed-attrs"></div>
      <button class="ed-btn" name="addattr" style="width:100%">＋ 添加属性</button>
    `;

    const attrsEl = body.querySelector('.ed-attrs') as HTMLElement;
    const renderAttrs = () => {
      attrsEl.innerHTML = '';
      for (const a of c.attributes) {
        const row = document.createElement('div');
        row.className = 'ed-attr-row';
        row.innerHTML = `
          <span class="k">${escapeHtml(a.label)}</span>
          <span class="t">${a.key} · ${a.type}</span>
          ${a.key === 'affection' ? '<span class="t" style="margin-left:auto">固定</span>' : '<button class="ed-icon-btn del">✕</button>'}
        `;
        if (a.key !== 'affection') {
          row.querySelector('.del')!.addEventListener('click', () => {
            c.attributes = c.attributes.filter((x) => x !== a);
            this.ctx.commit(true);
            renderAttrs();
          });
        }
        attrsEl.appendChild(row);
      }
    };
    renderAttrs();

    const bind = (name: string, fn: (v: string) => void) => {
      const el = body.querySelector(`[name="${name}"]`) as HTMLInputElement;
      el.addEventListener('input', () => { fn(el.value); this.ctx.commit(false); });
    };
    bind('name', (v) => { c.name = v; });
    bind('color', (v) => { c.color = v; });
    bind('sprite', (v) => { c.sprite = v; });

    body.querySelector('[name="addattr"]')!.addEventListener('click', () => {
      const key = prompt('属性键名（英文，如 trust）');
      if (!key || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) return;
      const label = prompt('属性显示名（如 信任）') ?? key;
      const type = (prompt('类型：number / string / boolean', 'number') ?? 'number') as CharacterAttributeDef['type'];
      c.attributes.push({ key, label, type, default: type === 'number' ? 0 : type === 'boolean' ? false : '' });
      this.ctx.commit(true);
      renderAttrs();
    });
  }
}

/* ================================================================== */
/* 面板上下文接口                                                      */
/* ================================================================== */
export interface FileManagerCtx {
  getProject(): Project;
  getSceneId(): string | null;
  addChapter(): void;
  renameChapter(id: string, title: string): void;
  deleteChapter(id: string): void;
  addScene(chapterId: string): void;
  deleteScene(id: string): void;
  moveScene(chapterId: string, sceneId: string, dir: -1 | 1): void;
  openScene(id: string): void;
}

export interface CharacterPanelCtx {
  getProject(): Project;
  addCharacter(): void;
  deleteCharacter(id: string): void;
  selectCharacter(id: string): void;
}

export interface InspectorCtx {
  getProject(): Project;
  getSceneId(): string | null;
  getScene(): Scene | null;
  /** persist=false 时只同步画布，true 时完整提交（含持久化与树刷新） */
  commit(full: boolean): void;
  deleteNode(id: string): void;
  refreshInspector(): void;
  refreshScenePreview(): Promise<void>;
  downloadSceneYaml(): void;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}
