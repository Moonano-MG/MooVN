import React, { useState, useRef, useEffect } from 'react';
import {
  Play,
  Undo2,
  Redo2,
  FolderOpen,
  FileDown,
  RotateCcw,
  FileSpreadsheet,
  Smartphone,
  LayoutGrid,
} from 'lucide-react';
import { VNProject, PanelId, DockZoneId } from '../types';
import { exportProjectJson, exportChapterYaml } from '../lib/projectUtils';

interface MenuBarProps {
  project: VNProject;
  selectedChapterId: string;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onImportProject: (p: VNProject) => void;
  onResetDefault: () => void;
  onStartPreview: () => void;
  onOpenExportModal: () => void;
  onFloatPanel: (panelId: PanelId) => void;
  onMovePanelToDock: (panelId: PanelId, zone: DockZoneId) => void;
  onResetLayout: () => void;
}

export const MenuBar: React.FC<MenuBarProps> = ({
  project,
  selectedChapterId,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onImportProject,
  onResetDefault,
  onStartPreview,
  onOpenExportModal,
  onFloatPanel,
  onResetLayout,
}) => {
  const [openMenu, setOpenMenu] = useState<'file' | 'edit' | 'window' | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const menuContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuContainerRef.current && !menuContainerRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(String(ev.target?.result));
        if (parsed && Array.isArray(parsed.nodes)) {
          onImportProject(parsed);
        }
      } catch {
        alert('导入失败：请检查工程文件格式');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <header className="h-9 bg-[#1f1f23] border-b border-[#2b2b30] px-2 flex items-center justify-between select-none shrink-0 z-40 text-xs">
      {/* Left: Pure VS Code Menu Items (NO project name in top-left!) */}
      <div className="flex items-center gap-1" ref={menuContainerRef}>
        {/* 文件 Menu */}
        <div className="relative">
          <button
            onClick={() => setOpenMenu(openMenu === 'file' ? null : 'file')}
            className={`px-2.5 py-1 rounded text-xs transition ${
              openMenu === 'file'
                ? 'bg-[#37373d] text-white'
                : 'text-[#cccccc] hover:bg-[#2a2d2e] hover:text-white'
            }`}
          >
            文件(F)
          </button>
          {openMenu === 'file' && (
            <div className="absolute left-0 top-full mt-1 w-52 rounded-md bg-[#252526] border border-[#454545] shadow-2xl py-1 z-50 text-xs">
              <button
                onClick={() => {
                  fileInputRef.current?.click();
                  setOpenMenu(null);
                }}
                className="w-full px-3 py-1.5 text-left text-[#cccccc] hover:bg-[#04395e] hover:text-white flex items-center gap-2"
              >
                <FolderOpen className="w-3.5 h-3.5 text-sky-400" />
                打开工程 (.json)...
              </button>
              <button
                onClick={() => {
                  exportProjectJson(project);
                  setOpenMenu(null);
                }}
                className="w-full px-3 py-1.5 text-left text-[#cccccc] hover:bg-[#04395e] hover:text-white flex items-center gap-2"
              >
                <FileDown className="w-3.5 h-3.5 text-emerald-400" />
                保存工程快照 (.json)
              </button>
              <button
                onClick={() => {
                  exportChapterYaml(project, selectedChapterId);
                  setOpenMenu(null);
                }}
                className="w-full px-3 py-1.5 text-left text-[#cccccc] hover:bg-[#04395e] hover:text-white flex items-center gap-2"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-amber-400" />
                导出当前章节 (.yaml)
              </button>
              <div className="my-1 border-t border-[#3c3c3c]" />
              <button
                onClick={() => {
                  onOpenExportModal();
                  setOpenMenu(null);
                }}
                className="w-full px-3 py-1.5 text-left text-[#cccccc] hover:bg-[#04395e] hover:text-white flex items-center gap-2"
              >
                <Smartphone className="w-3.5 h-3.5 text-purple-400" />
                多平台游戏构建导出...
              </button>
              <div className="my-1 border-t border-[#3c3c3c]" />
              <button
                onClick={() => {
                  onResetDefault();
                  setOpenMenu(null);
                }}
                className="w-full px-3 py-1.5 text-left text-rose-300 hover:bg-rose-500/20 flex items-center gap-2"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                重置为默认完整工程
              </button>
            </div>
          )}
        </div>

        {/* 编辑 Menu */}
        <div className="relative">
          <button
            onClick={() => setOpenMenu(openMenu === 'edit' ? null : 'edit')}
            className={`px-2.5 py-1 rounded text-xs transition ${
              openMenu === 'edit'
                ? 'bg-[#37373d] text-white'
                : 'text-[#cccccc] hover:bg-[#2a2d2e] hover:text-white'
            }`}
          >
            编辑(E)
          </button>
          {openMenu === 'edit' && (
            <div className="absolute left-0 top-full mt-1 w-44 rounded-md bg-[#252526] border border-[#454545] shadow-2xl py-1 z-50 text-xs">
              <button
                disabled={!canUndo}
                onClick={() => {
                  onUndo();
                  setOpenMenu(null);
                }}
                className="w-full px-3 py-1.5 text-left text-[#cccccc] hover:bg-[#04395e] hover:text-white disabled:opacity-35 flex items-center justify-between"
              >
                <span className="flex items-center gap-2">
                  <Undo2 className="w-3.5 h-3.5" />
                  撤销
                </span>
                <span className="text-[10px] text-slate-400">Ctrl+Z</span>
              </button>
              <button
                disabled={!canRedo}
                onClick={() => {
                  onRedo();
                  setOpenMenu(null);
                }}
                className="w-full px-3 py-1.5 text-left text-[#cccccc] hover:bg-[#04395e] hover:text-white disabled:opacity-35 flex items-center justify-between"
              >
                <span className="flex items-center gap-2">
                  <Redo2 className="w-3.5 h-3.5" />
                  重做
                </span>
                <span className="text-[10px] text-slate-400">Ctrl+Y</span>
              </button>
            </div>
          )}
        </div>

        {/* 窗口与布局 Menu */}
        <div className="relative">
          <button
            onClick={() => setOpenMenu(openMenu === 'window' ? null : 'window')}
            className={`px-2.5 py-1 rounded text-xs transition ${
              openMenu === 'window'
                ? 'bg-[#37373d] text-white'
                : 'text-[#cccccc] hover:bg-[#2a2d2e] hover:text-white'
            }`}
          >
            窗口与布局(W)
          </button>
          {openMenu === 'window' && (
            <div className="absolute left-0 top-full mt-1 w-56 rounded-md bg-[#252526] border border-[#454545] shadow-2xl py-1 z-50 text-xs">
              <div className="px-3 py-1 text-[10px] text-slate-400">
                任意面板均可拖拽至左/中/右/底分栏或弹出为自由移动窗口
              </div>
              <div className="my-1 border-t border-[#3c3c3c]" />
              {(
                [
                  ['stage', '弹出「舞台预览」为自由窗口'],
                  ['ui_customizer', '弹出「游戏UI自定义」为自由窗口'],
                  ['inspector', '弹出「属性检查器」为自由窗口'],
                  ['ai_agent', '弹出「AI 助手」为自由窗口'],
                  ['explorer', '弹出「资源管理器」为自由窗口'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => {
                    onFloatPanel(id);
                    setOpenMenu(null);
                  }}
                  className="w-full px-3 py-1.5 text-left text-[#cccccc] hover:bg-[#04395e] hover:text-white flex items-center gap-2"
                >
                  <LayoutGrid className="w-3.5 h-3.5 text-sky-400" />
                  {label}
                </button>
              ))}
              <div className="my-1 border-t border-[#3c3c3c]" />
              <button
                onClick={() => {
                  onResetLayout();
                  setOpenMenu(null);
                }}
                className="w-full px-3 py-1.5 text-left text-amber-300 hover:bg-[#04395e] flex items-center gap-2"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                重置工作台窗口布局
              </button>
            </div>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>

      {/* Right: Multi-Platform Build & Play Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={onOpenExportModal}
          className="flex items-center gap-1.5 px-3 py-1 rounded bg-[#2a2d2e] hover:bg-[#37373d] text-slate-100 border border-[#3c3c3c] text-xs font-medium transition"
          title="支持导出 Android / Windows / macOS / iOS / Web"
        >
          <Smartphone className="w-3.5 h-3.5 text-emerald-400" />
          多平台打包 (Android / PC / iOS)
        </button>

        <button
          onClick={onStartPreview}
          className="flex items-center gap-1.5 px-3.5 py-1 rounded bg-[#007acc] hover:bg-[#1f8ad2] text-white text-xs font-semibold transition"
        >
          <Play className="w-3.5 h-3.5 fill-current" />
          运行游戏
        </button>
      </div>
    </header>
  );
};
