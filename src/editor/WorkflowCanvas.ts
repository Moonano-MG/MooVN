import type { Scene, FlowNode, FlowNodeType } from '../common/types';
import { NODE_TYPE_LABELS, NODE_TYPE_COLORS } from '../common/types';
import { newId } from '../common/yaml';

export interface CanvasCtx {
  getScene(): Scene | null;
  /** 触发编辑器整体刷新（持久化 + 各面板同步） */
  commit(): void;
  selectedNodeId: string | null;
  onSelectNode(id: string | null): void;
  characterName(id: string): string;
  sceneTitle(id: string): string;
}

interface Transform { x: number; y: number; k: number }

const NODE_W = 210;
const HEAD_H = 35;

/**
 * Dify 式工作流画布：
 * - 节点拖拽 / 画布平移缩放 / 连线（对话、选项、分支多端口）
 * - 双击空白处或工具栏按钮添加节点
 * - 选中节点/连线后可删除（Delete）
 */
export class WorkflowCanvas {
  viewport: HTMLElement;
  private hostEl: HTMLElement;
  private world: HTMLElement;
  private svg: SVGSVGElement;
  private ctx: CanvasCtx;
  private t: Transform = { x: 60, y: 40, k: 0.9 };
  private dragNode: { id: string; dx: number; dy: number; el: HTMLElement } | null = null;
  private panning: { sx: number; sy: number; ox: number; oy: number } | null = null;
  private linking: { fromId: string; optIdx: number | null; ghost: SVGPathElement | null } | null = null;
  private selectedEdge: { from: string; to: string; key: string } | null = null;
  private palette: HTMLElement | null = null;
  private rafPending = false;

  constructor(host: HTMLElement, ctx: CanvasCtx) {
    this.ctx = ctx;
    this.hostEl = host;
    host.innerHTML = `
      <div class="ed-canvas-viewport">
        <div class="ed-canvas-world">
          <svg class="ed-edges"></svg>
        </div>
      </div>
      <div class="ed-canvas-toolbar">
        <button class="ed-btn ed-add-node">＋ 添加节点</button>
        <button class="ed-btn ghost ed-auto-layout">自动整理</button>
      </div>
      <div class="ed-canvas-hint">拖拽移动节点 · 滚轮缩放 · 空白处拖拽平移 · 双击空白添加节点 · Delete 删除选中</div>
    `;
    this.viewport = host.querySelector('.ed-canvas-viewport')!;
    this.world = host.querySelector('.ed-canvas-world')!;
    this.svg = host.querySelector('.ed-edges')!;

    this.bind();
    this.applyTransform();
  }

  /* ================= 交互绑定 ================= */
  private bind(): void {
    this.viewport.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    window.addEventListener('pointermove', (e) => this.onPointerMove(e));
    window.addEventListener('pointerup', (e) => this.onPointerUp(e));
    this.viewport.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    this.viewport.addEventListener('dblclick', (e) => {
      if (e.target === this.viewport || e.target === this.world || (e.target as HTMLElement).classList.contains('ed-edges')) {
        e.preventDefault();
        const r = this.viewport.getBoundingClientRect();
        this.openPalette(e.clientX - r.left - 160, e.clientY - r.top - 60, true);
      }
    });
    window.addEventListener('keydown', (e) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (this.selectedEdge) {
        e.preventDefault();
        this.removeEdge(this.selectedEdge);
      } else if (this.ctx.selectedNodeId) {
        e.preventDefault();
        this.removeNode(this.ctx.selectedNodeId);
      }
    });
    this.hostEl.querySelector('.ed-add-node')!.addEventListener('click', () => this.openPalette(60, 60, false));
    this.hostEl.querySelector('.ed-auto-layout')!.addEventListener('click', () => this.autoLayout());
  }

  private onPointerDown(e: PointerEvent): void {
    if (e.button === 1 || e.button === 2) return;
    this.closePalette();

    const el = e.target as HTMLElement;
    // 端口：开始连线
    const port = el.closest('.ed-port') as HTMLElement | null;
    if (port && port.dataset.port) {
      e.stopPropagation();
      const [, kind, opt] = port.dataset.port.split(':');
      if (kind === 'in') return;
      this.linking = {
        fromId: port.dataset.port.split(':')[0],
        optIdx: kind === 'opt' ? Number(opt) : null,
        ghost: null
      };
      return;
    }
    // 节点：拖动
    const nodeEl = el.closest('.ed-node') as HTMLElement | null;
    if (nodeEl && nodeEl.dataset.nodeId) {
      e.stopPropagation();
      const id = nodeEl.dataset.nodeId;
      const node = this.ctx.getScene()?.flow.find((n) => n.id === id);
      if (!node) return;
      const wr = this.world.getBoundingClientRect();
      const wx = (e.clientX - wr.left) / this.t.k;
      const wy = (e.clientY - wr.top) / this.t.k;
      this.dragNode = { id, dx: wx - (node.x ?? 0), dy: wy - (node.y ?? 0), el: nodeEl };
      this.ctx.onSelectNode(id);
      this.selectedEdge = null;
      this.render();
      return;
    }
    // 连线：选中
    const edge = el.closest('.ed-edge') as SVGGElement | null;
    if (edge?.dataset.edge) {
      const [from, to, key] = edge.dataset.edge.split('>');
      this.selectedEdge = { from, to, key };
      this.ctx.onSelectNode(null);
      this.render();
      return;
    }
    // 空白：平移
    this.panning = { sx: e.clientX, sy: e.clientY, ox: this.t.x, oy: this.t.y };
    this.viewport.classList.add('panning');
    this.ctx.onSelectNode(null);
    this.selectedEdge = null;
  }

  private onPointerMove(e: PointerEvent): void {
    if (this.dragNode) {
      const scene = this.ctx.getScene();
      const node = scene?.flow.find((n) => n.id === this.dragNode!.id);
      if (!node) return;
      const wr = this.world.getBoundingClientRect();
      const wx = (e.clientX - wr.left) / this.t.k;
      const wy = (e.clientY - wr.top) / this.t.k;
      node.x = Math.round((wx - this.dragNode.dx) / 10) * 10;
      node.y = Math.round((wy - this.dragNode.dy) / 10) * 10;
      this.dragNode.el.style.left = `${node.x}px`;
      this.dragNode.el.style.top = `${node.y}px`;
      this.scheduleEdgeRender();
      return;
    }
    if (this.panning) {
      this.t.x = this.panning.ox + (e.clientX - this.panning.sx);
      this.t.y = this.panning.oy + (e.clientY - this.panning.sy);
      this.applyTransform();
      return;
    }
    if (this.linking) {
      this.drawLinkGhost(e.clientX, e.clientY);
    }
  }

  private onPointerUp(e: PointerEvent): void {
    if (this.dragNode) {
      this.dragNode = null;
      this.ctx.commit();
      this.render();
    }
    this.panning = null;
    this.viewport.classList.remove('panning');

    if (this.linking) {
      const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      const target = el?.closest('.ed-node') as HTMLElement | null;
      const link = this.linking;
      this.linking = null;
      this.ghostRemove();
      if (target?.dataset.nodeId) {
        this.connect(link.fromId, link.optIdx, target.dataset.nodeId);
      }
    }
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    const rect = this.viewport.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const oldK = this.t.k;
    const k = Math.min(1.8, Math.max(0.3, oldK * (e.deltaY < 0 ? 1.08 : 0.925)));
    this.t.x = mx - ((mx - this.t.x) / oldK) * k;
    this.t.y = my - ((my - this.t.y) / oldK) * k;
    this.t.k = k;
    this.applyTransform();
  }

  private applyTransform(): void {
    this.world.style.transform = `translate(${this.t.x}px, ${this.t.y}px) scale(${this.t.k})`;
  }

  /* ================= 连线 ================= */
  private connect(fromId: string, optIdx: number | null, toId: string): void {
    const scene = this.ctx.getScene();
    if (!scene || fromId === toId) return;
    const from = scene.flow.find((n) => n.id === fromId);
    if (!from) return;
    if (from.type === 'branch' && optIdx !== null) {
      if (optIdx === 0) from.true = toId;
      else from.false = toId;
    } else if (from.type === 'choice' && optIdx !== null) {
      const opt = from.options?.[optIdx];
      if (opt) opt.next = toId;
    } else if (optIdx === null) {
      from.next = toId;
    }
    this.ctx.commit();
    this.render();
  }

  private removeEdge(edge: { from: string; to: string; key: string }): void {
    const scene = this.ctx.getScene();
    const node = scene?.flow.find((n) => n.id === edge.from);
    if (!node) return;
    if (edge.key === 'true') node.true = undefined;
    else if (edge.key === 'false') node.false = undefined;
    else if (edge.key.startsWith('opt:')) {
      const i = Number(edge.key.slice(4));
      if (node.options?.[i]) node.options[i].next = undefined;
    } else node.next = undefined;
    this.selectedEdge = null;
    this.ctx.commit();
    this.render();
  }

  removeNode(id: string): void {
    const scene = this.ctx.getScene();
    if (!scene) return;
    scene.flow = scene.flow.filter((n) => n.id !== id);
    for (const n of scene.flow) {
      if (n.next === id) n.next = undefined;
      if (n.true === id) n.true = undefined;
      if (n.false === id) n.false = undefined;
      for (const o of n.options ?? []) if (o.next === id) o.next = undefined;
    }
    if (this.ctx.selectedNodeId === id) this.ctx.onSelectNode(null);
    this.ctx.commit();
    this.render();
  }

  /* ================= 节点添加 ================= */
  addNode(type: FlowNodeType, wx?: number, wy?: number): void {
    const scene = this.ctx.getScene();
    if (!scene) return;
    const id = newId('n');
    const node: FlowNode = { id, type, x: wx ?? 300, y: wy ?? 300, next: null };
    this.fillNodeDefaults(node);
    scene.flow.push(node);
    // 选中节点若空出后继则自动连接
    const sel = scene.flow.find((n) => n.id === this.ctx.selectedNodeId);
    if (sel && this.canChain(sel) && sel.next == null) {
      sel.next = id;
    }
    this.ctx.onSelectNode(id);
    this.ctx.commit();
    this.render();
  }

  private canChain(n: FlowNode): boolean {
    return !['choice', 'branch', 'jump', 'ending', 'start'].includes(n.type);
  }

  private fillNodeDefaults(node: FlowNode): void {
    switch (node.type) {
      case 'dialogue': node.text = ''; node.character = this.ctx.getScene()?.characters[0]?.ref ?? ''; break;
      case 'narration': node.text = ''; break;
      case 'choice': node.options = [{ text: '选项一' }, { text: '选项二' }]; break;
      case 'branch': node.condition = 'yuki.affection >= 1'; break;
      case 'setvar': node.target = ''; node.op = 'set'; node.value = 0; break;
      case 'background': node.asset = 'assets/bg/classroom.jpg'; node.fade = 700; break;
      case 'bgm': node.asset = ''; node.loop = true; break;
      case 'sfx': node.asset = ''; break;
      case 'character': node.action = 'show'; node.ref = this.ctx.getScene()?.characters[0]?.ref ?? ''; node.position = 'left'; break;
      case 'jump': node.scene = ''; break;
      case 'ending': node.endingId = newId('end'); node.endingTitle = '新的结局'; node.endingKind = 'normal'; break;
      case 'script': node.lang = 'javascript'; node.code = '// 可用变量：moovn.vars / moovn.state\n'; break;
      case 'wait': node.ms = 800; break;
      default: break;
    }
  }

  /* ================= 节点面板 ================= */
  openPalette(sx: number, sy: number, atCursor: boolean): void {
    this.closePalette();
    const pal = document.createElement('div');
    pal.className = 'ed-palette';
    const types: FlowNodeType[] = [
      'dialogue', 'narration', 'choice', 'branch',
      'character', 'background', 'bgm', 'sfx',
      'setvar', 'script', 'jump', 'ending',
      'wait', 'start'
    ];
    for (const t of types) {
      const b = document.createElement('button');
      b.type = 'button';
      b.innerHTML = `<span class="pdot" style="background:${NODE_TYPE_COLORS[t]}"></span>${NODE_TYPE_LABELS[t]}`;
      b.addEventListener('click', () => {
        let wx = 300, wy = 300;
        if (atCursor) {
          const wr = this.world.getBoundingClientRect();
          wx = Math.round(((sx + 160 - wr.left) / this.t.k) / 10) * 10;
          wy = Math.round(((sy + 60 - wr.top) / this.t.k) / 10) * 10;
        }
        this.closePalette();
        this.addNode(t, wx, wy);
      });
      pal.appendChild(b);
    }
    pal.style.left = `${Math.max(4, sx)}px`;
    pal.style.top = `${Math.max(4, sy)}px`;
    this.viewport.parentElement?.appendChild(pal);
    this.palette = pal;
    const close = (ev: MouseEvent) => {
      if (!pal.contains(ev.target as Node)) this.closePalette();
    };
    setTimeout(() => document.addEventListener('mousedown', close), 0);
    pal.dataset.closeBound = '1';
    this.paletteClose = close;
  }
  private paletteClose: ((ev: MouseEvent) => void) | null = null;

  closePalette(): void {
    this.palette?.remove();
    this.palette = null;
    if (this.paletteClose) {
      document.removeEventListener('mousedown', this.paletteClose);
      this.paletteClose = null;
    }
  }

  /* ================= 自动布局 ================= */
  autoLayout(): void {
    const scene = this.ctx.getScene();
    if (!scene) return;
    const COL = 300, ROW = 150;
    const start = scene.flow.find((n) => n.type === 'start') ?? scene.flow[0];
    if (!start) return;
    const visited = new Set<string>();
    const queue: Array<{ n: FlowNode; col: number; row: number }> = [{ n: start, col: 0, row: 0 }];
    const rowCounter = new Map<number, number>();
    while (queue.length) {
      const { n, col } = queue.shift()!;
      if (visited.has(n.id)) continue;
      visited.add(n.id);
      const row = rowCounter.get(col) ?? 0;
      rowCounter.set(col, row + 1);
      n.x = 140 + col * COL;
      n.y = 120 + row * ROW + (col % 2) * 24;
      const targets: Array<string | null | undefined> = [n.next, n.true, n.false, ...(n.options ?? []).map((o) => o.next)];
      let branchRow = row;
      for (const t of targets) {
        if (!t) continue;
        const tn = scene.flow.find((x) => x.id === t);
        if (tn && !visited.has(tn.id)) {
          queue.push({ n: tn, col: col + 1, row: branchRow++ });
        }
      }
    }
    // 未连接的节点放在底部
    let orphanRow = 0;
    for (const n of scene.flow) {
      if (!visited.has(n.id)) {
        n.x = 140 + orphanRow * 60;
        n.y = 1500 + orphanRow * 120;
        orphanRow++;
      }
    }
    this.ctx.commit();
    this.render();
  }

  focusNode(id: string): void {
    const scene = this.ctx.getScene();
    const n = scene?.flow.find((x) => x.id === id);
    if (!n) return;
    const r = this.viewport.getBoundingClientRect();
    this.t.x = r.width / 2 - (n.x ?? 0) * this.t.k - NODE_W / 2;
    this.t.y = r.height / 2 - (n.y ?? 0) * this.t.k - HEAD_H;
    this.applyTransform();
  }

  /* ================= 渲染 ================= */
  render(): void {
    const scene = this.ctx.getScene();
    this.svg.innerHTML = '';
    // 清除旧节点
    for (const el of [...this.world.querySelectorAll('.ed-node')]) el.remove();
    if (!scene) return;

    for (const node of scene.flow) {
      this.world.appendChild(this.buildNodeEl(node));
    }
    this.renderEdges();
  }

  private buildNodeEl(node: FlowNode): HTMLElement {
    const el = document.createElement('div');
    el.className = 'ed-node' + (this.ctx.selectedNodeId === node.id ? ' selected' : '');
    el.dataset.nodeId = node.id;
    el.style.left = `${node.x ?? 0}px`;
    el.style.top = `${node.y ?? 0}px`;

    const head = document.createElement('div');
    head.className = 'ed-node-head';
    head.innerHTML = `<span class="dot" style="background:${NODE_TYPE_COLORS[node.type]}"></span><span>${NODE_TYPE_LABELS[node.type]}</span><span class="nid">${node.id}</span>`;
    el.appendChild(head);

    const body = document.createElement('div');
    body.className = 'ed-node-body';
    this.fillNodeBody(body, node);
    el.appendChild(body);

    // 入口端口
    if (node.type !== 'start') {
      const p = document.createElement('div');
      p.className = 'ed-port in';
      p.dataset.port = `${node.id}:in:`;
      p.title = '入口';
      el.appendChild(p);
    }
    // 出口端口
    const outAt = (cls: string, key: string, title: string, top?: number) => {
      const p = document.createElement('div');
      p.className = `ed-port ${cls}`;
      p.dataset.port = key;
      p.title = title;
      if (top !== undefined) p.style.top = `${top}px`;
      el.appendChild(p);
    };
    if (this.canChain(node) || node.type === 'start') {
      outAt('out', `${node.id}:out:`, '后继');
    }
    return el;
  }

  private fillNodeBody(body: HTMLElement, node: FlowNode): void {
    const nameOf = (id?: string) => (id ? this.ctx.characterName(id) : '');
    switch (node.type) {
      case 'start':
        body.innerHTML = `<b>场景入口</b>`;
        break;
      case 'dialogue':
        body.innerHTML = `<b>${escapeHtml(nameOf(node.character)) || '—'}</b><br>${escapeHtml((node.text ?? '').slice(0, 60) || '（空）')}`;
        break;
      case 'narration':
        body.textContent = (node.text ?? '').slice(0, 64) || '（空旁白）';
        break;
      case 'choice':
        body.innerHTML = (node.options ?? []).map((o, i) => `
          <div class="ed-node-opt" style="position:relative">
            <span style="color:${NODE_TYPE_COLORS.choice}">${i + 1}.</span>
            <span>${escapeHtml(o.text || '（空选项）')}</span>
            <div class="ed-port opt-out" data-port="${node.id}:opt:${i}" title="选项${i + 1}后继" style="right:-17px"></div>
          </div>`).join('');
        break;
      case 'branch':
        body.innerHTML = `
          <div style="font-family:ui-monospace,monospace;font-size:11px;margin-bottom:5px">${escapeHtml(node.condition ?? '')}</div>
          <div class="ed-node-opt" style="position:relative"><span style="color:#3fae6a">✓ 成立</span><div class="ed-port opt-out" data-port="${node.id}:opt:0" title="成立后继" style="right:-17px"></div></div>
          <div class="ed-node-opt" style="position:relative"><span style="color:#c96a5a">✗ 不成立</span><div class="ed-port opt-out" data-port="${node.id}:opt:1" title="不成立后继" style="right:-17px"></div></div>`;
        break;
      case 'setvar':
        body.innerHTML = `<b>${escapeHtml(node.target || '—')}</b> ${node.op ?? 'set'} ${escapeHtml(String(node.value ?? ''))}`;
        break;
      case 'background':
        body.textContent = node.asset || '（未设置）';
        break;
      case 'bgm':
      case 'sfx':
        body.textContent = node.asset || '（未设置）';
        break;
      case 'character':
        body.innerHTML = `<b>${escapeHtml(node.action ?? '')}</b> ${escapeHtml(nameOf(node.ref) || node.ref || '—')}${node.position !== undefined ? ` @ ${typeof node.position === 'number' ? node.position : node.position}` : ''}`;
        break;
      case 'jump':
        body.innerHTML = `→ <b>${escapeHtml(node.scene ? this.ctx.sceneTitle(node.scene) + ` (${node.scene})` : '（未设置）')}</b>`;
        break;
      case 'ending':
        body.innerHTML = `<b>${escapeHtml(node.endingTitle ?? '')}</b><br>Kind: ${escapeHtml(node.endingKind ?? 'normal')}`;
        break;
      case 'script':
        body.innerHTML = `<b>${escapeHtml((node.lang ?? 'javascript').toUpperCase())}</b><br>${escapeHtml((node.code ?? '').split('\n').find((l) => l.trim() && !l.trim().startsWith('//') && !l.trim().startsWith('--')) ?? '')}`;
        break;
      case 'wait':
        body.textContent = `${node.ms ?? 0} ms`;
        break;
    }
  }

  /* ================= 边渲染 ================= */
  private scheduleEdgeRender(): void {
    if (this.rafPending) return;
    this.rafPending = true;
    requestAnimationFrame(() => {
      this.rafPending = false;
      this.renderEdges();
    });
  }

  private renderEdges(): void {
    const scene = this.ctx.getScene();
    this.svg.innerHTML = '';
    if (!scene) return;
    for (const node of scene.flow) {
      // 主后继
      if (node.next) {
        const target = scene.flow.find((n) => n.id === node.next);
        if (target) this.drawEdge(node.id, target.id, 'next', '');
        else if (this.isSceneRef(node.next)) this.drawSceneEdge(node.id, node.next);
      }
      // 分支
      if (node.type === 'branch') {
        if (node.true) {
          const t = scene.flow.find((n) => n.id === node.true);
          if (t) this.drawEdge(node.id, t.id, 'true', '成立');
          else if (this.isSceneRef(node.true)) this.drawSceneEdge(node.id, node.true, '成立');
        }
        if (node.false) {
          const f = scene.flow.find((n) => n.id === node.false);
          if (f) this.drawEdge(node.id, f.id, 'false', '不成立');
          else if (this.isSceneRef(node.false)) this.drawSceneEdge(node.id, node.false, '不成立');
        }
      }
      // 选项
      (node.options ?? []).forEach((o, i) => {
        if (!o.next) return;
        const t = scene.flow.find((n) => n.id === o.next);
        if (t) this.drawEdge(node.id, t.id, `opt:${i}`, o.text.slice(0, 8));
        else if (o.scene) this.drawSceneEdge(node.id, o.scene, o.text.slice(0, 8));
      });
    }
    // 场景跳转虚拟节点（jump / choice 的 scene 目标）
    for (const node of scene.flow) {
      if (node.type === 'jump' && node.scene) this.drawSceneEdge(node.id, node.scene, '');
    }
  }

  private isSceneRef(s: string | null | undefined): boolean {
    return !!s && !!this.ctx.getScene && !!this.ctx.sceneTitle(s);
  }

  private anchor(id: string, kind: 'in' | 'out' | 'opt', optIdx?: number): { x: number; y: number } | null {
    const key = kind === 'opt' ? `${id}:opt:${optIdx}` : `${id}:${kind}:`;
    const el = this.world.querySelector(`[data-port="${CSS.escape(key)}"]`) as HTMLElement | null;
    const nodeEl = this.world.querySelector(`[data-node-id="${CSS.escape(id)}"]`) as HTMLElement | null;
    if (!nodeEl) return null;
    const wr = this.world.getBoundingClientRect();
    if (el) {
      const r = el.getBoundingClientRect();
      return { x: (r.left + r.width / 2 - wr.left) / this.t.k, y: (r.top + r.height / 2 - wr.top) / this.t.k };
    }
    // 选项端口可能未渲染（例如渲染时机）→ 回退到节点右缘
    const nr = nodeEl.getBoundingClientRect();
    const y = kind === 'in' ? (nr.top + nr.height / 2 - wr.top) / this.t.k : (nr.top + 24 - wr.top) / this.t.k;
    return { x: ((kind === 'in' ? nr.left : nr.right) - wr.left) / this.t.k, y };
  }

  private drawEdge(fromId: string, toId: string, key: string, label: string): void {
    const a = this.anchor(fromId, key.startsWith('opt') ? 'opt' : 'out', key.startsWith('opt') ? Number(key.slice(4)) : undefined);
    const b = this.anchor(toId, 'in');
    if (!a || !b) return;
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.classList.add('ed-edge');
    if (key === 'true') g.classList.add('branch-true');
    if (key === 'false') g.classList.add('branch-false');
    if (this.selectedEdge && this.selectedEdge.from === fromId && this.selectedEdge.to === toId && this.selectedEdge.key === key) {
      g.classList.add('selected');
    }
    g.dataset.edge = `${fromId}>${toId}>${key}`;
    const dx = Math.max(46, Math.abs(b.x - a.x) * 0.45);
    const d = `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`;
    g.innerHTML = `
      <path class="hit" d="${d}"></path>
      <path class="line" d="${d}"></path>
      ${label ? `<text class="label" x="${(a.x + b.x) / 2}" y="${(a.y + b.y) / 2 - 6}" text-anchor="middle">${escapeHtml(label)}</text>` : ''}
    `;
    g.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      this.removeEdge({ from: fromId, to: toId, key });
    });
    this.svg.appendChild(g);
  }

  /** 跳转到其他场景的虚线边（连到画布右侧的场景标记） */
  private drawSceneEdge(fromId: string, sceneId: string, label = ''): void {
    const a = this.anchor(fromId, 'out');
    if (!a) return;
    const b = { x: a.x + 180, y: a.y - 40 };
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.classList.add('ed-edge');
    const d = `M ${a.x} ${a.y} C ${a.x + 80} ${a.y}, ${b.x - 60} ${b.y}, ${b.x} ${b.y}`;
    g.innerHTML = `
      <path class="hit" d="${d}"></path>
      <path class="line" d="${d}" stroke-dasharray="6 5"></path>
      <text class="label" x="${b.x + 6}" y="${b.y + 4}">→ ${escapeHtml(this.ctx.sceneTitle(sceneId) || sceneId)}</text>
    `;
    this.svg.appendChild(g);
  }

  private drawLinkGhost(cx: number, cy: number): void {
    this.ghostRemove();
    const a = this.anchor(this.linking!.fromId, this.linking!.optIdx !== null ? 'opt' : 'out', this.linking!.optIdx ?? undefined);
    if (!a) return;
    const wr = this.world.getBoundingClientRect();
    const bx = (cx - wr.left) / this.t.k;
    const by = (cy - wr.top) / this.t.k;
    const ghost = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    ghost.setAttribute('class', 'line');
    ghost.setAttribute('stroke', 'var(--ed-accent)');
    ghost.setAttribute('stroke-width', '2.4');
    ghost.setAttribute('fill', 'none');
    ghost.setAttribute('d', `M ${a.x} ${a.y} C ${a.x + 60} ${a.y}, ${bx - 60} ${by}, ${bx} ${by}`);
    this.svg.appendChild(ghost);
    this.linking!.ghost = ghost;
  }

  private ghostRemove(): void {
    this.linking?.ghost?.remove();
  }

  destroy(): void {
    this.closePalette();
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}
