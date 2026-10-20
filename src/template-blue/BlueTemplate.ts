import type { Project } from '../common/types';
import { Engine } from '../engine/Engine';
import { GameScreen } from './GameScreen';
import { SettingsScreen } from './SettingsScreen';
import { SaveLoadScreen, toast } from './SaveLoadScreen';
import { loadSettings, GameSettings, loadProgress, formatPlayTime } from '../engine/states';
import './blue.css';

/**
 * MooVN 蓝色模板
 * 主菜单：左侧选项（开启新游戏 / 读取存档 / 设置 / 关于 / 退出游戏），
 * 中和右为主视觉图片，左与中间为深蓝→黑模糊过渡层。
 */
export class BlueTemplate {
  root: HTMLElement;
  private project: Project;
  private settings: GameSettings;
  private menuEl!: HTMLElement;
  private gameHost!: HTMLElement;
  private overlayHost!: HTMLElement;
  private gameScreen: GameScreen | null = null;
  private engine: Engine | null = null;
  private settingsScreen: SettingsScreen | null = null;
  private saveLoadScreen: SaveLoadScreen | null = null;
  private aboutEl: HTMLElement | null = null;
  private endingEl: HTMLElement | null = null;
  private confirmEl: HTMLElement | null = null;
  private visualTimer: number | null = null;

  constructor(project: Project, host: HTMLElement) {
    this.project = project;
    this.root = document.createElement('div');
    this.root.className = 'mv-root';
    host.appendChild(this.root);
    this.settings = loadSettingsSync();
  }

  async init(): Promise<void> {
    this.buildSkeleton();
    this.showMenu();
    // 预加载主视觉
    const kv = this.project.assetsRoot
      ? `${this.project.assetsRoot}/menu-key-visual.jpg`
      : 'assets/menu-key-visual.jpg';
    const img = new Image();
    img.src = kv;
  }

  private buildSkeleton(): void {
    this.root.innerHTML = `
      <div class="mv-stage-host" style="display:none"></div>
      <div class="mv-overlay-host"></div>
      <div class="mv-menu-host"></div>
    `;
    this.gameHost = this.root.querySelector('.mv-stage-host')!;
    this.overlayHost = this.root.querySelector('.mv-overlay-host')!;
    this.menuEl = this.root.querySelector('.mv-menu-host')!;
  }

  /* ================== 主菜单 ================== */
  private showMenu(): void {
    this.destroyGame();
    this.menuEl.style.display = '';
    this.menuEl.innerHTML = `
      <div class="mv-screen mv-menu">
        <div class="mv-menu-left">
          <div class="mv-menu-title">
            <h1>${escapeHtml(this.project.title)}</h1>
            <small>MooVN BLUE TEMPLATE</small>
          </div>
          <div class="mv-menu-items">
            <button class="mv-menu-item m-new">开启新游戏</button>
            <button class="mv-menu-item m-load">读取存档</button>
            <button class="mv-menu-item m-set">设置</button>
            <button class="mv-menu-item m-about">关于</button>
            <button class="mv-menu-item m-exit">退出游戏</button>
          </div>
          <div class="mv-menu-version">MooVN v0.1.0-dev · ${escapeHtml(this.project.author || 'Moonano')}</div>
        </div>
        <div class="mv-menu-visual">
          <img src="${this.project.assetsRoot ?? 'assets'}/menu-key-visual.jpg" alt="主视觉图" />
        </div>
        <div class="mv-menu-blur"></div>
      </div>
    `;
    this.menuEl.querySelector('.m-new')!.addEventListener('click', () => void this.newGame());
    this.menuEl.querySelector('.m-load')!.addEventListener('click', () => this.openSaveLoad('load'));
    this.menuEl.querySelector('.m-set')!.addEventListener('click', () => this.openSettings(false));
    this.menuEl.querySelector('.m-about')!.addEventListener('click', () => this.showAbout());
    this.menuEl.querySelector('.m-exit')!.addEventListener('click', () => this.confirmExit());
  }

  private hideMenu(): void {
    this.menuEl.style.display = 'none';
    this.menuEl.innerHTML = '';
  }

  /* ================== 游戏 ================== */
  private async newGame(): Promise<void> {
    this.hideMenu();
    await this.startEngine(null);
    toast('新游戏开始');
  }

  private async startEngine(restore: Parameters<Engine['loadFrom']>[0] | null): Promise<void> {
    this.destroyGame();
    this.gameHost.style.display = '';
    const settings = await loadSettings();
    this.engine = new Engine(this.project, this.gameHost, { settings, restore: restore?.state ?? null });

    // 先挂 UI 再启动引擎：引擎 start() 会阻塞在第一句对话等待玩家输入
    this.gameScreen = new GameScreen(this.engine, this.root, {
      openSettings: () => this.openSettings(true),
      openSaveLoad: (mode) => this.openSaveLoad(mode),
      onEnding: (e) => this.showEnding(e),
      onExitToMenu: () => this.confirmExitToMenu()
    });
    this.gameScreen.setVisible(true);
    this.gameScreen.startTicker();

    await this.engine.start();
    if (restore) {
      await this.engine.loadFrom(restore);
    }
  }

  private destroyGame(): void {
    this.gameScreen?.destroy();
    this.gameScreen = null;
    this.engine?.destroy();
    this.engine = null;
    this.gameHost.style.display = 'none';
    this.gameHost.innerHTML = '';
  }

  /* ================== 覆盖屏 ================== */
  private openSettings(inGame: boolean): void {
    if (this.settingsScreen) return;
    this.settingsScreen = new SettingsScreen(this.engine, this.overlayHost, {
      inGame,
      onClose: () => {
        this.settingsScreen?.destroy();
        this.settingsScreen = null;
      },
      onExitToMenu: () => {
        this.settingsScreen?.destroy();
        this.settingsScreen = null;
        this.showMenu();
      },
      onChange: (s) => {
        this.settings = s;
        this.engine?.applySettings(s);
      },
      onStartGame: async (slot) => {
        this.settingsScreen?.destroy();
        this.settingsScreen = null;
        this.hideMenu();
        await this.startEngine(slot);
        toast('已读取存档');
      }
    });
  }

  private openSaveLoad(mode: 'save' | 'load'): void {
    if (this.saveLoadScreen) return;
    if (!this.engine) {
      // 主菜单"读取存档"：不依赖引擎，读档后直接进入游戏
      if (mode !== 'load') return;
      const sl = new SaveLoadScreen(null, this.overlayHost, {
        mode: 'load',
        onPick: async (slot) => {
          sl.destroy();
          this.saveLoadScreen = null;
          this.hideMenu();
          await this.startEngine(slot);
          toast('已读取存档');
        },
        onClose: () => {
          sl.destroy();
          this.saveLoadScreen = null;
        }
      });
      this.saveLoadScreen = sl;
      return;
    }
    if (mode === 'save' && !this.gameScreen) return;
    this.saveLoadScreen = new SaveLoadScreen(this.engine, this.overlayHost, {
      mode,
      onClose: () => {
        this.saveLoadScreen?.destroy();
        this.saveLoadScreen = null;
      }
    });
  }

  /* ================== 关于 ================== */
  private async showAbout(): Promise<void> {
    if (this.aboutEl) return;
    const progress = await loadProgress();
    const el = document.createElement('div');
    el.className = 'mv-screen mv-overlay';
    const endings = this.collectEndingDefs();
    el.innerHTML = `
      <div class="mv-overlay-head">
        <h2>关于</h2>
        <button class="mv-back-btn mv-about-close">← 返回</button>
      </div>
      <div class="mv-overlay-body mv-about">
        <h3>${escapeHtml(this.project.title)}</h3>
        <p>${escapeHtml(this.project.author ? `作者：${this.project.author}` : 'MooVN 蓝色模板示例游戏')}</p>
        <p>这是一个使用 <code>MooVN</code> 视觉小说编辑器制作的完整示例游戏，
           展示了章节 / 场景管理、角色好感度、选项分支、多结局等工作流节点能力。</p>
        <h3>引擎技术</h3>
        <p>TypeScript · Tauri 2 · Pixi.js · YAML · Lua/Teal · JavaScript/TypeScript · Python</p>
        <h3>结局收集（${progress.endings.length}/${endings.length}）</h3>
        <div class="mv-endings">
          ${endings.map((e) => {
            const got = progress.endings.find((p) => p.id === e.id);
            return `<span class="mv-ending-chip${got ? '' : ' locked'}" title="${got ? `于 ${formatPlayTime(got.time)} 游戏时长达成` : '尚未达成'}">${got ? `◆ ${escapeHtml(e.title)}` : '◇ ???'}</span>`;
          }).join('')}
        </div>
      </div>
    `;
    el.querySelector('.mv-about-close')!.addEventListener('click', () => {
      el.remove();
      this.aboutEl = null;
    });
    this.overlayHost.appendChild(el);
    this.aboutEl = el;
  }

  private collectEndingDefs(): Array<{ id: string; title: string; kind: string }> {
    const out: Array<{ id: string; title: string; kind: string }> = [];
    for (const scene of Object.values(this.project.scenes)) {
      for (const node of scene.flow) {
        if (node.type === 'ending') {
          out.push({ id: node.endingId ?? node.id, title: node.endingTitle ?? '结局', kind: node.endingKind ?? 'normal' });
        }
      }
    }
    return out;
  }

  /* ================== 结局 ================== */
  private showEnding(e: { id: string; title: string; kind: string }): void {
    if (this.endingEl) this.endingEl.remove();
    const el = document.createElement('div');
    el.className = 'mv-ending-screen';
    const kindLabel: Record<string, string> = { good: 'GOOD END', normal: 'NORMAL END', bad: 'BAD END', true: 'TRUE END' };
    el.innerHTML = `
      <div class="kind">${kindLabel[e.kind] ?? 'END'}</div>
      <h2>${escapeHtml(e.title)}</h2>
      <div class="mv-menu-items" style="align-items:center">
        <button class="mv-menu-item e-title">回到标题</button>
      </div>
    `;
    el.querySelector('.e-title')!.addEventListener('click', () => {
      el.remove();
      this.endingEl = null;
      this.showMenu();
    });
    this.root.appendChild(el);
    this.endingEl = el;
  }

  /* ================== 退出 ================== */
  private confirmExit(): void {
    this.confirm('确定要退出游戏吗？', () => {
      if ('__TAURI_INTERNALS__' in window) {
        type TauriLike = { core?: { invoke?: (cmd: string) => Promise<void> } };
        const t = (window as unknown as { __TAURI__?: TauriLike }).__TAURI__;
        void t?.core?.invoke?.('plugin:process|exit');
        setTimeout(() => {
          window.close();
          toast('已请求退出，可关闭此窗口');
        }, 300);
      } else {
        window.close();
        setTimeout(() => toast('网页预览无法关闭窗口，请直接关闭标签页'), 200);
      }
    });
  }

  private confirmExitToMenu(): void {
    this.confirm('确定要退出到主菜单吗？（未保存的进度将丢失，Auto 存档仍保留）', () => {
      this.showMenu();
    });
  }

  private confirm(msg: string, onOk: () => void): void {
    if (this.confirmEl) return;
    const el = document.createElement('div');
    el.className = 'mv-confirm';
    el.innerHTML = `
      <div class="mv-confirm-box">
        <p>${escapeHtml(msg)}</p>
        <div class="row">
          <button class="mv-btn primary c-ok">确定</button>
          <button class="mv-btn c-cancel">取消</button>
        </div>
      </div>
    `;
    el.querySelector('.c-ok')!.addEventListener('click', () => {
      el.remove();
      this.confirmEl = null;
      onOk();
    });
    el.querySelector('.c-cancel')!.addEventListener('click', () => {
      el.remove();
      this.confirmEl = null;
    });
    this.root.appendChild(el);
    this.confirmEl = el;
  }

  destroy(): void {
    if (this.visualTimer) clearInterval(this.visualTimer);
    this.destroyGame();
    this.root.remove();
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

function loadSettingsSync(): GameSettings {
  try {
    const raw = localStorage.getItem('moovn.settings.v1');
    if (raw) return { textSpeed: 28, autoSpeed: 900, bgmVolume: 0.6, sfxVolume: 0.8, skipOnlyRead: true, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { textSpeed: 28, autoSpeed: 900, bgmVolume: 0.6, sfxVolume: 0.8, skipOnlyRead: true };
}
