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
} from 'lucide-react';
import { VNProject, SaveTabId, SaveSlotData } from '../types';
import { getBackgroundById, getCharacterById, getAudioById } from '../data/assets';
import { soundEngine } from '../lib/soundEngine';
import { CharacterMediaRenderer } from './CharacterMediaRenderer';
import { characterPlacementStyle } from '../lib/characterPlacement';
import { useReducedMotion } from '../lib/useReducedMotion';
import { getUnsupportedBranchIssue } from '../lib/branchSupport';
import {
  backPreview,
  createPreviewPlayback,
  enterPreviewNode,
  nextPreviewDialogue,
  restorePreviewSlot,
} from '../lib/previewState';
import { inspectPreviewSaves } from '../lib/previewSaves';

interface PreviewPlayerProps {
  project: VNProject;
  initialNodeId?: string;
  motionLevel?: 'off' | 'subtle' | 'full';
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
  motionLevel = 'subtle',
  onClose,
}) => {
  const reducedMotion = useReducedMotion();
  const motionOff = motionLevel === 'off' || reducedMotion;
  const [screenMode, setScreenMode] = useState<'main_menu' | 'playing'>(
    initialNodeId ? 'playing' : 'main_menu'
  );
  const [playback, setPlayback] = useState(() =>
    createPreviewPlayback(project, initialNodeId || project.startNodeId, Boolean(initialNodeId))
  );
  const {
    nodeId: currentNodeId, dialogueIndex, affectionMap, customAttrMap, variablesMap,
    clues: unlockedClues, textSpeedMs, timedRemaining,
  } = playback.current;
  const historyStack = playback.history;
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

  const [showDevDebug, setShowDevDebug] = useState<boolean>(false);

  const [modalMode, setModalMode] = useState<'none' | 'save' | 'load' | 'settings'>('none');
  const [activeSaveTab, setActiveSaveTab] = useState<SaveTabId>('1');

  const [initialSaveState] = useState<{
    rawSlots: Record<string, unknown>; slots: Record<string, SaveSlotData>; invalidKeys: string[]; readError: string | null;
  }>(() => {
    try {
      const raw = localStorage.getItem(`moovn_saves_${project.id}`);
      const inspected = inspectPreviewSaves(raw === null ? {} : JSON.parse(raw));
      return { ...inspected, readError: null };
    } catch (error: unknown) {
      return {
        rawSlots: {}, slots: {}, invalidKeys: [],
        readError: `存档读取失败：${error instanceof Error ? error.message : String(error)}`,
      };
    }
  });
  const [saveSlots, setSaveSlots] = useState(initialSaveState.slots);
  const [saveError, setSaveError] = useState<string | null>(
    initialSaveState.readError || (initialSaveState.invalidKeys.length ? '部分存档槽损坏或版本不支持，已保留原数据。' : null)
  );
  const [pendingLegacySlot, setPendingLegacySlot] = useState<SaveSlotData | null>(null);
  // Opening a node preview must not immediately overwrite a previous auto-save
  // before the user has had a chance to continue or load it.
  const [autoSaveArmed, setAutoSaveArmed] = useState(
    !Object.prototype.hasOwnProperty.call(initialSaveState.rawSlots, 'auto-1')
  );
  const saveSlotsRef = useRef(initialSaveState.rawSlots);
  const invalidSlotKeys = useRef(new Set(initialSaveState.invalidKeys));
  const initialSaveReadFailed = useRef(Boolean(initialSaveState.readError));
  const appliedVisitRef = useRef<number | null>(null);

  const currentNode =
    project.nodes.find((n) => n.id === currentNodeId) || project.nodes[0];
  const branchIssue = getUnsupportedBranchIssue(currentNode);
  const currentChapter =
    project.chapters.find((c) => c.id === currentNode.chapterId) || project.chapters[0];
  const bg = getBackgroundById(currentNode.backgroundId);
  const bgm = currentNode.bgmId ? getAudioById(currentNode.bgmId) : null;
  const currentLine = currentNode.dialogues[dialogueIndex] || currentNode.dialogues[0];
  const ui = project.uiConfig;

  const persistSaveSlot = useCallback(
    (tabId: SaveTabId, slotIndex: number) => {
      if (branchIssue) {
        setSaveError('当前节点尚未执行，不能将其保存为有效进度。');
        return false;
      }
      if (!currentNode || !currentLine) {
        setSaveError('当前节点没有可保存的台词位置，原存档未覆盖。');
        return false;
      }
      if (initialSaveReadFailed.current) {
        setSaveError('存档读取失败，未覆盖原数据；请检查浏览器存储。');
        return false;
      }
      const slotKey = `${tabId}-${slotIndex}`;
      if (invalidSlotKeys.current.has(slotKey)) {
        setSaveError(`存档槽 ${slotKey} 损坏或版本不支持，未覆盖原数据。`);
        return false;
      }
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
        customAttrSnapshot: structuredClone(customAttrMap),
        variablesSnapshot: { ...variablesMap },
        unlockedClues: unlockedClues.map((clue) => clue.title),
        previewSnapshotVersion: 1,
        clueSnapshot: unlockedClues.map((clue) => ({ ...clue })),
        textSpeedSnapshot: textSpeedMs,
        timedRemainingSnapshot: timedRemaining,
      };
      if (inspectPreviewSaves({ [slotKey]: newSlot }).invalidKeys.length) {
        setSaveError('当前预览状态无法保存，原存档未覆盖；请检查变量和设置数值。');
        return false;
      }
      const next = { ...saveSlotsRef.current, [slotKey]: newSlot };
      try {
        localStorage.setItem(`moovn_saves_${project.id}`, JSON.stringify(next));
        saveSlotsRef.current = next;
        setSaveSlots((previous) => ({ ...previous, [slotKey]: newSlot }));
        setSaveError(invalidSlotKeys.current.size ? '部分存档槽损坏或版本不支持，已保留原数据。' : null);
        return true;
      } catch (error: unknown) {
        setSaveError(`存档写入失败：${error instanceof Error ? error.message : String(error)}`);
        return false;
      }
    },
    [
      currentNode,
      currentLine,
      currentChapter,
      dialogueIndex,
      affectionMap,
      customAttrMap,
      variablesMap,
      unlockedClues,
      textSpeedMs,
      timedRemaining,
      branchIssue,
      project.id,
    ]
  );

  // Numeric/clue/settings state is applied atomically on fresh entry by previewState.
  // Imperative actions must also run at most once per visit and never on restore.
  useEffect(() => {
    if (screenMode !== 'playing' || !currentNode || branchIssue || playback.entry !== 'fresh') return;
    if (appliedVisitRef.current === playback.visit) return;
    appliedVisitRef.current = playback.visit;

    if (currentNode.customScript && /moovn(?:\.save:|::save::)create/i.test(currentNode.customScript)) {
      persistSaveSlot('auto', 0);
    }
    if (currentNode.type === 'game_settings_modify' && currentNode.settingsActionConfig?.openSettingsPanel) {
      setModalMode('settings');
    }
  }, [screenMode, currentNode, branchIssue, playback.visit, playback.entry, persistSaveSlot]);

  // Pause autoplay/skip as soon as an unsupported branch is encountered.
  useEffect(() => {
    if (screenMode === 'playing' && branchIssue) {
      setIsAutoPlay(false);
      setIsSkipMode(false);
    }
  }, [screenMode, currentNodeId, branchIssue?.code]);

  // Countdown is part of the snapshot. A timeout is a normal, reversible transition.
  useEffect(() => {
    if (screenMode !== 'playing' || modalMode !== 'none' || branchIssue ||
        currentNode.type !== 'timed_choice' || timedRemaining === null) return;
    const visit = playback.visit;
    const timer = setTimeout(() => {
      if (timedRemaining <= 1) setAutoSaveArmed(true);
      setPlayback((previous) => {
        if (previous.visit !== visit || previous.current.timedRemaining === null) return previous;
        if (previous.current.timedRemaining <= 1) {
          const fallback = currentNode.defaultTimeoutTargetId || currentNode.choices[0]?.targetNodeId || project.startNodeId;
          return enterPreviewNode(previous, project, fallback);
        }
        return {
          ...previous,
          current: { ...previous.current, timedRemaining: previous.current.timedRemaining - 1 },
        };
      });
    }, 1000);
    return () => clearTimeout(timer);
  }, [screenMode, modalMode, branchIssue, currentNode, timedRemaining, playback.visit, project]);

  // Keep the last valid checkpoint when blocked, and do not erase an existing
  // auto-save merely by opening preview (or immediately after loading it).
  useEffect(() => {
    if (screenMode === 'playing' && currentNode && !branchIssue && autoSaveArmed) {
      persistSaveSlot('auto', 1);
    }
  }, [currentNodeId, screenMode, currentNode, persistSaveSlot, branchIssue?.code, autoSaveArmed]);

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
    if (screenMode === 'playing' && !branchIssue && !isMuted && bgm) {
      soundEngine.playBgm(bgm);
    } else {
      soundEngine.stopBgm();
    }
    return () => {
      soundEngine.stopBgm();
    };
  }, [currentNode?.bgmId, isMuted, bgm, screenMode, branchIssue?.code]);

  // Typewriter effect (skipped immediately in 快进 mode)
  useEffect(() => {
    if (screenMode !== 'playing' || !currentLine) return;
    const full = currentLine.text;

    if (isSkipMode || motionOff) {
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
  }, [currentNodeId, dialogueIndex, currentLine, screenMode, textSpeedMs, isSkipMode, motionOff]);

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

    if (branchIssue) return;

    if (dialogueIndex < currentNode.dialogues.length - 1) {
      setAutoSaveArmed(true);
      setPlayback((previous) => nextPreviewDialogue(previous, currentNode));
      return;
    }

    if (
      (currentNode.type === 'choice' || currentNode.type === 'timed_choice') &&
      currentNode.choices.length > 0
    ) {
      return;
    }

    if (currentNode.type === 'condition') {
      const targetId = evaluateCondition();
      if (targetId) {
        setAutoSaveArmed(true);
        setPlayback((previous) => enterPreviewNode(previous, project, targetId));
      }
      return;
    }

    const nextNodeId = currentNode.nextNodeId;
    if (nextNodeId) {
      setAutoSaveArmed(true);
      setPlayback((previous) => enterPreviewNode(previous, project, nextNodeId));
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
    branchIssue,
    evaluateCondition,
    project,
  ]);

  // Auto-play / Skip-mode timer
  useEffect(() => {
    if (screenMode !== 'playing' || branchIssue || (!isAutoPlay && !isSkipMode) || isTyping) return;
    const isChoicePause =
      (currentNode.type === 'choice' || currentNode.type === 'timed_choice') &&
      dialogueIndex === currentNode.dialogues.length - 1;
    if (isChoicePause) return;

    const delay = isSkipMode ? 110 : 1650;
    const t = setTimeout(() => {
      advance();
    }, delay);
    return () => clearTimeout(t);
  }, [screenMode, isAutoPlay, isSkipMode, isTyping, advance, currentNode.type, dialogueIndex, currentNode.dialogues.length, branchIssue?.code]);

  const stepBack = () => {
    if (historyStack.length === 0) return;
    setIsAutoPlay(false);
    setIsSkipMode(false);
    setAutoSaveArmed(true);
    setPlayback((previous) => backPreview(previous));
  };

  const handleLoadSlot = (slot: SaveSlotData, acceptLegacy = false) => {
    const savedNode = project.nodes.find((node) => node.id === slot.nodeId);
    if (!savedNode) {
      setSaveError(`存档中的节点不存在：${slot.nodeId}`);
      return;
    }
    if (slot.dialogueIndex >= Math.max(1, savedNode.dialogues.length)) {
      setSaveError('存档中的台词位置无效，原存档未修改。');
      return;
    }
    if (slot.previewSnapshotVersion === 1 && !getUnsupportedBranchIssue(savedNode)) {
      const needsTimer = savedNode.type === 'timed_choice' && slot.dialogueIndex === savedNode.dialogues.length - 1;
      if ((needsTimer && (typeof slot.timedRemainingSnapshot !== 'number' || slot.timedRemainingSnapshot <= 0)) ||
          (!needsTimer && slot.timedRemainingSnapshot !== null)) {
        setSaveError('存档中的限时状态与当前节点不一致，原存档未修改。');
        return;
      }
    }
    if (slot.previewSnapshotVersion !== 1 && !acceptLegacy) {
      setPendingLegacySlot(slot);
      return;
    }
    setPendingLegacySlot(null);
    setSaveError(invalidSlotKeys.current.size ? '部分存档槽损坏或版本不支持，已保留原数据。' : null);
    setAutoSaveArmed(false);
    setPlayback((previous) => restorePreviewSlot(previous, project, slot));
    setIsAutoPlay(false);
    setIsSkipMode(false);
    setIsUiHidden(false);
    setShowClueDrawer(false);
    setModalMode('none');
    setScreenMode('playing');
  };

  const startNewGame = () => {
    setAutoSaveArmed(true);
    setPlayback((previous) => createPreviewPlayback(project, project.startNodeId, true, previous.visit + 1));
    setPendingLegacySlot(null);
    setIsAutoPlay(false);
    setIsSkipMode(false);
    setIsUiHidden(false);
    setShowClueDrawer(false);
    setModalMode('none');
    setScreenMode('playing');
  };

  const menuBg = ui.mainMenu.backgroundId ? getBackgroundById(ui.mainMenu.backgroundId) : null;
  const menuHero = ui.mainMenu.heroCharacterSpriteId ? getCharacterById(ui.mainMenu.heroCharacterSpriteId) : null;

  return (
    <div className="fixed inset-0 z-[600] bg-black flex flex-col select-none overflow-hidden">
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

      {saveError && <div role="alert" className="px-3 py-1 text-xs text-rose-200 bg-rose-950">{saveError}</div>}
      {screenMode === 'playing' && !autoSaveArmed && (
        <div role="status" className="shrink-0 px-3 py-1 text-xs text-amber-100 bg-amber-950">
          {invalidSlotKeys.current.has('auto-1')
            ? '自动存档损坏或版本不支持，已保留原数据并停止自动覆盖。'
            : '已保留现有自动存档；推进剧情或开始新游戏后自动存档会更新。'}
        </div>
      )}
      {pendingLegacySlot && (
        <div role="alert" className="shrink-0 max-h-32 overflow-auto px-3 py-2 text-xs text-amber-100 bg-amber-950 border-b border-amber-500/50">
          读取槽位 {pendingLegacySlot.slotKey}（{pendingLegacySlot.nodeTitle}）：旧版预览存档未完整记录词条、文字速度或限时剩余；继续读取会重置这些状态并清空回退历史。继续播放时自动存档可能更新。
          <div className="flex flex-wrap gap-3 mt-1">
            <button type="button" className="underline" onClick={() => handleLoadSlot(pendingLegacySlot, true)}>继续读取旧存档</button>
            <button type="button" className="underline" onClick={() => setPendingLegacySlot(null)}>取消</button>
          </div>
        </div>
      )}
      {screenMode === 'playing' && branchIssue && (
        <div role="alert" className="shrink-0 max-h-32 overflow-auto px-3 py-2 text-xs text-amber-100 bg-amber-950 border-b border-amber-500/50 break-words">
          <div><strong>{branchIssue.code}：预览已暂停。</strong> 节点「{currentNode.title}」（{currentNode.id}）：{branchIssue.message}</div>
          <button type="button" onClick={onClose} className="mt-1 underline">返回编辑器</button>
        </div>
      )}

      {/* Main Viewport */}
      <div
        data-scene-viewport="player"
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
                      if (invalidSlotKeys.current.has('auto-1') || initialSaveReadFailed.current) {
                        setSaveError('自动存档无法读取，原数据未覆盖；请检查浏览器存储。');
                      } else if (autoSlot) handleLoadSlot(autoSlot);
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
                style={{ backgroundImage: menuBg ? `url(${menuBg.path})` : 'none' }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#040c1f]/75 via-transparent to-[#040c1f]/30" />
              {ui.mainMenu.showHeroCharacter && menuHero && (
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
                backgroundImage: currentNode.backgroundId ? `url(${bg.path})` : 'none',
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
                const mediaSrc = pl.mediaUrl || charProfile?.mediaUrl || (activeSpriteId ? sprite.path : '');
                const mediaType =
                  pl.mediaType || charProfile?.mediaType || sprite.mediaType || 'image';
                const idleMotion = pl.idleMotion || charProfile?.idleMotion || 'none';
                const chromaKeyColor = pl.chromaKeyColor || charProfile?.chromaKeyColor;
                const isSpeaking = currentLine?.speakerId === pl.characterId;

                return (
                  <div
                    key={pl.id}
                    data-character-placement={pl.id}
                    style={characterPlacementStyle(pl)}
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
                      motionLevel={motionLevel}
                      isTalking={isSpeaking && isTyping}
                      className="w-full h-auto drop-shadow-[0_20px_40px_rgba(0,0,0,0.72)]"
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
              !branchIssue &&
              (currentNode.type === 'choice' || currentNode.type === 'timed_choice') &&
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
                        setAutoSaveArmed(true);
                        setPlayback((previous) => enterPreviewNode(previous, project, choice.targetNodeId, choice));
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
                        disabled={Boolean(branchIssue)}
                        title={branchIssue ? '当前分支未实现，自动播放已暂停' : undefined}
                        onClick={() => setIsAutoPlay((a) => !a)}
                        className={`px-3 py-1 rounded border text-xs transition disabled:opacity-35 ${
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
                        disabled={Boolean(branchIssue)}
                        title={branchIssue ? '当前分支未实现，快进已暂停' : undefined}
                        onClick={() => setIsSkipMode((s) => !s)}
                        className={`px-3 py-1 rounded border text-xs transition disabled:opacity-35 ${
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
                  onClick={() => { setPendingLegacySlot(null); setModalMode('none'); }}
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
                      onClick={() => { setPendingLegacySlot(null); setActiveSaveTab(tab.id); }}
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
                  const invalid = invalidSlotKeys.current.has(slotKey);
                  const slotBg = data ? getBackgroundById(data.backgroundId) : null;

                  return (
                    <div
                      key={slotKey}
                      onClick={() => {
                        if (invalid) {
                          setPendingLegacySlot(null);
                          setSaveError(`存档槽 ${slotKey} 损坏或版本不支持，未覆盖原数据。`);
                        } else if (modalMode === 'save') {
                          persistSaveSlot(activeSaveTab, slotIdx);
                        } else if (data) {
                          handleLoadSlot(data);
                        } else {
                          setPendingLegacySlot(null);
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
                          <div className={`my-auto text-xs ${invalid ? 'text-rose-300' : 'text-slate-500'}`}>
                            {invalid
                              ? '槽位损坏或版本不支持，原数据未覆盖'
                              : modalMode === 'save'
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
                    onChange={(e) => {
                      const value = Number(e.target.value);
                      setPlayback((previous) => ({ ...previous, current: { ...previous.current, textSpeedMs: value } }));
                    }}
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


      </div>
    </div>
  );
};
