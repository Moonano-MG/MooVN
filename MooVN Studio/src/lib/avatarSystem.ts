/**
 * MooVN Layered Dynamic Portrait & Avatar State Machine (`avatarSystem.ts`)
 *
 * Implements the 7-step layered avatar architecture:
 * 1. Multi-layer `ImageAvatar`:
 *    - `hair_back`
 *    - `body`
 *    - `eyes_open` / `eyes_closed`
 *    - `mouth_neutral` / `mouth_talk_a` / `mouth_talk_b`
 *    - `brow_neutral` / `brow_angry` / `brow_sad`
 *    - `blush`
 *    - `hair_front`
 *    Each layer supports `setVisible`, `setOffset`, `setScale`, `setTexture`.
 * 2. Breathing applies ONLY to `body` (`scaleY: 1.0 -> 1.008 -> 1.0` anchored at bottom,
 *    period 4.0s) and phase-lagged micro-sway on `hair_front`/`hair_back`. Head/eyes never bounce.
 *    Default: disabled (`breathingEnabled = false`) unless enabled.
 * 3. Independent random eye-blink state machine: switches `eyes_open` / `eyes_closed` every
 *    2.0–6.0s for 90–140ms (1–2 frames), independent of body motion.
 * 4. Text-linked lip-sync: alternates `mouth_neutral` / `mouth_talk_a` / `mouth_talk_b` every
 *    120ms while dialogue text is actively printing (`talking = true`), returning immediately
 *    to `mouth_neutral` when text finishes.
 * 5. Unified `IAvatarRenderable` interface (`getKind() -> "image" | "live2d" | "vroid"`,
 *    `defineExpression(name, spec)`, `setExpression(name)`, `setMotion(name)`,
 *    `setParameter(name, value)`, `update(dt)`, `release()`) with `newImageAvatar()` and
 *    `newLive2DAvatar()`.
 * 6. Normalized viewport coordinates (`0..1`) with `relayout(viewport)` and `dt` clamping
 *    (`clamp(dt, 0, 0.05)`) to prevent resize drift or tab-switch delta spikes.
 */

export type AvatarBackendKind = 'image' | 'live2d' | 'vroid';

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
  /** Normalized horizontal anchor in [0, 1] */
  nx: number;
  /** Normalized vertical anchor in [0, 1] */
  ny: number;
  /** Relative scale factor (1.0 = 100%) */
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
  public texture: string | null = null;

  constructor(id: AvatarLayerId, visible: boolean = false, texture: string | null = null) {
    this.id = id;
    this.visible = visible;
    this.texture = texture;
  }

  public setVisible(visible: boolean): void {
    this.visible = Boolean(visible);
  }

  public setOffset(dx: number, dy: number): void {
    this.offsetX = Number.isFinite(dx) ? dx : 0;
    this.offsetY = Number.isFinite(dy) ? dy : 0;
  }

  public setScale(sx: number, sy: number): void {
    this.scaleX = Number.isFinite(sx) ? sx : 1;
    this.scaleY = Number.isFinite(sy) ? sy : 1;
  }

  public setRotation(deg: number): void {
    this.rotationDeg = Number.isFinite(deg) ? deg : 0;
  }

  public setTexture(textureUrl: string | null): void {
    this.texture = textureUrl;
  }
}

export interface ParsedExpressionRule {
  name: string;
  eyes?: 'open' | 'closed' | 'happy' | 'wink';
  mouth?: 'neutral' | 'smile' | 'talk_a' | 'talk_b';
  brow?: 'neutral' | 'angry' | 'sad';
  blush?: boolean;
  spriteTexture?: string;
}

export interface IAvatarRenderable {
  getKind(): AvatarBackendKind;
  defineExpression(name: string, spec: ExpressionSpecInput): void;
  setExpression(name: string): void;
  setMotion(name: string): void;
  setParameter(name: string, value: number): void;
  setTalking(talking: boolean): void;
  setBreathingEnabled(enabled: boolean): void;
  setBlinkEnabled(enabled: boolean): void;
  setNormalizedPosition(nx: number, ny: number, scale?: number): void;
  relayout(viewport: AvatarViewport): ComputedViewportRect;
  update(dt: number): void;
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
  layerTextures?: Partial<Record<AvatarLayerId, string>>;
  breathingEnabled?: boolean;
  blinkEnabled?: boolean;
  nx?: number;
  ny?: number;
  scale?: number;
  randomSeed?: () => number;
}

/**
 * Clamps frame delta `dt` (in seconds) to `[0, 0.05]` so background tab suspension
 * or window minimize/restore never causes animation time jumps.
 */
export function clampAvatarDelta(dt: number): number {
  if (!Number.isFinite(dt) || dt < 0) return 0;
  return Math.min(dt, 0.05);
}

/**
 * Converts percentage stage coordinates (`0..100`) or normalized coordinates (`0..1`)
 * into strict normalized `[0, 1]` coordinates.
 */
export function normalizeStageCoordinates(
  xInput: number,
  yInput: number,
  scaleInput: number = 1
): NormalizedPlacement {
  const nxRaw = xInput > 1.0001 || xInput < -0.0001 ? xInput / 100 : xInput;
  const nyRaw = yInput > 1.0001 || yInput < -0.0001 ? yInput / 100 : yInput;
  return {
    nx: Math.min(1, Math.max(0, Number.isFinite(nxRaw) ? nxRaw : 0.5)),
    ny: Math.min(1, Math.max(0, Number.isFinite(nyRaw) ? nyRaw : 0.85)),
    scale: Math.min(3, Math.max(0.2, Number.isFinite(scaleInput) ? scaleInput : 1)),
  };
}

export type ExpressionSpecInput =
  | string
  | Partial<Omit<ParsedExpressionRule, 'name'>>;

/**
 * Parses an expression DSL string (`"eyes=happy; mouth=smile; brow=angry; blush=1"`)
 * or a structured expression rule object.
 */
export function parseExpressionSpec(
  name: string,
  spec: ExpressionSpecInput
): ParsedExpressionRule {
  if (typeof spec === 'object' && spec !== null) {
    return {
      name,
      eyes: spec.eyes ?? 'open',
      mouth: spec.mouth ?? 'neutral',
      brow: spec.brow ?? 'neutral',
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
      if (valLower === 'closed' || valLower === 'happy' || valLower === 'wink') {
        rule.eyes = valLower as ParsedExpressionRule['eyes'];
      } else {
        rule.eyes = 'open';
      }
    } else if (key === 'mouth') {
      if (valLower === 'smile' || valLower === 'talk_a' || valLower === 'talk_b') {
        rule.mouth = valLower as ParsedExpressionRule['mouth'];
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
  private readonly expressions = new Map<string, ParsedExpressionRule>();
  private readonly parameters = new Map<string, number>();
  private readonly rng: () => number;

  private currentExpressionName: string = 'default';
  private breathingEnabled: boolean;
  private blinkEnabled: boolean;
  private isTalking: boolean = false;
  private released: boolean = false;

  // Breathing channel state (period = 4.2s, max scaleY = 1.008 on body only)
  private breathElapsed: number = 0;
  private readonly breathPeriodSec: number = 4.2;

  // Blink channel state (interval 2.0–6.0s, close duration 0.09–0.14s)
  private blinkTimer: number = 0;
  private nextBlinkInterval: number = 3.2;
  private blinkCloseRemaining: number = 0;
  private eyesForcedClosedByExpr: boolean = false;

  // Lip-sync channel state (120ms = 0.12s step between neutral / talk_a / talk_b)
  private lipSyncTimer: number = 0;
  private lipSyncStepIndex: number = 0;
  private readonly lipSyncIntervalSec: number = 0.12;

  // Single-shot expression crossfade (180ms = 0.18s)
  private previousTexture: string | null = null;
  private currentTexture: string | null = null;
  private crossfadeAlpha: number = 1;
  private readonly crossfadeDurationSec: number = 0.18;

  // Single-shot entrance motion (220ms = 0.22s, never loops)
  private currentMotion: SingleShotMotionId = 'none';
  private motionElapsed: number = 0;
  private readonly motionDurationSec: number = 0.22;

  // Normalized coordinates & viewport layout
  private placement: NormalizedPlacement;
  private viewport: AvatarViewport = { width: 1280, height: 720, dpr: 1 };
  private computedRect: ComputedViewportRect;

  constructor(options: ImageAvatarOptions = {}) {
    this.rng = options.randomSeed || Math.random;
    this.breathingEnabled = Boolean(options.breathingEnabled ?? false);
    this.blinkEnabled = Boolean(options.blinkEnabled ?? true);
    this.currentTexture = options.baseTexture ?? null;

    this.placement = normalizeStageCoordinates(
      options.nx ?? 0.5,
      options.ny ?? 0.88,
      options.scale ?? 1
    );
    this.computedRect = this.relayout(this.viewport);

    this.layers = {
      hair_back: new AvatarLayer('hair_back', Boolean(options.layerTextures?.hair_back), options.layerTextures?.hair_back ?? null),
      body: new AvatarLayer('body', true, options.layerTextures?.body ?? options.baseTexture ?? null),
      eyes_open: new AvatarLayer('eyes_open', true, options.layerTextures?.eyes_open ?? null),
      eyes_closed: new AvatarLayer('eyes_closed', false, options.layerTextures?.eyes_closed ?? null),
      mouth_neutral: new AvatarLayer('mouth_neutral', true, options.layerTextures?.mouth_neutral ?? null),
      mouth_talk_a: new AvatarLayer('mouth_talk_a', false, options.layerTextures?.mouth_talk_a ?? null),
      mouth_talk_b: new AvatarLayer('mouth_talk_b', false, options.layerTextures?.mouth_talk_b ?? null),
      brow_neutral: new AvatarLayer('brow_neutral', true, options.layerTextures?.brow_neutral ?? null),
      brow_angry: new AvatarLayer('brow_angry', false, options.layerTextures?.brow_angry ?? null),
      brow_sad: new AvatarLayer('brow_sad', false, options.layerTextures?.brow_sad ?? null),
      blush: new AvatarLayer('blush', false, options.layerTextures?.blush ?? null),
      hair_front: new AvatarLayer('hair_front', Boolean(options.layerTextures?.hair_front), options.layerTextures?.hair_front ?? null),
    };

    this.nextBlinkInterval = this.sampleNextBlinkInterval();

    // Register built-in standard expressions
    this.defineExpression('default', 'eyes=open; mouth=neutral; brow=neutral; blush=0');
    this.defineExpression('smile', 'eyes=happy; mouth=smile; brow=neutral; blush=0');
    this.defineExpression('shy', 'eyes=open; mouth=smile; brow=sad; blush=1');
    this.defineExpression('angry', 'eyes=open; mouth=neutral; brow=angry; blush=0');
    this.defineExpression('sad', 'eyes=closed; mouth=neutral; brow=sad; blush=0');
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

  public defineExpression(name: string, spec: ExpressionSpecInput): void {
    if (this.released) return;
    const parsed = parseExpressionSpec(name, spec);
    this.expressions.set(name, parsed);
  }

  public setExpression(name: string): void {
    if (this.released) return;
    const rule = this.expressions.get(name);
    this.currentExpressionName = name;

    if (rule) {
      // Apply brow state
      this.layers.brow_neutral.setVisible(!rule.brow || rule.brow === 'neutral');
      this.layers.brow_angry.setVisible(rule.brow === 'angry');
      this.layers.brow_sad.setVisible(rule.brow === 'sad');

      // Apply blush state
      this.layers.blush.setVisible(Boolean(rule.blush));

      // Apply eye state
      this.eyesForcedClosedByExpr = rule.eyes === 'closed' || rule.eyes === 'happy';
      if (this.eyesForcedClosedByExpr) {
        this.layers.eyes_open.setVisible(false);
        this.layers.eyes_closed.setVisible(true);
      } else {
        this.layers.eyes_open.setVisible(true);
        this.layers.eyes_closed.setVisible(false);
      }

      // Apply mouth state when not actively lip-syncing
      if (!this.isTalking) {
        this.layers.mouth_neutral.setVisible(true);
        this.layers.mouth_talk_a.setVisible(false);
        this.layers.mouth_talk_b.setVisible(false);
      }

      if (rule.spriteTexture && rule.spriteTexture !== this.currentTexture) {
        this.previousTexture = this.currentTexture;
        this.currentTexture = rule.spriteTexture;
        this.layers.body.setTexture(rule.spriteTexture);
        this.crossfadeAlpha = 0;
      }
    } else if (name && name !== this.currentTexture && (name.startsWith('/') || name.startsWith('data:') || name.startsWith('http'))) {
      // Direct sprite texture switch with single-shot 180ms crossfade
      this.previousTexture = this.currentTexture;
      this.currentTexture = name;
      this.layers.body.setTexture(name);
      this.crossfadeAlpha = 0;
    }
  }

  public setMotion(name: string): void {
    if (this.released) return;
    const normalized = (name || 'none') as SingleShotMotionId;
    if (
      normalized === 'enter_fade' ||
      normalized === 'enter_up_fade' ||
      normalized === 'enter_left_fade' ||
      normalized === 'enter_right_fade'
    ) {
      this.currentMotion = normalized;
      this.motionElapsed = 0;
    } else {
      this.currentMotion = 'none';
      this.motionElapsed = this.motionDurationSec;
    }
  }

  public setParameter(name: string, value: number): void {
    if (this.released) return;
    const safeVal = Number.isFinite(value) ? value : 0;
    this.parameters.set(name, safeVal);

    if (name === 'ParamMouthOpenY') {
      const talking = safeVal > 0.15;
      this.setTalking(talking);
    } else if (name === 'ParamEyeLOpen' || name === 'ParamEyeROpen') {
      const closed = safeVal < 0.2;
      this.layers.eyes_open.setVisible(!closed);
      this.layers.eyes_closed.setVisible(closed);
    } else if (name === 'ParamCheek') {
      this.layers.blush.setVisible(safeVal > 0.3);
    }
  }

  public setTalking(talking: boolean): void {
    if (this.released) return;
    const next = Boolean(talking);
    if (this.isTalking === next) return;
    this.isTalking = next;
    this.lipSyncTimer = 0;
    this.lipSyncStepIndex = 0;

    if (!next) {
      // Immediately return to mouth_neutral when text printing finishes
      this.layers.mouth_neutral.setVisible(true);
      this.layers.mouth_talk_a.setVisible(false);
      this.layers.mouth_talk_b.setVisible(false);
    } else {
      // Start first talking mouth frame immediately
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

    // Pixel-aligned coordinates so high-DPI / 125% / 150% scaling stays crisp
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

    // 1. Update single-shot expression crossfade (180ms)
    if (this.crossfadeAlpha < 1) {
      this.crossfadeAlpha = Math.min(1, this.crossfadeAlpha + dt / this.crossfadeDurationSec);
      if (this.crossfadeAlpha >= 1) {
        this.previousTexture = null;
      }
    }

    // 2. Update single-shot entrance motion (220ms, ends at animation: none)
    if (this.currentMotion !== 'none' && this.motionElapsed < this.motionDurationSec) {
      this.motionElapsed = Math.min(this.motionDurationSec, this.motionElapsed + dt);
      if (this.motionElapsed >= this.motionDurationSec) {
        this.currentMotion = 'none';
      }
    }

    // 3. Channel A: Body-only subtle breathing (scaleY: 1.0 -> 1.008 -> 1.0, period 4.2s)
    // Head and eyes NEVER translate up and down as a bouncing spring.
    if (this.breathingEnabled) {
      this.breathElapsed = (this.breathElapsed + dt) % this.breathPeriodSec;
      const omega = (2 * Math.PI) / this.breathPeriodSec;
      const phase = this.breathElapsed * omega;
      // Smooth cosine wave in [0, 1] -> scaleY in [1.0, 1.0075]
      const wave01 = 0.5 * (1 - Math.cos(phase));
      const bodyScaleY = 1.0 + 0.0075 * wave01;
      this.layers.body.setScale(1.0, bodyScaleY);
      this.layers.body.setOffset(0, 0);

      // Phase-lagged micro hair sway (<= 0.35 deg)
      const hairRot = Math.sin(phase - 0.65) * 0.35;
      this.layers.hair_front.setRotation(hairRot);
      this.layers.hair_back.setRotation(hairRot * 0.7);
    }

    // 4. Channel B: Independent random eye blink (2.0–6.0s interval, 90–140ms close)
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

    // 5. Channel C: Text-linked lip-sync (120ms cycle between mouth_neutral / mouth_talk_a / mouth_talk_b)
    if (this.isTalking) {
      this.lipSyncTimer += dt;
      while (this.lipSyncTimer >= this.lipSyncIntervalSec) {
        this.lipSyncTimer -= this.lipSyncIntervalSec;
        this.lipSyncStepIndex = (this.lipSyncStepIndex + 1) % 4;
      }
      // Sequence: 0 -> talk_a, 1 -> talk_b, 2 -> talk_a, 3 -> neutral
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
    // Cubic ease-out
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

class Live2DAvatarStub extends ImageAvatar {
  public override getKind(): AvatarBackendKind {
    return 'live2d';
  }
}

export function newImageAvatar(options?: ImageAvatarOptions): IAvatarRenderable {
  return new ImageAvatar(options);
}

export function newLive2DAvatar(modelUrl?: string, fallbackOptions?: ImageAvatarOptions): IAvatarRenderable {
  if (registeredLive2DFactory) {
    return registeredLive2DFactory(modelUrl);
  }
  return new Live2DAvatarStub({
    ...fallbackOptions,
    baseTexture: modelUrl ?? fallbackOptions?.baseTexture ?? null,
  });
}
