import React from 'react';
import { VNProject, SceneNode } from '../types';

interface StatusBarProps {
  project: VNProject;
  selectedNode?: SceneNode;
}

export const StatusBar: React.FC<StatusBarProps> = ({ project, selectedNode }) => {
  return (
    <footer className="h-6 bg-[#121215] border-t border-[#27272c] text-zinc-500 px-3 flex items-center justify-between text-[11px] select-none shrink-0">
      <div className="flex items-center gap-3">
        <span>{project.chapters.length} 章节</span>
        <span>{project.nodes.length} 节点</span>
        {selectedNode && <span className="text-zinc-400">{selectedNode.title}</span>}
      </div>
      <div className="font-mono text-[10px]">
        <span>
          {project.resolution.width}×{project.resolution.height}
        </span>
      </div>
    </footer>
  );
};

export default StatusBar;
