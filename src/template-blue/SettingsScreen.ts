import type { Engine } from '../engine/Engine';
import type { SaveSlot } from '../engine/states';
import { GameSettings, persistSettings, loadSettings } from '../engine/states';
import { SaveLoadScreen } from './SaveLoadScreen';
import { toast } from './SaveLoadScreen';

export interface SettingsOpts {
  /** 当前是否在游戏中（决定 存档 项是否可用） */
  inGame: boolean;
  onClose: () => void;
  /** 退出到菜单 */
  onExitToMenu: () => void;
  onChange: (s: GameSettings) => void;
  /** 菜单模式下读取存档并开始游戏 */
  onStartGame?: (slot: SaveSlot) => Promise<void> | void;
}

type Section = 'general' | 'advanced' | 'save' | 'load';

/**
 * 设置界面：包含 通用设置、高级设置、读档、存档、退出到菜单。
 * 主菜单打开时"存档"与"退出到菜单"不可用（菜单只有读档选项）。
 */
export class SettingsScreen {
  root: HTMLElement;
  private engine: Engine | null;
  private opts: SettingsOpts;
  private section: Section = 'general';
  private settings: GameSettings;

  constructor(engine: Engine | null, host: HTMLElement, opts: SettingsOpts) {
    this.engine = engine;
    this.opts = opts;
    this.settings = engine ? { ...engine.settings } : loadSettingsSyncDefaults();
    this.root = document.createElement('div');
    this.root.className = 'mv-screen mv-overlay';
    host.appendChild(this.root);
    this.render();
    void this.hydrate();
  }

  private async hydrate(): Promise<void> {
    if (!this.engine) {
      this.settings = await loadSettings();
      this.renderPanel();
    }
  }

  private render(): void {
    this.root.innerHTML = `
      <div class="mv-overlay-head">
        <h2>设置</h2>
        <button class="mv-back-btn mv-close">← 返回</button>
      </div>
      <div class="mv-overlay-body">
        <div class="mv-settings-grid">
          <div class="mv-settings-nav mv-menu-items">
            <button class="mv-menu-item nav-general">通用设置</button>
            <button class="mv-menu-item nav-advanced">高级设置</button>
            <button class="mv-menu-item nav-load">读档</button>
            <button class="mv-menu-item nav-save" ${this.opts.inGame ? '' : 'disabled'}>存档</button>
            <button class="mv-menu-item nav-exit" ${this.opts.inGame ? '' : 'disabled'}>退出到菜单</button>
          </div>
          <div class="mv-settings-panel"></div>
        </div>
      </div>
    `;
    this.root.querySelector('.mv-close')!.addEventListener('click', () => this.opts.onClose());
    const panel = this.root.querySelector('.mv-settings-panel')!;

    const nav = (sel: string, section: Section) => {
      this.root.querySelector(sel)!.addEventListener('click', () => {
        this.section = section;
        this.renderPanel();
      });
    };
    nav('.nav-general', 'general');
    nav('.nav-advanced', 'advanced');
    this.root.querySelector('.nav-load')!.addEventListener('click', () => {
      this.openSaveLoad('load');
    });
    this.root.querySelector('.nav-save')!.addEventListener('click', () => {
      if (this.opts.inGame) this.openSaveLoad('save');
    });
    this.root.querySelector('.nav-exit')!.addEventListener('click', () => {
      if (this.opts.inGame) this.opts.onExitToMenu();
    });

    this.renderPanel();
  }

  private openSaveLoad(mode: 'save' | 'load'): void {
    const sub = new SaveLoadScreen(this.engine, this.root.parentElement ?? this.root, {
      mode,
      onPick: this.opts.onStartGame,
      onClose: () => sub.destroy()
    });
  }

  private async renderPanel(): Promise<void> {
    const panel = this.root.querySelector('.mv-settings-panel')!;
    if (this.section === 'general') {
      panel.innerHTML = `
        <h3>通用设置</h3>
        <div class="mv-field">
          <label>文字速度 <output>${Math.round(1000 / this.settings.textSpeed)} 字/秒</output></label>
          <input type="range" name="textSpeed" min="8" max="80" step="2" value="${this.settings.textSpeed}">
        </div>
        <div class="mv-field">
          <label>自动播放停留 <output>${(this.settings.autoSpeed / 1000).toFixed(1)} 秒</output></label>
          <input type="range" name="autoSpeed" min="300" max="3000" step="100" value="${this.settings.autoSpeed}">
        </div>
        <div class="mv-field">
          <label>背景音乐音量 <output>${Math.round(this.settings.bgmVolume * 100)}%</output></label>
          <input type="range" name="bgmVolume" min="0" max="1" step="0.05" value="${this.settings.bgmVolume}">
        </div>
        <div class="mv-field">
          <label>音效音量 <output>${Math.round(this.settings.sfxVolume * 100)}%</output></label>
          <input type="range" name="sfxVolume" min="0" max="1" step="0.05" value="${this.settings.sfxVolume}">
        </div>
      `;
      const bind = (name: string, key: keyof GameSettings, fmt: (v: number) => string) => {
        const input = panel.querySelector<HTMLInputElement>(`input[name="${name}"]`)!;
        const out = panel.querySelector('output')!;
        input.addEventListener('input', () => {
          (this.settings as unknown as Record<string, number>)[key] = Number(input.value);
          this.apply();
          out.textContent = fmt(Number(input.value));
        });
      };
      bind('textSpeed', 'textSpeed', (v) => `${Math.round(1000 / v)} 字/秒`);
      bind('autoSpeed', 'autoSpeed', (v) => `${(v / 1000).toFixed(1)} 秒`);
      bind('bgmVolume', 'bgmVolume', (v) => `${Math.round(v * 100)}%`);
      bind('sfxVolume', 'sfxVolume', (v) => `${Math.round(v * 100)}%`);
    } else if (this.section === 'advanced') {
      panel.innerHTML = `
        <h3>高级设置</h3>
        <div class="mv-switch">
          <span>快进仅限已读场景（规范行为，不可关闭）</span>
          <span class="mv-switch-state">已启用 ✓</span>
        </div>
        <div class="mv-switch">
          <span>场景级自动存档（写入 Auto 选项卡）</span>
          <span class="mv-switch-state">已启用 ✓</span>
        </div>
        <div class="mv-switch">
          <span>读档 / 存档档案互通</span>
          <span class="mv-switch-state">已启用 ✓</span>
        </div>
        <p style="color:var(--b-dim);font-size:12px;line-height:1.8;max-width:460px">
          提示：以上为蓝色模板默认行为。若需要完全自定义存档策略，
          可在编辑器中使用脚本节点（Lua / JavaScript）扩展存档逻辑。
        </p>
      `;
    }
  }

  private apply(): void {
    this.engine?.applySettings(this.settings);
    void persistSettings(this.settings);
    this.opts.onChange(this.settings);
  }

  destroy(): void {
    this.apply();
    toast('设置已保存');
    this.root.remove();
  }
}

function loadSettingsSyncDefaults(): GameSettings {
  return { textSpeed: 28, autoSpeed: 900, bgmVolume: 0.6, sfxVolume: 0.8, skipOnlyRead: true };
}
