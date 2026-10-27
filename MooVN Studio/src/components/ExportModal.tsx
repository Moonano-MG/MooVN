import React, { useMemo, useState } from 'react';
import { Download, Layers, X } from 'lucide-react';
import type { GamePerformanceConfig, VNProject } from '../types';
import { buildStandaloneGameHtml, createStandaloneAssetCatalog } from '../lib/gamePackager';
import { DEFAULT_PERFORMANCE_CONFIG, downloadChapterMsvnFile } from '../lib/assetCompressionEngine';
import { exportProjectAsMpvn } from '../lib/mpvnFormat';
import { compileAndCheckProjectTypeScript } from '../lib/nodeCodeCompiler';
import { ASSET_PREFIX, hydrateAssetsForHtmlExport } from '../lib/assetStore';

interface ExportModalProps {
  project: VNProject;
  onClose: () => void;
  onUpdateProjectPerformance?: (perf: GamePerformanceConfig) => void;
}

type ExportTab = 'package' | 'msvn' | 'mpvn';

export const ExportModal: React.FC<ExportModalProps> = ({ project, onClose, onUpdateProjectPerformance }) => {
  const [activeTab, setActiveTab] = useState<ExportTab>('package');
  const [name, setName] = useState(project.title);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [perf, setPerf] = useState<GamePerformanceConfig>(project.performanceConfig || DEFAULT_PERFORMANCE_CONFIG);
  const graphCheck = useMemo(() => compileAndCheckProjectTypeScript(project), [project]);

  const updateCompressionLevel = (level: number) => {
    const next = { ...perf, compressionFormat: 'moovn_lz77' as const, compressionLevel: level };
    setPerf(next);
    onUpdateProjectPerformance?.(next);
  };

  const runExport = async (operation: () => Promise<string>) => {
    if (busy) return;
    setBusy(true);
    setStatus(null);
    try { setStatus(await operation()); }
    catch (error: unknown) { setStatus(`导出失败：${error instanceof Error ? error.message : String(error)}`); }
    finally { setBusy(false); }
  };

  const ensurePortableProjectExport = () => {
    // A JSON project/section cannot carry the separate workspace asset directory yet.
    if (JSON.stringify(project).includes(ASSET_PREFIX)) {
      throw new Error('工程引用外置素材；可移植工程包尚未实现，请备份整个工作区。');
    }
  };

  const exportHtml = () => runExport(async () => {
    const hydrated = await hydrateAssetsForHtmlExport(project);
    const catalog = await createStandaloneAssetCatalog(project);
    const html = buildStandaloneGameHtml({ ...hydrated, performanceConfig: perf }, catalog);
    const safeName = (name || project.title || 'MooVN_Game').replace(/[\\/:*?"<>|\s]+/g, '_');
    const filename = `${safeName}.html`;
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url; link.download = filename; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    return `已发起 HTML 下载：${filename}`;
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 select-none">
      <div className="w-full max-w-3xl bg-[#161619] border border-[#27272c] rounded-lg shadow-2xl overflow-hidden flex flex-col max-h-[88vh]">
        <div className="flex items-center justify-between px-4 py-2.5 bg-[#121215] border-b border-[#27272c] shrink-0">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs font-semibold text-zinc-100">导出</span>
            <div className="flex items-center bg-[#18181c] p-0.5 rounded border border-[#27272c] text-xs">
              {([['package', '导出游戏'], ['msvn', '导出章节 (.msvn)'], ['mpvn', '导出工程 (.mpvn)']] as const).map(([id, label]) => (
                <button key={id} onClick={() => setActiveTab(id)} className={`px-3 py-1 rounded text-[11px] ${activeTab === id ? 'bg-zinc-200 text-zinc-950 font-semibold' : 'text-zinc-400'}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <button onClick={onClose} className="icon-btn" aria-label="关闭导出"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-4 overflow-y-auto space-y-4 text-xs flex-1">
          <div className={`p-2.5 rounded border ${graphCheck.errorCount ? 'border-rose-500/40 text-rose-200' : 'border-zinc-700 text-zinc-300'}`}>
            <div className="font-semibold">工程图基础校验（不检查脚本语法）</div>
            <div className="text-[10px] mt-1">
              {graphCheck.errorCount || graphCheck.warningCount
                ? `${graphCheck.errorCount} 个错误，${graphCheck.warningCount} 个警告：${graphCheck.diagnostics[0]?.message || ''}`
                : '未发现入口或已连接目标问题；这不等于完整构建或语法检查。'}
            </div>
          </div>

          {activeTab === 'package' && <div className="space-y-3">
            <div className="p-3 rounded bg-[#1c1c20] border border-[#27272c] space-y-1">
              <div className="font-semibold text-zinc-100">HTML5 单文件</div>
              <p className="text-zinc-400">导出包含当前内置图片和外置角色媒体的 HTML 文件。Windows、macOS、Android 和 iOS 原生安装包尚未实现。HTML 播放器仅支持部分节点，尚不等同于编辑器预览。</p>
            </div>
            <label className="block text-zinc-400">文件名称
              <input value={name} onChange={(event) => setName(event.target.value)} className="w-full mt-1 px-2.5 py-1.5 text-xs" />
            </label>
            <div className="p-3 rounded bg-[#1c1c20] border border-[#27272c] space-y-2">
              <div className="font-semibold text-zinc-200">章节包压缩</div>
              <p className="text-zinc-400">使用 MooVN 内置 LZ77；仅影响 .msvn 章节数据，不压缩 HTML 或图片。0 为不压缩。</p>
              <label className="flex items-center gap-3 text-zinc-300">压缩级别 {perf.compressionLevel}
                <input type="range" min={0} max={9} value={perf.compressionLevel} onChange={(event) => updateCompressionLevel(Number(event.target.value))} />
              </label>
            </div>
            <button type="button" disabled={busy} onClick={() => void exportHtml()} className="px-4 py-2 rounded bg-zinc-200 text-zinc-950 font-semibold inline-flex items-center gap-1.5 disabled:opacity-50">
              <Download className="w-3.5 h-3.5" /> 导出 HTML5
            </button>
          </div>}

          {activeTab === 'msvn' && <div className="space-y-2">
            <p className="text-zinc-400">章节文件包含节点数据与素材清单；外置素材的可移植打包及 HTML 运行时的章节加载尚未实现。</p>
            {project.chapters.map((chapter) => <div key={chapter.id} className="p-2.5 rounded bg-[#1c1c20] border border-[#27272c] flex items-center justify-between gap-3">
              <span>{chapter.title} · {project.nodes.filter((node) => node.chapterId === chapter.id).length} 节点</span>
              <button type="button" disabled={busy} onClick={() => void runExport(async () => {
                ensurePortableProjectExport();
                const file = downloadChapterMsvnFile(project, chapter.id, { ...perf, compressionFormat: 'moovn_lz77' });
                return `已发起章节下载：${file}`;
              })} className="px-2.5 py-1 rounded bg-[#27272c] text-zinc-100 inline-flex items-center gap-1 disabled:opacity-50"><Layers className="w-3.5 h-3.5" /> 导出 .msvn</button>
            </div>)}
          </div>}

          {activeTab === 'mpvn' && <div className="p-4 rounded bg-[#1c1c20] border border-[#27272c] space-y-2">
            <p className="text-zinc-300">导出工程 JSON。若工程引用外置素材，请备份整个工作区；独立工程与素材打包尚未实现。</p>
            <button type="button" disabled={busy} onClick={() => void runExport(async () => {
              ensurePortableProjectExport();
              return `已发起工程下载：${await exportProjectAsMpvn(project)}`;
            })} className="px-4 py-2 rounded bg-zinc-200 text-zinc-950 font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"><Download className="w-3.5 h-3.5" /> 导出 .mpvn</button>
          </div>}
          {status && <div role="status" className="text-amber-200 break-words">{status}</div>}
        </div>
      </div>
    </div>
  );
};
