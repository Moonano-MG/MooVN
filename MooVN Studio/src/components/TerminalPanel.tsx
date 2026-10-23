import React, { useState, useEffect, useRef } from 'react';
import {
  Terminal as TerminalIcon,
  AlertTriangle,
  CheckCircle2,
  Play,
  Trash2,
  FolderOpen,
} from 'lucide-react';
import { VNProject, ExportPlatform } from '../types';
import {
  compileAndCheckProjectTypeScript,
  TsCompileReport,
} from '../lib/nodeCodeCompiler';
import {
  fetchWorkspaceDiskStatus,
  saveProjectToWorkspace,
} from '../lib/workspaceManager';
import { exportPlatformPackage } from '../lib/gamePackager';

interface TerminalPanelProps {
  project: VNProject;
  selectedNodeId: string;
  runtimeLogs: string[];
  onSelectNode: (nodeId: string) => void;
  onClearRuntimeLogs: () => void;
}

interface TerminalHistoryEntry {
  id: string;
  command?: string;
  output: string;
  type: 'info' | 'success' | 'error' | 'cmd';
  timestamp: string;
}

export const TerminalPanel: React.FC<TerminalPanelProps> = ({
  project,
  selectedNodeId,
  runtimeLogs,
  onSelectNode,
  onClearRuntimeLogs,
}) => {
  const [activeTab, setActiveTab] = useState<'terminal' | 'problems' | 'output'>('terminal');
  const [cmdInput, setCmdInput] = useState('');
  const [compileReport, setCompileReport] = useState<TsCompileReport>(() =>
    compileAndCheckProjectTypeScript(project)
  );
  const [entries, setEntries] = useState<TerminalHistoryEntry[]>([
    {
      id: 'init-1',
      output:
        'MooVN Integrated Terminal v2.4 — 输入 "help" 查看命令，输入 "tsc" 运行 TypeScript 严格类型与节点图编译检查。',
      type: 'info',
      timestamp: new Date().toLocaleTimeString().slice(0, 8),
    },
  ]);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setCompileReport(compileAndCheckProjectTypeScript(project));
  }, [project]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [entries]);

  const appendEntry = (
    output: string,
    type: TerminalHistoryEntry['type'] = 'info',
    command?: string
  ) => {
    setEntries((prev) => [
      ...prev,
      {
        id: `term-${Date.now()}-${Math.random()}`,
        command,
        output,
        type,
        timestamp: new Date().toLocaleTimeString().slice(0, 8),
      },
    ]);
  };

  const runTscCheck = () => {
    const report = compileAndCheckProjectTypeScript(project);
    setCompileReport(report);
    if (report.errorCount === 0) {
      appendEntry(
        `[tsc] TypeScript 编译检查通过 (${report.durationMs}ms)：共编译 ${project.nodes.length} 个节点函数，0 错误，${report.warningCount} 警告。`,
        'success',
        'tsc --noEmit'
      );
    } else {
      const details = report.diagnostics
        .map((d) => `  ${d.code} [${d.severity.toUpperCase()}] (${d.nodeId}:${d.line}): ${d.message}`)
        .join('\n');
      appendEntry(
        `[tsc] 发现 ${report.errorCount} 个错误，${report.warningCount} 个警告 (${report.durationMs}ms)：\n${details}`,
        'error',
        'tsc --noEmit'
      );
    }
  };

  const handleExecuteCommand = async () => {
    const raw = cmdInput.trim();
    if (!raw) return;
    setCmdInput('');

    const parts = raw.split(/\s+/);
    const cmd = parts[0].toLowerCase();

    if (cmd === 'clear' || cmd === 'cls') {
      setEntries([]);
      return;
    }

    if (cmd === 'help') {
      appendEntry(
        [
          '可用终端指令：',
          '  tsc / moovn check              运行 TypeScript 严格类型与节点脚本编译检查',
          '  moovn ls                       查看磁盘上 MooVN_Workspace 真实目录文件列表',
          '  moovn save                     将当前工程写入磁盘 MooVN_Workspace/Projects/',
          '  moovn build <web|android|windows|macos|ios>  打包导出指定平台并写入磁盘 Exports/',
          '  node <JS表达式>                在当前项目上下文中求值 JS/TS 表达式',
          '  clear                          清空终端屏幕',
        ].join('\n'),
        'info',
        raw
      );
      return;
    }

    if (cmd === 'tsc' || raw === 'moovn check') {
      runTscCheck();
      return;
    }

    if (raw === 'moovn ls' || raw === 'ls' || raw === 'dir') {
      const status = await fetchWorkspaceDiskStatus();
      if (!status) {
        appendEntry('无法读取本地工作区目录状态。', 'error', raw);
        return;
      }
      const lines: string[] = [
        `工作区根目录: ${status.workspaceRoot}`,
        `设置文件: ${status.settingsFile}`,
        `Projects/ (${status.projectFiles.length} 个文件):`,
        ...status.projectFiles.map((f) => `  - ${f.name} (${f.size} bytes)`),
        `Exports/ (${status.exportFiles.length} 个文件):`,
        ...status.exportFiles.map((f) => `  - ${f.name} (${f.size} bytes)`),
      ];
      appendEntry(lines.join('\n'), 'success', raw);
      return;
    }

    if (raw === 'moovn save') {
      const meta = await saveProjectToWorkspace(project);
      appendEntry(`已保存工程至磁盘：${meta.path}`, 'success', raw);
      return;
    }

    if (cmd === 'moovn' && parts[1] === 'build') {
      const plat = (parts[2] || 'web').toLowerCase() as ExportPlatform;
      const valid: ExportPlatform[] = ['web', 'android', 'windows', 'macos', 'ios'];
      const target = valid.includes(plat) ? plat : 'web';
      exportPlatformPackage(project, {
        platform: target,
        packageId: 'com.moovn.shiomi',
        appName: project.title,
        version: project.version,
        fullscreen: true,
        landscapeLock: true,
      });
      appendEntry(
        `已完成 [${target.toUpperCase()}] 构建并写入 MooVN_Workspace/Exports/ 目录。`,
        'success',
        raw
      );
      return;
    }

    if (cmd === 'node') {
      const expr = raw.slice(4).trim();
      try {
        const fn = new Function(
          'project',
          'nodes',
          'characters',
          'variables',
          `return (${expr});`
        );
        const res = fn(
          project,
          project.nodes,
          project.characters,
          project.variables
        );
        appendEntry(
          typeof res === 'object' ? JSON.stringify(res, null, 2) : String(res),
          'success',
          raw
        );
      } catch (err: any) {
        appendEntry(`执行错误: ${err?.message || String(err)}`, 'error', raw);
      }
      return;
    }

    appendEntry(
      `未知命令 "${cmd}"。输入 "help" 查看支持的指令，或输入 "tsc" 进行编译检查。`,
      'error',
      raw
    );
  };

  return (
    <div className="flex flex-col h-full bg-[#111114] text-zinc-300 select-none overflow-hidden font-mono text-xs">
      {/* Top Sub-Header */}
      <div className="flex items-center justify-between px-3 py-1 bg-[#151519] border-b border-[#27272c] shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setActiveTab('terminal')}
            className={`px-2 py-1 border-b-2 transition flex items-center gap-1.5 text-[11px] ${
              activeTab === 'terminal'
                ? 'border-zinc-200 text-white font-semibold'
                : 'border-transparent text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <TerminalIcon className="w-3 h-3" strokeWidth={1.6} />
            终端
          </button>

          <button
            onClick={() => setActiveTab('problems')}
            className={`px-2 py-1 border-b-2 transition flex items-center gap-1.5 text-[11px] ${
              activeTab === 'problems'
                ? 'border-zinc-200 text-white font-semibold'
                : 'border-transparent text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <AlertTriangle className="w-3 h-3" strokeWidth={1.6} />
            TS/JS 编译诊断 ({compileReport.diagnostics.length})
          </button>

          <button
            onClick={() => setActiveTab('output')}
            className={`px-2 py-1 border-b-2 transition flex items-center gap-1.5 text-[11px] ${
              activeTab === 'output'
                ? 'border-zinc-200 text-white font-semibold'
                : 'border-transparent text-zinc-500 hover:text-zinc-300'
            }`}
          >
            引擎流加载日志 ({runtimeLogs.length})
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={runTscCheck}
            className="px-2 py-0.5 rounded bg-[#222228] hover:bg-[#2c2c34] border border-[#2e2e36] text-zinc-200 text-[10px] flex items-center gap-1"
            title="运行 TypeScript 编译器检查所有节点脚本"
          >
            <Play className="w-2.5 h-2.5" strokeWidth={1.8} />
            tsc 编译检查
          </button>

          <button
            onClick={() => {
              if (activeTab === 'terminal') setEntries([]);
              if (activeTab === 'output') onClearRuntimeLogs();
            }}
            className="icon-btn !w-6 !h-6"
            title="清空输出"
          >
            <Trash2 className="w-3 h-3" strokeWidth={1.6} />
          </button>
        </div>
      </div>

      {/* TAB 1: Interactive Terminal */}
      {activeTab === 'terminal' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-3 space-y-2 select-text">
            {entries.map((e) => (
              <div key={e.id} className="space-y-0.5">
                {e.command && (
                  <div className="text-zinc-400 flex items-center gap-1.5">
                    <span className="text-emerald-400">moovn@workspace:~$</span>
                    <span className="text-zinc-100">{e.command}</span>
                    <span className="text-[10px] text-zinc-600 ml-auto">{e.timestamp}</span>
                  </div>
                )}
                <pre
                  className={`whitespace-pre-wrap leading-relaxed text-[11px] ${
                    e.type === 'error'
                      ? 'text-rose-400'
                      : e.type === 'success'
                      ? 'text-emerald-300'
                      : 'text-zinc-300'
                  }`}
                >
                  {e.output}
                </pre>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          <div className="px-3 py-1.5 bg-[#151519] border-t border-[#27272c] flex items-center gap-2 shrink-0">
            <span className="text-emerald-400 text-[11px] shrink-0">moovn@workspace:~$</span>
            <input
              type="text"
              value={cmdInput}
              onChange={(e) => setCmdInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleExecuteCommand();
              }}
              placeholder="输入命令 (例如: tsc / moovn ls / moovn save / moovn build web / help)..."
              className="flex-1 !bg-transparent !border-none px-1 py-0.5 text-xs text-zinc-100 focus:outline-none"
            />
          </div>
        </div>
      )}

      {/* TAB 2: TypeScript / JavaScript Compiler Diagnostics */}
      {activeTab === 'problems' && (
        <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
          {compileReport.diagnostics.length === 0 ? (
            <div className="flex items-center gap-2 text-emerald-400 py-4 px-2">
              <CheckCircle2 className="w-4 h-4" strokeWidth={1.8} />
              <span>所有 {project.nodes.length} 个节点的 TypeScript 类型与连线检查全部通过，未发现错误。</span>
            </div>
          ) : (
            compileReport.diagnostics.map((d) => (
              <div
                key={d.id}
                onClick={() => onSelectNode(d.nodeId)}
                className={`p-2 rounded border cursor-pointer transition flex items-center justify-between gap-3 ${
                  d.nodeId === selectedNodeId
                    ? 'bg-[#22222a] border-zinc-400'
                    : 'bg-[#18181d] border-[#27272c] hover:border-zinc-500'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                      d.severity === 'error'
                        ? 'bg-rose-500/20 text-rose-300'
                        : 'bg-amber-500/20 text-amber-300'
                    }`}
                  >
                    {d.code}
                  </span>
                  <span className="text-zinc-200 truncate">{d.message}</span>
                </div>
                <span className="text-[10px] text-zinc-500 shrink-0">
                  {d.nodeTitle} ({d.nodeId}:L{d.line})
                </span>
              </div>
            ))
          )}
        </div>
      )}

      {/* TAB 3: Engine Stream & Silent Compensation Logs */}
      {activeTab === 'output' && (
        <div className="flex-1 overflow-y-auto p-3 space-y-1 text-[11px] select-text">
          {runtimeLogs.length === 0 ? (
            <div className="text-zinc-500 flex items-center gap-1.5">
              <FolderOpen className="w-3.5 h-3.5" strokeWidth={1.6} />
              <span>暂无运行期日志。运行游戏或流式解压场景时将在此输出后台记录。</span>
            </div>
          ) : (
            runtimeLogs.map((log, i) => (
              <div key={i} className="text-zinc-300 leading-relaxed">
                {log}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};
