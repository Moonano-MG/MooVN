import { newId } from '../lib/ids';
import { validateSafeAiProxyEndpoint } from '../lib/devServerSecurity';
import {
  applyAgentNodeAction, parseAgentActionsFromContent, previewAgentAction,
  type AgentProposedAction,
} from '../lib/aiAgentActions';
import {
  DEFAULT_AI_CONFIG, loadAiEndpointConfig, saveAiEndpointConfig,
  buildAiProjectContext, aiHttpFailureMessage, endpointContainsKnownSecret, redactKnownSecret,
} from '../lib/aiEndpointConfig';
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
} from '../types';

interface AiAssistantPanelProps {
  project: VNProject;
  selectedChapterId: string;
  selectedNode?: SceneNode;
  onCreateGeneratedNodes: (expectedProject: VNProject, node: Partial<SceneNode>) => string;
  onUpdateCurrentNode: (
    expectedProject: VNProject,
    nodeId: string,
    updater: (node: SceneNode) => SceneNode,
  ) => void;
}

// The credential is shared only between mounts of this panel in the current session.
let inMemorySessionApiKey = '';

function loadEndpointConfigWithoutKey(): { config: AiAgentConfig; warning: string | null; needsScrubbing: boolean } {
  try {
    return loadAiEndpointConfig(localStorage, inMemorySessionApiKey);
  } catch {
    return { config: { ...DEFAULT_AI_CONFIG, apiKey: inMemorySessionApiKey }, warning: '无法读取接口设置，请检查浏览器存储权限。', needsScrubbing: false };
  }
}

function saveEndpointConfigWithoutKey(cfg: AiAgentConfig): string | null {
  inMemorySessionApiKey = cfg.apiKey || '';
  try {
    return saveAiEndpointConfig(localStorage, cfg);
  } catch {
    return '无法保存接口设置或清除旧密钥，请检查浏览器存储权限。';
  }
}

export const AiAssistantPanel: React.FC<AiAssistantPanelProps> = ({
  project,
  selectedNode,
  onCreateGeneratedNodes,
  onUpdateCurrentNode,
}) => {
  const [initialConfig] = useState(loadEndpointConfigWithoutKey);
  const [config, setConfig] = useState<AiAgentConfig>(initialConfig.config);
  const [configStorageWarning, setConfigStorageWarning] = useState<string | null>(initialConfig.warning);
  const [activeView, setActiveView] = useState<'chat' | 'config'>('chat');
  const [agentMode, setAgentMode] = useState<'agent' | 'chat'>('chat');
  const [shareProjectContext, setShareProjectContext] = useState(false);
  const [appliedActionKeys, setAppliedActionKeys] = useState<Record<string, VNProject>>({});
  const [pendingAction, setPendingAction] = useState<{
    key: string; expectedProject: VNProject; nodeId: string; desiredNode?: SceneNode; created: boolean;
  } | null>(null);
  const actionContexts = useRef(new Map<string, { project: VNProject; nodeId?: string }>());
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
    if (!initialConfig.needsScrubbing) return;
    const warning = saveEndpointConfigWithoutKey(initialConfig.config);
    setConfigStorageWarning(warning
      ? `旧接口配置含不安全内容，但清理失败：${warning}`
      : '已清理旧配置中的密钥或不安全地址。若真实密钥曾存入地址或配置，请考虑撤销并更换。');
  }, [initialConfig]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isSending]);

  useEffect(() => {
    if (!pendingAction || project === pendingAction.expectedProject) return;
    const actual = project.nodes.find((node) => node.id === pendingAction.nodeId);
    const applied = pendingAction.created
      ? Boolean(actual)
      : Boolean(actual && pendingAction.desiredNode && JSON.stringify(actual) === JSON.stringify(pendingAction.desiredNode));
    if (applied) setAppliedActionKeys((prev) => ({ ...prev, [pendingAction.key]: project }));
    else setErrorBanner('工程在应用前发生了变化，Agent 操作未执行。请重新请求并确认。');
    setPendingAction(null);
  }, [project, pendingAction]);

  const updateConfig = (patch: Partial<AiAgentConfig>) => {
    const next = { ...config, ...patch };
    setConfig(next);
    setConfigStorageWarning(saveEndpointConfigWithoutKey(next));
  };

  const applyAgentAction = (action: AgentProposedAction, key: string, messageId: string) => {
    const context = actionContexts.current.get(messageId);
    if (pendingAction || !context || context.project !== project || context.nodeId !== selectedNode?.id) {
      setErrorBanner('工程或选中节点已改变，请重新请求建议。');
      return;
    }
    const preview = previewAgentAction(action, selectedNode, project);
    if (!preview.ok) {
      setErrorBanner(preview.reason);
      return;
    }
    if (action.type === 'create_node') {
      const nodeId = onCreateGeneratedNodes(context.project, {
        title: action.nodeTitle || 'Agent 新增节点',
        type: action.nodeType || 'dialogue',
        backgroundId: '', bgmId: '', characters: [], choices: [], childrenNodes: [], nextNodeId: null,
        dialogues: action.text ? [{
          id: newId('dlg'), speakerId: action.characterId || 'narrator',
          speakerName: action.speakerName || '旁白', speakerColor: '#38bdf8', text: action.text,
        }] : [],
      });
      setPendingAction({ key, expectedProject: context.project, nodeId, created: true });
      return;
    }
    if (!selectedNode) return;
    const desiredNode = applyAgentNodeAction(action, selectedNode, project);
    if (!desiredNode) {
      setErrorBanner('操作目标无效，未修改工程。');
      return;
    }
    onUpdateCurrentNode(context.project, selectedNode.id, () => desiredNode);
    setPendingAction({ key, expectedProject: context.project, nodeId: selectedNode.id, desiredNode, created: false });
  };

  const handleSendMessage = async () => {
    const trimmed = input.trim();
    if (!trimmed || isSending) return;

    setErrorBanner(null);

    if (!config.apiKey.trim()) {
      setErrorBanner('未配置当前会话 API Key。请点击右上角「接口设置」填入 API Key。');
      return;
    }
    const validation = validateSafeAiProxyEndpoint('openai_compatible', config.baseUrl);
    if (!validation.ok || !validation.normalizedUrl) {
      setErrorBanner(validation.error || '服务地址不受支持，请检查接口设置。');
      return;
    }
    if (endpointContainsKnownSecret(validation.normalizedUrl, config.apiKey)) {
      setErrorBanner('接口地址包含当前会话密钥，请从地址中移除。');
      return;
    }
    const endpoint = `${validation.normalizedUrl.replace(/\/+$/, '')}/chat/completions`;

    const userMsg: AiChatMessage = {
      id: newId('user'),
      role: 'user',
      content: trimmed,
      timestamp: new Date().toLocaleTimeString().slice(0, 5),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');

    setIsSending(true);

    try {
      const contextSummary = buildAiProjectContext(project, selectedNode, agentMode, shareProjectContext);
      const agentInstruction = agentMode === 'agent'
        ? `\n当前为【AI Agent 模式】。可使用 moovn-agent JSON 动作块提出建议；update_dialogue 必须含 dialogueId 和 text；set_expression 必须含 characterId、spriteId，重复角色需 placementId。不得猜测目标 ID，不知道就先询问。create_node 仅可创建独立对白或旁白节点，不覆盖已有连接，其他类型请提醒用户手动创建。所有操作由用户查看差异后确认。`
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
        // Do not forward a credentialed request to a redirect destination.
        redirect: 'error',
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
        setErrorBanner(aiHttpFailureMessage(response.status));
        return;
      }

      const data = await response.json();
      const replyContent =
        data?.choices?.[0]?.message?.content ||
        data?.message?.content ||
        '（接口返回为空）';

      const assistantMsg: AiChatMessage = {
        id: newId('ai'),
        role: 'assistant',
        content: redactKnownSecret(String(replyContent), [config.apiKey]),
        timestamp: new Date().toLocaleTimeString().slice(0, 5),
        allowAgentActions: agentMode === 'agent',
        targetNodeId: selectedNode?.id,
      };

      if (agentMode === 'agent') {
        actionContexts.current.set(assistantMsg.id, { project, nodeId: selectedNode?.id });
        if (actionContexts.current.size > 50) {
          const oldest = actionContexts.current.keys().next().value;
          if (oldest) actionContexts.current.delete(oldest);
        }
      }
      setMessages((prev) => [...prev, assistantMsg]);
    } catch {
      setErrorBanner('调用失败：网络、响应格式或安全策略阻止了请求，请检查地址及浏览器 CORS。');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#161619] text-zinc-200 select-none overflow-hidden text-xs">
      {configStorageWarning && (
        <div role="alert" className="px-3 py-2 bg-amber-950/60 text-amber-200 break-words">
          {configStorageWarning}
        </div>
      )}
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
            onClick={() => {
              actionContexts.current.clear();
              setAppliedActionKeys({});
              setMessages([
                {
                  id: newId('welcome'),
                  role: 'assistant',
                  content: '对话历史已清空。',
                  timestamp: new Date().toLocaleTimeString().slice(0, 5),
                },
              ]);
            }}
            className="icon-btn !w-6 !h-6"
            title="清空对话记录"
          >
            <Trash2 className="w-3.5 h-3.5" strokeWidth={1.6} />
          </button>
        </div>
      </div>

      {activeView === 'config' ? (
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          <p className="text-[11px] text-amber-200" role="note">
            密钥仅在本次会话内存中保存，并由客户端直接发送给所选允许的服务商；系统钥匙串和原生代理尚未接入。浏览器 CORS 或桌面安全策略可能阻止请求。
          </p>
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
                const warning = saveEndpointConfigWithoutKey(config);
                setConfigStorageWarning(warning);
                if (warning) return;
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
                m.role === 'assistant' && m.allowAgentActions && agentMode === 'agent'
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
                          Agent 建议操作（检查完整差异并确认；每项可用一次撤销回退）：
                        </div>
                        {actions.map((act, idx) => {
                          const actKey = `${m.id}-${idx}`;
                          const context = actionContexts.current.get(m.id);
                          const appliedProject = appliedActionKeys[actKey];
                          const done = Boolean(appliedProject) && (appliedProject === project || project !== context?.project);
                          const targetChanged = !context || context.project !== project || context.nodeId !== selectedNode?.id;
                          const preview = targetChanged
                            ? { ok: false as const, reason: '工程或选中节点已变化，请重新请求建议' }
                            : previewAgentAction(act, selectedNode, project);
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
                                  <button
                                    type="button"
                                    disabled={done || Boolean(pendingAction) || !preview.ok}
                                    title={!preview.ok ? preview.reason : undefined}
                                    onClick={() => applyAgentAction(act, actKey, m.id)}
                                    className={`px-2 py-1 rounded text-[11px] font-medium flex items-center gap-1 shrink-0 ${
                                      done
                                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                        : 'bg-sky-600 hover:bg-sky-500 text-white disabled:opacity-40 disabled:cursor-not-allowed'
                                    }`}
                                  >
                                    {done ? (
                                      <>
                                        <Check className="w-3 h-3" />
                                        <span>{appliedActionKeys[actKey] === project ? '已应用' : '曾应用'}</span>
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
                              {done ? (
                                <div className="text-emerald-300" role="note">{appliedActionKeys[actKey] === project ? '已应用；可使用工作台撤销。' : '此操作曾应用，工程随后发生变化，请检查当前状态。'}</div>
                              ) : preview.ok ? (
                                <div className="text-[10px] font-mono space-y-1 bg-[#101014] p-1.5 rounded border border-[#23232b]">
                                  <div className="text-sky-300 break-words">目标：{preview.target}</div>
                                  <div className="text-rose-300/90">修改前</div>
                                  <pre className="text-rose-300/90 whitespace-pre-wrap break-words max-h-40 overflow-auto">{preview.before || '（空）'}</pre>
                                  <div className="text-emerald-300/90">修改后</div>
                                  <pre className="text-emerald-300/90 whitespace-pre-wrap break-words max-h-40 overflow-auto">{preview.after || '（空）'}</pre>
                                </div>
                              ) : (
                                <div className="text-amber-300 break-words" role="note">{preview.reason}；未应用。</div>
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
            <p className="text-[10px] text-zinc-400" role="note">
              每次请求会发送当前输入和最近 10 条对话。纯问答不会自动附带工程摘要。
            </p>
            {agentMode === 'agent' && (
              <label className="flex items-start gap-1.5 text-[10px] text-zinc-300">
                <input type="checkbox" checked={shareProjectContext} onChange={(event) => setShareProjectContext(event.target.checked)} />
                <span>允许 Agent 发送工程 ID、名称与数量；当前节点 ID、标题、类型、台词 ID／说话人／正文；角色名称、ID、位置 ID 和差分标签／立绘 ID。关闭时不发送这些摘要。</span>
              </label>
            )}
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
