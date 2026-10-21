import { useEffect, useMemo, useRef, useState } from "react";
import {
  Copy,
  Check,
  Code2,
  FileCode2,
  Terminal,
  Plus,
} from "lucide-react";
import type { Editor } from "../hooks/useEditor";
import type { ScriptLang } from "../types";
import {
  applyChapterYamlToProject,
  chapterToYaml,
  compileNodeToTypeScript,
  generateProjectScript,
} from "../lib/projectUtils";

interface ScriptViewProps {
  editor: Editor;
  activeChapterId: string | null;
  forcedLang: ScriptLang | null;
  notify: (msg: string) => void;
}

type CodeTab = "node_ts" | "project_code" | "chapter_yaml";

const LANG_OPTIONS: { id: ScriptLang; label: string; badge: string }[] = [
  { id: "typescript", label: "TypeScript (原生核心 API)", badge: "main.ts" },
  { id: "javascript", label: "JavaScript (原生核心 API)", badge: "runtime.js" },
  { id: "lua", label: "Lua (经 TS Bridge 桥接)", badge: "bridge_lua.ts" },
  { id: "teal", label: "Teal (经 TS Bridge 桥接)", badge: "bridge_teal.ts" },
  { id: "python", label: "Python (经 TS Bridge 桥接)", badge: "bridge_py.ts" },
];

const API_SNIPPETS: { label: string; code: string }[] = [
  {
    label: "+ 台词 moovn.say",
    code: `  await moovn.say("苏雨晴", "在这里输入新的对白内容…");`,
  },
  {
    label: "+ 淡出角色 moovn.fade",
    code: `  await moovn.fade({ target: "character", characterId: "c-yuki", direction: "out", durationMs: 600, targetOpacity: 0 });`,
  },
  {
    label: "+ 屏幕文字 moovn.screenText",
    code: `  await moovn.screenText({ text: "—— 屏幕中央显示文字 ——", x: 50, y: 25, fontSize: 28, color: "#38bdf8" });`,
  },
  {
    label: "+ 多帧动画 moovn.animate",
    code: `  await moovn.animate({ targetId: "c-yuki", kind: "frame_sequence", tween: "bounce", fps: 8 });`,
  },
  {
    label: "+ TS桥接Lua moovn.bridge.runLua",
    code: `  const bonus = await moovn.bridge.runLua<number>(\`return (moovn_ctx.affection["c-yuki"] or 0) + 10\`);`,
  },
  {
    label: "+ TS桥接Python moovn.bridge.runPython",
    code: `  await moovn.bridge.runPython(\`state["flag_unlocked"] = True\`);`,
  },
];

export default function ScriptView({
  editor,
  activeChapterId,
  forcedLang,
  notify,
}: ScriptViewProps) {
  const { project, selectedNode } = editor;
  const [tab, setTab] = useState<CodeTab>("node_ts");
  const [lang, setLang] = useState<ScriptLang>("typescript");
  const [selectedChapId, setSelectedChapId] = useState<string>(
    activeChapterId || selectedNode?.chapterId || project.chapters[0]?.id || "ch-1",
  );
  const [yamlDraft, setYamlDraft] = useState("");
  const [nodeCodeDraft, setNodeCodeDraft] = useState("");
  const [copied, setCopied] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (activeChapterId) {
      setSelectedChapId(activeChapterId);
      setTab("chapter_yaml");
    }
  }, [activeChapterId]);

  useEffect(() => {
    if (forcedLang) {
      setLang(forcedLang);
      setTab("project_code");
    }
  }, [forcedLang]);

  useEffect(() => {
    if (selectedNode) {
      setNodeCodeDraft(selectedNode.scriptCode || compileNodeToTypeScript(project, selectedNode));
    }
  }, [selectedNode?.id, selectedNode?.scriptCode]);

  const chapterYaml = useMemo(
    () => chapterToYaml(project, selectedChapId),
    [project, selectedChapId],
  );

  useEffect(() => {
    setYamlDraft(chapterYaml);
  }, [chapterYaml]);

  const projectCode = useMemo(
    () => generateProjectScript(project, lang),
    [project, lang],
  );

  const activeText =
    tab === "node_ts"
      ? nodeCodeDraft
      : tab === "chapter_yaml"
        ? yamlDraft
        : projectCode;

  const lineCount = useMemo(
    () => Math.max(1, activeText.split("\n").length),
    [activeText],
  );

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      notify("已复制到剪贴板");
      setTimeout(() => setCopied(false), 1600);
    } catch {
      notify("复制失败");
    }
  };

  const insertSnippet = (snippet: string) => {
    if (!selectedNode) return;
    setTab("node_ts");
    const next = nodeCodeDraft.trimEnd().endsWith("}")
      ? nodeCodeDraft.replace(/\}\s*$/, `${snippet}\n}`)
      : `${nodeCodeDraft}\n${snippet}`;
    setNodeCodeDraft(next);
    editor.updateNode(selectedNode.id, { scriptCode: next });
    notify("已插入 TypeScript API 调用代码");
  };

  const applyChapterYaml = () => {
    const nextProj = applyChapterYamlToProject(project, selectedChapId, yamlDraft);
    if (!nextProj) {
      notify("章节 YAML 语法有误，请检查缩进与字段格式");
      return;
    }
    editor.replaceProject(nextProj);
    notify("已将本章 YAML 同步至本章全部场景");
  };

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col bg-[#0b0b0f] select-none">
      {/* 顶部模式切换栏 */}
      <div className="flex h-10 shrink-0 flex-wrap items-center justify-between gap-2 border-b border-white/[0.07] bg-[#111116] px-3">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setTab("node_ts")}
            className={`flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-[11.5px] font-medium transition ${
              tab === "node_ts" ? "bg-sky-500 text-white" : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Terminal size={12} /> 节点 TS 脚本
          </button>
          <button
            onClick={() => setTab("project_code")}
            className={`flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-[11.5px] font-medium transition ${
              tab === "project_code" ? "bg-sky-500 text-white" : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Code2 size={12} /> 全工程 TS/JS 与桥接
          </button>
          <button
            onClick={() => setTab("chapter_yaml")}
            className={`flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-[11.5px] font-medium transition ${
              tab === "chapter_yaml" ? "bg-sky-500 text-white" : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <FileCode2 size={12} /> 章节 YAML (一章一YAML)
          </button>
        </div>

        <div className="flex items-center gap-2">
          {tab === "project_code" && (
            <select
              value={lang}
              onChange={(e) => setLang(e.target.value as ScriptLang)}
              className="rounded-lg border border-white/10 bg-zinc-900 px-2.5 py-1 text-[11.5px] text-zinc-200"
            >
              {LANG_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          )}

          {tab === "chapter_yaml" && (
            <>
              <select
                value={selectedChapId}
                onChange={(e) => setSelectedChapId(e.target.value)}
                className="rounded-lg border border-white/10 bg-zinc-900 px-2.5 py-1 text-[11.5px] text-zinc-200"
              >
                {project.chapters.map((ch, idx) => (
                  <option key={ch.id} value={ch.id}>
                    chapter_{idx + 1}.yaml — {ch.title}
                  </option>
                ))}
              </select>
              <button
                onClick={applyChapterYaml}
                className="flex h-7 items-center gap-1 rounded-lg bg-emerald-500/20 px-2.5 text-[11.5px] font-medium text-emerald-300 hover:bg-emerald-500/30"
              >
                <Check size={12} /> 应用本章修改
              </button>
            </>
          )}

          {tab === "node_ts" && selectedNode && (
            <button
              onClick={() => {
                editor.updateNode(selectedNode.id, { scriptCode: nodeCodeDraft });
                notify("已保存节点 TypeScript 代码");
              }}
              className="flex h-7 items-center gap-1 rounded-lg bg-emerald-500/20 px-2.5 text-[11.5px] font-medium text-emerald-300 hover:bg-emerald-500/30"
            >
              <Check size={12} /> 保存脚本
            </button>
          )}

          <button
            onClick={() => handleCopy(activeText)}
            className="flex h-7 items-center gap-1 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 text-[11.5px] text-zinc-200 hover:bg-white/[0.09]"
          >
            {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />} 复制
          </button>
        </div>
      </div>

      {/* 快捷 TypeScript API 代码段插入栏 */}
      {tab === "node_ts" && (
        <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-white/[0.05] bg-[#0e0e13] px-3 py-1.5">
          <span className="text-[10.5px] text-zinc-500">快捷插入 @moovn/sdk API：</span>
          {API_SNIPPETS.map((s) => (
            <button
              key={s.label}
              onClick={() => insertSnippet(s.code)}
              className="flex items-center gap-1 rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 font-mono text-[10.5px] text-sky-300 transition hover:border-sky-400/40 hover:bg-sky-500/15"
            >
              <Plus size={10} /> {s.label.replace("+ ", "")}
            </button>
          ))}
        </div>
      )}

      {/* 带行号的代码编辑器主体 */}
      <div className="editor-scroll relative flex min-h-0 flex-1 overflow-auto bg-[#09090d] font-mono text-[12.5px] leading-[1.65]">
        {/* 行号栏 */}
        <div className="shrink-0 border-r border-white/[0.06] bg-[#0c0c12] px-3 py-4 text-right font-mono text-[11.5px] leading-[1.65] text-zinc-600 select-none">
          {Array.from({ length: lineCount }).map((_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>

        {/* 编辑区 */}
        {tab === "node_ts" ? (
          <textarea
            ref={textareaRef}
            value={nodeCodeDraft}
            onChange={(e) => setNodeCodeDraft(e.target.value)}
            spellCheck={false}
            className="min-h-full flex-1 resize-none bg-transparent p-4 font-mono text-[12.5px] leading-[1.65] text-sky-100 outline-none"
          />
        ) : tab === "chapter_yaml" ? (
          <textarea
            value={yamlDraft}
            onChange={(e) => setYamlDraft(e.target.value)}
            spellCheck={false}
            className="min-h-full flex-1 resize-none bg-transparent p-4 font-mono text-[12.5px] leading-[1.65] text-emerald-100 outline-none"
          />
        ) : (
          <pre className="min-h-full flex-1 p-4 font-mono text-[12.5px] leading-[1.65] text-zinc-200 select-text">
            {projectCode}
          </pre>
        )}
      </div>
    </div>
  );
}
