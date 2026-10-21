import { useEffect, useMemo, useState } from "react";
import {
  Copy,
  Play,
  Flag,
  GitBranch,
  MessageSquare,
  Check,
  Code2,
  FileCode2,
  Blocks,
  Download,
} from "lucide-react";
import type { Editor } from "../hooks/useEditor";
import type { ScriptLanguage } from "../types";
import { ENDING_LABELS } from "../types";
import { backgroundById } from "../data/assets";
import {
  charById,
  generateProjectScript,
  nodeById,
  nodeToYaml,
  projectToYaml,
  yamlToNodePatch,
} from "../lib/projectUtils";
import { exportTextFile } from "../lib/tauriBridge";

interface ScriptViewProps {
  editor: Editor;
  onSelectNode: (id: string) => void;
  onPreviewFrom: (id: string) => void;
  notify: (msg: string) => void;
}

type SubTab = "blocks" | "yaml" | "code";

const LANG_OPTIONS: { id: ScriptLanguage; label: string; ext: string }[] = [
  { id: "lua", label: "Lua", ext: "lua" },
  { id: "teal", label: "Teal (Typed Lua)", ext: "tl" },
  { id: "python", label: "Python", ext: "py" },
  { id: "typescript", label: "TypeScript / JS", ext: "ts" },
];

export default function ScriptView({
  editor,
  onSelectNode,
  onPreviewFrom,
  notify,
}: ScriptViewProps) {
  const { project, selectedNodeId, selectedNode } = editor;
  const [subTab, setSubTab] = useState<SubTab>("blocks");
  const [lang, setLang] = useState<ScriptLanguage>("lua");
  const [yamlScope, setYamlScope] = useState<"scene" | "project">("scene");
  const [yamlDraft, setYamlDraft] = useState("");
  const [copied, setCopied] = useState(false);

  const generatedYaml = useMemo(() => {
    if (yamlScope === "scene" && selectedNode) {
      return nodeToYaml(project, selectedNode);
    }
    return projectToYaml(project);
  }, [project, selectedNode, yamlScope]);

  useEffect(() => {
    setYamlDraft(generatedYaml);
  }, [generatedYaml]);

  const generatedCode = useMemo(() => generateProjectScript(project, lang), [project, lang]);

  const handleCopy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      notify(`已复制 ${label} 到剪贴板`);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      notify("复制失败，请检查剪贴板权限");
    }
  };

  const applyYamlToScene = () => {
    if (!selectedNode) return;
    const patch = yamlToNodePatch(project, yamlDraft);
    if (!patch) {
      notify("YAML 格式有误，请检查缩进与语法");
      return;
    }
    editor.updateNode(selectedNode.id, patch);
    notify(`已将 YAML 配置应用到「${selectedNode.title}」`);
  };

  return (
    <div className="editor-scroll min-w-0 flex-1 overflow-y-auto bg-[#09090b] px-6 py-6">
      <div className="mx-auto max-w-4xl">
        {/* 头部切换栏 */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] pb-4">
          <div>
            <h1 className="text-xl font-bold text-zinc-100">《{project.name}》· 脚本与配置文件</h1>
            <p className="mt-1 text-[12px] text-zinc-500">
              共 {project.chapters.length} 个章节 · {project.nodes.length} 个场景 · 支持可视化代码块、YAML 场景导出及 Lua / Teal / Python / TypeScript
            </p>
          </div>

          <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1">
            <button
              onClick={() => setSubTab("blocks")}
              className={`flex h-7 items-center gap-1.5 rounded-lg px-3 text-[12px] font-medium transition ${
                subTab === "blocks" ? "bg-sky-500 text-white" : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <Blocks size={13} /> 可视化代码块
            </button>
            <button
              onClick={() => setSubTab("yaml")}
              className={`flex h-7 items-center gap-1.5 rounded-lg px-3 text-[12px] font-medium transition ${
                subTab === "yaml" ? "bg-sky-500 text-white" : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <FileCode2 size={13} /> 场景 YAML
            </button>
            <button
              onClick={() => setSubTab("code")}
              className={`flex h-7 items-center gap-1.5 rounded-lg px-3 text-[12px] font-medium transition ${
                subTab === "code" ? "bg-sky-500 text-white" : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <Code2 size={13} /> 多语言代码
            </button>
          </div>
        </div>

        {/* 1. 可视化剧本积木视图 */}
        {subTab === "blocks" && (
          <div className="flex flex-col gap-5">
            {project.chapters.map((chapter) => {
              const scenes = project.nodes.filter((n) => n.chapterId === chapter.id);
              return (
                <div key={chapter.id} className="flex flex-col gap-3">
                  <div className="flex items-center gap-2 px-1">
                    <span className="h-2 w-2 rounded-full bg-sky-400" />
                    <h2 className="text-[14px] font-bold text-zinc-200">{chapter.title}</h2>
                    <span className="text-[11.5px] text-zinc-500">({scenes.length} 个场景)</span>
                  </div>

                  {scenes.map((node) => {
                    const bg = backgroundById(node.backgroundId);
                    const active = selectedNodeId === node.id;
                    const nextNode = nodeById(project, node.nextNodeId);
                    return (
                      <section
                        key={node.id}
                        onClick={() => onSelectNode(node.id)}
                        className={`cursor-pointer rounded-2xl border p-4 transition ${
                          active
                            ? "border-sky-400/50 bg-sky-400/[0.04]"
                            : "border-white/[0.07] bg-white/[0.02] hover:border-white/15"
                        }`}
                      >
                        <div className="mb-3 flex items-center gap-2">
                          <span
                            className={`flex h-6 w-6 items-center justify-center rounded-lg text-[11px] ${
                              node.type === "choice"
                                ? "bg-amber-400/15 text-amber-300"
                                : node.type === "end"
                                  ? "bg-emerald-400/15 text-emerald-300"
                                  : "bg-sky-500/15 text-sky-300"
                            }`}
                          >
                            {node.type === "choice" && <GitBranch size={13} />}
                            {node.type === "end" && <Flag size={13} />}
                            {node.type !== "choice" && node.type !== "end" && <MessageSquare size={13} />}
                          </span>
                          <h3 className="text-[14px] font-semibold text-zinc-100">{node.title}</h3>
                          {bg && (
                            <span className="rounded-md bg-white/[0.05] px-2 py-0.5 text-[11px] text-zinc-400">
                              场景：{bg.name}
                            </span>
                          )}
                          {node.stageCharacters.length > 0 && (
                            <span className="rounded-md bg-sky-500/10 px-2 py-0.5 text-[11px] text-sky-300">
                              在场角色：{node.stageCharacters.length}
                            </span>
                          )}
                          <div className="flex-1" />
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onPreviewFrom(node.id);
                            }}
                            className="flex h-7 items-center gap-1 rounded-lg bg-white/[0.06] px-2.5 text-[11.5px] text-zinc-200 transition hover:bg-sky-500 hover:text-white"
                          >
                            <Play size={11} /> 试玩
                          </button>
                        </div>

                        {node.type === "end" ? (
                          <div className="rounded-xl bg-emerald-400/[0.07] px-3.5 py-2.5 text-[13px] text-emerald-200">
                            <span className="font-semibold">
                              {ENDING_LABELS[node.endingKind ?? "normal"]}：
                            </span>
                            {node.endingDescription || "故事在此结束。"}
                          </div>
                        ) : (
                          <div className="flex flex-col gap-2">
                            {node.lines.map((line) => {
                              const sp = line.characterId ? charById(project, line.characterId) : null;
                              return (
                                <div
                                  key={line.id}
                                  className="flex items-baseline gap-3 rounded-lg bg-white/[0.015] px-2.5 py-1.5 text-[13px] leading-relaxed"
                                >
                                  <span
                                    className="w-20 shrink-0 text-right text-[12px] font-semibold"
                                    style={{ color: sp?.color ?? "#71717a" }}
                                  >
                                    {sp ? sp.name : "旁白"}
                                  </span>
                                  <p className="flex-1 text-zinc-200">
                                    {line.text || <span className="text-zinc-600 italic">（空台词）</span>}
                                  </p>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {node.type === "choice" && node.choices.length > 0 && (
                          <div className="mt-3 flex flex-col gap-1.5 border-t border-white/[0.06] pt-3">
                            {node.choices.map((c, idx) => {
                              const target = nodeById(project, c.targetNodeId);
                              return (
                                <div
                                  key={c.id}
                                  className="flex items-center justify-between rounded-lg bg-amber-400/[0.06] px-3 py-1.5 text-[12px]"
                                >
                                  <span className="text-amber-200">
                                    选项 {idx + 1}：{c.text}
                                  </span>
                                  <span className="text-zinc-400">
                                    → {target ? target.title : "（未连接）"}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {node.type !== "choice" && node.type !== "end" && (
                          <div className="mt-2.5 text-right text-[11px] text-zinc-500">
                            下一场景：{nextNode ? nextNode.title : "（未连接）"}
                          </div>
                        )}
                      </section>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}

        {/* 2. 场景 YAML 配置导入/导出与实时编辑 */}
        {subTab === "yaml" && (
          <div className="rounded-2xl border border-white/10 bg-[#121216] overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.07] px-4 py-3">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setYamlScope("scene")}
                  className={`rounded-lg px-3 py-1 text-[12px] font-medium transition ${
                    yamlScope === "scene" ? "bg-sky-500/20 text-sky-300" : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  当前场景 YAML ({selectedNode?.title ?? "未选择"})
                </button>
                <button
                  onClick={() => setYamlScope("project")}
                  className={`rounded-lg px-3 py-1 text-[12px] font-medium transition ${
                    yamlScope === "project" ? "bg-sky-500/20 text-sky-300" : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  全工程 YAML
                </button>
              </div>

              <div className="flex items-center gap-2">
                {yamlScope === "scene" && selectedNode && (
                  <button
                    onClick={applyYamlToScene}
                    className="flex h-7 items-center gap-1 rounded-lg bg-emerald-500/20 px-3 text-[12px] font-medium text-emerald-300 hover:bg-emerald-500/30"
                  >
                    <Check size={13} /> 应用修改到当前场景
                  </button>
                )}
                <button
                  onClick={() => handleCopy(yamlDraft, "YAML 配置")}
                  className="flex h-7 items-center gap-1 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 text-[12px] text-zinc-200 hover:bg-white/[0.09]"
                >
                  {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />} 复制
                </button>
                <button
                  onClick={() =>
                    void exportTextFile(
                      yamlScope === "scene" && selectedNode ? `${selectedNode.id}.yaml` : `${project.name}.yaml`,
                      yamlDraft,
                    )
                  }
                  className="flex h-7 items-center gap-1 rounded-lg bg-sky-500 px-3 text-[12px] font-medium text-white hover:bg-sky-400"
                >
                  <Download size={12} /> 导出 .yaml
                </button>
              </div>
            </div>

            <textarea
              value={yamlDraft}
              onChange={(e) => setYamlDraft(e.target.value)}
              spellCheck={false}
              className="field h-[520px] w-full resize-none bg-[#0c0c0f] p-4 font-mono text-[12.5px] leading-relaxed text-sky-200"
            />
          </div>
        )}

        {/* 3. 多语言纯代码模式 (Lua / Teal / Python / TypeScript) */}
        {subTab === "code" && (
          <div className="rounded-2xl border border-white/10 bg-[#121216] overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.07] px-4 py-3">
              <div className="flex items-center gap-1">
                {LANG_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => setLang(opt.id)}
                    className={`rounded-lg px-3 py-1 text-[12px] font-medium transition ${
                      lang === opt.id ? "bg-sky-500 text-white" : "text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleCopy(generatedCode, `${lang.toUpperCase()} 脚本`)}
                  className="flex h-7 items-center gap-1 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 text-[12px] text-zinc-200 hover:bg-white/[0.09]"
                >
                  <Copy size={12} /> 复制代码
                </button>
                <button
                  onClick={() => {
                    const ext = LANG_OPTIONS.find((o) => o.id === lang)?.ext ?? "txt";
                    void exportTextFile(`${project.name}.${ext}`, generatedCode);
                  }}
                  className="flex h-7 items-center gap-1 rounded-lg bg-sky-500 px-3 text-[12px] font-medium text-white hover:bg-sky-400"
                >
                  <Download size={12} /> 导出代码文件
                </button>
              </div>
            </div>

            <pre className="editor-scroll h-[520px] overflow-auto bg-[#0c0c0f] p-4 font-mono text-[12.5px] leading-relaxed text-zinc-200">
              {generatedCode}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
