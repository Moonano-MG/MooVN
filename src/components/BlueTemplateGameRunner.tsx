import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChapterDef,
  CharacterDef,
  EndingDef,
  GameSettings,
  SAVE_FOLDER_TABS,
  SaveFolderTab,
  SaveSlotData,
  SceneChoice,
  SceneDef,
} from '../types/moovn';
import { PixiStageCanvas } from './PixiStageCanvas';
import { generateSceneThumbnailDataUrl } from '../services/thumbnailGenerator';
import { audioSynth } from '../services/audioSynth';

interface BlueTemplateGameRunnerProps {
  chapters: ChapterDef[];
  scenes: SceneDef[];
  characters: CharacterDef[];
  endings: EndingDef[];
  initialSceneId?: string;
  startInMenu?: boolean;
  onExitToEditor?: () => void;
  embeddedMode?: boolean;
}

type SettingsSubTab = 'general' | 'advanced' | 'load' | 'save';

const SAVE_STORAGE_KEY = 'moovn_blue_template_saves_v1';
const PLAYED_SCENES_STORAGE_KEY = 'moovn_blue_template_max_played_v1';

function createInitialSaveMap(
  scenes: SceneDef[],
  chapters: ChapterDef[],
  characters: CharacterDef[]
): Record<string, SaveSlotData> {
  try {
    const raw = localStorage.getItem(SAVE_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && parsed['Auto_0']) {
        return parsed;
      }
    }
  } catch {
    // fallback to default slots
  }

  const map: Record<string, SaveSlotData> = {};
  for (const folder of SAVE_FOLDER_TABS) {
    for (let i = 0; i < 6; i++) {
      const slotKey = `${folder}_${i}`;
      map[slotKey] = {
        slotKey,
        folder,
        indexInFolder: i,
        isEmpty: true,
      };
    }
  }

  // Pre-populate 1 Auto save & 1 slot in Folder "1" so user can immediately see both saved and empty slots
  const scene1 = scenes[0];
  const scene4 = scenes.find((s) => s.globalNumber === 4) || scenes[0];
  if (scene1) {
    const chap1 = chapters.find((c) => c.id === scene1.chapterId);
    map['Auto_0'] = {
      slotKey: 'Auto_0',
      folder: 'Auto',
      indexInFolder: 0,
      isEmpty: false,
      savedAt: '2026-10-21 08:15:00',
      sceneId: scene1.id,
      globalSceneNumber: scene1.globalNumber,
      chapterTitle: chap1?.title || '第一章',
      sceneTitle: scene1.title,
      speakerName: scene1.dialogue.speakerName,
      dialogueText: scene1.dialogue.text,
      thumbnailDataUrl: generateSceneThumbnailDataUrl(scene1, characters),
      isAnimatedScene: scene1.background.isAnimated,
      affectionState: Object.fromEntries(characters.map((c) => [c.id, c.initialAffection])),
      historySceneIds: [scene1.id],
    };
  }
  if (scene4) {
    const chap = chapters.find((c) => c.id === scene4.chapterId);
    map['1_0'] = {
      slotKey: '1_0',
      folder: '1',
      indexInFolder: 0,
      isEmpty: false,
      savedAt: '2026-10-21 09:20:35',
      sceneId: scene4.id,
      globalSceneNumber: scene4.globalNumber,
      chapterTitle: chap?.title || '第一章',
      sceneTitle: scene4.title,
      speakerName: scene4.dialogue.speakerName,
      dialogueText: scene4.dialogue.text,
      thumbnailDataUrl: generateSceneThumbnailDataUrl(scene4, characters),
      isAnimatedScene: scene4.background.isAnimated,
      affectionState: Object.fromEntries(characters.map((c) => [c.id, c.initialAffection + 5])),
      historySceneIds: scenes.slice(0, 4).map((s) => s.id),
    };
  }

  return map;
}

export const BlueTemplateGameRunner: React.FC<BlueTemplateGameRunnerProps> = ({
  chapters,
  scenes,
  characters,
  endings,
  initialSceneId,
  startInMenu = true,
  onExitToEditor,
  embeddedMode = false,
}) => {
  const [screenMode, setScreenMode] = useState<'menu' | 'playing'>(
    startInMenu ? 'menu' : 'playing'
  );
  const [currentSceneId, setCurrentSceneId] = useState<string>(
    initialSceneId || scenes[0]?.id || 'scene_01'
  );
  const [historyStack, setHistoryStack] = useState<string[]>([]);

  // Max scene number played across runs (default 10 so fast-forward from Scene 1 -> Scene 10 works out of the box!)
  const [maxPlayedSceneNumber, setMaxPlayedSceneNumber] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(PLAYED_SCENES_STORAGE_KEY);
      if (saved) return Math.max(1, Number(saved));
    } catch {
      // ignore
    }
    return 10; // Default 10 so user can immediately test "场景10已玩过，开启新游戏从场景1快进到场景10后停止"
  });

  // Live runtime character affections & custom attributes
  const [runtimeAffections, setRuntimeAffections] = useState<Record<string, number>>(() =>
    Object.fromEntries(characters.map((c) => [c.id, c.affection]))
  );
  const [runtimeCustomAttrs, setRuntimeCustomAttrs] = useState<
    Record<string, Record<string, number | string | boolean>>
  >(() =>
    Object.fromEntries(
      characters.map((c) => [
        c.id,
        Object.fromEntries(c.customAttributes.map((attr) => [attr.key, attr.value])),
      ])
    )
  );

  // Settings & Save/Load Modal State
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);
  const [settingsTab, setSettingsTab] = useState<SettingsSubTab>('general');
  const [aboutModalOpen, setAboutModalOpen] = useState<boolean>(false);
  const [activeSaveFolder, setActiveSaveFolder] = useState<SaveFolderTab>('1');
  const [saveSlots, setSaveSlots] = useState<Record<string, SaveSlotData>>(() =>
    createInitialSaveMap(scenes, chapters, characters)
  );

  const [settings, setSettings] = useState<GameSettings>({
    textSpeed: 48,
    autoPlayDelayMs: 1800,
    bgmVolume: 80,
    sfxVolume: 85,
    voiceVolume: 90,
    fullscreen: false,
    skipMode: 'played_only',
    transitionEffect: 'fade',
    particleQuality: 'high',
    showAffectionToast: true,
    dialogueBoxOpacity: 92,
    hardwareAcceleration: true,
    targetPlatformPreview: 'desktop_16_9',
  });

  // In-game playback states
  const [uiHidden, setUiHidden] = useState<boolean>(false);
  const [isAutoPlaying, setIsAutoPlaying] = useState<boolean>(false);
  const [isFastForwarding, setIsFastForwarding] = useState<boolean>(false);
  const [hoveredChoiceId, setHoveredChoiceId] = useState<string | null>(null);
  const [hoveredMenuBtn, setHoveredMenuBtn] = useState<string | null>(null);
  const [typedLength, setTypedLength] = useState<number>(0);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const toastTimerRef = useRef<number | null>(null);
  const showToast = (msg: string) => {
    setToastMessage(msg);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => {
      setToastMessage(null);
    }, 3000);
  };

  // Persist saveSlots
  useEffect(() => {
    try {
      localStorage.setItem(SAVE_STORAGE_KEY, JSON.stringify(saveSlots));
    } catch {
      // ignore quota errors
    }
  }, [saveSlots]);

  // Persist maxPlayedSceneNumber
  useEffect(() => {
    try {
      localStorage.setItem(PLAYED_SCENES_STORAGE_KEY, String(maxPlayedSceneNumber));
    } catch {
      // ignore
    }
  }, [maxPlayedSceneNumber]);

  const currentScene = useMemo(
    () => scenes.find((s) => s.id === currentSceneId) || scenes[0],
    [scenes, currentSceneId]
  );

  const currentChapter = useMemo(
    () => chapters.find((c) => c.id === currentScene?.chapterId) || chapters[0],
    [chapters, currentScene]
  );

  const currentEnding = useMemo(
    () =>
      currentScene?.endingId
        ? endings.find((e) => e.id === currentScene.endingId) || null
        : null,
    [endings, currentScene]
  );

  // Sync initialSceneId when changed from Editor
  useEffect(() => {
    if (initialSceneId && !startInMenu) {
      setCurrentSceneId(initialSceneId);
    }
  }, [initialSceneId, startInMenu]);

  // Record visited scene & write Auto-Save whenever entering a scene during play
  useEffect(() => {
    if (screenMode !== 'playing' || !currentScene) return;

    if (currentScene.globalNumber > maxPlayedSceneNumber) {
      setMaxPlayedSceneNumber(currentScene.globalNumber);
    }

    audioSynth.playSfx(currentScene.audio.sfxId, settings.sfxVolume);

    // Update Auto-save slot 0 automatically
    const nowStr = formatTimestamp(new Date());
    const autoSlot: SaveSlotData = {
      slotKey: 'Auto_0',
      folder: 'Auto',
      indexInFolder: 0,
      isEmpty: false,
      savedAt: nowStr,
      sceneId: currentScene.id,
      globalSceneNumber: currentScene.globalNumber,
      chapterTitle: currentChapter?.title || '第一章',
      sceneTitle: currentScene.title,
      speakerName: currentScene.dialogue.speakerName,
      dialogueText: currentScene.dialogue.text,
      thumbnailDataUrl: generateSceneThumbnailDataUrl(currentScene, characters),
      isAnimatedScene: currentScene.background.isAnimated,
      affectionState: { ...runtimeAffections },
      customAttributesState: { ...runtimeCustomAttrs },
      historySceneIds: [...historyStack],
    };
    setSaveSlots((prev) => ({ ...prev, Auto_0: autoSlot }));
  }, [currentSceneId, screenMode]);

  // Typewriter text reveal according to settings.textSpeed
  useEffect(() => {
    if (screenMode !== 'playing' || !currentScene) return;
    const fullText = currentScene.dialogue.text;
    if (isFastForwarding) {
      setTypedLength(fullText.length);
      return;
    }

    setTypedLength(0);
    const intervalMs = Math.max(10, Math.round(1000 / Math.max(10, settings.textSpeed)));
    const timer = window.setInterval(() => {
      setTypedLength((prev) => {
        if (prev >= fullText.length) {
          window.clearInterval(timer);
          return fullText.length;
        }
        return prev + 1;
      });
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [currentSceneId, screenMode, settings.textSpeed, isFastForwarding, currentScene]);

  // Auto-play timer (自动播放 - 根据字的显示速度)
  useEffect(() => {
    if (screenMode !== 'playing' || !isAutoPlaying || isFastForwarding || settingsOpen || !currentScene) {
      return;
    }
    const fullLen = currentScene.dialogue.text.length;
    if (typedLength < fullLen) return; // Wait until typewriter finishes

    // Cannot auto-advance if choices are waiting or at final ending
    if (currentScene.choices.length > 0 || !currentScene.nextSceneId) {
      setIsAutoPlaying(false);
      return;
    }

    // Dynamic wait based on textSpeed & autoPlayDelayMs
    const speedFactor = Math.max(0.5, (100 - settings.textSpeed) / 50);
    const delay = Math.round(settings.autoPlayDelayMs * speedFactor);

    const timer = window.setTimeout(() => {
      goToNextScene(currentScene.nextSceneId!);
    }, delay);

    return () => window.clearTimeout(timer);
  }, [
    screenMode,
    isAutoPlaying,
    isFastForwarding,
    settingsOpen,
    typedLength,
    currentScene,
    settings.textSpeed,
    settings.autoPlayDelayMs,
  ]);

  // Fast-Forward (快进) logic:
  // "快进就是如果场景10你已经玩过，你开启新游戏应该就在场景1，但是快进能快速跳过到场景10，但到场景10，场景10以后的场景还没玩过，就无法快捷。"
  useEffect(() => {
    if (screenMode !== 'playing' || !isFastForwarding || settingsOpen || !currentScene) {
      return;
    }

    // Check if current scene has reached or exceeded maxPlayedSceneNumber
    if (
      settings.skipMode === 'played_only' &&
      currentScene.globalNumber >= maxPlayedSceneNumber
    ) {
      setIsFastForwarding(false);
      showToast(
        `已快进至已游玩进度上限（场景 ${currentScene.globalNumber}），场景 ${currentScene.globalNumber} 之后的剧情尚未游玩，无法继续快进！`
      );
      return;
    }

    // Check if choices or ending reached
    if (!currentScene.nextSceneId) {
      setIsFastForwarding(false);
      showToast('已抵达章节终局节点，停止快进。');
      return;
    }

    const timer = window.setTimeout(() => {
      const nextScene = scenes.find((s) => s.id === currentScene.nextSceneId);
      if (!nextScene) {
        setIsFastForwarding(false);
        return;
      }
      if (
        settings.skipMode === 'played_only' &&
        nextScene.globalNumber > maxPlayedSceneNumber
      ) {
        setIsFastForwarding(false);
        showToast(
          `已停在场景 ${currentScene.globalNumber}：下一场景（场景 ${nextScene.globalNumber}）尚未游玩，无法快进跳过！`
        );
        return;
      }
      goToNextScene(nextScene.id, true);
    }, 150);

    return () => window.clearTimeout(timer);
  }, [
    screenMode,
    isFastForwarding,
    settingsOpen,
    currentScene,
    maxPlayedSceneNumber,
    settings.skipMode,
    scenes,
  ]);

  // Start New Game from Chapter 1, Scene 1
  const handleStartNewGame = () => {
    const firstChap = chapters[0];
    const firstScene =
      scenes.find((s) => s.chapterId === firstChap?.id && s.globalNumber === 1) ||
      scenes[0];
    if (!firstScene) return;

    setRuntimeAffections(
      Object.fromEntries(characters.map((c) => [c.id, c.initialAffection]))
    );
    setRuntimeCustomAttrs(
      Object.fromEntries(
        characters.map((c) => [
          c.id,
          Object.fromEntries(c.customAttributes.map((a) => [a.key, a.value])),
        ])
      )
    );
    setHistoryStack([]);
    setCurrentSceneId(firstScene.id);
    setIsAutoPlaying(false);
    setIsFastForwarding(false);
    setUiHidden(false);
    setSettingsOpen(false);
    setScreenMode('playing');
    audioSynth.playSfx('chime', settings.sfxVolume);
    showToast(`已从第一章「${firstScene.title}」开启新游戏（历史最高已玩进度：场景 ${maxPlayedSceneNumber}）`);
  };

  const goToNextScene = (targetSceneId: string, fromFastForward = false) => {
    const target = scenes.find((s) => s.id === targetSceneId);
    if (!target) return;

    // Apply current scene dialogue affection delta if any
    if (currentScene?.dialogue.affectionDelta) {
      const { characterId, delta } = currentScene.dialogue.affectionDelta;
      setRuntimeAffections((prev) => ({
        ...prev,
        [characterId]: Math.max(0, Math.min(100, (prev[characterId] ?? 0) + delta)),
      }));
    }

    setHistoryStack((prev) => [...prev, currentSceneId]);
    setCurrentSceneId(target.id);
    if (!fromFastForward) {
      audioSynth.playSfx('page_turn', settings.sfxVolume);
    }
  };

  // Step back to previous scene (后退将退到上一个场景)
  const handleStepBack = () => {
    setIsAutoPlaying(false);
    setIsFastForwarding(false);
    if (historyStack.length > 0) {
      const prevSceneId = historyStack[historyStack.length - 1];
      setHistoryStack((prev) => prev.slice(0, -1));
      setCurrentSceneId(prevSceneId);
      audioSynth.playSfx('page_turn', settings.sfxVolume);
      showToast('已后退至上一个场景');
      return;
    }
    // Fallback: if historyStack is empty but globalNumber > 1, go to globalNumber - 1
    if (currentScene && currentScene.globalNumber > 1) {
      const prevByNum = scenes.find(
        (s) => s.globalNumber === currentScene.globalNumber - 1
      );
      if (prevByNum) {
        setCurrentSceneId(prevByNum.id);
        showToast(`已后退至 ${prevByNum.title}`);
        return;
      }
    }
    showToast('当前已是第一章第一个场景，无法继续后退');
  };

  // Handle clicking an in-game choice
  const handleSelectChoice = (choice: SceneChoice) => {
    setIsAutoPlaying(false);
    setIsFastForwarding(false);

    if (choice.affectionChanges && choice.affectionChanges.length > 0) {
      setRuntimeAffections((prev) => {
        const next = { ...prev };
        for (const change of choice.affectionChanges!) {
          next[change.characterId] = Math.max(
            0,
            Math.min(100, (next[change.characterId] ?? 0) + change.delta)
          );
          const charObj = characters.find((c) => c.id === change.characterId);
          if (settings.showAffectionToast && charObj) {
            showToast(
              `${charObj.name} 好感度 ${change.delta >= 0 ? `+${change.delta}` : change.delta}`
            );
          }
        }
        return next;
      });
    }

    if (choice.attributeChanges && choice.attributeChanges.length > 0) {
      setRuntimeCustomAttrs((prev) => {
        const next = { ...prev };
        for (const attrChange of choice.attributeChanges!) {
          next[attrChange.characterId] = {
            ...(next[attrChange.characterId] || {}),
            [attrChange.key]: attrChange.deltaOrValue,
          };
        }
        return next;
      });
    }

    goToNextScene(choice.targetSceneId);
  };

  // Save current game to a specific slot
  const handleSaveToSlot = (folder: SaveFolderTab, indexInFolder: number) => {
    if (screenMode !== 'playing' || !currentScene) {
      showToast('请在游戏进行中保存档案（菜单界面仅可读取存档）');
      return;
    }
    const slotKey = `${folder}_${indexInFolder}`;
    const nowStr = formatTimestamp(new Date());
    const newSlot: SaveSlotData = {
      slotKey,
      folder,
      indexInFolder,
      isEmpty: false,
      savedAt: nowStr,
      sceneId: currentScene.id,
      globalSceneNumber: currentScene.globalNumber,
      chapterTitle: currentChapter?.title || '第一章',
      sceneTitle: currentScene.title,
      speakerName: currentScene.dialogue.speakerName,
      dialogueText: currentScene.dialogue.text,
      thumbnailDataUrl: generateSceneThumbnailDataUrl(currentScene, characters),
      isAnimatedScene: currentScene.background.isAnimated,
      affectionState: { ...runtimeAffections },
      customAttributesState: { ...runtimeCustomAttrs },
      historySceneIds: [...historyStack],
    };

    setSaveSlots((prev) => ({
      ...prev,
      [slotKey]: newSlot,
    }));
    audioSynth.playSfx('chime', settings.sfxVolume);
    showToast(`已成功保存至【${folder}】文件夹 · 档案 #${indexInFolder + 1} (${nowStr})`);
  };

  // Load game from a specific slot
  const handleLoadFromSlot = (slot: SaveSlotData) => {
    if (slot.isEmpty || !slot.sceneId) {
      showToast('该位置为空档案，无法读取');
      return;
    }
    const targetScene = scenes.find((s) => s.id === slot.sceneId) || scenes[0];
    if (!targetScene) return;

    if (slot.affectionState) {
      setRuntimeAffections(slot.affectionState);
    }
    if (slot.customAttributesState) {
      setRuntimeCustomAttrs(slot.customAttributesState);
    }
    setHistoryStack(slot.historySceneIds || []);
    setCurrentSceneId(targetScene.id);
    setIsAutoPlaying(false);
    setIsFastForwarding(false);
    setUiHidden(false);
    setSettingsOpen(false);
    setScreenMode('playing');
    audioSynth.playSfx('chime', settings.sfxVolume);
    showToast(`已读取档案：${slot.sceneTitle}（保存于 ${slot.savedAt}）`);
  };

  // Open Settings Modal on a specific tab
  const openSettingsOnTab = (tab: SettingsSubTab) => {
    setIsAutoPlaying(false);
    setIsFastForwarding(false);
    setSettingsTab(tab);
    setSettingsOpen(true);
  };

  const menuScenePreview = useMemo(() => scenes[0] || currentScene, [scenes, currentScene]);

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        backgroundColor: '#020611',
        color: '#f1f5f9',
        fontFamily: '"Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif',
        overflow: 'hidden',
        userSelect: 'none',
      }}
    >
      {/* Top Diagnostic / Fast-Forward Test Bar */}
      <div
        style={{
          position: 'absolute',
          top: 10,
          right: 14,
          zIndex: 60,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: 'rgba(4, 12, 28, 0.86)',
          border: '1px solid #1e40af',
          borderRadius: 8,
          padding: '5px 10px',
          fontSize: 12,
          backdropFilter: 'blur(8px)',
        }}
      >
        <span style={{ color: '#93c5fd' }}>
          已解锁快进上限: <strong style={{ color: '#38bdf8' }}>场景 {maxPlayedSceneNumber}</strong> / {scenes.length}
        </span>
        <button
          onClick={() => {
            setMaxPlayedSceneNumber(10);
            handleStartNewGame();
            showToast('已模拟「场景 10 已玩过」并从场景 1 开启新游戏，请点击下方「快进」测试！');
          }}
          style={{
            background: 'linear-gradient(135deg, #0284c7, #1d4ed8)',
            color: '#fff',
            border: '1px solid #38bdf8',
            borderRadius: 5,
            padding: '3px 8px',
            fontSize: 11,
            cursor: 'pointer',
            fontWeight: 600,
          }}
          title="将已游玩记录设为场景10并从场景1重新开始，点击快进将自动跳到场景10并停止"
        >
          测试场景1→10快进
        </button>
        {screenMode === 'playing' && (
          <button
            onClick={() => handleSaveToSlot('快速', 0)}
            style={{
              background: 'rgba(15, 39, 78, 0.9)',
              color: '#bae6fd',
              border: '1px solid #1e40af',
              borderRadius: 5,
              padding: '3px 8px',
              fontSize: 11,
              cursor: 'pointer',
            }}
          >
            快速存档 (Q.Save)
          </button>
        )}
        {onExitToEditor && (
          <button
            onClick={onExitToEditor}
            style={{
              background: 'rgba(30, 41, 59, 0.9)',
              color: '#e2e8f0',
              border: '1px solid #475569',
              borderRadius: 5,
              padding: '3px 8px',
              fontSize: 11,
              cursor: 'pointer',
            }}
          >
            返回编辑器
          </button>
        )}
      </div>

      {/* Toast Notification */}
      {toastMessage && (
        <div
          style={{
            position: 'absolute',
            top: 52,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 95,
            background: 'rgba(4, 13, 31, 0.95)',
            border: '1.5px solid #38bdf8',
            boxShadow: '0 8px 28px rgba(2, 132, 199, 0.35)',
            color: '#e0f2fe',
            padding: '8px 18px',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 500,
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          {toastMessage}
        </div>
      )}

      {/* ===================================================================
          1. MENU SCREEN (蓝色模板菜单界面)
          - 左边是选项，背景是深蓝色 (#061533)
          - 中和右是一个图片
          - 左和中之间有一个模糊的过渡层，过渡也是深蓝到黑
          - 菜单选项从上到下分别是：开启新游戏、读取存档、设置、关于、退出游戏
      =================================================================== */}
      {screenMode === 'menu' && (
        <div
          style={{
            position: 'relative',
            width: '100%',
            height: '100%',
            display: 'flex',
            overflow: 'hidden',
          }}
        >
          {/* Center & Right Key Visual Picture (中和右是一个图片) */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: '22%',
              right: 0,
              zIndex: 1,
            }}
          >
            {menuScenePreview && (
              <PixiStageCanvas
                scene={menuScenePreview}
                characters={characters}
                interactiveEditor={false}
                particleQuality={settings.particleQuality}
              />
            )}
            {/* Subtle vignette and title overlay on the right */}
            <div
              style={{
                position: 'absolute',
                right: 48,
                bottom: 44,
                textAlign: 'right',
                zIndex: 10,
                pointerEvents: 'none',
                textShadow: '0 4px 24px rgba(0,0,0,0.9)',
              }}
            >
              <div
                style={{
                  fontSize: 13,
                  letterSpacing: 4,
                  color: '#7dd3fc',
                  marginBottom: 6,
                  fontWeight: 600,
                }}
              >
                MOOVN BLUE VISUAL NOVEL TEMPLATE
              </div>
              <div
                style={{
                  fontSize: 38,
                  fontWeight: 800,
                  color: '#f8fafc',
                  letterSpacing: 2,
                }}
              >
                深海回响与蔚蓝怀表
              </div>
              <div style={{ fontSize: 14, color: '#94a3b8', marginTop: 6 }}>
                Echoes of the Azure Abyss · 视觉小说蓝色标准模板
              </div>
            </div>
          </div>

          {/* Left Options Panel (左边是深蓝色背景的选项区域) */}
          <div
            style={{
              position: 'relative',
              width: '28%',
              minWidth: 290,
              maxWidth: 380,
              height: '100%',
              background: 'linear-gradient(180deg, #07193d 0%, #05122c 60%, #030b1c 100%)',
              zIndex: 15,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              padding: '0 36px',
              boxSizing: 'border-box',
            }}
          >
            {/* Brand Emblem */}
            <div style={{ marginBottom: 42 }}>
              <div
                style={{
                  display: 'inline-block',
                  padding: '3px 10px',
                  borderRadius: 4,
                  background: 'rgba(56, 189, 248, 0.14)',
                  border: '1px solid rgba(56, 189, 248, 0.4)',
                  color: '#7dd3fc',
                  fontSize: 11,
                  letterSpacing: 2,
                  marginBottom: 10,
                }}
              >
                BLUE TEMPLATE · v0.1.0
              </div>
              <div
                style={{
                  fontSize: 26,
                  fontWeight: 800,
                  color: '#e0f2fe',
                  letterSpacing: 1.5,
                }}
              >
                深海回响
              </div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                CHAPTERS 01-03 · MULTI-ENDING
              </div>
            </div>

            {/* Menu Options strictly from top to bottom:
                开启新游戏、读取存档、设置、关于、退出游戏 */}
            <nav style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {[
                {
                  id: 'new_game',
                  label: '开启新游戏',
                  sub: 'NEW GAME · 从第一章开始',
                  action: handleStartNewGame,
                },
                {
                  id: 'load_game',
                  label: '读取存档',
                  sub: 'LOAD DATA · 打开设置读档页',
                  action: () => openSettingsOnTab('load'),
                },
                {
                  id: 'settings',
                  label: '设置',
                  sub: 'CONFIG · 系统与档案管理',
                  action: () => openSettingsOnTab('general'),
                },
                {
                  id: 'about',
                  label: '关于',
                  sub: 'ABOUT · 引擎与制作信息',
                  action: () => setAboutModalOpen(true),
                },
                {
                  id: 'exit',
                  label: '退出游戏',
                  sub: 'EXIT · 返回编辑器或退出',
                  action: () => {
                    if (onExitToEditor) {
                      onExitToEditor();
                    } else {
                      showToast('已在独立预览窗口运行，点击右上角可切换编辑器视图');
                    }
                  },
                },
              ].map((item) => {
                const hovered = hoveredMenuBtn === item.id;
                return (
                  <button
                    key={item.id}
                    onMouseEnter={() => setHoveredMenuBtn(item.id)}
                    onMouseLeave={() => setHoveredMenuBtn(null)}
                    onClick={item.action}
                    style={{
                      position: 'relative',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      width: '100%',
                      padding: '13px 18px 13px 22px',
                      background: hovered
                        ? 'rgba(10, 32, 70, 0.95)'
                        : 'rgba(3, 8, 20, 0.82)',
                      border: `1.5px solid ${hovered ? '#38bdf8' : '#163e75'}`,
                      borderRadius: 6,
                      color: hovered ? '#f8fafc' : '#cbd5e1',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.18s ease',
                      boxShadow: hovered
                        ? '0 0 20px rgba(56, 189, 248, 0.28)'
                        : 'none',
                    }}
                  >
                    {/* Light blue vertical indicator bar on hover */}
                    <span
                      style={{
                        position: 'absolute',
                        left: 7,
                        top: '20%',
                        bottom: '20%',
                        width: 4,
                        borderRadius: 2,
                        backgroundColor: hovered ? '#5cc8ff' : 'transparent',
                        boxShadow: hovered ? '0 0 8px #38bdf8' : 'none',
                        transition: 'all 0.18s ease',
                      }}
                    />
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: 1 }}>
                        {item.label}
                      </div>
                      <div style={{ fontSize: 10.5, color: '#60a5fa', marginTop: 2, opacity: 0.85 }}>
                        {item.sub}
                      </div>
                    </div>
                    <span
                      style={{
                        fontSize: 14,
                        color: hovered ? '#38bdf8' : '#334155',
                        transform: hovered ? 'translateX(3px)' : 'none',
                        transition: 'all 0.18s ease',
                      }}
                    >
                      ▸
                    </span>
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Blurred Transition Layer between Left and Middle (左和中之间有一个模糊的过渡层，深蓝到黑) */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: '21%',
              width: '18%',
              zIndex: 12,
              background:
                'linear-gradient(90deg, #05122c 0%, #040d21 28%, rgba(2, 4, 10, 0.92) 62%, rgba(0, 0, 0, 0.55) 84%, rgba(0, 0, 0, 0) 100%)',
              backdropFilter: 'blur(18px)',
              WebkitBackdropFilter: 'blur(18px)',
              pointerEvents: 'none',
            }}
          />
        </div>
      )}

      {/* ===================================================================
          2. IN-GAME VIEW (游戏内界面)
          - 对话框左边上方是选项：未超出屏幕宽度绝不换行；黑色背景 + 深蓝边框；悬浮时字左边有浅蓝条
          - 下方是对话框：黑色背景 + 深蓝边框
          - 对话框下面有：后退、自动、快进、隐藏(隐藏UI)、设置
      =================================================================== */}
      {screenMode === 'playing' && currentScene && (
        <div
          onClick={() => {
            if (uiHidden) {
              setUiHidden(false);
            }
          }}
          style={{
            position: 'relative',
            width: '100%',
            height: '100%',
            overflow: 'hidden',
          }}
        >
          {/* Pixi.js Visual Stage */}
          <PixiStageCanvas
            scene={currentScene}
            characters={characters}
            interactiveEditor={false}
            particleQuality={settings.particleQuality}
          />

          {/* Top-Left Chapter / Scene & Character Affection Status Pill (hidden when UI is hidden) */}
          {!uiHidden && (
            <div
              style={{
                position: 'absolute',
                top: 12,
                left: 16,
                zIndex: 25,
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: 10,
                background: 'rgba(3, 7, 15, 0.85)',
                border: '1px solid #163e75',
                borderRadius: 6,
                padding: '6px 12px',
                fontSize: 12,
              }}
            >
              <span style={{ color: '#38bdf8', fontWeight: 700 }}>
                {currentChapter?.title || '第一章'}
              </span>
              <span style={{ color: '#475569' }}>|</span>
              <span style={{ color: '#e2e8f0' }}>{currentScene.title}</span>
              <span style={{ color: '#475569' }}>|</span>
              {characters.map((ch) => (
                <span key={ch.id} style={{ color: '#93c5fd', fontSize: 11.5 }}>
                  {ch.name.split(' ')[0]} 好感:{' '}
                  <strong style={{ color: ch.themeColor }}>
                    {runtimeAffections[ch.id] ?? ch.affection}
                  </strong>
                </span>
              ))}
            </div>
          )}

          {/* Ending Banner if current scene reaches an Ending */}
          {!uiHidden && currentEnding && (
            <div
              style={{
                position: 'absolute',
                top: 64,
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 35,
                background: 'linear-gradient(135deg, rgba(4, 12, 28, 0.96), rgba(10, 34, 70, 0.96))',
                border: '2px solid #38bdf8',
                borderRadius: 10,
                padding: '14px 28px',
                textAlign: 'center',
                boxShadow: '0 12px 40px rgba(0, 0, 0, 0.8)',
              }}
            >
              <div style={{ fontSize: 12, color: '#38bdf8', letterSpacing: 2, fontWeight: 700 }}>
                {currentEnding.code} · 达成结局
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#f8fafc', marginTop: 4 }}>
                {currentEnding.title}
              </div>
              <div style={{ fontSize: 12.5, color: '#cbd5e1', marginTop: 4 }}>
                {currentEnding.description}
              </div>
              <div style={{ marginTop: 10, display: 'flex', gap: 10, justifyContent: 'center' }}>
                <button
                  onClick={handleStartNewGame}
                  style={{
                    background: '#0284c7',
                    color: '#fff',
                    border: '1px solid #38bdf8',
                    borderRadius: 5,
                    padding: '5px 14px',
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  从第一章重新开始 (测试快进)
                </button>
                <button
                  onClick={() => setScreenMode('menu')}
                  style={{
                    background: '#050811',
                    color: '#bae6fd',
                    border: '1px solid #163e75',
                    borderRadius: 5,
                    padding: '5px 14px',
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  返回主菜单
                </button>
              </div>
            </div>
          )}

          {/* Hidden UI Restore Hint */}
          {uiHidden && (
            <div
              style={{
                position: 'absolute',
                bottom: 14,
                right: 18,
                zIndex: 30,
                background: 'rgba(3, 7, 16, 0.65)',
                border: '1px solid #163e75',
                color: '#93c5fd',
                padding: '4px 10px',
                borderRadius: 4,
                fontSize: 11,
                pointerEvents: 'none',
              }}
            >
              UI 已隐藏 · 点击画面任意位置恢复显示
            </div>
          )}

          {/* ===============================================================
              IN-GAME CHOICES + DIALOGUE BOX CONTAINER
              - 在游戏内，对话框的左边上方应该就是选项
              - 选项里面的字，如果没有超出屏幕宽度就不要进下一行
              - 对话框以及选项背景用黑色，边框用深蓝
              - 鼠标悬浮在一个选项上，选项的字左边会有一个浅蓝的条
          =============================================================== */}
          {!uiHidden && (
            <div
              style={{
                position: 'absolute',
                left: '4%',
                right: '4%',
                bottom: 18,
                zIndex: 30,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
              }}
            >
              {/* Choices positioned directly above the left side of the dialogue box */}
              {currentScene.choices.length > 0 && (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    gap: 8,
                    marginBottom: 12,
                    maxWidth: '100%',
                  }}
                >
                  {currentScene.choices.map((choice) => {
                    const isHovered = hoveredChoiceId === choice.id;
                    return (
                      <button
                        key={choice.id}
                        onMouseEnter={() => setHoveredChoiceId(choice.id)}
                        onMouseLeave={() => setHoveredChoiceId(null)}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectChoice(choice);
                        }}
                        style={{
                          position: 'relative',
                          display: 'inline-flex',
                          alignItems: 'center',
                          width: 'fit-content',
                          maxWidth: 'calc(92vw - 32px)',
                          padding: '10px 22px 10px 24px',
                          backgroundColor: '#04060c', // 黑色背景
                          border: `1.5px solid ${isHovered ? '#2563eb' : '#153e75'}`, // 深蓝边框
                          borderRadius: 6,
                          color: isHovered ? '#ffffff' : '#e2e8f0',
                          fontSize: 14.5,
                          fontWeight: isHovered ? 600 : 500,
                          cursor: 'pointer',
                          whiteSpace: 'nowrap', // 未超出屏幕宽度绝不换行！
                          overflowX: 'auto',
                          boxShadow: isHovered
                            ? '0 4px 20px rgba(21, 62, 117, 0.55)'
                            : '0 4px 12px rgba(0, 0, 0, 0.65)',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        {/* 鼠标悬浮在一个选项上，选项的字左边会有一个浅蓝的条 */}
                        <span
                          style={{
                            display: 'inline-block',
                            width: 4,
                            height: 18,
                            marginRight: 10,
                            borderRadius: 2,
                            backgroundColor: isHovered ? '#5cc8ff' : 'transparent',
                            boxShadow: isHovered ? '0 0 8px #5cc8ff' : 'none',
                            transition: 'all 0.15s ease',
                            flexShrink: 0,
                          }}
                        />
                        <span style={{ whiteSpace: 'nowrap' }}>{choice.text}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Bottom Dialogue Box (黑色背景 + 深蓝边框) */}
              <div
                onClick={() => {
                  // Clicking the dialogue box reveals full text or advances if no choices
                  const fullLen = currentScene.dialogue.text.length;
                  if (typedLength < fullLen) {
                    setTypedLength(fullLen);
                  } else if (currentScene.choices.length === 0 && currentScene.nextSceneId) {
                    goToNextScene(currentScene.nextSceneId);
                  }
                }}
                style={{
                  width: '100%',
                  backgroundColor: `rgba(3, 5, 10, ${settings.dialogueBoxOpacity / 100})`, // 黑色背景
                  border: '2px solid #153e75', // 深蓝边框
                  borderRadius: 8,
                  padding: '16px 24px 12px 24px',
                  boxSizing: 'border-box',
                  boxShadow: '0 10px 36px rgba(0, 0, 0, 0.85), inset 0 0 24px rgba(21, 62, 117, 0.18)',
                  cursor:
                    currentScene.choices.length === 0 && currentScene.nextSceneId
                      ? 'pointer'
                      : 'default',
                }}
              >
                {/* Speaker Name Header */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 8,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span
                      style={{
                        display: 'inline-block',
                        width: 4,
                        height: 16,
                        backgroundColor: '#38bdf8',
                        borderRadius: 2,
                      }}
                    />
                    <span
                      style={{
                        fontSize: 17,
                        fontWeight: 700,
                        color: '#60a5fa',
                        letterSpacing: 1,
                      }}
                    >
                      {currentScene.dialogue.speakerName || '旁白'}
                    </span>
                    <span style={{ fontSize: 11.5, color: '#64748b' }}>
                      [场景 {currentScene.globalNumber}/{scenes.length}]
                    </span>
                  </div>

                  {/* Click-to-continue prompt */}
                  {currentScene.choices.length === 0 && currentScene.nextSceneId && (
                    <span style={{ fontSize: 11.5, color: '#38bdf8' }}>
                      点击对话框推进剧情 ▾
                    </span>
                  )}
                </div>

                {/* Dialogue Text Content */}
                <div
                  style={{
                    minHeight: 58,
                    fontSize: 16,
                    lineHeight: 1.7,
                    color: '#f1f5f9',
                    letterSpacing: 0.4,
                    marginBottom: 12,
                  }}
                >
                  {currentScene.dialogue.text.slice(0, typedLength)}
                  {typedLength < currentScene.dialogue.text.length && (
                    <span style={{ color: '#38bdf8', marginLeft: 2 }}>▍</span>
                  )}
                </div>

                {/* Bottom 5 Action Controls: 后退、自动、快进、隐藏(隐藏UI)、设置 */}
                <div
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    gap: 10,
                    paddingTop: 10,
                    borderTop: '1px solid rgba(21, 62, 117, 0.55)',
                  }}
                >
                  {[
                    {
                      id: 'back',
                      label: '后退',
                      active: false,
                      title: '退回到上一个场景',
                      onClick: handleStepBack,
                    },
                    {
                      id: 'auto',
                      label: isAutoPlaying ? '自动 (播放中)' : '自动',
                      active: isAutoPlaying,
                      title: '根据文字显示速度自动播放',
                      onClick: () => {
                        setIsFastForwarding(false);
                        setIsAutoPlaying((v) => !v);
                      },
                    },
                    {
                      id: 'skip',
                      label: isFastForwarding ? '快进 (进行中)' : '快进',
                      active: isFastForwarding,
                      title: `快进已游玩过的场景（当前最高已玩到场景 ${maxPlayedSceneNumber}，抵达场景 ${maxPlayedSceneNumber} 后将自动停止）`,
                      onClick: () => {
                        setIsAutoPlaying(false);
                        if (!isFastForwarding) {
                          if (
                            settings.skipMode === 'played_only' &&
                            currentScene.globalNumber >= maxPlayedSceneNumber
                          ) {
                            showToast(
                              `当前位于场景 ${currentScene.globalNumber}，场景 ${currentScene.globalNumber} 之后的剧情尚未游玩，无法快进！`
                            );
                            return;
                          }
                          setIsFastForwarding(true);
                        } else {
                          setIsFastForwarding(false);
                        }
                      },
                    },
                    {
                      id: 'hide',
                      label: '隐藏',
                      active: false,
                      title: '隐藏对话框与界面 UI',
                      onClick: () => {
                        setIsAutoPlaying(false);
                        setIsFastForwarding(false);
                        setUiHidden(true);
                      },
                    },
                    {
                      id: 'settings',
                      label: '设置',
                      active: settingsOpen,
                      title: '打开设置（含通用设置、高级设置、读档、存档、退出到菜单）',
                      onClick: () => openSettingsOnTab('general'),
                    },
                  ].map((btn) => (
                    <button
                      key={btn.id}
                      title={btn.title}
                      onClick={btn.onClick}
                      style={{
                        background: btn.active
                          ? 'linear-gradient(135deg, #0284c7, #1e40af)'
                          : '#060b16',
                        color: btn.active ? '#ffffff' : '#93c5fd',
                        border: `1px solid ${btn.active ? '#38bdf8' : '#163e75'}`,
                        borderRadius: 4,
                        padding: '5px 16px',
                        fontSize: 13,
                        fontWeight: btn.active ? 700 : 500,
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {btn.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===================================================================
          3. SETTINGS & SAVE/LOAD MODAL (设置界面)
          - 包含：通用设置、高级设置、读档、存档、退出到菜单
          - 读档和存档互通
          - 标准视觉小说格式：上中分别都有三行档案（每选项卡 6 个档案，3行×2列）
          - 下面是从 Auto、快速 以及 1 到 0 的文件夹选项卡
          - 空档案显示「空档案」；保存过的显示该场景图片（动画显示动画开头帧），下方字显示保存时间
      =================================================================== */}
      {settingsOpen && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 80,
            background: 'rgba(2, 6, 16, 0.88)',
            backdropFilter: 'blur(12px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
            boxSizing: 'border-box',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 1040,
              height: '90%',
              maxHeight: 680,
              background: '#040917',
              border: '2px solid #163e75',
              borderRadius: 10,
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.9)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {/* Top Navigation Bar: 通用设置、高级设置、读档、存档、退出到菜单 */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 22px',
                background: 'linear-gradient(90deg, #06142e 0%, #040b1a 100%)',
                borderBottom: '1.5px solid #163e75',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {[
                  { id: 'general' as SettingsSubTab, label: '通用设置' },
                  { id: 'advanced' as SettingsSubTab, label: '高级设置' },
                  { id: 'load' as SettingsSubTab, label: '读档' },
                  { id: 'save' as SettingsSubTab, label: '存档' },
                ].map((tab) => {
                  const isActive = settingsTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setSettingsTab(tab.id)}
                      style={{
                        padding: '8px 20px',
                        background: isActive
                          ? 'linear-gradient(135deg, #0284c7, #1e3a8a)'
                          : '#050b18',
                        color: isActive ? '#ffffff' : '#93c5fd',
                        border: `1.5px solid ${isActive ? '#38bdf8' : '#163e75'}`,
                        borderRadius: 6,
                        fontSize: 14,
                        fontWeight: isActive ? 700 : 500,
                        cursor: 'pointer',
                      }}
                    >
                      {tab.label}
                    </button>
                  );
                })}

                {/* 5th option in Settings: 退出到菜单 */}
                <button
                  onClick={() => {
                    setSettingsOpen(false);
                    setIsAutoPlaying(false);
                    setIsFastForwarding(false);
                    setScreenMode('menu');
                    showToast('已返回游戏主菜单');
                  }}
                  style={{
                    padding: '8px 20px',
                    background: 'rgba(127, 29, 29, 0.25)',
                    color: '#fca5a5',
                    border: '1.5px solid #7f1d1d',
                    borderRadius: 6,
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  退出到菜单
                </button>
              </div>

              <button
                onClick={() => setSettingsOpen(false)}
                style={{
                  background: '#071329',
                  color: '#cbd5e1',
                  border: '1px solid #1e40af',
                  borderRadius: 6,
                  padding: '6px 14px',
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                关闭设置 ✕
              </button>
            </div>

            {/* Settings Content Body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '18px 24px', display: 'flex', flexDirection: 'column' }}>
              {/* TAB 1: 通用设置 */}
              {settingsTab === 'general' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                  <div
                    style={{
                      background: '#060e20',
                      border: '1px solid #163e75',
                      borderRadius: 8,
                      padding: 18,
                    }}
                  >
                    <h3 style={{ margin: '0 0 14px 0', color: '#38bdf8', fontSize: 16 }}>
                      文字与自动播放设置
                    </h3>
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                        <span>文字显示速度 (影响自动播放节奏)</span>
                        <span style={{ color: '#38bdf8', fontWeight: 700 }}>{settings.textSpeed} 字/秒</span>
                      </div>
                      <input
                        type="range"
                        min={15}
                        max={100}
                        value={settings.textSpeed}
                        onChange={(e) =>
                          setSettings((s) => ({ ...s, textSpeed: Number(e.target.value) }))
                        }
                        style={{ width: '100%', accentColor: '#38bdf8' }}
                      />
                    </div>

                    <div style={{ marginBottom: 16 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                        <span>自动模式句间停留时长</span>
                        <span style={{ color: '#38bdf8', fontWeight: 700 }}>{settings.autoPlayDelayMs} ms</span>
                      </div>
                      <input
                        type="range"
                        min={600}
                        max={4000}
                        step={100}
                        value={settings.autoPlayDelayMs}
                        onChange={(e) =>
                          setSettings((s) => ({ ...s, autoPlayDelayMs: Number(e.target.value) }))
                        }
                        style={{ width: '100%', accentColor: '#38bdf8' }}
                      />
                    </div>

                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                        <span>对话框黑色背景不透明度</span>
                        <span style={{ color: '#38bdf8', fontWeight: 700 }}>{settings.dialogueBoxOpacity}%</span>
                      </div>
                      <input
                        type="range"
                        min={65}
                        max={100}
                        value={settings.dialogueBoxOpacity}
                        onChange={(e) =>
                          setSettings((s) => ({
                            ...s,
                            dialogueBoxOpacity: Number(e.target.value),
                          }))
                        }
                        style={{ width: '100%', accentColor: '#38bdf8' }}
                      />
                    </div>
                  </div>

                  <div
                    style={{
                      background: '#060e20',
                      border: '1px solid #163e75',
                      borderRadius: 8,
                      padding: 18,
                    }}
                  >
                    <h3 style={{ margin: '0 0 14px 0', color: '#38bdf8', fontSize: 16 }}>
                      音频与音量控制
                    </h3>
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                        <span>背景音乐音量 (BGM)</span>
                        <span style={{ color: '#38bdf8', fontWeight: 700 }}>{settings.bgmVolume}%</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={settings.bgmVolume}
                        onChange={(e) =>
                          setSettings((s) => ({ ...s, bgmVolume: Number(e.target.value) }))
                        }
                        style={{ width: '100%', accentColor: '#38bdf8' }}
                      />
                    </div>

                    <div style={{ marginBottom: 16 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                        <span>环境与交互音效 (SFX)</span>
                        <span style={{ color: '#38bdf8', fontWeight: 700 }}>{settings.sfxVolume}%</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={settings.sfxVolume}
                        onChange={(e) =>
                          setSettings((s) => ({ ...s, sfxVolume: Number(e.target.value) }))
                        }
                        style={{ width: '100%', accentColor: '#38bdf8' }}
                      />
                    </div>

                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                        <span>角色语音音量 (Voice)</span>
                        <span style={{ color: '#38bdf8', fontWeight: 700 }}>{settings.voiceVolume}%</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={settings.voiceVolume}
                        onChange={(e) =>
                          setSettings((s) => ({ ...s, voiceVolume: Number(e.target.value) }))
                        }
                        style={{ width: '100%', accentColor: '#38bdf8' }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: 高级设置 */}
              {settingsTab === 'advanced' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                  <div
                    style={{
                      background: '#060e20',
                      border: '1px solid #163e75',
                      borderRadius: 8,
                      padding: 18,
                    }}
                  >
                    <h3 style={{ margin: '0 0 14px 0', color: '#38bdf8', fontSize: 16 }}>
                      快进 (Skip) 与剧情校验策略
                    </h3>
                    <p style={{ fontSize: 12.5, color: '#94a3b8', lineHeight: 1.6 }}>
                      当前采用标准视觉小说快进校验规则：若您已游玩至<strong>场景 10</strong>，开启新游戏从场景 1 出发时，点击「快进」可快速跳过至场景 10，抵达场景 10 后自动停止，未游玩的后续场景不可快进。
                    </p>
                    <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                      <button
                        onClick={() => setSettings((s) => ({ ...s, skipMode: 'played_only' }))}
                        style={{
                          flex: 1,
                          padding: '8px 12px',
                          background:
                            settings.skipMode === 'played_only' ? '#0284c7' : '#050b18',
                          color: '#fff',
                          border: '1px solid #38bdf8',
                          borderRadius: 6,
                          cursor: 'pointer',
                          fontSize: 12.5,
                        }}
                      >
                        仅快进已游玩场景 (推荐)
                      </button>
                      <button
                        onClick={() => setSettings((s) => ({ ...s, skipMode: 'all' }))}
                        style={{
                          flex: 1,
                          padding: '8px 12px',
                          background: settings.skipMode === 'all' ? '#0284c7' : '#050b18',
                          color: '#cbd5e1',
                          border: '1px solid #163e75',
                          borderRadius: 6,
                          cursor: 'pointer',
                          fontSize: 12.5,
                        }}
                      >
                        强制快进全部场景
                      </button>
                    </div>

                    <div style={{ marginTop: 16 }}>
                      <div style={{ fontSize: 13, marginBottom: 8, color: '#bae6fd' }}>
                        设置当前已游玩最高场景记录（用于快速验证快进上限）：
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        {[4, 7, 10, 12].map((num) => (
                          <button
                            key={num}
                            onClick={() => {
                              setMaxPlayedSceneNumber(num);
                              showToast(`已将历史最高游玩进度设为：场景 ${num}`);
                            }}
                            style={{
                              padding: '5px 12px',
                              background:
                                maxPlayedSceneNumber === num ? '#1d4ed8' : '#08142c',
                              color: '#e0f2fe',
                              border: '1px solid #38bdf8',
                              borderRadius: 4,
                              fontSize: 12,
                              cursor: 'pointer',
                            }}
                          >
                            已玩至场景 {num}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      background: '#060e20',
                      border: '1px solid #163e75',
                      borderRadius: 8,
                      padding: 18,
                    }}
                  >
                    <h3 style={{ margin: '0 0 14px 0', color: '#38bdf8', fontSize: 16 }}>
                      Pixi.js 渲染器与跨平台适配
                    </h3>
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ fontSize: 13, marginBottom: 6 }}>粒子特效精度 (雨滴/星光/深海气泡)</div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        {(['high', 'medium', 'low'] as const).map((q) => (
                          <button
                            key={q}
                            onClick={() => setSettings((s) => ({ ...s, particleQuality: q }))}
                            style={{
                              flex: 1,
                              padding: '7px 10px',
                              background:
                                settings.particleQuality === q ? '#0284c7' : '#050b18',
                              color: '#fff',
                              border: '1px solid #163e75',
                              borderRadius: 5,
                              cursor: 'pointer',
                              fontSize: 12,
                            }}
                          >
                            {q === 'high' ? '高 (High)' : q === 'medium' ? '中 (Medium)' : '低 (Low)'}
                          </button>
                        ))}
                      </div>
                    </div>

                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        fontSize: 13,
                        cursor: 'pointer',
                        marginTop: 12,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={settings.showAffectionToast}
                        onChange={(e) =>
                          setSettings((s) => ({
                            ...s,
                            showAffectionToast: e.target.checked,
                          }))
                        }
                      />
                      <span>选项触发角色好感度与属性变化时显示浮动提示</span>
                    </label>
                  </div>
                </div>
              )}

              {/* TAB 3 & TAB 4: 读档 (Load) & 存档 (Save) — 互通档案系统 */}
              {(settingsTab === 'load' || settingsTab === 'save') && (
                <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'space-between' }}>
                  {/* Header Banner explaining shared Load/Save state */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: 12,
                      padding: '8px 14px',
                      background: 'rgba(8, 25, 56, 0.75)',
                      border: '1px solid #1e40af',
                      borderRadius: 6,
                      fontSize: 12.5,
                    }}
                  >
                    <div>
                      <strong style={{ color: '#38bdf8' }}>
                        {settingsTab === 'load' ? '【读取存档模式】' : '【保存存档模式】'}
                      </strong>{' '}
                      当前文件夹选项卡：
                      <span
                        style={{
                          display: 'inline-block',
                          margin: '0 6px',
                          padding: '1px 8px',
                          background: '#0284c7',
                          color: '#fff',
                          borderRadius: 4,
                          fontWeight: 700,
                        }}
                      >
                        {activeSaveFolder}
                      </span>
                      （本选项卡包含 3 行 × 2 列共 6 个独立档案，读档与存档数据完全互通）
                    </div>
                    <div style={{ color: '#93c5fd' }}>
                      {settingsTab === 'save'
                        ? screenMode === 'playing'
                          ? '点击下方任意档案槽即可保存当前场景截图与时间'
                          : '提示：当前在主菜单，进入游戏后可点击槽位覆盖保存'
                        : '点击已保存的档案即可立即读取进度'}
                    </div>
                  </div>

                  {/* Upper & Middle Area: 3 Rows × 2 Columns = 6 Save Slots per Folder Tab */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(2, 1fr)',
                      gridTemplateRows: 'repeat(3, 1fr)',
                      gap: 12,
                      flex: 1,
                      minHeight: 370,
                    }}
                  >
                    {Array.from({ length: 6 }, (_, indexInFolder) => {
                      const slotKey = `${activeSaveFolder}_${indexInFolder}`;
                      const slot: SaveSlotData = saveSlots[slotKey] || {
                        slotKey,
                        folder: activeSaveFolder,
                        indexInFolder,
                        isEmpty: true,
                      };

                      return (
                        <div
                          key={slotKey}
                          onClick={() => {
                            if (settingsTab === 'load') {
                              handleLoadFromSlot(slot);
                            } else {
                              handleSaveToSlot(activeSaveFolder, indexInFolder);
                            }
                          }}
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between',
                            background: slot.isEmpty
                              ? 'rgba(5, 11, 24, 0.85)'
                              : 'rgba(8, 22, 48, 0.92)',
                            border: `1.5px solid ${slot.isEmpty ? '#16325c' : '#2563eb'}`,
                            borderRadius: 8,
                            padding: 10,
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                            overflow: 'hidden',
                          }}
                        >
                          {/* Top Row of Slot Card: Thumbnail on Left + Scene Details on Right */}
                          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flex: 1 }}>
                            {/* Scene Image Thumbnail or Empty Placeholder */}
                            <div
                              style={{
                                width: 148,
                                height: 82,
                                borderRadius: 5,
                                overflow: 'hidden',
                                background: '#020610',
                                border: '1px solid #1e3a8a',
                                flexShrink: 0,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                position: 'relative',
                              }}
                            >
                              {!slot.isEmpty && slot.thumbnailDataUrl ? (
                                <img
                                  src={slot.thumbnailDataUrl}
                                  alt={slot.sceneTitle || '存档缩略图'}
                                  style={{
                                    width: '100%',
                                    height: '100%',
                                    objectFit: 'cover',
                                    display: 'block',
                                  }}
                                />
                              ) : (
                                <span style={{ color: '#475569', fontSize: 12, fontWeight: 600 }}>
                                  NO DATA
                                </span>
                              )}
                              <span
                                style={{
                                  position: 'absolute',
                                  top: 4,
                                  right: 4,
                                  background: 'rgba(2, 6, 17, 0.85)',
                                  color: '#7dd3fc',
                                  fontSize: 10,
                                  padding: '1px 6px',
                                  borderRadius: 3,
                                  border: '1px solid rgba(56, 189, 248, 0.4)',
                                }}
                              >
                                {activeSaveFolder} - 0{indexInFolder + 1}
                              </span>
                            </div>

                            {/* Right Side Info */}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              {slot.isEmpty ? (
                                <div style={{ color: '#475569', fontSize: 13 }}>
                                  尚未记录观测数据
                                  <div style={{ fontSize: 11, color: '#334155', marginTop: 4 }}>
                                    {settingsTab === 'save'
                                      ? '点击此槽位可将当前场景保存至此'
                                      : '该档案槽位为空'}
                                  </div>
                                </div>
                              ) : (
                                <>
                                  <div
                                    style={{
                                      fontSize: 11,
                                      color: '#38bdf8',
                                      fontWeight: 600,
                                      whiteSpace: 'nowrap',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                    }}
                                  >
                                    {slot.chapterTitle}
                                  </div>
                                  <div
                                    style={{
                                      fontSize: 13.5,
                                      fontWeight: 700,
                                      color: '#f1f5f9',
                                      marginTop: 2,
                                      whiteSpace: 'nowrap',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                    }}
                                  >
                                    {slot.sceneTitle}
                                  </div>
                                  <div
                                    style={{
                                      fontSize: 11.5,
                                      color: '#94a3b8',
                                      marginTop: 4,
                                      whiteSpace: 'nowrap',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                    }}
                                  >
                                    {slot.speakerName ? `${slot.speakerName}：` : ''}
                                    {slot.dialogueText}
                                  </div>
                                </>
                              )}
                            </div>
                          </div>

                          {/* Bottom Caption Below the Slot:
                              - 如果这个是空档案，应该是有显示是为空档案
                              - 如果保存过的，下方字应该显示保存时间 */}
                          <div
                            style={{
                              marginTop: 6,
                              paddingTop: 5,
                              borderTop: '1px solid rgba(30, 58, 138, 0.45)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              fontSize: 11.5,
                            }}
                          >
                            {slot.isEmpty ? (
                              <span style={{ color: '#64748b', fontWeight: 600 }}>
                                空档案
                              </span>
                            ) : (
                              <>
                                <span style={{ color: '#bae6fd', fontWeight: 600 }}>
                                  保存时间：{slot.savedAt}
                                </span>
                                <span style={{ color: '#38bdf8', fontSize: 11 }}>
                                  {slot.isAnimatedScene ? '动画开头帧已捕获' : '静态场景截图'}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Bottom Folder Tabs: Auto、快速 以及 1 到 0 的文件夹选项卡 */}
                  <div
                    style={{
                      marginTop: 14,
                      paddingTop: 10,
                      borderTop: '1.5px solid #163e75',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 6,
                    }}
                  >
                    <span style={{ fontSize: 12, color: '#93c5fd', marginRight: 6, flexShrink: 0 }}>
                      档案文件夹选项卡：
                    </span>
                    <div style={{ display: 'flex', flex: 1, gap: 6, flexWrap: 'wrap' }}>
                      {SAVE_FOLDER_TABS.map((folder) => {
                        const isSelected = activeSaveFolder === folder;
                        // Count how many saved slots exist in this folder
                        const savedCount = Array.from({ length: 6 }, (_, idx) =>
                          saveSlots[`${folder}_${idx}`]?.isEmpty === false ? 1 : 0
                        ).reduce<number>((a, b) => a + b, 0);

                        return (
                          <button
                            key={folder}
                            onClick={() => setActiveSaveFolder(folder)}
                            style={{
                              flex: 1,
                              minWidth: 52,
                              padding: '7px 6px',
                              background: isSelected
                                ? 'linear-gradient(135deg, #0284c7, #1d4ed8)'
                                : '#060e20',
                              color: isSelected ? '#ffffff' : '#93c5fd',
                              border: `1.5px solid ${isSelected ? '#38bdf8' : '#163e75'}`,
                              borderRadius: 6,
                              fontSize: 12.5,
                              fontWeight: isSelected ? 700 : 500,
                              cursor: 'pointer',
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              gap: 2,
                            }}
                          >
                            <span>{folder}</span>
                            <span
                              style={{
                                fontSize: 9.5,
                                color: isSelected ? '#e0f2fe' : '#64748b',
                              }}
                            >
                              {savedCount}/6 档案
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* About Modal (关于界面) */}
      {aboutModalOpen && (
        <div
          onClick={() => setAboutModalOpen(false)}
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 85,
            background: 'rgba(2, 6, 16, 0.85)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 520,
              background: '#050c1d',
              border: '2px solid #163e75',
              borderRadius: 10,
              padding: 28,
              boxShadow: '0 20px 50px rgba(0,0,0,0.9)',
            }}
          >
            <div style={{ fontSize: 12, color: '#38bdf8', letterSpacing: 2, fontWeight: 700 }}>
              ABOUT MOOVN ENGINE & BLUE TEMPLATE
            </div>
            <h2 style={{ margin: '8px 0 12px 0', color: '#f8fafc', fontSize: 22 }}>
              MooVN 视觉小说引擎 · 蓝色标准模板
            </h2>
            <p style={{ fontSize: 13.5, color: '#cbd5e1', lineHeight: 1.7 }}>
              本游戏由 <strong>MooVN 视觉小说编辑器</strong> 驱动构建，采用{' '}
              <strong>TypeScript + Tauri 2 + Pixi.js + YAML</strong> 技术栈，支持 Dify
              式可视化节点工作流与 Python / TypeScript / Lua / Teal 多语言混合编程。
            </p>
            <ul style={{ fontSize: 12.5, color: '#93c5fd', lineHeight: 1.8, paddingLeft: 18 }}>
              <li>跨平台支持：Windows / Android 必选支持，iOS / macOS 原生可选构建</li>
              <li>标准档案管理：Auto、快速、1~0 共 12 个选项卡 × 6 档案/页 = 72 互通槽位</li>
              <li>多剧情线与结局：基于角色好感度与自定义属性的动态分支路由</li>
            </ul>
            <div style={{ marginTop: 18, textAlign: 'right' }}>
              <button
                onClick={() => setAboutModalOpen(false)}
                style={{
                  background: '#0284c7',
                  color: '#fff',
                  border: '1px solid #38bdf8',
                  borderRadius: 6,
                  padding: '7px 20px',
                  fontSize: 13,
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                确定
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

function formatTimestamp(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
