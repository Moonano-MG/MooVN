import { Application, Container, Sprite, Texture, Ticker } from 'pixi.js';
import type { Project, CharacterDef } from '../../common/types';
import type { RuntimeCharacter } from '../states';
import { Assets } from '../assets';

/** 轻量补间 */
interface TweenTask {
  target: Record<string, number>;
  props: Record<string, number>;
  from: Record<string, number>;
  start: number;
  ms: number;
  done?: () => void;
}

function tween(ticker: Ticker, target: Record<string, number>, props: Record<string, number>, ms: number, done?: () => void): void {
  const from: Record<string, number> = {};
  for (const k of Object.keys(props)) from[k] = target[k] ?? 0;
  const task: TweenTask = { target, props, from, start: performance.now(), ms, done };
  const fn = (tickerFn: Ticker) => {
    const t = Math.min(1, (performance.now() - task.start) / task.ms);
    const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; // easeInOut
    for (const k of Object.keys(task.props)) {
      task.target[k] = task.from[k] + (task.props[k] - task.from[k]) * e;
    }
    if (t >= 1) {
      tickerFn.remove(fn);
      task.done?.();
    }
  };
  ticker.add(fn);
}

export const PRESET_X: Record<string, number> = { left: 0.26, center: 0.5, right: 0.74 };

interface CharSprite {
  container: Container;
  sprite: Sprite;
  ref: string;
  exprKey: string;
  fading: boolean;
}

/**
 * 舞台渲染器：背景层 + 立绘层（Pixi）。
 * UI（对话框/按钮）由 DOM 层负责。
 */
export class Stage {
  app: Application;
  private bgBack!: Sprite;
  private bgFront!: Sprite;
  private charLayer = new Container();
  private sprites = new Map<string, CharSprite>();
  private project: Project;
  private assets: Assets;
  private container: HTMLElement;
  private currentBg = '';
  destroyed = false;

  constructor(project: Project, assets: Assets, container: HTMLElement) {
    this.project = project;
    this.assets = assets;
    this.container = container;
    this.app = new Application();
  }

  async init(): Promise<void> {
    await this.app.init({
      resizeTo: this.container,
      background: '#05080f',
      antialias: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true
    });
    if (this.destroyed) return;
    this.container.appendChild(this.app.canvas);
    this.app.canvas.style.display = 'block';
    this.app.canvas.style.width = '100%';
    this.app.canvas.style.height = '100%';

    this.bgBack = new Sprite(Texture.WHITE);
    this.bgFront = new Sprite(Texture.WHITE);
    for (const s of [this.bgBack, this.bgFront]) {
      s.width = 2000;
      s.height = 2000;
      this.app.stage.addChild(s);
    }
    this.bgFront.alpha = 0;
    this.app.stage.addChild(this.charLayer);
  }

  private layoutBg(s: Sprite): void {
    const w = this.app.renderer.width / this.app.renderer.resolution;
    const h = this.app.renderer.height / this.app.renderer.resolution;
    const tex = s.texture;
    if (!tex || tex === Texture.WHITE) {
      s.width = w;
      s.height = h;
      return;
    }
    const scale = Math.max(w / tex.width, h / tex.height);
    s.width = tex.width * scale;
    s.height = tex.height * scale;
    s.x = (w - s.width) / 2;
    s.y = (h - s.height) / 2;
  }

  private relayout(): void {
    this.layoutBg(this.bgBack);
    this.layoutBg(this.bgFront);
    for (const cs of this.sprites.values()) this.layoutChar(cs);
  }

  /** 设置背景图，带淡入淡出交叉过渡 */
  async setBackground(path: string, fadeMs = 600): Promise<void> {
    if (path === this.currentBg) return;
    this.currentBg = path;
    if (!path) {
      this.bgFront.texture = Texture.WHITE;
      this.bgFront.tint = 0x05080f;
      this.bgFront.alpha = 1;
      this.layoutBg(this.bgFront);
      return;
    }
    const img = await this.assets.loadImage(path);
    if (this.destroyed) return;
    if (!img) {
      // 加载失败：深蓝底
      this.bgFront.texture = Texture.WHITE;
      this.bgFront.tint = 0x0a1a33;
      this.bgFront.alpha = 1;
      this.layoutBg(this.bgFront);
      return;
    }
    const tex = Texture.from(img);
    this.bgBack.texture = this.bgFront.texture;
    this.bgBack.tint = this.bgFront.tint;
    this.bgBack.alpha = this.bgFront.alpha > 0 ? 1 : 0;
    this.layoutBg(this.bgBack);

    this.bgFront.texture = tex;
    this.bgFront.tint = 0xffffff;
    this.bgFront.alpha = 0;
    this.layoutBg(this.bgFront);
    tween(this.app.ticker, this.bgFront as unknown as Record<string, number>, { alpha: 1 }, fadeMs);
  }

  private findDef(ref: string): CharacterDef | undefined {
    return this.project.characters.find((c) => c.id === ref);
  }

  private resolveSpritePath(def: CharacterDef, expression: string): string {
    const raw = def.sprite ?? `characters/${def.id}.jpg`;
    // 相对路径自动补 assetsRoot（背景图等写全路径的不受影响）
    const base = /^(https?:|data:|blob:|\.\.?\/|\/)\S*/.test(raw) || raw.startsWith(`${this.project.assetsRoot ?? 'assets'}/`)
      ? raw
      : `${this.project.assetsRoot ?? 'assets'}/${raw}`;
    if (expression) {
      const dot = base.lastIndexOf('.');
      return `${base.slice(0, dot)}-${expression}${base.slice(dot)}`;
    }
    return base;
  }

  private async buildSprite(rt: RuntimeCharacter): Promise<CharSprite | null> {
    const def = this.findDef(rt.ref);
    if (!def) return null;
    let canvas = await this.assets.loadKeyedSprite(this.resolveSpritePath(def, rt.expression || ''));
    if (this.destroyed) return null;
    let exprKey = rt.expression || '';
    if (!canvas && exprKey) {
      canvas = await this.assets.loadKeyedSprite(def.sprite ?? `characters/${def.id}.jpg`);
      exprKey = '';
    }
    if (!canvas) return null;
    const sprite = new Sprite(Texture.from(canvas));
    sprite.anchor.set(0.5, 1);
    const container = new Container();
    container.addChild(sprite);
    container.alpha = 0;
    this.charLayer.addChild(container);
    return { container, sprite, ref: rt.ref, exprKey, fading: false };
  }

  private layoutChar(cs: CharSprite, rt?: RuntimeCharacter): void {
    const state = rt ?? this.currentStateOf(cs.ref);
    const w = this.app.renderer.width / this.app.renderer.resolution;
    const h = this.app.renderer.height / this.app.renderer.resolution;
    const tex = cs.sprite.texture;
    if (!tex) return;
    const fitH = h * 0.86;
    const scale = Math.min(fitH / tex.height, (w * 0.42) / tex.width) * (state?.scale ?? 1);
    cs.sprite.scale.set(scale);
    cs.container.x = w * (state?.position ?? 0.5);
    cs.container.y = h * 0.995 + h * (state?.y ?? 0);
  }

  private currentStateOf(ref: string): RuntimeCharacter | undefined {
    return this._lastSync.find((c) => c.ref === ref);
  }
  private _lastSync: RuntimeCharacter[] = [];

  /** 按运行时角色状态同步立绘（增删/移动/表情差分/明暗） */
  async syncCharacters(chars: RuntimeCharacter[]): Promise<void> {
    this._lastSync = chars.map((c) => ({ ...c }));
    const w = this.app.renderer.width / this.app.renderer.resolution;
    const h = this.app.renderer.height / this.app.renderer.resolution;

    // 移除已消失的角色
    for (const [ref, cs] of [...this.sprites.entries()]) {
      const rt = chars.find((c) => c.ref === ref);
      if (!rt || !rt.visible) {
        this.sprites.delete(ref);
        tween(this.app.ticker, cs.container as unknown as Record<string, number>, { alpha: 0 }, 260, () => {
          cs.container.destroy({ children: true });
        });
      }
    }

    for (const rt of chars) {
      if (!rt.visible) continue;
      let cs: CharSprite | null | undefined = this.sprites.get(rt.ref);
      if (!cs) {
        cs = await this.buildSprite(rt);
        if (!cs) continue;
        this.sprites.set(rt.ref, cs);
        cs.container.x = w * rt.position;
        cs.container.y = h * 0.995 + h * rt.y;
        tween(this.app.ticker, cs.container as unknown as Record<string, number>, { alpha: rt.dim ? 0.62 : 1 }, 320);
      } else {
        // 表情差分切换
        const wantExpr = rt.expression || '';
        if (wantExpr !== cs.exprKey) {
          const def = this.findDef(rt.ref);
          if (def) {
            const canvas = await this.assets.loadKeyedSprite(this.resolveSpritePath(def, wantExpr));
            if (canvas && !this.destroyed) {
              cs.sprite.texture = Texture.from(canvas);
              cs.exprKey = wantExpr;
            } else {
              cs.exprKey = '';
            }
          }
        }
        tween(this.app.ticker, cs.container as unknown as Record<string, number>, { x: w * rt.position, y: h * 0.995 + h * rt.y }, 360);
      }
      this.layoutChar(cs, rt);
      cs.container.alpha = rt.dim ? 0.62 : 1;
      // 立绘超出底部时按 fitH 计算好的 scale 直接使用
    }
  }

  /** 强调说话角色 */
  setSpeaking(ref: string | null): void {
    for (const [r, cs] of this.sprites.entries()) {
      const rt = this.currentStateOf(r);
      const dim = rt?.dim ?? false;
      const speaking = ref !== null && r === ref;
      cs.container.alpha = speaking ? 1 : dim ? 0.55 : 0.82;
    }
  }

  /** 捕获舞台缩略图（存档用），返回 dataURL */
  thumbnail(): string {
    try {
      const raw = this.app.renderer.extract.canvas(this.app.stage) as HTMLCanvasElement;
      const src = raw instanceof HTMLCanvasElement ? raw : (raw as unknown as { getContext: () => CanvasRenderingContext2D });
      const out = document.createElement('canvas');
      out.width = 256;
      out.height = 144;
      const ctx = out.getContext('2d')!;
      ctx.fillStyle = '#05080f';
      ctx.fillRect(0, 0, out.width, out.height);
      const iw = (src as HTMLCanvasElement).width ?? 0;
      const ih = (src as HTMLCanvasElement).height ?? 0;
      if (iw && ih) ctx.drawImage(src as CanvasImageSource, 0, 0, iw, ih, 0, 0, out.width, out.height);
      return out.toDataURL('image/jpeg', 0.72);
    } catch (err) {
      console.warn('[MooVN] 缩略图生成失败:', err);
      return '';
    }
  }

  destroy(): void {
    this.destroyed = true;
    try {
      this.app.destroy(true, { children: true, texture: false });
    } catch {
      /* ignore */
    }
  }
}
