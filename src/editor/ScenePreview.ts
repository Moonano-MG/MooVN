import type { Project, Scene, SceneCharacterState } from '../common/types';
import type { RuntimeCharacter } from '../engine/states';
import { Assets } from '../engine/assets';
import { Stage } from '../engine/renderer/Stage';

export interface ScenePreviewCtx {
  getProject(): Project;
  getScene(): Scene | null;
  /** 站位被拖拽修改后回调 */
  onSceneChanged(): void;
}

/**
 * 场景可视化编辑器：
 * - 以运行时渲染器实时呈现 背景 + 角色站位
 * - 直接拖拽角色调整水平位置（自动吸附 左/中/右）
 * - 详细的站位/表情/明暗在右侧检查器中调整
 */
export class ScenePreview {
  private host: HTMLElement;
  private ctx: ScenePreviewCtx;
  private stage: Stage | null = null;
  private dragRef: string | null = null;
  private destroyed = false;
  private hint: HTMLElement;

  constructor(host: HTMLElement, ctx: ScenePreviewCtx) {
    this.host = host;
    this.ctx = ctx;
    host.innerHTML = `
      <div class="ed-scene-host"></div>
      <div class="ed-scene-toolbar">
        <span>🖱️ 拖动角色调整站位（自动吸附 左 / 中 / 右）</span>
      </div>
    `;
    this.hint = host.querySelector('.ed-scene-toolbar span')!;
    const canvasHost = host.querySelector('.ed-scene-host') as HTMLElement;

    const project = ctx.getProject();
    this.stage = new Stage(project, new Assets(), canvasHost);
    void this.stage.init().then(() => {
      if (this.destroyed) return;
      this.stage!.app.canvas.addEventListener('pointerdown', (ev) => this.onDown(ev));
      window.addEventListener('pointermove', this.onMove);
      window.addEventListener('pointerup', this.onUp);
      void this.refresh();
    });
  }

  async refresh(): Promise<void> {
    const scene = this.ctx.getScene();
    if (!this.stage || !scene) return;
    await this.stage.setBackground(scene.background ?? '', 0);
    const rts = scene.characters.map(scToRt);
    await this.stage.syncCharacters(rts);
  }

  private toWorldX(e: PointerEvent): number {
    const canvas = this.stage!.app.canvas;
    const r = canvas.getBoundingClientRect();
    return (e.clientX - r.left) / r.width;
  }

  private pickRef(x: number): string | null {
    const scene = this.ctx.getScene();
    if (!scene) return null;
    let best: { ref: string; d: number } | null = null;
    for (const c of scene.characters) {
      if (c.visible === false) continue;
      const px = typeof c.position === 'number' ? c.position : { left: 0.26, center: 0.5, right: 0.74 }[c.position] ?? 0.5;
      const d = Math.abs(px - x);
      if (d < 0.16 && (!best || d < best.d)) best = { ref: c.ref, d };
    }
    return best?.ref ?? null;
  }

  private onDown = (ev: PointerEvent): void => {
    const x = this.toWorldX(ev);
    const ref = this.pickRef(x);
    if (ref) {
      this.dragRef = ref;
      this.hint.textContent = `正在拖动：${ref}`;
    }
  };

  private onMove = (ev: PointerEvent): void => {
    if (!this.dragRef || !this.stage) return;
    const scene = this.ctx.getScene();
    const c = scene?.characters.find((s) => s.ref === this.dragRef);
    if (!c) return;
    const x = Math.min(0.96, Math.max(0.04, this.toWorldX(ev)));
    c.position = snapX(x);
    this.ctx.onSceneChanged();
  };

  private onUp = (): void => {
    if (this.dragRef) {
      this.dragRef = null;
      this.hint.textContent = '🖱️ 拖动角色调整站位（自动吸附 左 / 中 / 右）';
      this.ctx.onSceneChanged();
    }
  };

  destroy(): void {
    this.destroyed = true;
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
    this.stage?.destroy();
    this.stage = null;
    this.host.innerHTML = '';
  }
}

export function scToRt(sc: SceneCharacterState): RuntimeCharacter {
  return {
    ref: sc.ref,
    position: typeof sc.position === 'number' ? sc.position : ({ left: 0.26, center: 0.5, right: 0.74 } as Record<string, number>)[sc.position] ?? 0.5,
    y: sc.y ?? 0,
    expression: sc.expression ?? '',
    visible: sc.visible !== false,
    dim: sc.dim ?? false,
    scale: sc.scale ?? 1
  };
}

/** 吸附到 左/中/右 预设，否则返回两位小数 */
export function snapX(x: number): SceneCharacterState['position'] {
  for (const [v, label] of [[0.26, 'left'], [0.5, 'center'], [0.74, 'right']] as const) {
    if (Math.abs(x - v) < 0.045) return label;
  }
  return Math.round(x * 100) / 100;
}
