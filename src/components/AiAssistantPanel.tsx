import React, { useState } from 'react';
import { Send, Download, Check, Trash2 } from 'lucide-react';
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
    name: 'OpenAI 兼容 (OpenAI / DeepSeek)',
    defaultEndpoint: 'https://api.openai.com/v1/chat/completions',
    defaultModel: 'gpt-4o-mini',
  },
  anthropic_claude: {
    name: 'Anthropic Claude API',
    defaultEndpoint: 'https://api.anthropic.com/v1/messages',
    defaultModel: 'claude-3-5-sonnet-latest',
  },
  google_gemini: {
    name: 'Google Gemini API',
    defaultEndpoint: 'https://generativelanguage.googleapis.com/v1beta/models',
    defaultModel: 'gemini-2.5-flash',
  },
  ollama_local: {
    name: 'Ollama 本地服务',
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
  const [subTab, setSubTab] = useState<'chat' | 'config' | 'spec'>('chat');

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
      content: '输入指令即可创建节点、续写对白、切换背景或新增章节。',
      timestamp: '刚刚',
    },
  ]);

  const handleDownloadModel = () => {
    setIsDownloading(true);
    setDownloadProgress(5);
    let p = 5;
    const timer = setInterval(() => {
      p += 19;
      if (p >= 100) {
        clearInterval(timer);
        setDownloadProgress(100);
        setIsDownloading(false);
        setConfig((prev) => ({ ...prev, localModelDownloaded: true }));
      } else {
        setDownloadProgress(p);
      }
    }, 180);
  };

  const executeAgentIntent = (userPrompt: string) => {
    const actions: string[] = [];
    const lower = userPrompt.toLowerCase();

    if (lower.includes('屏幕文字') || lower.includes('字幕') || lower.includes('大字')) {
      onAddNode('screen_text');
      actions.push('新增 [屏幕文字] 节点');
    } else if (lower.includes('条件') || lower.includes('判断')) {
      onAddNode('condition');
      actions.push('新增 [条件分支] 节点');
    } else if (lower.includes('限时') || lower.includes('倒计时')) {
      onAddNode('timed_choice');
      actions.push('新增 [限时选项] 节点');
    } else if (lower.includes('震动') || lower.includes('镜头')) {
      onAddNode('camera_shake');
      actions.push('新增 [镜头震动] 节点');
    } else if (lower.includes('闪白') || lower.includes('特效')) {
      onAddNode('screen_flash');
      actions.push('新增 [画面闪光] 节点');
    } else if (lower.includes('音乐') || lower.includes('bgm')) {
      onAddNode('bgm_play');
      actions.push('新增 [播放音乐] 节点');
    } else if (lower.includes('分支') || lower.includes('选项')) {
      onAddNode('choice');
      actions.push('新增 [玩家选项] 节点');
    } else if (lower.includes('章节')) {
      onAddChapter();
      actions.push('新增章节');
    } else if (lower.includes('角色')) {
      onAddCharacter();
      actions.push('立绘入场');
    } else if (lower.includes('神社')) {
      onSwitchBackground('bg-shrine-night');
      actions.push('切换背景：千鸟居神社');
    } else if (lower.includes('天文台')) {
      onSwitchBackground('bg-observatory-dome');
      actions.push('切换背景：山顶天文台');
    } else if (lower.includes('天台')) {
      onSwitchBackground('bg-rooftop-sunset');
      actions.push('切换背景：学园天台');
    } else {
      onAppendDialogue(
        '天野 苍真',
        `「${userPrompt.replace(/^(写一段|生成|添加|续写)/, '') || '钟声回荡在暮色里，命运的齿轮已经开始转动。'}」`
      );
      actions.push(`追加台词至 (${selectedNodeId})`);
    }

    return {
      reply: `已执行：${actions.join('、')}。`,
      actions,
    };
  };

  const handleSend = () => {
    const trimmed = promptInput.trim();
    if (!trimmed || isThinking) return;

    const userMsg: AiChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: trimmed,
      timestamp: new Date().toLocaleTimeString().slice(0, 5),
    };
    setMessages((prev) => [...prev, userMsg]);
    setPromptInput('');
    setIsThinking(true);

    setTimeout(() => {
      const { reply, actions } = executeAgentIntent(trimmed);
      const assistantMsg: AiChatMessage = {
        id: `ai-${Date.now()}`,
        role: 'assistant',
        content: reply,
        timestamp: new Date().toLocaleTimeString().slice(0, 5),
        appliedActions: actions,
      };
      setMessages((prev) => [...prev, assistantMsg]);
      setIsThinking(false);
    }, 220);
  };

  const downloadSpecFile = () => {
    const blob = new Blob([MOOVN_AI_SPEC_MARKDOWN], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'MOOVN_AI_SPEC.md';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-full bg-[#161619] text-zinc-300 select-none overflow-hidden">
      {/* Sub-navigation bar */}
      <div className="flex items-center justify-between px-2 border-b border-[#27272c] bg-[#141417] shrink-0 text-xs">
        <div className="flex items-center">
          {(
            [
              ['chat', '对话'],
              ['config', '配置'],
              ['spec', '规范'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setSubTab(id)}
              className={`px-3 py-2 font-medium border-b-2 transition ${
                subTab === id
                  ? 'border-zinc-200 text-white bg-[#161619]'
                  : 'border-transparent text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {subTab === 'chat' && (
          <button
            onClick={() => setMessages((prev) => prev.slice(0, 1))}
            className="icon-btn"
            title="清空记录"
          >
            <Trash2 className="w-3.5 h-3.5" strokeWidth={1.6} />
          </button>
        )}
      </div>

      {/* Config Tab */}
      {subTab === 'config' && (
        <div className="flex-1 overflow-y-auto p-3 space-y-3 text-xs">
          <div className="grid grid-cols-2 gap-1.5">
            <button
              onClick={() => setConfig((prev) => ({ ...prev, mode: 'local_model' }))}
              className={`py-1.5 rounded border text-center transition ${
                config.mode === 'local_model'
                  ? 'bg-zinc-200 text-zinc-950 border-zinc-200 font-medium'
                  : 'bg-[#1c1c20] border-[#27272c] text-zinc-400'
              }`}
            >
              本地模型
            </button>
            <button
              onClick={() => setConfig((prev) => ({ ...prev, mode: 'api_key' }))}
              className={`py-1.5 rounded border text-center transition ${
                config.mode === 'api_key'
                  ? 'bg-zinc-200 text-zinc-950 border-zinc-200 font-medium'
                  : 'bg-[#1c1c20] border-[#27272c] text-zinc-400'
              }`}
            >
              云端 API
            </button>
          </div>

          {config.mode === 'local_model' ? (
            <div className="p-2.5 rounded-md bg-[#1c1c20] border border-[#27272c] space-y-2.5">
              <div className="text-[10px] text-zinc-500">本地量化模型</div>
              <select
                value={config.localModelId}
                onChange={(e) =>
                  setConfig((prev) => ({
                    ...prev,
                    localModelId: e.target.value,
                    localModelDownloaded: false,
                  }))
                }
                className="w-full px-2 py-1.5"
              >
                <option value="MooVN-StoryAgent-1.5B-Q4_K_M.gguf">
                  MooVN-StoryAgent-1.5B-Q4 (980 MB)
                </option>
                <option value="Qwen2.5-Coder-3B-Instruct-Q4_K_M.gguf">
                  Qwen2.5-Coder-3B-Q4 (1.9 GB)
                </option>
                <option value="Llama-3.2-3B-VN-Writer-Q4.gguf">
                  Llama-3.2-3B-VN-Writer (2.0 GB)
                </option>
              </select>

              <div className="flex items-center justify-between pt-1">
                <span className="text-[11px] text-zinc-400">
                  {config.localModelDownloaded ? '已就绪' : `进度 ${downloadProgress}%`}
                </span>
                <button
                  onClick={handleDownloadModel}
                  disabled={isDownloading}
                  className="px-2.5 py-1 rounded bg-[#27272c] hover:bg-zinc-700 text-zinc-200 text-[11px] flex items-center gap-1"
                >
                  <Download className="w-3 h-3" strokeWidth={1.6} />
                  {config.localModelDownloaded ? '重新校验' : '下载'}
                </button>
              </div>
            </div>
          ) : (
            <div className="p-2.5 rounded-md bg-[#1c1c20] border border-[#27272c] space-y-2.5">
              <div>
                <div className="text-[10px] text-zinc-500 mb-1">接口协议 (4 种标准)</div>
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
                  className="w-full px-2 py-1.5"
                >
                  {(Object.keys(API_FORMAT_LABELS) as AiApiFormat[]).map((fmt) => (
                    <option key={fmt} value={fmt}>
                      {API_FORMAT_LABELS[fmt].name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="text-[10px] text-zinc-500 mb-1">Endpoint URL</div>
                <input
                  type="text"
                  value={config.endpointUrl}
                  onChange={(e) => setConfig((prev) => ({ ...prev, endpointUrl: e.target.value }))}
                  className="w-full px-2 py-1.5 font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="text-[10px] text-zinc-500 mb-1">Model</div>
                  <input
                    type="text"
                    value={config.modelName}
                    onChange={(e) => setConfig((prev) => ({ ...prev, modelName: e.target.value }))}
                    className="w-full px-2 py-1.5 font-mono"
                  />
                </div>
                <div>
                  <div className="text-[10px] text-zinc-500 mb-1">API Key</div>
                  <input
                    type="password"
                    value={config.apiKey}
                    onChange={(e) => setConfig((prev) => ({ ...prev, apiKey: e.target.value }))}
                    placeholder="sk-..."
                    className="w-full px-2 py-1.5 font-mono"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Spec Tab */}
      {subTab === 'spec' && (
        <div className="flex-1 flex flex-col overflow-hidden p-3 gap-2">
          <div className="flex items-center justify-between shrink-0">
            <span className="text-xs font-mono text-zinc-400">MOOVN_AI_SPEC.md</span>
            <button
              onClick={downloadSpecFile}
              className="px-2.5 py-1 rounded bg-[#1c1c20] hover:bg-[#27272c] border border-[#27272c] text-zinc-200 text-xs flex items-center gap-1"
            >
              <Download className="w-3 h-3" strokeWidth={1.6} />
              导出
            </button>
          </div>
          <pre className="flex-1 overflow-y-auto p-2.5 rounded-md bg-[#121215] border border-[#27272c] text-[11px] text-zinc-400 font-mono whitespace-pre-wrap leading-relaxed">
            {MOOVN_AI_SPEC_MARKDOWN}
          </pre>
        </div>
      )}

      {/* Chat Tab */}
      {subTab === 'chat' && (
        <>
          <div className="flex-1 overflow-y-auto p-3 space-y-2.5 text-xs">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`p-2.5 rounded-md border ${
                  msg.role === 'user'
                    ? 'bg-[#202026] border-zinc-700 text-zinc-100 ml-6'
                    : 'bg-[#1c1c20] border-[#27272c] text-zinc-300 mr-4'
                }`}
              >
                <div className="text-[10px] text-zinc-500 mb-1 flex justify-between">
                  <span>{msg.role === 'user' ? '你' : 'Agent'}</span>
                  <span>{msg.timestamp}</span>
                </div>
                <div className="leading-relaxed">{msg.content}</div>
                {msg.appliedActions && msg.appliedActions.length > 0 && (
                  <div className="mt-2 pt-1.5 border-t border-[#27272c] flex flex-wrap gap-1">
                    {msg.appliedActions.map((act, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#141417] text-zinc-300 text-[10px] border border-[#27272c]"
                      >
                        <Check className="w-2.5 h-2.5" strokeWidth={1.8} />
                        {act}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="p-2.5 border-t border-[#27272c] bg-[#141417] space-y-2 shrink-0">
            <div className="flex flex-wrap gap-1">
              {[
                ['+屏幕字', '创建一个屏幕文字节点'],
                ['+选项', '创建一个玩家选项节点'],
                ['+震动', '创建一个镜头震动节点'],
                ['切天台', '切换到学园天台背景'],
              ].map(([label, cmd]) => (
                <button
                  key={label}
                  onClick={() => setPromptInput(cmd)}
                  className="px-2 py-0.5 rounded bg-[#1c1c20] hover:bg-[#27272c] text-zinc-400 hover:text-zinc-200 text-[10px] border border-[#27272c] transition"
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={promptInput}
                onChange={(e) => setPromptInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSend();
                }}
                placeholder={`节点 (${project.nodes.find((n) => n.id === selectedNodeId)?.title || selectedNodeId}) 指令...`}
                className="flex-1 px-2.5 py-1.5 text-xs"
              />
              <button
                onClick={handleSend}
                disabled={isThinking || !promptInput.trim()}
                className="icon-btn w-8 h-8 bg-zinc-200 hover:bg-white disabled:opacity-40 text-zinc-950"
                title="发送"
              >
                <Send className="w-3.5 h-3.5" strokeWidth={1.8} />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
