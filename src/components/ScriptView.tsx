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
  mode: 'ts' | 'yaml';
}

export const ScriptView: React.FC<ScriptViewProps> = ({
  project,
  selectedChapterId,
  mode,
}) => {
  const [copied, setCopied] = useState(false);
  const [activeChapterId, setActiveChapterId] = useState(selectedChapterId);

  const code =
    mode === 'ts'
      ? generateTypeScriptEngineCode(project)
      : generateChapterYaml(project, activeChapterId || selectedChapterId);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="flex flex-col h-full bg-[#141418] text-[#cccccc] select-none overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-[#1f1f23] border-b border-[#2b2b30] shrink-0 text-xs">
        <div className="flex items-center gap-2">
          {mode === 'yaml' ? (
            <select
              value={activeChapterId || selectedChapterId}
              onChange={(e) => setActiveChapterId(e.target.value)}
              className="bg-[#252529] border border-[#3c3c42] rounded px-2 py-1 text-xs text-white"
            >
              {project.chapters.map((ch) => (
                <option key={ch.id} value={ch.id}>
                  chapters/{ch.yamlFileName} — {ch.title}
                </option>
              ))}
            </select>
          ) : (
            <span className="font-mono text-sky-400">src/runtime/storyEngine.ts</span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {mode === 'yaml' && (
            <button
              onClick={() => exportChapterYaml(project, activeChapterId || selectedChapterId)}
              className="flex items-center gap-1 px-2.5 py-1 rounded bg-[#252529] hover:bg-[#323238] text-slate-200 text-[11px]"
            >
              <Download className="w-3.5 h-3.5 text-amber-400" />
              下载章节 YAML
            </button>
          )}
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-[#007acc] hover:bg-[#1f8ad2] text-white text-[11px]"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? '已复制' : '复制代码'}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 font-mono text-xs leading-relaxed text-slate-200 select-text">
        <pre className="whitespace-pre-wrap">{code}</pre>
      </div>
    </div>
  );
};

export default ScriptView;
