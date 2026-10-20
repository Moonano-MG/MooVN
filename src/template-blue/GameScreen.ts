import type { Engine } from '../engine/Engine';
import type { ChoiceOption } from '../common/types';

const ICONS = {
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
  auto: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>',
  skip: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 19 22 12 13 5 13 19"/><polygon points="2 19 11 12 2 5 2 19"/></svg>',
  hide: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>'
};

export interface GameScreenOpts {
  openSettings: () => void;
  openSaveLoad: (mode: 'save' | 'load') => void;
  onEnding: (e: { id: string; title: string; kind: string }) => void;
  onExitToMenu: () => void;
}

/**
 * 游戏内 UI：
 * - 底部对话框（黑底 + 深蓝边框）+ 名牌
 * - 控制条：后退 / 自动 / 快进 / 隐藏 / 设置
 * - 选项（对话框左上方，单行，悬浮浅蓝条）
 * - 顶部章节信息 + Auto/快进指示
 */
export class GameScreen {
  root: HTMLElement;
  engine: Engine;
  private opts: GameScreenOpts;
  private dialogEl!: HTMLDivElement;
  private nameEl!: HTMLDivElement;
  private textEl!: HTMLDivElement;
  private hintEl!: HTMLDivElement;
  private choicesEl!: HTMLDivElement;
  private topInfo!: HTMLDivElement;
  private indAuto!: HTMLElement;
  private indSkip!: HTMLElement;
  private autoBtn!: HTMLButtonElement;
  private skipBtn!: HTMLButtonElement;
  private hideBtn!: HTMLButtonElement;
  private typing = false;
  private typeBuf = '';
  private typeTimer: number | null = null;
  private hidden = false;
  private tickTimer: number | null = null;
  private lastTime = 0;

  constructor(engine: Engine, host: HTMLElement, opts: GameScreenOpts) {
    this.engine = engine;
    this.opts = opts;
    this.root = document.createElement('div');
    this.root.className = 'mv-screen mv-gameui';
    host.appendChild(this.root);
    this.build();
    this.wire();
  }

  private build(): void {
    this.root.innerHTML = `
      <div class="mv-topbar">
        <div class="mv-top-info"></div>
        <div class="mv-mode-ind">
          <span class="ind-auto" style="display:none">AUTO</span>
          <span class="ind-skip" style="display:none">快进中</span>
        </div>
      </div>
      <div class="mv-choices"></div>
      <div class="mv-controls">
        <button class="mv-ctl ctl-back" title="后退到上一个场景">${ICONS.back}<span>后退</span></button>
        <button class="mv-ctl ctl-auto" title="自动播放">${ICONS.auto}<span>自动</span></button>
        <button class="mv-ctl ctl-skip" title="快进（仅已读场景）">${ICONS.skip}<span>快进</span></button>
        <button class="mv-ctl ctl-hide" title="隐藏 UI（点击画面恢复）">${ICONS.hide}<span>隐藏</span></button>
        <button class="mv-ctl ctl-set" title="设置">${ICONS.gear}<span>设置</span></button>
      </div>
      <div class="mv-dialog">
        <div class="mv-nameplate"></div>
        <div class="mv-dialog-text"></div>
        <div class="mv-next-hint">▼ 点击继续</div>
      </div>
    `;
    this.topInfo = this.root.querySelector('.mv-top-info')!;
    this.indAuto = this.root.querySelector('.ind-auto')!;
    this.indSkip = this.root.querySelector('.ind-skip')!;
    this.choicesEl = this.root.querySelector('.mv-choices')!;
    this.dialogEl = this.root.querySelector('.mv-dialog')!;
    this.nameEl = this.root.querySelector('.mv-nameplate')!;
    this.textEl = this.root.querySelector('.mv-dialog-text')!;
    this.hintEl = this.root.querySelector('.mv-next-hint')!;
  }

  private wire(): void {
    const e = this.engine;

    e.on('scene', (s) => {
      this.topInfo.textContent = `${s.chapterTitle} · ${s.title}`;
    });

    e.on('dialogue', (d) => {
      this.dialogEl.classList.toggle('narration', d.narration);
      this.nameEl.textContent = d.narration ? '' : d.name;
      this.nameEl.style.color = d.color;
      this.nameEl.style.borderColor = d.narration ? 'var(--b-border)' : d.color;
      this.startTypewriter(d.text);
    });

    e.on('choices', (c) => {
      this.choicesEl.innerHTML = '';
      if (!c) return;
      for (const opt of c.options) {
        const btn = document.createElement('button');
        btn.className = 'mv-choice';
        btn.type = 'button';
        btn.textContent = opt.text;
        btn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          e.selectChoice(opt as ChoiceOption);
        });
        this.choicesEl.appendChild(btn);
      }
    });

    e.on('state', () => {
      this.autoBtn.classList.toggle('active', e.isAuto());
      this.skipBtn.classList.toggle('active', e.isSkip());
      this.indAuto.style.display = e.isAuto() ? '' : 'none';
      this.indSkip.style.display = e.isSkip() ? '' : 'none';
    });

    // 点击推进（对话框与舞台）
    this.dialogEl.addEventListener('pointerdown', (ev) => {
      ev.stopPropagation();
      if (this.hidden) { this.setHidden(false); return; }
      if (this.typing) {
        this.finishTypewriter();
        e.finishTyping();
        return;
      }
      e.clickThrough();
    });

    // 控制条
    this.root.querySelector('.ctl-back')!.addEventListener('click', (ev) => {
      ev.stopPropagation();
      e.setAuto(false);
      void e.back();
    });
    this.autoBtn = this.root.querySelector('.ctl-auto') as HTMLButtonElement;
    this.autoBtn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      e.setAuto(!e.isAuto());
      this.autoBtn.classList.toggle('active', e.isAuto());
      this.indAuto.style.display = e.isAuto() ? '' : 'none';
    });
    this.skipBtn = this.root.querySelector('.ctl-skip') as HTMLButtonElement;
    this.skipBtn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      e.setSkip(!e.isSkip());
      this.skipBtn.classList.toggle('active', e.isSkip());
      this.indSkip.style.display = e.isSkip() ? '' : 'none';
    });
    this.hideBtn = this.root.querySelector('.ctl-hide') as HTMLButtonElement;
    this.hideBtn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      this.setHidden(!this.hidden);
    });
    this.root.querySelector('.ctl-set')!.addEventListener('click', (ev) => {
      ev.stopPropagation();
      this.opts.openSettings();
    });

    // 键盘
    this.keyHandler = (ev) => {
      if (ev.repeat) return;
      if (ev.key === ' ' || ev.key === 'Enter') {
        ev.preventDefault();
        if (this.hidden) { this.setHidden(false); return; }
        if (this.typing) { this.finishTypewriter(); e.finishTyping(); return; }
        e.clickThrough();
      } else if (ev.key === 'a' || ev.key === 'A') {
        e.setAuto(!e.isAuto());
      } else if (ev.key === 'h' || ev.key === 'H') {
        this.setHidden(!this.hidden);
      } else if (ev.key === 'Escape') {
        this.opts.openSettings();
      }
    };
    window.addEventListener('keydown', this.keyHandler);
  }

  private keyHandler: ((ev: KeyboardEvent) => void) | null = null;

  /** 舞台点击（由 BlueTemplate 转发）：隐藏模式先恢复 */
  stageClick(): void {
    if (this.hidden) {
      this.setHidden(false);
      return;
    }
  }

  private setHidden(v: boolean): void {
    this.hidden = v;
    this.root.classList.toggle('ui-hidden', v);
  }

  private startTypewriter(text: string): void {
    this.typeBuf = text;
    this.typing = true;
    this.hintEl.classList.remove('show');
    this.textEl.textContent = '';
    if (this.typeTimer) clearInterval(this.typeTimer);
    const speed = this.engine.settings.textSpeed;
    let i = 0;
    this.typeTimer = window.setInterval(() => {
      i++;
      this.textEl.textContent = text.slice(0, i);
      if (i >= text.length) this.finishTypewriter();
    }, Math.max(6, speed));
  }

  private finishTypewriter(): void {
    if (this.typeTimer) {
      clearInterval(this.typeTimer);
      this.typeTimer = null;
    }
    this.textEl.textContent = this.typeBuf;
    this.typing = false;
    this.hintEl.classList.add('show');
  }

  /** 屏幕显示/隐藏（切到菜单等） */
  setVisible(v: boolean): void {
    this.root.classList.toggle('hidden', !v);
  }

  startTicker(): void {
    this.tickTimer = window.setInterval(() => {
      this.engine.tickPlayTime();
    }, 1000);
  }

  stopTicker(): void {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
  }

  destroy(): void {
    this.stopTicker();
    if (this.keyHandler) window.removeEventListener('keydown', this.keyHandler);
    this.root.remove();
  }
}
