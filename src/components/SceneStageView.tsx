import { useEffect, useRef, useState } from "react";
import * as PIXI from "pixi.js";
import {
  UserPlus,
  Trash2,
  FlipHorizontal2,
  FileCode2,
  Play,
  Move,
  Sparkles,
} from "lucide-react";
import type { Editor } from "../hooks/useEditor";
import { BACKGROUNDS, backgroundById, spriteById } from "../data/assets";
import { charById } from "../lib/projectUtils";

interface SceneStageViewProps {
  editor: Editor;
  onExportSceneYaml: () => void;
  onPreviewFrom: (nodeId: string) => void;
  notify: (msg: string) => void;
}

export default function SceneStageView({
  editor,
  onExportSceneYaml,
  onPreviewFrom,
  notify,
}: SceneStageViewProps) {
  const { project, selectedNode } = editor;
  const stageRef = useRef<HTMLDivElement>(null);
  const pixiHostRef = useRef<HTMLDivElement>(null);
  const [selectedCharId, setSelectedCharId] = useState<string | null>(null);
  const [activeLineIdx, setActiveLineIdx] = useState(0);

  useEffect(() => {
    setActiveLineIdx(0);
    if (selectedNode?.stageCharacters[0]) {
      setSelectedCharId(selectedNode.stageCharacters[0].characterId);
    } else {
      setSelectedCharId(null);
    }
  }, [selectedNode?.id]);

  // Pixi.js 轻量氛围粒子层（樱花/光尘微粒）
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

        const particles: { g: PIXI.Graphics; vx: number; vy: number }[] = [];
        for (let i = 0; i < 24; i++) {
          const g = new PIXI.Graphics();
          g.circle(0, 0, 1.5 + Math.random() * 2.2);
          g.fill({ color: 0xfde2e8, alpha: 0.35 + Math.random() * 0.35 });
          g.x = Math.random() * 960;
          g.y = Math.random() * 540;
          app.stage.addChild(g);
          particles.push({
            g,
            vx: -0.25 - Math.random() * 0.35,
            vy: 0.3 + Math.random() * 0.45,
          });
        }

        app.ticker.add(() => {
          for (const p of particles) {
            p.g.x += p.vx;
            p.g.y += p.vy;
            if (p.g.y > 545) p.g.y = -5;
            if (p.g.x < -5) p.g.x = 965;
          }
        });
      } catch {
        // Fallback silently if WebGL is unavailable
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
  }, []);

  if (!selectedNode) {
    return (
      <div className="flex flex-1 items-center justify-center bg-[#09090b] text-[13px] text-zinc-500">
        请在左侧「章节场景」中选择一个场景以打开可视化舞台
      </div>
    );
  }

  const bg = backgroundById(selectedNode.backgroundId) ?? BACKGROUNDS[0];
  const currentLine = selectedNode.lines[activeLineIdx] ?? selectedNode.lines[0];
  const speaker = currentLine?.characterId ? charById(project, currentLine.characterId) : null;

  const startDragCharacter = (e: React.MouseEvent, characterId: string, initX: number, initY: number) => {
    e.stopPropagation();
    setSelectedCharId(characterId);
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    const startClientX = e.clientX;
    const startClientY = e.clientY;

    const onMove = (ev: MouseEvent) => {
      const dxPct = ((ev.clientX - startClientX) / rect.width) * 100;
      const dyPct = ((ev.clientY - startClientY) / rect.height) * 100;
      const nextX = Math.max(8, Math.min(92, Math.round(initX + dxPct)));
      const nextY = Math.max(15, Math.min(90, Math.round(initY + dyPct)));
      editor.upsertStageCharacter(selectedNode.id, characterId, { x: nextX, y: nextY });
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const selectedPlacement = selectedNode.stageCharacters.find((sc) => sc.characterId === selectedCharId);

  return (
    <div className="flex min-w-0 flex-1 flex-col bg-[#09090b]">
      {/* 顶部工具栏 */}
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-white/[0.06] bg-[#101014] px-4">
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-sky-400" />
          <span className="text-[13px] font-semibold text-zinc-100">{selectedNode.title}</span>
          <span className="rounded bg-white/[0.06] px-2 py-0.5 text-[11px] text-zinc-400">
            在画布中直接拖拽角色调整坐标，自动同步至场景 YAML
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* 添加角色上场 */}
          <div className="flex items-center gap-1">
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
                        notify(`已将「${ch.name}」移出当前场景舞台`);
                      } else {
                        const count = selectedNode.stageCharacters.length;
                        const defaultX = count === 0 ? 50 : count === 1 ? 30 : 70;
                        editor.upsertStageCharacter(selectedNode.id, ch.id, {
                          x: defaultX,
                          y: 52,
                          scale: 1,
                          opacity: 1,
                        });
                        setSelectedCharId(ch.id);
                        notify(`已将「${ch.name}」放置到舞台`);
                      }
                    }}
                    className={`flex h-7 items-center gap-1 rounded-lg border px-2.5 text-[11.5px] font-medium transition ${
                      onStage
                        ? "border-sky-400/40 bg-sky-500/15 text-sky-200"
                        : "border-white/10 bg-white/[0.04] text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    <UserPlus size={12} />
                    {ch.name}
                    {onStage ? " (在场)" : ""}
                  </button>
                );
              })}
          </div>

          <div className="h-4 w-px bg-white/10" />

          <button
            onClick={onExportSceneYaml}
            className="flex h-7 items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 text-[12px] text-zinc-200 hover:bg-white/[0.09]"
          >
            <FileCode2 size={13} /> 导出场景 YAML
          </button>

          <button
            onClick={() => onPreviewFrom(selectedNode.id)}
            className="flex h-7 items-center gap-1.5 rounded-lg bg-sky-500 px-3 text-[12px] font-medium text-white hover:bg-sky-400"
          >
            <Play size={12} fill="currentColor" /> 试玩本场
          </button>
        </div>
      </div>

      {/* 主舞台 16:9 区域 */}
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center p-5">
        <div
          ref={stageRef}
          onClick={() => setSelectedCharId(null)}
          className="relative aspect-video w-full max-w-[980px] overflow-hidden rounded-2xl border border-white/12 bg-black shadow-[0_24px_70px_rgba(0,0,0,0.75)] select-none"
        >
          {/* 背景图 */}
          {bg && (
            <img
              src={bg.url}
              alt={bg.name}
              draggable={false}
              className="absolute inset-0 h-full w-full object-cover"
            />
          )}

          {/* 暗角渐变 */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/65 via-transparent to-black/25" />

          {/* Pixi.js 粒子层 */}
          <div ref={pixiHostRef} className="pointer-events-none absolute inset-0" />

          {/* 舞台角色立绘层（可拖拽调整 x, y） */}
          {selectedNode.stageCharacters.map((placement) => {
            const ch = charById(project, placement.characterId);
            const sp = spriteById(ch?.spriteId);
            if (!ch || !sp) return null;
            const isSelected = selectedCharId === placement.characterId;
            const isSpeaking = speaker?.id === placement.characterId;

            return (
              <div
                key={placement.characterId}
                onMouseDown={(e) => startDragCharacter(e, placement.characterId, placement.x, placement.y)}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedCharId(placement.characterId);
                }}
                style={{
                  left: `${placement.x}%`,
                  top: `${placement.y}%`,
                  transform: `translate(-50%, -45%) scale(${placement.scale * (placement.flipX ? -1 : 1)}, ${placement.scale})`,
                  opacity: placement.opacity,
                }}
                className={`group absolute cursor-grab active:cursor-grabbing transition-shadow ${
                  isSelected ? "z-20" : "z-10"
                }`}
              >
                <img
                  src={sp.url}
                  alt={ch.name}
                  draggable={false}
                  className={`h-[360px] w-auto object-contain drop-shadow-[0_16px_32px_rgba(0,0,0,0.75)] transition ${
                    isSpeaking ? "brightness-105" : "brightness-95"
                  }`}
                />
                {/* 选中边框与坐标角标 */}
                <div
                  style={{ transform: placement.flipX ? "scaleX(-1)" : undefined }}
                  className={`pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium whitespace-nowrap shadow-lg transition ${
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

          {/* 底部蓝色模板风格对话框实时预览 */}
          <div className="pointer-events-none absolute right-5 bottom-4 left-5 z-20">
            <div className="rounded-xl border-2 border-[#1d4ed8]/85 bg-black/90 px-5 py-3.5 shadow-[0_12px_40px_rgba(0,0,0,0.85)]">
              <div className="mb-1 flex items-center justify-between">
                <span
                  className="text-[13px] font-bold tracking-wide"
                  style={{ color: speaker?.color ?? "#93c5fd" }}
                >
                  {speaker ? speaker.name : "旁白"}
                </span>
                <span className="font-mono text-[11px] text-zinc-500">
                  台词 {Math.min(activeLineIdx + 1, Math.max(1, selectedNode.lines.length))} /{" "}
                  {Math.max(1, selectedNode.lines.length)}
                </span>
              </div>
              <p className="min-h-[2.4rem] text-[14.5px] leading-relaxed text-zinc-100">
                {currentLine?.text || "（当前场景暂无台词）"}
              </p>
            </div>
          </div>
        </div>

        {/* 底部控制条：当前选中舞台角色参数 + 台词切换 */}
        <div className="mt-3 flex w-full max-w-[980px] flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-[#121216] px-4 py-2.5">
          {selectedPlacement ? (
            <div className="flex flex-wrap items-center gap-4 text-[12px]">
              <span className="font-semibold text-sky-300">
                已选中：{charById(project, selectedPlacement.characterId)?.name}
              </span>
              <label className="flex items-center gap-1.5 text-zinc-400">
                X 坐标
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
                  className="field w-14 rounded border border-white/10 bg-zinc-900 px-1.5 py-0.5 text-center text-zinc-100"
                />
                %
              </label>
              <label className="flex items-center gap-1.5 text-zinc-400">
                Y 坐标
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
                  className="field w-14 rounded border border-white/10 bg-zinc-900 px-1.5 py-0.5 text-center text-zinc-100"
                />
                %
              </label>
              <label className="flex items-center gap-1.5 text-zinc-400">
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
                  className="w-24 accent-sky-400"
                />
                <span className="font-mono text-[11px] text-zinc-300">
                  {Math.round(selectedPlacement.scale * 100)}%
                </span>
              </label>
              <button
                onClick={() =>
                  editor.upsertStageCharacter(selectedNode.id, selectedPlacement.characterId, {
                    flipX: !selectedPlacement.flipX,
                  })
                }
                className="flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-zinc-200 hover:bg-white/[0.08]"
              >
                <FlipHorizontal2 size={12} /> 水平翻转
              </button>
              <button
                onClick={() => {
                  editor.removeStageCharacter(selectedNode.id, selectedPlacement.characterId);
                  setSelectedCharId(null);
                }}
                className="flex items-center gap-1 rounded-md px-2 py-1 text-rose-300 hover:bg-rose-500/15"
              >
                <Trash2 size={12} /> 移出舞台
              </button>
            </div>
          ) : (
            <div className="text-[12px] text-zinc-400">
              点击舞台上的角色立绘可调整位置、缩放与镜像；也可在上方点击角色按钮安排上下场
            </div>
          )}

          {/* 台词预览切换 */}
          {selectedNode.lines.length > 1 && (
            <div className="flex items-center gap-1">
              {selectedNode.lines.map((line, i) => (
                <button
                  key={line.id}
                  onClick={() => setActiveLineIdx(i)}
                  className={`h-6 w-6 rounded text-[11px] font-mono transition ${
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
