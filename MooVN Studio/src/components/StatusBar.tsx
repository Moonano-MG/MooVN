import React from 'react';
import { VNProject, SceneNode } from '../types';
import { useUILanguage } from '../lib/i18n';

interface StatusBarProps {
  project: VNProject;
  selectedNode?: SceneNode;
}

export const StatusBar: React.FC<StatusBarProps> = ({ project, selectedNode }) => {
  const { t } = useUILanguage();
  return (
    <footer className="h-6 bg-[#121215] border-t border-[#27272c] text-zinc-500 px-3 flex items-center justify-between text-[11px] select-none shrink-0">
      <div className="flex items-center gap-3 min-w-0">
        <span className="shrink-0">
          {project.chapters.length} {t('status.chapters')}
        </span>
        <span className="shrink-0">
          {project.nodes.length} {t('status.nodes')}
        </span>
        {selectedNode && (
          <span className="text-zinc-400 truncate max-w-[240px]">
            {selectedNode.title}
          </span>
        )}
      </div>
      <div className="font-mono text-[10px] shrink-0">
        <span>
          {project.resolution.width}×{project.resolution.height}
        </span>
      </div>
    </footer>
  );
};

export default StatusBar;
