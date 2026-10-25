import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  FileCode2,
  Plus,
  Trash2,
  Download,
  Copy,
  Check,
  Save,
  FolderTree,
  Edit3,
  Play,
} from 'lucide-react';
import { ProjectScriptFile, SceneNode, VNProject } from '../types';
import { generateChapterYaml, exportChapterYaml } from '../lib/projectUtils';
import {
  generateSingleNodeCode,
  generateFullProjectCode,
  compileAndCheckProjectTypeScript,
  TsCompileReport,
} from '../lib/nodeCodeCompiler';
import {
  EnginePolyglotLanguage,
  evalPolyglotScriptInEngine,
  generateNodeEngineFastScript,
  generateProjectEnginePolyglotScript,
  translatePolyglotScriptWithReport,
} from '../lib/moovnEngineBridge';
import { syncWriteToRealWorkspaceDisk } from '../lib/workspaceManager';

interface ScriptViewProps {
  project: VNProject;
  selectedChapterId: string;
  selectedNode?: SceneNode;
  onUpdateNode?: (id: string, updater: (n: SceneNode) => SceneNode) => void;
  onUpdateProject?: (patch: Partial<VNProject>) => void;
  mode?: 'ts' | 'yaml';
}

export interface ExtensionMeta {
  ext: string;
  badge: string;
  badgeColor: string;
  langLabel: string;
  engineLang: EnginePolyglotLanguage | 'yaml' | 'json';
}

export function getFileExtensionMeta(fileName: string): ExtensionMeta {
  const lower = fileName.trim().toLowerCase();
  const ext = lower.includes('.') ? lower.split('.').pop() || 'ts' : 'ts';

  switch (ext) {
    case 'js':
    case 'mjs':
    case 'cjs':
      return {
        ext: 'js',
        badge: 'JS',
        badgeColor: '#facc15',
        langLabel: 'JavaScript',
        engineLang: 'javascript',
      };
    case 'ts':
    case 'tsx':
      return {
        ext: 'ts',
        badge: 'TS',
        badgeColor: '#38bdf8',
        langLabel: 'TypeScript',
        engineLang: 'typescript',
      };
    case 'cs':
      return {
        ext: 'cs',
        badge: 'C#',
        badgeColor: '#a78bfa',
        langLabel: 'C#',
        engineLang: 'csharp',
      };
    case 'cpp':
    case 'cc':
    case 'cxx':
    case 'hpp':
    case 'h':
      return {
        ext: 'cpp',
        badge: 'C++',
        badgeColor: '#60a5fa',
        langLabel: 'C++',
        engineLang: 'cpp',
      };
    case 'rs':
      return {
        ext: 'rs',
        badge: 'RS',
        badgeColor: '#fb923c',
        langLabel: 'Rust',
        engineLang: 'rust',
      };
    case 'yaml':
    case 'yml':
      return {
        ext: 'yaml',
        badge: 'YML',
        badgeColor: '#f472b6',
        langLabel: 'YAML',
        engineLang: 'yaml',
      };
    case 'json':
      return {
        ext: 'json',
        badge: 'JSON',
        badgeColor: '#34d399',
        langLabel: 'JSON',
        engineLang: 'json',
      };
    default:
      return {
        ext,
        badge: ext.toUpperCase().slice(0, 4),
        badgeColor: '#94a3b8',
        langLabel: ext.toUpperCase(),
        engineLang: 'typescript',
      };
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

const KEYWORDS_CONTROL = new Set([
  'if',
  'else',
  'for',
  'while',
  'do',
  'switch',
  'case',
  'default',
  'break',
  'continue',
  'return',
  'try',
  'catch',
  'finally',
  'throw',
  'async',
  'await',
  'match',
  'loop',
  'yield',
]);

const KEYWORDS_DECL = new Set([
  'import',
  'export',
  'from',
  'const',
  'let',
  'var',
  'function',
  'class',
  'interface',
  'type',
  'enum',
  'struct',
  'impl',
  'trait',
  'fn',
  'pub',
  'mod',
  'use',
  'using',
  'namespace',
  'public',
  'private',
  'protected',
  'internal',
  'static',
  'readonly',
  'void',
  'new',
  'true',
  'false',
  'null',
  'undefined',
  'mut',
  'ref',
  'auto',
  'constexpr',
  'inline',
  'virtual',
  'override',
]);

const KEYWORDS_TYPES = new Set([
  'MooVN',
  'moovn',
  'save',
  'SceneNode',
  'VNProject',
  'string',
  'number',
  'boolean',
  'any',
  'int',
  'float',
  'double',
  'bool',
  'char',
  'i8',
  'i16',
  'i32',
  'i64',
  'u8',
  'u16',
  'u32',
  'u64',
  'usize',
  'f32',
  'f64',
  'str',
  'String',
  'Vec',
  'Option',
  'Result',
  'Some',
  'None',
  'Ok',
  'Err',
  'std',
]);

/**
 * VS Code Dark+ style single-pass lexical syntax highlighter.
 */
export function highlightCodeToHtml(code: string, ext: string): string {
  const lines = code.split('\n');
  const isYaml = ext === 'yaml' || ext === 'yml';

  return lines
    .map((line) => {
      if (isYaml) {
        const trimmed = line.trimStart();
        if (trimmed.startsWith('#')) {
          return `<span style="color:#6a9955;font-style:italic;">${escapeHtml(line)}</span>`;
        }
        const colonIdx = line.indexOf(':');
        if (colonIdx > 0) {
          const keyPart = escapeHtml(line.slice(0, colonIdx));
          const valPart = escapeHtml(line.slice(colonIdx + 1));
          return `<span style="color:#9cdcfe;">${keyPart}</span>:<span style="color:#ce9178;">${valPart}</span>`;
        }
        return escapeHtml(line);
      }

      // Check full-line preprocessor directive (#include, #pragma)
      const trimmed = line.trimStart();
      if (trimmed.startsWith('#include') || trimmed.startsWith('#pragma') || trimmed.startsWith('#define')) {
        return `<span style="color:#c586c0;">${escapeHtml(line)}</span>`;
      }

      let out = '';
      let i = 0;
      const n = line.length;

      while (i < n) {
        const ch = line[i];

        // Single-line comment //
        if (ch === '/' && line[i + 1] === '/') {
          out += `<span style="color:#6a9955;font-style:italic;">${escapeHtml(line.slice(i))}</span>`;
          break;
        }

        // String literal "...", '...', `...`
        if (ch === '"' || ch === "'" || ch === '`') {
          const quote = ch;
          let j = i + 1;
          while (j < n) {
            if (line[j] === '\\') {
              j += 2;
              continue;
            }
            if (line[j] === quote) {
              j += 1;
              break;
            }
            j += 1;
          }
          out += `<span style="color:#ce9178;">${escapeHtml(line.slice(i, j))}</span>`;
          i = j;
          continue;
        }

        // Number literal
        if (/[0-9]/.test(ch) && (i === 0 || !/[A-Za-z0-9_]/.test(line[i - 1]))) {
          let j = i;
          while (j < n && /[0-9.xXa-fA-F_f]/.test(line[j])) {
            j += 1;
          }
          out += `<span style="color:#b5cea8;">${escapeHtml(line.slice(i, j))}</span>`;
          i = j;
          continue;
        }

        // Identifier or Keyword
        if (/[A-Za-z_$]/.test(ch)) {
          let j = i;
          while (j < n && /[A-Za-z0-9_$]/.test(line[j])) {
            j += 1;
          }
          const word = line.slice(i, j);
          const nextChar = line[j] || '';

          if (KEYWORDS_CONTROL.has(word)) {
            out += `<span style="color:#c586c0;font-weight:600;">${escapeHtml(word)}</span>`;
          } else if (KEYWORDS_DECL.has(word)) {
            out += `<span style="color:#569cd6;font-weight:600;">${escapeHtml(word)}</span>`;
          } else if (KEYWORDS_TYPES.has(word)) {
            out += `<span style="color:#4ec9b0;">${escapeHtml(word)}</span>`;
          } else if (nextChar === '(' || nextChar === '!') {
            out += `<span style="color:#dcdcaa;">${escapeHtml(word)}</span>`;
          } else {
            out += `<span style="color:#9cdcfe;">${escapeHtml(word)}</span>`;
          }
          i = j;
          continue;
        }

        // Operators & Punctuation (: :: . -> =>)
        if (ch === ':' || ch === '.' || ch === '=' || ch === '>' || ch === '<') {
          out += `<span style="color:#d4d4d4;">${escapeHtml(ch)}</span>`;
          i += 1;
          continue;
        }

        out += escapeHtml(ch);
        i += 1;
      }

      return out || ' ';
    })
    .join('\n');
}

function buildDefaultWorkspaceFiles(
  project: VNProject,
  selectedChapterId: string,
  selectedNode?: SceneNode
): ProjectScriptFile[] {
  const nodeTarget = selectedNode || project.nodes[0];
  const nodeFileName = nodeTarget ? `${nodeTarget.id}.ts` : 'node_1.ts';
  const nodeContent = nodeTarget
    ? nodeTarget.customScript ||
      generateNodeEngineFastScript(nodeTarget, 'typescript') ||
      generateSingleNodeCode(nodeTarget, 'typescript', project)
    : '// 当前节点脚本\n';

  return [
    {
      id: 'file-node-active',
      fileName: nodeFileName,
      linkedNodeId: nodeTarget?.id,
      content: nodeContent,
    },
    {
      id: 'file-main-ts',
      fileName: 'main.ts',
      content: generateFullProjectCode(project, 'typescript'),
    },
    {
      id: 'file-chapter-yaml',
      fileName: `${selectedChapterId || 'chapter_1'}.yaml`,
      content: generateChapterYaml(project, selectedChapterId),
    },
    {
      id: 'file-scene-json',
      fileName: 'scene_graph.json',
      content: JSON.stringify(
        {
          projectId: project.id,
          startNodeId: project.startNodeId,
          chaptersCount: project.chapters.length,
          nodesCount: project.nodes.length,
        },
        null,
        2
      ),
    },
  ];
}

export const ScriptView: React.FC<ScriptViewProps> = ({
  project,
  selectedChapterId,
  selectedNode,
  onUpdateNode,
  onUpdateProject,
  mode: initialMode = 'ts',
}) => {
  const [files, setFiles] = useState<ProjectScriptFile[]>(() =>
    project.scriptFiles && project.scriptFiles.length > 0
      ? project.scriptFiles
      : buildDefaultWorkspaceFiles(project, selectedChapterId, selectedNode)
  );
  const [activeFileId, setActiveFileId] = useState<string>(() =>
    initialMode === 'yaml' ? 'file-chapter-yaml' : 'file-node-active'
  );
  const [showExplorer, setShowExplorer] = useState<boolean>(true);
  const [isCreatingFile, setIsCreatingFile] = useState<boolean>(false);
  const [newFileName, setNewFileName] = useState<string>('new_script.ts');
  const [renamingFileId, setRenamingFileId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [compileReport, setCompileReport] = useState<TsCompileReport | null>(null);
  const [cursorPos, setCursorPos] = useState<{ line: number; col: number }>({
    line: 1,
    col: 1,
  });

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const preRef = useRef<HTMLPreElement | null>(null);
  const gutterRef = useRef<HTMLDivElement | null>(null);

  // Sync active node script tab when selectedNode changes
  useEffect(() => {
    if (!selectedNode) return;
    setFiles((prev) =>
      prev.map((f) => {
        if (f.id !== 'file-node-active') return f;
        const currentExt = f.fileName.includes('.')
          ? f.fileName.split('.').pop() || 'ts'
          : 'ts';
        const nextFileName = `${selectedNode.id}.${currentExt}`;
        const extMeta = getFileExtensionMeta(nextFileName);
        const lang: EnginePolyglotLanguage =
          extMeta.engineLang === 'yaml' || extMeta.engineLang === 'json'
            ? 'typescript'
            : extMeta.engineLang;
        return {
          ...f,
          fileName: nextFileName,
          linkedNodeId: selectedNode.id,
          content:
            selectedNode.customScript ||
            generateNodeEngineFastScript(selectedNode, lang),
        };
      })
    );
  }, [selectedNode?.id]);

  const activeFile =
    files.find((f) => f.id === activeFileId) || files[0];
  const extMeta = getFileExtensionMeta(activeFile?.fileName || 'main.ts');
  const code = activeFile?.content || '';
  const lineCount = useMemo(() => Math.max(1, code.split('\n').length), [code]);
  const highlightedHtml = useMemo(
    () => highlightCodeToHtml(code, extMeta.ext),
    [code, extMeta.ext]
  );

  const handleCodeChange = (nextContent: string) => {
    setFiles((prev) => {
      const next = prev.map((f) =>
        f.id === activeFile.id
          ? { ...f, content: nextContent, updatedAt: new Date().toISOString() }
          : f
      );
      onUpdateProject?.({ scriptFiles: next });
      return next;
    });
  };

  const handleSaveCurrentFile = async () => {
    if (!activeFile) return;
    if (activeFile.linkedNodeId && onUpdateNode) {
      const lang =
        extMeta.engineLang === 'yaml' || extMeta.engineLang === 'json'
          ? 'typescript'
          : extMeta.engineLang;
      onUpdateNode(activeFile.linkedNodeId, (prev) => ({
        ...prev,
        scriptLanguage: lang,
        customScript: activeFile.content,
      }));
    }
    await syncWriteToRealWorkspaceDisk(
      'Scripts',
      activeFile.fileName,
      activeFile.content
    );
    setStatusNotice(`已保存 ${activeFile.fileName}`);
    setTimeout(() => setStatusNotice(null), 2200);
  };

  const handleCreateNewFile = () => {
    const clean = newFileName.trim() || `script_${files.length + 1}.ts`;
    const finalName = clean.includes('.') ? clean : `${clean}.ts`;
    const meta = getFileExtensionMeta(finalName);

    let starter = '';
    if (meta.ext === 'yaml' || meta.ext === 'yml') {
      starter = `moovn_schema: "1.0"\nchapter:\n  id: ${selectedChapterId || 'ch-1'}\nnodes:\n  - id: node-1\n    background: bg-classroom-day\n`;
    } else if (meta.ext === 'json') {
      starter = `{\n  "scene": "node-1",\n  "background": "bg-classroom-day"\n}\n`;
    } else if (meta.ext === 'cpp' || meta.ext === 'rs') {
      starter = `moovn::bg::show("bg-classroom-day", "fade");\nmoovn::text::say("星野雪奈", "新场景已载入。");\nmoovn::save::create("Slot_01");\n`;
    } else if (meta.ext === 'cs') {
      starter = `Moovn.Bg.Show("bg-classroom-day", "fade");\nMoovn.Text.Say("星野雪奈", "新场景已载入。");\nMoovn.Save.Create("Slot_01");\n`;
    } else {
      starter = `moovn.bg.show("bg-classroom-day", "fade");\nmoovn.text.say("星野雪奈", "新场景已载入。");\nmoovn.save.create("Slot_01");\n`;
    }

    const created: ProjectScriptFile = {
      id: `file-${Date.now()}`,
      fileName: finalName,
      content: starter,
      updatedAt: new Date().toISOString(),
    };
    setFiles((prev) => {
      const next = [...prev, created];
      onUpdateProject?.({ scriptFiles: next });
      return next;
    });
    setActiveFileId(created.id);
    setIsCreatingFile(false);
    setNewFileName('new_script.ts');
  };

  const handleCommitRename = (fileId: string) => {
    const clean = renameDraft.trim();
    if (!clean) {
      setRenamingFileId(null);
      return;
    }
    const finalName = clean.includes('.') ? clean : `${clean}.ts`;
    const newMeta = getFileExtensionMeta(finalName);

    setFiles((prev) =>
      prev.map((f) => {
        if (f.id !== fileId) return f;
        // Preserve custom user code when renaming extensions via non-destructive IR transpilation (`Kimi 1G`, `GPT-10`)
        let nextContent = f.content;
        if (
          newMeta.engineLang !== 'yaml' &&
          newMeta.engineLang !== 'json' &&
          f.content.trim().length > 0
        ) {
          const report = translatePolyglotScriptWithReport(
            f.content,
            newMeta.engineLang
          );
          nextContent = report.code;
          if (report.unrecognizedLines.length > 0) {
            setStatusNotice(
              `已转换至 .${newMeta.ext}（保留了 ${report.unrecognizedLines.length} 行宿主代码）`
            );
            setTimeout(() => setStatusNotice(null), 3200);
          }
        }
        return {
          ...f,
          fileName: finalName,
          content: nextContent,
        };
      })
    );
    setRenamingFileId(null);
  };

  const handleDeleteFile = (fileId: string) => {
    if (files.length <= 1) return;
    const remaining = files.filter((f) => f.id !== fileId);
    setFiles(remaining);
    if (activeFileId === fileId) {
      setActiveFileId(remaining[0].id);
    }
    onUpdateProject?.({ scriptFiles: remaining });
  };

  const handleRunScript = async () => {
    if (!activeFile) return;
    if (extMeta.ext === 'ts' || extMeta.ext === 'js') {
      const report = compileAndCheckProjectTypeScript(project);
      setCompileReport(report);
    }
    if (extMeta.engineLang !== 'yaml' && extMeta.engineLang !== 'json') {
      const res = await evalPolyglotScriptInEngine(
        activeFile.content,
        extMeta.engineLang
      );
      setStatusNotice(
        res.logs[0] || `已执行 ${activeFile.fileName} (${res.logs.length} 条指令)`
      );
      setTimeout(() => setStatusNotice(null), 3000);
    }
  };

  const handleDownloadFile = () => {
    if (!activeFile) return;
    if (extMeta.ext === 'yaml') {
      exportChapterYaml(project, selectedChapterId);
      return;
    }
    const blob = new Blob([activeFile.content], {
      type: 'text/plain;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = activeFile.fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleSyncScroll = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    if (preRef.current) {
      preRef.current.scrollTop = ta.scrollTop;
      preRef.current.scrollLeft = ta.scrollLeft;
    }
    if (gutterRef.current) {
      gutterRef.current.scrollTop = ta.scrollTop;
    }
  };

  const updateCursorInfo = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    const pos = ta.selectionStart || 0;
    const before = code.slice(0, pos);
    const lines = before.split('\n');
    setCursorPos({
      line: lines.length,
      col: (lines[lines.length - 1]?.length || 0) + 1,
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      handleSaveCurrentFile();
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      const ta = e.currentTarget;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const next = code.slice(0, start) + '  ' + code.slice(end);
      handleCodeChange(next);
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = start + 2;
      });
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#141417] text-zinc-300 select-none overflow-hidden">
      {/* Top VS Code File Tab Bar + Actions */}
      <div className="h-8 bg-[#18181c] border-b border-[#27272c] flex items-center justify-between px-1.5 gap-2 shrink-0">
        <div className="flex items-center gap-0.5 overflow-x-auto min-w-0 flex-1">
          <button
            type="button"
            onClick={() => setShowExplorer((v) => !v)}
            className={`icon-btn !w-6 !h-6 shrink-0 ${showExplorer ? 'active' : ''}`}
            title="显示/隐藏脚本文件资源管理器"
          >
            <FolderTree className="w-3.5 h-3.5" strokeWidth={1.6} />
          </button>

          {files.map((file) => {
            const meta = getFileExtensionMeta(file.fileName);
            const isActive = file.id === activeFile?.id;
            return (
              <div
                key={file.id}
                onClick={() => setActiveFileId(file.id)}
                onDoubleClick={() => {
                  setRenamingFileId(file.id);
                  setRenameDraft(file.fileName);
                }}
                className={`group flex items-center gap-1.5 px-2.5 h-7 rounded-t text-[11px] cursor-pointer transition shrink-0 border-t-2 ${
                  isActive
                    ? 'bg-[#141417] text-zinc-100 font-medium border-t-sky-400 border-x border-x-[#27272c]'
                    : 'bg-transparent text-zinc-500 hover:text-zinc-300 border-t-transparent'
                }`}
                title="点击切换文件 · 双击可修改文件名与后缀 (.ts / .js / .cs / .cpp / .rs / .yaml)"
              >
                <span
                  style={{ color: meta.badgeColor }}
                  className="text-[10px] font-mono font-bold shrink-0"
                >
                  {meta.badge}
                </span>

                {renamingFileId === file.id ? (
                  <input
                    type="text"
                    value={renameDraft}
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => setRenameDraft(e.target.value)}
                    onBlur={() => handleCommitRename(file.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleCommitRename(file.id);
                      if (e.key === 'Escape') setRenamingFileId(null);
                    }}
                    className="w-28 px-1 py-0 text-[11px] font-mono bg-[#0e0e11] border border-sky-400 rounded text-zinc-100"
                  />
                ) : (
                  <span className="font-mono truncate max-w-[140px]">
                    {file.fileName}
                  </span>
                )}

                {files.length > 1 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteFile(file.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 hover:text-rose-400 text-zinc-500 transition"
                    title="关闭文件"
                  >
                    ×
                  </button>
                )}
              </div>
            );
          })}

          <button
            type="button"
            onClick={() => setIsCreatingFile(true)}
            className="icon-btn !w-6 !h-6 shrink-0"
            title="新建脚本文件 (支持 .ts / .js / .cs / .cpp / .rs / .yaml 等任意后缀)"
          >
            <Plus className="w-3.5 h-3.5" strokeWidth={1.6} />
          </button>
        </div>

        {/* Right Compact Action Buttons */}
        <div className="flex items-center gap-1 shrink-0">
          {statusNotice && (
            <span className="text-[11px] text-emerald-400 px-1.5 truncate max-w-[180px]">
              {statusNotice}
            </span>
          )}

          <button
            type="button"
            onClick={handleRunScript}
            className="px-2 py-1 rounded bg-[#222229] hover:bg-[#2c2c35] text-zinc-200 text-[11px] flex items-center gap-1 border border-[#2f2f38]"
            title="运行并校验当前脚本文件"
          >
            <Play className="w-3 h-3 text-emerald-400" strokeWidth={1.8} />
            <span>运行</span>
          </button>

          <button
            type="button"
            onClick={handleSaveCurrentFile}
            className="px-2 py-1 rounded bg-zinc-200 hover:bg-white text-zinc-950 font-semibold text-[11px] flex items-center gap-1"
            title="保存当前文件 (Ctrl+S)"
          >
            <Save className="w-3 h-3" strokeWidth={1.8} />
            <span>保存</span>
          </button>

          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(code);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            className="icon-btn !w-6 !h-6"
            title="复制代码"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
          </button>

          <button
            type="button"
            onClick={handleDownloadFile}
            className="icon-btn !w-6 !h-6"
            title="下载当前脚本文件"
          >
            <Download className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* New File Input Bar */}
      {isCreatingFile && (
        <div className="px-3 py-1.5 bg-[#1c1c22] border-b border-[#2c2c35] flex items-center justify-between gap-2 text-xs shrink-0">
          <div className="flex items-center gap-2 flex-1">
            <span className="text-zinc-400">新建文件名（带后缀）：</span>
            <input
              type="text"
              value={newFileName}
              autoFocus
              onChange={(e) => setNewFileName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateNewFile();
                if (e.key === 'Escape') setIsCreatingFile(false);
              }}
              placeholder="例如: dialogue.ts / save.cs / shader.cpp / mod.rs / script.js"
              className="px-2 py-0.5 rounded bg-[#121216] border border-[#32323c] text-xs font-mono text-zinc-100 w-64"
            />
            <div className="flex items-center gap-1 text-[10px] text-zinc-400">
              <span>快速后缀：</span>
              {(['.ts', '.js', '.cs', '.cpp', '.rs', '.yaml'] as const).map((ext) => (
                <button
                  key={ext}
                  type="button"
                  onClick={() => {
                    const base = newFileName.split('.')[0] || 'script';
                    setNewFileName(`${base}${ext}`);
                  }}
                  className="px-1.5 py-0.5 rounded bg-[#25252e] hover:bg-[#30303c] font-mono text-zinc-200"
                >
                  {ext}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleCreateNewFile}
              className="px-2.5 py-0.5 rounded bg-sky-500 text-zinc-950 font-semibold text-xs"
            >
              创建
            </button>
            <button
              type="button"
              onClick={() => setIsCreatingFile(false)}
              className="px-2 py-0.5 rounded bg-[#272730] text-zinc-300 text-xs"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {/* Main Editor Workspace: Left File Explorer + Right Syntax-Highlighted Code Editor */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {showExplorer && (
          <aside className="w-44 bg-[#16161a] border-r border-[#27272c] flex flex-col shrink-0 select-none">
            <div className="px-2.5 py-1.5 border-b border-[#242429] flex items-center justify-between text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">
              <span>工程脚本文件</span>
              <button
                type="button"
                onClick={() => setIsCreatingFile(true)}
                className="hover:text-zinc-100"
                title="新建文件"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto py-1 space-y-0.5">
              {files.map((file) => {
                const meta = getFileExtensionMeta(file.fileName);
                const isActive = file.id === activeFile?.id;
                return (
                  <div
                    key={file.id}
                    onClick={() => setActiveFileId(file.id)}
                    className={`group px-2.5 py-1.5 flex items-center justify-between gap-1.5 text-xs cursor-pointer transition ${
                      isActive
                        ? 'bg-[#23232b] text-white font-medium'
                        : 'text-zinc-400 hover:bg-[#1d1d24] hover:text-zinc-200'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                      <FileCode2
                        className="w-3.5 h-3.5 shrink-0"
                        style={{ color: meta.badgeColor }}
                      />
                      <span className="font-mono text-[11px] truncate">
                        {file.fileName}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition shrink-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setRenamingFileId(file.id);
                          setRenameDraft(file.fileName);
                        }}
                        className="text-zinc-400 hover:text-sky-300"
                        title="重命名文件或修改后缀"
                      >
                        <Edit3 className="w-3 h-3" />
                      </button>
                      {files.length > 1 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteFile(file.id);
                          }}
                          className="text-zinc-400 hover:text-rose-400"
                          title="删除文件"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </aside>
        )}

        {/* Right: Line Numbers + Real-Time Syntax Highlighted Code Surface */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-[#121215] relative overflow-hidden">
          {compileReport && (
            <div className="px-3 py-1.5 bg-[#19191f] border-b border-[#27272c] flex items-center justify-between text-xs shrink-0">
              <span className="text-zinc-200">
                编译检查：{compileReport.ok ? '0 错误' : `${compileReport.diagnostics.length} 项提示`} · 耗时 {compileReport.durationMs}ms
              </span>
              <button
                type="button"
                onClick={() => setCompileReport(null)}
                className="text-zinc-400 hover:text-white"
              >
                关闭
              </button>
            </div>
          )}

          <div className="flex-1 flex min-h-0 relative overflow-hidden font-mono text-[12.5px] leading-[20px]">
            {/* Line Number Gutter */}
            <div
              ref={gutterRef}
              className="w-11 py-3 bg-[#141418] border-r border-[#232329] text-right pr-2.5 text-zinc-600 select-none overflow-hidden shrink-0"
            >
              {Array.from({ length: lineCount }).map((_, idx) => {
                const ln = idx + 1;
                const isCur = ln === cursorPos.line;
                return (
                  <div
                    key={ln}
                    className={`leading-[20px] ${
                      isCur ? 'text-zinc-200 font-bold' : ''
                    }`}
                  >
                    {ln}
                  </div>
                );
              })}
            </div>

            {/* Layered Syntax Highlight <pre> + Transparent Interactive <textarea> */}
            <div className="flex-1 relative min-w-0 min-h-0 overflow-hidden">
              <pre
                ref={preRef}
                aria-hidden="true"
                className="absolute inset-0 m-0 py-3 px-3.5 font-mono text-[12.5px] leading-[20px] whitespace-pre overflow-hidden pointer-events-none select-none"
                dangerouslySetInnerHTML={{ __html: highlightedHtml + '\n' }}
              />
              <textarea
                ref={textareaRef}
                value={code}
                spellCheck={false}
                autoCapitalize="off"
                autoComplete="off"
                autoCorrect="off"
                onChange={(e) => handleCodeChange(e.target.value)}
                onScroll={handleSyncScroll}
                onKeyUp={updateCursorInfo}
                onClick={updateCursorInfo}
                onKeyDown={handleKeyDown}
                style={{
                  color: 'transparent',
                  caretColor: '#f4f4f5',
                }}
                className="absolute inset-0 w-full h-full m-0 py-3 px-3.5 font-mono text-[12.5px] leading-[20px] whitespace-pre bg-transparent border-0 resize-none focus:outline-none overflow-auto selection:bg-sky-500/30"
              />
            </div>
          </div>

          {/* VS Code Bottom File Status Bar */}
          <div className="h-6 bg-[#18181d] border-t border-[#27272c] px-3 flex items-center justify-between text-[11px] text-zinc-400 shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <span className="font-mono text-zinc-200 truncate">
                {activeFile?.fileName}
              </span>
              {activeFile?.linkedNodeId && (
                <span className="text-zinc-500 hidden sm:inline truncate">
                  节点: {activeFile.linkedNodeId}
                </span>
              )}
              {(extMeta.ext === 'cs' || extMeta.ext === 'cpp' || extMeta.ext === 'rs') && (
                <span className="text-amber-400/90 text-[10px] truncate">
                  原生编译器未接入（仅作语法编辑）
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 font-mono shrink-0">
              <span>
                Ln {cursorPos.line}, Col {cursorPos.col}
              </span>
              <span className="hidden md:inline">Spaces: 2</span>
              <span className="hidden md:inline">UTF-8</span>
              <span
                style={{ color: extMeta.badgeColor }}
                className="font-semibold"
              >
                {extMeta.langLabel}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
