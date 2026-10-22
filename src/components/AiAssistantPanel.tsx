import React, { useState } from 'react';
import {
  Send,
  Settings,
  Download,
  CheckCircle2,
  Trash2,
  FileCode2,
} from 'lucide-react';
import {
  AiApiFormat,
  AiChatMessage,
  AiProviderConfig,
  VNProject,
  WorkflowNodeType,
} from '../types';
import { MOOVN_AI_SPEC_MARKDOWN } from '../data/aiSpec';

interface AiAssistantPanelProps {
  project: VNProject;
  selectedNodeId: string;
  onAddNode: (type: WorkflowNodeType) => void;
  onAddChapter: () => void;
  onAddCharacter: () => void;
  onAppendDialogue: (speakerName: string, text: string) => void;
  onSwitchBackground: (bgId: string) => void;
}

const API_FORMAT_LABELS: Record<
  AiApiFormat,
  { name: string; defaultEndpoint: string; defaultModel: string }
> = {
  openai_compatible: {
    name: 'OpenAI 兼容格式 (OpenAI / DeepSeek / vLLM)',
    defaultEndpoint: 'https://api.openai.com/v1/chat/completions',
    defaultModel: 'gpt-4o-mini',
  },
  anthropic_claude: {
    name: 'Anthropic Claude Messages API',
    defaultEndpoint: 'https://api.anthropic.com/v1/messages',
    defaultModel: 'claude-3-5-sonnet-latest',
  },
  google_gemini: {
    name: 'Google Gemini GenerateContent API',
    defaultEndpoint: 'https://generativelanguage.googleapis.com/v1beta/models',
    defaultModel: 'gemini-2.5-flash',
  },
  ollama_local: {
    name: 'Ollama 本地服务接口',
    defaultEndpoint: 'http://127.0.0.1:11434/api/chat',
    defaultModel: 'qwen2.5-coder:7b',
  },
};

export const AiAssistantPanel: React.FC<AiAssistantPanelProps> = ({
  project,
  selectedNodeId,
  onAddNode,
  onAddChapter,
  onAddCharacter,
  onAppendDialogue,
  onSwitchBackground,
}) => {
  const [showConfig, setShowConfig] = useState(false);
  const [showSpec, setShowSpec] = useState(false);

  const [config, setConfig] = useState<AiProviderConfig>({
    mode: 'local_model',
    apiFormat: 'openai_compatible',
    endpointUrl: API_FORMAT_LABELS.openai_compatible.defaultEndpoint,
    apiKey: '',
    modelName: API_FORMAT_LABELS.openai_compatible.defaultModel,
    localModelId: 'MooVN-StoryAgent-1.5B-Q4_K_M.gguf',
    localModelDownloaded: true,
    agentAutoApply: true,
  });

  const [downloadProgress, setDownloadProgress] = useState<number>(100);
  const [isDownloading, setIsDownloading] = useState(false);
  const [promptInput, setPromptInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);

  const [messages, setMessages] = useState<AiChatMessage[]>([
    {
      id: 'msg-init',
      role: 'assistant',
      content:
        '你好！我是 MooVN Agent。你可以直接用自然语言让我创建任何类型的节点（如屏幕文字、限时抉择、条件判断、淡入淡出、镜头震动）、编写剧情台词、新增章节或切换场景背景。',
      timestamp: '刚刚',
    },
  ]);

  const handleDownloadLocalModel = () => {
    setIsDownloading(true);
    setDownloadProgress(0);
    const timer = setInterval(() => {
      setDownloadProgress((p) => {
        if (p >= 100) {
          clearInterval(timer);
          setIsDownloading(false);
          setConfig((prev) => ({ ...prev, localModelDownloaded: true }));
          return 100;
        }
        return p + 25;
      });
    }, 180);
  };

  const executeAgentActions = (userText: string): { reply: string; actions: string[] } => {
    const actions: string[] = [];
    const lower = userText.toLowerCase();

    if (lower.includes('屏幕文字') || lower.includes('字幕') || lower.includes('标题')) {
      onAddNode('screen_text');
      actions.push('新增 [屏幕文字] 节点');
    } else if (lower.includes('限时') || lower.includes('倒计时')) {
      onAddNode('timed_choice');
      actions.push('新增 [控制·限时抉择] 节点');
    } else if (lower.includes('选择') || lower.includes('分支')) {
      onAddNode('choice');
      actions.push('新增 [控制·分支选择] 节点');
    } else if (lower.includes('条件') || lower.includes('好感') || lower.includes('if')) {
      onAddNode('condition');
      actions.push('新增 [控制·条件判断] 节点');
    } else if (lower.includes('淡入') || lower.includes('淡出')) {
      onAddNode('fade');
      actions.push('新增 [视觉·淡入淡出] 节点');
    } else if (lower.includes('震动') || lower.includes('镜头')) {
      onAddNode('camera_shake');
      actions.push('新增 [视觉·屏幕震动] 节点');
    } else if (lower.includes('章节')) {
      onAddChapter();
      actions.push('创建新章节');
    } else if (lower.includes('角色')) {
      onAddCharacter();
      actions.push('新增角色档案');
    } else if (lower.includes('台词') || lower.includes('对话') || lower.includes('写')) {
      onAppendDialogue(
        project.characters[0]?.name || '星野雪奈',
        '「晚霞映照的钟塔下，指针终于重新开始向前走动了。」'
      );
      actions.push(`向节点 (${selectedNodeId}) 追加对白`);
    }

    if (lower.includes('海') || lower.includes('灯塔')) {
      onSwitchBackground('bg-lighthouse-bay-sunset');
      actions.push('切换背景为「白羽灯塔海湾石阶·晚霞」');
    } else if (lower.includes('温泉')) {
      onSwitchBackground('bg-onsen-autumn');
      actions.push('切换背景为「山岚秘境·露天汤池」');
    }

    const reply =
      actions.length > 0
        ? `已根据指令在当前工程中执行操作。`
        : `已分析当前工程《${project.title}》（共 ${project.chapters.length} 章节、${project.nodes.length} 节点）。你可以直接输入「添加屏幕文字节点」「创建限时抉择」「切换温泉背景」或「续写一段雪奈台词」由我自动执行。`;

    return { reply, actions };
  };

  const handleSend = () => {
    const trimmed = promptInput.trim();
    if (!trimmed || isThinking) return;

    const userMsg: AiChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: trimmed,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setPromptInput('');
    setIsThinking(true);

    setTimeout(() => {
      const { reply, actions } = executeAgentActions(trimmed);
      setMessages((prev) => [
        ...prev,
        {
          id: `msg-${Date.now() + 1}`,
          role: 'assistant',
          content: reply,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          appliedActions: actions.length > 0 ? actions : undefined,
        },
      ]);
      setIsThinking(false);
    }, 260);
  };

  return (
    <div className="flex flex-col h-full bg-[#18181b] text-[#cccccc] select-none overflow-hidden">
      {/* Compact Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-[#1f1f23] border-b border-[#2b2b30] shrink-0">
        <span className="text-xs font-semibold text-slate-200 truncate">
          AI 助手 ({config.mode === 'local_model' ? '本地模型' : API_FORMAT_LABELS[config.apiFormat].name.split(' ')[0]})
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              setShowSpec(!showSpec);
              setShowConfig(false);
            }}
            className={`p-1 rounded transition ${
              showSpec ? 'bg-[#007acc] text-white' : 'text-slate-400 hover:text-white hover:bg-[#2a2d2e]'
            }`}
            title="查看 MOOVN_AI_SPEC.md 工程规范"
          >
            <FileCode2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => {
              setShowConfig(!showConfig);
              setShowSpec(false);
            }}
            className={`p-1 rounded transition ${
              showConfig ? 'bg-[#007acc] text-white' : 'text-slate-400 hover:text-white hover:bg-[#2a2d2e]'
            }`}
            title="切换本地模型 / 4种 API Key 格式"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setMessages(messages.slice(0, 1))}
            className="p-1 rounded text-slate-400 hover:text-white hover:bg-[#2a2d2e]"
            title="清空对话"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Collapsible Settings Drawer */}
      {showConfig && (
        <div className="p-3 bg-[#202024] border-b border-[#2b2b30] space-y-2.5 text-xs shrink-0">
          <div className="grid grid-cols-2 gap-1.5">
            <button
              onClick={() => setConfig((prev) => ({ ...prev, mode: 'local_model' }))}
              className={`py-1.5 rounded border text-[11px] font-medium ${
                config.mode === 'local_model'
                  ? 'bg-[#094771]/50 border-[#007acc] text-white'
                  : 'bg-[#252526] border-[#3c3c3c] text-slate-400'
              }`}
            >
              本地模型运行
            </button>
            <button
              onClick={() => setConfig((prev) => ({ ...prev, mode: 'api_key' }))}
              className={`py-1.5 rounded border text-[11px] font-medium ${
                config.mode === 'api_key'
                  ? 'bg-[#094771]/50 border-[#007acc] text-white'
                  : 'bg-[#252526] border-[#3c3c3c] text-slate-400'
              }`}
            >
              云端 API Key (4种格式)
            </button>
          </div>

          {config.mode === 'local_model' ? (
            <div className="space-y-2">
              <select
                value={config.localModelId}
                onChange={(e) =>
                  setConfig((prev) => ({
                    ...prev,
                    localModelId: e.target.value,
                    localModelDownloaded: false,
                  }))
                }
                className="w-full bg-[#252526] border border-[#3c3c3c] rounded px-2 py-1 text-[11px] text-white"
              >
                <option value="MooVN-StoryAgent-1.5B-Q4_K_M.gguf">
                  MooVN-StoryAgent-1.5B-Q4_K_M.gguf (推荐)
                </option>
                <option value="Qwen2.5-Coder-3B-Instruct-Q4.gguf">
                  Qwen2.5-Coder-3B-Instruct-Q4.gguf
                </option>
                <option value="Llama-3.2-3B-VN-Director-Q4.gguf">
                  Llama-3.2-3B-VN-Director-Q4.gguf
                </option>
              </select>
              {config.localModelDownloaded ? (
                <div className="flex items-center gap-1.5 text-[11px] text-emerald-400">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>本地模型已就绪</span>
                </div>
              ) : (
                <button
                  onClick={handleDownloadLocalModel}
                  disabled={isDownloading}
                  className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded bg-[#007acc] text-white text-[11px] font-medium"
                >
                  <Download className="w-3.5 h-3.5" />
                  {isDownloading ? `下载中 ${downloadProgress}%` : '下载并加载本地模型'}
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <select
                value={config.apiFormat}
                onChange={(e) => {
                  const fmt = e.target.value as AiApiFormat;
                  setConfig((prev) => ({
                    ...prev,
                    apiFormat: fmt,
                    endpointUrl: API_FORMAT_LABELS[fmt].defaultEndpoint,
                    modelName: API_FORMAT_LABELS[fmt].defaultModel,
                  }));
                }}
                className="w-full bg-[#252526] border border-[#3c3c3c] rounded px-2 py-1 text-[11px] text-white"
              >
                {(Object.keys(API_FORMAT_LABELS) as AiApiFormat[]).map((fmt) => (
                  <option key={fmt} value={fmt}>
                    {API_FORMAT_LABELS[fmt].name}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={config.endpointUrl}
                onChange={(e) => setConfig((prev) => ({ ...prev, endpointUrl: e.target.value }))}
                placeholder="API Endpoint URL"
                className="w-full bg-[#252526] border border-[#3c3c3c] rounded px-2 py-1 text-[11px] text-white font-mono"
              />
              <input
                type="password"
                value={config.apiKey}
                onChange={(e) => setConfig((prev) => ({ ...prev, apiKey: e.target.value }))}
                placeholder="API Key"
                className="w-full bg-[#252526] border border-[#3c3c3c] rounded px-2 py-1 text-[11px] text-white font-mono"
              />
            </div>
          )}
        </div>
      )}

      {/* Collapsible Spec Viewer */}
      {showSpec && (
        <div className="flex-1 overflow-y-auto p-3 bg-[#141417]">
          <pre className="text-[11px] leading-relaxed font-mono text-slate-300 whitespace-pre-wrap select-text">
            {MOOVN_AI_SPEC_MARKDOWN}
          </pre>
        </div>
      )}

      {/* Chat Messages */}
      {!showSpec && (
        <>
          <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`p-2.5 rounded-lg text-xs leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-[#094771]/55 border border-[#007acc]/40 text-white ml-4'
                    : 'bg-[#202024] border border-[#2b2b30] text-slate-200 mr-2'
                }`}
              >
                <div className="whitespace-pre-wrap select-text">{msg.content}</div>
                {msg.appliedActions && msg.appliedActions.length > 0 && (
                  <div className="mt-2 pt-1.5 border-t border-[#2b2b30] space-y-1">
                    {msg.appliedActions.map((act, i) => (
                      <div key={i} className="flex items-center gap-1.5 text-[11px] text-emerald-400">
                        <CheckCircle2 className="w-3 h-3 shrink-0" />
                        <span>{act}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Single Clean Input Bar */}
          <div className="p-2.5 border-t border-[#2b2b30] bg-[#1f1f23] shrink-0">
            <div className="flex items-end gap-1.5">
              <textarea
                rows={2}
                value={promptInput}
                onChange={(e) => setPromptInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="输入指令（例如：添加屏幕文字节点 / 创建限时抉择 / 切换温泉背景）..."
                className="flex-1 bg-[#252526] border border-[#3c3c3c] rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-[#007acc] resize-none"
              />
              <button
                onClick={handleSend}
                disabled={!promptInput.trim() || isThinking}
                className="p-2 rounded bg-[#007acc] hover:bg-[#1f8ad2] disabled:opacity-40 text-white transition shrink-0"
                title="发送指令"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
