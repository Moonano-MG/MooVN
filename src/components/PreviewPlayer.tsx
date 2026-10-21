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
  Sparkles,
  Heart,
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
    // ignore quota errors
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

  // 角色实时好感度状态
  const [affectionMap, setAffectionMap] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    project.characters.forEach((c) => {
      init[c.id] = c.initialAffection;
    });
    return init;
  });

  // 玩家已游玩过的场景集合（用于控制“快进”仅能跳过已游玩场景）
  const [playedScenes, setPlayedScenes] = useState<Set<string>>(() => loadPlayedScenes());

  // 打字机与播放状态
  const [typedCount, setTypedCount] = useState(0);
  const [autoPlay, setAutoPlay] = useState(false);
  const [skipping, setSkipping] = useState(false);
  const [uiHidden, setUiHidden] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // 设置面板（通用设置 / 高级设置 / 读档 / 存档 / 退出到菜单）
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsSection>("general");
  const [activeFolderTab, setActiveFolderTab] = useState<SaveFolderTab>("1");
  const [saves, setSaves] = useState<Record<string, SaveSlotData>>(() => loadSavedSlots());

  // 通用与高级设置参数
  const [textSpeed, setTextSpeed] = useState(42); // ms per char (越小越快)
  const [autoDelayMs, setAutoDelayMs] = useState(1400);
  const [bgmVolume, setBgmVolume] = useState(80);
  const [voiceVolume, setVoiceVolume] = useState(90);
  const [dialogOpacity, setDialogOpacity] = useState(92);
  const [skipUnreadAllowed, setSkipUnreadAllowed] = useState(false);

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg((cur) => (cur === msg ? null : cur)), 2000);
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

  // 记录已游玩过的场景 & 写入 Auto 存档
  useEffect(() => {
    if (screen !== "game" || !node) return;
    setPlayedScenes((prev) => {
      if (prev.has(node.id)) return prev;
      const next = new Set(prev);
      next.add(node.id);
      persistPlayedScenes(next);
      return next;
    });

    // 自动更新 Auto 文件夹第 1 槽位
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

  // 打字机逐字推进
  useEffect(() => {
    setTypedCount(0);
    if (!fullText) return;
    const stepMs = Math.max(12, 70 - textSpeed);
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
  }, [nodeId, lineIndex, fullText, textSpeed]);

  // 推进到下一句或下一场景
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

  // 后退（回到上一幕/上一句）
  const stepBack = useCallback(() => {
    setAutoPlay(false);
    setSkipping(false);
    setHistory((h) => {
      if (h.length === 0) {
        showToast("已经在故事起点，无法继续后退");
        return h;
      }
      const prev = h[h.length - 1];
      setNodeId(prev.nodeId);
      setLineIndex(prev.lineIndex);
      setAffectionMap(prev.affectionMap);
      return h.slice(0, -1);
    });
  }, [showToast]);

  // 自动播放（根据文字速度与停留时间自动推进）
  useEffect(() => {
    if (!autoPlay || screen !== "game" || settingsOpen || uiHidden || waitingChoice || isEnd) return;
    if (typedCount < fullText.length) return;
    const t = setTimeout(() => {
      advance();
    }, autoDelayMs);
    return () => clearTimeout(t);
  }, [autoPlay, screen, settingsOpen, uiHidden, waitingChoice, isEnd, typedCount, fullText.length, autoDelayMs, advance]);

  // 快进（仅允许快进已经游玩过的场景；遇到未游玩过的场景或分支选项自动停止）
  useEffect(() => {
    if (!skipping || screen !== "game" || settingsOpen || uiHidden) return;
    if (!node || waitingChoice || isEnd) {
      setSkipping(false);
      return;
    }

    // 检查下一场景是否已游玩过
    const isCurrentScenePlayed = playedScenes.has(node.id);
    if (!isCurrentScenePlayed && !skipUnreadAllowed) {
      setSkipping(false);
      showToast("已到达尚未游玩的场景，快进自动停止");
      return;
    }

    // 如果当前是场景最后一句，检查即将进入的下一场景是否已读
    if (lineIndex >= node.lines.length - 1 && node.nextNodeId) {
      if (!playedScenes.has(node.nextNodeId) && !skipUnreadAllowed) {
        setTypedCount(fullText.length);
        setSkipping(false);
        showToast("下一场景尚未游玩，快进已停止");
        return;
      }
    }

    const t = setTimeout(() => {
      if (typedCount < fullText.length) {
        setTypedCount(fullText.length);
      } else {
        advance();
      }
    }, 110);
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
    typedCount,
    fullText.length,
    advance,
    showToast,
  ]);

  // 键盘快捷键
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

  // 开启新游戏（从第一章第一幕开始）
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

  // 选择分支
  const pickChoice = (c: ChoiceOption) => {
    if (!c.targetNodeId) return;
    setAutoPlay(false);
    setSkipping(false);
    const nextAff = { ...affectionMap };
    if (c.affectionCharacterId && c.affectionDelta) {
      nextAff[c.affectionCharacterId] = (nextAff[c.affectionCharacterId] ?? 0) + c.affectionDelta;
      const ch = charById(project, c.affectionCharacterId);
      if (ch) {
        showToast(`${ch.name} 好感度 ${c.affectionDelta > 0 ? `+${c.affectionDelta}` : c.affectionDelta}`);
      }
    }
    setHistory((h) => [...h, { nodeId, lineIndex, affectionMap }]);
    setAffectionMap(nextAff);
    setNodeId(c.targetNodeId);
    setLineIndex(0);
  };

  // 执行存档
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
    showToast(`已保存至档案 [${folder} - 0${index + 1}]`);
  };

  // 执行读档（存档与读档槽位互通）
  const handleLoadSlot = (folder: SaveFolderTab, index: number) => {
    const slotKey = `${folder}-${index}`;
    const data = saves[slotKey];
    if (!data) {
      showToast("该档案槽位为空档案");
      return;
    }
    if (!nodeById(project, data.nodeId)) {
      showToast("该存档对应的场景在当前工程中不存在");
      return;
    }
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
    showToast(`已读取档案 [${folder} - 0${index + 1}]`);
  };

  // 打开设置指定分页
  const openSettings = (tab: SettingsSection) => {
    setAutoPlay(false);
    setSkipping(false);
    setSettingsTab(tab);
    setSettingsOpen(true);
  };

  // 当前在场立绘（优先使用舞台配置的 stageCharacters，否则根据当前说话人自动展示）
  const stagePlacements = useMemo(() => {
    if (!node) return [];
    if (node.stageCharacters && node.stageCharacters.length > 0) {
      return node.stageCharacters;
    }
    if (speaker?.spriteId) {
      return [{ characterId: speaker.id, x: 50, y: 52, scale: 1, opacity: 1, flipX: false }];
    }
    return [];
  }, [node, speaker]);

  const keyVisualBg = BACKGROUNDS[1] ?? BACKGROUNDS[0];
  const heroSprite = spriteById("sp-yuki");

  return (
    <div className="animate-fade-in fixed inset-0 z-50 flex flex-col bg-black select-none">
      {/* 顶部编辑器返回栏 */}
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-white/10 bg-[#070b14] px-4 text-[12px]">
        <div className="flex items-center gap-2.5">
          <span className="flex items-center gap-1.5 rounded-full bg-sky-500/20 px-2.5 py-0.5 text-[11px] font-semibold text-sky-300">
            <Sparkles size={11} /> 蓝色模板 · 实机运行预览
          </span>
          <span className="font-semibold text-zinc-200">《{project.name}》</span>
          {screen === "game" && node && (
            <>
              <span className="text-zinc-600">·</span>
              <span className="text-zinc-400">
                {currentChapter?.title} / {node.title}
              </span>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* 角色好感度速览 */}
          {screen === "game" && (
            <div className="hidden items-center gap-3 mr-2 md:flex">
              {project.characters
                .filter((c) => c.spriteId)
                .map((c) => (
                  <span key={c.id} className="flex items-center gap-1 text-[11px] text-zinc-300">
                    <Heart size={11} className="text-rose-400" fill="currentColor" />
                    {c.name}: <strong className="text-sky-300">{affectionMap[c.id] ?? c.initialAffection}</strong>
                  </span>
                ))}
            </div>
          )}

          {screen !== "menu" && (
            <button
              onClick={() => {
                setAutoPlay(false);
                setSkipping(false);
                setScreen("menu");
              }}
              className="flex h-7 items-center gap-1 rounded-lg border border-white/10 bg-white/[0.05] px-2.5 text-zinc-200 hover:bg-white/10"
            >
              返回主菜单
            </button>
          )}
          <button
            onClick={onClose}
            className="flex h-7 items-center gap-1 rounded-lg bg-rose-500/20 px-2.5 text-rose-200 hover:bg-rose-500 hover:text-white"
          >
            <X size={13} /> 退出预览 (Esc)
          </button>
        </div>
      </div>

      {/* 主舞台容器 */}
      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-[#04070f] p-3 sm:p-5">
        <div className="relative aspect-video w-full max-w-[1180px] overflow-hidden rounded-2xl border border-[#1e3a8a]/50 bg-black shadow-[0_28px_90px_rgba(0,0,0,0.85)]">
          {/* ============================================================
              1. 蓝色模板主菜单界面
                 - 左边深蓝色背景 + 菜单选项（开启新游戏、读取存档、设置、关于、退出游戏）
                 - 左边与中间之间为深蓝色到黑色的模糊渐变层
                 - 中间与右边为精美主视觉图
          ============================================================ */}
          {screen === "menu" && (
            <div className="relative h-full w-full overflow-hidden">
              {/* 中间与右侧：主视觉背景与角色立绘 */}
              <div className="absolute inset-y-0 right-0 left-[24%] overflow-hidden bg-black">
                <img
                  src={keyVisualBg.url}
                  alt={project.name}
                  draggable={false}
                  className="h-full w-full object-cover object-center scale-105 transition duration-700"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-transparent to-black/25" />
                {heroSprite && (
                  <img
                    src={heroSprite.url}
                    alt="主角立绘"
                    draggable={false}
                    className="pointer-events-none absolute right-[10%] bottom-0 h-[92%] w-auto object-contain drop-shadow-[0_18px_40px_rgba(0,0,0,0.85)]"
                  />
                )}
                {/* 右下角作品标题装饰 */}
                <div className="pointer-events-none absolute right-8 bottom-7 text-right">
                  <div className="text-[11px] font-semibold tracking-[0.28em] text-sky-300/80 uppercase">
                    BLUE TEMPLATE VISUAL NOVEL
                  </div>
                  <h1 className="mt-1 text-3xl font-bold tracking-wider text-white drop-shadow-[0_4px_20px_rgba(0,0,0,0.9)]">
                    《{project.name}》
                  </h1>
                  <p className="mt-1 text-[12px] text-zinc-300/85">
                    Version {project.version} · {project.chapters.length} Chapters
                  </p>
                </div>
              </div>

              {/* 左边与中间之间的模糊过渡层（从深蓝色渐变到黑色） */}
              <div
                className="pointer-events-none absolute inset-y-0 left-[24%] z-10 w-[18%] backdrop-blur-md"
                style={{
                  background:
                    "linear-gradient(90deg, #07193a 0%, rgba(7, 25, 58, 0.88) 42%, rgba(0, 0, 0, 0.72) 78%, rgba(0, 0, 0, 0) 100%)",
                }}
              />

              {/* 左侧深蓝色主菜单栏 */}
              <div className="relative z-20 flex h-full w-[30%] min-w-[240px] flex-col justify-between bg-[#07193a] px-7 py-9">
                <div>
                  <div className="text-[11px] font-semibold tracking-[0.25em] text-sky-300/80 uppercase">
                    MAIN MENU
                  </div>
                  <div className="mt-1.5 text-xl font-bold tracking-wide text-white">
                    {project.name}
                  </div>
                  <div className="mt-2 h-0.5 w-12 rounded-full bg-sky-400/70" />
                </div>

                {/* 从上到下依次：开启新游戏、读取存档、设置、关于、退出游戏 */}
                <nav className="flex flex-col gap-3">
                  {[
                    { label: "开启新游戏", sub: "START NEW GAME", action: startNewGame },
                    { label: "读取存档", sub: "LOAD DATA", action: () => openSettings("load") },
                    { label: "设置", sub: "CONFIG", action: () => openSettings("general") },
                    { label: "关于", sub: "ABOUT", action: () => setScreen("about") },
                    { label: "退出游戏", sub: "EXIT GAME", action: onClose },
                  ].map((item) => (
                    <button
                      key={item.label}
                      onClick={item.action}
                      className="group relative flex items-center justify-between overflow-hidden rounded-lg border border-sky-400/20 bg-black/35 px-4 py-3 text-left transition hover:border-sky-400/70 hover:bg-black/65"
                    >
                      <span className="absolute inset-y-1.5 left-1.5 w-1 rounded-full bg-sky-400 opacity-0 transition group-hover:opacity-100" />
                      <span className="pl-2 text-[15px] font-semibold tracking-wider text-zinc-100 group-hover:text-sky-200">
                        {item.label}
                      </span>
                      <span className="font-mono text-[10px] tracking-widest text-sky-300/45 group-hover:text-sky-300/80">
                        {item.sub}
                      </span>
                    </button>
                  ))}
                </nav>

                <div className="text-[11px] text-sky-200/45">
                  Powered by MooVN Engine
                </div>
              </div>
            </div>
          )}

          {/* ============================================================
              2. 关于页面
          ============================================================ */}
          {screen === "about" && (
            <div className="relative flex h-full w-full flex-col items-center justify-center bg-[#061229] p-8 text-center">
              <div className="max-w-lg rounded-2xl border border-[#1d4ed8]/60 bg-black/85 p-8 shadow-2xl">
                <h2 className="text-2xl font-bold text-white">关于《{project.name}》</h2>
                <p className="mt-2 text-[13px] text-sky-300">
                  作者：{project.author || "MooVN 创作者"} · 版本 {project.version}
                </p>
                <p className="mt-4 text-[13.5px] leading-relaxed text-zinc-300">
                  本作使用 MooVN 视觉小说编辑器与标准蓝色游戏模板构建，支持多章节剧情线、角色好感度与自定义属性分支、多结局以及 12 组档案夹（Auto / 快速 / 1~0）× 6 槽位互通存取档系统。
                </p>
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
              3. 游戏内舞台画面
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
              {/* 场景背景 */}
              {bg && (
                <img
                  key={bg.id}
                  src={bg.url}
                  alt={bg.name}
                  draggable={false}
                  className="animate-fade-in absolute inset-0 h-full w-full object-cover"
                />
              )}
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-black/25" />

              {/* 舞台角色立绘 */}
              {stagePlacements.map((placement) => {
                const ch = charById(project, placement.characterId);
                const sp = spriteById(ch?.spriteId);
                if (!ch || !sp) return null;
                const isSpeaking = speaker?.id === ch.id;
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
                      opacity: placement.opacity,
                    }}
                    className={`pointer-events-none absolute h-[78%] w-auto object-contain drop-shadow-[0_18px_40px_rgba(0,0,0,0.8)] transition duration-300 ${
                      isSpeaking ? "brightness-105" : "brightness-90"
                    }`}
                  />
                );
              })}

              {/* 顶部章节与场景角标（未隐藏 UI 时显示） */}
              {!uiHidden && (
                <div className="pointer-events-none absolute top-4 left-5 z-10 flex items-center gap-2 rounded-lg border border-[#1d4ed8]/60 bg-black/80 px-3 py-1.5 text-[12px] text-zinc-200 backdrop-blur-md">
                  <span className="font-semibold text-sky-300">{currentChapter?.title}</span>
                  <span className="text-zinc-600">·</span>
                  <span>{node.title}</span>
                  {playedScenes.has(node.id) && (
                    <span className="ml-1 rounded bg-sky-500/20 px-1.5 py-0.5 text-[10px] text-sky-300">
                      已读
                    </span>
                  )}
                </div>
              )}

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
                  <p className="mt-3 max-w-lg text-[14.5px] leading-relaxed text-zinc-200">
                    {node.endingDescription || "感谢游玩，故事在此落下帷幕。"}
                  </p>
                  <div className="mt-7 flex items-center gap-3">
                    <button
                      onClick={startNewGame}
                      className="flex h-10 items-center gap-2 rounded-xl bg-sky-500 px-5 text-[13px] font-semibold text-white hover:bg-sky-400"
                    >
                      <RotateCcw size={14} /> 从第一章重新开始
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

              {/* ============================================================
                  对话框与左侧上方分支选项
                  - 选项位于对话框左边上面
                  - 如果字数未超过屏幕宽度，严禁提前换行 (whitespace-nowrap)
                  - 对话框与选项背景为黑色，边框为深蓝色 (#1d4ed8)
                  - 鼠标悬停在选项上时，选项文字左边出现浅蓝色竖条 (bg-sky-400)
              ============================================================ */}
              {!isEnd && !uiHidden && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="absolute right-5 bottom-4 left-5 z-20 flex flex-col items-start"
                >
                  {/* 对话框左上方：分支选项列表 */}
                  {waitingChoice && (
                    <div className="mb-3 flex max-w-full flex-col items-start gap-2">
                      {node.choices.map((c, idx) => (
                        <button
                          key={c.id}
                          disabled={!c.targetNodeId}
                          onClick={() => pickChoice(c)}
                          className="group relative flex max-w-[calc(100vw-4rem)] items-center overflow-x-auto rounded-lg border-2 border-[#1d4ed8] bg-black/95 px-4 py-2.5 text-left text-[14px] font-medium whitespace-nowrap text-zinc-100 shadow-[0_10px_30px_rgba(0,0,0,0.85)] transition hover:border-sky-400 disabled:cursor-not-allowed disabled:opacity-45"
                        >
                          {/* 悬停时文字左侧的浅蓝色竖条 */}
                          <span className="mr-3 h-4 w-1 shrink-0 rounded-full bg-transparent transition-colors group-hover:bg-sky-400" />
                          <span className="whitespace-nowrap">
                            {idx + 1}. {c.text}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* 底部对话框（黑色背景 + 深蓝色边框） */}
                  <div
                    style={{ backgroundColor: `rgba(0, 0, 0, ${dialogOpacity / 100})` }}
                    className="w-full rounded-xl border-2 border-[#1d4ed8] px-6 pt-4 pb-3 shadow-[0_16px_50px_rgba(0,0,0,0.9)]"
                  >
                    {/* 说话人名称与台词进度 */}
                    <div className="mb-1.5 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className="text-[14px] font-bold tracking-wide"
                          style={{ color: speaker?.color ?? "#93c5fd" }}
                        >
                          {speaker ? speaker.name : "旁白"}
                        </span>
                      </div>
                      <span className="font-mono text-[11px] text-zinc-500">
                        {lineIndex + 1} / {Math.max(1, node.lines.length)}
                      </span>
                    </div>

                    {/* 台词正文 */}
                    <div
                      onClick={() => {
                        if (!waitingChoice) advance();
                      }}
                      className="min-h-[3.2rem] cursor-pointer text-[15.5px] leading-relaxed text-zinc-100"
                    >
                      {fullText.slice(0, typedCount)}
                      {typedCount < fullText.length && (
                        <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-sky-400 align-middle" />
                      )}
                    </div>

                    {/* 对话框下方的五个标准控制按钮：后退、自动、快进、隐藏、设置 */}
                    <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-[#1e3a8a]/55 pt-2">
                      <div className="flex items-center gap-1.5 text-[11.5px] text-zinc-500">
                        <button
                          onClick={() => openSettings("save")}
                          className="rounded border border-[#1e3a8a]/70 bg-[#07152e] px-2.5 py-1 text-sky-200 transition hover:border-sky-400 hover:text-white"
                        >
                          存档
                        </button>
                        <button
                          onClick={() => openSettings("load")}
                          className="rounded border border-[#1e3a8a]/70 bg-[#07152e] px-2.5 py-1 text-sky-200 transition hover:border-sky-400 hover:text-white"
                        >
                          读档
                        </button>
                        <button
                          onClick={() => handleSaveSlot("快速", 0)}
                          className="rounded border border-[#1e3a8a]/70 bg-[#07152e] px-2.5 py-1 text-zinc-300 transition hover:border-sky-400 hover:text-white"
                        >
                          快存 (Q.Save)
                        </button>
                        <button
                          onClick={() => handleLoadSlot("快速", 0)}
                          className="rounded border border-[#1e3a8a]/70 bg-[#07152e] px-2.5 py-1 text-zinc-300 transition hover:border-sky-400 hover:text-white"
                        >
                          快读 (Q.Load)
                        </button>
                      </div>

                      <div className="flex items-center gap-1.5">
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
                </div>
              )}

              {/* 隐藏 UI 时的轻提示 */}
              {uiHidden && (
                <div className="pointer-events-none absolute right-4 bottom-3 rounded bg-black/60 px-2.5 py-1 text-[11px] text-zinc-300">
                  点击画面任意位置或按 Esc 恢复对话框
                </div>
              )}
            </div>
          )}

          {/* ============================================================
              4. 设置与互通存读档中心（通用设置、高级设置、读档、存档、退出到菜单）
                 - 上面与中间显示 3 排档案槽位（每页 6 个槽位：3 排 × 2 列）
                 - 底部显示从 Auto、快速、1 到 0 的文件夹标签
                 - 空槽位显示“空档案”，有存档显示画面缩略图 + 底部存档时间
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
                {/* 顶部导航栏：通用设置 / 高级设置 / 读档 / 存档 / 退出到菜单 */}
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
                        className={`rounded-lg px-3.5 py-1.5 text-[13px] font-semibold transition ${
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
                      className="ml-2 rounded-lg border border-amber-400/35 bg-amber-400/10 px-3.5 py-1.5 text-[13px] font-semibold text-amber-200 transition hover:bg-amber-400/20"
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

                {/* 内容区 */}
                <div className="flex min-h-0 flex-1 flex-col p-5">
                  {/* 通用设置 */}
                  {settingsTab === "general" && (
                    <div className="mx-auto flex w-full max-w-xl flex-col gap-5 py-4">
                      <div className="rounded-xl border border-[#1e3a8a] bg-black/60 p-4">
                        <div className="mb-2 flex justify-between text-[13px]">
                          <span className="font-semibold text-zinc-200">文字显示速度</span>
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
                          <span className="font-semibold text-zinc-200">自动播放等待间隔</span>
                          <span className="font-mono text-sky-300">{(autoDelayMs / 1000).toFixed(1)} 秒</span>
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
                            <span className="font-semibold text-zinc-200">背景音乐音量</span>
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
                            <span className="font-semibold text-zinc-200">角色语音音量</span>
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

                  {/* 高级设置 */}
                  {settingsTab === "advanced" && (
                    <div className="mx-auto flex w-full max-w-xl flex-col gap-5 py-4">
                      <div className="rounded-xl border border-[#1e3a8a] bg-black/60 p-4">
                        <div className="mb-2 flex justify-between text-[13px]">
                          <span className="font-semibold text-zinc-200">对话框背景不透明度</span>
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
                        <div>
                          <div className="text-[13px] font-semibold text-zinc-200">
                            快进模式规则（默认仅快进已游玩过的场景）
                          </div>
                          <div className="mt-1 text-[11.5px] text-zinc-400">
                            默认开启保护：若从场景 1 开始快进且历史只游玩到场景 10，到达场景 10 后自动停止快进
                          </div>
                        </div>
                        <button
                          onClick={() => setSkipUnreadAllowed((v) => !v)}
                          className={`rounded-lg px-3 py-1.5 text-[12px] font-semibold transition ${
                            skipUnreadAllowed
                              ? "bg-amber-500/20 text-amber-200"
                              : "bg-sky-500/20 text-sky-200"
                          }`}
                        >
                          {skipUnreadAllowed ? "允许跳过未读" : "仅跳过已游玩场景"}
                        </button>
                      </div>

                      <div className="flex items-center justify-between rounded-xl border border-[#1e3a8a] bg-black/60 p-4">
                        <div>
                          <div className="text-[13px] font-semibold text-zinc-200">
                            已游玩场景记录 ({playedScenes.size} / {project.nodes.length})
                          </div>
                          <div className="mt-1 text-[11.5px] text-zinc-400">
                            清空后，所有场景将恢复为“未游玩”状态
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            const empty = new Set<string>();
                            setPlayedScenes(empty);
                            persistPlayedScenes(empty);
                            showToast("已重置已读场景记录");
                          }}
                          className="rounded-lg border border-rose-400/30 bg-rose-500/15 px-3 py-1.5 text-[12px] text-rose-200 hover:bg-rose-500/25"
                        >
                          重置已读记录
                        </button>
                      </div>
                    </div>
                  )}

                  {/* 读档 / 存档 互通视图（上方与中间 3 排共 6 个档案槽，底部为 Auto、快速、1~0 文件夹标签） */}
                  {(settingsTab === "load" || settingsTab === "save") && (
                    <div className="flex min-h-0 flex-1 flex-col justify-between">
                      <div className="mb-2 flex items-center justify-between text-[12px] text-zinc-400">
                        <span>
                          当前档案夹：<strong className="text-sky-300">[{activeFolderTab}]</strong> ·{" "}
                          {settingsTab === "save"
                            ? "点击任意槽位写入当前进度（与读档互通）"
                            : "点击已保存的档案槽位即可读取进度"}
                        </span>
                        <span>共 3 排 × 2 列（每夹 6 个槽位）</span>
                      </div>

                      {/* 上面和中间：3 排档案（3 rows × 2 cols = 6 slots） */}
                      <div className="grid min-h-0 flex-1 grid-cols-2 grid-rows-3 gap-3">
                        {Array.from({ length: 6 }).map((_, idx) => {
                          const slotKey = `${activeFolderTab}-${idx}`;
                          const slot = saves[slotKey];
                          return (
                            <button
                              key={slotKey}
                              onClick={() => {
                                if (settingsTab === "save") {
                                  if (screen !== "game") {
                                    showToast("请先进入游戏画面后再执行存档");
                                    return;
                                  }
                                  handleSaveSlot(activeFolderTab, idx);
                                } else {
                                  handleLoadSlot(activeFolderTab, idx);
                                }
                              }}
                              className="group relative flex overflow-hidden rounded-xl border-2 border-[#1e3a8a] bg-black/85 p-2.5 text-left transition hover:border-sky-400"
                            >
                              {slot ? (
                                <div className="flex h-full w-full items-center gap-3.5">
                                  {/* 左侧画面缩略图 + 底下存档时间 */}
                                  <div className="flex h-full w-40 shrink-0 flex-col overflow-hidden rounded-lg border border-white/15 bg-zinc-950">
                                    <img
                                      src={slot.thumbnailUrl}
                                      alt={slot.sceneTitle}
                                      className="min-h-0 flex-1 w-full object-cover"
                                    />
                                    <div className="bg-[#081738] px-1.5 py-0.5 text-center font-mono text-[10px] text-sky-200">
                                      {slot.savedAt}
                                    </div>
                                  </div>

                                  {/* 右侧章节与台词摘要 */}
                                  <div className="flex min-w-0 flex-1 flex-col justify-between h-full py-0.5">
                                    <div>
                                      <div className="flex items-center justify-between">
                                        <span className="font-mono text-[11px] font-bold text-sky-400">
                                          NO. {activeFolderTab}-0{idx + 1}
                                        </span>
                                        <span className="truncate text-[11px] text-zinc-400">
                                          {slot.chapterTitle}
                                        </span>
                                      </div>
                                      <div className="mt-1 truncate text-[13.5px] font-bold text-white">
                                        {slot.sceneTitle}
                                      </div>
                                      <p className="mt-1 line-clamp-2 text-[12px] text-zinc-300">
                                        {slot.previewText}
                                      </p>
                                    </div>
                                    <div className="text-[10.5px] text-sky-300/70">
                                      {settingsTab === "save" ? "点击覆盖此档案" : "点击读取此档案"}
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                /* 空槽位：显示“空档案” */
                                <div className="flex h-full w-full flex-col items-center justify-center rounded-lg border border-dashed border-[#1e3a8a]/60 bg-[#040a18]/60">
                                  <span className="font-mono text-[11px] text-zinc-600">
                                    NO. {activeFolderTab}-0{idx + 1}
                                  </span>
                                  <span className="mt-1 text-[15px] font-semibold tracking-widest text-zinc-500 group-hover:text-sky-300">
                                    空档案
                                  </span>
                                </div>
                              )}
                            </button>
                          );
                        })}
                      </div>

                      {/* 底部：从 Auto、快速、1 到 0 的 12 个文件夹标签 */}
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

          {/* 轻提示浮层 */}
          {toastMsg && (
            <div className="animate-pop-in pointer-events-none absolute top-4 right-5 z-40 rounded-lg border border-sky-400/50 bg-[#081738]/95 px-3.5 py-1.5 text-[12px] font-medium text-sky-100 shadow-xl">
              {toastMsg}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
