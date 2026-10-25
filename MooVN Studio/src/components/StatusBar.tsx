import React from 'react';
import { VNProject, SceneNode } from '../types';
import { useUILanguage } from '../lib/i18n';

interface StatusBarProps {
  project: VNProject;
  selectedNode?: SceneNode;
  isDirty?: boolean;
  lastSavedAt?: string | null;
  storageWarning?: string | null;
  onOpenWindowOverview?: () => void;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  project,
  selectedNode,
  isDirty = false,
  lastSavedAt = null,
  storageWarning = null,
  onOpenWindowOverview,
}) => {
  const { t } = useUILanguage();
  return (
    <footer className="h-6 bg-[#121215] border-t border-[#27272c] text-zinc-500 px-3 flex items-center justify-between text-[11px] select-none shrink-0 gap-3">
      <div className="flex items-center gap-3 min-w-0">
        {isDirty ? (
          <span
            className="text-amber-400 font-medium shrink-0 flex items-center gap-1"
            title="当前工程存在未保存修改"
          >
            <span>●</span>
            <span>未保存</span>
          </span>
        ) : (
          <span
            className="text-emerald-400/90 shrink-0 flex items-center gap-1"
            title={lastSavedAt ? `上次保存：${lastSavedAt}` : '工程已同步'}
          >
            <span>✓</span>
            <span>{lastSavedAt ? `已保存 ${lastSavedAt}` : '已保存'}</span>
          </span>
        )}

        {storageWarning && (
          <span
            className="text-rose-400 truncate max-w-[240px]"
            title={storageWarning}
          >
            ⚠ {storageWarning}
          </span>
        )}

        <span className="shrink-0">
          {project.chapters.length} {t('status.chapters')}
        </span>
        <span className="shrink-0">
          {project.nodes.length} {t('status.nodes')}
        </span>
        {selectedNode && (
          <span className="text-zinc-400 truncate max-w-[200px]">
            {selectedNode.title}
          </span>
        )}
      </div>

      <div className="flex items-center gap-3 font-mono text-[10px] shrink-0">
        {project.projectPath && (
          <span
            className="text-zinc-500 truncate max-w-[220px] hidden md:inline"
            title={project.projectPath}
          >
            {project.projectPath}
          </span>
        )}
        {onOpenWindowOverview && (
          <button
            type="button"
            onClick={onOpenWindowOverview}
            className="text-zinc-400 hover:text-zinc-200 px-1.5 py-0.5 rounded bg-[#1b1b22] border border-[#2a2a34]"
            title="打开窗口总览 (Ctrl+Shift+W)"
          >
            窗口总览
          </button>
        )}
        <span>
          {project.resolution.width}×{project.resolution.height}
        </span>
      </div>
    </footer>
  );
};

export default StatusBar;
