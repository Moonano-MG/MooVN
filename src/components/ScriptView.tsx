import React, { useState, useEffect } from 'react';
import {
  Copy,
  Check,
  Download,
  Play,
  Save,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import { SceneNode, VNProject } from '../types';
import {
  generateChapterYaml,
  exportChapterYaml,
} from '../lib/projectUtils';
import {
  generateSingleNodeCode,
  generateFullProjectCode,
  compileAndCheckProjectTypeScript,
  TsCompileReport,
} from '../lib/nodeCodeCompiler';
import { syncWriteToRealWorkspaceDisk } from '../lib/workspaceManager';

interface ScriptViewProps {
  project: VNProject;
  selectedChapterId: string;
  selectedNode?: SceneNode;
  onUpdateNode?: (nodeId: string, updater: (n: SceneNode) => SceneNode) => void;
  mode?: 'ts' | 'yaml';
}

export const ScriptView: React.FC<ScriptViewProps> = ({
  project,
  selectedChapterId,
  selectedNode,
  onUpdateNode,
  mode: initialMode = 'ts',
}) => {
  const [currentMode, setCurrentMode] = useState<'node_edit' | 'js' | 'ts' | 'yaml'>(
    initialMode === 'yaml' ? 'yaml' : 'ts'
  );
  const [nodeLang, setNodeLang] = useState<'javascript' | 'typescript'>('javascript');
  const [editableNodeCode, setEditableNodeCode] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [activeChapterId, setActiveChapterId] = useState(selectedChapterId);
  const [compileReport, setCompileReport] = useState<TsCompileReport | null>(null);

  useEffect(() => {
    if (selectedNode) {
      const lang = selectedNode.scriptLanguage === 'javascript' ? 'javascript' : nodeLang;
      setEditableNodeCode(
        selectedNode.customScript ||
          generateSingleNodeCode(selectedNode, lang, project)
      );
    }
  }, [selectedNode?.id, nodeLang]);

  const code =
    currentMode === 'node_edit'
      ? editableNodeCode
      : currentMode === 'js'
      ? generateFullProjectCode(project, 'javascript')
      : currentMode === 'ts'
      ? generateFullProjectCode(project, 'typescript')
      : generateChapterYaml(project, activeChapterId || selectedChapterId);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const handleSaveNodeScript = () => {
    if (!selectedNode || !onUpdateNode) return;
    onUpdateNode(selectedNode.id, (prev) => ({
      ...prev,
      scriptLanguage: nodeLang,
      customScript: editableNodeCode,
    }));
    const report = compileAndCheckProjectTypeScript(project);
    setCompileReport(report);
    setSavedNotice(
      `已保存节点 [${selectedNode.title}] 的 ${
        nodeLang === 'javascript' ? 'JavaScript' : 'TypeScript'
      } 脚本`
    );
    setTimeout(() => setSavedNotice(null), 2600);
  };

  const handleRunTsc = () => {
    const report = compileAndCheckProjectTypeScript(project);
    setCompileReport(report);
  };

  const handleDownloadCode = async () => {
    if (currentMode === 'yaml') {
      exportChapterYaml(project, activeChapterId || selectedChapterId);
      return;
    }
    const ext = currentMode === 'js' || (currentMode === 'node_edit' && nodeLang === 'javascript') ? 'js' : 'ts';
    const fileName = `${project.id}-compiled.${ext}`;
    await syncWriteToRealWorkspaceDisk('Exports', fileName, code);
    const blob = new Blob([code], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-full bg-[#141417] text-zinc-300 select-none overflow-hidden">
      {/* Top Toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#161619] border-b border-[#27272c] shrink-0 text-xs gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          <div className="flex items-center bg-[#121215] p-0.5 rounded border border-[#27272c]">
            <button
              onClick={() => setCurrentMode('node_edit')}
              className={`px-2 py-0.5 rounded text-[11px] font-medium transition ${
                currentMode === 'node_edit'
                  ? 'bg-zinc-200 text-zinc-950 font-semibold'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              当前节点脚本 (可编辑)
            </button>
            <button
              onClick={() => setCurrentMode('js')}
              className={`px-2 py-0.5 rounded text-[11px] font-medium transition ${
                currentMode === 'js'
                  ? 'bg-amber-400 text-zinc-950 font-semibold'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              全工程 JS (快速开发)
            </button>
            <button
              onClick={() => setCurrentMode('ts')}
              className={`px-2 py-0.5 rounded text-[11px] font-medium transition ${
                currentMode === 'ts'
                  ? 'bg-sky-400 text-zinc-950 font-semibold'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              全工程 TS (严格类型)
            </button>
            <button
              onClick={() => setCurrentMode('yaml')}
              className={`px-2 py-0.5 rounded text-[11px] font-medium transition ${
                currentMode === 'yaml'
                  ? 'bg-zinc-200 text-zinc-950 font-semibold'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              YAML
            </button>
          </div>

          {currentMode === 'node_edit' && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setNodeLang('javascript')}
                className={`px-2 py-0.5 rounded text-[10px] font-mono border ${
                  nodeLang === 'javascript'
                    ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                    : 'bg-[#1a1a20] border-[#27272c] text-zinc-400'
                }`}
              >
                JS
              </button>
              <button
                onClick={() => setNodeLang('typescript')}
                className={`px-2 py-0.5 rounded text-[10px] font-mono border ${
                  nodeLang === 'typescript'
                    ? 'bg-sky-500/20 border-sky-500/50 text-sky-300'
                    : 'bg-[#1a1a20] border-[#27272c] text-zinc-400'
                }`}
              >
                TS
              </button>
            </div>
          )}

          {currentMode === 'yaml' && (
            <select
              value={activeChapterId || selectedChapterId}
              onChange={(e) => setActiveChapterId(e.target.value)}
              className="px-2 py-1 text-xs"
            >
              {project.chapters.map((ch) => (
                <option key={ch.id} value={ch.id}>
                  {ch.title}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {currentMode === 'node_edit' && selectedNode && (
            <button
              onClick={handleSaveNodeScript}
              className="px-2.5 py-1 rounded bg-emerald-600/25 hover:bg-emerald-600/35 border border-emerald-500/40 text-emerald-200 text-[11px] flex items-center gap-1"
            >
              <Save className="w-3 h-3" strokeWidth={1.7} />
              应用到节点
            </button>
          )}

          <button
            onClick={handleRunTsc}
            className="px-2.5 py-1 rounded bg-[#222229] hover:bg-[#2c2c35] border border-[#30303a] text-zinc-200 text-[11px] flex items-center gap-1"
            title="使用 TypeScript 编译器检查全工程所有节点与脚本"
          >
            <Play className="w-3 h-3" strokeWidth={1.7} />
            tsc 编译检查
          </button>

          <button onClick={handleCopy} className="icon-btn" title="复制代码">
            {copied ? (
              <Check className="w-3.5 h-3.5 text-zinc-100" strokeWidth={1.6} />
            ) : (
              <Copy className="w-3.5 h-3.5" strokeWidth={1.6} />
            )}
          </button>

          <button
            onClick={handleDownloadCode}
            className="icon-btn"
            title="导出脚本文件至磁盘"
          >
            <Download className="w-3.5 h-3.5" strokeWidth={1.6} />
          </button>
        </div>
      </div>

      {/* Compiler Diagnostic Status Strip */}
      {(compileReport || savedNotice) && (
        <div className="px-3 py-1.5 bg-[#19191f] border-b border-[#27272c] flex items-center justify-between text-[11px]">
          {savedNotice ? (
            <span className="text-emerald-300 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              {savedNotice}
            </span>
          ) : compileReport?.ok ? (
            <span className="text-emerald-300 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              [tsc] TypeScript 编译通过 ({compileReport.durationMs}ms)：共校验{' '}
              {project.nodes.length} 个节点，0 错误，{compileReport.warningCount} 警告。
            </span>
          ) : (
            <span className="text-rose-300 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" />
              [tsc] 检测到 {compileReport?.errorCount} 个类型/语法错误：
              {compileReport?.diagnostics[0]?.message}
            </span>
          )}
        </div>
      )}

      {/* Editor Body */}
      {currentMode === 'node_edit' ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="px-3 py-1 bg-[#121216] border-b border-[#232329] text-[11px] text-zinc-400 flex items-center justify-between">
            <span>
              正在编辑节点：
              <strong className="text-zinc-200 ml-1">
                {selectedNode?.title || '未选定节点'} ({selectedNode?.type})
              </strong>
            </span>
            <span className="font-mono text-[10px] text-zinc-500">
              平时可用 JS 快速编写逻辑，随时点击右上角「tsc 编译检查」进行严格校验
            </span>
          </div>
          <textarea
            value={editableNodeCode}
            onChange={(e) => setEditableNodeCode(e.target.value)}
            spellCheck={false}
            className="flex-1 w-full p-4 !bg-[#101014] !border-none font-mono text-xs leading-relaxed text-zinc-100 resize-none focus:outline-none select-text"
          />
        </div>
      ) : (
        <div className="flex-1 overflow-auto p-4 font-mono text-xs leading-relaxed select-text">
          <pre className="text-zinc-300">
            {code.split('\n').map((line, i) => (
              <div
                key={i}
                className="flex hover:bg-white/[0.02] px-1 rounded transition"
              >
                <span className="w-10 shrink-0 text-right pr-4 text-zinc-600 select-none">
                  {i + 1}
                </span>
                <span className="whitespace-pre-wrap break-all">{line || ' '}</span>
              </div>
            ))}
          </pre>
        </div>
      )}
    </div>
  );
};
