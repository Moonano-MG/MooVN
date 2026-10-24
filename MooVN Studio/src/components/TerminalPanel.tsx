import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  Trash2,
  ArrowUpRight,
} from 'lucide-react';
import { SceneNode, VNProject } from '../types';

interface TerminalPanelProps {
  project: VNProject;
  selectedNodeId: string;
  runtimeLogs: string[];
  onSelectNode: (nodeId: string) => void;
  onClearRuntimeLogs: () => void;
}

export interface ProjectValidationItem {
  id: string;
  severity: 'error' | 'warning' | 'info';
  nodeId: string;
  nodeTitle: string;
  message: string;
}

export function validateProjectGraph(project: VNProject): ProjectValidationItem[] {
  const items: ProjectValidationItem[] = [];
  const nodeIds = new Set(project.nodes.map((n) => n.id));

  if (!nodeIds.has(project.startNodeId) && project.nodes.length > 0) {
    items.push({
      id: 'err-start-node',
      severity: 'error',
      nodeId: project.nodes[0].id,
      nodeTitle: project.nodes[0].title,
      message: `起始节点 ID "${project.startNodeId}" 不存在，建议重新指定起始节点`,
    });
  }

  for (const node of project.nodes) {
    if (node.nextNodeId && !nodeIds.has(node.nextNodeId)) {
      items.push({
        id: `err-next-${node.id}`,
        severity: 'error',
        nodeId: node.id,
        nodeTitle: node.title,
        message: `后续节点连接目标 "${node.nextNodeId}" 不存在`,
      });
    }

    for (const ch of node.choices) {
      if (!ch.targetNodeId || !nodeIds.has(ch.targetNodeId)) {
        items.push({
          id: `err-choice-${node.id}-${ch.id}`,
          severity: 'error',
          nodeId: node.id,
          nodeTitle: node.title,
          message: `分支选项「${ch.text}」未指向有效目标节点`,
        });
      }
    }

    if (node.type === 'condition' && node.conditionRule) {
      if (
        !node.conditionRule.trueTargetNodeId ||
        !nodeIds.has(node.conditionRule.trueTargetNodeId)
      ) {
        items.push({
          id: `warn-cond-t-${node.id}`,
          severity: 'warning',
          nodeId: node.id,
          nodeTitle: node.title,
          message: `条件节点的 True 分支目标未指向有效节点`,
        });
      }
      if (
        !node.conditionRule.falseTargetNodeId ||
        !nodeIds.has(node.conditionRule.falseTargetNodeId)
      ) {
        items.push({
          id: `warn-cond-f-${node.id}`,
          severity: 'warning',
          nodeId: node.id,
          nodeTitle: node.title,
          message: `条件节点的 False 分支目标未指向有效节点`,
        });
      }
    }

    if (
      (node.type === 'dialogue' || node.type === 'narration') &&
      node.dialogues.length === 0
    ) {
      items.push({
        id: `warn-empty-dlg-${node.id}`,
        severity: 'warning',
        nodeId: node.id,
        nodeTitle: node.title,
        message: `对话节点尚未填写任何台词行`,
      });
    }
  }

  return items;
}

export const TerminalPanel: React.FC<TerminalPanelProps> = ({
  project,
  selectedNodeId,
  runtimeLogs,
  onSelectNode,
  onClearRuntimeLogs,
}) => {
  const [activeTab, setActiveTab] = useState<'problems' | 'logs'>('problems');
  const diagnostics = useMemo(() => validateProjectGraph(project), [project]);

  const errorCount = diagnostics.filter((d) => d.severity === 'error').length;
  const warningCount = diagnostics.filter((d) => d.severity === 'warning').length;

  return (
    <div className="flex flex-col h-full bg-[#141417] text-zinc-300 text-xs select-none overflow-hidden">
      {/* Top Bar */}
      <div className="h-8 px-3 bg-[#18181c] border-b border-[#27272c] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setActiveTab('problems')}
            className={`py-1.5 border-b-2 font-medium flex items-center gap-1.5 transition ${
              activeTab === 'problems'
                ? 'border-sky-400 text-white'
                : 'border-transparent text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <span>工程校验</span>
            <span className="px-1.5 py-0.2 rounded bg-[#23232a] text-[10px] font-mono text-zinc-300">
              {diagnostics.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('logs')}
            className={`py-1.5 border-b-2 font-medium flex items-center gap-1.5 transition ${
              activeTab === 'logs'
                ? 'border-sky-400 text-white'
                : 'border-transparent text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <span>事件日志</span>
            <span className="px-1.5 py-0.2 rounded bg-[#23232a] text-[10px] font-mono text-zinc-300">
              {runtimeLogs.length}
            </span>
          </button>
        </div>

        <div className="flex items-center gap-2 text-[11px] text-zinc-400">
          <span>
            {errorCount} 错误 · {warningCount} 警告
          </span>
          {activeTab === 'logs' && (
            <button
              type="button"
              onClick={onClearRuntimeLogs}
              className="icon-btn !w-5 !h-5"
              title="清空日志"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5">
        {activeTab === 'problems' ? (
          diagnostics.length === 0 ? (
            <div className="p-4 rounded bg-[#18181d] border border-[#26262f] flex items-center gap-2 text-emerald-400">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>
                全部 {project.nodes.length} 个场景节点的连线、分支目标与台词结构校验通过。
              </span>
            </div>
          ) : (
            diagnostics.map((item) => (
              <div
                key={item.id}
                onClick={() => onSelectNode(item.nodeId)}
                className={`p-2 rounded border cursor-pointer flex items-center justify-between gap-2 transition ${
                  item.nodeId === selectedNodeId
                    ? 'bg-sky-500/10 border-sky-500/40'
                    : 'bg-[#18181d] border-[#27272f] hover:border-[#383844]'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  {item.severity === 'error' ? (
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                  ) : item.severity === 'warning' ? (
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  ) : (
                    <Info className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                  )}
                  <span className="font-semibold text-zinc-100 shrink-0">
                    [{item.nodeTitle}]
                  </span>
                  <span className="text-zinc-300 truncate">{item.message}</span>
                </div>
                <span className="text-[10px] text-sky-400 flex items-center gap-0.5 shrink-0">
                  定位 <ArrowUpRight className="w-3 h-3" />
                </span>
              </div>
            ))
          )
        ) : runtimeLogs.length === 0 ? (
          <div className="text-zinc-500 p-3">暂无事件日志</div>
        ) : (
          runtimeLogs.map((log, idx) => (
            <div
              key={idx}
              className="px-2.5 py-1 rounded bg-[#18181c] font-mono text-[11px] text-zinc-300 break-words"
            >
              {log}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default TerminalPanel;
