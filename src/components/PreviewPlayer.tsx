import { useCallback, useEffect, useMemo, useState } from "react";
import {
  X,
  RotateCcw,
  FastForward,
  Play,
  Pause,
  EyeOff,
  Settings,
  StepBack,
  Bug,
} from "lucide-react";
import type {
  ChoiceOption,
  Project,
  SaveFolderTab,
  SaveSlotData,
  SettingsSection,
} from "../types";
import { ENDING_LABELS, SAVE_FOLDER_TABS } from "../types";
import { BACKGROUNDS, backgroundById, spriteById } from "../data/assets";
import { charById, nodeById } from "../lib/projectUtils";

interface PreviewPlayerProps {
  project: Project;
  initialNodeId: string | null;
  startInMenu?: boolean;
  debugMode?: boolean;
  onClose: () => void;
}

interface HistorySnapshot {
  nodeId: string;
  lineIndex: number;
  affectionMap: Record<string, number>;
}

const SAVES_STORAGE_KEY = "moovn.blue_template.saves.v2";
const PLAYED_SCENES_KEY = "moovn.blue_template.played_scenes.v2";

function loadSavedSlots(): Record<string, SaveSlotData> {
  try {
    const raw = localStorage.getItem(SAVES_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, SaveSlotData>) : {};
  } catch {
    return {};
  }
}

function saveSlotsToStorage(slots: Record<string, SaveSlotData>) {
  try {
    localStorage.setItem(SAVES_STORAGE_KEY, JSON.stringify(slots));
  } catch {
    // ignore
  }
}

function loadPlayedScenes(): Set<string> {
  try {
    const raw = localStorage.getItem(PLAYED_SCENES_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

function persistPlayedScenes(set: Set<string>) {
  try {
    localStorage.setItem(PLAYED_SCENES_KEY, JSON.stringify([...set]));
  } catch {
    // ignore
  }
}

function formatSaveTimestamp(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export default function PreviewPlayer({
  project,
  initialNodeId,
  startInMenu = true,
  debugMode = false,
  onClose,
}: PreviewPlayerProps) {
  const firstChapterFirstSceneId = useMemo(() => {
    const firstChap = [...project.chapters].sort((a, b) => a.order - b.order)[0];
    if (firstChap) {
      const firstScene = project.nodes.find((n) => n.chapterId === firstChap.id);
      if (firstScene) return firstScene.id;
    }
    return project.startNodeId || project.nodes[0]?.id || "";
  }, [project]);

  const [screen, setScreen] = useState<"menu" | "game" | "about">(
    startInMenu && !initialNodeId ? "menu" : "game",
  );
  const [nodeId, setNodeId] = useState<string>(initialNodeId || firstChapterFirstSceneId);
  const [lineIndex, setLineIndex] = useState(0);
  const [history, setHistory] = useState<HistorySnapshot[]>([]);

  const [affectionMap, setAffectionMap] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    project.characters.forEach((c) => {
      init[c.id] = c.initialAffection;
    });
    return init;
  });

  const [playedScenes, setPlayedScenes] = useState<Set<string>>(() => loadPlayedScenes());

  const [typedCount, setTypedCount] = useState(0);
  const [autoPlay, setAutoPlay] = useState(false);
  const [skipping, setSkipping] = useState(false);
  const [uiHidden, setUiHidden] = useState(false);
  const [hideCycleKey, setHideCycleKey] = useState(0);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [frameTick, setFrameTick] = useState(0);
  const [fadeActive, setFadeActive] = useState(false);

  // 设置界面
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsSection>("general");
  const [activeFolderTab, setActiveFolderTab] = useState<SaveFolderTab>("1");
  const [saves, setSaves] = useState<Record<string, SaveSlotData>>(() => loadSavedSlots());

  // 通用与高级设置参数
  const [textSpeed, setTextSpeed] = useState(45);
  const [autoDelayMs, setAutoDelayMs] = useState(1400);
  const [bgmVolume, setBgmVolume] = useState(80);
  const [voiceVolume, setVoiceVolume] = useState(90);
  const [dialogOpacity, setDialogOpacity] = useState(92);
  const [skipUnreadAllowed, setSkipUnreadAllowed] = useState(false);

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg((cur) => (cur === msg ? null : cur)), 1800);
  }, []);

  const node = nodeById(project, nodeId);
  const line = node?.lines[lineIndex];
  const fullText = line?.text ?? "";
  const speaker = line?.characterId ? charById(project, line.characterId) : null;
  const bg = backgroundById(node?.backgroundId) ?? BACKGROUNDS[0];
  const currentChapter = project.chapters.find((c) => c.id === node?.chapterId);

  const atLastLine = !node || lineIndex >= Math.max(0, node.lines.length - 1);
  const waitingChoice = Boolean(node && node.type === "choice" && atLastLine && typedCount >= fullText.length);
  const isEnd = node?.type === "end";

  // 多图序列帧定时器
  useEffect(() => {
    const fps = node?.backgroundFps || 2;
    const t = setInterval(() => setFrameTick((n) => n + 1), Math.max(120, Math.round(1000 / fps)));
    return () => clearInterval(t);
  }, [node?.backgroundFps]);

  // 节点进入时触发 fadeConfig 动画
  useEffect(() => {
    if (!node?.fadeConfig) {
      setFadeActive(false);
      return;
    }
    setFadeActive(false);
    const id = requestAnimationFrame(() => setFadeActive(true));
    return () => cancelAnimationFrame(id);
  }, [node?.id]);

  // 记录已游玩场景 & 更新 Auto 存档
  useEffect(() => {
    if (screen !== "game" || !node) return;
    setPlayedScenes((prev) => {
      if (prev.has(node.id)) return prev;
      const next = new Set(prev);
      next.add(node.id);
      persistPlayedScenes(next);
      return next;
    });

    const bgAsset = backgroundById(node.backgroundId) ?? BACKGROUNDS[0];
    const autoSlot: SaveSlotData = {
      slotKey: "Auto-0",
      folder: "Auto",
      index: 0,
      nodeId: node.id,
      lineIndex,
      chapterTitle: currentChapter?.title ?? "第一章",
      sceneTitle: node.title,
      previewText: node.lines[lineIndex]?.text ?? node.endingDescription ?? "",
      thumbnailUrl: bgAsset.url,
      savedAt: formatSaveTimestamp(),
      affectionMap,
      playedNodeIds: [...playedScenes, node.id],
    };
    setSaves((prev) => {
      const next = { ...prev, ["Auto-0"]: autoSlot };
      saveSlotsToStorage(next);
      return next;
    });
  }, [screen, node?.id]);

  // 打字机逐字显示（若开启快进，则直接跳过逐字动画瞬间显示整句！）
  useEffect(() => {
    if (!fullText) {
      setTypedCount(0);
      return;
    }
    if (skipping) {
      setTypedCount(fullText.length);
      return;
    }
    setTypedCount(0);
    const stepMs = Math.max(10, 70 - textSpeed);
    const id = setInterval(() => {
      setTypedCount((n) => {
        if (n >= fullText.length) {
          clearInterval(id);
          return n;
        }
        return n + 1;
      });
    }, stepMs);
    return () => clearInterval(id);
  }, [nodeId, lineIndex, fullText, textSpeed, skipping]);

  const advance = useCallback(() => {
    if (!node) return;
    if (typedCount < fullText.length) {
      setTypedCount(fullText.length);
      return;
    }
    if (lineIndex < node.lines.length - 1) {
      setHistory((h) => [...h, { nodeId, lineIndex, affectionMap }]);
      setLineIndex((i) => i + 1);
      return;
    }
    if (node.type !== "choice" && node.type !== "end" && node.nextNodeId) {
      setHistory((h) => [...h, { nodeId, lineIndex, affectionMap }]);
      setNodeId(node.nextNodeId);
      setLineIndex(0);
    }
  }, [node, typedCount, fullText.length, lineIndex, nodeId, affectionMap]);

  const stepBack = useCallback(() => {
    setAutoPlay(false);
    setSkipping(false);
    setHistory((h) => {
      if (h.length === 0) return h;
      const prev = h[h.length - 1];
      setNodeId(prev.nodeId);
      setLineIndex(prev.lineIndex);
      setAffectionMap(prev.affectionMap);
      return h.slice(0, -1);
    });
  }, []);

  // 自动播放
  useEffect(() => {
    if (!autoPlay || screen !== "game" || settingsOpen || uiHidden || waitingChoice || isEnd) return;
    if (typedCount < fullText.length) return;
    const t = setTimeout(() => {
      advance();
    }, autoDelayMs);
    return () => clearTimeout(t);
  }, [autoPlay, screen, settingsOpen, uiHidden, waitingChoice, isEnd, typedCount, fullText.length, autoDelayMs, advance]);

  // 快进（自动跳过逐字显示 + 仅快进已游玩场景）
  useEffect(() => {
    if (!skipping || screen !== "game" || settingsOpen || uiHidden) return;
    if (!node || waitingChoice || isEnd) {
      setSkipping(false);
      return;
    }

    const isCurrentScenePlayed = playedScenes.has(node.id);
    if (!isCurrentScenePlayed && !skipUnreadAllowed) {
      setSkipping(false);
      return;
    }

    if (lineIndex >= node.lines.length - 1 && node.nextNodeId) {
      if (!playedScenes.has(node.nextNodeId) && !skipUnreadAllowed) {
        setTypedCount(fullText.length);
        setSkipping(false);
        return;
      }
    }

    const t = setTimeout(() => {
      setTypedCount(fullText.length);
      advance();
    }, 90);
    return () => clearTimeout(t);
  }, [
    skipping,
    screen,
    settingsOpen,
    uiHidden,
    node,
    waitingChoice,
    isEnd,
    playedScenes,
    skipUnreadAllowed,
    lineIndex,
    fullText.length,
    advance,
  ]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (settingsOpen) setSettingsOpen(false);
        else if (uiHidden) setUiHidden(false);
        else onClose();
      } else if (screen === "game" && !settingsOpen && (e.key === " " || e.key === "Enter")) {
        e.preventDefault();
        if (uiHidden) setUiHidden(false);
        else if (!waitingChoice && !isEnd) advance();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [settingsOpen, uiHidden, screen, waitingChoice, isEnd, advance, onClose]);

  const startNewGame = () => {
    const initAff: Record<string, number> = {};
    project.characters.forEach((c) => {
      initAff[c.id] = c.initialAffection;
    });
    setAffectionMap(initAff);
    setNodeId(firstChapterFirstSceneId);
    setLineIndex(0);
    setHistory([]);
    setAutoPlay(false);
    setSkipping(false);
    setUiHidden(false);
    setSettingsOpen(false);
    setScreen("game");
  };

  const pickChoice = (c: ChoiceOption) => {
    if (!c.targetNodeId) return;
    setAutoPlay(false);
    setSkipping(false);
    const nextAff = { ...affectionMap };
    if (c.affectionCharacterId && c.affectionDelta) {
      nextAff[c.affectionCharacterId] = (nextAff[c.affectionCharacterId] ?? 0) + c.affectionDelta;
    }
    setHistory((h) => [...h, { nodeId, lineIndex, affectionMap }]);
    setAffectionMap(nextAff);
    setNodeId(c.targetNodeId);
    setLineIndex(0);
  };

  const handleSaveSlot = (folder: SaveFolderTab, index: number) => {
    if (!node) return;
    const slotKey = `${folder}-${index}`;
    const bgAsset = backgroundById(node.backgroundId) ?? BACKGROUNDS[0];
    const data: SaveSlotData = {
      slotKey,
      folder,
      index,
      nodeId: node.id,
      lineIndex,
      chapterTitle: currentChapter?.title ?? "第一章",
      sceneTitle: node.title,
      previewText: node.lines[lineIndex]?.text ?? node.endingDescription ?? "",
      thumbnailUrl: bgAsset.url,
      savedAt: formatSaveTimestamp(),
      affectionMap,
      playedNodeIds: [...playedScenes],
    };
    const next = { ...saves, [slotKey]: data };
    setSaves(next);
    saveSlotsToStorage(next);
    showToast("已保存进度");
  };

  const handleLoadSlot = (folder: SaveFolderTab, index: number) => {
    const slotKey = `${folder}-${index}`;
    const data = saves[slotKey];
    if (!data) return;
    if (!nodeById(project, data.nodeId)) return;
    setNodeId(data.nodeId);
    setLineIndex(data.lineIndex);
    setAffectionMap(data.affectionMap ?? affectionMap);
    if (data.playedNodeIds) {
      const merged = new Set([...playedScenes, ...data.playedNodeIds]);
      setPlayedScenes(merged);
      persistPlayedScenes(merged);
    }
    setHistory([]);
    setAutoPlay(false);
    setSkipping(false);
    setSettingsOpen(false);
    setScreen("game");
  };

  const openSettings = (tab: SettingsSection) => {
    setAutoPlay(false);
    setSkipping(false);
    setSettingsTab(tab);
    setSettingsOpen(true);
  };

  const stagePlacements = useMemo(() => {
    if (!node) return [];
    if (node.stageCharacters && node.stageCharacters.length > 0) {
      return node.stageCharacters;
    }
    if (speaker?.spriteId) {
      return [{ characterId: speaker.id, x: 50, y: 54, scale: 1, opacity: 1, flipX: false, tween: "breathe" as const }];
    }
    return [];
  }, [node, speaker]);

  const keyVisualBg = BACKGROUNDS[1] ?? BACKGROUNDS[0];
  const heroSprite = spriteById("sp-yuki");
  const bgMediaKind = node?.backgroundMediaKind ?? bg.mediaKind ?? "static";
  const bgUrl =
    bgMediaKind === "frame_sequence" && bg.frames && bg.frames.length > 1
      ? bg.frames[frameTick % bg.frames.length]
      : bg.url;

  const fadeCfg = node?.fadeConfig;

  return (
    <div className="animate-fade-in fixed inset-0 z-50 flex items-center justify-center bg-black select-none">
      {/* 右上角极简退出预览按钮 */}
      <button
        onClick={onClose}
        title="退出游戏预览 (Esc)"
        className="fixed top-3 right-3 z-50 flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-black/70 text-zinc-300 backdrop-blur transition hover:bg-rose-500 hover:text-white"
      >
        <X size={15} />
      </button>

      {/* 开发者调试悬浮窗（仅当编辑器开启“调试模式”时显示，正式打包导出游戏绝不包含） */}
      {debugMode && screen === "game" && node && (
        <div className="fixed top-3 left-3 z-50 flex items-center gap-3 rounded-lg border border-amber-400/40 bg-black/85 px-3 py-1.5 font-mono text-[11px] text-amber-200 backdrop-blur">
          <span className="flex items-center gap-1 font-sans font-semibold text-amber-300">
            <Bug size={12} /> 开发者调试
          </span>
          <span>场景: {node.id}</span>
          <span>台词: {lineIndex + 1}/{Math.max(1, node.lines.length)}</span>
          <span>已读场景数: {playedScenes.size}</span>
          <select
            value={node.id}
            onChange={(e) => {
              setNodeId(e.target.value);
              setLineIndex(0);
            }}
            className="rounded border border-white/15 bg-zinc-900 px-1.5 py-0.5 font-sans text-[11px] text-zinc-100"
          >
            {project.nodes.map((n) => (
              <option key={n.id} value={n.id}>
                跳转: {n.title}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* 游戏主画面 (16:9) */}
      <div className="relative aspect-video w-full max-w-[1240px] overflow-hidden bg-black shadow-[0_28px_90px_rgba(0,0,0,0.9)]">
        {/* ============================================================
            1. 蓝色模板主菜单界面
               - 左侧深蓝色背景 + 5 个菜单项（开启新游戏、读取存档、设置、关于、退出游戏）
               - 左侧与中间之间为深蓝色到黑色的模糊渐变层
               - 中间与右侧为主视觉图与透明立绘
        ============================================================ */}
        {screen === "menu" && (
          <div className="relative h-full w-full overflow-hidden">
            <div className="absolute inset-y-0 right-0 left-[24%] overflow-hidden bg-black">
              <img
                src={keyVisualBg.url}
                alt={project.name}
                draggable={false}
                className="h-full w-full object-cover object-center"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-transparent to-black/25" />
              {heroSprite && (
                <img
                  src={heroSprite.url}
                  alt=""
                  draggable={false}
                  className="pointer-events-none absolute right-[10%] bottom-0 h-[92%] w-auto object-contain drop-shadow-[0_18px_40px_rgba(0,0,0,0.85)]"
                />
              )}
              <div className="pointer-events-none absolute right-8 bottom-7 text-right">
                <h1 className="text-3xl font-bold tracking-wider text-white drop-shadow-[0_4px_20px_rgba(0,0,0,0.9)]">
                  {project.name}
                </h1>
              </div>
            </div>

            {/* 深蓝色到黑色的模糊过渡层 */}
            <div
              className="pointer-events-none absolute inset-y-0 left-[24%] z-10 w-[18%] backdrop-blur-md"
              style={{
                background:
                  "linear-gradient(90deg, #07193a 0%, rgba(7, 25, 58, 0.88) 42%, rgba(0, 0, 0, 0.72) 78%, rgba(0, 0, 0, 0) 100%)",
              }}
            />

            {/* 左侧深蓝色菜单 */}
            <div className="relative z-20 flex h-full w-[30%] min-w-[230px] flex-col justify-center bg-[#07193a] px-7">
              <nav className="flex flex-col gap-3">
                {[
                  { label: "开启新游戏", action: startNewGame },
                  { label: "读取存档", action: () => openSettings("load") },
                  { label: "设置", action: () => openSettings("general") },
                  { label: "关于", action: () => setScreen("about") },
                  { label: "退出游戏", action: onClose },
                ].map((item) => (
                  <button
                    key={item.label}
                    onClick={item.action}
                    className="group relative flex items-center overflow-hidden rounded-lg border border-sky-400/20 bg-black/40 px-5 py-3 text-left transition hover:border-sky-400/75 hover:bg-black/70"
                  >
                    <span className="mr-3 h-4 w-1 rounded-full bg-transparent transition-colors group-hover:bg-sky-400" />
                    <span className="text-[15px] font-semibold tracking-wider text-zinc-100 group-hover:text-sky-200">
                      {item.label}
                    </span>
                  </button>
                ))}
              </nav>
            </div>
          </div>
        )}

        {/* ============================================================
            2. 关于页面
        ============================================================ */}
        {screen === "about" && (
          <div className="relative flex h-full w-full flex-col items-center justify-center bg-[#061229] p-8 text-center">
            <div className="max-w-md rounded-2xl border border-[#1d4ed8]/60 bg-black/85 p-8 shadow-2xl">
              <h2 className="text-2xl font-bold text-white">《{project.name}》</h2>
              {project.author && (
                <p className="mt-2 text-[13px] text-sky-300">制作：{project.author}</p>
              )}
              <button
                onClick={() => setScreen("menu")}
                className="mt-6 rounded-xl border border-sky-400/50 bg-[#0b2559] px-6 py-2 text-[13px] font-medium text-white hover:bg-sky-500"
              >
                返回主菜单
              </button>
            </div>
          </div>
        )}

        {/* ============================================================
            3. 游戏画面（无左上角场景名、无右上角对话数、无对话框底部存读档杂项）
        ============================================================ */}
        {screen === "game" && node && (
          <div
            onClick={() => {
              if (uiHidden) {
                setUiHidden(false);
                return;
              }
              if (!waitingChoice && !isEnd) advance();
            }}
            className="relative h-full w-full cursor-pointer overflow-hidden"
          >
            {/* 背景层 */}
            <img
              key={bgUrl}
              src={bgUrl}
              alt=""
              draggable={false}
              style={{
                opacity:
                  fadeActive && fadeCfg?.target === "background"
                    ? fadeCfg.direction === "out"
                      ? fadeCfg.targetOpacity
                      : 1
                    : 1,
                transition: `opacity ${fadeCfg?.durationMs ?? 600}ms ease`,
              }}
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-black/20" />

            {/* 角色透明立绘层 */}
            {stagePlacements.map((placement) => {
              const ch = charById(project, placement.characterId);
              const sp = spriteById(ch?.spriteId);
              if (!ch || !sp) return null;
              const isSpeaking = speaker?.id === ch.id;
              const isFadingChar =
                fadeActive &&
                fadeCfg?.target === "character" &&
                (!fadeCfg.characterId || fadeCfg.characterId === placement.characterId);
              const effectiveOpacity = isFadingChar
                ? fadeCfg?.direction === "out"
                  ? fadeCfg.targetOpacity
                  : 1
                : placement.opacity;

              const tweenClass =
                placement.tween === "breathe"
                  ? "animate-vn-breathe"
                  : placement.tween === "bounce"
                    ? "animate-vn-bounce"
                    : placement.tween === "float"
                      ? "animate-vn-float"
                      : placement.tween === "shake"
                        ? "animate-vn-shake"
                        : "";

              return (
                <img
                  key={placement.characterId}
                  src={sp.url}
                  alt={ch.name}
                  draggable={false}
                  style={{
                    left: `${placement.x}%`,
                    top: `${placement.y}%`,
                    transform: `translate(-50%, -45%) scale(${placement.scale * (placement.flipX ? -1 : 1)}, ${placement.scale})`,
                    opacity: effectiveOpacity,
                    transition: `all ${fadeCfg?.durationMs ?? 450}ms ease`,
                  }}
                  className={`pointer-events-none absolute h-[80%] w-auto object-contain drop-shadow-[0_18px_40px_rgba(0,0,0,0.85)] ${tweenClass} ${
                    isSpeaking ? "brightness-105" : "brightness-90"
                  }`}
                />
              );
            })}

            {/* 屏幕自由文字叠加层 */}
            {(node.screenTexts ?? []).map((st) => (
              <div
                key={st.id}
                style={{
                  left: `${st.x}%`,
                  top: `${st.y}%`,
                  transform: "translate(-50%, -50%)",
                  fontSize: `${st.fontSize}px`,
                  color: st.color,
                  fontWeight: st.fontWeight ?? "bold",
                  textAlign: st.align ?? "center",
                }}
                className="animate-fade-in pointer-events-none absolute z-15 whitespace-nowrap drop-shadow-[0_4px_18px_rgba(0,0,0,0.95)]"
              >
                {st.text}
              </div>
            ))}

            {/* 结局画面 */}
            {isEnd && !uiHidden && (
              <div
                onClick={(e) => e.stopPropagation()}
                className="animate-fade-in absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/80 p-8 text-center backdrop-blur-md"
              >
                <span className="rounded-full border border-sky-400/40 bg-sky-500/15 px-3.5 py-1 text-[12px] font-semibold text-sky-200">
                  {ENDING_LABELS[node.endingKind ?? "normal"]}
                </span>
                <h2 className="mt-3 text-3xl font-bold text-white">{node.title}</h2>
                <p className="mt-3 max-w-lg text-[15px] leading-relaxed text-zinc-200">
                  {node.endingDescription || "感谢游玩，故事在此落下帷幕。"}
                </p>
                <div className="mt-7 flex items-center gap-3">
                  <button
                    onClick={startNewGame}
                    className="flex h-10 items-center gap-2 rounded-xl bg-sky-500 px-5 text-[13px] font-semibold text-white hover:bg-sky-400"
                  >
                    <RotateCcw size={14} /> 重新开始
                  </button>
                  <button
                    onClick={() => setScreen("menu")}
                    className="flex h-10 items-center gap-2 rounded-xl border border-[#1d4ed8] bg-black px-5 text-[13px] text-zinc-200 hover:bg-white/10"
                  >
                    返回主菜单
                  </button>
                </div>
              </div>
            )}

            {/* 底部对话框与左上方分支选项 */}
            {!isEnd && !uiHidden && (
              <div
                onClick={(e) => e.stopPropagation()}
                className="absolute right-6 bottom-4 left-6 z-20 flex flex-col items-start"
              >
                {/* 对话框左上方分支选项（未超过屏幕宽度绝不换行 + 悬停左侧浅蓝竖条） */}
                {waitingChoice && (
                  <div className="mb-3 flex max-w-full flex-col items-start gap-2">
                    {node.choices.map((c) => (
                      <button
                        key={c.id}
                        disabled={!c.targetNodeId}
                        onClick={() => pickChoice(c)}
                        className="group relative flex max-w-[calc(100vw-4rem)] items-center overflow-x-auto rounded-lg border-2 border-[#1d4ed8] bg-black/95 px-4 py-2.5 text-left text-[14px] font-medium whitespace-nowrap text-zinc-100 shadow-[0_10px_30px_rgba(0,0,0,0.85)] transition hover:border-sky-400 disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        <span className="mr-3 h-4 w-1 shrink-0 rounded-full bg-transparent transition-colors group-hover:bg-sky-400" />
                        <span className="whitespace-nowrap">{c.text}</span>
                      </button>
                    ))}
                  </div>
                )}

                {/* 对话框主体（黑色背景 + 深蓝色边框，无右上角对话数） */}
                <div
                  style={{ backgroundColor: `rgba(0, 0, 0, ${dialogOpacity / 100})` }}
                  className="w-full rounded-xl border-2 border-[#1d4ed8] px-6 pt-4 pb-2.5 shadow-[0_16px_50px_rgba(0,0,0,0.9)]"
                >
                  <div className="mb-1">
                    <span
                      className="text-[14px] font-bold tracking-wide"
                      style={{ color: speaker?.color ?? "#93c5fd" }}
                    >
                      {speaker ? speaker.name : "旁白"}
                    </span>
                  </div>

                  <div
                    onClick={() => {
                      if (!waitingChoice) advance();
                    }}
                    className="min-h-[3.2rem] cursor-pointer text-[15.5px] leading-relaxed text-zinc-100"
                  >
                    {fullText.slice(0, typedCount)}
                  </div>

                  {/* 对话框下方仅保留 5 个标准按钮：后退、自动、快进、隐藏、设置 */}
                  <div className="mt-2 flex items-center justify-end gap-2 border-t border-[#1e3a8a]/50 pt-2">
                    <button
                      onClick={stepBack}
                      disabled={history.length === 0}
                      className="flex items-center gap-1 rounded border border-[#1d4ed8]/70 bg-black px-3 py-1 text-[12px] font-medium text-zinc-200 transition hover:border-sky-400 hover:text-sky-300 disabled:opacity-35"
                    >
                      <StepBack size={12} /> 后退
                    </button>
                    <button
                      onClick={() => {
                        setSkipping(false);
                        setAutoPlay((v) => !v);
                      }}
                      className={`flex items-center gap-1 rounded border px-3 py-1 text-[12px] font-medium transition ${
                        autoPlay
                          ? "border-sky-400 bg-sky-500/25 text-sky-200"
                          : "border-[#1d4ed8]/70 bg-black text-zinc-200 hover:border-sky-400 hover:text-sky-300"
                      }`}
                    >
                      {autoPlay ? <Pause size={12} /> : <Play size={12} />} 自动
                    </button>
                    <button
                      onClick={() => {
                        setAutoPlay(false);
                        setSkipping((v) => !v);
                      }}
                      className={`flex items-center gap-1 rounded border px-3 py-1 text-[12px] font-medium transition ${
                        skipping
                          ? "border-sky-400 bg-sky-500/25 text-sky-200"
                          : "border-[#1d4ed8]/70 bg-black text-zinc-200 hover:border-sky-400 hover:text-sky-300"
                      }`}
                    >
                      <FastForward size={12} /> 快进
                    </button>
                    <button
                      onClick={() => {
                        setAutoPlay(false);
                        setSkipping(false);
                        setHideCycleKey((k) => k + 1);
                        setUiHidden(true);
                      }}
                      className="flex items-center gap-1 rounded border border-[#1d4ed8]/70 bg-black px-3 py-1 text-[12px] font-medium text-zinc-200 transition hover:border-sky-400 hover:text-sky-300"
                    >
                      <EyeOff size={12} /> 隐藏
                    </button>
                    <button
                      onClick={() => openSettings("general")}
                      className="flex items-center gap-1 rounded border border-[#1d4ed8]/70 bg-black px-3 py-1 text-[12px] font-medium text-zinc-200 transition hover:border-sky-400 hover:text-sky-300"
                    >
                      <Settings size={12} /> 设置
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* 隐藏 UI 提示：隐藏后等待片刻慢慢显示一次，随后平滑淡出消失 */}
            {uiHidden && (
              <div
                key={hideCycleKey}
                className="animate-hide-hint-once pointer-events-none absolute bottom-7 left-1/2 z-30 rounded-full border border-[#1d4ed8]/70 bg-black/80 px-4 py-1.5 text-[12px] text-sky-100"
              >
                点击画面任意位置恢复对话框
              </div>
            )}
          </div>
        )}

        {/* ============================================================
            4. 设置界面（通用设置、高级设置、读档、存档、退出到菜单）
               - 去除所有多余说明字样
               - 上方与中间为 3 排档案槽位（共 6 个），底部为 Auto、快速、1~0 文件夹标签
        ============================================================ */}
        {settingsOpen && (
          <div
            onClick={() => setSettingsOpen(false)}
            className="animate-fade-in absolute inset-0 z-30 flex items-center justify-center bg-black/80 p-5 backdrop-blur-md"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="flex h-full w-full max-w-[960px] flex-col overflow-hidden rounded-2xl border-2 border-[#1d4ed8] bg-[#050d1f] shadow-2xl"
            >
              <div className="flex h-12 shrink-0 items-center justify-between border-b border-[#1e3a8a] bg-[#081738] px-4">
                <div className="flex items-center gap-1.5">
                  {(
                    [
                      { id: "general", label: "通用设置" },
                      { id: "advanced", label: "高级设置" },
                      { id: "load", label: "读档" },
                      { id: "save", label: "存档" },
                    ] as { id: SettingsSection; label: string }[]
                  ).map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setSettingsTab(t.id)}
                      className={`rounded-lg px-4 py-1.5 text-[13px] font-semibold transition ${
                        settingsTab === t.id
                          ? "bg-sky-500 text-white shadow"
                          : "text-zinc-300 hover:bg-white/10"
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                  <button
                    onClick={() => {
                      setSettingsOpen(false);
                      setAutoPlay(false);
                      setSkipping(false);
                      setScreen("menu");
                    }}
                    className="ml-2 rounded-lg border border-amber-400/35 bg-amber-400/10 px-4 py-1.5 text-[13px] font-semibold text-amber-200 transition hover:bg-amber-400/20"
                  >
                    退出到菜单
                  </button>
                </div>

                <button
                  onClick={() => setSettingsOpen(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-300 hover:bg-white/10 hover:text-white"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="flex min-h-0 flex-1 flex-col p-5">
                {settingsTab === "general" && (
                  <div className="mx-auto flex w-full max-w-xl flex-col gap-5 py-4">
                    <div className="rounded-xl border border-[#1e3a8a] bg-black/60 p-4">
                      <div className="mb-2 flex justify-between text-[13px]">
                        <span className="font-semibold text-zinc-200">文字速度</span>
                        <span className="font-mono text-sky-300">{textSpeed}</span>
                      </div>
                      <input
                        type="range"
                        min={15}
                        max={65}
                        value={textSpeed}
                        onChange={(e) => setTextSpeed(Number(e.target.value))}
                        className="w-full accent-sky-400"
                      />
                    </div>

                    <div className="rounded-xl border border-[#1e3a8a] bg-black/60 p-4">
                      <div className="mb-2 flex justify-between text-[13px]">
                        <span className="font-semibold text-zinc-200">自动推进间隔</span>
                        <span className="font-mono text-sky-300">{(autoDelayMs / 1000).toFixed(1)}s</span>
                      </div>
                      <input
                        type="range"
                        min={600}
                        max={3500}
                        step={100}
                        value={autoDelayMs}
                        onChange={(e) => setAutoDelayMs(Number(e.target.value))}
                        className="w-full accent-sky-400"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="rounded-xl border border-[#1e3a8a] bg-black/60 p-4">
                        <div className="mb-2 flex justify-between text-[13px]">
                          <span className="font-semibold text-zinc-200">音乐音量</span>
                          <span className="font-mono text-sky-300">{bgmVolume}%</span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          value={bgmVolume}
                          onChange={(e) => setBgmVolume(Number(e.target.value))}
                          className="w-full accent-sky-400"
                        />
                      </div>
                      <div className="rounded-xl border border-[#1e3a8a] bg-black/60 p-4">
                        <div className="mb-2 flex justify-between text-[13px]">
                          <span className="font-semibold text-zinc-200">语音音量</span>
                          <span className="font-mono text-sky-300">{voiceVolume}%</span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          value={voiceVolume}
                          onChange={(e) => setVoiceVolume(Number(e.target.value))}
                          className="w-full accent-sky-400"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {settingsTab === "advanced" && (
                  <div className="mx-auto flex w-full max-w-xl flex-col gap-5 py-4">
                    <div className="rounded-xl border border-[#1e3a8a] bg-black/60 p-4">
                      <div className="mb-2 flex justify-between text-[13px]">
                        <span className="font-semibold text-zinc-200">对话框不透明度</span>
                        <span className="font-mono text-sky-300">{dialogOpacity}%</span>
                      </div>
                      <input
                        type="range"
                        min={55}
                        max={100}
                        value={dialogOpacity}
                        onChange={(e) => setDialogOpacity(Number(e.target.value))}
                        className="w-full accent-sky-400"
                      />
                    </div>

                    <div className="flex items-center justify-between rounded-xl border border-[#1e3a8a] bg-black/60 p-4">
                      <span className="text-[13px] font-semibold text-zinc-200">快进范围</span>
                      <button
                        onClick={() => setSkipUnreadAllowed((v) => !v)}
                        className={`rounded-lg px-3.5 py-1.5 text-[12px] font-semibold transition ${
                          skipUnreadAllowed
                            ? "bg-amber-500/20 text-amber-200"
                            : "bg-sky-500/20 text-sky-200"
                        }`}
                      >
                        {skipUnreadAllowed ? "允许快进未读场景" : "仅快进已游玩场景"}
                      </button>
                    </div>
                  </div>
                )}

                {/* 读档 / 存档：清爽 3 排档案槽 + 底部文件夹标签（无任何多余说明文字） */}
                {(settingsTab === "load" || settingsTab === "save") && (
                  <div className="flex min-h-0 flex-1 flex-col justify-between">
                    <div className="grid min-h-0 flex-1 grid-cols-2 grid-rows-3 gap-3">
                      {Array.from({ length: 6 }).map((_, idx) => {
                        const slotKey = `${activeFolderTab}-${idx}`;
                        const slot = saves[slotKey];
                        return (
                          <button
                            key={slotKey}
                            onClick={() => {
                              if (settingsTab === "save") {
                                if (screen === "game") handleSaveSlot(activeFolderTab, idx);
                              } else {
                                handleLoadSlot(activeFolderTab, idx);
                              }
                            }}
                            className="group relative flex overflow-hidden rounded-xl border-2 border-[#1e3a8a] bg-black/85 p-2.5 text-left transition hover:border-sky-400"
                          >
                            {slot ? (
                              <div className="flex h-full w-full items-center gap-3.5">
                                <div className="flex h-full w-40 shrink-0 flex-col overflow-hidden rounded-lg border border-white/15 bg-zinc-950">
                                  <img
                                    src={slot.thumbnailUrl}
                                    alt=""
                                    className="min-h-0 flex-1 w-full object-cover"
                                  />
                                  <div className="bg-[#081738] px-1.5 py-0.5 text-center font-mono text-[10px] text-sky-200">
                                    {slot.savedAt}
                                  </div>
                                </div>

                                <div className="flex min-w-0 flex-1 flex-col justify-center h-full py-0.5">
                                  <div className="truncate text-[13.5px] font-bold text-white">
                                    {slot.sceneTitle}
                                  </div>
                                  <p className="mt-1 line-clamp-2 text-[12px] text-zinc-300">
                                    {slot.previewText}
                                  </p>
                                </div>
                              </div>
                            ) : (
                              <div className="flex h-full w-full items-center justify-center rounded-lg border border-dashed border-[#1e3a8a]/60 bg-[#040a18]/60">
                                <span className="text-[15px] font-semibold tracking-widest text-zinc-500 group-hover:text-sky-300">
                                  空档案
                                </span>
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>

                    <div className="mt-3.5 flex items-center justify-center gap-1.5 border-t border-[#1e3a8a] pt-3">
                      {SAVE_FOLDER_TABS.map((folder) => {
                        const active = activeFolderTab === folder;
                        const hasAny = Array.from({ length: 6 }).some(
                          (_, i) => Boolean(saves[`${folder}-${i}`]),
                        );
                        return (
                          <button
                            key={folder}
                            onClick={() => setActiveFolderTab(folder)}
                            className={`relative min-w-11 rounded-lg border px-3 py-1.5 font-mono text-[12px] font-bold transition ${
                              active
                                ? "border-sky-400 bg-sky-500 text-white shadow-[0_0_14px_rgba(56,189,248,0.45)]"
                                : "border-[#1e3a8a] bg-[#081738] text-zinc-300 hover:border-sky-400/60 hover:text-white"
                            }`}
                          >
                            {folder}
                            {hasAny && !active && (
                              <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-sky-400" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {toastMsg && (
          <div className="animate-pop-in pointer-events-none absolute top-4 right-14 z-40 rounded-lg border border-sky-400/50 bg-[#081738]/95 px-3.5 py-1.5 text-[12px] font-medium text-sky-100 shadow-xl">
            {toastMsg}
          </div>
        )}
      </div>
    </div>
  );
}
