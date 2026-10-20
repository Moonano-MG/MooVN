import type { Engine } from '../engine/Engine';
import {
  TAB_IDS, TAB_LABELS, SLOTS_PER_TAB, SaveData, SaveSlot, TabId,
  formatSaveTime, formatPlayTime, loadSaveData
} from '../engine/states';

export interface SaveLoadOpts {
  /** save=存档（可写入 quick/1-0），load=读档 */
  mode: 'save' | 'load';
  onClose: () => void;
  /** 独立读取回调（主菜单读取存档时使用，不依赖已创建的引擎） */
  onPick?: (slot: SaveSlot) => Promise<void> | void;
}

/**
 * 存读档界面（设置界面的子页，也可由主菜单"读取存档"进入）。
 * - Auto / 快速 / 1..0 共 12 个选项卡，每卡 6 档（3 列 × 2 行）
 * - 空档显示"空档案"；已存档显示场景截图 + 保存时间
 * - 读档/存档档案互通（同一份 SaveData）
 */
export class SaveLoadScreen {
  root: HTMLElement;
  /** 菜单读取模式可不传引擎（仅列出/读取存档） */
  private engine: Engine | null;
  private opts: SaveLoadOpts;
  private activeTab: TabId = 'quick';
  private data: SaveData | null = null;
  private tabsEl!: HTMLDivElement;
  private slotsEl!: HTMLDivElement;
  private titleEl!: HTMLElement;

  constructor(engine: Engine | null, host: HTMLElement, opts: SaveLoadOpts) {
    this.engine = engine;
    this.opts = opts;
    this.root = document.createElement('div');
    this.root.className = 'mv-screen mv-overlay';
    host.appendChild(this.root);
    if (opts.mode === 'load') this.activeTab = 'quick';
    void this.render();
  }

  async refresh(): Promise<void> {
    // 读档/存档档案互通：直接读全局 SaveData，不依赖引擎实例
    this.data = await loadSaveData();
    this.renderTabs();
    this.renderSlots();
  }

  private async render(): Promise<void> {
    this.root.innerHTML = `
      <div class="mv-overlay-head">
        <h2>${this.opts.mode === 'save' ? '存档' : '读取存档'}</h2>
        <button class="mv-back-btn mv-close">← 返回</button>
      </div>
      <div class="mv-overlay-body">
        <div class="mv-tabs"></div>
        <div class="mv-slots"></div>
      </div>
    `;
    this.titleEl = this.root.querySelector('h2')!;
    this.root.querySelector('.mv-close')!.addEventListener('click', () => this.opts.onClose());
    this.tabsEl = this.root.querySelector('.mv-tabs')!;
    this.slotsEl = this.root.querySelector('.mv-slots')!;
    await this.refresh();
  }

  private renderTabs(): void {
    this.tabsEl.innerHTML = '';
    for (const id of TAB_IDS) {
      const btn = document.createElement('button');
      btn.className = `mv-tab${id === this.activeTab ? ' active' : ''}`;
      btn.type = 'button';
      btn.textContent = TAB_LABELS[id];
      btn.addEventListener('click', () => {
        this.activeTab = id;
        this.renderTabs();
        this.renderSlots();
      });
      this.tabsEl.appendChild(btn);
    }
  }

  private renderSlots(): void {
    const slots = this.data?.tabs[this.activeTab] ?? new Array(SLOTS_PER_TAB).fill(null);
    this.slotsEl.innerHTML = '';
    const canSave = this.opts.mode === 'save' && this.activeTab !== 'auto';

    slots.forEach((slot, i) => {
      const cell = document.createElement('div');
      cell.className = 'mv-slot' + (slot ? '' : ' empty');

      const no = document.createElement('span');
      no.className = 'mv-slot-no';
      no.textContent = `${TAB_LABELS[this.activeTab]}-${i + 1}`;
      cell.appendChild(no);

      if (slot) {
        if (slot.thumbnail) {
          const img = document.createElement('img');
          img.className = 'mv-slot-thumb';
          img.alt = `${slot.sceneTitle} 存档画面`;
          img.src = slot.thumbnail;
          cell.appendChild(img);
        }
        const info = document.createElement('div');
        info.className = 'mv-slot-info';
        info.innerHTML = `
          <b>${escapeHtml(slot.chapterTitle)} · ${escapeHtml(slot.sceneTitle)}</b>
          <time>${formatSaveTime(slot.saveTime)} · ${formatPlayTime(slot.playTime)}</time>
        `;
        cell.appendChild(info);
        cell.title = `保存于 ${formatSaveTime(slot.saveTime)}`;
      } else {
        const empty = document.createElement('div');
        empty.className = 'mv-slot-empty';
        empty.textContent = '空档案';
        cell.appendChild(empty);
      }

      // Auto 选项卡为系统自动存档，不允许手动写入
      if (canSave) {
        cell.addEventListener('click', async () => {
          if (!this.engine) return;
          cell.classList.add('locked');
          await this.engine.saveTo(this.activeTab, i);
          await this.refresh();
          toast(this.opts.mode === 'save' ? '已保存' : '已读取');
        });
      } else if (this.opts.mode === 'load' && slot) {
        cell.addEventListener('click', async () => {
          cell.classList.add('locked');
          try {
            if (this.opts.onPick) {
              await this.opts.onPick(slot);
            } else if (this.engine) {
              await this.engine.loadFrom(slot);
              toast('已读取存档');
              this.opts.onClose();
            }
          } catch (err) {
            console.error(err);
            toast('读档失败，请重试');
            cell.classList.remove('locked');
          }
        });
      } else if (this.opts.mode === 'save') {
        cell.classList.add('locked');
        cell.title = this.activeTab === 'auto' ? 'Auto 选项卡由系统自动写入' : '空档案';
      }

      this.slotsEl.appendChild(cell);
    });
  }

  destroy(): void {
    this.root.remove();
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

export function toast(msg: string): void {
  const el = document.createElement('div');
  el.className = 'mv-toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1800);
}
