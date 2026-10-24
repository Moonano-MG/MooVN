import React, { useState } from 'react';
import {
  Play,
  Download,
  Undo2,
  Redo2,
  FolderOpen,
  RotateCcw,
  LayoutGrid,
  Settings,
  Maximize2,
  Minimize2,
  SlidersHorizontal,
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
  isFocusMode?: boolean;
  onToggleFocusMode?: () => void;
  railPosition?: RailPosition;
  onChangeRailPosition?: (pos: RailPosition) => void;
  onMoveWindowOrder?: (id: PanelId, dir: 'up' | 'down') => void;
  onDockWindowAtDirection?: (id: PanelId, dir: DockDirection) => void;
  onOpenOrFocusWindow: (id: PanelId, mode?: 'dock' | 'float') => void;
  onToggleDockFloat: (id: PanelId) => void;
  onApplyLayoutPreset?: (preset: 'default_ide') => void;
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
  isFocusMode = false,
  onToggleFocusMode,
  railPosition = 'left',
  onChangeRailPosition,
  onMoveWindowOrder,
  onDockWindowAtDirection,
  onOpenOrFocusWindow,
  onToggleDockFloat,
  onResetLayout,
  onPlayPreview,
  onOpenExportModal,
  onOpenProjectLauncher,
  onOpenSettingsModal,
}) => {
  const { t } = useUILanguage();
  const [showWindowMenu, setShowWindowMenu] = useState(false);

  return (
    <header className="min-h-9 py-1 bg-[#141417] border-b border-[#27272c] px-2.5 flex flex-wrap items-center justify-between gap-2 select-none text-xs shrink-0 z-50">
      {/* Left: Brand, Project, Undo/Redo, Layout & Inspector */}
      <div className="flex flex-wrap items-center gap-1.5 min-w-0">
        <span className="font-semibold text-zinc-100 tracking-wide px-1.5">
          MooVN Studio
        </span>

        <div className="h-3.5 w-px bg-[#2a2a30] mx-0.5" />

        <button
          onClick={onOpenProjectLauncher}
          className="px-2 py-1 rounded hover:bg-[#232329] text-zinc-300 hover:text-white flex items-center gap-1.5 transition"
          title={t('menu.projects')}
        >
          <FolderOpen className="w-3.5 h-3.5" strokeWidth={1.6} />
          <span>{t('menu.projects')}</span>
        </button>

        <div className="flex items-center gap-0.5">
          <button
            onClick={onUndo}
            disabled={!canUndo}
            className="icon-btn"
            title={t('menu.undo')}
          >
            <Undo2 className="w-3.5 h-3.5" strokeWidth={1.6} />
          </button>
          <button
            onClick={onRedo}
            disabled={!canRedo}
            className="icon-btn"
            title={t('menu.redo')}
          >
            <Redo2 className="w-3.5 h-3.5" strokeWidth={1.6} />
          </button>
        </div>

        <div className="h-3.5 w-px bg-[#2a2a30] mx-0.5" />

        {/* 1-Click Focus Editor Toggle ("只留一个编辑区") */}
        {onToggleFocusMode && (
          <button
            onClick={onToggleFocusMode}
            className={`px-2 py-1 rounded flex items-center gap-1.5 transition ${
              isFocusMode
                ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                : 'hover:bg-[#232329] text-zinc-300 hover:text-white'
            }`}
            title="只保留中央画布/脚本编辑区，或恢复三栏工作区"
          >
            {isFocusMode ? (
              <Minimize2 className="w-3.5 h-3.5" strokeWidth={1.6} />
            ) : (
              <Maximize2 className="w-3.5 h-3.5" strokeWidth={1.6} />
            )}
            <span>{isFocusMode ? '退出专注' : '专注编辑区'}</span>
          </button>
        )}

        {/* 1-Click Restore Default 3-Column Layout */}
        <button
          onClick={onResetLayout}
          className="px-2 py-1 rounded hover:bg-[#232329] text-zinc-300 hover:text-white flex items-center gap-1.5 transition"
          title="恢复默认三栏布局（大纲 | 画布与脚本 | 检查器）"
        >
          <RotateCcw className="w-3.5 h-3.5" strokeWidth={1.6} />
          <span>恢复三栏</span>
        </button>

        {/* Direct Inspector Toggle */}
        <button
          onClick={() => onOpenOrFocusWindow('inspector', 'dock')}
          className="px-2 py-1 rounded hover:bg-[#232329] text-zinc-300 hover:text-white flex items-center gap-1.5 transition"
          title="聚焦或打开右侧属性检查器"
        >
          <SlidersHorizontal className="w-3.5 h-3.5" strokeWidth={1.6} />
          <span>检查器</span>
        </button>

        {/* Window & Dock Manager Popover */}
        <div className="relative">
          <button
            onClick={() => setShowWindowMenu((v) => !v)}
            className={`px-2 py-1 rounded flex items-center gap-1.5 transition ${
              showWindowMenu
                ? 'bg-[#26262d] text-white'
                : 'hover:bg-[#232329] text-zinc-300 hover:text-white'
            }`}
            title={t('menu.windows')}
          >
            <LayoutGrid className="w-3.5 h-3.5" strokeWidth={1.6} />
            <span>{t('menu.windows')}</span>
          </button>

          {showWindowMenu && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setShowWindowMenu(false)}
              />
              <div className="absolute left-0 top-8 z-50 w-96 rounded-md bg-[#18181c] border border-[#2c2c33] shadow-2xl p-2.5 space-y-2.5 text-xs">
                {onChangeRailPosition && (
                  <div className="space-y-1">
                    <div className="text-[10px] text-zinc-500 px-1">
                      {t('menu.railPosition')}
                    </div>
                    <div className="grid grid-cols-4 gap-1">
                      {(
                        [
                          ['left', t('menu.railLeft')],
                          ['right', t('menu.railRight')],
                          ['top', t('menu.railTop')],
                          ['bottom', t('menu.railBottom')],
                        ] as const
                      ).map(([pos, label]) => (
                        <button
                          key={pos}
                          onClick={() => onChangeRailPosition(pos)}
                          className={`px-2 py-1 rounded border text-[11px] flex items-center justify-center transition ${
                            railPosition === pos
                              ? 'bg-sky-500/20 border-sky-400 text-sky-200 font-semibold'
                              : 'bg-[#202026] border-[#2c2c34] text-zinc-300 hover:text-white'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="border-t border-[#27272e] pt-2 space-y-1 max-h-72 overflow-y-auto">
                  {panels.map((p, idx) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between px-1.5 py-1 rounded hover:bg-[#222228] gap-1"
                    >
                      <div className="flex items-center gap-1 min-w-0 flex-1">
                        {onMoveWindowOrder && (
                          <div className="flex flex-col">
                            <button
                              type="button"
                              disabled={idx === 0}
                              onClick={() => onMoveWindowOrder(p.id, 'up')}
                              className="text-zinc-500 hover:text-zinc-200 disabled:opacity-25"
                              title="上移"
                            >
                              <ArrowUp className="w-2.5 h-2.5" />
                            </button>
                            <button
                              type="button"
                              disabled={idx === panels.length - 1}
                              onClick={() => onMoveWindowOrder(p.id, 'down')}
                              className="text-zinc-500 hover:text-zinc-200 disabled:opacity-25"
                              title="下移"
                            >
                              <ArrowDown className="w-2.5 h-2.5" />
                            </button>
                          </div>
                        )}
                        <button
                          onClick={() => {
                            onOpenOrFocusWindow(p.id, 'dock');
                            setShowWindowMenu(false);
                          }}
                          className="text-left text-zinc-200 hover:text-white truncate flex-1 pl-1"
                        >
                          {p.title}
                        </button>
                      </div>

                      <div className="flex items-center gap-0.5 shrink-0">
                        {onDockWindowAtDirection && (
                          <>
                            <button
                              type="button"
                              onClick={() => onDockWindowAtDirection(p.id, 'left')}
                              className="w-5 h-5 rounded bg-[#222229] hover:bg-sky-500/30 text-zinc-400 hover:text-sky-200 flex items-center justify-center"
                              title="停靠到左侧"
                            >
                              <ArrowLeft className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onDockWindowAtDirection(p.id, 'top')}
                              className="w-5 h-5 rounded bg-[#222229] hover:bg-sky-500/30 text-zinc-400 hover:text-sky-200 flex items-center justify-center"
                              title="停靠到上方"
                            >
                              <ArrowUp className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onDockWindowAtDirection(p.id, 'bottom')}
                              className="w-5 h-5 rounded bg-[#222229] hover:bg-sky-500/30 text-zinc-400 hover:text-sky-200 flex items-center justify-center"
                              title="停靠到下方"
                            >
                              <ArrowDown className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onDockWindowAtDirection(p.id, 'right')}
                              className="w-5 h-5 rounded bg-[#222229] hover:bg-sky-500/30 text-zinc-400 hover:text-sky-200 flex items-center justify-center"
                              title="停靠到右侧"
                            >
                              <ArrowRight className="w-3 h-3" />
                            </button>
                          </>
                        )}

                        <button
                          onClick={() => onToggleDockFloat(p.id)}
                          className={`px-1.5 py-0.5 rounded text-[10px] border transition ml-1 ${
                            p.floating
                              ? 'bg-zinc-200 text-zinc-900 border-zinc-300 font-medium'
                              : p.docked
                              ? 'bg-[#24242b] text-zinc-300 border-[#34343d]'
                              : 'bg-transparent text-zinc-500 border-[#2b2b32]'
                          }`}
                        >
                          {p.floating
                            ? t('menu.floating')
                            : p.docked
                            ? t('menu.docked')
                            : t('menu.closed')}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Right: Settings, Preview, Export */}
      <div className="flex items-center gap-1.5 shrink-0">
        {onOpenSettingsModal && (
          <button
            onClick={onOpenSettingsModal}
            className="px-2 py-1 rounded hover:bg-[#232329] text-zinc-300 hover:text-white flex items-center gap-1 transition"
            title={t('menu.settings')}
          >
            <Settings className="w-3.5 h-3.5" strokeWidth={1.6} />
            <span>{t('menu.settings')}</span>
          </button>
        )}

        <button
          onClick={onPlayPreview}
          className="px-2.5 py-1 rounded bg-zinc-200 hover:bg-white text-zinc-950 font-medium flex items-center gap-1.5 transition"
        >
          <Play className="w-3 h-3 fill-current" />
          <span>{t('menu.preview')}</span>
        </button>

        <button
          onClick={onOpenExportModal}
          className="px-2.5 py-1 rounded bg-[#232329] hover:bg-[#2d2d35] border border-[#34343e] text-zinc-200 flex items-center gap-1.5 transition"
        >
          <Download className="w-3.5 h-3.5" strokeWidth={1.6} />
          <span>{t('menu.export')}</span>
        </button>
      </div>
    </header>
  );
};

export default MenuBar;
