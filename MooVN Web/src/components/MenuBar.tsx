import React, { useState } from 'react';
import {
  Play,
  Download,
  Undo2,
  Redo2,
  FolderOpen,
  RotateCcw,
  LayoutGrid,
  Columns,
  Grid,
  Globe,
  Settings,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
} from 'lucide-react';
import { PanelId } from '../types';
import { useUILanguage } from '../lib/i18n';

export type RailPosition = 'left' | 'right' | 'top' | 'bottom';
export type DockDirection = 'left' | 'right' | 'top' | 'bottom' | 'center';

export interface WindowPanelDescriptor {
  id: PanelId;
  title: string;
  docked: boolean;
  floating: boolean;
}

interface MenuBarProps {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  panels: WindowPanelDescriptor[];
  railPosition?: RailPosition;
  onChangeRailPosition?: (pos: RailPosition) => void;
  onMoveWindowOrder?: (id: PanelId, dir: 'up' | 'down') => void;
  onDockWindowAtDirection?: (id: PanelId, dir: DockDirection) => void;
  onOpenOrFocusWindow: (id: PanelId, mode?: 'dock' | 'float') => void;
  onToggleDockFloat: (id: PanelId) => void;
  onApplyLayoutPreset: (
    preset: 'default_ide' | 'quad_2x2' | 'multi_col_4' | 'canvas_stage_terminal'
  ) => void;
  onResetLayout: () => void;
  onPlayPreview: () => void;
  onOpenExportModal: () => void;
  onOpenProjectLauncher: () => void;
  onOpenSettingsModal?: () => void;
  onOpenOfficialPortal?: () => void;
}

export const MenuBar: React.FC<MenuBarProps> = ({
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  panels,
  railPosition = 'left',
  onChangeRailPosition,
  onMoveWindowOrder,
  onDockWindowAtDirection,
  onOpenOrFocusWindow,
  onToggleDockFloat,
  onApplyLayoutPreset,
  onResetLayout,
  onPlayPreview,
  onOpenExportModal,
  onOpenProjectLauncher,
  onOpenSettingsModal,
  onOpenOfficialPortal,
}) => {
  const [openWindowMenu, setOpenWindowMenu] = useState(false);
  const { t } = useUILanguage();

  return (
    <header className="h-9 bg-[#141417] border-b border-[#27272c] px-2.5 flex items-center justify-between select-none z-50 shrink-0 text-xs">
      {/* Left: Portal, Project, Undo/Redo, Window & Layout */}
      <div className="flex items-center gap-1 min-w-0">
        {onOpenOfficialPortal && (
          <>
            <button
              type="button"
              onClick={onOpenOfficialPortal}
              className="px-2 py-1 rounded text-zinc-300 hover:text-white hover:bg-[#1f1f25] flex items-center gap-1.5 transition shrink-0"
              title={t('menu.portal')}
            >
              <Globe className="w-3.5 h-3.5" strokeWidth={1.6} />
              <span className="hidden sm:inline">{t('menu.portal')}</span>
            </button>
            <div className="w-px h-3.5 bg-[#27272c] mx-0.5 shrink-0" />
          </>
        )}

        <button
          type="button"
          onClick={onOpenProjectLauncher}
          className="px-2 py-1 rounded text-zinc-300 hover:text-white hover:bg-[#1f1f25] flex items-center gap-1.5 transition shrink-0"
          title={t('menu.project')}
        >
          <FolderOpen className="w-3.5 h-3.5" strokeWidth={1.6} />
          <span>{t('menu.project')}</span>
        </button>

        <div className="w-px h-3.5 bg-[#27272c] mx-0.5 shrink-0" />

        <button
          type="button"
          disabled={!canUndo}
          onClick={onUndo}
          className="icon-btn !w-6 !h-6 shrink-0"
          title={t('menu.undo')}
        >
          <Undo2 className="w-3.5 h-3.5" strokeWidth={1.6} />
        </button>
        <button
          type="button"
          disabled={!canRedo}
          onClick={onRedo}
          className="icon-btn !w-6 !h-6 shrink-0"
          title={t('menu.redo')}
        >
          <Redo2 className="w-3.5 h-3.5" strokeWidth={1.6} />
        </button>

        <div className="w-px h-3.5 bg-[#27272c] mx-0.5 hidden sm:block shrink-0" />

        {/* Window & Layout Dropdown */}
        <div className="relative hidden sm:block shrink-0">
          <button
            type="button"
            onClick={() => setOpenWindowMenu((v) => !v)}
            className={`px-2 py-1 rounded text-xs flex items-center gap-1.5 transition ${
              openWindowMenu
                ? 'bg-[#27272c] text-white'
                : 'text-zinc-300 hover:text-white hover:bg-[#1f1f25]'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" strokeWidth={1.6} />
            <span>{t('menu.layout')}</span>
          </button>

          {openWindowMenu && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setOpenWindowMenu(false)}
              />
              <div className="absolute left-0 top-8 z-50 w-96 bg-[#1c1c21] border border-[#2e2e36] rounded-lg shadow-2xl p-2.5 space-y-2.5">
                {/* 1. Window Options Bar Position (`窗口选项位置`) */}
                {onChangeRailPosition && (
                  <div className="space-y-1">
                    <div className="px-1 text-[10px] font-semibold text-zinc-400">
                      {t('layout.railPos')}
                    </div>
                    <div className="grid grid-cols-4 gap-1">
                      {(
                        [
                          ['left', t('layout.pos.left')],
                          ['right', t('layout.pos.right')],
                          ['top', t('layout.pos.top')],
                          ['bottom', t('layout.pos.bottom')],
                        ] as const
                      ).map(([pos, label]) => (
                        <button
                          key={pos}
                          type="button"
                          onClick={() => onChangeRailPosition(pos)}
                          className={`py-1 rounded text-[11px] border transition ${
                            railPosition === pos
                              ? 'bg-zinc-200 text-zinc-950 border-zinc-200 font-semibold'
                              : 'bg-[#23232b] border-[#32323c] text-zinc-300 hover:text-white'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="h-px bg-[#2c2c34]" />

                {/* 2. Layout Presets */}
                <div className="space-y-1">
                  <div className="px-1 text-[10px] font-semibold text-zinc-400">
                    {t('layout.presets')}
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        onApplyLayoutPreset('quad_2x2');
                        setOpenWindowMenu(false);
                      }}
                      className="px-2 py-1.5 rounded bg-[#23232b] hover:bg-[#2d2d37] border border-[#32323c] text-[11px] text-zinc-200 flex items-center gap-1.5"
                    >
                      <Grid className="w-3 h-3" strokeWidth={1.6} />
                      <span>{t('layout.quad')}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onApplyLayoutPreset('multi_col_4');
                        setOpenWindowMenu(false);
                      }}
                      className="px-2 py-1.5 rounded bg-[#23232b] hover:bg-[#2d2d37] border border-[#32323c] text-[11px] text-zinc-200 flex items-center gap-1.5"
                    >
                      <Columns className="w-3 h-3" strokeWidth={1.6} />
                      <span>{t('layout.col4')}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onApplyLayoutPreset('canvas_stage_terminal');
                        setOpenWindowMenu(false);
                      }}
                      className="px-2 py-1.5 rounded bg-[#23232b] hover:bg-[#2d2d37] border border-[#32323c] text-[11px] text-zinc-200 flex items-center gap-1.5"
                    >
                      <span>{t('layout.cst')}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onApplyLayoutPreset('default_ide');
                        setOpenWindowMenu(false);
                      }}
                      className="px-2 py-1.5 rounded bg-[#23232b] hover:bg-[#2d2d37] border border-[#32323c] text-[11px] text-zinc-200 flex items-center gap-1.5"
                    >
                      <span>{t('layout.std')}</span>
                    </button>
                  </div>
                </div>

                <div className="h-px bg-[#2c2c34]" />

                {/* 3. Windows List: Reorder Option Position + Free Dock Direction (Left/Right/Top/Bottom) + Float */}
                <div className="px-1 text-[10px] font-semibold text-zinc-400">
                  {t('layout.windows')}
                </div>

                <div className="space-y-1 max-h-64 overflow-y-auto pr-0.5">
                  {panels.map((p, idx) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between px-2 py-1.5 rounded bg-[#16161b] hover:bg-[#23232b] text-xs gap-2"
                    >
                      <div className="flex items-center gap-1 min-w-0">
                        {onMoveWindowOrder && (
                          <div className="flex items-center gap-0.5 shrink-0">
                            <button
                              type="button"
                              disabled={idx === 0}
                              onClick={() => onMoveWindowOrder(p.id, 'up')}
                              className="p-0.5 rounded hover:bg-[#32323e] disabled:opacity-25 text-zinc-400 hover:text-white"
                              title="上移此窗口选项顺序"
                            >
                              <ArrowUp className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              disabled={idx === panels.length - 1}
                              onClick={() => onMoveWindowOrder(p.id, 'down')}
                              className="p-0.5 rounded hover:bg-[#32323e] disabled:opacity-25 text-zinc-400 hover:text-white"
                              title="下移此窗口选项顺序"
                            >
                              <ArrowDown className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                        <span className="text-zinc-200 truncate font-medium">
                          {p.title}
                        </span>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {onDockWindowAtDirection && (
                          <div className="flex items-center bg-[#121216] rounded border border-[#2c2c36] p-0.5 gap-0.5">
                            <button
                              type="button"
                              onClick={() => onDockWindowAtDirection(p.id, 'left')}
                              className="p-0.5 rounded hover:bg-sky-500/25 text-zinc-400 hover:text-sky-300"
                              title="停靠到左侧"
                            >
                              <ArrowLeft className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onDockWindowAtDirection(p.id, 'top')}
                              className="p-0.5 rounded hover:bg-sky-500/25 text-zinc-400 hover:text-sky-300"
                              title="停靠到顶部"
                            >
                              <ArrowUp className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onDockWindowAtDirection(p.id, 'bottom')}
                              className="p-0.5 rounded hover:bg-sky-500/25 text-zinc-400 hover:text-sky-300"
                              title="停靠到底部"
                            >
                              <ArrowDown className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onDockWindowAtDirection(p.id, 'right')}
                              className="p-0.5 rounded hover:bg-sky-500/25 text-zinc-400 hover:text-sky-300"
                              title="停靠到右侧"
                            >
                              <ArrowRight className="w-3 h-3" />
                            </button>
                          </div>
                        )}

                        <button
                          type="button"
                          onClick={() => onOpenOrFocusWindow(p.id, 'dock')}
                          className={`px-1.5 py-0.5 rounded text-[10px] transition ${
                            p.docked
                              ? 'bg-zinc-200 text-zinc-950 font-semibold'
                              : 'bg-[#141417] text-zinc-400 hover:text-zinc-200'
                          }`}
                        >
                          {t('layout.dock')}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (p.docked || p.floating) {
                              onToggleDockFloat(p.id);
                            } else {
                              onOpenOrFocusWindow(p.id, 'float');
                            }
                          }}
                          className={`px-1.5 py-0.5 rounded text-[10px] transition ${
                            p.floating
                              ? 'bg-zinc-200 text-zinc-950 font-semibold'
                              : 'bg-[#141417] text-zinc-400 hover:text-zinc-200'
                          }`}
                        >
                          {t('layout.float')}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="h-px bg-[#2c2c34]" />
                <button
                  type="button"
                  onClick={() => {
                    onResetLayout();
                    setOpenWindowMenu(false);
                  }}
                  className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded text-xs text-zinc-400 hover:text-white hover:bg-[#27272e]"
                >
                  <RotateCcw className="w-3 h-3" strokeWidth={1.6} />
                  <span>{t('layout.reset')}</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Right: Settings, Run Preview & Export */}
      <div className="flex items-center gap-1.5 shrink-0">
        {onOpenSettingsModal && (
          <button
            type="button"
            onClick={onOpenSettingsModal}
            className="px-2 py-1 rounded text-zinc-300 hover:text-white hover:bg-[#1f1f25] flex items-center gap-1 transition"
            title={t('menu.settings')}
          >
            <Settings className="w-3.5 h-3.5" strokeWidth={1.6} />
            <span className="hidden sm:inline">{t('menu.settings')}</span>
          </button>
        )}

        <button
          type="button"
          onClick={onPlayPreview}
          className="px-2.5 py-1 rounded bg-[#232329] hover:bg-[#2c2c34] text-zinc-100 border border-[#32323a] flex items-center gap-1.5 transition"
        >
          <Play className="w-3 h-3 fill-current" strokeWidth={1.6} />
          <span>{t('menu.run')}</span>
        </button>

        <button
          type="button"
          onClick={onOpenExportModal}
          className="px-2.5 py-1 rounded bg-zinc-100 hover:bg-white text-zinc-950 font-semibold flex items-center gap-1.5 transition"
        >
          <Download className="w-3 h-3" strokeWidth={1.8} />
          <span>{t('menu.export')}</span>
        </button>
      </div>
    </header>
  );
};
