import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  Trash2,
  Settings,
  Check,
  AlertCircle,
  Loader2,
  Bot,
  MessageSquare,
  Play,
} from 'lucide-react';
import {
  AiAgentConfig,
  AiChatMessage,
  SceneNode,
  VNProject,
  WorkflowNodeType,
} from '../types';

interface AiAssistantPanelProps {
  project: VNProject;
  selectedChapterId: string;
  selectedNode?: SceneNode;
  onCreateGeneratedNodes: (
    nodes: Partial<SceneNode>[],
    connectFromSelected: boolean
  ) => void;
  onUpdateCurrentNode: (updater: (n: SceneNode) => SceneNode) => void;
  onUpdateProjectMeta?: (patch: Partial<VNProject>) => void;
  onAddChapter?: () => string;
}

const AI_CONFIG_STORAGE_KEY = 'moovn_ai_agent_endpoint_v5';

// Session-only API key (never written to localStorage in plain text)
let inMemorySessionApiKey = '';

const DEFAULT_AI_CONFIG: AiAgentConfig = {
  provider: 'openai_compatible',
  apiKey: '',
  baseUrl: 'https://api.openai.com/v1',
  modelName: 'gpt-4o-mini',
  temperature: 0.7,
  enableThinking: false,
  thinkingBudgetTokens: 2048,
  autoExecuteWorkflow: false,
  allowScriptEdit: true,
  allowProjectSettingsEdit: false,
  customSystemPrompt:
    '你是 MooVN Studio 的视觉小说 AI Agent。当处于 Agent 模式时，你可以分析当前工程并在回答末尾附上 ```moovn-agent JSON 动作块（支持 update_dialogue / add_dialogue / set_expression / update_script / create_node），由创作者确认后一键应用到工程。',
};

export interface AgentProposedAction {
  type:
    | 'update_dialogue'
    | 'add_dialogue'
    | 'set_expression'
    | 'update_script'
    | 'create_node';
  summary: string;
  speakerName?: string;
  text?: string;
  characterId?: string;
  spriteId?: string;
  scriptCode?: string;
  nodeTitle?: string;
  nodeType?: WorkflowNodeType;
}

function loadEndpointConfigWithoutKey(): AiAgentConfig {
  try {
    const raw = localStorage.getItem(AI_CONFIG_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_AI_CONFIG, apiKey: inMemorySessionApiKey };
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_AI_CONFIG,
      baseUrl: typeof parsed.baseUrl === 'string' ? parsed.baseUrl : DEFAULT_AI_CONFIG.baseUrl,
      modelName: typeof parsed.modelName === 'string' ? parsed.modelName : DEFAULT_AI_CONFIG.modelName,
      temperature: typeof parsed.temperature === 'number' ? parsed.temperature : DEFAULT_AI_CONFIG.temperature,
      customSystemPrompt:
        typeof parsed.customSystemPrompt === 'string'
          ? parsed.customSystemPrompt
          : DEFAULT_AI_CONFIG.customSystemPrompt,
      apiKey: inMemorySessionApiKey,
    };
  } catch {
    return { ...DEFAULT_AI_CONFIG, apiKey: inMemorySessionApiKey };
  }
}

function saveEndpointConfigWithoutKey(cfg: AiAgentConfig): void {
  inMemorySessionApiKey = cfg.apiKey || '';
  try {
    // Never persist apiKey into localStorage
    const safePayload = {
      baseUrl: cfg.baseUrl,
      modelName: cfg.modelName,
      temperature: cfg.temperature,
      customSystemPrompt: cfg.customSystemPrompt,
    };
    localStorage.setItem(AI_CONFIG_STORAGE_KEY, JSON.stringify(safePayload));
  } catch {
    // ignore storage errors
  }
}

function parseAgentActionsFromContent(content: string): {
  actions: AgentProposedAction[];
  parseErrors: string[];
} {
  const actions: AgentProposedAction[] = [];
  const parseErrors: string[] = [];
  const regex = /```(?:moovn-agent|json)\s*([\s\S]*?)```/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    const rawBlock = match[1].trim();
    const isExplicitAgentBlock = match[0].toLowerCase().startsWith('```moovn-agent');
    try {
      const parsed = JSON.parse(rawBlock);
      const list = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.actions)
        ? parsed.actions
        : [parsed];
      for (const item of list) {
        if (item && typeof item === 'object' && typeof item.type === 'string') {
          actions.push({
            type: item.type,
            summary: item.summary || item.type,
            speakerName: item.speakerName,
            text: item.text,
            characterId: item.characterId,
            spriteId: item.spriteId,
            scriptCode: item.scriptCode,
            nodeTitle: item.nodeTitle,
            nodeType: item.nodeType,
          });
        }
      }
    } catch (err: unknown) {
      if (isExplicitAgentBlock) {
        parseErrors.push(
          err instanceof Error
            ? `Agent 动作块 JSON 解析失败：${err.message}`
            : 'Agent 动作块 JSON 格式无效'
        );
      }
    }
  }
  return { actions, parseErrors };
}

export const AiAssistantPanel: React.FC<AiAssistantPanelProps> = ({
  project,
  selectedNode,
  onCreateGeneratedNodes,
  onUpdateCurrentNode,
}) => {
  const [config, setConfig] = useState<AiAgentConfig>(loadEndpointConfigWithoutKey);
  const [activeView, setActiveView] = useState<'chat' | 'config'>('chat');
  const [agentMode, setAgentMode] = useState<'agent' | 'chat'>('agent');
  const [appliedActionKeys, setAppliedActionKeys] = useState<Record<string, boolean>>({});
  const [actionUndoSnapshots, setActionUndoSnapshots] = useState<
    Record<string, SceneNode>
  >({});
  const [messages, setMessages] = useState<AiChatMessage[]>([
    {
      id: 'welcome-1',
      role: 'assistant',
      content:
        'MooVN AI Agent 已就绪。支持「Agent 协同模式」（分析当前节点并生成可确认执行的台词修改、表情切换、脚本编写等动作）与「纯对话模式」。请先在「接口设置」中配置当前会话 API Key。',
      timestamp: new Date().toLocaleTimeString().slice(0, 5),
    },
  ]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState(false);

  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isSending]);

  const updateConfig = (patch: Partial<AiAgentConfig>) => {
    setConfig((prev) => {
      const next = { ...prev, ...patch };
      saveEndpointConfigWithoutKey(next);
      return next;
    });
  };

  const applyAgentAction = (action: AgentProposedAction, key: string) => {
    if (selectedNode) {
      const snapshot = JSON.parse(JSON.stringify(selectedNode)) as SceneNode;
      setActionUndoSnapshots((prev) => ({ ...prev, [key]: snapshot }));
    }
    if (action.type === 'update_dialogue' && selectedNode && action.text) {
      onUpdateCurrentNode((prev) => {
        const nextDialogues = [...prev.dialogues];
        if (nextDialogues.length > 0) {
          nextDialogues[0] = {
            ...nextDialogues[0],
            speakerName: action.speakerName || nextDialogues[0].speakerName,
            text: action.text!,
          };
        }
        return { ...prev, dialogues: nextDialogues };
      });
    } else if (action.type === 'add_dialogue' && selectedNode && action.text) {
      onUpdateCurrentNode((prev) => ({
        ...prev,
        dialogues: [
          ...prev.dialogues,
          {
            id: `dlg-${Date.now()}`,
            speakerId: action.characterId || 'narrator',
            speakerName: action.speakerName || '旁白',
            speakerColor: '#38bdf8',
            text: action.text!,
          },
        ],
      }));
    } else if (action.type === 'set_expression' && selectedNode && action.spriteId) {
      onUpdateCurrentNode((prev) => ({
        ...prev,
        characters: prev.characters.map((c) =>
          !action.characterId || c.characterId === action.characterId
            ? { ...c, spriteId: action.spriteId! }
            : c
        ),
      }));
    } else if (action.type === 'update_script' && selectedNode && action.scriptCode) {
      onUpdateCurrentNode((prev) => ({
        ...prev,
        customScript: action.scriptCode,
      }));
    } else if (action.type === 'create_node') {
      onCreateGeneratedNodes(
        [
          {
            title: action.nodeTitle || 'Agent 新增节点',
            type: action.nodeType || 'dialogue',
            dialogues: action.text
              ? [
                  {
                    id: `dlg-${Date.now()}`,
                    speakerId: action.characterId || 'narrator',
                    speakerName: action.speakerName || '旁白',
                    speakerColor: '#38bdf8',
                    text: action.text,
                  },
                ]
              : undefined,
          },
        ],
        true
      );
    }
    setAppliedActionKeys((prev) => ({ ...prev, [key]: true }));
  };

  const revertAgentAction = (key: string) => {
    const snap = actionUndoSnapshots[key];
    if (!snap) return;
    onUpdateCurrentNode(() => JSON.parse(JSON.stringify(snap)) as SceneNode);
    setAppliedActionKeys((prev) => ({ ...prev, [key]: false }));
  };

  const handleSendMessage = async () => {
    const trimmed = input.trim();
    if (!trimmed || isSending) return;

    setErrorBanner(null);

    const userMsg: AiChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: trimmed,
      timestamp: new Date().toLocaleTimeString().slice(0, 5),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');

    if (!config.apiKey.trim()) {
      setErrorBanner('未配置当前会话 API Key。请点击右上角「接口设置」填入 API Key。');
      return;
    }

    setIsSending(true);

    try {
      const endpoint = `${config.baseUrl.replace(/\/+$/, '')}/chat/completions`;
      const contextSummary = selectedNode
        ? `当前项目：《${project.title}》（共 ${project.chapters.length} 章，${project.nodes.length} 节点）。当前选中节点：「${selectedNode.title}」（ID: ${selectedNode.id}，类型: ${selectedNode.type}，台词数: ${selectedNode.dialogues.length}）。角色列表：${project.characters
            .map((c) => `${c.name}(${c.id}, 默认立绘:${c.spriteId})`)
            .join('、')}。`
        : `当前项目：《${project.title}》（共 ${project.chapters.length} 章，${project.nodes.length} 节点）。`;

      const agentInstruction =
        agentMode === 'agent'
          ? `\n当前为【AI Agent 模式】：当用户要求修改台词、润色当前节点、切换角色表情或编写脚本时，请在回复末尾附带 \`\`\`moovn-agent\n[{"type":"update_dialogue","summary":"更新当前节点首句台词","speakerName":"角色名","text":"台词内容"}]\n\`\`\` 结构化动作块，供用户点击执行。`
          : `\n当前为【纯对话模式】：仅回答文本与代码建议，不要输出动作块。`;

      const apiMessages = [
        {
          role: 'system',
          content: `${config.customSystemPrompt}\n${contextSummary}${agentInstruction}`,
        },
        ...messages
          .filter((m) => m.id !== 'welcome-1')
          .slice(-10)
          .map((m) => ({
            role: m.role,
            content: m.content,
          })),
        {
          role: 'user',
          content: trimmed,
        },
      ];

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey.trim()}`,
        },
        body: JSON.stringify({
          model: config.modelName.trim() || 'gpt-4o-mini',
          temperature: config.temperature,
          messages: apiMessages,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errText.slice(0, 180)}`);
      }

      const data = await response.json();
      const replyContent =
        data?.choices?.[0]?.message?.content ||
        data?.message?.content ||
        '（接口返回为空）';

      const assistantMsg: AiChatMessage = {
        id: `ai-${Date.now()}`,
        role: 'assistant',
        content: String(replyContent),
        timestamp: new Date().toLocaleTimeString().slice(0, 5),
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '请求失败，请检查接口地址与 API Key';
      setErrorBanner(`调用失败：${msg}`);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#161619] text-zinc-200 select-none overflow-hidden text-xs">
      {/* Top Header */}
      <div className="min-h-8 py-1 px-2.5 bg-[#141417] border-b border-[#27272c] flex flex-wrap items-center justify-between gap-1.5 shrink-0">
        <div className="flex items-center gap-1 bg-[#1b1b20] p-0.5 rounded border border-[#2c2c34]">
          <button
            type="button"
            onClick={() => {
              setActiveView('chat');
              setAgentMode('agent');
            }}
            className={`px-2 py-0.5 rounded text-[11px] flex items-center gap-1 transition ${
              activeView === 'chat' && agentMode === 'agent'
                ? 'bg-sky-600 text-white font-medium'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
            title="AI Agent 协同模式：可分析当前节点并生成可确认执行的工程操作"
          >
            <Bot className="w-3 h-3" />
            <span>Agent</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveView('chat');
              setAgentMode('chat');
            }}
            className={`px-2 py-0.5 rounded text-[11px] flex items-center gap-1 transition ${
              activeView === 'chat' && agentMode === 'chat'
                ? 'bg-[#2a2a32] text-white font-medium'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
            title="纯文本问答模式"
          >
            <MessageSquare className="w-3 h-3" />
            <span>纯问答</span>
          </button>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() =>
              setActiveView((v) => (v === 'config' ? 'chat' : 'config'))
            }
            className={`px-2 py-0.5 rounded text-[11px] flex items-center gap-1 transition ${
              activeView === 'config'
                ? 'bg-[#2a2a32] text-white font-medium'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Settings className="w-3 h-3" strokeWidth={1.6} />
            <span>接口设置</span>
          </button>

          <button
            type="button"
            onClick={() =>
              setMessages([
                {
                  id: `welcome-${Date.now()}`,
                  role: 'assistant',
                  content: '对话历史已清空。',
                  timestamp: new Date().toLocaleTimeString().slice(0, 5),
                },
              ])
            }
            className="icon-btn !w-6 !h-6"
            title="清空对话记录"
          >
            <Trash2 className="w-3.5 h-3.5" strokeWidth={1.6} />
          </button>
        </div>
      </div>

      {activeView === 'config' ? (
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          <div className="space-y-1">
            <label className="block text-[11px] text-zinc-400">
              API Base URL (兼容 OpenAI `/v1/chat/completions`)
            </label>
            <input
              type="text"
              value={config.baseUrl}
              onChange={(e) => updateConfig({ baseUrl: e.target.value })}
              placeholder="https://api.openai.com/v1"
              className="w-full px-2.5 py-1.5 text-xs font-mono"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-[11px] text-zinc-400">
              API Key（仅保存在当前内存会话中，不写入 localStorage）
            </label>
            <input
              type="password"
              autoComplete="off"
              value={config.apiKey}
              onChange={(e) => updateConfig({ apiKey: e.target.value })}
              placeholder="sk-..."
              className="w-full px-2.5 py-1.5 text-xs font-mono"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="block text-[11px] text-zinc-400">模型名称 (Model)</label>
              <input
                type="text"
                value={config.modelName}
                onChange={(e) => updateConfig({ modelName: e.target.value })}
                placeholder="gpt-4o-mini / deepseek-chat"
                className="w-full px-2.5 py-1.5 text-xs font-mono"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-[11px] text-zinc-400">
                采样温度 ({config.temperature.toFixed(1)})
              </label>
              <input
                type="range"
                min={0}
                max={1.5}
                step={0.1}
                value={config.temperature}
                onChange={(e) =>
                  updateConfig({ temperature: parseFloat(e.target.value) })
                }
                className="w-full mt-2"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="block text-[11px] text-zinc-400">
              系统提示词 (System Prompt)
            </label>
            <textarea
              rows={4}
              value={config.customSystemPrompt}
              onChange={(e) =>
                updateConfig({ customSystemPrompt: e.target.value })
              }
              className="w-full px-2.5 py-1.5 text-xs leading-relaxed"
            />
          </div>

          <div className="pt-1 flex items-center justify-between">
            <button
              type="button"
              onClick={() => {
                saveEndpointConfigWithoutKey(config);
                setSaveNotice(true);
                setTimeout(() => setSaveNotice(false), 1800);
                setActiveView('chat');
              }}
              className="px-3 py-1.5 rounded bg-zinc-200 hover:bg-white text-zinc-950 font-semibold text-xs flex items-center gap-1.5"
            >
              <Check className="w-3.5 h-3.5" strokeWidth={1.8} />
              <span>确认并返回</span>
            </button>

            {saveNotice && (
              <span className="text-[11px] text-emerald-400">配置已应用</span>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* Message List */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto p-3 space-y-2.5 select-text"
          >
            {messages.map((m) => {
              const parsedBlock =
                m.role === 'assistant'
                  ? parseAgentActionsFromContent(m.content)
                  : { actions: [], parseErrors: [] };
              const actions = parsedBlock.actions;
              return (
                <div
                  key={m.id}
                  className={`flex flex-col ${
                    m.role === 'user' ? 'items-end' : 'items-start'
                  }`}
                >
                  <div
                    className={`max-w-[92%] rounded-lg px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap break-words ${
                      m.role === 'user'
                        ? 'bg-[#2b2b36] text-zinc-100 border border-[#3a3a48]'
                        : 'bg-[#1c1c21] text-zinc-200 border border-[#292930]'
                    }`}
                  >
                    {m.content}

                    {parsedBlock.parseErrors.length > 0 && (
                      <div className="mt-2 p-2 rounded bg-amber-950/35 border border-amber-500/40 text-amber-200 text-[10px]">
                        {parsedBlock.parseErrors.map((errMsg, eIdx) => (
                          <div key={eIdx}>{errMsg}（已保留原始回复供手动复制）</div>
                        ))}
                      </div>
                    )}

                    {actions.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-[#2e2e38] space-y-1.5">
                        <div className="text-[10px] font-semibold text-sky-300">
                          Agent 建议操作（Diff 预览 · 点击确认后应用，支持一键撤销或 Ctrl+Z）：
                        </div>
                        {actions.map((act, idx) => {
                          const actKey = `${m.id}-${idx}`;
                          const done = Boolean(appliedActionKeys[actKey]);
                          const beforePreview =
                            act.type === 'update_dialogue'
                              ? selectedNode?.dialogues?.[0]?.text || '（空）'
                              : act.type === 'update_script'
                              ? selectedNode?.customScript || '（默认自动生成脚本）'
                              : null;
                          const afterPreview = act.text || act.scriptCode || null;
                          return (
                            <div
                              key={actKey}
                              className="p-2 rounded bg-[#141418] border border-[#2c2c35] space-y-1.5"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[11px] font-medium text-zinc-200 break-words">
                                  {act.summary}
                                </span>
                                <div className="flex items-center gap-1 shrink-0">
                                  {done && actionUndoSnapshots[actKey] && (
                                    <button
                                      type="button"
                                      onClick={() => revertAgentAction(actKey)}
                                      className="px-2 py-1 rounded text-[10px] bg-[#262630] hover:bg-[#323240] text-amber-300 border border-amber-500/30"
                                    >
                                      撤销此修改
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    disabled={done}
                                    onClick={() => applyAgentAction(act, actKey)}
                                    className={`px-2 py-1 rounded text-[11px] font-medium flex items-center gap-1 shrink-0 ${
                                      done
                                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                        : 'bg-sky-600 hover:bg-sky-500 text-white'
                                    }`}
                                  >
                                    {done ? (
                                      <>
                                        <Check className="w-3 h-3" />
                                        <span>已应用 (可 Ctrl+Z)</span>
                                      </>
                                    ) : (
                                      <>
                                        <Play className="w-3 h-3" />
                                        <span>确认应用</span>
                                      </>
                                    )}
                                  </button>
                                </div>
                              </div>
                              {(beforePreview || afterPreview) && (
                                <div className="text-[10px] font-mono space-y-1 bg-[#101014] p-1.5 rounded border border-[#23232b]">
                                  {beforePreview && (
                                    <div className="text-rose-300/90 line-clamp-2">
                                      - 修改前: {beforePreview}
                                    </div>
                                  )}
                                  {afterPreview && (
                                    <div className="text-emerald-300/90 line-clamp-3">
                                      + 修改后: {afterPreview}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <span className="text-[10px] text-zinc-500 mt-0.5 px-1">
                    {m.timestamp}
                  </span>
                </div>
              );
            })}

            {isSending && (
              <div className="flex items-center gap-2 text-zinc-400 text-xs px-2 py-1">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>正在请求模型响应...</span>
              </div>
            )}

            {errorBanner && (
              <div className="p-2.5 rounded bg-rose-950/40 border border-rose-500/40 text-rose-200 text-[11px] flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <div className="flex-1 break-words">{errorBanner}</div>
              </div>
            )}
          </div>

          {/* Input Area */}
          <div className="p-2.5 bg-[#141417] border-t border-[#27272c] space-y-1.5 shrink-0">
            <div className="flex items-end gap-1.5">
              <textarea
                rows={2}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                placeholder={
                  agentMode === 'agent'
                    ? '输入 Agent 指令（如：润色当前节点台词、为当前节点编写存档脚本）...'
                    : '输入需要润色的台词或代码问题 (Enter 发送)...'
                }
                className="flex-1 px-2.5 py-1.5 text-xs resize-none leading-relaxed"
              />
              <button
                type="button"
                disabled={isSending || !input.trim()}
                onClick={handleSendMessage}
                className="px-3 py-2 rounded bg-zinc-200 hover:bg-white disabled:opacity-40 text-zinc-950 font-semibold text-xs flex items-center gap-1 shrink-0"
              >
                <Send className="w-3.5 h-3.5" strokeWidth={1.8} />
                <span>发送</span>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default AiAssistantPanel;
