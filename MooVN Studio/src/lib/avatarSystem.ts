/**
 * MooVN Avatar System (`avatarSystem.ts`)
 *
 * Explicit capability levels (see README & Section 9 spec):
 * - `L0_STATIC`: Single flat image (`baseTexture` only, no `eyes_closed` / `mouth_talk_*` layer textures).
 *   Does NOT pretend to blink or lip-sync; reports missing layer warnings via `getMissingLayerWarnings()`.
 * - `L1_LAYERED`: Multi-layer static parts (`hair_back`, `body`, `eyes_open`, `eyes_closed`,
 *   `mouth_neutral`, `mouth_talk_a`, `mouth_talk_b`, `brow_neutral`, `brow_angry`, `brow_sad`,
 *   `blush`, `hair_front`). Supports independent blink (2.0–6.0s interval, 90–140ms close),
 *   text-linked lip-sync (120ms cadence while dialogue is printing), and optional bottom-anchored
 *   body breathing (`scaleY: 1.0 -> 1.0075 -> 1.0`, period 4.2s).
 * - `L2_LIVE2D`: External Live2D Cubism / Spine backend registered via `registerLive2DBackend`.
 *   Never silently falls back to a static image when unconfigured (`isLive2DBackendRegistered()`).
 */

export type AvatarBackendKind = 'image' | 'live2d';

export type AvatarCapabilityLevel = 'L0_STATIC' | 'L1_LAYERED' | 'L2_LIVE2D';

export type AvatarLayerId =
  | 'hair_back'
  | 'body'
  | 'eyes_open'
  | 'eyes_closed'
  | 'mouth_neutral'
  | 'mouth_talk_a'
  | 'mouth_talk_b'
  | 'brow_neutral'
  | 'brow_angry'
  | 'brow_sad'
  | 'blush'
  | 'hair_front';

export const ALL_AVATAR_LAYER_IDS: AvatarLayerId[] = [
  'hair_back',
  'body',
  'eyes_open',
  'eyes_closed',
  'mouth_neutral',
  'mouth_talk_a',
  'mouth_talk_b',
  'brow_neutral',
  'brow_angry',
  'brow_sad',
  'blush',
  'hair_front',
];

export type SingleShotMotionId =
  | 'none'
  | 'enter_fade'
  | 'enter_up_fade'
  | 'enter_left_fade'
  | 'enter_right_fade';

export interface AvatarViewport {
  width: number;
  height: number;
  dpr?: number;
}

export interface NormalizedPlacement {
  nx: number;
  ny: number;
  scale: number;
}

export interface ComputedViewportRect {
  anchorX: number;
  anchorY: number;
  scale: number;
  viewportWidth: number;
  viewportHeight: number;
  dpr: number;
}

export class AvatarLayer {
  public readonly id: AvatarLayerId;
  public visible: boolean;
  public offsetX: number = 0;
  public offsetY: number = 0;
  public scaleX: number = 1;
  public scaleY: number = 1;
  public rotationDeg: number = 0;
  public opacity: number = 1;
  public zOrder: number;
  public texture: string | null;

  constructor(
    id: AvatarLayerId,
    zOrder: number,
    visible = true,
    texture: string | null = null
  ) {
    this.id = id;
    this.zOrder = zOrder;
    this.visible = visible;
    this.texture = texture;
  }

  public setVisible(v: boolean): void {
    this.visible = Boolean(v);
  }

  public setOffset(x: number, y: number): void {
    this.offsetX = Number.isFinite(x) ? x : 0;
    this.offsetY = Number.isFinite(y) ? y : 0;
  }

  public setScale(sx: number, sy: number): void {
    this.scaleX = Number.isFinite(sx) ? sx : 1;
    this.scaleY = Number.isFinite(sy) ? sy : 1;
  }

  public setRotation(deg: number): void {
    this.rotationDeg = Number.isFinite(deg) ? deg : 0;
  }

  public setTexture(tex: string | null): void {
    this.texture = tex;
  }
}

export interface ParsedExpressionRule {
  name: string;
  eyes?: 'open' | 'closed';
  mouth?: 'neutral' | 'talk_a' | 'talk_b';
  brow?: 'neutral' | 'angry' | 'sad';
  blush?: boolean;
  spriteTexture?: string;
}

export type ExpressionSpecInput =
  | string
  | Partial<Omit<ParsedExpressionRule, 'name'>>;

export interface IAvatarRenderable {
  getKind(): AvatarBackendKind;
  getCapabilityLevel(): AvatarCapabilityLevel;
  hasLayeredParts(): boolean;
  getMissingLayerWarnings(): string[];
  defineExpression(name: string, spec: ExpressionSpecInput): void;
  setExpression(name: string): void;
  getCurrentExpression(): string;
  setMotion(name: SingleShotMotionId | string): void;
  getCurrentMotion(): SingleShotMotionId;
  setParameter(name: string, value: number): void;
  getParameter(name: string): number;
  setTalking(talking: boolean): void;
  setBreathingEnabled(enabled: boolean): void;
  setBlinkEnabled(enabled: boolean): void;
  setNormalizedPosition(nx: number, ny: number, scale?: number): void;
  relayout(viewport: AvatarViewport): ComputedViewportRect;
  update(dtSeconds: number): void;
  getLayer(id: AvatarLayerId): AvatarLayer;
  getAllLayers(): Record<AvatarLayerId, AvatarLayer>;
  getCrossfadeState(): {
    previousTexture: string | null;
    currentTexture: string | null;
    alpha: number;
  };
  getEntranceTransform(): {
    translateX: number;
    translateY: number;
    opacity: number;
    active: boolean;
  };
  isReleased(): boolean;
  release(): void;
}

export interface ImageAvatarOptions {
  baseTexture?: string | null;
  layerTextures?: Partial<Record<AvatarLayerId, string | null>>;
  breathingEnabled?: boolean;
  blinkEnabled?: boolean;
  randomSeed?: () => number;
}

/**
 * Clamps frame delta `dt` into `[0, 0.05]` seconds (max 50ms) so background tab
 * switches or frame drops never cause animation jumps.
 */
export function clampAvatarDelta(dtSeconds: number): number {
  if (!Number.isFinite(dtSeconds) || dtSeconds <= 0) return 0;
  return Math.min(0.05, dtSeconds);
}

/**
 * Converts stage percentage `(0..100)` or normalized `(0..1)` coordinates into
 * clamped normalized coordinates `[0, 1]`.
 */
export function normalizeStageCoordinates(
  xInput: number,
  yInput: number,
  scaleInput = 1
): NormalizedPlacement {
  const nxRaw = xInput > 1.0001 || xInput < -0.0001 ? xInput / 100 : xInput;
  const nyRaw = yInput > 1.0001 || yInput < -0.0001 ? yInput / 100 : yInput;
  return {
    nx: Math.min(1, Math.max(0, Number.isFinite(nxRaw) ? nxRaw : 0.5)),
    ny: Math.min(1, Math.max(0, Number.isFinite(nyRaw) ? nyRaw : 0.85)),
    scale: Math.min(3, Math.max(0.2, Number.isFinite(scaleInput) ? scaleInput : 1)),
  };
}

/**
 * Parses an expression DSL string (`"eyes=closed; mouth=talk_a; brow=angry; blush=1"`)
 * or a structured expression rule object (`Kimi 7F` fixed: only `eyes=closed` closes eyes).
 */
export function parseExpressionSpec(
  name: string,
  spec: ExpressionSpecInput
): ParsedExpressionRule {
  if (typeof spec === 'object' && spec !== null) {
    return {
      name,
      eyes: spec.eyes === 'closed' ? 'closed' : 'open',
      mouth:
        spec.mouth === 'talk_a' || spec.mouth === 'talk_b'
          ? spec.mouth
          : 'neutral',
      brow:
        spec.brow === 'angry' || spec.brow === 'sad'
          ? spec.brow
          : 'neutral',
      blush: Boolean(spec.blush),
      spriteTexture: spec.spriteTexture,
    };
  }
  const rule: ParsedExpressionRule = { name };
  const parts = String(spec)
    .split(/[;,]/)
    .map((s) => s.trim())
    .filter(Boolean);

  for (const part of parts) {
    const eqIdx = part.indexOf('=');
    if (eqIdx === -1) continue;
    const key = part.slice(0, eqIdx).trim().toLowerCase();
    const val = part.slice(eqIdx + 1).trim();
    const valLower = val.toLowerCase();

    if (key === 'eyes') {
      rule.eyes = valLower === 'closed' ? 'closed' : 'open';
    } else if (key === 'mouth') {
      if (valLower === 'talk_a' || valLower === 'talk_b') {
        rule.mouth = valLower;
      } else {
        rule.mouth = 'neutral';
      }
    } else if (key === 'brow') {
      if (valLower === 'angry' || valLower === 'sad') {
        rule.brow = valLower;
      } else {
        rule.brow = 'neutral';
      }
    } else if (key === 'blush') {
      rule.blush = valLower === '1' || valLower === 'true' || valLower === 'yes';
    } else if (key === 'texture' || key === 'sprite') {
      rule.spriteTexture = val;
    }
  }
  return rule;
}

export class ImageAvatar implements IAvatarRenderable {
  private readonly layers: Record<AvatarLayerId, AvatarLayer>;
  private readonly expressions: Map<string, ParsedExpressionRule> = new Map();
  private readonly parameters: Map<string, number> = new Map();
  private readonly rng: () => number;

  private currentExpression = 'default';
  private currentMotion: SingleShotMotionId = 'none';
  private motionElapsed = 0;
  private readonly motionDurationSec = 0.22;

  private previousTexture: string | null = null;
  private currentTexture: string | null = null;
  private crossfadeAlpha = 1;
  private readonly crossfadeDurationSec = 0.18;

  // Channel A: Body-only subtle breathing (default: false)
  private breathingEnabled = false;
  private breathElapsed = 0;
  private readonly breathPeriodSec = 4.2;

  // Channel B: Independent random eye blink
  private blinkEnabled = true;
  private blinkTimer = 0;
  private nextBlinkInterval = 3.4;
  private blinkCloseRemaining = 0;
  private eyesForcedClosedByExpr = false;

  // Channel C: Text-linked lip-sync (120ms cadence)
  private isTalking = false;
  private lipSyncTimer = 0;
  private lipSyncStepIndex = 0;
  private readonly lipSyncIntervalSec = 0.12;

  private placement: NormalizedPlacement = { nx: 0.5, ny: 0.85, scale: 1 };
  private viewport: AvatarViewport = { width: 1280, height: 720, dpr: 1 };
  private computedRect: ComputedViewportRect = {
    anchorX: 640,
    anchorY: 612,
    scale: 1,
    viewportWidth: 1280,
    viewportHeight: 720,
    dpr: 1,
  };

  private released = false;

  constructor(options: ImageAvatarOptions = {}) {
    this.rng = options.randomSeed ?? Math.random;
    const baseTex = options.baseTexture ?? null;
    const lt = options.layerTextures ?? {};

    this.currentTexture = baseTex;
    this.breathingEnabled = Boolean(options.breathingEnabled ?? false);
    this.blinkEnabled = options.blinkEnabled !== undefined ? Boolean(options.blinkEnabled) : true;
    this.nextBlinkInterval = this.sampleNextBlinkInterval();

    this.layers = {
      hair_back: new AvatarLayer('hair_back', 10, Boolean(lt.hair_back), lt.hair_back ?? null),
      body: new AvatarLayer('body', 20, true, lt.body ?? baseTex),
      eyes_open: new AvatarLayer('eyes_open', 30, true, lt.eyes_open ?? null),
      eyes_closed: new AvatarLayer('eyes_closed', 31, false, lt.eyes_closed ?? null),
      mouth_neutral: new AvatarLayer('mouth_neutral', 40, true, lt.mouth_neutral ?? null),
      mouth_talk_a: new AvatarLayer('mouth_talk_a', 41, false, lt.mouth_talk_a ?? null),
      mouth_talk_b: new AvatarLayer('mouth_talk_b', 42, false, lt.mouth_talk_b ?? null),
      brow_neutral: new AvatarLayer('brow_neutral', 50, true, lt.brow_neutral ?? null),
      brow_angry: new AvatarLayer('brow_angry', 51, false, lt.brow_angry ?? null),
      brow_sad: new AvatarLayer('brow_sad', 52, false, lt.brow_sad ?? null),
      blush: new AvatarLayer('blush', 60, false, lt.blush ?? null),
      hair_front: new AvatarLayer('hair_front', 70, Boolean(lt.hair_front), lt.hair_front ?? null),
    };

    this.defineExpression('default', 'eyes=open; mouth=neutral; brow=neutral; blush=0');
    this.defineExpression('normal', 'eyes=open; mouth=neutral; brow=neutral; blush=0');
    this.defineExpression('smile', 'eyes=open; mouth=neutral; brow=neutral; blush=0');
    this.defineExpression('blink', 'eyes=closed; mouth=neutral; brow=neutral; blush=0');
    this.defineExpression('shy', 'eyes=open; mouth=neutral; brow=sad; blush=1');
    this.defineExpression('angry', 'eyes=open; mouth=neutral; brow=angry; blush=0');
    this.defineExpression('sad', 'eyes=open; mouth=neutral; brow=sad; blush=0');
    this.defineExpression('surprised', 'eyes=open; mouth=talk_a; brow=neutral; blush=0');
  }

  private sampleNextBlinkInterval(): number {
    return 2.0 + this.rng() * 4.0;
  }

  private sampleBlinkDuration(): number {
    return 0.09 + this.rng() * 0.05;
  }

  public getKind(): AvatarBackendKind {
    return 'image';
  }

  /**
   * Returns true if at least one facial diff layer (`eyes_closed`, `mouth_talk_a`, etc.)
   * has a real bound texture URL.
   */
  public hasLayeredParts(): boolean {
    return Boolean(
      this.layers.eyes_closed.texture ||
        this.layers.mouth_talk_a.texture ||
        this.layers.mouth_talk_b.texture ||
        this.layers.blush.texture ||
        this.layers.hair_front.texture
    );
  }

  public getCapabilityLevel(): AvatarCapabilityLevel {
    return this.hasLayeredParts() ? 'L1_LAYERED' : 'L0_STATIC';
  }

  /**
   * Reports missing layer textures so the Inspector / Preview can display explicit yellow warnings
   * when a character is degraded to `L0_STATIC` (`GPT-17`).
   */
  public getMissingLayerWarnings(): string[] {
    const warnings: string[] = [];
    if (!this.layers.eyes_closed.texture) {
      warnings.push('缺少 eyes_closed 闭眼图层贴图：已禁用眨眼动画（当前为 L0 静态立绘）');
    }
    if (!this.layers.mouth_talk_a.texture) {
      warnings.push('缺少 mouth_talk_a 口型图层贴图：已禁用说话口型切换');
    }
    return warnings;
  }

  public defineExpression(name: string, spec: ExpressionSpecInput): void {
    if (this.released || !name) return;
    const rule = parseExpressionSpec(name.trim(), spec);
    this.expressions.set(name.trim(), rule);
  }

  public setExpression(nameOrTexture: string): void {
    if (this.released || !nameOrTexture) return;
    const trimmed = nameOrTexture.trim();

    const rule = this.expressions.get(trimmed);
    if (rule) {
      this.currentExpression = trimmed;
      this.applyExpressionRule(rule);
      if (rule.spriteTexture && rule.spriteTexture !== this.currentTexture) {
        this.startTextureCrossfade(rule.spriteTexture);
      }
      return;
    }

    if (trimmed !== this.currentTexture) {
      this.currentExpression = trimmed;
      this.startTextureCrossfade(trimmed);
    }
  }

  private startTextureCrossfade(nextTex: string): void {
    if (this.currentTexture && this.currentTexture !== nextTex) {
      this.previousTexture = this.currentTexture;
      this.crossfadeAlpha = 0;
    } else {
      this.previousTexture = null;
      this.crossfadeAlpha = 1;
    }
    this.currentTexture = nextTex;
    this.layers.body.setTexture(nextTex);
  }

  private applyExpressionRule(rule: ParsedExpressionRule): void {
    const eyesMode = rule.eyes ?? 'open';
    this.eyesForcedClosedByExpr = eyesMode === 'closed';
    this.layers.eyes_open.setVisible(!this.eyesForcedClosedByExpr);
    this.layers.eyes_closed.setVisible(this.eyesForcedClosedByExpr);

    const browMode = rule.brow ?? 'neutral';
    this.layers.brow_neutral.setVisible(browMode === 'neutral');
    this.layers.brow_angry.setVisible(browMode === 'angry');
    this.layers.brow_sad.setVisible(browMode === 'sad');

    this.layers.blush.setVisible(Boolean(rule.blush));

    if (!this.isTalking) {
      const mouthMode = rule.mouth ?? 'neutral';
      this.layers.mouth_neutral.setVisible(mouthMode === 'neutral');
      this.layers.mouth_talk_a.setVisible(mouthMode === 'talk_a');
      this.layers.mouth_talk_b.setVisible(mouthMode === 'talk_b');
    }
  }

  public getCurrentExpression(): string {
    return this.currentExpression;
  }

  public setMotion(name: SingleShotMotionId | string): void {
    if (this.released) return;
    const norm = (name || 'none').trim().toLowerCase();
    let mapped: SingleShotMotionId = 'none';
    if (norm === 'fade' || norm === 'enter_fade') {
      mapped = 'enter_fade';
    } else if (norm === 'slide-up' || norm === 'enter_up_fade') {
      mapped = 'enter_up_fade';
    } else if (norm === 'slide-left' || norm === 'enter_left_fade') {
      mapped = 'enter_left_fade';
    } else if (norm === 'slide-right' || norm === 'enter_right_fade') {
      mapped = 'enter_right_fade';
    }
    this.currentMotion = mapped;
    this.motionElapsed = 0;
  }

  public getCurrentMotion(): SingleShotMotionId {
    return this.currentMotion;
  }

  public setParameter(name: string, value: number): void {
    if (this.released) return;
    const safeVal = Number.isFinite(value) ? value : 0;
    this.parameters.set(name, safeVal);

    if (name === 'ParamBreath') {
      const clamped = Math.min(1, Math.max(0, safeVal));
      this.layers.body.setScale(1, 1 + 0.0075 * clamped);
    } else if (name === 'ParamEyeLOpen' || name === 'ParamEyeROpen') {
      const closed = safeVal < 0.25;
      this.layers.eyes_open.setVisible(!closed);
      this.layers.eyes_closed.setVisible(closed);
    } else if (name === 'ParamMouthOpenY') {
      if (safeVal < 0.2) {
        this.layers.mouth_neutral.setVisible(true);
        this.layers.mouth_talk_a.setVisible(false);
        this.layers.mouth_talk_b.setVisible(false);
      } else if (safeVal < 0.65) {
        this.layers.mouth_neutral.setVisible(false);
        this.layers.mouth_talk_a.setVisible(true);
        this.layers.mouth_talk_b.setVisible(false);
      } else {
        this.layers.mouth_neutral.setVisible(false);
        this.layers.mouth_talk_a.setVisible(false);
        this.layers.mouth_talk_b.setVisible(true);
      }
    }
  }

  public getParameter(name: string): number {
    return this.parameters.get(name) ?? 0;
  }

  public setTalking(talking: boolean): void {
    if (this.released) return;
    const next = Boolean(talking);
    if (this.isTalking === next) return;
    this.isTalking = next;
    this.lipSyncTimer = 0;
    this.lipSyncStepIndex = 0;

    if (!next) {
      this.layers.mouth_neutral.setVisible(true);
      this.layers.mouth_talk_a.setVisible(false);
      this.layers.mouth_talk_b.setVisible(false);
    } else {
      this.layers.mouth_neutral.setVisible(false);
      this.layers.mouth_talk_a.setVisible(true);
      this.layers.mouth_talk_b.setVisible(false);
    }
  }

  public setBreathingEnabled(enabled: boolean): void {
    if (this.released) return;
    this.breathingEnabled = Boolean(enabled);
    if (!this.breathingEnabled) {
      this.layers.body.setScale(1, 1);
      this.layers.body.setOffset(0, 0);
      this.layers.hair_front.setRotation(0);
      this.layers.hair_back.setRotation(0);
    }
  }

  public setBlinkEnabled(enabled: boolean): void {
    if (this.released) return;
    this.blinkEnabled = Boolean(enabled);
    if (!this.blinkEnabled && !this.eyesForcedClosedByExpr) {
      this.blinkCloseRemaining = 0;
      this.layers.eyes_open.setVisible(true);
      this.layers.eyes_closed.setVisible(false);
    }
  }

  public setNormalizedPosition(nx: number, ny: number, scale?: number): void {
    if (this.released) return;
    this.placement = normalizeStageCoordinates(
      nx,
      ny,
      scale ?? this.placement.scale
    );
    this.computedRect = this.relayout(this.viewport);
  }

  public relayout(viewport: AvatarViewport): ComputedViewportRect {
    const w = Math.max(1, Number.isFinite(viewport.width) ? viewport.width : 1280);
    const h = Math.max(1, Number.isFinite(viewport.height) ? viewport.height : 720);
    const dpr = Math.max(1, Number.isFinite(viewport.dpr) ? Number(viewport.dpr) : 1);
    this.viewport = { width: w, height: h, dpr };

    const anchorX = Math.round(this.placement.nx * w * dpr) / dpr;
    const anchorY = Math.round(this.placement.ny * h * dpr) / dpr;

    this.computedRect = {
      anchorX,
      anchorY,
      scale: this.placement.scale,
      viewportWidth: w,
      viewportHeight: h,
      dpr,
    };
    return this.computedRect;
  }

  public update(rawDt: number): void {
    if (this.released) return;
    const dt = clampAvatarDelta(rawDt);
    if (dt <= 0) return;

    if (this.crossfadeAlpha < 1) {
      this.crossfadeAlpha = Math.min(1, this.crossfadeAlpha + dt / this.crossfadeDurationSec);
      if (this.crossfadeAlpha >= 1) {
        this.previousTexture = null;
      }
    }

    if (this.currentMotion !== 'none' && this.motionElapsed < this.motionDurationSec) {
      this.motionElapsed = Math.min(this.motionDurationSec, this.motionElapsed + dt);
      if (this.motionElapsed >= this.motionDurationSec) {
        this.currentMotion = 'none';
      }
    }

    if (this.breathingEnabled) {
      this.breathElapsed = (this.breathElapsed + dt) % this.breathPeriodSec;
      const omega = (2 * Math.PI) / this.breathPeriodSec;
      const phase = this.breathElapsed * omega;
      const wave01 = 0.5 * (1 - Math.cos(phase));
      const bodyScaleY = 1.0 + 0.0075 * wave01;
      this.layers.body.setScale(1.0, bodyScaleY);
      this.layers.body.setOffset(0, 0);

      const hairRot = Math.sin(phase - 0.65) * 0.35;
      this.layers.hair_front.setRotation(hairRot);
      this.layers.hair_back.setRotation(hairRot * 0.7);
    }

    if (this.blinkEnabled && !this.eyesForcedClosedByExpr) {
      if (this.blinkCloseRemaining > 0) {
        this.blinkCloseRemaining -= dt;
        if (this.blinkCloseRemaining <= 0) {
          this.blinkCloseRemaining = 0;
          this.layers.eyes_open.setVisible(true);
          this.layers.eyes_closed.setVisible(false);
        }
      } else {
        this.blinkTimer += dt;
        if (this.blinkTimer >= this.nextBlinkInterval) {
          this.blinkTimer = 0;
          this.nextBlinkInterval = this.sampleNextBlinkInterval();
          this.blinkCloseRemaining = this.sampleBlinkDuration();
          this.layers.eyes_open.setVisible(false);
          this.layers.eyes_closed.setVisible(true);
        }
      }
    }

    if (this.isTalking) {
      this.lipSyncTimer += dt;
      while (this.lipSyncTimer >= this.lipSyncIntervalSec) {
        this.lipSyncTimer -= this.lipSyncIntervalSec;
        this.lipSyncStepIndex = (this.lipSyncStepIndex + 1) % 4;
      }
      const step = this.lipSyncStepIndex;
      this.layers.mouth_neutral.setVisible(step === 3);
      this.layers.mouth_talk_a.setVisible(step === 0 || step === 2);
      this.layers.mouth_talk_b.setVisible(step === 1);
    }
  }

  public getLayer(id: AvatarLayerId): AvatarLayer {
    return this.layers[id];
  }

  public getAllLayers(): Record<AvatarLayerId, AvatarLayer> {
    return this.layers;
  }

  public getCrossfadeState(): {
    previousTexture: string | null;
    currentTexture: string | null;
    alpha: number;
  } {
    return {
      previousTexture: this.previousTexture,
      currentTexture: this.currentTexture,
      alpha: this.crossfadeAlpha,
    };
  }

  public getEntranceTransform(): {
    translateX: number;
    translateY: number;
    opacity: number;
    active: boolean;
  } {
    if (this.currentMotion === 'none' || this.motionElapsed >= this.motionDurationSec) {
      return { translateX: 0, translateY: 0, opacity: 1, active: false };
    }
    const t = Math.min(1, Math.max(0, this.motionElapsed / this.motionDurationSec));
    const ease = 1 - Math.pow(1 - t, 3);
    const remaining = 1 - ease;

    switch (this.currentMotion) {
      case 'enter_up_fade':
        return { translateX: 0, translateY: Math.round(16 * remaining), opacity: ease, active: true };
      case 'enter_left_fade':
        return { translateX: Math.round(-18 * remaining), translateY: 0, opacity: ease, active: true };
      case 'enter_right_fade':
        return { translateX: Math.round(18 * remaining), translateY: 0, opacity: ease, active: true };
      case 'enter_fade':
      default:
        return { translateX: 0, translateY: 0, opacity: ease, active: true };
    }
  }

  public isReleased(): boolean {
    return this.released;
  }

  public release(): void {
    if (this.released) return;
    this.released = true;
    this.isTalking = false;
    this.previousTexture = null;
    this.currentTexture = null;
    for (const id of ALL_AVATAR_LAYER_IDS) {
      this.layers[id].setTexture(null);
      this.layers[id].setVisible(false);
    }
    this.expressions.clear();
    this.parameters.clear();
  }
}

export type Live2DBackendFactory = (modelUrl?: string) => IAvatarRenderable;

let registeredLive2DFactory: Live2DBackendFactory | null = null;

export function registerLive2DBackend(factory: Live2DBackendFactory | null): void {
  registeredLive2DFactory = factory;
}

export function isLive2DBackendRegistered(): boolean {
  return registeredLive2DFactory !== null;
}

export function newImageAvatar(options?: ImageAvatarOptions): IAvatarRenderable {
  return new ImageAvatar(options);
}

/**
 * Creates a Live2D avatar ONLY if a real Live2D Cubism / Spine backend factory
 * has been registered via `registerLive2DBackend`.
 * Never silently falls back to a static image (`GPT-16` / `Kimi 2B`).
 */
export function newLive2DAvatar(modelUrl?: string): IAvatarRenderable {
  if (!registeredLive2DFactory) {
    throw new Error(
      'ERR_LIVE2D_SDK_NOT_CONFIGURED: Live2D Cubism Web SDK 尚未注册，禁止静默退回静态图片。请先调用 registerLive2DBackend() 或使用 L0/L1 立绘。'
    );
  }
  return registeredLive2DFactory(modelUrl);
}
