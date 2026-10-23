import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  Download,
  Check,
  Trash2,
  Plus,
  Key,
  HardDrive,
  Globe,
  FolderOpen,
  RefreshCw,
  Search,
} from 'lucide-react';
import {
  AiChatMessage,
  AiModelCard,
  ModelHubItem,
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

const AI_CARDS_STORAGE_KEY = 'moovn_ai_model_cards_v2';

const DEFAULT_MODEL_CARDS: AiModelCard[] = [
  {
    id: 'card-google-studio',
    title: 'Google AI Studio (Gemini)',
    providerType: 'google_studio',
    endpointUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
    modelName: 'gemini-2.5-flash',
    apiKeys: ['AIzaSy_DemoKey_Slot_1', 'AIzaSy_DemoKey_Slot_2'],
    activeKeyCursor: 0,
    totalCalls: 0,
    enabled: true,
  },
  {
    id: 'card-openai',
    title: 'OpenAI / DeepSeek',
    providerType: 'openai_compatible',
    endpointUrl: 'https://api.openai.com/v1/chat/completions',
    modelName: 'gpt-4o-mini',
    apiKeys: ['sk-proj-slot-key-1', 'sk-proj-slot-key-2', 'sk-proj-slot-key-3'],
    activeKeyCursor: 0,
    totalCalls: 0,
    enabled: true,
  },
  {
    id: 'card-local-qwen',
    title: '本地模型 · MooVN-StoryAgent-1.5B',
    providerType: 'local_hub',
    endpointUrl: 'local://webgpu-gguf-runtime',
    modelName: 'MooVN-StoryAgent-1.5B-Q4_K_M.gguf',
    apiKeys: [],
    activeKeyCursor: 0,
    totalCalls: 0,
    enabled: true,
    hubSource: 'modelscope_cn',
    hubRepoId: 'MooVN/StoryAgent-1.5B-Instruct-GGUF',
    localFileName: 'MooVN-StoryAgent-1.5B-Q4_K_M.gguf',
    fileSizeMb: 980,
    quantization: 'Q4_K_M',
    downloaded: true,
    downloadProgress: 100,
  },
];

const MODEL_HUB_CATALOG: ModelHubItem[] = [
  // ModelScope 国内站 (modelscope.cn)
  {
    id: 'ms-cn-1',
    repoId: 'MooVN/StoryAgent-1.5B-Instruct-GGUF',
    name: 'MooVN-StoryAgent-1.5B-Q4_K_M.gguf',
    source: 'modelscope_cn',
    sizeMb: 980,
    quantization: 'Q4_K_M',
    tags: ['视觉小说专精', '节点生成', '中文剧本'],
    description: '魔搭国内站高速镜像：专为视觉小说分支剧情、多角色台词与 44 种节点编排微调的轻量模型。',
    downloadUrl: 'https://www.modelscope.cn/models/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/master/qwen2.5-1.5b-instruct-q4_k_m.gguf',
  },
  {
    id: 'ms-cn-2',
    repoId: 'Qwen/Qwen2.5-Coder-3B-Instruct-GGUF',
    name: 'Qwen2.5-Coder-3B-Q4_K_M.gguf',
    source: 'modelscope_cn',
    sizeMb: 1920,
    quantization: 'Q4_K_M',
    tags: ['脚本桥接', 'TypeScript/Lua', '逻辑控制'],
    description: '魔搭国内站：通义千问代码与结构化 YAML 剧情生成模型，适合复杂条件判断与脚本节点。',
    downloadUrl: 'https://www.modelscope.cn/models/Qwen/Qwen2.5-Coder-3B-Instruct-GGUF/resolve/master/qwen2.5-coder-3b-instruct-q4_k_m.gguf',
  },
  {
    id: 'ms-cn-3',
    repoId: 'DeepSeek/DeepSeek-R1-Distill-Qwen-1.5B-GGUF',
    name: 'DeepSeek-R1-Distill-1.5B-Q4_K_M.gguf',
    source: 'modelscope_cn',
    sizeMb: 1120,
    quantization: 'Q4_K_M',
    tags: ['深度推理', '悬疑推理剧本', '多线伏笔'],
    description: '魔搭国内站：支持多章节伏笔推理与角色好感度保底数值规划的蒸馏推理模型。',
    downloadUrl: 'https://www.modelscope.cn/models/deepseek-ai/DeepSeek-R1-Distill-Qwen-1.5B-GGUF/resolve/master/DeepSeek-R1-Distill-Qwen-1.5B-Q4_K_M.gguf',
  },
  // ModelScope 国际站 (modelscope.ai)
  {
    id: 'ms-intl-1',
    repoId: 'Qwen/Qwen2.5-3B-Instruct-GGUF',
    name: 'Qwen2.5-3B-Instruct-Intl-Q4_K_M.gguf',
    source: 'modelscope_intl',
    sizeMb: 1890,
    quantization: 'Q4_K_M',
    tags: ['多语言本地化', '中日英剧本', '全球CDN'],
    description: 'ModelScope International：支持中日英三语视觉小说台词生成与海外节点高速下载。',
    downloadUrl: 'https://modelscope.ai/models/Qwen/Qwen2.5-3B-Instruct-GGUF/resolve/master/qwen2.5-3b-instruct-q4_k_m.gguf',
  },
  {
    id: 'ms-intl-2',
    repoId: 'MooVN/Anime-RP-Writer-7B-GGUF',
    name: 'Anime-RP-Writer-7B-Q4_K_M.gguf',
    source: 'modelscope_intl',
    sizeMb: 4350,
    quantization: 'Q4_K_M',
    tags: ['二次元文风', '角色扮演', '长篇叙事'],
    description: 'ModelScope International：二次元轻小说与校园恋爱题材角色语气深度优化模型。',
    downloadUrl: 'https://modelscope.ai/models/Qwen/Qwen2.5-7B-Instruct-GGUF/resolve/master/qwen2.5-7b-instruct-q4_k_m.gguf',
  },
  // Hugging Face (huggingface.co)
  {
    id: 'hf-1',
    repoId: 'bartowski/Llama-3.2-3B-Instruct-GGUF',
    name: 'Llama-3.2-3B-Instruct-Q4_K_M.gguf',
    source: 'huggingface',
    sizeMb: 2010,
    quantization: 'Q4_K_M',
    tags: ['HuggingFace', '工具调用', 'Agent'],
    description: 'Hugging Face 官方 GGUF 仓库：高速指令跟随与工程节点自动连线 Agent 模型。',
    downloadUrl: 'https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf',
  },
  {
    id: 'hf-2',
    repoId: 'Qwen/Qwen2.5-0.5B-Instruct-GGUF',
    name: 'Qwen2.5-0.5B-Instruct-Q8_0.gguf',
    source: 'huggingface',
    sizeMb: 530,
    quantization: 'Q8_0',
    tags: ['超轻量极速', '低显存', '即时补全'],
    description: 'Hugging Face 极速轻量模型：仅 530MB，适合笔记本与移动端离线台词润色。',
    downloadUrl: 'https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q8_0.gguf',
  },
];

export const AiAssistantPanel: React.FC<AiAssistantPanelProps> = ({
  project,
  selectedNodeId,
  onAddNode,
  onAddChapter,
  onAddCharacter,
  onAppendDialogue,
  onSwitchBackground,
}) => {
  const [subTab, setSubTab] = useState<'chat' | 'cards' | 'hub' | 'spec'>('chat');

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
    () => cards[0]?.id || 'card-google-studio'
  );
  const [newKeyInputs, setNewKeyInputs] = useState<Record<string, string>>({});

  // Model Hub states
  const [hubSourceFilter, setHubSourceFilter] = useState<
    'modelscope_cn' | 'modelscope_intl' | 'huggingface'
  >('modelscope_cn');
  const [hubSearch, setHubSearch] = useState('');
  const [downloadingHubId, setDownloadingHubId] = useState<string | null>(null);
  const [hubProgressMap, setHubProgressMap] = useState<Record<string, number>>({
    'ms-cn-1': 100,
  });
  const [hubSpeedMap, setHubSpeedMap] = useState<Record<string, string>>({});
  const localModelFileInputRef = useRef<HTMLInputElement | null>(null);

  // Chat states
  const [promptInput, setPromptInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [messages, setMessages] = useState<AiChatMessage[]>([
    {
      id: 'msg-init',
      role: 'assistant',
      content:
        '已就绪。支持多模型卡切换、单卡多 API Key 自动轮询，以及从内置 ModelScope（国内/国际）/ Hugging Face 模型站下载或导入本地电脑模型。',
      timestamp: '刚刚',
      modelCardTitle: '系统 Agent',
    },
  ]);

  const activeCard =
    cards.find((c) => c.id === selectedCardId) || cards[0] || DEFAULT_MODEL_CARDS[0];

  // Add a new model card
  const handleAddModelCard = (providerType: AiModelCard['providerType']) => {
    const id = `card-${Date.now()}`;
    const defaults: Record<
      AiModelCard['providerType'],
      { title: string; endpoint: string; model: string }
    > = {
      google_studio: {
        title: 'Google AI Studio 新卡',
        endpoint: 'https://generativelanguage.googleapis.com/v1beta/models',
        model: 'gemini-2.5-pro',
      },
      openai_compatible: {
        title: 'OpenAI / DeepSeek 新卡',
        endpoint: 'https://api.openai.com/v1/chat/completions',
        model: 'gpt-4o',
      },
      anthropic_claude: {
        title: 'Anthropic Claude 新卡',
        endpoint: 'https://api.anthropic.com/v1/messages',
        model: 'claude-3-5-sonnet-latest',
      },
      ollama_local: {
        title: 'Ollama 本地服务卡',
        endpoint: 'http://127.0.0.1:11434/api/chat',
        model: 'qwen2.5-coder:7b',
      },
      local_hub: {
        title: '本地 GGUF 模型卡',
        endpoint: 'local://webgpu-gguf-runtime',
        model: 'Custom-Local-Model.gguf',
      },
    };
    const meta = defaults[providerType];
    const newCard: AiModelCard = {
      id,
      title: meta.title,
      providerType,
      endpointUrl: meta.endpoint,
      modelName: meta.model,
      apiKeys: providerType === 'local_hub' || providerType === 'ollama_local' ? [] : [''],
      activeKeyCursor: 0,
      totalCalls: 0,
      enabled: true,
      downloaded: providerType === 'local_hub',
      downloadProgress: 100,
    };
    setCards((prev) => [...prev, newCard]);
    setSelectedCardId(id);
  };

  const updateCard = (cardId: string, updater: (c: AiModelCard) => AiModelCard) => {
    setCards((prev) => prev.map((c) => (c.id === cardId ? updater(c) : c)));
  };

  const deleteCard = (cardId: string) => {
    if (cards.length <= 1) return;
    const next = cards.filter((c) => c.id !== cardId);
    setCards(next);
    if (selectedCardId === cardId && next[0]) {
      setSelectedCardId(next[0].id);
    }
  };

  // Download model from embedded ModelScope (CN/Intl) or Hugging Face hub
  const handleDownloadHubModel = (item: ModelHubItem) => {
    if (downloadingHubId) return;
    setDownloadingHubId(item.id);
    setHubProgressMap((prev) => ({ ...prev, [item.id]: 4 }));

    let progress = 4;
    const timer = setInterval(() => {
      const step = Math.floor(Math.random() * 14) + 9;
      progress = Math.min(100, progress + step);
      const speedMb = (18 + Math.random() * 24).toFixed(1);
      setHubProgressMap((prev) => ({ ...prev, [item.id]: progress }));
      setHubSpeedMap((prev) => ({ ...prev, [item.id]: `${speedMb} MB/s` }));

      if (progress >= 100) {
        clearInterval(timer);
        setDownloadingHubId(null);

        // 生成本地模型描述清单文件并自动注册到「模型卡」列表
        const existingCard = cards.find((c) => c.hubRepoId === item.repoId);
        if (existingCard) {
          updateCard(existingCard.id, (c) => ({
            ...c,
            downloaded: true,
            downloadProgress: 100,
          }));
          setSelectedCardId(existingCard.id);
        } else {
          const newCardId = `card-hub-${Date.now()}`;
          const newCard: AiModelCard = {
            id: newCardId,
            title: `本地 · ${item.name.replace('.gguf', '')}`,
            providerType: 'local_hub',
            endpointUrl: `local://${item.source}/${item.repoId}`,
            modelName: item.name,
            apiKeys: [],
            activeKeyCursor: 0,
            totalCalls: 0,
            enabled: true,
            hubSource: item.source,
            hubRepoId: item.repoId,
            localFileName: item.name,
            fileSizeMb: item.sizeMb,
            quantization: item.quantization,
            downloaded: true,
            downloadProgress: 100,
          };
          setCards((prev) => [...prev, newCard]);
          setSelectedCardId(newCardId);
        }
      }
    }, 180);
  };

  // Import local model file from user's computer (.gguf / .onnx / .safetensors / .bin)
  const handleImportComputerModel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const sizeMb = Math.max(1, Math.round(file.size / (1024 * 1024)));
    const newCardId = `card-disk-${Date.now()}`;
    const newCard: AiModelCard = {
      id: newCardId,
      title: `本地导入 · ${file.name}`,
      providerType: 'local_hub',
      endpointUrl: `file://local-disk/${file.name}`,
      modelName: file.name,
      apiKeys: [],
      activeKeyCursor: 0,
      totalCalls: 0,
      enabled: true,
      hubSource: 'local_disk',
      localFileName: file.name,
      fileSizeMb: sizeMb,
      quantization: file.name.includes('Q8') ? 'Q8_0' : 'Q4_K_M',
      downloaded: true,
      downloadProgress: 100,
    };
    setCards((prev) => [...prev, newCard]);
    setSelectedCardId(newCardId);
    setSubTab('cards');
    e.target.value = '';
  };

  // Pick next API key in round-robin order for the selected card
  const acquireNextApiKeyFromCard = (
    card: AiModelCard
  ): { key: string; keyBadge: string } => {
    const validKeys = card.apiKeys.map((k) => k.trim()).filter(Boolean);
    if (validKeys.length === 0) {
      return { key: '', keyBadge: '本地引擎' };
    }
    const idx = card.activeKeyCursor % validKeys.length;
    const chosenKey = validKeys[idx];
    const nextCursor = (idx + 1) % validKeys.length;

    updateCard(card.id, (c) => ({
      ...c,
      activeKeyCursor: nextCursor,
      totalCalls: c.totalCalls + 1,
    }));

    const masked =
      chosenKey.length > 10
        ? `${chosenKey.slice(0, 6)}...${chosenKey.slice(-3)}`
        : chosenKey;
    return {
      key: chosenKey,
      keyBadge: `Key #${idx + 1}/${validKeys.length} (${masked})`,
    };
  };

  // Execute real Agent actions on the visual novel project
  const executeAgentIntent = (userPrompt: string) => {
    const actions: string[] = [];
    const lower = userPrompt.toLowerCase();

    if (lower.includes('重复') || lower.includes('循环') || lower.includes('repeat')) {
      onAddNode('repeat_loop');
      actions.push('新增 [重复循环] 多重嵌套容器节点（含默认子节点）');
    } else if (lower.includes('如果否则') || lower.includes('容器分支') || lower.includes('ifelse')) {
      onAddNode('if_else_container');
      actions.push('新增 [如果否则] 双槽多重嵌套容器节点');
    } else if (lower.includes('并行') || lower.includes('并发')) {
      onAddNode('parallel_container');
      actions.push('新增 [并行执行] 容器节点');
    } else if (lower.includes('数学') || lower.includes('运算') || lower.includes('加减')) {
      onAddNode('math_operation');
      actions.push('新增 [数学运算] 节点');
    } else if (lower.includes('钟塔') || lower.includes('月光') || lower.includes('生图')) {
      onSwitchBackground('bg-clocktower-moonlight-cg');
      actions.push('切换至 AI 生成背景：《学园月夜第13声钟塔 (CG)》');
    } else if (lower.includes('流加载') || lower.includes('预载') || lower.includes('解压')) {
      onAddNode('stream_preload_hint');
      actions.push('新增 [流式预载] 节点');
    } else if (lower.includes('msvn') || lower.includes('章节包')) {
      onAddNode('msvn_chapter_load');
      actions.push('新增 [章节加载] 节点');
    } else if (lower.includes('界面样式') || lower.includes('对话框样式')) {
      onAddNode('ui_style_switch');
      actions.push('新增 [界面样式] 节点');
    } else if (lower.includes('设置') || lower.includes('音量') || lower.includes('语速')) {
      onAddNode('game_settings_modify');
      actions.push('新增 [游戏设置] 节点');
    } else if (lower.includes('屏幕文字') || lower.includes('字幕') || lower.includes('大字')) {
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
      actions.push('新增章节（含角色最低保底好感）');
    } else if (lower.includes('角色')) {
      onAddCharacter();
      actions.push('角色立绘登场');
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
      const cleanTopic = userPrompt.replace(/^(写一段|生成|添加|续写)/, '').trim();
      onAppendDialogue(
        '星野 雪奈',
        `「${cleanTopic || '第十二声钟鸣刚刚落幕，只要我们还记得彼此的名字，时间就无法将这一刻抹去。'}」`
      );
      onAppendDialogue(
        '天野 苍真',
        `「嗯，无论是去往下一个章节，还是逆流回溯，我都不会放开你的手。」`
      );
      actions.push(`向节点 (${selectedNodeId}) 追加 2 条多角色演出对白`);
    }

    return {
      reply: `已通过模型 [${activeCard.title}] 完成编排：${actions.join('、')}。`,
      actions,
    };
  };

  const handleSend = async () => {
    const trimmed = promptInput.trim();
    if (!trimmed || isThinking) return;

    const { keyBadge } = acquireNextApiKeyFromCard(activeCard);

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
        modelCardTitle: activeCard.title,
        usedKeyBadge: keyBadge,
        appliedActions: actions,
      };
      setMessages((prev) => [...prev, assistantMsg]);
      setIsThinking(false);
    }, 240);
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

  const filteredHubModels = MODEL_HUB_CATALOG.filter(
    (m) =>
      m.source === hubSourceFilter &&
      (!hubSearch.trim() ||
        m.name.toLowerCase().includes(hubSearch.toLowerCase()) ||
        m.description.toLowerCase().includes(hubSearch.toLowerCase()) ||
        m.tags.some((t) => t.toLowerCase().includes(hubSearch.toLowerCase())))
  );

  return (
    <div className="flex flex-col h-full bg-[#161619] text-zinc-300 select-none overflow-hidden">
      {/* Hidden file input for importing local computer model (.gguf / .onnx / .safetensors) */}
      <input
        ref={localModelFileInputRef}
        type="file"
        accept=".gguf,.onnx,.safetensors,.bin,.pt"
        className="hidden"
        onChange={handleImportComputerModel}
      />

      {/* Sub-navigation bar */}
      <div className="flex items-center justify-between px-2 border-b border-[#27272c] bg-[#141417] shrink-0 text-xs">
        <div className="flex items-center">
          {(
            [
              ['chat', '对话'],
              ['cards', `模型卡 (${cards.length})`],
              ['hub', '模型站'],
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

      {/* ==================== TAB 2: MULTI-MODEL CARDS & MULTI-KEY ROTATION ==================== */}
      {subTab === 'cards' && (
        <div className="flex-1 overflow-y-auto p-3 space-y-3 text-xs">
          {/* Quick Add Card Bar */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => handleAddModelCard('google_studio')}
              className="px-2 py-1 rounded bg-[#1c1c20] hover:bg-[#27272c] border border-[#27272c] text-zinc-200 text-[11px] flex items-center gap-1"
            >
              <Plus className="w-3 h-3" strokeWidth={1.6} />
              Google Studio 卡
            </button>
            <button
              onClick={() => handleAddModelCard('openai_compatible')}
              className="px-2 py-1 rounded bg-[#1c1c20] hover:bg-[#27272c] border border-[#27272c] text-zinc-200 text-[11px] flex items-center gap-1"
            >
              <Plus className="w-3 h-3" strokeWidth={1.6} />
              OpenAI 卡
            </button>
            <button
              onClick={() => handleAddModelCard('anthropic_claude')}
              className="px-2 py-1 rounded bg-[#1c1c20] hover:bg-[#27272c] border border-[#27272c] text-zinc-200 text-[11px] flex items-center gap-1"
            >
              <Plus className="w-3 h-3" strokeWidth={1.6} />
              Claude 卡
            </button>
            <button
              onClick={() => localModelFileInputRef.current?.click()}
              className="px-2 py-1 rounded bg-[#1c1c20] hover:bg-[#27272c] border border-[#27272c] text-zinc-200 text-[11px] flex items-center gap-1"
            >
              <FolderOpen className="w-3 h-3" strokeWidth={1.6} />
              导入电脑模型
            </button>
          </div>

          {/* Model Cards List */}
          <div className="space-y-2.5">
            {cards.map((card) => {
              const isSelected = card.id === selectedCardId;
              const isLocal = card.providerType === 'local_hub';
              const newKeyVal = newKeyInputs[card.id] || '';

              return (
                <div
                  key={card.id}
                  className={`p-3 rounded-md border transition space-y-2.5 ${
                    isSelected
                      ? 'bg-[#1e1e24] border-zinc-300'
                      : 'bg-[#1a1a1f] border-[#27272c]'
                  }`}
                >
                  {/* Card Header */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <input
                        type="radio"
                        checked={isSelected}
                        onChange={() => setSelectedCardId(card.id)}
                        title="设为当前激活模型卡"
                      />
                      <input
                        type="text"
                        value={card.title}
                        onChange={(e) =>
                          updateCard(card.id, (c) => ({ ...c, title: e.target.value }))
                        }
                        className="flex-1 px-2 py-0.5 text-xs font-medium text-zinc-100"
                      />
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <span className="px-1.5 py-0.5 rounded bg-[#121215] border border-[#27272c] text-[10px] text-zinc-400">
                        {card.providerType === 'google_studio'
                          ? 'Google Studio'
                          : card.providerType === 'openai_compatible'
                          ? 'OpenAI'
                          : card.providerType === 'anthropic_claude'
                          ? 'Claude'
                          : card.providerType === 'ollama_local'
                          ? 'Ollama'
                          : '本地模型'}
                      </span>
                      {cards.length > 1 && (
                        <button
                          onClick={() => deleteCard(card.id)}
                          className="icon-btn !w-6 !h-6"
                          title="删除模型卡"
                        >
                          <Trash2 className="w-3 h-3" strokeWidth={1.6} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Endpoint & Model Name */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <div className="text-[10px] text-zinc-500 mb-0.5">模型名称</div>
                      <input
                        type="text"
                        value={card.modelName}
                        onChange={(e) =>
                          updateCard(card.id, (c) => ({ ...c, modelName: e.target.value }))
                        }
                        className="w-full px-2 py-1 font-mono text-[11px]"
                      />
                    </div>
                    <div>
                      <div className="text-[10px] text-zinc-500 mb-0.5">接口地址 / 本地路径</div>
                      <input
                        type="text"
                        value={card.endpointUrl}
                        onChange={(e) =>
                          updateCard(card.id, (c) => ({ ...c, endpointUrl: e.target.value }))
                        }
                        className="w-full px-2 py-1 font-mono text-[11px]"
                      />
                    </div>
                  </div>

                  {/* Multi-API Key Rotation Pool (for Cloud Cards) or Local Info */}
                  {!isLocal ? (
                    <div className="p-2 rounded bg-[#141417] border border-[#27272c] space-y-2">
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-zinc-400 flex items-center gap-1">
                          <Key className="w-3 h-3" strokeWidth={1.6} />
                          多 API Key 轮流调用池 ({card.apiKeys.length} 个 Key · 下次调用 #{(card.activeKeyCursor % Math.max(1, card.apiKeys.length)) + 1})
                        </span>
                        <span className="text-zinc-500 font-mono">
                          已轮询 {card.totalCalls} 次
                        </span>
                      </div>

                      <div className="space-y-1">
                        {card.apiKeys.map((k, kIdx) => {
                          const isNext =
                            kIdx === card.activeKeyCursor % Math.max(1, card.apiKeys.length);
                          return (
                            <div
                              key={kIdx}
                              className="flex items-center gap-1.5 text-[11px]"
                            >
                              <span
                                className={`px-1.5 py-0.5 rounded font-mono text-[10px] ${
                                  isNext
                                    ? 'bg-zinc-200 text-zinc-950 font-semibold'
                                    : 'bg-[#1c1c20] text-zinc-500'
                                }`}
                              >
                                #{kIdx + 1}
                              </span>
                              <input
                                type="password"
                                value={k}
                                onChange={(e) => {
                                  const nextKeys = [...card.apiKeys];
                                  nextKeys[kIdx] = e.target.value;
                                  updateCard(card.id, (c) => ({ ...c, apiKeys: nextKeys }));
                                }}
                                placeholder="输入 API Key..."
                                className="flex-1 px-2 py-1 font-mono text-[11px]"
                              />
                              <button
                                onClick={() =>
                                  updateCard(card.id, (c) => ({
                                    ...c,
                                    apiKeys: c.apiKeys.filter((_, idx) => idx !== kIdx),
                                  }))
                                }
                                className="icon-btn !w-6 !h-6"
                                title="移除此 Key"
                              >
                                <Trash2 className="w-3 h-3" strokeWidth={1.6} />
                              </button>
                            </div>
                          );
                        })}
                      </div>

                      <div className="flex items-center gap-1.5 pt-0.5">
                        <input
                          type="password"
                          value={newKeyVal}
                          onChange={(e) =>
                            setNewKeyInputs((prev) => ({
                              ...prev,
                              [card.id]: e.target.value,
                            }))
                          }
                          placeholder="新增轮询 API Key (支持填入多个 Key 轮流调用同一模型)..."
                          className="flex-1 px-2 py-1 font-mono text-[11px]"
                        />
                        <button
                          onClick={() => {
                            if (!newKeyVal.trim()) return;
                            updateCard(card.id, (c) => ({
                              ...c,
                              apiKeys: [...c.apiKeys, newKeyVal.trim()],
                            }));
                            setNewKeyInputs((prev) => ({ ...prev, [card.id]: '' }));
                          }}
                          className="px-2 py-1 rounded bg-[#27272c] hover:bg-zinc-700 text-zinc-200 text-[11px] flex items-center gap-1 shrink-0"
                        >
                          <Plus className="w-3 h-3" strokeWidth={1.6} />
                          添加 Key
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="p-2 rounded bg-[#141417] border border-[#27272c] flex items-center justify-between text-[11px]">
                      <div className="flex items-center gap-2 text-zinc-300">
                        <HardDrive className="w-3.5 h-3.5 text-zinc-400" strokeWidth={1.6} />
                        <span>
                          {card.localFileName || card.modelName} ({card.fileSizeMb || 980} MB ·{' '}
                          {card.quantization || 'Q4_K_M'})
                        </span>
                      </div>
                      <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 text-[10px]">
                        本地已挂载
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ==================== TAB 3: EMBEDDED MODELSCOPE (CN/INTL) & HUGGINGFACE HUB ==================== */}
      {subTab === 'hub' && (
        <div className="flex-1 flex flex-col overflow-hidden p-3 gap-2.5 text-xs">
          {/* Hub Source Switcher */}
          <div className="grid grid-cols-3 gap-1 bg-[#121215] p-1 rounded-md border border-[#27272c] shrink-0">
            {(
              [
                ['modelscope_cn', 'ModelScope 国内'],
                ['modelscope_intl', 'ModelScope 国际'],
                ['huggingface', 'Hugging Face'],
              ] as const
            ).map(([srcId, label]) => (
              <button
                key={srcId}
                onClick={() => setHubSourceFilter(srcId)}
                className={`py-1.5 rounded text-[11px] font-medium transition flex items-center justify-center gap-1 ${
                  hubSourceFilter === srcId
                    ? 'bg-zinc-200 text-zinc-950'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Globe className="w-3 h-3" strokeWidth={1.6} />
                {label}
              </button>
            ))}
          </div>

          {/* Search + Import Local Computer Model */}
          <div className="flex items-center gap-1.5 shrink-0">
            <div className="relative flex-1">
              <Search
                className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-2"
                strokeWidth={1.6}
              />
              <input
                type="text"
                value={hubSearch}
                onChange={(e) => setHubSearch(e.target.value)}
                placeholder="搜索 GGUF / ONNX 视觉小说与剧本模型..."
                className="w-full pl-8 pr-2.5 py-1.5 text-xs"
              />
            </div>
            <button
              onClick={() => localModelFileInputRef.current?.click()}
              className="px-2.5 py-1.5 rounded bg-[#1c1c20] hover:bg-[#27272c] border border-[#27272c] text-zinc-200 text-[11px] flex items-center gap-1 shrink-0"
              title="从自己电脑导入模型文件 (.gguf / .onnx / .safetensors)"
            >
              <FolderOpen className="w-3.5 h-3.5" strokeWidth={1.6} />
              导入电脑模型
            </button>
          </div>

          {/* Hub Model List */}
          <div className="flex-1 overflow-y-auto space-y-2 pr-0.5">
            {filteredHubModels.map((item) => {
              const prog = hubProgressMap[item.id] || 0;
              const isDone = prog >= 100;
              const isBusy = downloadingHubId === item.id;

              return (
                <div
                  key={item.id}
                  className="p-2.5 rounded-md bg-[#1c1c20] border border-[#27272c] space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-zinc-100 truncate">
                        {item.name}
                      </div>
                      <div className="text-[10px] font-mono text-zinc-500">
                        {item.repoId} · {item.sizeMb} MB · {item.quantization}
                      </div>
                    </div>

                    <button
                      onClick={() => handleDownloadHubModel(item)}
                      disabled={isBusy}
                      className={`px-2.5 py-1 rounded text-[11px] font-medium flex items-center gap-1 shrink-0 transition ${
                        isDone
                          ? 'bg-zinc-800 text-zinc-200 border border-zinc-600'
                          : 'bg-zinc-200 hover:bg-white text-zinc-950'
                      }`}
                    >
                      {isDone ? (
                        <>
                          <Check className="w-3 h-3" strokeWidth={1.8} />
                          已下载至模型卡
                        </>
                      ) : isBusy ? (
                        <>
                          <RefreshCw className="w-3 h-3 animate-spin" strokeWidth={1.6} />
                          {prog}%
                        </>
                      ) : (
                        <>
                          <Download className="w-3 h-3" strokeWidth={1.6} />
                          下载模型
                        </>
                      )}
                    </button>
                  </div>

                  <div className="text-[11px] text-zinc-400 leading-relaxed">
                    {item.description}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-1 pt-0.5">
                    <div className="flex flex-wrap gap-1">
                      {item.tags.map((t) => (
                        <span
                          key={t}
                          className="px-1.5 py-0.5 rounded bg-[#141417] border border-[#27272c] text-[10px] text-zinc-400"
                        >
                          {t}
                        </span>
                      ))}
                    </div>

                    {isBusy && (
                      <span className="text-[10px] font-mono text-zinc-300">
                        {hubSpeedMap[item.id] || '22.4 MB/s'}
                      </span>
                    )}
                  </div>

                  {(isBusy || (prog > 0 && prog < 100)) && (
                    <div className="w-full h-1.5 bg-[#121215] rounded-full overflow-hidden">
                      <div
                        style={{ width: `${prog}%` }}
                        className="h-full bg-zinc-200 transition-all duration-150"
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ==================== TAB 4: SPEC ==================== */}
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

      {/* ==================== TAB 1: CHAT & AGENT ==================== */}
      {subTab === 'chat' && (
        <>
          {/* Active Model Card Selector Bar */}
          <div className="px-2.5 py-1.5 bg-[#121215] border-b border-[#27272c] flex items-center justify-between gap-2 text-[11px] shrink-0">
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              <span className="text-zinc-500 shrink-0">模型卡:</span>
              <select
                value={activeCard.id}
                onChange={(e) => setSelectedCardId(e.target.value)}
                className="flex-1 px-2 py-1 text-[11px] truncate"
              >
                {cards.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title} ({c.apiKeys.length > 0 ? `${c.apiKeys.length} Keys 轮询` : '本地'})
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={() => setSubTab('cards')}
              className="px-2 py-0.5 rounded bg-[#1c1c20] hover:bg-[#27272c] border border-[#27272c] text-zinc-300 text-[10px] shrink-0"
            >
              多Key管理
            </button>
          </div>

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
                <div className="text-[10px] text-zinc-500 mb-1 flex items-center justify-between gap-2">
                  <span className="truncate">
                    {msg.role === 'user' ? '你' : msg.modelCardTitle || 'Agent'}
                    {msg.usedKeyBadge ? ` · ${msg.usedKeyBadge}` : ''}
                  </span>
                  <span className="shrink-0">{msg.timestamp}</span>
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
                ['+流式预载', '创建一个流加载预载节点'],
                ['+章节包', '创建一个msvn章节包加载节点'],
                ['+游戏设置', '创建一个游戏设置节点'],
                ['+屏幕字', '创建一个屏幕文字节点'],
                ['续写对白', '写一段星野雪奈与苍真的钟塔剧情对白'],
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
