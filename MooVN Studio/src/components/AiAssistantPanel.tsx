import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  Trash2,
  Key,
  Check,
  Copy,
  Settings,
  MessageSquare,
  AlertCircle,
} from 'lucide-react';
import { AiChatMessage, VNProject, WorkflowNodeType } from '../types';

interface AiAssistantPanelProps {
  project: VNProject;
  selectedNodeId: string;
  onAddNode?: (type: WorkflowNodeType) => void;
  onUpdateNode?: (id: string, updater: (n: any) => any) => void;
  onAddChapter?: () => void;
  onAddCharacter?: () => void;
  onAppendDialogue?: (speakerName: string, text: string) => void;
  onSwitchBackground?: (bgId: string) => void;
}

interface ApiConfigState {
  provider: 'deepseek' | 'openai' | 'gemini' | 'ollama';
  endpointUrl: string;
  modelName: string;
  apiKey: string;
  systemPrompt: string;
}

const AI_CONFIG_STORAGE_KEY = 'moovn_ai_api_config_v5';

const PROVIDER_PRESETS: Record<
  ApiConfigState['provider'],
  { label: string; endpointUrl: string; modelName: string }
> = {
  deepseek: {
    label: 'DeepSeek 官方接口',
    endpointUrl: 'https://api.deepseek.com/chat/completions',
    modelName: 'deepseek-chat',
  },
  openai: {
    label: 'OpenAI 兼容接口',
    endpointUrl: 'https://api.openai.com/v1/chat/completions',
    modelName: 'gpt-4o-mini',
  },
  gemini: {
    label: 'Google Gemini (OpenAI 兼容端点)',
    endpointUrl:
      'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    modelName: 'gemini-2.5-flash',
  },
  ollama: {
    label: 'Ollama 本地服务 (HTTP)',
    endpointUrl: 'http://127.0.0.1:11434/v1/chat/completions',
    modelName: 'qwen2.5-coder:7b',
  },
};

function loadApiConfig(): ApiConfigState {
  try {
    const raw = localStorage.getItem(AI_CONFIG_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.endpointUrl) return parsed;
    }
  } catch {
    // ignore
  }
  return {
    provider: 'deepseek',
    endpointUrl: PROVIDER_PRESETS.deepseek.endpointUrl,
    modelName: PROVIDER_PRESETS.deepseek.modelName,
    apiKey: '',
    systemPrompt:
      '你是 MooVN Studio 的视觉小说剧本与代码助手。请直接回答用户的剧情构思、台词润色或脚本编写问题，不要自动创建或修改工程卡片。',
  };
}

export const AiAssistantPanel: React.FC<AiAssistantPanelProps> = ({
  project,
}) => {
  const [activeTab, setActiveTab] = useState<'chat' | 'config'>('chat');
  const [config, setConfig] = useState<ApiConfigState>(loadApiConfig);
  const [messages, setMessages] = useState<AiChatMessage[]>([
    {
      id: 'welcome-msg',
      role: 'assistant',
      content:
        '你好！我是 AI 剧本与代码助手。这里仅用于纯文本对话、台词润色与代码解答，不会在画布上自动创建任何节点卡片。使用前请先在「接口设置」中填入你的 API Key。',
      timestamp: new Date().toLocaleTimeString().slice(0, 5),
    },
  ]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState<boolean>(false);

  const chatEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const updateConfig = (patch: Partial<ApiConfigState>) => {
    setConfig((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(AI_CONFIG_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isSending) return;
    setErrorBanner(null);

    if (config.provider !== 'ollama' && !config.apiKey.trim()) {
      setErrorBanner('请先在「接口设置」中填写有效的 API Key 后再发起对话。');
      setActiveTab('config');
      return;
    }

    const userMsg: AiChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date().toLocaleTimeString().slice(0, 5),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsSending(true);

    try {
      const historyPayload = [
        {
          role: 'system',
          content: `${config.systemPrompt}\n当前工程名称：《${project.title}》，共 ${project.chapters.length} 章、${project.nodes.length} 个节点。`,
        },
        ...messages
          .filter((m) => m.id !== 'welcome-msg')
          .slice(-10)
          .map((m) => ({
            role: m.role,
            content: m.content,
          })),
        { role: 'user', content: text },
      ];

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (config.apiKey.trim()) {
        headers['Authorization'] = `Bearer ${config.apiKey.trim()}`;
      }

      const response = await fetch(config.endpointUrl.trim(), {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: config.modelName.trim(),
          messages: historyPayload,
          temperature: 0.7,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errText.slice(0, 220)}`);
      }

      const data = await response.json();
      const replyContent =
        data?.choices?.[0]?.message?.content ||
        data?.message?.content ||
        '接口未返回有效文本内容。';

      const assistantMsg: AiChatMessage = {
        id: `ai-${Date.now()}`,
        role: 'assistant',
        content: String(replyContent).trim(),
        timestamp: new Date().toLocaleTimeString().slice(0, 5),
        modelCardTitle: config.modelName,
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: any) {
      const msg = err?.message || '请求失败，请检查接口地址与 API Key。';
      setErrorBanner(msg);
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'assistant',
          content: `请求失败：${msg}`,
          timestamp: new Date().toLocaleTimeString().slice(0, 5),
        },
      ]);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#141417] text-zinc-200 select-none overflow-hidden text-xs">
      {/* Clean Header */}
      <div className="h-8 px-2.5 bg-[#18181c] border-b border-[#27272c] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setActiveTab('chat')}
            className={`px-2.5 py-1 rounded text-[11px] font-medium flex items-center gap-1 transition ${
              activeTab === 'chat'
                ? 'bg-zinc-200 text-zinc-950 font-semibold'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <MessageSquare className="w-3 h-3" strokeWidth={1.7} />
            <span>AI 对话</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('config')}
            className={`px-2.5 py-1 rounded text-[11px] font-medium flex items-center gap-1 transition ${
              activeTab === 'config'
                ? 'bg-zinc-200 text-zinc-950 font-semibold'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Settings className="w-3 h-3" strokeWidth={1.7} />
            <span>接口设置</span>
          </button>
        </div>

        {activeTab === 'chat' && (
          <button
            type="button"
            onClick={() =>
              setMessages([
                {
                  id: 'welcome-msg',
                  role: 'assistant',
                  content: '对话记录已清空。',
                  timestamp: new Date().toLocaleTimeString().slice(0, 5),
                },
              ])
            }
            className="icon-btn !w-6 !h-6"
            title="清空对话记录"
          >
            <Trash2 className="w-3.5 h-3.5" strokeWidth={1.6} />
          </button>
        )}
      </div>

      {errorBanner && (
        <div className="px-3 py-1.5 bg-rose-950/50 border-b border-rose-500/30 text-rose-200 text-[11px] flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
            <span className="truncate">{errorBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorBanner(null)}
            className="text-rose-300 hover:text-white shrink-0"
          >
            ×
          </button>
        </div>
      )}

      {activeTab === 'chat' ? (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {/* Chat Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
            {messages.map((msg) => {
              const isUser = msg.role === 'user';
              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${
                    isUser ? 'items-end' : 'items-start'
                  }`}
                >
                  <div className="flex items-center gap-1.5 mb-1 text-[10px] text-zinc-500">
                    <span>{isUser ? '你' : msg.modelCardTitle || 'AI 助手'}</span>
                    <span>{msg.timestamp}</span>
                  </div>
                  <div
                    className={`relative group max-w-[90%] rounded-lg px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap select-text ${
                      isUser
                        ? 'bg-sky-600 text-white'
                        : 'bg-[#1d1d23] border border-[#2c2c35] text-zinc-200'
                    }`}
                  >
                    {msg.content}
                    {!isUser && (
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(msg.content);
                          setCopiedId(msg.id);
                          setTimeout(() => setCopiedId(null), 1500);
                        }}
                        className="opacity-0 group-hover:opacity-100 absolute top-1.5 right-1.5 p-1 rounded bg-[#141418] text-zinc-400 hover:text-white transition"
                        title="复制内容"
                      >
                        {copiedId === msg.id ? (
                          <Check className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            <div ref={chatEndRef} />
          </div>

          {/* Input Box */}
          <div className="p-2.5 bg-[#18181c] border-t border-[#27272c] shrink-0">
            <div className="flex items-end gap-1.5">
              <textarea
                rows={2}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="输入剧情构思、台词润色或代码问题 (Enter 发送)..."
                className="flex-1 px-2.5 py-1.5 rounded bg-[#121215] border border-[#2c2c35] text-xs text-zinc-100 resize-none focus:outline-none focus:border-zinc-500"
              />
              <button
                type="button"
                disabled={isSending || !input.trim()}
                onClick={handleSend}
                className="h-9 px-3 rounded bg-zinc-200 hover:bg-white disabled:opacity-40 text-zinc-950 font-semibold text-xs flex items-center gap-1 shrink-0 transition"
              >
                <Send className="w-3.5 h-3.5" strokeWidth={1.8} />
                <span>{isSending ? '请求中' : '发送'}</span>
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* Clean API Configuration Panel */
        <div className="flex-1 overflow-y-auto p-3.5 space-y-3">
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-zinc-300">
              接口服务预设
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              {(
                Object.keys(PROVIDER_PRESETS) as Array<
                  ApiConfigState['provider']
                >
              ).map((key) => {
                const preset = PROVIDER_PRESETS[key];
                const active = config.provider === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() =>
                      updateConfig({
                        provider: key,
                        endpointUrl: preset.endpointUrl,
                        modelName: preset.modelName,
                      })
                    }
                    className={`p-2 rounded border text-left text-[11px] transition ${
                      active
                        ? 'bg-[#23232c] border-sky-400 text-white font-semibold'
                        : 'bg-[#1a1a20] border-[#2c2c35] text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-medium text-zinc-300">
              API Endpoint 地址
            </label>
            <input
              type="text"
              value={config.endpointUrl}
              onChange={(e) => updateConfig({ endpointUrl: e.target.value })}
              className="w-full px-2.5 py-1.5 font-mono text-xs"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-medium text-zinc-300">
              模型名称 (Model ID)
            </label>
            <input
              type="text"
              value={config.modelName}
              onChange={(e) => updateConfig({ modelName: e.target.value })}
              placeholder="例如: deepseek-chat / gpt-4o-mini"
              className="w-full px-2.5 py-1.5 font-mono text-xs"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-medium text-zinc-300 flex items-center gap-1">
              <Key className="w-3 h-3 text-amber-400" />
              <span>API Key</span>
            </label>
            <input
              type="password"
              value={config.apiKey}
              onChange={(e) => updateConfig({ apiKey: e.target.value })}
              placeholder="sk-..."
              className="w-full px-2.5 py-1.5 font-mono text-xs"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-medium text-zinc-300">
              系统提示词 (System Prompt)
            </label>
            <textarea
              rows={3}
              value={config.systemPrompt}
              onChange={(e) => updateConfig({ systemPrompt: e.target.value })}
              className="w-full px-2.5 py-1.5 text-xs resize-none"
            />
          </div>

          <div className="pt-1 flex items-center justify-between">
            <span className="text-[11px] text-emerald-400">
              {savedNotice ? '配置已保存' : ''}
            </span>
            <button
              type="button"
              onClick={() => {
                setSavedNotice(true);
                setTimeout(() => setSavedNotice(false), 1800);
                setActiveTab('chat');
              }}
              className="px-3 py-1.5 rounded bg-zinc-200 hover:bg-white text-zinc-950 font-semibold text-xs"
            >
              保存并返回对话
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
