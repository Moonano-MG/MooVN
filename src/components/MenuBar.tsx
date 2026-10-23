import React, { useState } from 'react';
import {
  Play,
  Download,
  Undo2,
  Redo2,
  FolderOpen,
  RotateCcw,
  LayoutGrid,
  Terminal as TerminalIcon,
  Bot,
  Wand2,
  Settings,
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
  onOpenSettingsModal: () => void;
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
  onOpenSettingsModal,
}) => {
  const [openWindowMenu, setOpenWindowMenu] = useState(false);

  const isWindowVisible = (id: PanelId) => {
    const found = panels.find((p) => p.id === id);
    return !!(found && (found.docked || found.floating));
  };

  return (
    <header className="h-10 bg-[#141417] border-b border-[#27272c] px-3 flex items-center justify-between select-none z-50 shrink-0 text-xs">
      {/* Left: File / Undo / Redo / Window & 2D Layout Manager */}
      <div className="flex items-center gap-1">
        <button
          onClick={onOpenProjectLauncher}
          className="icon-btn"
          title="项目管理器 (新建 / 打开 / 保存工程)"
        >
          <FolderOpen className="w-3.5 h-3.5" strokeWidth={1.6} />
        </button>

        <div className="w-px h-3.5 bg-[#27272c] mx-1" />

        <button
          disabled={!canUndo}
          onClick={onUndo}
          className="icon-btn"
          title="撤销 (Ctrl+Z)"
        >
          <Undo2 className="w-3.5 h-3.5" strokeWidth={1.6} />
        </button>
        <button
          disabled={!canRedo}
          onClick={onRedo}
          className="icon-btn"
          title="重做 (Ctrl+Y)"
        >
          <Redo2 className="w-3.5 h-3.5" strokeWidth={1.6} />
        </button>

        <div className="w-px h-3.5 bg-[#27272c] mx-1" />

        {/* VS Code 2D Window & Layout Dropdown */}
        <div className="relative">
          <button
            onClick={() => setOpenWindowMenu((v) => !v)}
            className={`px-2 py-1 rounded text-xs flex items-center gap-1.5 transition ${
              openWindowMenu
                ? 'bg-[#27272c] text-white'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#1f1f24]'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" strokeWidth={1.6} />
            <span>窗口与多维布局</span>
          </button>

          {openWindowMenu && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setOpenWindowMenu(false)}
              />
              <div className="absolute left-0 top-8 z-50 w-72 bg-[#1c1c21] border border-[#2e2e36] rounded-lg shadow-2xl p-2 space-y-2">
                <div className="px-2 py-1 text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">
                  2D 多行多列分栏预设
                </div>
                <div className="grid grid-cols-2 gap-1 px-1">
                  <button
                    onClick={() => {
                      onApplyLayoutPreset('quad_2x2');
                      setOpenWindowMenu(false);
                    }}
                    className="px-2 py-1.5 rounded bg-[#23232b] hover:bg-[#2d2d37] border border-[#32323c] text-[11px] text-zinc-200 flex items-center gap-1.5"
                    title="上方 窗口A | 窗口C，下方 窗口B | 窗口D"
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
                    title="多列并排 窗口A | 窗口B | 窗口C | 窗口D"
                  >
                    <Columns className="w-3 h-3" strokeWidth={1.6} />
                    多列并排 (A|B|C|D)
                  </button>
                  <button
                    onClick={() => {
                      onApplyLayoutPreset('canvas_stage_terminal');
                      setOpenWindowMenu(false);
                    }}
                    className="px-2 py-1.5 rounded bg-[#23232b] hover:bg-[#2d2d37] border border-[#32323c] text-[11px] text-zinc-200 flex items-center gap-1.5"
                  >
                    画布 + 舞台 + 终端
                  </button>
                  <button
                    onClick={() => {
                      onApplyLayoutPreset('default_ide');
                      setOpenWindowMenu(false);
                    }}
                    className="px-2 py-1.5 rounded bg-[#23232b] hover:bg-[#2d2d37] border border-[#32323c] text-[11px] text-zinc-200 flex items-center gap-1.5"
                  >
                    标准工作台
                  </button>
                </div>

                <div className="h-px bg-[#2c2c34]" />

                <div className="px-2 py-0.5 text-[10px] font-semibold text-zinc-400">
                  全部窗口 (可自由拖拽停靠 ⇄ 漂浮)
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

      {/* Center: VS Code Style Window Quick-Toggles (Open/Focus Docked or Floating Windows) */}
      <div className="flex items-center gap-1 bg-[#19191e] p-0.5 rounded-md border border-[#27272c]">
        <button
          onClick={() => onOpenOrFocusWindow('canvas', 'dock')}
          className={`px-2.5 py-1 rounded text-xs font-medium transition ${
            isWindowVisible('canvas')
              ? 'bg-[#2a2a32] text-white'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          节点画布
        </button>
        <button
          onClick={() => onOpenOrFocusWindow('stage', 'dock')}
          className={`px-2.5 py-1 rounded text-xs font-medium transition ${
            isWindowVisible('stage')
              ? 'bg-[#2a2a32] text-white'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          场景舞台
        </button>
        <button
          onClick={() => onOpenOrFocusWindow('ts_code', 'dock')}
          className={`px-2.5 py-1 rounded text-xs font-medium transition ${
            isWindowVisible('ts_code')
              ? 'bg-[#2a2a32] text-white'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          脚本 (JS/TS)
        </button>
        <button
          onClick={() => onOpenOrFocusWindow('ui_customizer', 'dock')}
          className={`px-2.5 py-1 rounded text-xs font-medium transition ${
            isWindowVisible('ui_customizer')
              ? 'bg-[#2a2a32] text-white'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          界面定制
        </button>
        <button
          onClick={() => onOpenOrFocusWindow('asset_studio', 'dock')}
          className={`px-2.5 py-1 rounded text-xs font-medium transition flex items-center gap-1 ${
            isWindowVisible('asset_studio')
              ? 'bg-[#2a2a32] text-white'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
          title="打开智能立绘抠图与 AI 生图工坊窗口"
        >
          <Wand2 className="w-3 h-3" strokeWidth={1.6} />
          抠图与生图
        </button>
        <button
          onClick={() => onOpenOrFocusWindow('ai_agent', 'dock')}
          className={`px-2.5 py-1 rounded text-xs font-medium transition flex items-center gap-1 ${
            isWindowVisible('ai_agent')
              ? 'bg-[#2a2a32] text-white'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
          title="像 VS Code 扩展窗口一样打开 AI 助手面板（支持停靠与漂浮切换）"
        >
          <Bot className="w-3.5 h-3.5" strokeWidth={1.6} />
          AI 助手窗口
        </button>
        <button
          onClick={() => onOpenOrFocusWindow('terminal', 'dock')}
          className={`px-2.5 py-1 rounded text-xs font-medium transition flex items-center gap-1 ${
            isWindowVisible('terminal')
              ? 'bg-[#2a2a32] text-white'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
          title="打开内置终端与 TypeScript 编译诊断窗口"
        >
          <TerminalIcon className="w-3 h-3" strokeWidth={1.6} />
          终端
        </button>
      </div>

      {/* Right: Settings, Play Preview & Export */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={onOpenSettingsModal}
          className="icon-btn"
          title="打开全局目录与编译器设置 (MooVN Settings)"
        >
          <Settings className="w-3.5 h-3.5" strokeWidth={1.6} />
        </button>

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
