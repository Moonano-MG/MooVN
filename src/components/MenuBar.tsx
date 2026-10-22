import React, { useState, useRef, useEffect } from 'react';
import {
  Play,
  Undo2,
  Redo2,
  FolderOpen,
  Download,
  RotateCcw,
  Share,
  Save,
  LayoutGrid,
} from 'lucide-react';
import { VNProject, PanelId, DockZoneId } from '../types';
import { exportProjectJson, exportChapterYaml } from '../lib/projectUtils';

export type WorkspaceNavMode = 'graph' | 'stage' | 'ui' | 'code' | 'ai';

interface MenuBarProps {
  project: VNProject;
  selectedChapterId: string;
  activeNav: WorkspaceNavMode;
  onSelectNav: (nav: WorkspaceNavMode) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onImportProject: (p: VNProject) => void;
  onResetDefault: () => void;
  onStartPreview: () => void;
  onOpenExportModal: () => void;
  onOpenProjectLauncher?: () => void;
  onSaveProjectToWorkspace?: () => void;
  onFloatPanel: (panelId: PanelId) => void;
  onMovePanelToDock?: (panelId: PanelId, zone: DockZoneId) => void;
  onResetLayout: () => void;
}

const NAV_ITEMS: { id: WorkspaceNavMode; label: string }[] = [
  { id: 'graph', label: '流程图' },
  { id: 'stage', label: '舞台' },
  { id: 'ui', label: '界面' },
  { id: 'code', label: '脚本' },
  { id: 'ai', label: 'AI' },
];

export const MenuBar: React.FC<MenuBarProps> = ({
  project,
  selectedChapterId,
  activeNav,
  onSelectNav,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onImportProject,
  onResetDefault,
  onStartPreview,
  onOpenExportModal,
  onOpenProjectLauncher,
  onSaveProjectToWorkspace,
  onFloatPanel,
  onResetLayout,
}) => {
  const [openMenu, setOpenMenu] = useState<'file' | 'window' | null>(null);
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
        alert('工程文件格式无效');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <header className="h-10 bg-[#161619] border-b border-[#27272c] px-3 flex items-center justify-between select-none shrink-0 z-40 text-xs">
      {/* Left: Menus + Monochrome Undo/Redo Icons (No project name in top-left!) */}
      <div className="flex items-center gap-1" ref={menuContainerRef}>
        <div className="relative">
          <button
            onClick={() => setOpenMenu(openMenu === 'file' ? null : 'file')}
            className={`px-2.5 py-1 rounded text-xs transition ${
              openMenu === 'file'
                ? 'bg-[#27272c] text-zinc-100'
                : 'text-zinc-400 hover:bg-[#222227] hover:text-zinc-100'
            }`}
          >
            文件
          </button>
          {openMenu === 'file' && (
            <div className="absolute left-0 top-full mt-1 w-44 rounded-md bg-[#1c1c20] border border-[#2e2e34] shadow-2xl py-1 z-50 text-xs">
              <button
                onClick={() => {
                  fileInputRef.current?.click();
                  setOpenMenu(null);
                }}
                className="w-full px-3 py-1.5 text-left text-zinc-300 hover:bg-[#27272c] hover:text-white flex items-center gap-2"
              >
                <FolderOpen className="w-3.5 h-3.5 text-zinc-400" strokeWidth={1.6} />
                打开工程
              </button>
              <button
                onClick={() => {
                  exportProjectJson(project);
                  setOpenMenu(null);
                }}
                className="w-full px-3 py-1.5 text-left text-zinc-300 hover:bg-[#27272c] hover:text-white flex items-center gap-2"
              >
                <Download className="w-3.5 h-3.5 text-zinc-400" strokeWidth={1.6} />
                保存 JSON
              </button>
              <button
                onClick={() => {
                  exportChapterYaml(project, selectedChapterId);
                  setOpenMenu(null);
                }}
                className="w-full px-3 py-1.5 text-left text-zinc-300 hover:bg-[#27272c] hover:text-white flex items-center gap-2"
              >
                <Download className="w-3.5 h-3.5 text-zinc-400" strokeWidth={1.6} />
                导出章节 YAML
              </button>
              <div className="my-1 border-t border-[#27272c]" />
              <button
                onClick={() => {
                  onResetDefault();
                  setOpenMenu(null);
                }}
                className="w-full px-3 py-1.5 text-left text-zinc-400 hover:bg-[#27272c] hover:text-white flex items-center gap-2"
              >
                <RotateCcw className="w-3.5 h-3.5 text-zinc-400" strokeWidth={1.6} />
                重置工程
              </button>
            </div>
          )}
        </div>

        <div className="relative">
          <button
            onClick={() => setOpenMenu(openMenu === 'window' ? null : 'window')}
            className={`px-2.5 py-1 rounded text-xs transition ${
              openMenu === 'window'
                ? 'bg-[#27272c] text-zinc-100'
                : 'text-zinc-400 hover:bg-[#222227] hover:text-zinc-100'
            }`}
          >
            窗口
          </button>
          {openMenu === 'window' && (
            <div className="absolute left-0 top-full mt-1 w-44 rounded-md bg-[#1c1c20] border border-[#2e2e34] shadow-2xl py-1 z-50 text-xs">
              {(
                [
                  ['stage', '浮动：舞台'],
                  ['ui_customizer', '浮动：界面'],
                  ['inspector', '浮动：属性'],
                  ['ai_agent', '浮动：AI'],
                  ['explorer', '浮动：资源'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => {
                    onFloatPanel(id);
                    setOpenMenu(null);
                  }}
                  className="w-full px-3 py-1.5 text-left text-zinc-300 hover:bg-[#27272c] hover:text-white"
                >
                  {label}
                </button>
              ))}
              <div className="my-1 border-t border-[#27272c]" />
              <button
                onClick={() => {
                  onResetLayout();
                  setOpenMenu(null);
                }}
                className="w-full px-3 py-1.5 text-left text-zinc-400 hover:bg-[#27272c] hover:text-white"
              >
                重置布局
              </button>
            </div>
          )}
        </div>

        <div className="h-3.5 w-px bg-[#27272c] mx-1" />

        {onOpenProjectLauncher && (
          <button
            onClick={onOpenProjectLauncher}
            className="icon-btn"
            title="项目中心（切换/新建项目与专属路径设置）"
          >
            <LayoutGrid className="w-3.5 h-3.5" strokeWidth={1.6} />
          </button>
        )}
        {onSaveProjectToWorkspace && (
          <button
            onClick={onSaveProjectToWorkspace}
            className="icon-btn"
            title="保存项目到 MooVN 专属目录"
          >
            <Save className="w-3.5 h-3.5" strokeWidth={1.6} />
          </button>
        )}

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

        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>

      {/* Center: Clean Primary Navigation Bar (导航栏) */}
      <nav className="flex items-center bg-[#111113] border border-[#27272c] rounded-lg p-0.5 gap-0.5">
        {NAV_ITEMS.map((item) => {
          const active = activeNav === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectNav(item.id)}
              className={`px-3.5 py-1 rounded-md text-xs font-medium transition ${
                active
                  ? 'bg-[#27272c] text-white shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* Right: Concise Monochrome Export & Run Buttons */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={onOpenExportModal}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#202025] hover:bg-[#27272c] text-zinc-200 border border-[#2e2e34] text-xs transition"
          title="多平台打包导出 (Android / Windows / macOS / iOS / Web)"
        >
          <Share className="w-3.5 h-3.5 text-zinc-400" strokeWidth={1.6} />
          <span>导出</span>
        </button>

        <button
          onClick={onStartPreview}
          className="flex items-center gap-1.5 px-3 py-1 rounded-md bg-zinc-100 hover:bg-white text-zinc-950 text-xs font-semibold transition"
          title="运行游戏"
        >
          <Play className="w-3 h-3 fill-current" strokeWidth={1.6} />
          <span>运行</span>
        </button>
      </div>
    </header>
  );
};
