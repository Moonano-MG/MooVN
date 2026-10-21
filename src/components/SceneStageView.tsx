import { useEffect, useRef, useState } from "react";
import * as PIXI from "pixi.js";
import {
  UserPlus,
  Trash2,
  FlipHorizontal2,
  Move,
  Type,
  Sparkles,
  Film,
} from "lucide-react";
import type { Editor } from "../hooks/useEditor";
import type { MediaKind, TweenPreset } from "../types";
import { BACKGROUNDS, backgroundById, spriteById } from "../data/assets";
import { charById } from "../lib/projectUtils";

interface SceneStageViewProps {
  editor: Editor;
  notify: (msg: string) => void;
}

export default function SceneStageView({ editor, notify }: SceneStageViewProps) {
  const { project, selectedNode } = editor;
  const stageRef = useRef<HTMLDivElement>(null);
  const pixiHostRef = useRef<HTMLDivElement>(null);
  const [selectedCharId, setSelectedCharId] = useState<string | null>(null);
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
  const [activeLineIdx, setActiveLineIdx] = useState(0);
  const [frameTick, setFrameTick] = useState(0);
  const [fadePreviewPlaying, setFadePreviewPlaying] = useState(false);

  useEffect(() => {
    setActiveLineIdx(0);
    setSelectedTextId(null);
    if (selectedNode?.stageCharacters[0]) {
      setSelectedCharId(selectedNode.stageCharacters[0].characterId);
    } else {
      setSelectedCharId(null);
    }
  }, [selectedNode?.id]);

  // 多图片序列帧定时器（驱动多图动画）
  useEffect(() => {
    const fps = selectedNode?.backgroundFps || 2;
    const interval = Math.max(120, Math.round(1000 / fps));
    const t = setInterval(() => {
      setFrameTick((n) => n + 1);
    }, interval);
    return () => clearInterval(t);
  }, [selectedNode?.backgroundFps]);

  // Pixi.js 粒子与动态视频流氛围层（樱花/夜雨/萤火虫）
  useEffect(() => {
    const host = pixiHostRef.current;
    if (!host) return;

    let destroyed = false;
    const app = new PIXI.Application();

    (async () => {
      try {
        await app.init({
          width: 960,
          height: 540,
          backgroundAlpha: 0,
          antialias: true,
        });
        if (destroyed || !host) {
          app.destroy(true);
          return;
        }
        host.innerHTML = "";
        const canvas = app.canvas as HTMLCanvasElement;
        canvas.style.width = "100%";
        canvas.style.height = "100%";
        canvas.style.pointerEvents = "none";
        host.appendChild(canvas);

        const isRain = selectedNode?.backgroundId === "bg-cafe" || selectedNode?.backgroundMediaKind === "video";
        const particles: { g: PIXI.Graphics; vx: number; vy: number }[] = [];
        for (let i = 0; i < (isRain ? 45 : 26); i++) {
          const g = new PIXI.Graphics();
          if (isRain) {
            g.rect(0, 0, 1.5, 14 + Math.random() * 10);
            g.fill({ color: 0x93c5fd, alpha: 0.35 + Math.random() * 0.3 });
          } else {
            g.circle(0, 0, 1.8 + Math.random() * 2.4);
            g.fill({ color: 0xfde2e8, alpha: 0.4 + Math.random() * 0.35 });
          }
          g.x = Math.random() * 960;
          g.y = Math.random() * 540;
          app.stage.addChild(g);
          particles.push({
            g,
            vx: isRain ? -1.2 : -0.3 - Math.random() * 0.4,
            vy: isRain ? 7 + Math.random() * 4 : 0.35 + Math.random() * 0.5,
          });
        }

        app.ticker.add(() => {
          for (const p of particles) {
            p.g.x += p.vx;
            p.g.y += p.vy;
            if (p.g.y > 545) p.g.y = -10;
            if (p.g.x < -10) p.g.x = 965;
          }
        });
      } catch {
        // Fallback silently
      }
    })();

    return () => {
      destroyed = true;
      try {
        app.destroy(true);
      } catch {
        // ignore
      }
    };
  }, [selectedNode?.backgroundId, selectedNode?.backgroundMediaKind]);

  if (!selectedNode) {
    return (
      <div className="flex h-full flex-1 items-center justify-center bg-[#09090b] text-[12.5px] text-zinc-500">
        请在左侧或工作流中选择一个场景以编辑舞台
      </div>
    );
  }

  const bg = backgroundById(selectedNode.backgroundId) ?? BACKGROUNDS[0];
  const bgMediaKind = selectedNode.backgroundMediaKind ?? bg.mediaKind ?? "static";
  const bgUrl =
    bgMediaKind === "frame_sequence" && bg.frames && bg.frames.length > 1
      ? bg.frames[frameTick % bg.frames.length]
      : bg.url;

  const currentLine = selectedNode.lines[activeLineIdx] ?? selectedNode.lines[0];
  const speaker = currentLine?.characterId ? charById(project, currentLine.characterId) : null;

  // 拖拽角色立绘
  const startDragCharacter = (e: React.MouseEvent, characterId: string, initX: number, initY: number) => {
    e.stopPropagation();
    setSelectedCharId(characterId);
    setSelectedTextId(null);
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    const startClientX = e.clientX;
    const startClientY = e.clientY;

    const onMove = (ev: MouseEvent) => {
      const dxPct = ((ev.clientX - startClientX) / rect.width) * 100;
      const dyPct = ((ev.clientY - startClientY) / rect.height) * 100;
      const nextX = Math.max(5, Math.min(95, Math.round(initX + dxPct)));
      const nextY = Math.max(10, Math.min(92, Math.round(initY + dyPct)));
      editor.upsertStageCharacter(selectedNode.id, characterId, { x: nextX, y: nextY });
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // 拖拽屏幕自由文字
  const startDragScreenText = (e: React.MouseEvent, textId: string, initX: number, initY: number) => {
    e.stopPropagation();
    setSelectedTextId(textId);
    setSelectedCharId(null);
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    const startClientX = e.clientX;
    const startClientY = e.clientY;

    const onMove = (ev: MouseEvent) => {
      const dxPct = ((ev.clientX - startClientX) / rect.width) * 100;
      const dyPct = ((ev.clientY - startClientY) / rect.height) * 100;
      const nextX = Math.max(5, Math.min(95, Math.round(initX + dxPct)));
      const nextY = Math.max(6, Math.min(90, Math.round(initY + dyPct)));
      editor.updateScreenText(selectedNode.id, textId, { x: nextX, y: nextY });
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const selectedPlacement = selectedNode.stageCharacters.find((sc) => sc.characterId === selectedCharId);
  const selectedScreenText = (selectedNode.screenTexts ?? []).find((st) => st.id === selectedTextId);

  const fadeCfg = selectedNode.fadeConfig;
  const screenFadeAlpha =
    fadePreviewPlaying && fadeCfg?.target === "screen"
      ? fadeCfg.direction === "out"
        ? 1 - fadeCfg.targetOpacity
        : 0
      : 0;

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col bg-[#09090b] select-none">
      {/* 顶部舞台工具条（无任何重复的试玩或导出按钮） */}
      <div className="flex h-10 shrink-0 flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] bg-[#101014] px-3">
        <div className="flex items-center gap-1.5">
          {/* 角色上下场 */}
          {project.characters
            .filter((c) => c.spriteId)
            .map((ch) => {
              const onStage = selectedNode.stageCharacters.some((sc) => sc.characterId === ch.id);
              return (
                <button
                  key={ch.id}
                  onClick={() => {
                    if (onStage) {
                      editor.removeStageCharacter(selectedNode.id, ch.id);
                    } else {
                      const count = selectedNode.stageCharacters.length;
                      const defaultX = count === 0 ? 50 : count === 1 ? 30 : 70;
                      editor.upsertStageCharacter(selectedNode.id, ch.id, {
                        x: defaultX,
                        y: 54,
                        scale: 1,
                        opacity: 1,
                        tween: "breathe",
                      });
                      setSelectedCharId(ch.id);
                    }
                  }}
                  className={`flex h-7 items-center gap-1 rounded-lg border px-2 text-[11px] font-medium transition ${
                    onStage
                      ? "border-sky-400/40 bg-sky-500/15 text-sky-200"
                      : "border-white/10 bg-white/[0.04] text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  <UserPlus size={11} />
                  {ch.name}
                </button>
              );
            })}
        </div>

        <div className="flex items-center gap-1.5">
          {/* 背景动画模式选择 */}
          <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[11px]">
            <Film size={11} className="text-sky-400" />
            <select
              value={bgMediaKind}
              onChange={(e) =>
                editor.updateNode(selectedNode.id, { backgroundMediaKind: e.target.value as MediaKind })
              }
              className="bg-transparent text-zinc-200 outline-none"
            >
              <option value="static" className="bg-zinc-900">静态背景</option>
              <option value="frame_sequence" className="bg-zinc-900">多图片序列帧动画</option>
              <option value="video" className="bg-zinc-900">视频/动态雨幕流</option>
              <option value="tween" className="bg-zinc-900">粒子补间动画</option>
            </select>
          </div>

          {/* 新增屏幕文字 */}
          <button
            onClick={() => {
              editor.addScreenText(selectedNode.id, {
                text: "双击或下方修改屏幕文字",
                x: 50,
                y: 24,
                fontSize: 28,
                color: "#ffffff",
              });
              notify("已在舞台中央新增可拖拽屏幕文字");
            }}
            className="flex h-7 items-center gap-1 rounded-lg border border-pink-400/35 bg-pink-500/15 px-2.5 text-[11px] font-medium text-pink-200 hover:bg-pink-500/25"
          >
            <Type size={11} /> + 屏幕文字
          </button>

          {/* 淡入淡出效果设置/预览 */}
          <button
            onClick={() => {
              if (!selectedNode.fadeConfig) {
                editor.updateNode(selectedNode.id, {
                  fadeConfig: {
                    target: "character",
                    characterId: selectedNode.stageCharacters[0]?.characterId ?? "c-yuki",
                    direction: "out",
                    durationMs: 700,
                    targetOpacity: 0,
                  },
                });
              }
              setFadePreviewPlaying(true);
              setTimeout(() => setFadePreviewPlaying(false), selectedNode.fadeConfig?.durationMs ?? 800);
            }}
            className="flex h-7 items-center gap-1 rounded-lg border border-cyan-400/35 bg-cyan-500/15 px-2.5 text-[11px] font-medium text-cyan-200 hover:bg-cyan-500/25"
          >
            <Sparkles size={11} /> 淡入淡出预览
          </button>
        </div>
      </div>

      {/* 主舞台区域（支持从左侧资源面板直接拖入背景或角色到任意坐标） */}
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center p-3">
        <div
          ref={stageRef}
          onClick={() => {
            setSelectedCharId(null);
            setSelectedTextId(null);
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const raw = e.dataTransfer.getData("application/moovn-asset");
            if (!raw) return;
            try {
              const data = JSON.parse(raw);
              const rect = stageRef.current?.getBoundingClientRect();
              const xPct = rect ? Math.round(((e.clientX - rect.left) / rect.width) * 100) : 50;
              const yPct = rect ? Math.round(((e.clientY - rect.top) / rect.height) * 100) : 54;
              if (data.type === "bg") {
                editor.updateNode(selectedNode.id, { backgroundId: data.id });
                notify("已拖入并切换舞台背景");
              } else if (data.type === "character" || data.type === "sprite") {
                const charId =
                  data.id ||
                  project.characters.find((c) => c.spriteId === data.spriteId)?.id ||
                  project.characters[0]?.id;
                if (charId) {
                  editor.upsertStageCharacter(selectedNode.id, charId, {
                    x: Math.max(10, Math.min(90, xPct)),
                    y: Math.max(15, Math.min(88, yPct)),
                  });
                  setSelectedCharId(charId);
                  notify("已将角色拖放到舞台指定坐标");
                }
              }
            } catch {
              // ignore
            }
          }}
          className="relative aspect-video w-full max-w-[920px] overflow-hidden rounded-2xl border border-white/12 bg-black shadow-[0_20px_60px_rgba(0,0,0,0.75)]"
        >
          {/* 背景层（支持静态、多图序列帧切换、淡出预览） */}
          <img
            src={bgUrl}
            alt={bg.name}
            draggable={false}
            style={{
              opacity:
                fadePreviewPlaying && fadeCfg?.target === "background"
                  ? fadeCfg.direction === "out"
                    ? fadeCfg.targetOpacity
                    : 1
                  : 1,
              transition: `opacity ${fadeCfg?.durationMs ?? 600}ms ease`,
            }}
            className={`absolute inset-0 h-full w-full object-cover ${
              bgMediaKind === "tween" ? "scale-105 transition-transform duration-1000" : ""
            }`}
          />

          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/65 via-transparent to-black/20" />

          {/* Pixi.js 动态粒子/雨幕层 */}
          <div ref={pixiHostRef} className="pointer-events-none absolute inset-0" />

          {/* 舞台角色立绘层（真实透明通道 PNG + 可拖拽 + 补间/多帧动画 + 淡入淡出） */}
          {selectedNode.stageCharacters.map((placement) => {
            const ch = charById(project, placement.characterId);
            const sp = spriteById(ch?.spriteId);
            if (!ch || !sp) return null;
            const isSelected = selectedCharId === placement.characterId;
            const isFadingChar =
              fadePreviewPlaying &&
              fadeCfg?.target === "character" &&
              (!fadeCfg.characterId || fadeCfg.characterId === placement.characterId);
            const effectiveOpacity = isFadingChar
              ? fadeCfg?.direction === "out"
                ? fadeCfg.targetOpacity
                : 1
              : placement.opacity;

            const spriteUrl =
              placement.mediaKind === "frame_sequence" && sp.frames && sp.frames.length > 1
                ? sp.frames[frameTick % sp.frames.length]
                : sp.url;

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
              <div
                key={placement.characterId}
                onMouseDown={(e) => startDragCharacter(e, placement.characterId, placement.x, placement.y)}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedCharId(placement.characterId);
                  setSelectedTextId(null);
                }}
                style={{
                  left: `${placement.x}%`,
                  top: `${placement.y}%`,
                  transform: `translate(-50%, -45%) scale(${placement.scale * (placement.flipX ? -1 : 1)}, ${placement.scale})`,
                  opacity: effectiveOpacity,
                  transition: isFadingChar ? `opacity ${fadeCfg?.durationMs ?? 600}ms ease` : undefined,
                }}
                className={`group absolute cursor-grab active:cursor-grabbing ${
                  isSelected ? "z-20" : "z-10"
                }`}
              >
                <img
                  src={spriteUrl}
                  alt={ch.name}
                  draggable={false}
                  className={`h-[340px] w-auto object-contain drop-shadow-[0_16px_32px_rgba(0,0,0,0.75)] ${tweenClass}`}
                />
                <div
                  style={{ transform: placement.flipX ? "scaleX(-1)" : undefined }}
                  className={`pointer-events-none absolute -top-6 left-1/2 -translate-x-1/2 flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-medium whitespace-nowrap shadow-lg transition ${
                    isSelected
                      ? "bg-sky-500 text-white opacity-100"
                      : "bg-black/75 text-zinc-200 opacity-0 group-hover:opacity-100"
                  }`}
                >
                  <Move size={10} />
                  {ch.name} ({placement.x}%, {placement.y}%)
                </div>
              </div>
            );
          })}

          {/* 屏幕自由文字层（可直接在舞台上自由拖拽移动位置、修改字号与颜色） */}
          {(selectedNode.screenTexts ?? []).map((st) => {
            const isSel = selectedTextId === st.id;
            return (
              <div
                key={st.id}
                onMouseDown={(e) => startDragScreenText(e, st.id, st.x, st.y)}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedTextId(st.id);
                  setSelectedCharId(null);
                }}
                style={{
                  left: `${st.x}%`,
                  top: `${st.y}%`,
                  transform: "translate(-50%, -50%)",
                  fontSize: `${st.fontSize}px`,
                  color: st.color,
                  fontWeight: st.fontWeight ?? "bold",
                  textAlign: st.align ?? "center",
                }}
                className={`absolute z-30 cursor-grab rounded-lg px-3 py-1 whitespace-nowrap drop-shadow-[0_4px_16px_rgba(0,0,0,0.95)] active:cursor-grabbing ${
                  isSel ? "ring-2 ring-pink-400 bg-black/35" : "hover:bg-black/20"
                }`}
              >
                {st.text}
              </div>
            );
          })}

          {/* 整屏淡入淡出遮罩层 */}
          <div
            style={{
              opacity: screenFadeAlpha,
              transition: `opacity ${fadeCfg?.durationMs ?? 600}ms ease`,
            }}
            className="pointer-events-none absolute inset-0 z-30 bg-black"
          />

          {/* 底部对话框实时预览（简洁无多余编号） */}
          <div className="pointer-events-none absolute right-5 bottom-4 left-5 z-20">
            <div className="rounded-xl border-2 border-[#1d4ed8]/85 bg-black/90 px-5 py-3 shadow-[0_12px_40px_rgba(0,0,0,0.85)]">
              <div className="mb-1">
                <span
                  className="text-[13px] font-bold tracking-wide"
                  style={{ color: speaker?.color ?? "#93c5fd" }}
                >
                  {speaker ? speaker.name : "旁白"}
                </span>
              </div>
              <p className="min-h-[2.2rem] text-[14px] leading-relaxed text-zinc-100">
                {currentLine?.text || "（当前场景暂无台词）"}
              </p>
            </div>
          </div>
        </div>

        {/* 底部控制面板：根据选中的是“角色”、“屏幕文字”或“淡入淡出”动态显示属性调整 */}
        <div className="mt-2.5 flex w-full max-w-[920px] flex-wrap items-center justify-between gap-2 rounded-xl border border-white/[0.07] bg-[#121216] px-3.5 py-2 text-[11.5px]">
          {selectedScreenText ? (
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="font-semibold text-pink-300">屏幕文字：</span>
              <input
                value={selectedScreenText.text}
                onChange={(e) =>
                  editor.updateScreenText(selectedNode.id, selectedScreenText.id, { text: e.target.value })
                }
                className="field w-44 rounded border border-white/15 bg-zinc-900 px-2 py-0.5 text-zinc-100"
              />
              <label className="flex items-center gap-1 text-zinc-400">
                大小
                <input
                  type="number"
                  min={12}
                  max={72}
                  value={selectedScreenText.fontSize}
                  onChange={(e) =>
                    editor.updateScreenText(selectedNode.id, selectedScreenText.id, {
                      fontSize: Number(e.target.value),
                    })
                  }
                  className="field w-13 rounded border border-white/15 bg-zinc-900 px-1 py-0.5 text-center text-zinc-100"
                />
                px
              </label>
              <label className="flex items-center gap-1 text-zinc-400">
                颜色
                <input
                  type="color"
                  value={selectedScreenText.color}
                  onChange={(e) =>
                    editor.updateScreenText(selectedNode.id, selectedScreenText.id, { color: e.target.value })
                  }
                  className="h-5 w-6 cursor-pointer rounded border border-white/15 bg-transparent"
                />
              </label>
              <label className="flex items-center gap-1 text-zinc-400">
                X%
                <input
                  type="number"
                  value={selectedScreenText.x}
                  onChange={(e) =>
                    editor.updateScreenText(selectedNode.id, selectedScreenText.id, { x: Number(e.target.value) })
                  }
                  className="field w-12 rounded border border-white/15 bg-zinc-900 px-1 py-0.5 text-center text-zinc-100"
                />
              </label>
              <label className="flex items-center gap-1 text-zinc-400">
                Y%
                <input
                  type="number"
                  value={selectedScreenText.y}
                  onChange={(e) =>
                    editor.updateScreenText(selectedNode.id, selectedScreenText.id, { y: Number(e.target.value) })
                  }
                  className="field w-12 rounded border border-white/15 bg-zinc-900 px-1 py-0.5 text-center text-zinc-100"
                />
              </label>
              <button
                onClick={() => {
                  editor.removeScreenText(selectedNode.id, selectedScreenText.id);
                  setSelectedTextId(null);
                }}
                className="flex items-center gap-1 rounded px-2 py-0.5 text-rose-300 hover:bg-rose-500/20"
              >
                <Trash2 size={11} /> 删除文字
              </button>
            </div>
          ) : selectedPlacement ? (
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-semibold text-sky-300">
                {charById(project, selectedPlacement.characterId)?.name}
              </span>
              <label className="flex items-center gap-1 text-zinc-400">
                X
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={selectedPlacement.x}
                  onChange={(e) =>
                    editor.upsertStageCharacter(selectedNode.id, selectedPlacement.characterId, {
                      x: Number(e.target.value),
                    })
                  }
                  className="field w-12 rounded border border-white/10 bg-zinc-900 px-1 py-0.5 text-center text-zinc-100"
                />
              </label>
              <label className="flex items-center gap-1 text-zinc-400">
                Y
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={selectedPlacement.y}
                  onChange={(e) =>
                    editor.upsertStageCharacter(selectedNode.id, selectedPlacement.characterId, {
                      y: Number(e.target.value),
                    })
                  }
                  className="field w-12 rounded border border-white/10 bg-zinc-900 px-1 py-0.5 text-center text-zinc-100"
                />
              </label>
              <label className="flex items-center gap-1 text-zinc-400">
                缩放
                <input
                  type="range"
                  min={0.6}
                  max={1.4}
                  step={0.05}
                  value={selectedPlacement.scale}
                  onChange={(e) =>
                    editor.upsertStageCharacter(selectedNode.id, selectedPlacement.characterId, {
                      scale: Number(e.target.value),
                    })
                  }
                  className="w-20 accent-sky-400"
                />
              </label>
              <label className="flex items-center gap-1 text-zinc-400">
                透明度
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={selectedPlacement.opacity}
                  onChange={(e) =>
                    editor.upsertStageCharacter(selectedNode.id, selectedPlacement.characterId, {
                      opacity: Number(e.target.value),
                    })
                  }
                  className="w-18 accent-sky-400"
                />
              </label>
              <select
                value={selectedPlacement.tween ?? "breathe"}
                onChange={(e) =>
                  editor.upsertStageCharacter(selectedNode.id, selectedPlacement.characterId, {
                    tween: e.target.value as TweenPreset,
                  })
                }
                className="rounded border border-white/10 bg-zinc-900 px-2 py-0.5 text-zinc-200"
              >
                <option value="none">静态无动作</option>
                <option value="breathe">呼吸律动</option>
                <option value="bounce">跳跃动画</option>
                <option value="float">悬浮动画</option>
                <option value="shake">震动动画</option>
              </select>
              <button
                onClick={() =>
                  editor.upsertStageCharacter(selectedNode.id, selectedPlacement.characterId, {
                    flipX: !selectedPlacement.flipX,
                  })
                }
                className="flex items-center gap-1 rounded border border-white/10 bg-white/[0.04] px-2 py-0.5 text-zinc-200 hover:bg-white/[0.08]"
              >
                <FlipHorizontal2 size={11} /> 翻转
              </button>
              <button
                onClick={() => {
                  editor.removeStageCharacter(selectedNode.id, selectedPlacement.characterId);
                  setSelectedCharId(null);
                }}
                className="flex items-center gap-1 rounded px-2 py-0.5 text-rose-300 hover:bg-rose-500/15"
              >
                <Trash2 size={11} /> 移出
              </button>
            </div>
          ) : (
            <div className="text-zinc-400">
              可直接拖拽舞台上的角色或屏幕文字调整位置；也可从左侧资源栏拖入背景与立绘
            </div>
          )}

          {selectedNode.lines.length > 1 && (
            <div className="flex items-center gap-1">
              {selectedNode.lines.map((line, i) => (
                <button
                  key={line.id}
                  onClick={() => setActiveLineIdx(i)}
                  className={`h-5 w-5 rounded font-mono text-[10.5px] transition ${
                    activeLineIdx === i
                      ? "bg-sky-500 text-white"
                      : "bg-white/[0.05] text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {i + 1}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
