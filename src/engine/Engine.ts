import type { Project, Scene, FlowNode, ChoiceOption } from '../common/types';
import { evalCondition } from '../common/expr';
import { Emitter } from '../common/events';
import { Assets } from './assets';
import { Stage } from './renderer/Stage';
import {
  GameState, newGameState, RuntimeCharacter,
  SaveSlot, SaveData, TabId,
  loadSaveData, writeSlot, writeAutoSlot,
  loadProgress, persistProgress, Progress,
  GameSettings, DEFAULT_SETTINGS
} from './states';
import { runScriptNode } from './script';

export interface EngineEvents {
  scene: { sceneId: string; title: string; chapterTitle: string };
  dialogue: { character: string; name: string; color: string; text: string; narration: boolean };
  choices: { prompt: string; options: Array<ChoiceOption & { available: boolean }> } | null;
  media: { background: string; bgm: string };
  ending: { id: string; title: string; kind: string };
  state: GameState;
  scriptNotice: { lang: string; message: string };
  inputLock: boolean;
}

type EventMap = EngineEvents;

export interface EngineOptions {
  settings?: Partial<GameSettings>;
  /** 从存档恢复 */
  restore?: GameState | null;
  /** 起始场景覆盖（编辑器试运行） */
  startScene?: string;
}

const CLICK = Symbol('click');

export class Engine {
  emitter = new Emitter<EventMap>();
  project: Project;
  assets: Assets;
  stage: Stage;
  state: GameState;
  settings: GameSettings;
  progress: Progress;

  private scene!: Scene;
  private waiters: Array<() => void> = [];
  private inputLocked = false;
  private typing = false;
  private typeTimer: number | null = null;
  private autoMode = false;
  private skipMode = false;
  private skipToken = 0;
  private destroyed = false;
  private bgmEl: HTMLAudioElement | null = null;
  private lastBgm = '';

  constructor(project: Project, container: HTMLElement, opts: EngineOptions = {}) {
    this.project = project;
    this.assets = new Assets();
    this.stage = new Stage(project, this.assets, container);
    this.settings = { ...DEFAULT_SETTINGS, ...opts.settings };
    this.state = opts.restore ?? newGameState(opts.startScene ?? project.startScene);
    this.progress = { seenScenes: [], endings: [] };
  }

  async start(): Promise<void> {
    await this.stage.init();
    this.progress = await loadProgress();
    // 安装画布点击推进
    this.stage.app.canvas.addEventListener('pointerdown', () => this.clickThrough());
    // 若为恢复存档，需要重建舞台视觉
    if (this.state.characters.length || this.state.background) {
      await this.stage.setBackground(this.state.background, 0);
      await this.stage.syncCharacters(this.state.characters);
      if (this.state.bgm) this.playBgm(this.state.bgm);
    }
    await this.enterScene(this.state.sceneId, this.state.nodeIndex, { markSeen: !this.state.seenScenes.includes(this.state.sceneId) });
  }

  /* ---------------------------------------------------------------- */
  /* 事件                                                              */
  /* ---------------------------------------------------------------- */
  on<K extends keyof EngineEvents>(k: K, fn: (p: EngineEvents[K]) => void): () => void {
    return this.emitter.on(k, fn);
  }
  private fire<K extends keyof EngineEvents>(k: K, p: EngineEvents[K]): void {
    this.emitter.emit(k, p);
  }

  /* ---------------------------------------------------------------- */
  /* 场景切换                                                          */
  /* ---------------------------------------------------------------- */
  private chapterTitleOf(scene: Scene): string {
    const ch = this.project.chapters.find((c) => c.id === scene.chapter);
    return ch?.title ?? scene.chapter;
  }

  private async enterScene(sceneId: string, nodeIndex = 0, opts: { markSeen?: boolean; pushHistory?: boolean } = {}): Promise<void> {
    const scene = this.project.scenes[sceneId];
    if (!scene) {
      console.error(`[MooVN] 场景不存在: ${sceneId}`);
      this.fire('dialogue', {
        character: '', name: '错误', color: '#ef4444',
        text: `场景 "${sceneId}" 不存在，请检查跳转/next 配置。`, narration: true
      });
      this.lockInput(false);
      return;
    }
    if (opts.pushHistory !== false) {
      this.state.history.push({ sceneId: this.state.sceneId, nodeIndex: this.state.nodeIndex });
      if (this.state.history.length > 64) this.state.history.shift();
    }
    this.scene = scene;
    this.state.sceneId = sceneId;
    this.state.nodeIndex = nodeIndex;

    // 视觉初始化
    if (scene.background) {
      this.state.background = scene.background;
      await this.stage.setBackground(scene.background, 700);
    }
    if (scene.bgm) {
      this.state.bgm = scene.bgm;
      this.playBgm(scene.bgm);
    }
    if (!this.state.characters.length || opts.markSeen !== false) {
      this.state.characters = this.applySceneCharacters(scene);
      await this.stage.syncCharacters(this.state.characters);
    }

    if (opts.markSeen !== false && !this.state.seenScenes.includes(sceneId)) {
      this.state.seenScenes.push(sceneId);
    }
    // 全局进度同步（快进只跳过已读场景的数据源）
    if (!this.progress.seenScenes.includes(sceneId)) {
      this.progress.seenScenes.push(sceneId);
      void persistProgress(this.progress);
    }
    this.fire('scene', { sceneId, title: scene.title, chapterTitle: this.chapterTitleOf(scene) });
    this.fire('state', this.state);

    // 场景级自动存档 → Auto 选项卡
    void this.autoSave();

    // 快进保护：进入未读场景时停止快进
    if (this.skipMode && !this.progress.seenScenes.includes(sceneId)) {
      this.setSkip(false);
    }

    await this.runFrom(nodeIndex);
  }

  /** 场景初始角色 = 上一状态继承 + 场景 characters 覆盖 */
  private applySceneCharacters(scene: Scene): RuntimeCharacter[] {
    const list: RuntimeCharacter[] = this.state.characters.map((c) => ({ ...c }));
    for (const sc of scene.characters) {
      const pos = typeof sc.position === 'number' ? sc.position : ({ left: 0.26, center: 0.5, right: 0.74 } as Record<string, number>)[sc.position] ?? 0.5;
      const existing = list.findIndex((c) => c.ref === sc.ref);
      const rt: RuntimeCharacter = {
        ref: sc.ref,
        position: pos,
        y: sc.y ?? 0,
        expression: sc.expression ?? '',
        visible: sc.visible !== false,
        dim: sc.dim ?? false,
        scale: sc.scale ?? 1
      };
      if (existing >= 0) list[existing] = rt;
      else list.push(rt);
    }
    return list;
  }

  /* ---------------------------------------------------------------- */
  /* 主循环：从 nodeIndex 开始执行直到遇到阻塞节点                      */
  /* ---------------------------------------------------------------- */
  private async runFrom(index: number): Promise<void> {
    this.state.nodeIndex = index;
    let i = index;
    for (;;) {
      if (this.destroyed) return;
      const node = this.scene.flow[i];
      if (!node) {
        // flow 结束 → 默认下一场景
        const next = this.scene.next;
        if (next) {
          await this.enterScene(next, 0);
        }
        return;
      }
      this.state.nodeIndex = i;
      const blocked = await this.execNode(node, i);
      if (blocked) return; // 等待玩家输入
      if (this.state.nodeIndex !== i) {
        // execNode 内部已跳转（branch/jump/choice）
        return;
      }
      i++;
    }
  }

  private resolveTarget(target: string | null | undefined): { kind: 'node' | 'scene' | 'none'; value: string } {
    if (!target) return { kind: 'none', value: '' };
    if (target.startsWith('scene:')) return { kind: 'scene', value: target.slice(6) };
    const inScene = this.scene.flow.find((n) => n.id === target);
    if (inScene) return { kind: 'node', value: target };
    if (this.project.scenes[target]) return { kind: 'scene', value: target };
    return { kind: 'node', value: target };
  }

  private async gotoTarget(target: string | null | undefined): Promise<void> {
    const t = this.resolveTarget(target);
    if (t.kind === 'scene') {
      await this.enterScene(t.value, 0);
    } else if (t.kind === 'node') {
      const idx = this.scene.flow.findIndex((n) => n.id === t.value);
      if (idx >= 0) await this.runFrom(idx);
      else {
        console.warn(`[MooVN] 节点不存在: ${t.value}，按结束处理`);
        await this.runFrom(this.scene.flow.length);
      }
    }
  }

  /** 执行单个节点，返回是否阻塞（等待玩家输入） */
  private async execNode(node: FlowNode, index: number): Promise<boolean> {
    switch (node.type) {
      case 'start':
        return false;

      case 'dialogue':
      case 'narration': {
        const def = node.character ? this.project.characters.find((c) => c.id === node.character) : undefined;
        this.setSpeaking(node.character ?? null);
        this.lockInput(false);
        await this.typeText(node.text ?? '', node.type === 'dialogue' ? (def?.name ?? node.character ?? '') : '', def?.color ?? '#8fb7dd', node.type === 'narration');
        this.state.nodeIndex = index;
        await this.waitForNext();
        this.lockInput(true);
        return false;
      }

      case 'choice': {
        const available = (node.options ?? []).filter((o) => !o.condition || evalCondition(o.condition, { vars: this.state.vars }));
        this.lastChoiceOptions = available;
        this.fire('choices', {
          prompt: '',
          options: available.map((o) => ({ ...o, available: true }))
        });
        this.lockInput(true);
        const picked = await this.waitForChoice();
        this.lockInput(false);
        this.fire('choices', null);
        if (picked) {
          if (picked.effects) {
            for (const [k, v] of Object.entries(picked.effects)) this.mutateVar(k, v, 'add');
          }
          if (picked.next) {
            await this.gotoTarget(picked.next);
            return true;
          }
          if (picked.scene) {
            await this.enterScene(picked.scene, 0);
            return true;
          }
        }
        return false;
      }

      case 'branch': {
        const ok = evalCondition(node.condition ?? 'true', { vars: this.state.vars });
        await this.gotoTarget(ok ? node.true : node.false);
        return true;
      }

      case 'setvar': {
        this.mutateVar(node.target ?? '', node.value ?? 0, node.op ?? 'set');
        this.fire('state', this.state);
        return false;
      }

      case 'background': {
        this.state.background = node.asset ?? '';
        this.fire('media', { background: this.state.background, bgm: this.state.bgm });
        await this.stage.setBackground(node.asset ?? '', node.fade ?? 700);
        return false;
      }

      case 'bgm': {
        this.state.bgm = node.asset ?? '';
        this.playBgm(node.asset ?? '');
        this.fire('media', { background: this.state.background, bgm: this.state.bgm });
        return false;
      }

      case 'sfx': {
        const el = this.assets.loadAudio(node.asset ?? '');
        if (el) {
          el.volume = this.settings.sfxVolume;
          el.currentTime = 0;
          void el.play().catch(() => {});
        }
        return false;
      }

      case 'character': {
        await this.characterCommand(node);
        return false;
      }

      case 'jump': {
        await this.enterScene(node.scene ?? '', 0);
        return true;
      }

      case 'ending': {
        const ending = {
          id: node.endingId ?? node.id,
          title: node.endingTitle ?? '结局',
          kind: node.endingKind ?? 'normal',
          time: Date.now()
        };
        this.state.endings.push(ending);
        this.progress.endings.push(ending);
        await persistProgress(this.progress);
        this.fire('ending', ending);
        return true;
      }

      case 'script': {
        const notice = await runScriptNode(node, {
          vars: this.state.vars,
          state: this.state,
          project: this.project
        });
        if (notice) this.fire('scriptNotice', notice);
        this.fire('state', this.state);
        return false;
      }

      case 'wait': {
        await new Promise((r) => setTimeout(r, node.ms ?? 500));
        return false;
      }

      default:
        return false;
    }
  }

  private setSpeaking(ref: string | null): void {
    for (const c of this.state.characters) {
      if (ref === null) {
        c.dim = false;
      } else if (c.ref !== ref) {
        c.dim = true;
      } else {
        c.dim = false;
      }
    }
    void this.stage.syncCharacters(this.state.characters);
    this.stage.setSpeaking(ref);
  }

  private mutateVar(path: string, value: string | number, op: 'set' | 'add' | 'sub'): void {
    if (!path) return;
    const cur = this.readVar(path);
    let next: unknown = value;
    if (op === 'add') next = Number(cur ?? 0) + Number(value);
    if (op === 'sub') next = Number(cur ?? 0) - Number(value);
    this.state.vars[path] = next;
  }

  readVar(path: string): unknown {
    if (path in this.state.vars) return this.state.vars[path];
    let cur: unknown = this.state.vars;
    for (const p of path.split('.')) {
      if (cur && typeof cur === 'object' && p in (cur as Record<string, unknown>)) {
        cur = (cur as Record<string, unknown>)[p];
      } else return undefined;
    }
    return cur;
  }

  private async characterCommand(node: FlowNode): Promise<void> {
    const ref = node.ref ?? node.character ?? '';
    if (!ref) return;
    let rt = this.state.characters.find((c) => c.ref === ref);
    if (!rt) {
      rt = { ref, position: 0.5, y: 0, expression: '', visible: false, dim: false, scale: 1 };
      this.state.characters.push(rt);
    }
    if (node.action === 'hide') {
      rt.visible = false;
    } else {
      rt.visible = true;
      if (node.position !== undefined) {
        rt.position = typeof node.position === 'number' ? node.position : ({ left: 0.26, center: 0.5, right: 0.74 } as Record<string, number>)[node.position] ?? 0.5;
      }
    }
    await this.stage.syncCharacters(this.state.characters);
  }

  /* ---------------------------------------------------------------- */
  /* 打字机与推进                                                       */
  /* ---------------------------------------------------------------- */
  private async typeText(text: string, name: string, color: string, narration: boolean): Promise<void> {
    this.typing = true;
    this.fire('dialogue', { character: name, name, color, text, narration });
    // 打字机由 UI 层根据 settings.textSpeed 实现；这里控制完成时机
    const perChar = this.skipMode ? 4 : this.settings.textSpeed;
    const total = text.length * perChar;
    await new Promise<void>((resolve) => {
      this.typeTimer = window.setTimeout(() => {
        this.typing = false;
        resolve();
      }, total);
    });
    this.typing = false;
  }

  /** UI 层通知：文字已立即显示完毕（跳过打字机） */
  finishTyping(): void {
    if (this.typeTimer) {
      clearTimeout(this.typeTimer);
      this.typeTimer = null;
    }
    this.typing = false;
  }

  isTyping(): boolean {
    return this.typing;
  }

  private waitForNext(): Promise<void> {
    return new Promise((resolve) => {
      this.waiters.push(() => resolve());
    });
  }

  private waitForChoice(): Promise<ChoiceOption | null> {
    return new Promise((resolve) => {
      this.choiceResolver = resolve;
    });
  }
  private choiceResolver: ((o: ChoiceOption | null) => void) | null = null;

  private [CLICK](): void {
    if (this.inputLocked) return;
    this.unlockWaiters();
  }

  /** 点击画面/对话框：跳过打字或推进 */
  clickThrough(): void {
    if (this.typing) {
      this.finishTyping();
      return;
    }
    this[CLICK]();
  }

  private unlockWaiters(): void {
    const ws = this.waiters;
    this.waiters = [];
    for (const w of ws) w();
  }

  selectChoice(option: ChoiceOption): void {
    if (this.choiceResolver) {
      const r = this.choiceResolver;
      this.choiceResolver = null;
      r(option);
    }
  }

  private lockInput(locked: boolean): void {
    this.inputLocked = locked;
    this.fire('inputLock', locked);
  }

  /* ---------------------------------------------------------------- */
  /* 自动 / 快进 / 后退                                                 */
  /* ---------------------------------------------------------------- */
  /** 自动播放：依据文字显示速度，每句停留后自动推进（遇选项暂停） */
  setAuto(on: boolean): void {
    this.autoMode = on;
    if (on) this.setSkip(false);
    this.fire('state', this.state);
    if (on) void this.autoPump();
  }

  isAuto(): boolean {
    return this.autoMode;
  }

  private async autoPump(): Promise<void> {
    const token = ++this.skipToken;
    while (this.autoMode && !this.destroyed && token === this.skipToken) {
      if (this.typing) {
        await new Promise((r) => setTimeout(r, 80));
        continue;
      }
      if (this.choiceResolver) return; // 停在选项
      const hasWaiter = this.waiters.length > 0;
      if (hasWaiter) {
        await new Promise((r) => setTimeout(r, this.settings.autoSpeed));
        if (!this.autoMode || token !== this.skipToken) return;
        this.unlockWaiters();
        await new Promise((r) => setTimeout(r, 60));
      } else {
        await new Promise((r) => setTimeout(r, 120));
      }
    }
  }

  /**
   * 快进：仅允许穿过"已读"的场景（seenScenes / progress.seenScenes）。
   * 进入任何未读场景时自动停止。
   */
  setSkip(on: boolean): void {
    this.skipToken++;
    this.skipMode = on;
    if (on) {
      this.autoMode = false;
      void this.skipPump(++this.skipToken);
    }
    this.fire('state', this.state);
  }

  isSkip(): boolean {
    return this.skipMode;
  }

  private async skipPump(token: number): Promise<void> {
    while (this.skipMode && !this.destroyed && token === this.skipToken) {
      // 若当前场景本身未读，则不允许快进
      if (!this.progress.seenScenes.includes(this.state.sceneId) &&
          !this.state.seenScenes.includes(this.state.sceneId)) {
        this.setSkip(false);
        return;
      }
      if (this.choiceResolver) {
        // 已读场景中的选项：自动选择第一项（保持"穿过"语义）
        const first = this.lastChoiceOptions?.[0];
        if (first) this.selectChoice(first);
        await new Promise((r) => setTimeout(r, 60));
        continue;
      }
      if (this.typing) {
        this.finishTyping();
        await new Promise((r) => setTimeout(r, 30));
        continue;
      }
      if (this.waiters.length) {
        this.unlockWaiters();
        await new Promise((r) => setTimeout(r, this.skipMode ? 90 : 40));
      } else {
        await new Promise((r) => setTimeout(r, 100));
      }
    }
  }
  private lastChoiceOptions: ChoiceOption[] | null = null;

  /** 后退：回到上一个场景开头 */
  async back(): Promise<void> {
    if (!this.state.history.length) return;
    const prev = this.state.history[this.state.history.length - 1];
    this.state.history.pop();
    await this.enterScene(prev.sceneId, 0, { pushHistory: false });
  }

  /* ---------------------------------------------------------------- */
  /* 存读档                                                            */
  /* ---------------------------------------------------------------- */
  async snapshotSlot(tab: TabId, index: number): Promise<SaveSlot> {
    const scene = this.project.scenes[this.state.sceneId];
    const chapter = scene ? this.chapterTitleOf(scene) : '';
    return {
      empty: false,
      sceneId: this.state.sceneId,
      sceneTitle: scene?.title ?? this.state.sceneId,
      chapterTitle: chapter,
      nodeIndex: this.state.nodeIndex,
      thumbnail: this.stage.thumbnail(),
      saveTime: Date.now(),
      playTime: this.state.playTime,
      state: JSON.parse(JSON.stringify(this.state)) as GameState
    };
  }

  async saveTo(tab: TabId, index: number): Promise<SaveData> {
    const slot = await this.snapshotSlot(tab, index);
    return tab === 'auto' ? writeAutoSlot(slot) : writeSlot(tab, index, slot);
  }

  private async autoSave(): Promise<void> {
    try {
      await this.saveTo('auto', 0);
    } catch (err) {
      console.warn('[MooVN] 自动存档失败:', err);
    }
  }

  async listSaves(): Promise<SaveData> {
    return loadSaveData();
  }

  async loadFrom(slot: SaveSlot): Promise<void> {
    this.state = JSON.parse(JSON.stringify(slot.state)) as GameState;
    this.lastBgm = '';
    this.setSkip(false);
    this.setAuto(false);
    if (this.state.bgm) this.playBgm(this.state.bgm);
    await this.enterScene(this.state.sceneId, this.state.nodeIndex, { markSeen: false, pushHistory: false });
  }

  /* ---------------------------------------------------------------- */
  /* 音频                                                              */
  /* ---------------------------------------------------------------- */
  private playBgm(path: string): void {
    if (path === this.lastBgm) return;
    this.lastBgm = path;
    try {
      this.bgmEl?.pause();
      this.bgmEl = null;
      if (path) {
        const el = this.assets.loadAudio(path);
        if (el) {
          el.loop = true;
          el.volume = this.settings.bgmVolume;
          void el.play().catch(() => {});
          this.bgmEl = el;
        }
      }
    } catch (err) {
      console.warn('[MooVN] BGM 播放失败:', err);
    }
  }

  applySettings(s: Partial<GameSettings>): void {
    this.settings = { ...this.settings, ...s };
    if (this.bgmEl) this.bgmEl.volume = this.settings.bgmVolume;
  }

  /** 计时：由模板层每秒累加 */
  tickPlayTime(): void {
    this.state.playTime += 1000;
  }

  destroy(): void {
    this.destroyed = true;
    this.skipToken++;
    if (this.typeTimer) clearTimeout(this.typeTimer);
    this.bgmEl?.pause();
    this.stage.destroy();
  }
}


