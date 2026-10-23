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
  ExternalLink,
  AlertCircle,
  Cpu,
} from 'lucide-react';
import { Wllama } from '@wllama/wllama';
import {
  AiChatMessage,
  AiModelCard,
  ModelHubItem,
  VNProject,
  WorkflowNodeType,
} from '../types';
import { MOOVN_AI_SPEC_MARKDOWN } from '../data/aiSpec';

const WLLAMA_ASSETS_CONFIG = {
  default:
    'https://cdn.jsdelivr.net/npm/@wllama/wllama@3.8.1/esm/wasm/wllama.wasm',
};

interface AiAssistantPanelProps {
  project: VNProject;
  selectedNodeId: string;
  onAddNode: (type: WorkflowNodeType) => void;
  onUpdateNode?: (id: string, updater: (n: any) => any) => void;
  onAddChapter: () => void;
  onAddCharacter: () => void;
  onAppendDialogue: (speakerName: string, text: string) => void;
  onSwitchBackground: (bgId: string) => void;
}

const AI_CARDS_STORAGE_KEY = 'moovn_ai_model_cards_v4';

const DEFAULT_MODEL_CARDS: AiModelCard[] = [
  {
    id: 'card-openai',
    title: 'OpenAI / DeepSeek 兼容接口',
    providerType: 'openai_compatible',
    endpointUrl: 'https://api.openai.com/v1/chat/completions',
    modelName: 'gpt-4o-mini',
    apiKeys: [],
    activeKeyCursor: 0,
    totalCalls: 0,
    enabled: true,
  },
  {
    id: 'card-google-studio',
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

const MODEL_HUB_CATALOG: ModelHubItem[] = [
  // ModelScope 国内站 (modelscope.cn)
  {
    id: 'ms-cn-1',
    repoId: 'Qwen/Qwen2.5-1.5B-Instruct-GGUF',
    name: 'Qwen2.5-1.5B-Instruct-Q4_K_M.gguf',
    source: 'modelscope_cn',
    sizeMb: 980,
    quantization: 'Q4_K_M',
    tags: ['视觉小说专精', '节点生成', '中文剧本'],
    description:
      '魔搭国内站真实直链：适合视觉小说分支剧情、多角色台词与 55 种节点编排的轻量模型。',
    downloadUrl:
      'https://www.modelscope.cn/models/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/master/qwen2.5-1.5b-instruct-q4_k_m.gguf',
  },
  {
    id: 'ms-cn-2',
    repoId: 'Qwen/Qwen2.5-Coder-3B-Instruct-GGUF',
    name: 'Qwen2.5-Coder-3B-Q4_K_M.gguf',
    source: 'modelscope_cn',
    sizeMb: 1920,
    quantization: 'Q4_K_M',
    tags: ['脚本桥接', 'TypeScript/Lua/Python', '逻辑控制'],
    description:
      '魔搭国内站真实直链：通义千问代码与结构化 YAML 剧情生成模型，适合复杂条件判断与脚本节点。',
    downloadUrl:
      'https://www.modelscope.cn/models/Qwen/Qwen2.5-Coder-3B-Instruct-GGUF/resolve/master/qwen2.5-coder-3b-instruct-q4_k_m.gguf',
  },
  {
    id: 'ms-cn-3',
    repoId: 'deepseek-ai/DeepSeek-R1-Distill-Qwen-1.5B-GGUF',
    name: 'DeepSeek-R1-Distill-1.5B-Q4_K_M.gguf',
    source: 'modelscope_cn',
    sizeMb: 1120,
    quantization: 'Q4_K_M',
    tags: ['深度推理', '悬疑推理剧本', '多线伏笔'],
    description:
      '魔搭国内站真实直链：支持多章节伏笔推理与角色好感度保底数值规划的蒸馏推理模型。',
    downloadUrl:
      'https://www.modelscope.cn/models/deepseek-ai/DeepSeek-R1-Distill-Qwen-1.5B-GGUF/resolve/master/DeepSeek-R1-Distill-Qwen-1.5B-Q4_K_M.gguf',
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
    description:
      'ModelScope International 真实直链：支持中日英三语视觉小说台词生成与海外节点高速下载。',
    downloadUrl:
      'https://modelscope.ai/models/Qwen/Qwen2.5-3B-Instruct-GGUF/resolve/master/qwen2.5-3b-instruct-q4_k_m.gguf',
  },
  {
    id: 'ms-intl-2',
    repoId: 'Qwen/Qwen2.5-7B-Instruct-GGUF',
    name: 'Qwen2.5-7B-Instruct-Q4_K_M.gguf',
    source: 'modelscope_intl',
    sizeMb: 4350,
    quantization: 'Q4_K_M',
    tags: ['二次元文风', '角色扮演', '长篇叙事'],
    description:
      'ModelScope International 真实直链：二次元轻小说与校园恋爱题材角色语气深度优化模型。',
    downloadUrl:
      'https://modelscope.ai/models/Qwen/Qwen2.5-7B-Instruct-GGUF/resolve/master/qwen2.5-7b-instruct-q4_k_m.gguf',
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
    description:
      'Hugging Face 官方 GGUF 仓库真实直链：指令跟随与工程节点自动连线模型。',
    downloadUrl:
      'https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf',
  },
  {
    id: 'hf-2',
    repoId: 'Qwen/Qwen2.5-0.5B-Instruct-GGUF',
    name: 'Qwen2.5-0.5B-Instruct-Q8_0.gguf',
    source: 'huggingface',
    sizeMb: 530,
    quantization: 'Q8_0',
    tags: ['超轻量极速', '低显存', '即时补全'],
    description:
      'Hugging Face 官方 GGUF 直链：仅 530MB，适合笔记本与移动端离线台词润色。',
    downloadUrl:
      'https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q8_0.gguf',
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
    () => cards[0]?.id || 'card-openai'
  );
  const [newKeyInputs, setNewKeyInputs] = useState<Record<string, string>>({});

  // Model Hub & Wllama WASM GGUF Runtime states
  const [hubSourceFilter, setHubSourceFilter] = useState<
    'modelscope_cn' | 'modelscope_intl' | 'huggingface'
  >('modelscope_cn');
  const [hubSearch, setHubSearch] = useState('');
  const localModelFileInputRef = useRef<HTMLInputElement | null>(null);
  const wllamaRef = useRef<Wllama | null>(null);
  const [wllamaStatus, setWllamaStatus] = useState<{
    loading: boolean;
    progress: number;
    loadedModelName: string | null;
    metaSummary: string | null;
  }>({
    loading: false,
    progress: 0,
    loadedModelName: null,
    metaSummary: null,
  });

  // Chat states
  const [promptInput, setPromptInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [messages, setMessages] = useState<AiChatMessage[]>([
    {
      id: 'msg-init',
      role: 'assistant',
      content:
        '已就绪。支持多模型卡切换、单卡多 API Key 自动轮询调用（OpenAI / DeepSeek / Gemini / Claude / Ollama），以及通过内置 llama.cpp WebAssembly (Wllama) 引擎直接加载电脑本地 .gguf 模型文件或从模型库加载 .gguf 进行真实本地推理。',
      timestamp: '刚刚',
      modelCardTitle: '系统 Agent',
    },
  ]);

  const activeCard =
    cards.find((c) => c.id === selectedCardId) || cards[0] || DEFAULT_MODEL_CARDS[0];

  const getOrCreateWllama = async (): Promise<Wllama> => {
    if (wllamaRef.current) {
      try {
        await wllamaRef.current.exit();
      } catch {
        // ignore
      }
    }
    const instance = new Wllama(WLLAMA_ASSETS_CONFIG, { suppressNativeLog: true });
    wllamaRef.current = instance;
    return instance;
  };

  const handleAddModelCard = (providerType: AiModelCard['providerType']) => {
    const id = `card-${Date.now()}`;
    const defaults: Record<
      AiModelCard['providerType'],
      { title: string; endpoint: string; model: string }
    > = {
      google_studio: {
        title: 'Google AI Studio 新卡',
        endpoint: 'https://generativelanguage.googleapis.com/v1beta/models',
        model: 'gemini-2.5-flash',
      },
      openai_compatible: {
        title: 'OpenAI / DeepSeek 新卡',
        endpoint: 'https://api.openai.com/v1/chat/completions',
        model: 'gpt-4o-mini',
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
        endpoint: 'file://local.gguf',
        model: '未加载 .gguf 文件',
      },
    };
    const meta = defaults[providerType];
    const newCard: AiModelCard = {
      id,
      title: meta.title,
      providerType,
      endpointUrl: meta.endpoint,
      modelName: meta.model,
      apiKeys: [],
      activeKeyCursor: 0,
      totalCalls: 0,
      enabled: true,
      downloaded: false,
      downloadProgress: 0,
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

  // Load model directly from URL into Wllama WASM runtime or open direct download link
  const handleDownloadAndRegisterHubModel = async (item: ModelHubItem) => {
    setLastError(null);
    const existingCard = cards.find((c) => c.hubRepoId === item.repoId);
    const targetCardId = existingCard ? existingCard.id : `card-hub-${Date.now()}`;

    if (!existingCard) {
      const newCard: AiModelCard = {
        id: targetCardId,
        title: `本地 GGUF · ${item.name}`,
        providerType: 'local_hub',
        endpointUrl: item.downloadUrl,
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
        downloaded: false,
        downloadProgress: 0,
      };
      setCards((prev) => [...prev, newCard]);
    }
    setSelectedCardId(targetCardId);

    // Attempt to load model into Wllama WASM memory from URL, or open browser download if CORS blocks
    try {
      setWllamaStatus({
        loading: true,
        progress: 1,
        loadedModelName: null,
        metaSummary: '正在连接模型源并拉取 GGUF 权重至本地缓存...',
      });
      const wllama = await getOrCreateWllama();
      await wllama.loadModelFromUrl(item.downloadUrl, {
        n_ctx: 2048,
        progressCallback: ({ loaded, total }) => {
          const pct = total > 0 ? Math.round((loaded / total) * 100) : 50;
          setWllamaStatus((prev) => ({
            ...prev,
            loading: true,
            progress: pct,
          }));
          updateCard(targetCardId, (c) => ({
            ...c,
            downloadProgress: pct,
          }));
        },
      });
      const meta = wllama.getModelMetadata();
      const summary = `Vocab: ${meta.hparams.nVocab} · Ctx: ${meta.hparams.nCtxTrain} · Layers: ${meta.hparams.nLayer}`;
      setWllamaStatus({
        loading: false,
        progress: 100,
        loadedModelName: item.name,
        metaSummary: summary,
      });
      updateCard(targetCardId, (c) => ({
        ...c,
        downloaded: true,
        downloadProgress: 100,
      }));
      setSubTab('chat');
    } catch (err) {
      setWllamaStatus({
        loading: false,
        progress: 0,
        loadedModelName: null,
        metaSummary: null,
      });
      // If remote host blocks browser CORS, trigger direct browser file download so user can load the downloaded .gguf from disk
      window.open(item.downloadUrl, '_blank', 'noopener,noreferrer');
      setLastError(
        `已触发浏览器直链下载 ${item.name}（远端源跨域限制无法直接流式挂载：${
          err instanceof Error ? err.message : String(err)
        }）。下载完成后请点击「从电脑导入本地模型」加载该 .gguf 文件即可在本地内存推理。`
      );
    }
  };

  // Real local .gguf model loading from user's computer into Wllama WASM engine
  const handleLocalComputerModelImport = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setLastError(null);

    const sizeMb = Math.max(1, Math.round(file.size / (1024 * 1024)));
    const newCardId = `card-disk-${Date.now()}`;
    const newCard: AiModelCard = {
      id: newCardId,
      title: `本地 GGUF · ${file.name}`,
      providerType: 'local_hub',
      endpointUrl: `file://${file.name}`,
      modelName: file.name,
      apiKeys: [],
      activeKeyCursor: 0,
      totalCalls: 0,
      enabled: true,
      hubSource: 'local_disk',
      localFileName: file.name,
      fileSizeMb: sizeMb,
      quantization: file.name.toUpperCase().includes('Q8') ? 'Q8_0' : 'Q4_K_M',
      downloaded: false,
      downloadProgress: 10,
    };
    setCards((prev) => [...prev, newCard]);
    setSelectedCardId(newCardId);

    try {
      setWllamaStatus({
        loading: true,
        progress: 15,
        loadedModelName: null,
        metaSummary: `正在将 ${file.name} (${sizeMb} MB) 载入 llama.cpp WebAssembly 内存...`,
      });
      const wllama = await getOrCreateWllama();
      await wllama.loadModel([file], { n_ctx: 2048 });
      const meta = wllama.getModelMetadata();
      const summary = `Vocab: ${meta.hparams.nVocab} · Ctx: ${meta.hparams.nCtxTrain} · Layers: ${meta.hparams.nLayer} · Embd: ${meta.hparams.nEmbd}`;
      setWllamaStatus({
        loading: false,
        progress: 100,
        loadedModelName: file.name,
        metaSummary: summary,
      });
      updateCard(newCardId, (c) => ({
        ...c,
        downloaded: true,
        downloadProgress: 100,
      }));
      setSubTab('chat');
    } catch (err) {
      setWllamaStatus({
        loading: false,
        progress: 0,
        loadedModelName: null,
        metaSummary: null,
      });
      setLastError(
        `加载本地 .gguf 模型失败: ${
          err instanceof Error ? err.message : String(err)
        }（请确认文件为有效的 GGUF 格式权重）`
      );
    }
  };

  // Execute project graph actions triggered by user instruction or AI JSON tool tags
  const executeProjectInstruction = (text: string): string[] => {
    const lower = text.toLowerCase();
    const actions: string[] = [];

    if (lower.includes('重复') || lower.includes('repeat')) {
      onAddNode('repeat_loop');
      actions.push('新建【重复循环容器节点 (Scratch C型槽)】');
    } else if (lower.includes('条件循环') || lower.includes('while')) {
      onAddNode('while_loop');
      actions.push('新建【条件循环容器节点 (while)】');
    } else if (lower.includes('如果') || lower.includes('if')) {
      onAddNode('if_else_container');
      actions.push('新建【如果/否则容器节点 (if/else)】');
    } else if (lower.includes('流加载') || lower.includes('预载')) {
      onAddNode('stream_preload_hint');
      actions.push('新建【流加载预载/卸载节点】');
    } else if (lower.includes('章节包') || lower.includes('msvn')) {
      onAddNode('msvn_chapter_load');
      actions.push('新建【.msvn 章节包挂载节点】');
    } else if (lower.includes('游戏设置')) {
      onAddNode('game_settings_modify');
      actions.push('新建【游戏设置调控节点】');
    } else if (lower.includes('屏幕文字') || lower.includes('屏幕字')) {
      onAddNode('screen_text');
      actions.push('新建【屏幕文字节点】');
    } else if (lower.includes('淡入') || lower.includes('淡出')) {
      onAddNode('fade');
      actions.push('新建【淡入淡出节点】');
    } else if (lower.includes('分支') || lower.includes('选项')) {
      onAddNode('choice');
      actions.push('新建【玩家选项节点】');
    }

    if (lower.includes('新章节')) {
      onAddChapter();
      actions.push('新建章节');
    }
    if (lower.includes('新角色')) {
      onAddCharacter();
      actions.push('新建角色档案');
    }
    if (lower.includes('钟塔') || lower.includes('月夜')) {
      onSwitchBackground('bg-clocktower-moonlight-cg');
      actions.push('切换背景【月夜钟塔仰视CG】');
    }
    return actions;
  };

  const handleSend = async () => {
    const text = promptInput.trim();
    if (!text || isThinking) return;
    setPromptInput('');
    setLastError(null);

    const userMsg: AiChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date().toLocaleTimeString().slice(0, 5),
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsThinking(true);

    // Execute direct graph manipulations immediately
    const appliedActions = executeProjectInstruction(text);

    // Round-robin key selection for active card
    const validKeys = activeCard.apiKeys.map((k) => k.trim()).filter(Boolean);
    const keyIdx =
      validKeys.length > 0 ? activeCard.activeKeyCursor % validKeys.length : -1;
    const chosenKey = keyIdx >= 0 ? validKeys[keyIdx] : '';

    // Advance key rotation cursor
    updateCard(activeCard.id, (c) => ({
      ...c,
      activeKeyCursor:
        validKeys.length > 0 ? (c.activeKeyCursor + 1) % validKeys.length : 0,
      totalCalls: c.totalCalls + 1,
    }));

    const isLocalGguf = activeCard.providerType === 'local_hub';

    const currentNode = project.nodes.find((n) => n.id === selectedNodeId);
    const systemPrompt = `你是 MooVN Studio 视觉小说编辑器的 AI 编剧与工作流助手。当前工程：《${
      project.title
    }》，当前选中节点：${currentNode?.title || selectedNodeId} (${
      currentNode?.type || 'dialogue'
    })。`;

    if (isLocalGguf) {
      if (!wllamaRef.current || !wllamaRef.current.isModelLoaded()) {
        setIsThinking(false);
        setLastError(
          `本地模型卡「${activeCard.title}」尚未将 .gguf 权重加载至内存。请点击上方「模型库」->「从电脑导入本地模型」选择本地 .gguf 文件，或点击模型库中的加载按钮。`
        );
        return;
      }

      try {
        const chatMessages = [
          { role: 'system' as const, content: systemPrompt },
          ...messages.slice(-4).map((m) => ({
            role: (m.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
            content: m.content,
          })),
          { role: 'user' as const, content: text },
        ];

        const completion = await wllamaRef.current.createChatCompletion({
          messages: chatMessages,
          temperature: 0.7,
          top_k: 40,
          top_p: 0.9,
          max_tokens: 512,
          stream: false,
        });

        const replyText =
          completion?.choices?.[0]?.message?.content ||
          String(completion || '');

        setMessages((prev) => [
          ...prev,
          {
            id: `msg-reply-${Date.now()}`,
            role: 'assistant',
            content: replyText.trim(),
            timestamp: new Date().toLocaleTimeString().slice(0, 5),
            appliedActions,
            modelCardTitle: activeCard.title,
            usedKeyBadge: `Wllama WASM (${wllamaStatus.loadedModelName || activeCard.modelName})`,
          },
        ]);
      } catch (err) {
        setLastError(
          `本地 GGUF 模型推理失败: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
      } finally {
        setIsThinking(false);
      }
      return;
    }

    if (activeCard.providerType !== 'ollama_local' && !chosenKey) {
      setIsThinking(false);
      setLastError(
        `模型卡「${activeCard.title}」尚未配置 API Key。请点击上方「模型卡」标签页填入真实 API Key，或导入本地 .gguf 模型。`
      );
      return;
    }

    try {
      const chatHistory = [
        { role: 'system', content: systemPrompt },
        ...messages.slice(-6).map((m) => ({
          role: m.role === 'user' ? 'user' : 'assistant',
          content: m.content,
        })),
        { role: 'user', content: text },
      ];

      let replyText = '';

      if (activeCard.providerType === 'ollama_local') {
        // 先尝试从浏览器直接请求本机 Ollama (兼容部署在 Vercel 的网页端直接访问用户本机 127.0.0.1:11434)
        try {
          const directResp = await fetch(
            activeCard.endpointUrl || 'http://127.0.0.1:11434/api/chat',
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                model: activeCard.modelName || 'qwen2.5-coder:7b',
                messages: chatHistory,
                stream: false,
              }),
            }
          );
          if (!directResp.ok) {
            throw new Error(`HTTP ${directResp.status}`);
          }
          const directData = await directResp.json();
          replyText =
            directData?.message?.content ||
            directData?.choices?.[0]?.message?.content ||
            '';
        } catch {
          // 回退通过本地开发服务器代理请求
          const resp = await fetch('/api/ai/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              providerType: activeCard.providerType,
              endpointUrl: activeCard.endpointUrl,
              modelName: activeCard.modelName,
              apiKey: chosenKey,
              messages: chatHistory,
            }),
          });
          const data = await resp.json();
          if (!resp.ok || !data.ok) {
            throw new Error(data.error || `HTTP ${resp.status}`);
          }
          replyText = data.reply || '';
        }
      } else {
        const resp = await fetch('/api/ai/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            providerType: activeCard.providerType,
            endpointUrl: activeCard.endpointUrl,
            modelName: activeCard.modelName,
            apiKey: chosenKey,
            messages: chatHistory,
          }),
        });

        const data = await resp.json();
        if (!resp.ok || !data.ok) {
          throw new Error(data.error || `HTTP ${resp.status}`);
        }
        replyText = data.reply || '';
      }

      // Parse structured dialogue JSON if present
      const jsonMatch = replyText.match(/\{\s*"appendDialogues"\s*:[\s\S]*?\}/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          if (Array.isArray(parsed.appendDialogues)) {
            parsed.appendDialogues.forEach(
              (d: { speaker?: string; text?: string }) => {
                if (d.speaker && d.text) {
                  onAppendDialogue(d.speaker, d.text);
                  appliedActions.push(`追加对白：${d.speaker}`);
                }
              }
            );
          }
        } catch {
          // ignore
        }
      }

      const maskedKey = chosenKey
        ? `Key #${keyIdx + 1} (${chosenKey.slice(0, 4)}***)`
        : 'Ollama 本地';

      setMessages((prev) => [
        ...prev,
        {
          id: `msg-reply-${Date.now()}`,
          role: 'assistant',
          content: replyText.replace(/\{\s*"appendDialogues"\s*:[\s\S]*?\}/, '').trim(),
          timestamp: new Date().toLocaleTimeString().slice(0, 5),
          appliedActions,
          modelCardTitle: activeCard.title,
          usedKeyBadge: maskedKey,
        },
      ]);
    } catch (err) {
      setLastError(
        `真实接口调用失败: ${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      setIsThinking(false);
    }
  };

  const downloadSpecFile = () => {
    const blob = new Blob([MOOVN_AI_SPEC_MARKDOWN], {
      type: 'text/markdown;charset=utf-8',
    });
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
      (hubSearch.trim() === '' ||
        m.name.toLowerCase().includes(hubSearch.toLowerCase()) ||
        m.description.toLowerCase().includes(hubSearch.toLowerCase()) ||
        m.tags.some((t) => t.toLowerCase().includes(hubSearch.toLowerCase())))
  );

  return (
    <div className="h-full flex flex-col bg-[#18181b] select-none overflow-hidden">
      {/* Hidden file input for importing local computer model files */}
      <input
        ref={localModelFileInputRef}
        type="file"
        accept=".gguf,.onnx,.safetensors,.bin,.pt"
        onChange={handleLocalComputerModelImport}
        className="hidden"
      />

      {/* Top 4-Tab Bar */}
      <div className="h-8 px-2.5 border-b border-[#27272c] flex items-center justify-between bg-[#141417] shrink-0">
        <span className="text-xs font-medium text-zinc-200 truncate">
          AI 助手 · {activeCard.title}
        </span>

        <div className="flex items-center gap-0.5 bg-[#111114] p-0.5 rounded border border-[#27272c] text-[11px]">
          {(
            [
              ['chat', '对话'],
              ['cards', `模型卡(${cards.length})`],
              ['hub', '模型站'],
              ['spec', '规范'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setSubTab(id)}
              className={`px-2 py-0.5 rounded transition ${
                subTab === id
                  ? 'bg-[#27272c] text-zinc-100 font-medium'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Wllama WASM Local GGUF Model Status Bar */}
      {(wllamaStatus.loading ||
        wllamaStatus.loadedModelName ||
        activeCard.providerType === 'local_hub') && (
        <div className="px-3 py-1.5 bg-[#121318] border-b border-[#252730] flex items-center justify-between gap-2 text-[11px] shrink-0">
          <div className="flex items-center gap-1.5 min-w-0 truncate">
            <Cpu className="w-3.5 h-3.5 text-zinc-300 shrink-0" />
            {wllamaStatus.loading ? (
              <span className="text-zinc-200 truncate">
                正在载入本地 GGUF 权重 ({wllamaStatus.progress}%) ·{' '}
                {wllamaStatus.metaSummary}
              </span>
            ) : wllamaStatus.loadedModelName ? (
              <span className="text-zinc-200 truncate">
                已挂载 GGUF: <strong>{wllamaStatus.loadedModelName}</strong> (
                {wllamaStatus.metaSummary})
              </span>
            ) : (
              <span className="text-zinc-400 truncate">
                当前未挂载本地 .gguf 模型文件至内存
              </span>
            )}
          </div>
          <button
            onClick={() => localModelFileInputRef.current?.click()}
            className="px-2 py-0.5 rounded bg-[#22232b] hover:bg-[#2c2e38] border border-[#343642] text-zinc-100 text-[10px] shrink-0 transition"
          >
            选择 .gguf 文件
          </button>
        </div>
      )}

      {/* ==================== TAB 2: MULTI-MODEL CARDS & MULTI-KEY ROTATION ==================== */}
      {subTab === 'cards' && (
        <div className="flex-1 overflow-y-auto p-3 space-y-3 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-1.5">
            <span className="text-[11px] text-zinc-400">
              多模型卡片管理（单卡支持多个 API Key 轮流调用）
            </span>
            <div className="flex flex-wrap gap-1">
              <button
                onClick={() => handleAddModelCard('google_studio')}
                className="px-2 py-1 rounded bg-[#1c1c20] hover:bg-[#27272c] border border-[#27272c] text-zinc-200 text-[11px] flex items-center gap-1"
              >
                <Plus className="w-3 h-3" strokeWidth={1.6} />
                Google Studio
              </button>
              <button
                onClick={() => handleAddModelCard('openai_compatible')}
                className="px-2 py-1 rounded bg-[#1c1c20] hover:bg-[#27272c] border border-[#27272c] text-zinc-200 text-[11px] flex items-center gap-1"
              >
                <Plus className="w-3 h-3" strokeWidth={1.6} />
                OpenAI/DeepSeek
              </button>
              <button
                onClick={() => handleAddModelCard('ollama_local')}
                className="px-2 py-1 rounded bg-[#1c1c20] hover:bg-[#27272c] border border-[#27272c] text-zinc-200 text-[11px] flex items-center gap-1"
              >
                <Plus className="w-3 h-3" strokeWidth={1.6} />
                Ollama
              </button>
              <button
                onClick={() => localModelFileInputRef.current?.click()}
                className="px-2 py-1 rounded bg-[#1c1c20] hover:bg-[#27272c] border border-[#27272c] text-zinc-200 text-[11px] flex items-center gap-1"
              >
                <FolderOpen className="w-3 h-3" strokeWidth={1.6} />
                导入电脑模型
              </button>
            </div>
          </div>

          <div className="space-y-2.5">
            {cards.map((card) => {
              const isSelected = card.id === activeCard.id;
              const isLocal = card.providerType === 'local_hub';
              const newKeyVal = newKeyInputs[card.id] || '';

              return (
                <div
                  key={card.id}
                  onClick={() => setSelectedCardId(card.id)}
                  className={`p-3 rounded-lg border transition cursor-pointer space-y-2.5 ${
                    isSelected
                      ? 'bg-[#202026] border-zinc-400'
                      : 'bg-[#1a1a1f] border-[#27272c] hover:border-zinc-700'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span
                        className={`w-2 h-2 rounded-full shrink-0 ${
                          isSelected ? 'bg-zinc-100' : 'bg-zinc-600'
                        }`}
                      />
                      <input
                        type="text"
                        value={card.title}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) =>
                          updateCard(card.id, (c) => ({ ...c, title: e.target.value }))
                        }
                        className="flex-1 px-2 py-0.5 text-xs font-medium text-zinc-100"
                      />
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="px-1.5 py-0.5 rounded bg-[#141417] border border-[#27272c] text-[10px] font-mono text-zinc-400">
                        {card.providerType}
                      </span>
                      {cards.length > 1 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteCard(card.id);
                          }}
                          className="icon-btn !w-6 !h-6"
                          title="删除模型卡"
                        >
                          <Trash2 className="w-3 h-3" strokeWidth={1.6} />
                        </button>
                      )}
                    </div>
                  </div>

                  <div
                    className="grid grid-cols-2 gap-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div>
                      <div className="text-[10px] text-zinc-500 mb-0.5">模型名称</div>
                      <input
                        type="text"
                        value={card.modelName}
                        onChange={(e) =>
                          updateCard(card.id, (c) => ({
                            ...c,
                            modelName: e.target.value,
                          }))
                        }
                        className="w-full px-2 py-1 font-mono text-[11px]"
                      />
                    </div>
                    <div>
                      <div className="text-[10px] text-zinc-500 mb-0.5">
                        接口地址 / 本地路径
                      </div>
                      <input
                        type="text"
                        value={card.endpointUrl}
                        onChange={(e) =>
                          updateCard(card.id, (c) => ({
                            ...c,
                            endpointUrl: e.target.value,
                          }))
                        }
                        className="w-full px-2 py-1 font-mono text-[11px]"
                      />
                    </div>
                  </div>

                  {/* Multi-API Key Rotation Pool */}
                  {!isLocal ? (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="p-2 rounded bg-[#141417] border border-[#27272c] space-y-2"
                    >
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-zinc-400 flex items-center gap-1">
                          <Key className="w-3 h-3" strokeWidth={1.6} />
                          多 API Key 轮流调用池 ({card.apiKeys.length} 个 Key · 下次调用 #
                          {(card.activeKeyCursor % Math.max(1, card.apiKeys.length)) + 1})
                        </span>
                        <span className="text-zinc-500 font-mono">
                          已轮询 {card.totalCalls} 次
                        </span>
                      </div>

                      <div className="space-y-1">
                        {card.apiKeys.map((k, kIdx) => {
                          const isNext =
                            kIdx ===
                            card.activeKeyCursor % Math.max(1, card.apiKeys.length);
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
                                  updateCard(card.id, (c) => ({
                                    ...c,
                                    apiKeys: nextKeys,
                                  }));
                                }}
                                placeholder="输入真实 API Key..."
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
                        <HardDrive
                          className="w-3.5 h-3.5 text-zinc-400"
                          strokeWidth={1.6}
                        />
                        <span>
                          {card.localFileName || card.modelName} ({card.fileSizeMb || 980}{' '}
                          MB · {card.quantization || 'Q4_K_M'})
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

          {/* Hub Model List with Real Direct Download Links */}
          <div className="flex-1 overflow-y-auto space-y-2 pr-0.5">
            {filteredHubModels.map((item) => {
              const isRegistered = cards.some((c) => c.hubRepoId === item.repoId);

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
                      onClick={() => handleDownloadAndRegisterHubModel(item)}
                      className={`px-2.5 py-1 rounded text-[11px] font-medium flex items-center gap-1 shrink-0 transition ${
                        isRegistered
                          ? 'bg-zinc-800 text-zinc-200 border border-zinc-600'
                          : 'bg-zinc-200 hover:bg-white text-zinc-950'
                      }`}
                    >
                      {isRegistered ? (
                        <>
                          <Check className="w-3 h-3" strokeWidth={1.8} />
                          已挂载 · 重新打开直链
                        </>
                      ) : (
                        <>
                          <ExternalLink className="w-3 h-3" strokeWidth={1.6} />
                          真实直链下载并挂载
                        </>
                      )}
                    </button>
                  </div>

                  <div className="text-[11px] text-zinc-400 leading-relaxed">
                    {item.description}
                  </div>

                  <div className="flex flex-wrap gap-1 pt-0.5">
                    {item.tags.map((t) => (
                      <span
                        key={t}
                        className="px-1.5 py-0.5 rounded bg-[#141417] border border-[#27272c] text-[10px] text-zinc-400"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
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
              导出规范
            </button>
          </div>
          <pre className="flex-1 overflow-y-auto p-2.5 rounded-md bg-[#121215] border border-[#27272c] text-[11px] text-zinc-400 font-mono whitespace-pre-wrap leading-relaxed select-text">
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
                    {c.title} (
                    {c.apiKeys.length > 0 ? `${c.apiKeys.length} Keys 轮询` : '本地'})
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
                <div className="leading-relaxed whitespace-pre-wrap select-text">
                  {msg.content}
                </div>
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

            {lastError && (
              <div className="p-2.5 rounded-md bg-rose-500/10 border border-rose-500/30 text-rose-200 text-[11px] flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <div className="leading-relaxed">{lastError}</div>
              </div>
            )}
          </div>

          <div className="p-2.5 border-t border-[#27272c] bg-[#141417] space-y-2 shrink-0">
            <div className="flex flex-wrap gap-1">
              {[
                ['+重复循环C槽', '创建一个重复循环容器节点'],
                ['+如果/否则C槽', '创建一个如果条件容器节点'],
                ['+流式预载', '创建一个流加载预载节点'],
                ['+屏幕字', '创建一个屏幕文字节点'],
                ['续写对白', '请为当前节点续写一段星野雪奈与苍真的钟塔剧情对白'],
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
                placeholder={`节点 (${
                  project.nodes.find((n) => n.id === selectedNodeId)?.title ||
                  selectedNodeId
                }) 指令或剧情续写请求...`}
                className="flex-1 px-2.5 py-1.5 text-xs"
              />
              <button
                onClick={handleSend}
                disabled={isThinking || !promptInput.trim()}
                className="icon-btn w-8 h-8 bg-zinc-200 hover:bg-white disabled:opacity-40 text-zinc-950"
                title="发送"
              >
                {isThinking ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" strokeWidth={1.6} />
                ) : (
                  <Send className="w-3.5 h-3.5" strokeWidth={1.6} />
                )}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
