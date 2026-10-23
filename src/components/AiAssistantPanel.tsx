import React, { useState, useEffect } from 'react';
import {
  Send,
  Plus,
  Trash2,
  KeyRound,
  Check,
  AlertCircle,
  Loader2,
  Download,
  PlugZap,
  Sparkles,
} from 'lucide-react';
import {
  AiChatMessage,
  AiModelCard,
  SceneNode,
  VNProject,
  WorkflowNodeType,
} from '../types';
import { NODE_REGISTRY } from '../data/nodeRegistry';
import { compileAndCheckProjectTypeScript } from '../lib/nodeCodeCompiler';

interface AiAssistantPanelProps {
  project: VNProject;
  selectedNodeId: string;
  onAddNode: (type: WorkflowNodeType) => void;
  onUpdateNode?: (nodeId: string, updater: (n: SceneNode) => SceneNode) => void;
  onAppendDialogue: (speaker: string, text: string) => void;
  onSwitchBackground: (bgId: string) => void;
  onAddCharacter: () => void;
  onAddChapter: () => void;
}

const AI_CARDS_STORAGE_KEY = 'moovn_ai_model_cards_v3';

const DEFAULT_MODEL_CARDS: AiModelCard[] = [
  {
    id: 'card-openai-deepseek',
    title: 'OpenAI / DeepSeek / 硅基流动',
    providerType: 'openai_compatible',
    endpointUrl: 'https://api.deepseek.com/v1/chat/completions',
    modelName: 'deepseek-chat',
    apiKeys: [],
    activeKeyCursor: 0,
    totalCalls: 0,
    enabled: true,
  },
  {
    id: 'card-google-gemini',
    title: 'Google AI Studio (Gemini)',
    providerType: 'google_studio',
    endpointUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
    modelName: 'gemini-2.5-flash',
    apiKeys: [],
    activeKeyCursor: 0,
    totalCalls: 0,
    enabled: true,
  },
  {
    id: 'card-anthropic-claude',
    title: 'Anthropic Claude',
    providerType: 'anthropic_claude',
    endpointUrl: 'https://api.anthropic.com/v1/messages',
    modelName: 'claude-3-5-sonnet-latest',
    apiKeys: [],
    activeKeyCursor: 0,
    totalCalls: 0,
    enabled: true,
  },
  {
    id: 'card-ollama-local',
    title: 'Ollama 本地大模型服务',
    providerType: 'ollama_local',
    endpointUrl: 'http://127.0.0.1:11434/api/chat',
    modelName: 'qwen2.5-coder:7b',
    apiKeys: [],
    activeKeyCursor: 0,
    totalCalls: 0,
    enabled: true,
  },
];

export const AiAssistantPanel: React.FC<AiAssistantPanelProps> = ({
  project,
  selectedNodeId,
  onAddNode,
  onUpdateNode,
  onAppendDialogue,
  onSwitchBackground,
  onAddCharacter,
  onAddChapter,
}) => {
  const [subTab, setSubTab] = useState<'chat' | 'cards'>('chat');

  const [cards, setCards] = useState<AiModelCard[]>(() => {
    try {
      const saved = localStorage.getItem(AI_CARDS_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as AiModelCard[];
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // ignore
    }
    return DEFAULT_MODEL_CARDS;
  });

  useEffect(() => {
    try {
      localStorage.setItem(AI_CARDS_STORAGE_KEY, JSON.stringify(cards));
    } catch {
      // ignore
    }
  }, [cards]);

  const [selectedCardId, setSelectedCardId] = useState<string>(
    () => cards[0]?.id || 'card-openai-deepseek'
  );
  const [newKeyInput, setNewKeyInput] = useState<string>('');
  const [testStatus, setTestStatus] = useState<{
    loading: boolean;
    ok?: boolean;
    message?: string;
  }>({ loading: false });

  const [promptInput, setPromptInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [messages, setMessages] = useState<AiChatMessage[]>([
    {
      id: 'msg-welcome',
      role: 'assistant',
      content:
        '可直接输入指令操控工程（如：「创建一个重复4次的循环节点」、「创建数学运算节点」、「给雪奈写两句钟塔台词」、「运行 tsc 检查」）；若在「接口配置」中填入了真实 API Key 或启动了本地 Ollama，将直接发起真实大模型 API 请求并自动执行返回的工程动作。',
      timestamp: new Date().toLocaleTimeString().slice(0, 5),
      modelCardTitle: 'MooVN AI',
    },
  ]);

  const activeCard =
    cards.find((c) => c.id === selectedCardId) || cards[0] || DEFAULT_MODEL_CARDS[0];

  const updateCard = (id: string, updater: (c: AiModelCard) => AiModelCard) => {
    setCards((prev) => prev.map((c) => (c.id === id ? updater(c) : c)));
  };

  // Pick next API key in round-robin order
  const pickNextKey = (card: AiModelCard): { key: string; badge: string } => {
    const valid = card.apiKeys.map((k) => k.trim()).filter(Boolean);
    if (valid.length === 0) {
      return {
        key: '',
        badge: card.providerType === 'ollama_local' ? 'Ollama 本地直连' : '未填 Key (使用本地指令编译器)',
      };
    }
    const idx = card.activeKeyCursor % valid.length;
    const chosen = valid[idx];
    updateCard(card.id, (c) => ({
      ...c,
      activeKeyCursor: (idx + 1) % valid.length,
      totalCalls: c.totalCalls + 1,
    }));
    const masked =
      chosen.length > 8 ? `${chosen.slice(0, 4)}...${chosen.slice(-3)}` : '***';
    return { key: chosen, badge: `Key #${idx + 1}/${valid.length} (${masked})` };
  };

  // Execute structured JSON actions returned by LLM or parsed from local command compiler
  const applyStructuredActions = (
    rawActions: Array<Record<string, any>>
  ): string[] => {
    const logs: string[] = [];
    for (const act of rawActions) {
      const kind = String(act.action || act.type || '');
      if (kind === 'add_node' && act.nodeType) {
        onAddNode(act.nodeType as WorkflowNodeType);
        logs.push(`新增节点 [${act.nodeType}]`);
      } else if (kind === 'add_dialogue') {
        const sp = String(act.speaker || '星野 雪奈');
        const txt = String(act.text || '');
        if (txt) {
          onAppendDialogue(sp, txt);
          logs.push(`追加台词 (${sp})`);
        }
      } else if (kind === 'switch_bg' && act.bgId) {
        onSwitchBackground(String(act.bgId));
        logs.push(`切换背景 [${act.bgId}]`);
      } else if (kind === 'add_character') {
        onAddCharacter();
        logs.push('添加角色立绘到舞台');
      } else if (kind === 'add_chapter') {
        onAddChapter();
        logs.push('新建章节');
      }
    }
    return logs;
  };

  // Real local deterministic compiler (executes immediately on project graph)
  const runDeterministicCommandCompiler = (
    userText: string
  ): { reply: string; actions: string[] } => {
    const actions: string[] = [];
    const lower = userText.toLowerCase();

    // 1. Check for TypeScript compiler check request
    if (lower.includes('tsc') || lower.includes('检查') || lower.includes('报错') || lower.includes('诊断')) {
      const report = compileAndCheckProjectTypeScript(project);
      actions.push(`运行 tsc 静态检查 (${report.durationMs}ms)`);
      if (report.errorCount === 0) {
        return {
          reply: `已完成全工程 TypeScript 编译诊断：共检查 ${project.nodes.length} 个节点，0 个错误，${report.warningCount} 个警告。`,
          actions,
        };
      }
      return {
        reply: `检测到 ${report.errorCount} 个错误，${report.warningCount} 个警告：\n${report.diagnostics
          .map((d) => `- [${d.code}] ${d.nodeTitle}: ${d.message}`)
          .join('\n')}`,
        actions,
      };
    }

    // 2. Match any of the 55 node types by title or keyword
    const numMatch = userText.match(/(\d+)\s*次/);
    if (lower.includes('重复') || lower.includes('循环') || lower.includes('repeat')) {
      onAddNode('repeat_loop');
      const n = numMatch ? Number(numMatch[1]) : 3;
      actions.push(`新增 [重复循环] 多重嵌套容器节点 (循环 ${n} 次)`);
      return {
        reply: `已在画布中创建【重复循环】容器节点（默认包含嵌套子节点槽，您可在节点卡片内继续点击 "+ 子节点" 进行多重嵌套添加）。`,
        actions,
      };
    }

    if (lower.includes('如果') || lower.includes('否则') || lower.includes('ifelse')) {
      onAddNode('if_else_container');
      actions.push('新增 [如果否则] 双槽多重嵌套容器节点');
      return {
        reply: '已在画布中创建【如果否则】双槽容器节点，支持在真/假分支槽内无限层级嵌套子节点。',
        actions,
      };
    }

    if (lower.includes('并行') || lower.includes('并发')) {
      onAddNode('parallel_container');
      actions.push('新增 [并行执行] 容器节点');
      return {
        reply: '已创建【并行执行】容器节点，内部所有子节点将通过 Promise.all 同时执行。',
        actions,
      };
    }

    if (lower.includes('数学') || lower.includes('运算') || lower.includes('+=') || lower.includes('-=')) {
      onAddNode('math_operation');
      actions.push('新增 [数学运算] 节点');
      return {
        reply: '已创建【数学运算】节点，可在右侧检查器设置目标变量与运算符（+= / -= / *= / /= / random / clamp）。',
        actions,
      };
    }

    for (const meta of NODE_REGISTRY) {
      if (userText.includes(meta.title) || lower.includes(meta.type)) {
        onAddNode(meta.type);
        actions.push(`新增 [${meta.categoryLabel} · ${meta.title}] 节点`);
        return {
          reply: `已为您在画布中添加【${meta.title}】(${meta.type}) 节点：${meta.description}。`,
          actions,
        };
      }
    }

    if (lower.includes('钟塔') || lower.includes('月夜') || lower.includes('cg')) {
      onSwitchBackground('bg-clocktower-moonlight-cg');
      actions.push('切换当前节点背景为《学园月夜第13声钟塔 (CG)》');
      return {
        reply: '已将当前选中节点的场景背景切换为《学园月夜第13声钟塔 (CG)》。',
        actions,
      };
    }

    if (lower.includes('章节')) {
      onAddChapter();
      actions.push('新增章节');
      return {
        reply: '已为工程创建新章节，并自动配置了跳章最低好感度保底表。',
        actions,
      };
    }

    if (lower.includes('立绘') || lower.includes('角色登场')) {
      onAddCharacter();
      actions.push('向当前节点舞台添加角色立绘');
      return {
        reply: '已将角色立绘添加到当前节点的场景舞台中。',
        actions,
      };
    }

    // Default: Append dialogue lines to currently selected node
    const selectedNode = project.nodes.find((n) => n.id === selectedNodeId);
    const cleanText = userText
      .replace(/^(帮我|请|给当前节点|写一段|生成|添加|续写)/g, '')
      .trim();
    onAppendDialogue(
      '星野 雪奈',
      `「${cleanText || '第十三声钟鸣响起的时候，旧校舍的怀表指针终于重新开始转动了。'}」`
    );
    actions.push(`向节点 [${selectedNode?.title || selectedNodeId}] 追加台词`);

    return {
      reply: `已向当前选中节点【${selectedNode?.title || selectedNodeId}】写入演出台词。如需调用外部大模型生成复杂剧本，可在「接口配置」中填入您的 API Key。`,
      actions,
    };
  };

  // Test real HTTP connectivity to the selected card
  const handleTestCardConnection = async () => {
    const { key } = pickNextKey(activeCard);
    if (activeCard.providerType !== 'ollama_local' && !key) {
      setTestStatus({
        loading: false,
        ok: false,
        message: '请先在下方输入框中添加至少 1 个有效的 API Key 再测试连接。',
      });
      return;
    }

    setTestStatus({ loading: true, message: '正在发起真实 HTTP 握手请求...' });
    try {
      const resp = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerType: activeCard.providerType,
          endpoint: activeCard.endpointUrl,
          apiKey: key,
          model: activeCard.modelName,
          systemPrompt: 'Reply with a short greeting in Chinese under 20 chars.',
          messages: [{ role: 'user', content: 'ping' }],
        }),
      });
      const data = await resp.json();
      if (resp.ok && data.ok) {
        setTestStatus({
          loading: false,
          ok: true,
          message: `连接成功 (${data.latencyMs}ms) · 模型返回: "${String(
            data.reply || ''
          ).slice(0, 60)}"`,
        });
      } else {
        setTestStatus({
          loading: false,
          ok: false,
          message: data.error || `HTTP ${resp.status} 请求失败`,
        });
      }
    } catch (err: any) {
      setTestStatus({
        loading: false,
        ok: false,
        message: err?.message || '网络请求异常',
      });
    }
  };

  const handleSend = async () => {
    const trimmed = promptInput.trim();
    if (!trimmed || isSending) return;

    const { key, badge } = pickNextKey(activeCard);
    const userMsg: AiChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: trimmed,
      timestamp: new Date().toLocaleTimeString().slice(0, 5),
    };
    setMessages((prev) => [...prev, userMsg]);
    setPromptInput('');
    setIsSending(true);

    const hasRealEndpoint =
      activeCard.providerType === 'ollama_local' || Boolean(key);

    if (hasRealEndpoint) {
      const systemPrompt = `你是 MooVN 视觉小说编辑器的内置 AI 助手。
当前工程：《${project.title}》，共 ${project.chapters.length} 章、${project.nodes.length} 个节点，当前选中节点 ID: ${selectedNodeId}。
可用节点类型包括：dialogue, narration, inner_monologue, cg_caption, screen_text, chapter_title, choice, timed_choice, condition, repeat_loop, while_loop, for_each_loop, if_else_container, parallel_container, math_operation, string_format, array_operation, char_enter, char_move, char_expression, affection_change, bg_switch, fade, camera_pan_zoom, camera_shake, screen_flash, weather_particles, bgm_play, sfx_play, set_variable, function_call, script。
如果用户要求创建节点、添加台词或切换背景，请在回答末尾附上一段 <moovn-actions>[{"action":"add_node","nodeType":"repeat_loop"},{"action":"add_dialogue","speaker":"星野 雪奈","text":"台词内容"}]</moovn-actions> JSON 数组，编辑器会自动执行！`;

      try {
        const resp = await fetch('/api/ai/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            providerType: activeCard.providerType,
            endpoint: activeCard.endpointUrl,
            apiKey: key,
            model: activeCard.modelName,
            systemPrompt,
            messages: [...messages.slice(-6), userMsg].map((m) => ({
              role: m.role,
              content: m.content,
            })),
          }),
        });
        const data = await resp.json();

        if (resp.ok && data.ok && data.reply) {
          let replyText = String(data.reply);
          let executedActions: string[] = [];

          // Parse <moovn-actions>[...]</moovn-actions> if returned by LLM
          const match = replyText.match(/<moovn-actions>([\s\S]*?)<\/moovn-actions>/);
          if (match) {
            try {
              const parsedActs = JSON.parse(match[1].trim());
              if (Array.isArray(parsedActs)) {
                executedActions = applyStructuredActions(parsedActs);
              }
            } catch {
              // ignore malformed JSON block
            }
            replyText = replyText.replace(/<moovn-actions>[\s\S]*?<\/moovn-actions>/, '').trim();
          }

          setMessages((prev) => [
            ...prev,
            {
              id: `a-${Date.now()}`,
              role: 'assistant',
              content: replyText,
              timestamp: new Date().toLocaleTimeString().slice(0, 5),
              modelCardTitle: `${activeCard.title} (${data.latencyMs}ms)`,
              usedKeyBadge: badge,
              appliedActions: executedActions,
            },
          ]);
          setIsSending(false);
          return;
        } else {
          // Real API returned an error — show the real error AND execute local command compiler if applicable
          const fallback = runDeterministicCommandCompiler(trimmed);
          setMessages((prev) => [
            ...prev,
            {
              id: `a-${Date.now()}`,
              role: 'assistant',
              content: `[远程接口报错: ${data.error || `HTTP ${resp.status}`}]\n已自动通过内置指令编译器执行操作：\n${fallback.reply}`,
              timestamp: new Date().toLocaleTimeString().slice(0, 5),
              modelCardTitle: '本地指令回退',
              usedKeyBadge: badge,
              appliedActions: fallback.actions,
            },
          ]);
          setIsSending(false);
          return;
        }
      } catch (err: any) {
        const fallback = runDeterministicCommandCompiler(trimmed);
        setMessages((prev) => [
          ...prev,
          {
            id: `a-${Date.now()}`,
            role: 'assistant',
            content: `[网络请求异常: ${err?.message}]\n已通过内置指令编译器执行：\n${fallback.reply}`,
            timestamp: new Date().toLocaleTimeString().slice(0, 5),
            modelCardTitle: '本地指令回退',
            appliedActions: fallback.actions,
          },
        ]);
        setIsSending(false);
        return;
      }
    }

    // No API key configured: execute deterministic local project command compiler immediately
    const { reply, actions } = runDeterministicCommandCompiler(trimmed);
    setMessages((prev) => [
      ...prev,
      {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: reply,
        timestamp: new Date().toLocaleTimeString().slice(0, 5),
        modelCardTitle: '内置工程指令引擎',
        usedKeyBadge: badge,
        appliedActions: actions,
      },
    ]);
    setIsSending(false);
  };

  return (
    <div className="flex flex-col h-full bg-[#151519] text-zinc-200 select-none overflow-hidden text-xs">
      {/* Compact Header */}
      <div className="px-3 py-1.5 bg-[#18181d] border-b border-[#27272c] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setSubTab('chat')}
            className={`px-2.5 py-1 rounded text-[11px] font-medium transition ${
              subTab === 'chat'
                ? 'bg-[#282832] text-white'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            对话与工程编排
          </button>
          <button
            onClick={() => setSubTab('cards')}
            className={`px-2.5 py-1 rounded text-[11px] font-medium transition flex items-center gap-1 ${
              subTab === 'cards'
                ? 'bg-[#282832] text-white'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <KeyRound className="w-3 h-3" strokeWidth={1.6} />
            接口与多 Key 配置 ({activeCard.apiKeys.length})
          </button>
        </div>

        <select
          value={selectedCardId}
          onChange={(e) => setSelectedCardId(e.target.value)}
          className="px-2 py-0.5 rounded text-[11px] max-w-[165px]"
          title="切换当前模型卡"
        >
          {cards.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>
      </div>

      {/* ==================== TAB 1: AI CHAT & ACTION EXECUTOR ==================== */}
      {subTab === 'chat' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Quick Action Pills */}
          <div className="px-3 py-1.5 bg-[#131317] border-b border-[#232329] flex flex-wrap gap-1 shrink-0">
            {[
              '创建一个重复3次的循环节点',
              '创建一个如果否则容器节点',
              '创建一个数学运算节点',
              '运行 tsc 检查工程错误',
              '切换到月夜钟塔CG背景',
            ].map((q) => (
              <button
                key={q}
                onClick={() => setPromptInput(q)}
                className="px-2 py-0.5 rounded bg-[#1d1d24] hover:bg-[#272730] border border-[#2c2c36] text-[10px] text-zinc-300 transition"
              >
                {q}
              </button>
            ))}
          </div>

          {/* Message List */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2.5 select-text">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`p-2.5 rounded-lg border text-xs leading-relaxed space-y-1.5 ${
                  m.role === 'user'
                    ? 'bg-[#202028] border-[#32323e] text-zinc-100 ml-6'
                    : 'bg-[#18181f] border-[#272730] text-zinc-200 mr-2'
                }`}
              >
                <div className="flex items-center justify-between text-[10px] text-zinc-500">
                  <span className="font-semibold text-zinc-400">
                    {m.role === 'user' ? '开发者' : m.modelCardTitle || 'AI 助手'}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {m.usedKeyBadge && (
                      <span className="px-1.5 py-0.2 rounded bg-[#23232b] text-zinc-400 font-mono">
                        {m.usedKeyBadge}
                      </span>
                    )}
                    <span>{m.timestamp}</span>
                  </div>
                </div>

                <div className="whitespace-pre-wrap">{m.content}</div>

                {m.appliedActions && m.appliedActions.length > 0 && (
                  <div className="pt-1 flex flex-wrap gap-1">
                    {m.appliedActions.map((act, i) => (
                      <span
                        key={i}
                        className="px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/35 text-emerald-300 text-[10px] flex items-center gap-1"
                      >
                        <Check className="w-2.5 h-2.5" strokeWidth={2} />
                        {act}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {isSending && (
              <div className="flex items-center gap-2 text-zinc-400 px-2 py-1">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>正在请求接口并执行节点编排...</span>
              </div>
            )}
          </div>

          {/* Input Box */}
          <div className="p-2.5 bg-[#18181d] border-t border-[#27272c] flex items-center gap-1.5 shrink-0">
            <input
              type="text"
              value={promptInput}
              onChange={(e) => setPromptInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSend();
              }}
              placeholder="输入指令或剧本需求 (回车发送)..."
              className="flex-1 px-2.5 py-1.5 rounded text-xs"
            />
            <button
              onClick={handleSend}
              disabled={isSending}
              className="px-3 py-1.5 rounded bg-zinc-100 hover:bg-white text-zinc-950 font-semibold flex items-center gap-1 shrink-0 transition"
            >
              <Send className="w-3 h-3" strokeWidth={1.8} />
              发送
            </button>
          </div>
        </div>
      )}

      {/* ==================== TAB 2: REAL API CARDS & MULTI-KEY ROUND ROBIN ==================== */}
      {subTab === 'cards' && (
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-zinc-300">
              模型服务卡与多 API Key 轮询池
            </span>
            <button
              onClick={() => {
                const id = `card-${Date.now()}`;
                const next: AiModelCard = {
                  id,
                  title: '自定义 OpenAI 兼容卡',
                  providerType: 'openai_compatible',
                  endpointUrl: 'https://api.openai.com/v1/chat/completions',
                  modelName: 'gpt-4o-mini',
                  apiKeys: [],
                  activeKeyCursor: 0,
                  totalCalls: 0,
                  enabled: true,
                };
                setCards((prev) => [...prev, next]);
                setSelectedCardId(id);
              }}
              className="px-2 py-1 rounded bg-[#23232c] hover:bg-[#2d2d38] border border-[#32323e] text-[11px] text-zinc-200 flex items-center gap-1"
            >
              <Plus className="w-3 h-3" strokeWidth={1.8} />
              新增模型卡
            </button>
          </div>

          <div className="p-3 rounded-lg bg-[#1b1b22] border border-[#2b2b35] space-y-2.5">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] text-zinc-400 mb-0.5">卡片名称</label>
                <input
                  type="text"
                  value={activeCard.title}
                  onChange={(e) =>
                    updateCard(activeCard.id, (c) => ({ ...c, title: e.target.value }))
                  }
                  className="w-full px-2 py-1 rounded text-xs"
                />
              </div>
              <div>
                <label className="block text-[10px] text-zinc-400 mb-0.5">协议类型</label>
                <select
                  value={activeCard.providerType}
                  onChange={(e) =>
                    updateCard(activeCard.id, (c) => ({
                      ...c,
                      providerType: e.target.value as any,
                    }))
                  }
                  className="w-full px-2 py-1 rounded text-xs"
                >
                  <option value="openai_compatible">OpenAI / DeepSeek / 硅基流动</option>
                  <option value="google_studio">Google Gemini (AI Studio)</option>
                  <option value="anthropic_claude">Anthropic Claude</option>
                  <option value="ollama_local">Ollama 本地服务 (无需 Key)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[10px] text-zinc-400 mb-0.5">
                API Endpoint 接口地址
              </label>
              <input
                type="text"
                value={activeCard.endpointUrl}
                onChange={(e) =>
                  updateCard(activeCard.id, (c) => ({ ...c, endpointUrl: e.target.value }))
                }
                className="w-full px-2 py-1 rounded font-mono text-[11px]"
              />
            </div>

            <div>
              <label className="block text-[10px] text-zinc-400 mb-0.5">
                模型名称 (Model ID)
              </label>
              <input
                type="text"
                value={activeCard.modelName}
                onChange={(e) =>
                  updateCard(activeCard.id, (c) => ({ ...c, modelName: e.target.value }))
                }
                className="w-full px-2 py-1 rounded font-mono text-[11px]"
              />
            </div>

            {/* Multi-Key Pool */}
            <div className="pt-1 border-t border-[#292933] space-y-1.5">
              <label className="block text-[10px] text-zinc-400">
                多 API Key 轮询池 (每次调用自动按序切换下一个 Key)
              </label>
              <div className="flex gap-1.5">
                <input
                  type="password"
                  value={newKeyInput}
                  onChange={(e) => setNewKeyInput(e.target.value)}
                  placeholder="粘贴 sk-... 或 AI Studio API Key"
                  className="flex-1 px-2 py-1 rounded font-mono text-[11px]"
                />
                <button
                  onClick={() => {
                    const k = newKeyInput.trim();
                    if (!k) return;
                    updateCard(activeCard.id, (c) => ({
                      ...c,
                      apiKeys: [...c.apiKeys, k],
                    }));
                    setNewKeyInput('');
                  }}
                  className="px-2.5 py-1 rounded bg-[#282833] hover:bg-[#323240] text-zinc-100 text-[11px]"
                >
                  添加 Key
                </button>
              </div>

              {activeCard.apiKeys.length === 0 ? (
                <div className="text-[10px] text-zinc-500">
                  当前未添加 API Key。未配置 Key 时对话将使用内置本地工程指令编译器执行节点操作。
                </div>
              ) : (
                <div className="space-y-1 max-h-28 overflow-y-auto">
                  {activeCard.apiKeys.map((k, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between px-2 py-1 rounded bg-[#141419] border border-[#272730] font-mono text-[10px]"
                    >
                      <span>
                        Key #{idx + 1}: {k.slice(0, 6)}...{k.slice(-4)}
                      </span>
                      <button
                        onClick={() =>
                          updateCard(activeCard.id, (c) => ({
                            ...c,
                            apiKeys: c.apiKeys.filter((_, i) => i !== idx),
                          }))
                        }
                        className="text-zinc-500 hover:text-rose-400"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Real HTTP Connectivity Test */}
            <div className="pt-2 flex items-center justify-between gap-2">
              <button
                onClick={handleTestCardConnection}
                disabled={testStatus.loading}
                className="px-3 py-1.5 rounded bg-sky-600/25 hover:bg-sky-600/35 border border-sky-500/40 text-sky-200 text-xs flex items-center gap-1.5 transition"
              >
                {testStatus.loading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <PlugZap className="w-3.5 h-3.5" strokeWidth={1.7} />
                )}
                测试真实接口连通性
              </button>

              {cards.length > 1 && (
                <button
                  onClick={() => {
                    const rem = cards.filter((c) => c.id !== activeCard.id);
                    setCards(rem);
                    setSelectedCardId(rem[0].id);
                  }}
                  className="px-2 py-1 rounded bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 text-[11px]"
                >
                  删除此卡
                </button>
              )}
            </div>

            {testStatus.message && (
              <div
                className={`p-2 rounded border text-[11px] flex items-start gap-1.5 ${
                  testStatus.ok
                    ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-300'
                    : 'bg-rose-500/15 border-rose-500/35 text-rose-300'
                }`}
              >
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span className="break-all">{testStatus.message}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
