import React from 'react';
import { VNProject, SceneNode } from '../types';

interface StatusBarProps {
  project: VNProject;
  selectedNode?: SceneNode;
}

export const StatusBar: React.FC<StatusBarProps> = ({ project, selectedNode }) => {
  return (
    <footer className="h-6 bg-[#007acc] text-white px-3 flex items-center justify-between text-[11px] select-none shrink-0">
      <div className="flex items-center gap-3">
        <span>章节: {project.chapters.length}</span>
        <span>节点: {project.nodes.length}</span>
        {selectedNode && <span>当前: {selectedNode.title}</span>}
      </div>
      <div>
        <span>
          {project.resolution.width}×{project.resolution.height}
        </span>
      </div>
    </footer>
  );
};

export default StatusBar;
