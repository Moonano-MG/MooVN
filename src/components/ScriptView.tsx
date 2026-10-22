import React, { useState } from 'react';
import { Copy, Check, Download } from 'lucide-react';
import { VNProject } from '../types';
import {
  generateChapterYaml,
  generateTypeScriptEngineCode,
  exportChapterYaml,
} from '../lib/projectUtils';

interface ScriptViewProps {
  project: VNProject;
  selectedChapterId: string;
  mode?: 'ts' | 'yaml';
}

export const ScriptView: React.FC<ScriptViewProps> = ({
  project,
  selectedChapterId,
  mode: initialMode = 'ts',
}) => {
  const [currentMode, setCurrentMode] = useState<'ts' | 'yaml'>(initialMode);
  const [copied, setCopied] = useState(false);
  const [activeChapterId, setActiveChapterId] = useState(selectedChapterId);

  const code =
    currentMode === 'ts'
      ? generateTypeScriptEngineCode(project)
      : generateChapterYaml(project, activeChapterId || selectedChapterId);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="flex flex-col h-full bg-[#141417] text-zinc-300 select-none overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#161619] border-b border-[#27272c] shrink-0 text-xs">
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-[#121215] p-0.5 rounded border border-[#27272c]">
            <button
              onClick={() => setCurrentMode('ts')}
              className={`px-2.5 py-0.5 rounded text-[11px] font-medium transition ${
                currentMode === 'ts'
                  ? 'bg-zinc-200 text-zinc-950'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              TypeScript
            </button>
            <button
              onClick={() => setCurrentMode('yaml')}
              className={`px-2.5 py-0.5 rounded text-[11px] font-medium transition ${
                currentMode === 'yaml'
                  ? 'bg-zinc-200 text-zinc-950'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              YAML
            </button>
          </div>

          {currentMode === 'yaml' ? (
            <select
              value={activeChapterId || selectedChapterId}
              onChange={(e) => setActiveChapterId(e.target.value)}
              className="px-2 py-1 text-xs"
            >
              {project.chapters.map((ch) => (
                <option key={ch.id} value={ch.id}>
                  {ch.yamlFileName} · {ch.title}
                </option>
              ))}
            </select>
          ) : (
            <span className="font-mono text-[11px] text-zinc-500">src/runtime/storyEngine.ts</span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {currentMode === 'yaml' && (
            <button
              onClick={() => exportChapterYaml(project, activeChapterId || selectedChapterId)}
              className="icon-btn"
              title="下载 YAML"
            >
              <Download className="w-3.5 h-3.5" strokeWidth={1.6} />
            </button>
          )}
          <button
            onClick={handleCopy}
            className="icon-btn"
            title={copied ? '已复制' : '复制'}
          >
            {copied ? (
              <Check className="w-3.5 h-3.5" strokeWidth={1.8} />
            ) : (
              <Copy className="w-3.5 h-3.5" strokeWidth={1.6} />
            )}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 font-mono text-xs leading-relaxed text-zinc-300 select-text">
        <pre className="whitespace-pre-wrap">{code}</pre>
      </div>
    </div>
  );
};

export default ScriptView;
