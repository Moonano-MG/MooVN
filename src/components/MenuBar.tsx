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
} from 'lucide-react';
import { PanelId } from '../types';

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
  onOpenOrFocusWindow: (id: PanelId, mode?: 'dock' | 'float') => void;
  onToggleDockFloat: (id: PanelId) => void;
  onApplyLayoutPreset: (
    preset: 'default_ide' | 'quad_2x2' | 'multi_col_4' | 'canvas_stage_terminal'
  ) => void;
  onResetLayout: () => void;
  onPlayPreview: () => void;
  onOpenExportModal: () => void;
  onOpenProjectLauncher: () => void;
}

export const MenuBar: React.FC<MenuBarProps> = ({
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  panels,
  onOpenOrFocusWindow,
  onToggleDockFloat,
  onApplyLayoutPreset,
  onResetLayout,
  onPlayPreview,
  onOpenExportModal,
  onOpenProjectLauncher,
}) => {
  const [openWindowMenu, setOpenWindowMenu] = useState(false);

  return (
    <header className="h-9 bg-[#141417] border-b border-[#27272c] px-2.5 flex items-center justify-between select-none z-50 shrink-0 text-xs">
      {/* Left: Project, Undo/Redo, Window & 2D Split Layout Menu */}
      <div className="flex items-center gap-1">
        <button
          onClick={onOpenProjectLauncher}
          className="px-2 py-1 rounded text-zinc-300 hover:text-white hover:bg-[#1f1f25] flex items-center gap-1.5 transition"
          title="新建 / 打开 / 保存工程"
        >
          <FolderOpen className="w-3.5 h-3.5" strokeWidth={1.6} />
          <span>工程</span>
        </button>

        <div className="w-px h-3.5 bg-[#27272c] mx-0.5" />

        <button
          disabled={!canUndo}
          onClick={onUndo}
          className="icon-btn !w-6 !h-6"
          title="撤销 (Ctrl+Z)"
        >
          <Undo2 className="w-3.5 h-3.5" strokeWidth={1.6} />
        </button>
        <button
          disabled={!canRedo}
          onClick={onRedo}
          className="icon-btn !w-6 !h-6"
          title="重做 (Ctrl+Y)"
        >
          <Redo2 className="w-3.5 h-3.5" strokeWidth={1.6} />
        </button>

        <div className="w-px h-3.5 bg-[#27272c] mx-0.5" />

        {/* Window & 2D Layout Dropdown */}
        <div className="relative">
          <button
            onClick={() => setOpenWindowMenu((v) => !v)}
            className={`px-2 py-1 rounded text-xs flex items-center gap-1.5 transition ${
              openWindowMenu
                ? 'bg-[#27272c] text-white'
                : 'text-zinc-300 hover:text-white hover:bg-[#1f1f25]'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" strokeWidth={1.6} />
            <span>窗口与分栏布局</span>
          </button>

          {openWindowMenu && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setOpenWindowMenu(false)}
              />
              <div className="absolute left-0 top-8 z-50 w-72 bg-[#1c1c21] border border-[#2e2e36] rounded-lg shadow-2xl p-2 space-y-2">
                <div className="px-2 py-0.5 text-[10px] font-semibold text-zinc-400">
                  多维分栏快速布局
                </div>
                <div className="grid grid-cols-2 gap-1 px-1">
                  <button
                    onClick={() => {
                      onApplyLayoutPreset('quad_2x2');
                      setOpenWindowMenu(false);
                    }}
                    className="px-2 py-1.5 rounded bg-[#23232b] hover:bg-[#2d2d37] border border-[#32323c] text-[11px] text-zinc-200 flex items-center gap-1.5"
                  >
                    <Grid className="w-3 h-3" strokeWidth={1.6} />
                    四象限 (A|C / B|D)
                  </button>
                  <button
                    onClick={() => {
                      onApplyLayoutPreset('multi_col_4');
                      setOpenWindowMenu(false);
                    }}
                    className="px-2 py-1.5 rounded bg-[#23232b] hover:bg-[#2d2d37] border border-[#32323c] text-[11px] text-zinc-200 flex items-center gap-1.5"
                  >
                    <Columns className="w-3 h-3" strokeWidth={1.6} />
                    四列并排 (A|B|C|D)
                  </button>
                  <button
                    onClick={() => {
                      onApplyLayoutPreset('canvas_stage_terminal');
                      setOpenWindowMenu(false);
                    }}
                    className="px-2 py-1.5 rounded bg-[#23232b] hover:bg-[#2d2d37] border border-[#32323c] text-[11px] text-zinc-200 flex items-center gap-1.5"
                  >
                    画布+舞台+终端
                  </button>
                  <button
                    onClick={() => {
                      onApplyLayoutPreset('default_ide');
                      setOpenWindowMenu(false);
                    }}
                    className="px-2 py-1.5 rounded bg-[#23232b] hover:bg-[#2d2d37] border border-[#32323c] text-[11px] text-zinc-200 flex items-center gap-1.5"
                  >
                    清爽三栏
                  </button>
                </div>

                <div className="h-px bg-[#2c2c34]" />

                <div className="px-2 py-0.5 text-[10px] font-semibold text-zinc-400">
                  窗口状态 (支持直接拖拽标题栏切换停靠 ⇄ 漂浮)
                </div>

                <div className="space-y-0.5 max-h-64 overflow-y-auto">
                  {panels.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-[#27272e] text-xs"
                    >
                      <span className="text-zinc-200">{p.title}</span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => onOpenOrFocusWindow(p.id, 'dock')}
                          className={`px-1.5 py-0.5 rounded text-[10px] transition ${
                            p.docked
                              ? 'bg-zinc-200 text-zinc-950 font-semibold'
                              : 'bg-[#141417] text-zinc-400 hover:text-zinc-200'
                          }`}
                        >
                          停靠
                        </button>
                        <button
                          onClick={() => {
                            if (p.docked || p.floating) {
                              onToggleDockFloat(p.id);
                            } else {
                              onOpenOrFocusWindow(p.id, 'float');
                            }
                          }}
                          className={`px-1.5 py-0.5 rounded text-[10px] transition ${
                            p.floating
                              ? 'bg-sky-400 text-zinc-950 font-semibold'
                              : 'bg-[#141417] text-zinc-400 hover:text-zinc-200'
                          }`}
                        >
                          漂浮
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="h-px bg-[#2c2c34]" />
                <button
                  onClick={() => {
                    onResetLayout();
                    setOpenWindowMenu(false);
                  }}
                  className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded text-xs text-zinc-400 hover:text-white hover:bg-[#27272e]"
                >
                  <RotateCcw className="w-3 h-3" strokeWidth={1.6} />
                  重置默认布局
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Right: Run Preview & Export Game */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={onPlayPreview}
          className="px-2.5 py-1 rounded bg-[#232329] hover:bg-[#2c2c34] text-zinc-100 border border-[#32323a] flex items-center gap-1.5 transition"
        >
          <Play className="w-3 h-3 fill-current" strokeWidth={1.6} />
          <span>运行</span>
        </button>

        <button
          onClick={onOpenExportModal}
          className="px-2.5 py-1 rounded bg-zinc-100 hover:bg-white text-zinc-950 font-semibold flex items-center gap-1.5 transition"
        >
          <Download className="w-3 h-3" strokeWidth={1.8} />
          <span>导出</span>
        </button>
      </div>
    </header>
  );
};
