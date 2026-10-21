import { AlertTriangle, CheckCircle2 } from "lucide-react";
import type { Project, StoryNode, ValidationIssue } from "../types";
import { countWords } from "../lib/projectUtils";

interface StatusBarProps {
  project: Project;
  selectedNode: StoryNode | null;
  issues: ValidationIssue[];
  zoom: number;
  dirty: boolean;
  lastSavedAt: Date | null;
  toast: string | null;
  onClickIssues: () => void;
}

export default function StatusBar({
  project,
  selectedNode,
  issues,
  zoom,
  dirty,
  lastSavedAt,
  toast,
  onClickIssues,
}: StatusBarProps) {
  const words = countWords(project);

  return (
    <footer className="flex h-7 shrink-0 items-center gap-3 border-t border-white/[0.06] bg-[#0b0b0e] px-3 text-[11.5px] text-zinc-400 select-none">
      <button
        onClick={onClickIssues}
        className={`flex items-center gap-1.5 rounded px-1.5 py-0.5 transition hover:bg-white/[0.06] ${
          issues.length === 0 ? "text-emerald-300" : "text-amber-300"
        }`}
      >
        {issues.length === 0 ? (
          <>
            <CheckCircle2 size={12} /> 剧本结构完整
          </>
        ) : (
          <>
            <AlertTriangle size={12} /> {issues.length} 项待检查
          </>
        )}
      </button>

      <span className="text-zinc-700">·</span>
      <span>{project.chapters.length} 章节</span>
      <span className="text-zinc-700">·</span>
      <span>{project.nodes.length} 场景</span>
      <span className="text-zinc-700">·</span>
      <span>{project.characters.length} 角色</span>
      <span className="text-zinc-700">·</span>
      <span>{words} 字</span>

      {selectedNode && (
        <>
          <span className="text-zinc-700">·</span>
          <span className="truncate text-zinc-300">当前：{selectedNode.title}</span>
        </>
      )}

      <div className="flex-1" />

      {toast && (
        <span className="animate-fade-in rounded-full bg-sky-500/20 px-2.5 py-0.5 text-[11px] font-medium text-sky-200">
          {toast}
        </span>
      )}

      <span className="font-mono text-[11px] text-zinc-500">{Math.round(zoom * 100)}%</span>
      <span className="text-zinc-700">·</span>
      <span className="text-zinc-500">
        {dirty
          ? "自动保存中…"
          : lastSavedAt
            ? `已保存 ${lastSavedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
            : "已就绪"}
      </span>
    </footer>
  );
}
