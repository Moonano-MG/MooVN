import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  X,
  Volume2,
  VolumeX,
  FolderOpen,
  Save,
  Home,
  Sliders,
  Bug,
  Timer,
  BookOpen,
  Layers,
} from 'lucide-react';
import { VNProject, SaveTabId, SaveSlotData } from '../types';
import { getBackgroundById, getCharacterById, getAudioById } from '../data/assets';
import { soundEngine } from '../lib/soundEngine';
import {
  DEFAULT_PERFORMANCE_CONFIG,
  SceneStreamMemoryManager,
  StreamedSceneEntry,
  applyChapterMinimumCharacterStats,
  parseAndDecompressMsvnPackage,
} from '../lib/assetCompressionEngine';
import { CharacterMediaRenderer } from './CharacterMediaRenderer';

interface PreviewPlayerProps {
  project: VNProject;
  initialNodeId?: string;
  onClose: () => void;
}

const SAVE_TABS: { id: SaveTabId; label: string }[] = [
  { id: 'auto', label: 'Auto' },
  { id: 'quick', label: '快速' },
  { id: '1', label: '1' },
  { id: '2', label: '2' },
  { id: '3', label: '3' },
  { id: '4', label: '4' },
  { id: '5', label: '5' },
  { id: '6', label: '6' },
  { id: '7', label: '7' },
  { id: '8', label: '8' },
  { id: '9', label: '9' },
  { id: '0', label: '0' },
];

export const PreviewPlayer: React.FC<PreviewPlayerProps> = ({
  project,
  initialNodeId,
  onClose,
}) => {
  const [screenMode, setScreenMode] = useState<'main_menu' | 'playing'>(
    initialNodeId ? 'playing' : 'main_menu'
  );
  const [currentNodeId, setCurrentNodeId] = useState<string>(
    initialNodeId || project.startNodeId
  );
  const [dialogueIndex, setDialogueIndex] = useState<number>(0);

  const [affectionMap, setAffectionMap] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    project.characters.forEach((c) => {
      init[c.id] = c.initialAffection;
    });
    return init;
  });

  const [customAttrMap, setCustomAttrMap] = useState<
    Record<string, Record<string, number | string | boolean>>
  >(() => {
    const init: Record<string, Record<string, number | string | boolean>> = {};
    project.characters.forEach((c) => {
      init[c.id] = {};
      c.customAttributes.forEach((attr) => {
        init[c.id][attr.key] = attr.value;
      });
    });
    return init;
  });

  const [variablesMap, setVariablesMap] = useState<Record<string, number | string | boolean>>(
    () => {
      const init: Record<string, number | string | boolean> = {};
      project.variables.forEach((v) => {
        init[v.key] = v.value;
      });
      return init;
    }
  );

  const [unlockedClues, setUnlockedClues] = useState<{ title: string; desc: string }[]>([]);
  const [showClueDrawer, setShowClueDrawer] = useState(false);

  const [typedText, setTypedText] = useState<string>('');
  const [isTyping, setIsTyping] = useState<boolean>(false);
  const [isAutoPlay, setIsAutoPlay] = useState<boolean>(false);
  const [isSkipMode, setIsSkipMode] = useState<boolean>(false);
  const [isUiHidden, setIsUiHidden] = useState<boolean>(false);
  const [hideHintPhase, setHideHintPhase] = useState<'hidden' | 'fading_in' | 'fading_out'>(
    'hidden'
  );
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [textSpeedMs, setTextSpeedMs] = useState<number>(24);
  const [historyStack, setHistoryStack] = useState<
    { nodeId: string; dialogueIndex: number }[]
  >([]);

  const [showDevDebug, setShowDevDebug] = useState<boolean>(false);
  const [timedRemaining, setTimedRemaining] = useState<number | null>(null);

  const [modalMode, setModalMode] = useState<'none' | 'save' | 'load' | 'settings' | 'msvn'>('none');
  const [activeSaveTab, setActiveSaveTab] = useState<SaveTabId>('1');

  // 流加载、提前解压与旧场景内存卸载管理器
  const streamManagerRef = useRef(new SceneStreamMemoryManager());
  const [streamEntries, setStreamEntries] = useState<StreamedSceneEntry[]>([]);
  const [mountedChapterIds, setMountedChapterIds] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    project.chapters.forEach((ch) => {
      init[ch.id] = true;
    });
    return init;
  });
  const msvnFileInputRef = useRef<HTMLInputElement | null>(null);
  const lastVisitedChapterIdRef = useRef<string>('');
  const [saveSlots, setSaveSlots] = useState<Record<string, SaveSlotData>>(() => {
    try {
      const raw = localStorage.getItem(`moovn_saves_${project.id}`);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });

  const currentNode =
    project.nodes.find((n) => n.id === currentNodeId) || project.nodes[0];
  const currentChapter =
    project.chapters.find((c) => c.id === currentNode.chapterId) || project.chapters[0];
  const bg = getBackgroundById(currentNode.backgroundId);
  const bgm = getAudioById(currentNode.bgmId);
  const currentLine = currentNode.dialogues[dialogueIndex] || currentNode.dialogues[0];
  const ui = project.uiConfig;

  const persistSaveSlot = useCallback(
    (tabId: SaveTabId, slotIndex: number) => {
      if (!currentNode || !currentLine) return;
      const slotKey = `${tabId}-${slotIndex}`;
      const newSlot: SaveSlotData = {
        slotKey,
        tabId,
        slotIndex,
        savedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
        chapterTitle: currentChapter?.title || '第一章',
        nodeId: currentNode.id,
        nodeTitle: currentNode.title,
        dialogueIndex,
        speakerName: currentLine.speakerName,
        textPreview: currentLine.text,
        backgroundId: currentNode.backgroundId,
        affectionSnapshot: { ...affectionMap },
        customAttrSnapshot: JSON.parse(JSON.stringify(customAttrMap)),
        variablesSnapshot: { ...variablesMap },
      };
      setSaveSlots((prev) => {
        const next = { ...prev, [slotKey]: newSlot };
        try {
          localStorage.setItem(`moovn_saves_${project.id}`, JSON.stringify(next));
        } catch {
          // ignore
        }
        return next;
      });
    },
    [
      currentNode,
      currentLine,
      currentChapter,
      dialogueIndex,
      affectionMap,
      customAttrMap,
      variablesMap,
      project.id,
    ]
  );

  // Unlock clue automatically when visiting a clue_unlock node
  useEffect(() => {
    if (screenMode === 'playing' && currentNode?.unlockedClueTitle) {
      setUnlockedClues((prev) => {
        if (prev.some((c) => c.title === currentNode.unlockedClueTitle)) return prev;
        return [
          ...prev,
          {
            title: currentNode.unlockedClueTitle!,
            desc: currentNode.unlockedClueDesc || '',
          },
        ];
      });
    }
  }, [screenMode, currentNode?.id, currentNode?.unlockedClueTitle, currentNode?.unlockedClueDesc]);

  // 1) 场景流加载、提前解压 (1~20 场景) 与旧场景内存卸载 (1~20 场景)
  // 2) 进入新章节时自动检查并应用角色最低保底数值 (.msvn 跳章防错)
  // 3) 执行 game_settings_modify / stream_preload_hint / msvn_chapter_load 节点效果
  useEffect(() => {
    if (screenMode !== 'playing' || !currentNode) return;

    const perf = {
      ...(project.performanceConfig || DEFAULT_PERFORMANCE_CONFIG),
    };
    if (currentNode.settingsActionConfig?.preloadAheadScenes) {
      perf.preloadSceneDistance = currentNode.settingsActionConfig.preloadAheadScenes;
    }
    if (currentNode.settingsActionConfig?.unloadBehindScenes) {
      perf.unloadSceneDistance = currentNode.settingsActionConfig.unloadBehindScenes;
    }

    streamManagerRef.current.onEnterScene(
      currentNode.id,
      project.nodes,
      perf,
      (snap) => setStreamEntries(snap)
    );

    if (currentNode.customScript) {
      if (
        /moovn(?:\.save:|::save::)create/i.test(
          currentNode.customScript
        )
      ) {
        persistSaveSlot('auto', 0);
      }
    }

    if (currentNode.type === 'game_settings_modify' && currentNode.settingsActionConfig) {
      if (typeof currentNode.settingsActionConfig.textSpeedMs === 'number') {
        setTextSpeedMs(currentNode.settingsActionConfig.textSpeedMs);
      }
      if (currentNode.settingsActionConfig.openSettingsPanel) {
        setModalMode('settings');
      }
    }

    if (currentChapter && lastVisitedChapterIdRef.current !== currentChapter.id) {
      lastVisitedChapterIdRef.current = currentChapter.id;
      const { nextAffection, nextVariables, boostedLogs } =
        applyChapterMinimumCharacterStats(
          currentChapter,
          project.characters,
          affectionMap,
          variablesMap
        );
      if (boostedLogs.length > 0) {
        // 静默在后台校准最低数值，绝不在游戏内向玩家弹出任何补偿提示
        setAffectionMap(nextAffection);
        setVariablesMap(nextVariables);
      }
    }

    // 执行 math_operation / set_variable / repeat_loop 节点数值逻辑
    if (currentNode.type === 'math_operation' && currentNode.logicConfig) {
      const { targetVar, mathOp = '+=', operandValue = 1 } = currentNode.logicConfig;
      setVariablesMap((prev) => {
        const cur = Number(prev[targetVar] ?? 0);
        const val = Number(operandValue ?? 1);
        const nextVal =
          mathOp === '+='
            ? cur + val
            : mathOp === '-='
            ? cur - val
            : mathOp === '*='
            ? cur * val
            : mathOp === '/=' && val !== 0
            ? Math.floor(cur / val)
            : val;
        return { ...prev, [targetVar]: nextVal };
      });
    } else if (currentNode.type === 'set_variable' && currentNode.variableKey) {
      setVariablesMap((prev) => ({
        ...prev,
        [currentNode.variableKey!]: currentNode.variableValue ?? 1,
      }));
    }
  }, [screenMode, currentNode?.id]);

  // Timed choice countdown
  useEffect(() => {
    if (
      screenMode === 'playing' &&
      currentNode?.type === 'timed_choice' &&
      dialogueIndex === currentNode.dialogues.length - 1
    ) {
      setTimedRemaining(currentNode.timedChoiceSeconds || 12);
      const timer = setInterval(() => {
        setTimedRemaining((prev) => {
          if (prev === null) return null;
          if (prev <= 1) {
            clearInterval(timer);
            const fallback =
              currentNode.defaultTimeoutTargetId ||
              currentNode.choices[0]?.targetNodeId ||
              project.startNodeId;
            setCurrentNodeId(fallback);
            setDialogueIndex(0);
            return null;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    } else {
      setTimedRemaining(null);
    }
  }, [screenMode, currentNode, dialogueIndex, project.startNodeId]);

  // Auto-save
  useEffect(() => {
    if (screenMode === 'playing' && currentNode) {
      persistSaveSlot('auto', 1);
    }
  }, [currentNodeId, screenMode, currentNode, persistSaveSlot]);

  // Hide UI hint fade in once then fade out
  useEffect(() => {
    if (!isUiHidden) {
      setHideHintPhase('hidden');
      return;
    }
    setHideHintPhase('hidden');
    const tIn = setTimeout(() => setHideHintPhase('fading_in'), 550);
    const tOut = setTimeout(() => setHideHintPhase('fading_out'), 2600);
    return () => {
      clearTimeout(tIn);
      clearTimeout(tOut);
    };
  }, [isUiHidden]);

  // Play BGM
  useEffect(() => {
    if (screenMode === 'playing' && !isMuted && bgm) {
      soundEngine.playBgm(bgm);
    } else {
      soundEngine.stopBgm();
    }
    return () => {
      soundEngine.stopBgm();
    };
  }, [currentNode?.bgmId, isMuted, bgm, screenMode]);

  // Typewriter effect (skipped immediately in 快进 mode)
  useEffect(() => {
    if (screenMode !== 'playing' || !currentLine) return;
    const full = currentLine.text;

    if (isSkipMode) {
      setTypedText(full);
      setIsTyping(false);
      return;
    }

    setTypedText('');
    setIsTyping(true);
    let idx = 0;

    const timer = setInterval(() => {
      idx += 1;
      setTypedText(full.slice(0, idx));
      if (idx >= full.length) {
        clearInterval(timer);
        setIsTyping(false);
      }
    }, textSpeedMs);

    return () => clearInterval(timer);
  }, [currentNodeId, dialogueIndex, currentLine, screenMode, textSpeedMs, isSkipMode]);

  const evaluateCondition = useCallback((): string | null => {
    const rule = currentNode.conditionRule;
    if (!rule) return currentNode.nextNodeId;

    let leftValue: number | string | boolean = 0;
    if (rule.variableType === 'affection' && rule.characterId) {
      leftValue = affectionMap[rule.characterId] ?? 0;
    } else if (rule.variableType === 'custom_attr' && rule.characterId) {
      leftValue = customAttrMap[rule.characterId]?.[rule.attributeKey] ?? 0;
    } else {
      leftValue = variablesMap[rule.attributeKey] ?? 0;
    }

    const rightValue = rule.compareValue;
    let passed = false;
    switch (rule.operator) {
      case '>=':
        passed = Number(leftValue) >= Number(rightValue);
        break;
      case '<=':
        passed = Number(leftValue) <= Number(rightValue);
        break;
      case '>':
        passed = Number(leftValue) > Number(rightValue);
        break;
      case '<':
        passed = Number(leftValue) < Number(rightValue);
        break;
      case '==':
        passed = String(leftValue) === String(rightValue);
        break;
      case '!=':
        passed = String(leftValue) !== String(rightValue);
        break;
    }

    return passed ? rule.trueTargetNodeId : rule.falseTargetNodeId;
  }, [currentNode, affectionMap, customAttrMap, variablesMap]);

  const advance = useCallback(() => {
    if (isUiHidden || modalMode !== 'none') return;

    if (isTyping && !isSkipMode && currentLine) {
      setTypedText(currentLine.text);
      setIsTyping(false);
      return;
    }

    if (dialogueIndex < currentNode.dialogues.length - 1) {
      setHistoryStack((h) => [...h, { nodeId: currentNodeId, dialogueIndex }]);
      setDialogueIndex((i) => i + 1);
      return;
    }

    if (
      (currentNode.type === 'choice' ||
        currentNode.type === 'timed_choice' ||
        currentNode.type === 'switch_branch' ||
        currentNode.type === 'random_branch') &&
      currentNode.choices.length > 0
    ) {
      return;
    }

    if (currentNode.type === 'condition') {
      const targetId = evaluateCondition();
      if (targetId) {
        setHistoryStack((h) => [...h, { nodeId: currentNodeId, dialogueIndex }]);
        setCurrentNodeId(targetId);
        setDialogueIndex(0);
      }
      return;
    }

    if (currentNode.nextNodeId) {
      setHistoryStack((h) => [...h, { nodeId: currentNodeId, dialogueIndex }]);
      setCurrentNodeId(currentNode.nextNodeId);
      setDialogueIndex(0);
    }
  }, [
    isUiHidden,
    modalMode,
    isTyping,
    isSkipMode,
    currentLine,
    dialogueIndex,
    currentNode,
    currentNodeId,
    evaluateCondition,
  ]);

  // Auto-play / Skip-mode timer
  useEffect(() => {
    if (screenMode !== 'playing' || (!isAutoPlay && !isSkipMode) || isTyping) return;
    const isChoicePause =
      (currentNode.type === 'choice' || currentNode.type === 'timed_choice') &&
      dialogueIndex === currentNode.dialogues.length - 1;
    if (isChoicePause) return;

    const delay = isSkipMode ? 110 : 1650;
    const t = setTimeout(() => {
      advance();
    }, delay);
    return () => clearTimeout(t);
  }, [screenMode, isAutoPlay, isSkipMode, isTyping, advance, currentNode.type, dialogueIndex, currentNode.dialogues.length]);

  const stepBack = () => {
    if (historyStack.length === 0) return;
    const last = historyStack[historyStack.length - 1];
    setHistoryStack((h) => h.slice(0, -1));
    setCurrentNodeId(last.nodeId);
    setDialogueIndex(last.dialogueIndex);
  };

  const handleLoadSlot = (slot: SaveSlotData) => {
    setCurrentNodeId(slot.nodeId);
    setDialogueIndex(slot.dialogueIndex);
    setAffectionMap({ ...slot.affectionSnapshot });
    setCustomAttrMap(JSON.parse(JSON.stringify(slot.customAttrSnapshot)));
    setVariablesMap({ ...slot.variablesSnapshot });
    setModalMode('none');
    setScreenMode('playing');
  };

  const startNewGame = () => {
    setCurrentNodeId(project.startNodeId);
    setDialogueIndex(0);
    setHistoryStack([]);
    setScreenMode('playing');
  };

  const menuBg = getBackgroundById(ui.mainMenu.backgroundId);
  const menuHero = getCharacterById(ui.mainMenu.heroCharacterSpriteId);

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col select-none overflow-hidden">
      {/* Top Bar */}
      <div className="min-h-9 py-1 bg-[#18181b] border-b border-[#2b2b30] px-2.5 sm:px-4 flex flex-wrap items-center justify-between gap-1.5 text-xs text-slate-300 shrink-0">
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-3">
          <span className="font-semibold text-white truncate max-w-[120px] sm:max-w-none">
            {project.title}
          </span>
          {screenMode === 'playing' && (
            <>
              <button
                onClick={() => {
                  setActiveSaveTab('1');
                  setModalMode('save');
                }}
                className="flex items-center gap-1 px-2 py-0.5 rounded bg-[#252529] hover:bg-[#323238] text-slate-200 transition"
              >
                <Save className="w-3 h-3 text-sky-400" />
                存档
              </button>
              <button
                onClick={() => {
                  setActiveSaveTab('1');
                  setModalMode('load');
                }}
                className="flex items-center gap-1 px-2 py-0.5 rounded bg-[#252529] hover:bg-[#323238] text-slate-200 transition"
              >
                <FolderOpen className="w-3 h-3 text-amber-400" />
                读档
              </button>
              <button
                onClick={() => setShowClueDrawer((v) => !v)}
                className="flex items-center gap-1 px-2 py-0.5 rounded bg-[#252529] hover:bg-[#323238] text-slate-200 transition"
              >
                <BookOpen className="w-3 h-3 text-fuchsia-400" />
                <span className="hidden sm:inline">档案词条</span> ({unlockedClues.length})
              </button>
              <button
                onClick={() => setScreenMode('main_menu')}
                className="flex items-center gap-1 px-2 py-0.5 rounded bg-[#252529] hover:bg-[#323238] text-slate-200 transition"
              >
                <Home className="w-3 h-3" />
                主菜单
              </button>
            </>
          )}
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            onClick={() => setModalMode('msvn')}
            className="hidden sm:flex items-center gap-1 px-2 py-0.5 rounded bg-[#252529] hover:bg-[#323238] text-slate-200 border border-[#383840] transition"
            title="插件式章节包 (.msvn) 挂载与卸载"
          >
            <Layers className="w-3 h-3" />
            章节包 (.msvn)
          </button>

          <button
            onClick={() => setShowDevDebug((d) => !d)}
            className={`hidden sm:flex items-center gap-1 px-2 py-0.5 rounded border transition ${
              showDevDebug
                ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                : 'bg-[#252529] border-[#383840] text-slate-400 hover:text-white'
            }`}
            title="运行状态监控"
          >
            <Bug className="w-3 h-3" />
            状态监控
          </button>

          <button
            onClick={() => setIsMuted((m) => !m)}
            className="flex items-center gap-1 px-2 py-0.5 rounded bg-[#252529] hover:bg-[#323238]"
          >
            {isMuted ? (
              <VolumeX className="w-3.5 h-3.5 text-rose-400" />
            ) : (
              <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
            )}
          </button>

          <button
            onClick={onClose}
            className="flex items-center gap-1 px-2.5 py-0.5 rounded bg-rose-600/20 hover:bg-rose-600/35 text-rose-300 border border-rose-500/30 transition"
          >
            <X className="w-3.5 h-3.5" />
            返回
          </button>
        </div>
      </div>

      {/* Main Viewport */}
      <div
        onClick={() => {
          if (isUiHidden) {
            setIsUiHidden(false);
          }
        }}
        className="relative flex-1 w-full h-full overflow-hidden bg-[#040915]"
      >
        {/* ==================== 1. CUSTOMIZABLE MAIN MENU ==================== */}
        {screenMode === 'main_menu' && (
          <div
            className={`absolute inset-0 z-30 flex ${
              ui.mainMenu.layout === 'right_panel' ? 'flex-row-reverse' : 'flex-row'
            }`}
          >
            <div
              style={{ backgroundColor: ui.mainMenu.panelColor }}
              className="w-[62%] sm:w-[34%] sm:min-w-[300px] max-w-[440px] h-full flex flex-col justify-between px-5 py-8 sm:px-11 sm:py-14 relative z-20"
            >
              <div>
                <div
                  style={{ color: ui.mainMenu.accentColor }}
                  className="text-[11px] font-mono uppercase tracking-[0.24em] mb-3"
                >
                  {ui.mainMenu.subtitleText}
                </div>
                <h1
                  style={{ color: ui.mainMenu.titleColor }}
                  className="text-3xl font-extrabold tracking-tight leading-snug"
                >
                  {project.title}
                </h1>
                <p className="text-xs text-slate-400 mt-2">
                  全 {project.chapters.length} 章 · {project.characters.length} 名登场角色
                </p>
              </div>

              <div className="space-y-1.5 my-auto">
                {[
                  { label: '开始游戏', action: startNewGame },
                  {
                    label: '继续游戏',
                    action: () => {
                      const autoSlot = saveSlots['auto-1'];
                      if (autoSlot) handleLoadSlot(autoSlot);
                      else startNewGame();
                    },
                  },
                  {
                    label: '读取存档',
                    action: () => {
                      setActiveSaveTab('1');
                      setModalMode('load');
                    },
                  },
                  { label: '游戏设置', action: () => setModalMode('settings') },
                  { label: '退出游戏', action: onClose },
                ].map((item, idx) => (
                  <button
                    key={idx}
                    onClick={item.action}
                    className="w-full text-left py-3 px-4 text-lg font-semibold text-slate-200 hover:text-white border-l-[3px] border-transparent hover:border-sky-400 hover:bg-gradient-to-r hover:from-sky-500/20 hover:to-transparent hover:pl-6 transition-all duration-200 tracking-wider"
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              <div className="text-[11px] text-slate-400 font-mono">
                Version {project.version} · {project.author}
              </div>
            </div>

            {/* Blur Bridge (Responsive flex separator so it never covers title or character) */}
            <div
              style={{
                background:
                  ui.mainMenu.layout === 'right_panel'
                    ? `linear-gradient(270deg, ${ui.mainMenu.panelColor} 0%, ${ui.mainMenu.panelColor}cc 45%, transparent 100%)`
                    : `linear-gradient(90deg, ${ui.mainMenu.panelColor} 0%, ${ui.mainMenu.panelColor}cc 45%, transparent 100%)`,
              }}
              className="w-12 sm:w-24 shrink-0 -mx-6 sm:-mx-12 z-10 pointer-events-none backdrop-blur-md"
            />

            {/* Key Visual */}
            <div className="flex-1 h-full relative overflow-hidden">
              <div
                className="absolute inset-0 bg-cover bg-center scale-105"
                style={{ backgroundImage: `url(${menuBg.path})` }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#040c1f]/75 via-transparent to-[#040c1f]/30" />
              {ui.mainMenu.showHeroCharacter && (
                <img
                  src={menuHero.path}
                  alt={menuHero.name}
                  className="absolute bottom-0 right-[14%] h-[90%] w-auto object-contain drop-shadow-[0_20px_50px_rgba(0,0,0,0.75)] pointer-events-none"
                />
              )}
            </div>
          </div>
        )}

        {/* ==================== 2. IN-GAME STAGE ==================== */}
        {screenMode === 'playing' && (
          <>
            {/* Background Layer */}
            <div
              key={`bg-${currentNode.id}-${currentNode.cameraConfig?.shakeIntensity || 'none'}`}
              className={`absolute inset-0 bg-cover bg-center transition-all duration-700 ${
                currentNode.cameraConfig?.shakeIntensity === 'heavy'
                  ? 'moovn-shake-heavy'
                  : currentNode.cameraConfig?.shakeIntensity === 'medium'
                  ? 'moovn-shake-medium'
                  : currentNode.cameraConfig?.shakeIntensity === 'light'
                  ? 'moovn-shake-light'
                  : ''
              }`}
              style={{
                backgroundImage: `url(${bg.path})`,
                filter:
                  currentNode.colorFilter === 'sepia'
                    ? 'sepia(0.75)'
                    : currentNode.colorFilter === 'grayscale'
                    ? 'grayscale(0.92)'
                    : currentNode.colorFilter === 'night_blue'
                    ? 'brightness(0.72) hue-rotate(195deg)'
                    : 'none',
                transform: currentNode.cameraConfig
                  ? `scale(${currentNode.cameraConfig.zoom || 1}) translate(${
                      currentNode.cameraConfig.offsetX || 0
                    }%, ${currentNode.cameraConfig.offsetY || 0}%)`
                  : 'none',
              }}
            />

            {/* Runtime State Overlay */}
            {showDevDebug && (
              <div className="absolute top-3 left-3 z-30 p-3 rounded-lg bg-slate-950/90 border border-amber-500/50 text-[11px] font-mono text-amber-200 space-y-1 shadow-xl pointer-events-none">
                <div className="font-bold text-amber-400">RUNTIME STATE</div>
                <div>Chapter: {currentChapter?.title}</div>
                <div>
                  Node: {currentNode.id} ({currentNode.type})
                </div>
                <div>
                  Line: {dialogueIndex + 1} / {currentNode.dialogues.length}
                </div>
                <div className="pt-1 border-t border-amber-500/20">
                  {project.characters.map((c) => (
                    <div key={c.id}>
                      • {c.name}: {affectionMap[c.id] ?? c.initialAffection}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Clue Drawer */}
            {showClueDrawer && (
              <div
                onClick={(e) => e.stopPropagation()}
                className="absolute top-3 right-3 z-35 w-80 rounded-xl bg-slate-950/95 border border-fuchsia-500/40 p-3.5 text-xs shadow-2xl space-y-2"
              >
                <div className="flex items-center justify-between font-bold text-fuchsia-300">
                  <span>已解锁推理档案 ({unlockedClues.length})</span>
                  <button onClick={() => setShowClueDrawer(false)}>
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                {unlockedClues.length === 0 ? (
                  <div className="text-slate-400 text-[11px]">尚未解锁档案词条</div>
                ) : (
                  unlockedClues.map((c, i) => (
                    <div
                      key={i}
                      className="p-2 rounded bg-fuchsia-950/25 border border-fuchsia-500/30"
                    >
                      <div className="font-semibold text-white">{c.title}</div>
                      <div className="text-[11px] text-slate-300 mt-0.5">{c.desc}</div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Toast Popup */}
            {currentNode.toastMessage && (
              <div className="absolute top-5 left-1/2 -translate-x-1/2 z-30 px-5 py-2 rounded-full bg-[#07142b]/95 border border-sky-400/60 text-xs font-bold text-sky-200 shadow-xl">
                {currentNode.toastMessage}
              </div>
            )}

            {/* Characters Layer (Supports Static Images, GIF/WebP Animations, and MP4/WebM Video Sprites!) */}
            <div className="absolute inset-0 pointer-events-none">
              {currentNode.characters.map((pl) => {
                const charProfile = project.characters.find((c) => c.id === pl.characterId);
                const activeSpriteId =
                  currentLine?.speakerId === pl.characterId && currentLine?.expressionSpriteId
                    ? currentLine.expressionSpriteId
                    : currentNode.type === 'char_expression' &&
                      currentNode.targetExpressionCharId === pl.characterId &&
                      currentNode.targetExpressionSpriteId
                    ? currentNode.targetExpressionSpriteId
                    : pl.spriteId;
                const sprite = getCharacterById(activeSpriteId);
                const mediaSrc = pl.mediaUrl || charProfile?.mediaUrl || sprite.path;
                const mediaType =
                  pl.mediaType || charProfile?.mediaType || sprite.mediaType || 'image';
                const idleMotion = pl.idleMotion || charProfile?.idleMotion || 'none';
                const chromaKeyColor = pl.chromaKeyColor || charProfile?.chromaKeyColor;
                const isSpeaking = currentLine?.speakerId === pl.characterId;

                return (
                  <div
                    key={pl.id}
                    style={{
                      left: `${pl.x}%`,
                      ...(pl.y > 70
                        ? {
                            bottom: `${Math.max(0, 100 - pl.y)}%`,
                            transformOrigin: 'bottom center',
                            transform: `translate(-50%, 0) scale(${
                              pl.scale * (isSpeaking ? 1.03 : 0.98)
                            }) ${pl.flipX ? 'scaleX(-1)' : ''}`,
                          }
                        : {
                            top: `${pl.y}%`,
                            transformOrigin: 'center center',
                            transform: `translate(-50%, -50%) scale(${
                              pl.scale * (isSpeaking ? 1.03 : 0.98)
                            }) ${pl.flipX ? 'scaleX(-1)' : ''}`,
                          }),
                      opacity: pl.opacity ?? 1,
                    }}
                    className={`absolute transition-all duration-300 ${
                      isSpeaking ? 'brightness-105 z-20' : 'brightness-90 z-10'
                    }`}
                  >
                    <CharacterMediaRenderer
                      mediaUrl={mediaSrc}
                      alt={pl.name}
                      layerTextures={pl.layerTextures || charProfile?.layerTextures}
                      mediaType={
                        mediaType === 'video' || mediaType === 'animated_image'
                          ? mediaType
                          : 'static'
                      }
                      videoLoop={pl.videoLoop ?? charProfile?.videoLoop ?? true}
                      videoPlaybackRate={
                        pl.videoPlaybackRate ?? charProfile?.videoPlaybackRate ?? 1
                      }
                      chromaKeyColor={chromaKeyColor}
                      idleMotion={idleMotion === 'breathe' ? 'breathe' : 'none'}
                      isTalking={isSpeaking && isTyping}
                      className="h-[76vh] w-auto object-contain drop-shadow-[0_20px_40px_rgba(0,0,0,0.72)]"
                    />
                  </div>
                );
              })}
            </div>

            {/* Screen Text / Chapter Banner / Cinematic Subtitle Layer */}
            {currentNode.screenTextConfig && (
              <div
                style={{
                  backgroundColor:
                    currentNode.screenTextConfig.bgOverlay === 'dim'
                      ? 'rgba(2, 6, 23, 0.65)'
                      : currentNode.screenTextConfig.bgOverlay === 'black'
                      ? '#020617'
                      : 'transparent',
                }}
                className="absolute inset-0 z-20 pointer-events-none"
              >
                {currentNode.screenTextConfig.bgOverlay === 'cinematic_bars' && (
                  <>
                    <div className="absolute top-0 left-0 right-0 h-[10vh] bg-black" />
                    <div className="absolute bottom-0 left-0 right-0 h-[10vh] bg-black" />
                  </>
                )}
                <div
                  style={{
                    left: `${currentNode.screenTextConfig.x}%`,
                    top: `${currentNode.screenTextConfig.y}%`,
                    transform: 'translate(-50%, -50%)',
                    textAlign: currentNode.screenTextConfig.align,
                  }}
                  className="absolute w-[84%] max-w-4xl"
                >
                  <div
                    style={{
                      fontSize: `${currentNode.screenTextConfig.fontSize}px`,
                      color: currentNode.screenTextConfig.color,
                    }}
                    className="font-extrabold tracking-wide drop-shadow-[0_6px_24px_rgba(0,0,0,0.92)] whitespace-pre-wrap leading-snug"
                  >
                    {currentNode.screenTextConfig.text}
                  </div>
                  {currentNode.screenTextConfig.subText && (
                    <div className="text-xs font-mono tracking-[0.28em] text-slate-300 mt-3 uppercase">
                      {currentNode.screenTextConfig.subText}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Choice Overlay (Single-line unless exceeding screen width + Timed Countdown Bar) */}
            {!isUiHidden &&
              (currentNode.type === 'choice' ||
                currentNode.type === 'timed_choice' ||
                currentNode.type === 'switch_branch') &&
              dialogueIndex === currentNode.dialogues.length - 1 &&
              currentNode.choices.length > 0 && (
                <div
                  style={{
                    left:
                      ui.choiceBox.position === 'screen_center'
                        ? '50%'
                        : `calc((100% - ${ui.dialogueBox.widthPercent}%) / 2)`,
                    transform:
                      ui.choiceBox.position === 'screen_center'
                        ? 'translate(-50%, -50%)'
                        : 'none',
                    top: ui.choiceBox.position === 'screen_center' ? '45%' : 'auto',
                    bottom:
                      ui.choiceBox.position === 'screen_center'
                        ? 'auto'
                        : `${ui.dialogueBox.bottomOffset + ui.dialogueBox.heightPx + 18}px`,
                  }}
                  className="absolute z-30 flex flex-col items-start gap-2.5 max-w-[92vw]"
                >
                  {timedRemaining !== null && (
                    <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-orange-950/90 border border-orange-400 text-orange-200 text-xs font-bold shadow-lg">
                      <Timer className="w-3.5 h-3.5 animate-spin" />
                      <span>限时抉择剩余：{timedRemaining} 秒</span>
                    </div>
                  )}
                  {currentNode.choices.map((choice) => (
                    <button
                      key={choice.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (choice.affectionCharacterId && choice.affectionDelta) {
                          setAffectionMap((prev) => ({
                            ...prev,
                            [choice.affectionCharacterId!]:
                              (prev[choice.affectionCharacterId!] || 0) +
                              choice.affectionDelta!,
                          }));
                        }
                        if (choice.setVarKey !== undefined && choice.setVarValue !== undefined) {
                          setVariablesMap((prev) => ({
                            ...prev,
                            [choice.setVarKey!]: choice.setVarValue!,
                          }));
                        }
                        setHistoryStack((h) => [...h, { nodeId: currentNodeId, dialogueIndex }]);
                        setCurrentNodeId(choice.targetNodeId);
                        setDialogueIndex(0);
                      }}
                      style={{
                        backgroundColor: ui.choiceBox.bgColor,
                        borderColor: ui.choiceBox.borderColor,
                        color: ui.choiceBox.textColor,
                        fontSize: `${ui.choiceBox.fontSize}px`,
                        borderRadius: `${ui.choiceBox.borderRadius}px`,
                      }}
                      className="group relative pl-6 pr-6 py-2.5 border backdrop-blur-md text-left font-medium transition-all duration-200 shadow-[0_10px_28px_rgba(0,0,0,0.6)] hover:translate-x-1 whitespace-normal break-words h-auto max-w-[92vw] leading-relaxed"
                    >
                      <span
                        style={{ backgroundColor: ui.choiceBox.hoverAccentColor }}
                        className="absolute left-0 top-0 bottom-0 w-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      />
                      <span>{choice.text}</span>
                    </button>
                  ))}
                </div>
              )}

            {/* Ending Banner */}
            {!isUiHidden &&
              currentNode.type === 'end' &&
              dialogueIndex === currentNode.dialogues.length - 1 && (
                <div className="absolute inset-x-0 top-14 z-30 flex justify-center pointer-events-none">
                  <div className="px-10 py-6 rounded-2xl bg-[#071630]/92 border border-sky-400/50 backdrop-blur-xl text-center shadow-2xl pointer-events-auto">
                    <div className="text-xs font-mono uppercase tracking-[0.25em] text-sky-400 mb-1">
                      {currentNode.endingType?.toUpperCase()} ENDING UNLOCKED
                    </div>
                    <div className="text-2xl font-bold text-white mb-4">
                      {currentNode.endingTitle || currentNode.title}
                    </div>
                    <button
                      onClick={startNewGame}
                      className="px-6 py-2 rounded-lg bg-[#007acc] hover:bg-[#1f8ad2] text-white text-xs font-bold transition"
                    >
                      重新开始轮回
                    </button>
                  </div>
                </div>
              )}

            {/* Customizable Bottom Dialogue Box */}
            {!isUiHidden && (
              <div
                style={{
                  bottom: `${ui.dialogueBox.bottomOffset}px`,
                  width: `${ui.dialogueBox.widthPercent}%`,
                }}
                className="absolute left-1/2 -translate-x-1/2 max-w-[1180px] z-20"
              >
                <div
                  onClick={advance}
                  style={{
                    minHeight: `${ui.dialogueBox.heightPx}px`,
                    padding: `${ui.dialogueBox.paddingPx}px ${
                      ui.dialogueBox.paddingPx + 6
                    }px 48px ${ui.dialogueBox.paddingPx + 6}px`,
                    backgroundColor: ui.dialogueBox.bgColor,
                    opacity: ui.dialogueBox.bgOpacity,
                    borderColor: ui.dialogueBox.borderColor,
                    borderWidth: `${ui.dialogueBox.borderWidth}px`,
                    borderStyle: 'solid',
                    borderRadius: `${ui.dialogueBox.borderRadius}px`,
                  }}
                  className="relative backdrop-blur-xl shadow-[0_20px_50px_rgba(0,0,0,0.75)] cursor-pointer flex flex-col justify-between"
                >
                  <div>
                    {currentLine && (
                      <div
                        style={{
                          fontSize: `${ui.dialogueBox.speakerFontSize}px`,
                          color: currentLine.speakerColor || '#38bdf8',
                        }}
                        className="font-bold tracking-wide mb-2"
                      >
                        {currentLine.speakerName}
                      </div>
                    )}
                    <p
                      style={{
                        fontSize: `${ui.dialogueBox.textFontSize}px`,
                        color: ui.dialogueBox.textColor,
                        lineHeight: ui.dialogueBox.lineHeight,
                      }}
                      className="tracking-wide whitespace-pre-wrap"
                    >
                      {typedText}
                      {isTyping && (
                        <span className="inline-block w-1.5 h-5 bg-sky-400 ml-1 animate-pulse align-middle" />
                      )}
                    </p>
                  </div>

                  {/* Bottom-Right Controls */}
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className={`absolute bottom-3 ${
                      ui.dialogueBox.controlPosition === 'bottom_center'
                        ? 'left-1/2 -translate-x-1/2'
                        : 'right-5'
                    } flex items-center gap-2`}
                  >
                    {ui.dialogueBox.visibleControls.back && (
                      <button
                        onClick={stepBack}
                        disabled={historyStack.length === 0}
                        className="px-3 py-1 rounded bg-[#0f2246]/80 hover:bg-[#163263] disabled:opacity-35 border border-sky-400/25 text-xs text-slate-200 transition"
                      >
                        后退
                      </button>
                    )}
                    {ui.dialogueBox.visibleControls.auto && (
                      <button
                        onClick={() => setIsAutoPlay((a) => !a)}
                        className={`px-3 py-1 rounded border text-xs transition ${
                          isAutoPlay
                            ? 'bg-sky-500/30 border-sky-400 text-white'
                            : 'bg-[#0f2246]/80 hover:bg-[#163263] border-sky-400/25 text-slate-200'
                        }`}
                      >
                        自动
                      </button>
                    )}
                    {ui.dialogueBox.visibleControls.skip && (
                      <button
                        onClick={() => setIsSkipMode((s) => !s)}
                        className={`px-3 py-1 rounded border text-xs transition ${
                          isSkipMode
                            ? 'bg-amber-500/30 border-amber-400 text-white'
                            : 'bg-[#0f2246]/80 hover:bg-[#163263] border-sky-400/25 text-slate-200'
                        }`}
                      >
                        快进
                      </button>
                    )}
                    {ui.dialogueBox.visibleControls.hide && (
                      <button
                        onClick={() => setIsUiHidden(true)}
                        className="px-3 py-1 rounded bg-[#0f2246]/80 hover:bg-[#163263] border border-sky-400/25 text-xs text-slate-200 transition"
                      >
                        隐藏
                      </button>
                    )}
                    {ui.dialogueBox.visibleControls.settings && (
                      <button
                        onClick={() => setModalMode('settings')}
                        className="px-3 py-1 rounded bg-[#0f2246]/80 hover:bg-[#163263] border border-sky-400/25 text-xs text-slate-200 transition"
                      >
                        设置
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* UI Hidden Hint: slowly fades in once after delay, then fades out */}
            {isUiHidden && (
              <div
                className={`absolute bottom-7 left-1/2 -translate-x-1/2 px-5 py-2 rounded-full bg-[#071630]/85 border border-sky-400/30 text-xs text-slate-200 pointer-events-none transition-opacity duration-700 ${
                  hideHintPhase === 'fading_in' ? 'opacity-100' : 'opacity-0'
                }`}
              >
                点击屏幕任意位置恢复界面
              </div>
            )}
          </>
        )}

        {/* ==================== 3. SAVE / LOAD FOLDER TABS MODAL ==================== */}
        {(modalMode === 'save' || modalMode === 'load') && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute inset-0 z-40 bg-[#030917]/90 backdrop-blur-xl flex flex-col p-8"
          >
            <div className="max-w-5xl w-full mx-auto flex-1 flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-2xl font-bold text-white tracking-wider">
                    {modalMode === 'save' ? '保存进度 (SAVE)' : '读取进度 (LOAD)'}
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">请选择存档分类页签与对应槽位</p>
                </div>
                <button
                  onClick={() => setModalMode('none')}
                  className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 border border-slate-700"
                >
                  关闭
                </button>
              </div>

              <div className="flex items-end gap-1 border-b border-sky-500/30 px-2">
                {SAVE_TABS.map((tab) => {
                  const active = activeSaveTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveSaveTab(tab.id)}
                      className={`px-4 py-2 rounded-t-lg text-xs font-bold tracking-wider transition-all border-t border-l border-r ${
                        active
                          ? 'bg-[#0c234a] text-sky-300 border-sky-400/50 -mb-px pb-2.5'
                          : 'bg-[#07142b]/70 text-slate-400 border-slate-800 hover:text-slate-200'
                      }`}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              <div className="flex-1 bg-[#081733]/90 border border-t-0 border-sky-500/30 rounded-b-xl p-5 grid grid-cols-2 grid-rows-3 gap-4 overflow-y-auto">
                {[1, 2, 3, 4, 5, 6].map((slotIdx) => {
                  const slotKey = `${activeSaveTab}-${slotIdx}`;
                  const data = saveSlots[slotKey];
                  const slotBg = data ? getBackgroundById(data.backgroundId) : null;

                  return (
                    <div
                      key={slotKey}
                      onClick={() => {
                        if (modalMode === 'save') {
                          persistSaveSlot(activeSaveTab, slotIdx);
                        } else if (data) {
                          handleLoadSlot(data);
                        }
                      }}
                      className={`group relative rounded-xl border p-3.5 flex gap-4 transition cursor-pointer ${
                        data
                          ? 'bg-[#0c2147]/85 border-sky-400/35 hover:border-sky-300 hover:bg-[#102a58]'
                          : 'bg-[#061229]/60 border-slate-800 hover:border-sky-500/40'
                      }`}
                    >
                      <div className="w-36 h-full rounded-lg overflow-hidden bg-slate-950 border border-slate-800 shrink-0 relative">
                        {slotBg ? (
                          <img
                            src={slotBg.path}
                            alt={data.nodeTitle}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-[11px] text-slate-600 font-mono">
                            NO DATA
                          </div>
                        )}
                        <div className="absolute top-1.5 left-1.5 px-2 py-0.5 rounded bg-black/75 text-[10px] font-mono text-sky-300">
                          {activeSaveTab.toUpperCase()} - 0{slotIdx}
                        </div>
                      </div>

                      <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
                        {data ? (
                          <>
                            <div>
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-bold text-sky-300 truncate">
                                  {data.chapterTitle}
                                </span>
                                <span className="text-[10px] font-mono text-slate-400 shrink-0">
                                  {data.savedAt}
                                </span>
                              </div>
                              <div className="text-xs font-semibold text-white mt-0.5 truncate">
                                {data.nodeTitle}
                              </div>
                              <p className="text-[11px] text-slate-300 line-clamp-2 mt-1.5 leading-relaxed">
                                「{data.textPreview}」
                              </p>
                            </div>
                          </>
                        ) : (
                          <div className="my-auto text-xs text-slate-500">
                            {modalMode === 'save'
                              ? '点击将当前游戏进度保存至此槽位'
                              : '空白存档槽位'}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ==================== 4. SETTINGS MODAL ==================== */}
        {modalMode === 'settings' && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute inset-0 z-40 bg-[#030917]/85 backdrop-blur-xl flex items-center justify-center p-6"
          >
            <div className="w-full max-w-md rounded-xl bg-[#091b3a] border border-sky-400/40 p-6 space-y-5 shadow-2xl">
              <div className="flex items-center justify-between border-b border-sky-500/20 pb-3">
                <div className="flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-sky-400" />
                  <h3 className="text-base font-bold text-white">游戏环境设置</h3>
                </div>
                <button
                  onClick={() => setModalMode('none')}
                  className="text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-4 text-xs">
                <div>
                  <div className="flex justify-between text-slate-300 mb-1">
                    <span>文字显示速度</span>
                    <span className="font-mono text-sky-300">{textSpeedMs} ms/字</span>
                  </div>
                  <input
                    type="range"
                    min={10}
                    max={60}
                    step={2}
                    value={textSpeedMs}
                    onChange={(e) => setTextSpeedMs(Number(e.target.value))}
                    className="w-full accent-sky-400"
                  />
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-sky-500/20">
                  <span className="text-slate-300">背景音乐与音效</span>
                  <button
                    onClick={() => setIsMuted((m) => !m)}
                    className="px-3 py-1 rounded bg-sky-500/20 border border-sky-400/40 text-sky-200"
                  >
                    {isMuted ? '已静音' : '正常播放'}
                  </button>
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  onClick={() => setModalMode('none')}
                  className="px-5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold"
                >
                  确定
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ==================== 5. MSVN MODULAR CHAPTER PACKAGE MANAGER MODAL ==================== */}
        {modalMode === 'msvn' && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute inset-0 z-40 bg-black/80 backdrop-blur-md flex items-center justify-center p-6"
          >
            <input
              ref={msvnFileInputRef}
              type="file"
              accept=".msvn,.json"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                  const text = await file.text();
                  const { pkg } = await parseAndDecompressMsvnPackage(text);
                  setMountedChapterIds((prev) => ({
                    ...prev,
                    [pkg.chapter.id]: true,
                  }));
                  const { nextAffection, nextVariables } =
                    applyChapterMinimumCharacterStats(
                      pkg.chapter,
                      project.characters,
                      affectionMap,
                      variablesMap
                    );
                  setAffectionMap(nextAffection);
                  setVariablesMap(nextVariables);
                } catch {
                  // ignore invalid msvn file
                }
                e.target.value = '';
              }}
            />
            <div className="w-full max-w-2xl rounded-xl bg-[#161619] border border-[#27272c] p-5 space-y-4 shadow-2xl text-xs">
              <div className="flex items-center justify-between border-b border-[#27272c] pb-3">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-zinc-200" />
                  <h3 className="text-sm font-semibold text-white">
                    插件式章节更新管理 (.msvn 按需加载与旧章卸载)
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => msvnFileInputRef.current?.click()}
                    className="px-2.5 py-1 rounded bg-[#222228] hover:bg-[#2c2c34] border border-[#2e2e36] text-zinc-200 text-[11px]"
                  >
                    导入本地 .msvn
                  </button>
                  <button
                    onClick={() => setModalMode('none')}
                    className="text-zinc-400 hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="text-[11px] text-zinc-400 leading-relaxed">
                第一章为基础必装章节（不可卸载）。后续章节可单独挂载游玩，玩完后卸载上一章释放磁盘与内存；若跳过中间章节直接游玩后续章节，系统将自动按该章节设定的「角色最低数值」补齐好感度。
              </div>

              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {project.chapters.map((ch, idx) => {
                  const isFirst = idx === 0;
                  const isMounted = isFirst || !!mountedChapterIds[ch.id];
                  const firstNodeOfChapter = project.nodes.find((n) => n.chapterId === ch.id);

                  return (
                    <div
                      key={ch.id}
                      className="p-3 rounded-lg bg-[#1c1c20] border border-[#27272c] flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-zinc-100">{ch.title}</span>
                          {isFirst ? (
                            <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px]">
                              必装基础包
                            </span>
                          ) : isMounted ? (
                            <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 text-[10px]">
                              已挂载
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500 text-[10px]">
                              已卸载 (省空间)
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-zinc-400 flex flex-wrap gap-2 font-mono">
                          {project.characters.slice(0, 4).map((c) => (
                            <span key={c.id}>
                              {c.name.split(' ')[0]}保底≥
                              {ch.minCharacterAffection?.[c.id] ?? c.initialAffection + idx * 8}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {!isFirst && (
                          <button
                            onClick={() =>
                              setMountedChapterIds((prev) => ({
                                ...prev,
                                [ch.id]: !isMounted,
                              }))
                            }
                            className={`px-2.5 py-1 rounded text-[11px] border transition ${
                              isMounted
                                ? 'bg-[#141417] border-[#27272c] text-zinc-400 hover:text-rose-300'
                                : 'bg-zinc-200 text-zinc-950 border-zinc-200 font-medium'
                            }`}
                          >
                            {isMounted ? '卸载本章' : '下载挂载 .msvn'}
                          </button>
                        )}

                        {isMounted && firstNodeOfChapter && (
                          <button
                            onClick={() => {
                              const { nextAffection, nextVariables } =
                                applyChapterMinimumCharacterStats(
                                  ch,
                                  project.characters,
                                  affectionMap,
                                  variablesMap
                                );
                              setAffectionMap(nextAffection);
                              setVariablesMap(nextVariables);
                              setCurrentNodeId(firstNodeOfChapter.id);
                              setDialogueIndex(0);
                              setScreenMode('playing');
                              setModalMode('none');
                            }}
                            className="px-2.5 py-1 rounded bg-[#27272c] hover:bg-zinc-700 text-zinc-100 text-[11px]"
                          >
                            直接游玩本章
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Streaming & Memory Unload Status HUD (shown when Developer Debug is active) */}
        {showDevDebug && streamEntries.length > 0 && (
          <div className="absolute bottom-3 left-3 z-30 px-3 py-2 rounded-lg bg-black/80 border border-zinc-700 text-[10px] font-mono text-zinc-300 pointer-events-none space-y-0.5">
            <div>
              流加载与内存管理 ({(project.performanceConfig || DEFAULT_PERFORMANCE_CONFIG).compressionFormat.toUpperCase()} Lv.{(project.performanceConfig || DEFAULT_PERFORMANCE_CONFIG).compressionLevel})
            </div>
            <div>
              已预载解压: {streamEntries.filter((e) => e.status !== 'unloaded').length} 场景 · 已卸载释放: {streamEntries.filter((e) => e.status === 'unloaded').length} 场景 · PNG免二次压缩: {streamEntries.reduce((s, e) => s + e.skippedPngCount, 0)} 项
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
