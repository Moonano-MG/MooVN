import React from 'react';
import { VNProject, SceneNode } from '../types';
import { useUILanguage } from '../lib/i18n';

interface StatusBarProps {
  project: VNProject;
  selectedNode?: SceneNode;
  isDirty?: boolean;
  lastSavedAt?: string | null;
  storageWarning?: string | null;
  saveState?: 'idle' | 'saving' | 'file' | 'browser';
  saveError?: { code: string; error: string } | null;
  savedPath?: string;
  lastSaveWasAutomatic?: boolean;
  onRetrySave?: () => void;
  onOpenWindowOverview?: () => void;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  project, selectedNode, isDirty = true, lastSavedAt = null, storageWarning = null,
  saveState = 'idle', saveError = null, savedPath, lastSaveWasAutomatic = false,
  onRetrySave, onOpenWindowOverview,
}) => {
  const { t } = useUILanguage();
  let label = t('status.unsaved');
  let color = 'text-amber-400';
  if (saveError) {
    label = `${t('status.saveFailed')} (${saveError.code})`;
    color = 'text-rose-400';
  } else if (saveState === 'saving') {
    label = t('status.saving');
    color = 'text-zinc-300';
  } else if (!isDirty && (saveState === 'file' || saveState === 'browser')) {
    label = saveState === 'browser' ? t('status.browserSaved') : lastSaveWasAutomatic ? t('status.autoSaved') : t('status.saved');
    if (lastSavedAt) label += ` ${lastSavedAt}`;
    color = 'text-emerald-400';
  }
  return (
    <footer className="min-h-6 bg-[#121215] border-t border-[#27272c] text-zinc-500 px-3 flex items-center justify-between text-[11px] select-none shrink-0 gap-3 overflow-hidden">
      <div className="flex items-center gap-3 min-w-0 overflow-hidden">
        <span className={`${color} font-medium truncate`} title={saveError?.error || savedPath || label}>{label}</span>
        {saveError && onRetrySave && <button type="button" onClick={onRetrySave} className="text-rose-300 underline shrink-0">{t('status.retry')}</button>}
        {storageWarning && <span className="text-rose-400 truncate max-w-[240px]" title={storageWarning}>⚠ {storageWarning}</span>}
        <span className="shrink-0 hidden lg:inline">{project.chapters.length} {t('status.chapters')}</span>
        <span className="shrink-0 hidden lg:inline">{project.nodes.length} {t('status.nodes')}</span>
        {selectedNode && <span className="text-zinc-400 truncate max-w-[200px]">{selectedNode.title}</span>}
      </div>
      <div className="flex items-center gap-3 font-mono text-[10px] shrink-0">
        {(savedPath || project.projectPath) && <span className="text-zinc-500 truncate max-w-[220px] hidden md:inline" title={savedPath || project.projectPath}>{savedPath || project.projectPath}</span>}
        {onOpenWindowOverview && <button type="button" onClick={onOpenWindowOverview} className="text-zinc-400 hover:text-zinc-200 px-1.5 py-0.5 rounded bg-[#1b1b22] border border-[#2a2a34]" title={t('status.overview')}>{t('status.overview')}</button>}
        <span>{project.resolution.width}×{project.resolution.height}</span>
      </div>
    </footer>
  );
};

export default StatusBar;
