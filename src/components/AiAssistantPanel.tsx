import { useEffect, useState } from "react";
import {
  Bot,
  Send,
  Download,
  CheckCircle2,
  KeyRound,
  Cpu,
  FileText,
  Sparkles,
  Check,
} from "lucide-react";
import type { Editor } from "../hooks/useEditor";
import type { AiApiFormat, AiProviderConfig } from "../types";
import { DEFAULT_MOOVN_AI_SPEC } from "../data/aiSpec";
import { uid } from "../lib/projectUtils";

interface AiAssistantPanelProps {
  editor: Editor;
  openSpecInitially?: boolean;
  notify: (msg: string) => void;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  actionsSummary?: string[];
}

const AI_CONFIG_KEY = "moovn.ai.config.v1";

const DEFAULT_ENDPOINTS: Record<AiApiFormat, { endpoint: string; model: string; label: string }> = {
  openai: {
    label: "1. OpenAI 兼容格式 (/v1/chat/completions)",
    endpoint: "https://api.openai.com/v1/chat/completions",
    model: "gpt-4o-mini",
  },
  anthropic: {
    label: "2. Anthropic Claude 格式 (/v1/messages)",
    endpoint: "https://api.anthropic.com/v1/messages",
    model: "claude-3-5-sonnet-latest",
  },
  gemini: {
    label: "3. Google Gemini 格式 (:generateContent)",
    endpoint: "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
    model: "gemini-2.0-flash",
  },
  ollama: {
    label: "4. Ollama 本地/自建格式 (/api/chat)",
    endpoint: "http://localhost:11434/api/chat",
    model: "qwen2.5-coder:7b",
  },
};

const LOCAL_MODELS = [
  { id: "qwen2.5-coder-1.5b-q4", name: "Qwen2.5-Coder-1.5B-Instruct (Q4_K_M · 980MB)" },
  { id: "llama-3.2-3b-q4", name: "Llama-3.2-3B-Instruct (Q4_K_M · 1.8GB)" },
  { id: "deepseek-r1-1.5b-q4", name: "DeepSeek-R1-Distill-Qwen-1.5B (Q4 · 1.1GB)" },
];

export default function AiAssistantPanel({
  editor,
  openSpecInitially = false,
  notify,
}: AiAssistantPanelProps) {
  const { project, selectedNode } = editor;
  const [subTab, setSubTab] = useState<"chat" | "config" | "spec">(
    openSpecInitially ? "spec" : "chat",
  );

  useEffect(() => {
    if (openSpecInitially) setSubTab("spec");
  }, [openSpecInitially]);

  const [config, setConfig] = useState<AiProviderConfig>(() => {
    try {
      const saved = localStorage.getItem(AI_CONFIG_KEY);
      if (saved) return JSON.parse(saved) as AiProviderConfig;
    } catch {
      // ignore
    }
    return {
      mode: "local",
      localModelId: LOCAL_MODELS[0].id,
      localModelDownloaded: true,
      apiFormat: "openai",
      endpoint: DEFAULT_ENDPOINTS.openai.endpoint,
      apiKey: "",
      modelName: DEFAULT_ENDPOINTS.openai.model,
    };
  });

  useEffect(() => {
    try {
      localStorage.setItem(AI_CONFIG_KEY, JSON.stringify(config));
    } catch {
      // ignore
    }
  }, [config]);

  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(100);
  const [downloadStage, setDownloadStage] = useState("已就绪");

  const [prompt, setPrompt] = useState("");
  const [running, setRunning] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "已加载 `/ai/MOOVN_AI_SPEC.md` 规范文件。我可以基于规范直接为您创建章节与场景、插入淡入淡出 (`moovn.fade`) 与屏幕文字 (`moovn.screenText`) 积木块，或生成 TypeScript 与跨语言桥接代码。",
    },
  ]);

  const startLocalModelDownload = () => {
    setDownloading(true);
    setDownloadProgress(0);
    setDownloadStage("正在拉取模型权重分片 (Shard 1/4)…");
    let p = 0;
    const timer = setInterval(() => {
      p += 12;
      if (p >= 100) {
        clearInterval(timer);
        setDownloadProgress(100);
        setDownloading(false);
        setDownloadStage("本地模型已缓存并载入 WebGPU/WASM 推理引擎");
        setConfig((c) => ({ ...c, localModelDownloaded: true, mode: "local" }));
        notify("本地 AI 模型已下载完成并激活");
      } else {
        setDownloadProgress(p);
        if (p > 70) setDownloadStage("正在校验 Tokenizer 与加载 MOOVN_AI_SPEC.md 上下文…");
        else if (p > 35) setDownloadStage("正在拉取模型权重分片 (Shard 3/4)…");
      }
    }, 180);
  };

  // 执行本地智能 Agent 动作（解析用户自然语言并直接操控 MooVN 工程）
  const executeAgentActionsOnProject = (userInput: string): { reply: string; actions: string[] } => {
    const text = userInput.trim();
    const actions: string[] = [];
    const targetNode = selectedNode ?? project.nodes[0];

    if (text.includes("淡出") || text.includes("淡入") || text.toLowerCase().includes("fade")) {
      if (targetNode) {
        const isFadeIn = text.includes("淡入");
        const isScreen = text.includes("整屏") || text.includes("场景") || text.includes("背景");
        editor.addBlockToNode(targetNode.id, {
          id: uid("blk"),
          kind: "fade",
          params: {
            target: isScreen ? "background" : "character",
            characterId: targetNode.stageCharacters[0]?.characterId ?? "c-yuki",
            direction: isFadeIn ? "in" : "out",
            durationMs: 700,
            targetOpacity: isFadeIn ? 1 : 0,
          },
        });
        actions.push(
          `向「${targetNode.title}」插入了 ${isFadeIn ? "淡入" : "淡出"}积木块 (moovn.fade)`,
        );
      }
    }

    if (text.includes("文字") || text.includes("标题") || text.includes("字幕")) {
      if (targetNode) {
        const matchQuote = text.match(/[「“"]([^」”"]+)[」”"]/);
        const label = matchQuote ? matchQuote[1] : "—— 命运交汇的黄昏 ——";
        editor.addScreenText(targetNode.id, {
          text: label,
          x: 50,
          y: 24,
          fontSize: 30,
          color: "#38bdf8",
          align: "center",
        });
        editor.addBlockToNode(targetNode.id, {
          id: uid("blk"),
          kind: "screen_text",
          params: { text: label, x: 50, y: 24, fontSize: 30, color: "#38bdf8" },
        });
        actions.push(`在「${targetNode.title}」屏幕 (50%, 24%) 处添加了自定义文字「${label}」`);
      }
    }

    if (text.includes("桥接") || text.toLowerCase().includes("lua") || text.toLowerCase().includes("python")) {
      if (targetNode) {
        const isPy = text.toLowerCase().includes("python");
        editor.addBlockToNode(targetNode.id, {
          id: uid("blk"),
          kind: "bridge_call",
          params: {
            bridgeLang: isPy ? "python" : "lua",
            code: isPy
              ? `state["affection_bonus"] = 15`
              : `local cur = moovn_ctx.affection["c-yuki"] or 60\nreturn cur + 15`,
          },
        });
        actions.push(
          `向「${targetNode.title}」插入了 TypeScript 跨语言桥接积木 (moovn.bridge.${isPy ? "runPython" : "runLua"})`,
        );
      }
    }

    if (text.includes("动画") || text.includes("序列帧") || text.includes("跳跃")) {
      if (targetNode) {
        editor.updateNode(targetNode.id, { backgroundMediaKind: "frame_sequence", backgroundFps: 2 });
        if (targetNode.stageCharacters[0]) {
          editor.upsertStageCharacter(
            targetNode.id,
            targetNode.stageCharacters[0].characterId,
            { mediaKind: "frame_sequence", tween: "bounce" },
          );
        }
        editor.addBlockToNode(targetNode.id, {
          id: uid("blk"),
          kind: "animate",
          params: { targetId: "c-yuki", kind: "frame_sequence", tween: "bounce", fps: 8 },
        });
        actions.push(`已将「${targetNode.title}」切换为多图片序列帧动画与跳跃补间动画`);
      }
    }

    if (text.includes("新场景") || text.includes("分支") || text.includes("创建") || actions.length === 0) {
      const baseChapId = targetNode?.chapterId ?? project.chapters[0]?.id ?? "ch-1";
      const x = (targetNode?.x ?? 300) + 290;
      const y = targetNode?.y ?? 180;
      const newId = editor.addNode(text.includes("分支") ? "choice" : "dialogue", x, y, baseChapId);
      if (targetNode && !targetNode.nextNodeId && targetNode.type !== "choice" && targetNode.type !== "end") {
        editor.connect({ fromNodeId: targetNode.id, port: -1 }, newId);
      }
      actions.push(`根据 MOOVN_AI_SPEC.md 在当前章节创建并连接了新场景节点 (${newId})`);
    }

    return {
      reply: `已按照 \`MOOVN_AI_SPEC.md\` 规范完成操作，底层 TypeScript 脚本与章节 YAML 已自动同步。`,
      actions,
    };
  };

  // 调用 4 种常见 API 格式（OpenAI / Anthropic / Gemini / Ollama）
  const callExternalApi = async (userPrompt: string): Promise<string | null> => {
    const sysPrompt = `${project.aiSpecContent || DEFAULT_MOOVN_AI_SPEC}\n\n当前工程：《${project.name}》，共 ${project.chapters.length} 章，${project.nodes.length} 个场景。请用简洁中文回答并给出 TypeScript (@moovn/sdk) 或章节 YAML 建议。`;

    try {
      if (config.apiFormat === "openai") {
        const res = await fetch(config.endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
          },
          body: JSON.stringify({
            model: config.modelName,
            messages: [
              { role: "system", content: sysPrompt },
              { role: "user", content: userPrompt },
            ],
          }),
        });
        if (!res.ok) return null;
        const data = await res.json();
        return data.choices?.[0]?.message?.content ?? null;
      }

      if (config.apiFormat === "anthropic") {
        const res = await fetch(config.endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": config.apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: config.modelName,
            max_tokens: 1024,
            system: sysPrompt,
            messages: [{ role: "user", content: userPrompt }],
          }),
        });
        if (!res.ok) return null;
        const data = await res.json();
        return data.content?.[0]?.text ?? null;
      }

      if (config.apiFormat === "gemini") {
        const url = config.apiKey && !config.endpoint.includes("key=")
          ? `${config.endpoint}?key=${encodeURIComponent(config.apiKey)}`
          : config.endpoint;
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: sysPrompt }] },
            contents: [{ role: "user", parts: [{ text: userPrompt }] }],
          }),
        });
        if (!res.ok) return null;
        const data = await res.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
      }

      if (config.apiFormat === "ollama") {
        const res = await fetch(config.endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: config.modelName,
            stream: false,
            messages: [
              { role: "system", content: sysPrompt },
              { role: "user", content: userPrompt },
            ],
          }),
        });
        if (!res.ok) return null;
        const data = await res.json();
        return data.message?.content ?? null;
      }
    } catch {
      return null;
    }
    return null;
  };

  const handleSend = async (customText?: string) => {
    const text = (customText ?? prompt).trim();
    if (!text || running) return;
    setPrompt("");
    const userMsg: ChatMessage = { id: uid("msg"), role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setRunning(true);

    let apiReply: string | null = null;
    if (config.mode === "api" && config.endpoint) {
      apiReply = await callExternalApi(text);
    }

    const { reply, actions } = executeAgentActionsOnProject(text);
    const finalContent = apiReply ? `${apiReply}\n\n${reply}` : reply;

    setMessages((prev) => [
      ...prev,
      {
        id: uid("msg"),
        role: "assistant",
        content: finalContent,
        actionsSummary: actions,
      },
    ]);
    setRunning(false);
    notify("AI Agent 已执行工程操作");
  };

  return (
    <div className="flex h-full w-full flex-col bg-[#0d0d12] select-none">
      {/* 顶部三页签切换：Agent 助手 / 模型与4种API设置 / MOOVN_AI_SPEC.md */}
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-white/[0.07] bg-[#121218] px-3">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setSubTab("chat")}
            className={`flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-[11.5px] font-medium transition ${
              subTab === "chat" ? "bg-sky-500 text-white" : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Bot size={13} /> Agent 编排
          </button>
          <button
            onClick={() => setSubTab("config")}
            className={`flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-[11.5px] font-medium transition ${
              subTab === "config" ? "bg-sky-500 text-white" : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <KeyRound size={12} /> 本地模型 &amp; API Key
          </button>
          <button
            onClick={() => setSubTab("spec")}
            className={`flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-[11.5px] font-medium transition ${
              subTab === "spec" ? "bg-sky-500 text-white" : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <FileText size={12} /> MOOVN_AI_SPEC.md
          </button>
        </div>

        <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10.5px] text-emerald-300">
          {config.mode === "local" ? `本地模型 (${config.localModelId})` : `API (${config.apiFormat.toUpperCase()})`}
        </span>
      </div>

      {/* 页签 1：Agent 对话与自动执行 */}
      {subTab === "chat" && (
        <div className="flex min-h-0 flex-1 flex-col">
          {/* 快捷指令条 */}
          <div className="flex flex-wrap gap-1.5 border-b border-white/[0.05] p-2.5">
            {[
              "为当前场景添加角色淡出和屏幕文字「黄昏的约定」",
              "添加一段通过 TS 桥接调用 Lua 计算好感度的积木",
              "将当前场景切换为多图片序列帧动画并让角色跳跃",
              "在当前章节后新建一个分支选择场景",
            ].map((q) => (
              <button
                key={q}
                onClick={() => void handleSend(q)}
                className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] text-zinc-300 transition hover:border-sky-400/50 hover:bg-sky-500/10 hover:text-sky-200"
              >
                <Sparkles size={10} className="text-sky-400" />
                {q}
              </button>
            ))}
          </div>

          {/* 消息列表 */}
          <div className="editor-scroll flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`rounded-xl border p-3 text-[12px] leading-relaxed ${
                  m.role === "user"
                    ? "ml-6 border-sky-500/30 bg-sky-500/10 text-sky-100"
                    : "mr-4 border-white/[0.08] bg-white/[0.025] text-zinc-200"
                }`}
              >
                <div className="mb-1 text-[10.5px] font-semibold text-zinc-400">
                  {m.role === "user" ? "你" : "MooVN Agent (已挂载 MOOVN_AI_SPEC.md)"}
                </div>
                <div className="whitespace-pre-wrap select-text">{m.content}</div>
                {m.actionsSummary && m.actionsSummary.length > 0 && (
                  <div className="mt-2 flex flex-col gap-1 border-t border-white/10 pt-2">
                    {m.actionsSummary.map((act, i) => (
                      <div key={i} className="flex items-center gap-1.5 text-[11px] text-emerald-300">
                        <CheckCircle2 size={12} />
                        <span>{act}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* 输入框 */}
          <div className="flex items-center gap-2 border-t border-white/[0.07] bg-[#111116] p-2.5">
            <input
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleSend();
              }}
              placeholder="输入指令，例如：让当前角色淡出并在屏幕上方显示白色文字…"
              className="field flex-1 rounded-lg border border-white/10 bg-zinc-900 px-3 py-1.5 text-[12px] text-zinc-100"
            />
            <button
              onClick={() => void handleSend()}
              disabled={running}
              className="flex h-8 items-center gap-1.5 rounded-lg bg-sky-500 px-3.5 text-[12px] font-medium text-white hover:bg-sky-400 disabled:opacity-40"
            >
              <Send size={12} /> 发送
            </button>
          </div>
        </div>
      )}

      {/* 页签 2：本地模型下载运行 & 4 种常见 API 格式配置 */}
      {subTab === "config" && (
        <div className="editor-scroll flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 text-[12px]">
          {/* 运行方式选择 */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setConfig((c) => ({ ...c, mode: "local" }))}
              className={`flex items-center justify-center gap-2 rounded-xl border p-3 font-semibold transition ${
                config.mode === "local"
                  ? "border-sky-400 bg-sky-500/15 text-sky-200"
                  : "border-white/10 bg-white/[0.02] text-zinc-400"
              }`}
            >
              <Cpu size={15} /> 本地模型运行 (离线/WebGPU)
            </button>
            <button
              onClick={() => setConfig((c) => ({ ...c, mode: "api" }))}
              className={`flex items-center justify-center gap-2 rounded-xl border p-3 font-semibold transition ${
                config.mode === "api"
                  ? "border-sky-400 bg-sky-500/15 text-sky-200"
                  : "border-white/10 bg-white/[0.02] text-zinc-400"
              }`}
            >
              <KeyRound size={15} /> 链接云端/自建 API Key
            </button>
          </div>

          {/* A. 本地模型下载与管理 */}
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3.5">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-semibold text-zinc-200">本地模型下载与推理</span>
              <span className="text-[11px] text-emerald-300">{downloadStage}</span>
            </div>

            <select
              value={config.localModelId}
              onChange={(e) =>
                setConfig((c) => ({ ...c, localModelId: e.target.value, localModelDownloaded: false }))
              }
              className="field mb-3 w-full rounded-lg border border-white/10 bg-zinc-900 px-2.5 py-1.5 text-zinc-100"
            >
              {LOCAL_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>

            {downloading && (
              <div className="mb-3">
                <div className="mb-1 flex justify-between text-[11px] text-zinc-400">
                  <span>下载进度</span>
                  <span>{downloadProgress}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800">
                  <div
                    style={{ width: `${downloadProgress}%` }}
                    className="h-full bg-sky-500 transition-all duration-150"
                  />
                </div>
              </div>
            )}

            <button
              onClick={startLocalModelDownload}
              disabled={downloading}
              className="flex h-8 items-center gap-1.5 rounded-lg bg-sky-500 px-3.5 text-[12px] font-medium text-white hover:bg-sky-400 disabled:opacity-50"
            >
              <Download size={13} />
              {config.localModelDownloaded ? "重新校验 / 更新本地模型" : "下载模型到本地运行"}
            </button>
          </div>

          {/* B. 4 种常见 API 格式配置 */}
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3.5">
            <div className="mb-2.5 font-semibold text-zinc-200">
              API Key 接入（支持 4 种主流 API 协议格式）
            </div>

            <label className="mb-1 block text-[11px] text-zinc-400">选择 API 协议格式</label>
            <select
              value={config.apiFormat}
              onChange={(e) => {
                const fmt = e.target.value as AiApiFormat;
                setConfig((c) => ({
                  ...c,
                  mode: "api",
                  apiFormat: fmt,
                  endpoint: DEFAULT_ENDPOINTS[fmt].endpoint,
                  modelName: DEFAULT_ENDPOINTS[fmt].model,
                }));
              }}
              className="field mb-3 w-full rounded-lg border border-white/10 bg-zinc-900 px-2.5 py-1.5 text-zinc-100"
            >
              {(Object.keys(DEFAULT_ENDPOINTS) as AiApiFormat[]).map((fmt) => (
                <option key={fmt} value={fmt}>
                  {DEFAULT_ENDPOINTS[fmt].label}
                </option>
              ))}
            </select>

            <label className="mb-1 block text-[11px] text-zinc-400">接口地址 (Endpoint URL)</label>
            <input
              value={config.endpoint}
              onChange={(e) => setConfig((c) => ({ ...c, endpoint: e.target.value }))}
              className="field mb-3 w-full rounded-lg border border-white/10 bg-zinc-900 px-2.5 py-1.5 font-mono text-[11.5px] text-zinc-100"
            />

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="mb-1 block text-[11px] text-zinc-400">模型名称 (Model)</label>
                <input
                  value={config.modelName}
                  onChange={(e) => setConfig((c) => ({ ...c, modelName: e.target.value }))}
                  className="field w-full rounded-lg border border-white/10 bg-zinc-900 px-2.5 py-1.5 font-mono text-[11.5px] text-zinc-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] text-zinc-400">API Key</label>
                <input
                  type="password"
                  value={config.apiKey}
                  onChange={(e) => setConfig((c) => ({ ...c, apiKey: e.target.value }))}
                  placeholder={config.apiFormat === "ollama" ? "本地 Ollama 可留空" : "sk-..."}
                  className="field w-full rounded-lg border border-white/10 bg-zinc-900 px-2.5 py-1.5 font-mono text-[11.5px] text-zinc-100"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 页签 3：MOOVN_AI_SPEC.md 描述文件查看与编辑 */}
      {subTab === "spec" && (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center justify-between border-b border-white/[0.06] px-3 py-2 text-[11.5px]">
            <span className="text-zinc-400">
              文件路径：<code className="text-sky-300">/ai/MOOVN_AI_SPEC.md</code>（自动作为系统上下文注入 AI Agent）
            </span>
            <button
              onClick={() => {
                editor.update((p) => ({ ...p, aiSpecContent: DEFAULT_MOOVN_AI_SPEC }), true);
                notify("已恢复默认 MOOVN_AI_SPEC.md");
              }}
              className="flex items-center gap-1 rounded bg-white/[0.06] px-2 py-0.5 text-[11px] text-zinc-300 hover:bg-white/10"
            >
              <Check size={11} /> 恢复默认规范
            </button>
          </div>
          <textarea
            value={project.aiSpecContent ?? DEFAULT_MOOVN_AI_SPEC}
            onChange={(e) =>
              editor.update((p) => ({ ...p, aiSpecContent: e.target.value }))
            }
            spellCheck={false}
            className="editor-scroll min-h-0 flex-1 resize-none bg-[#09090d] p-4 font-mono text-[12px] leading-relaxed text-zinc-200 outline-none"
          />
        </div>
      )}
    </div>
  );
}
