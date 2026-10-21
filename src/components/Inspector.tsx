import {
  Flag,
  Copy,
  Trash2,
  Plus,
  ArrowUp,
  ArrowDown,
  Link2Off,
  Sparkles,
  Type,
} from "lucide-react";
import type { Editor } from "../hooks/useEditor";
import type { EndingKind, NodeType } from "../types";
import { ENDING_LABELS, NODE_TYPE_LABELS } from "../types";
import { BACKGROUNDS, AUDIO_TRACKS } from "../data/assets";
import { nodeById } from "../lib/projectUtils";

interface InspectorProps {
  editor: Editor;
  notify: (msg: string) => void;
}

export default function Inspector({ editor, notify }: InspectorProps) {
  const { project, selectedNode, selectedEdge } = editor;

  if (selectedEdge) {
    const from = nodeById(project, selectedEdge.fromNodeId);
    const toId =
      selectedEdge.port < 0 ? from?.nextNodeId : from?.choices[selectedEdge.port]?.targetNodeId;
    const to = nodeById(project, toId);
    return (
      <aside className="flex h-full w-full flex-col bg-[#0e0e11]">
        <div className="flex h-10 items-center justify-between border-b border-white/[0.06] px-3.5">
          <span className="text-[12px] font-semibold text-zinc-200">连线属性</span>
        </div>
        <div className="flex flex-col gap-3 p-4 text-[12px]">
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
            <div className="text-[11px] text-zinc-500">起点</div>
            <div className="mt-0.5 font-medium text-zinc-100">{from?.title ?? "—"}</div>
            <div className="mt-3 text-[11px] text-zinc-500">目标</div>
            <div className="mt-0.5 font-medium text-zinc-100">{to?.title ?? "—"}</div>
          </div>
          <button
            onClick={() => {
              editor.connect(selectedEdge, null);
              editor.selectEdge(null);
              notify("已断开连线");
            }}
            className="flex h-8 items-center justify-center gap-1.5 rounded-xl bg-rose-500/15 text-[12px] font-medium text-rose-200 hover:bg-rose-500/25"
          >
            <Link2Off size={13} /> 断开此连线
          </button>
        </div>
      </aside>
    );
  }

  if (!selectedNode) {
    return (
      <aside className="flex h-full w-full flex-col bg-[#0e0e11]">
        <div className="flex h-10 items-center border-b border-white/[0.06] px-3.5">
          <span className="text-[12px] font-semibold text-zinc-200">属性检查器</span>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
          <p className="text-[12.5px] font-medium text-zinc-300">未选择节点</p>
          <p className="mt-1 text-[11.5px] text-zinc-500">
            点击工作流中的任意节点以调整属性、淡入淡出、屏幕文字或台词。
          </p>
        </div>
      </aside>
    );
  }

  const isStart = project.startNodeId === selectedNode.id;

  const changeType = (type: NodeType) => {
    if (type === selectedNode.type) return;
    if (type === "choice" && selectedNode.choices.length === 0) {
      editor.updateNode(selectedNode.id, {
        type,
        choices: [
          { id: `c_${Date.now()}_1`, text: "选项一", targetNodeId: selectedNode.nextNodeId },
          { id: `c_${Date.now()}_2`, text: "选项二", targetNodeId: null },
        ],
      });
    } else if (type === "fade" && !selectedNode.fadeConfig) {
      editor.updateNode(selectedNode.id, {
        type,
        fadeConfig: {
          target: "character",
          characterId: project.characters[1]?.id ?? null,
          direction: "out",
          durationMs: 600,
          targetOpacity: 0,
        },
      });
    } else if (type === "screen_text" && (!selectedNode.screenTexts || selectedNode.screenTexts.length === 0)) {
      editor.updateNode(selectedNode.id, {
        type,
        screenTexts: [
          {
            id: `st_${Date.now()}`,
            text: "屏幕自由显示文字",
            x: 50,
            y: 25,
            fontSize: 28,
            color: "#ffffff",
            align: "center",
          },
        ],
      });
    } else if (type === "end") {
      editor.updateNode(selectedNode.id, {
        type,
        endingKind: selectedNode.endingKind ?? "normal",
      });
    } else {
      editor.updateNode(selectedNode.id, { type });
    }
  };

  return (
    <aside className="flex h-full w-full flex-col bg-[#0e0e11]">
      {/* 头部操作栏（无重复试玩/YAML按钮） */}
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-white/[0.06] px-3.5">
        <span className="truncate text-[12px] font-semibold text-zinc-200">{selectedNode.title}</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              editor.setStartNode(selectedNode.id);
              notify("已设为故事起点");
            }}
            disabled={isStart}
            title="设为故事起点"
            className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 hover:bg-white/[0.07] hover:text-emerald-300 disabled:text-emerald-400"
          >
            <Flag size={13} />
          </button>
          <button
            onClick={() => editor.duplicateNode(selectedNode.id)}
            title="复制节点"
            className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 hover:bg-white/[0.07] hover:text-zinc-100"
          >
            <Copy size={13} />
          </button>
          <button
            onClick={() => editor.deleteNode(selectedNode.id)}
            title="删除节点"
            className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 hover:bg-rose-500/20 hover:text-rose-300"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* 主体滚动区 */}
      <div className="editor-scroll min-h-0 flex-1 overflow-y-auto p-3.5">
        {/* 标题 */}
        <label className="mb-1 block text-[11px] font-medium text-zinc-400">节点标题</label>
        <input
          value={selectedNode.title}
          onChange={(e) => editor.updateNode(selectedNode.id, { title: e.target.value })}
          className="field mb-3 w-full rounded-lg border border-white/10 bg-zinc-900/80 px-2.5 py-1.5 text-[12.5px] font-medium text-zinc-100"
        />

        {/* 所属章节 & 节点类型 */}
        <div className="mb-3 grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-[11px] font-medium text-zinc-400">所属章节</label>
            <select
              value={selectedNode.chapterId}
              onChange={(e) => editor.updateNode(selectedNode.id, { chapterId: e.target.value })}
              className="field w-full rounded-lg border border-white/10 bg-zinc-900/80 px-2 py-1.5 text-[11.5px] text-zinc-100"
            >
              {project.chapters.map((ch) => (
                <option key={ch.id} value={ch.id}>
                  {ch.title}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-medium text-zinc-400">节点类型</label>
            <select
              value={selectedNode.type}
              onChange={(e) => changeType(e.target.value as NodeType)}
              className="field w-full rounded-lg border border-white/10 bg-zinc-900/80 px-2 py-1.5 text-[11.5px] text-zinc-100"
            >
              {(
                ["dialogue", "choice", "fade", "screen_text", "character", "background", "audio", "script", "end"] as NodeType[]
              ).map((t) => (
                <option key={t} value={t}>
                  {NODE_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* 背景 & 音乐 */}
        <div className="mb-3.5 grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-[11px] font-medium text-zinc-400">场景背景</label>
            <select
              value={selectedNode.backgroundId ?? ""}
              onChange={(e) =>
                editor.updateNode(selectedNode.id, { backgroundId: e.target.value || null })
              }
              className="field w-full rounded-lg border border-white/10 bg-zinc-900/80 px-2 py-1.5 text-[11.5px] text-zinc-100"
            >
              <option value="">（无背景）</option>
              {BACKGROUNDS.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-medium text-zinc-400">背景音乐</label>
            <select
              value={selectedNode.bgmId ?? ""}
              onChange={(e) =>
                editor.updateNode(selectedNode.id, { bgmId: e.target.value || null })
              }
              className="field w-full rounded-lg border border-white/10 bg-zinc-900/80 px-2 py-1.5 text-[11.5px] text-zinc-100"
            >
              <option value="">（静音）</option>
              {AUDIO_TRACKS.filter((a) => a.kind === "bgm").map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* 淡入淡出配置模块（支持任意节点开启淡出角色、背景或整屏） */}
        <div className="mb-3.5 rounded-xl border border-cyan-500/25 bg-cyan-500/[0.04] p-2.5">
          <div className="mb-2 flex items-center justify-between">
            <span className="flex items-center gap-1 text-[11px] font-semibold text-cyan-300">
              <Sparkles size={12} /> 淡入 / 淡出控制 (moovn.fade)
            </span>
            {selectedNode.fadeConfig ? (
              <button
                onClick={() => editor.updateNode(selectedNode.id, { fadeConfig: null })}
                className="text-[10.5px] text-zinc-400 hover:text-rose-300"
              >
                清除
              </button>
            ) : (
              <button
                onClick={() =>
                  editor.updateNode(selectedNode.id, {
                    fadeConfig: {
                      target: "character",
                      characterId: project.characters[1]?.id ?? null,
                      direction: "out",
                      durationMs: 600,
                      targetOpacity: 0,
                    },
                  })
                }
                className="rounded bg-cyan-500/20 px-2 py-0.5 text-[10.5px] text-cyan-200 hover:bg-cyan-500/30"
              >
                + 启用淡入淡出
              </button>
            )}
          </div>

          {selectedNode.fadeConfig && (
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div>
                <label className="mb-0.5 block text-zinc-400">作用对象</label>
                <select
                  value={selectedNode.fadeConfig.target}
                  onChange={(e) =>
                    editor.updateNode(selectedNode.id, {
                      fadeConfig: { ...selectedNode.fadeConfig!, target: e.target.value as any },
                    })
                  }
                  className="field w-full rounded border border-white/10 bg-zinc-900 px-2 py-1 text-zinc-100"
                >
                  <option value="character">指定角色</option>
                  <option value="background">场景背景</option>
                  <option value="screen">整屏画面</option>
                </select>
              </div>
              <div>
                <label className="mb-0.5 block text-zinc-400">方向</label>
                <select
                  value={selectedNode.fadeConfig.direction}
                  onChange={(e) => {
                    const dir = e.target.value as "in" | "out";
                    editor.updateNode(selectedNode.id, {
                      fadeConfig: {
                        ...selectedNode.fadeConfig!,
                        direction: dir,
                        targetOpacity: dir === "out" ? 0 : 1,
                      },
                    });
                  }}
                  className="field w-full rounded border border-white/10 bg-zinc-900 px-2 py-1 text-zinc-100"
                >
                  <option value="out">淡出 (消失)</option>
                  <option value="in">淡入 (显现)</option>
                </select>
              </div>
              {selectedNode.fadeConfig.target === "character" && (
                <div>
                  <label className="mb-0.5 block text-zinc-400">目标角色</label>
                  <select
                    value={selectedNode.fadeConfig.characterId ?? ""}
                    onChange={(e) =>
                      editor.updateNode(selectedNode.id, {
                        fadeConfig: { ...selectedNode.fadeConfig!, characterId: e.target.value || null },
                      })
                    }
                    className="field w-full rounded border border-white/10 bg-zinc-900 px-2 py-1 text-zinc-100"
                  >
                    <option value="">全部在场角色</option>
                    {project.characters.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="mb-0.5 block text-zinc-400">过渡时长 (ms)</label>
                <input
                  type="number"
                  step={100}
                  value={selectedNode.fadeConfig.durationMs}
                  onChange={(e) =>
                    editor.updateNode(selectedNode.id, {
                      fadeConfig: { ...selectedNode.fadeConfig!, durationMs: Number(e.target.value) },
                    })
                  }
                  className="field w-full rounded border border-white/10 bg-zinc-900 px-2 py-1 text-zinc-100"
                />
              </div>
            </div>
          )}
        </div>

        {/* 屏幕自由文字模块（自定义大小、颜色、位置） */}
        <div className="mb-3.5 rounded-xl border border-pink-500/25 bg-pink-500/[0.04] p-2.5">
          <div className="mb-2 flex items-center justify-between">
            <span className="flex items-center gap-1 text-[11px] font-semibold text-pink-300">
              <Type size={12} /> 屏幕文字 ({(selectedNode.screenTexts ?? []).length})
            </span>
            <button
              onClick={() => editor.addScreenText(selectedNode.id)}
              className="rounded bg-pink-500/20 px-2 py-0.5 text-[10.5px] text-pink-200 hover:bg-pink-500/30"
            >
              + 添加文字
            </button>
          </div>

          <div className="flex flex-col gap-2">
            {(selectedNode.screenTexts ?? []).map((st) => (
              <div key={st.id} className="rounded-lg border border-white/10 bg-black/40 p-2 text-[11px]">
                <div className="mb-1.5 flex items-center gap-1.5">
                  <input
                    value={st.text}
                    onChange={(e) =>
                      editor.updateScreenText(selectedNode.id, st.id, { text: e.target.value })
                    }
                    placeholder="屏幕显示文字…"
                    className="field min-w-0 flex-1 rounded border border-white/10 bg-zinc-900 px-2 py-1 text-zinc-100"
                  />
                  <input
                    type="color"
                    value={st.color}
                    onChange={(e) =>
                      editor.updateScreenText(selectedNode.id, st.id, { color: e.target.value })
                    }
                    className="h-6 w-6 cursor-pointer rounded border border-white/15 bg-transparent"
                  />
                  <button
                    onClick={() => editor.removeScreenText(selectedNode.id, st.id)}
                    className="rounded p-1 text-zinc-500 hover:text-rose-300"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-1.5 text-[10.5px] text-zinc-400">
                  <label className="flex items-center gap-1">
                    字号
                    <input
                      type="number"
                      value={st.fontSize}
                      onChange={(e) =>
                        editor.updateScreenText(selectedNode.id, st.id, { fontSize: Number(e.target.value) })
                      }
                      className="field w-12 rounded border border-white/10 bg-zinc-900 px-1 py-0.5 text-center text-zinc-100"
                    />
                  </label>
                  <label className="flex items-center gap-1">
                    X%
                    <input
                      type="number"
                      value={st.x}
                      onChange={(e) =>
                        editor.updateScreenText(selectedNode.id, st.id, { x: Number(e.target.value) })
                      }
                      className="field w-12 rounded border border-white/10 bg-zinc-900 px-1 py-0.5 text-center text-zinc-100"
                    />
                  </label>
                  <label className="flex items-center gap-1">
                    Y%
                    <input
                      type="number"
                      value={st.y}
                      onChange={(e) =>
                        editor.updateScreenText(selectedNode.id, st.id, { y: Number(e.target.value) })
                      }
                      className="field w-12 rounded border border-white/10 bg-zinc-900 px-1 py-0.5 text-center text-zinc-100"
                    />
                  </label>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 结局设置 */}
        {selectedNode.type === "end" && (
          <div className="flex flex-col gap-3">
            <div>
              <label className="mb-1 block text-[11px] font-medium text-zinc-400">结局性质</label>
              <div className="grid grid-cols-2 gap-1.5">
                {(["good", "true", "normal", "bad"] as EndingKind[]).map((k) => (
                  <button
                    key={k}
                    onClick={() => editor.updateNode(selectedNode.id, { endingKind: k })}
                    className={`rounded-lg border py-1.5 text-[11.5px] font-medium transition ${
                      (selectedNode.endingKind ?? "normal") === k
                        ? "border-emerald-400/50 bg-emerald-400/15 text-emerald-200"
                        : "border-white/[0.08] bg-white/[0.02] text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    {ENDING_LABELS[k]}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-zinc-400">结局寄语</label>
              <textarea
                rows={4}
                value={selectedNode.endingDescription ?? ""}
                onChange={(e) =>
                  editor.updateNode(selectedNode.id, { endingDescription: e.target.value })
                }
                className="field w-full resize-none rounded-lg border border-white/10 bg-zinc-900/80 p-2.5 text-[12px] leading-relaxed text-zinc-100"
              />
            </div>
          </div>
        )}

        {/* 台词列表 */}
        {selectedNode.type !== "end" && (
          <div className="mb-4">
            <div className="mb-2 flex items-center justify-between">
              <label className="text-[11px] font-semibold text-zinc-400">
                场景台词 ({selectedNode.lines.length})
              </label>
              <button
                onClick={() => editor.addLine(selectedNode.id)}
                className="flex items-center gap-1 rounded-md bg-white/[0.06] px-2 py-0.5 text-[11px] text-zinc-200 hover:bg-sky-500 hover:text-white"
              >
                <Plus size={11} /> 添加台词
              </button>
            </div>

            <div className="flex flex-col gap-2">
              {selectedNode.lines.map((line, idx) => (
                <div
                  key={line.id}
                  className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-2.5"
                >
                  <div className="mb-1.5 flex items-center gap-1.5">
                    <span className="font-mono text-[10px] text-zinc-500">#{idx + 1}</span>
                    <select
                      value={line.characterId ?? ""}
                      onChange={(e) =>
                        editor.updateLine(selectedNode.id, line.id, {
                          characterId: e.target.value || null,
                        })
                      }
                      className="field min-w-0 flex-1 rounded-md border border-white/10 bg-zinc-900 px-2 py-1 text-[11.5px] text-zinc-100"
                    >
                      <option value="">旁白</option>
                      {project.characters.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => editor.moveLine(selectedNode.id, line.id, -1)}
                      disabled={idx === 0}
                      className="rounded p-1 text-zinc-500 hover:bg-white/[0.07] hover:text-zinc-200 disabled:opacity-25"
                    >
                      <ArrowUp size={11} />
                    </button>
                    <button
                      onClick={() => editor.moveLine(selectedNode.id, line.id, 1)}
                      disabled={idx === selectedNode.lines.length - 1}
                      className="rounded p-1 text-zinc-500 hover:bg-white/[0.07] hover:text-zinc-200 disabled:opacity-25"
                    >
                      <ArrowDown size={11} />
                    </button>
                    <button
                      onClick={() => editor.removeLine(selectedNode.id, line.id)}
                      className="rounded p-1 text-zinc-500 hover:bg-rose-500/20 hover:text-rose-300"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                  <textarea
                    rows={2}
                    value={line.text}
                    onChange={(e) =>
                      editor.updateLine(selectedNode.id, line.id, { text: e.target.value })
                    }
                    className="field w-full resize-none rounded-lg border border-white/[0.08] bg-zinc-900/70 p-2 text-[12px] leading-relaxed text-zinc-100"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 单下一场景跳转 */}
        {selectedNode.type !== "choice" && selectedNode.type !== "end" && (
          <div>
            <label className="mb-1 block text-[11px] font-medium text-zinc-400">下一场景跳转</label>
            <select
              value={selectedNode.nextNodeId ?? ""}
              onChange={(e) =>
                editor.connect({ fromNodeId: selectedNode.id, port: -1 }, e.target.value || null)
              }
              className="field w-full rounded-lg border border-white/10 bg-zinc-900/80 px-2.5 py-1.5 text-[12px] text-zinc-100"
            >
              <option value="">（未连接）</option>
              {project.nodes
                .filter((n) => n.id !== selectedNode.id)
                .map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.title}
                  </option>
                ))}
            </select>
          </div>
        )}

        {/* 分支选项列表 */}
        {selectedNode.type === "choice" && (
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-[11px] font-semibold text-zinc-400">
                玩家分支选项 ({selectedNode.choices.length})
              </label>
              <button
                onClick={() => editor.addChoice(selectedNode.id)}
                className="flex items-center gap-1 rounded-md bg-amber-400/15 px-2 py-0.5 text-[11px] text-amber-200 hover:bg-amber-400 hover:text-zinc-950"
              >
                <Plus size={11} /> 添加分支
              </button>
            </div>

            <div className="flex flex-col gap-2">
              {selectedNode.choices.map((c, idx) => (
                <div
                  key={c.id}
                  className="rounded-xl border border-amber-400/20 bg-amber-400/[0.04] p-2.5"
                >
                  <div className="mb-1.5 flex items-center gap-1.5">
                    <span className="font-mono text-[10.5px] font-bold text-amber-300">
                      #{idx + 1}
                    </span>
                    <input
                      value={c.text}
                      onChange={(e) =>
                        editor.updateChoice(selectedNode.id, c.id, { text: e.target.value })
                      }
                      className="field min-w-0 flex-1 rounded-md border border-white/10 bg-zinc-900 px-2 py-1 text-[11.5px] text-zinc-100"
                    />
                    <button
                      onClick={() => editor.removeChoice(selectedNode.id, c.id)}
                      className="rounded p-1 text-zinc-500 hover:bg-rose-500/20 hover:text-rose-300"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>

                  <select
                    value={c.targetNodeId ?? ""}
                    onChange={(e) =>
                      editor.connect(
                        { fromNodeId: selectedNode.id, port: idx },
                        e.target.value || null,
                      )
                    }
                    className="field mb-1.5 w-full rounded-md border border-white/10 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-200"
                  >
                    <option value="">→ 选择跳转目标场景…</option>
                    {project.nodes
                      .filter((n) => n.id !== selectedNode.id)
                      .map((n) => (
                        <option key={n.id} value={n.id}>
                          → {n.title}
                        </option>
                      ))}
                  </select>

                  <div className="flex items-center gap-1.5 text-[10.5px] text-zinc-400">
                    <span>好感变化:</span>
                    <select
                      value={c.affectionCharacterId ?? ""}
                      onChange={(e) =>
                        editor.updateChoice(selectedNode.id, c.id, {
                          affectionCharacterId: e.target.value || null,
                        })
                      }
                      className="field rounded border border-white/10 bg-zinc-900 px-1.5 py-0.5 text-zinc-200"
                    >
                      <option value="">不改变</option>
                      {project.characters.map((ch) => (
                        <option key={ch.id} value={ch.id}>
                          {ch.name}
                        </option>
                      ))}
                    </select>
                    {c.affectionCharacterId && (
                      <input
                        type="number"
                        value={c.affectionDelta ?? 0}
                        onChange={(e) =>
                          editor.updateChoice(selectedNode.id, c.id, {
                            affectionDelta: Number(e.target.value),
                          })
                        }
                        className="field w-14 rounded border border-white/10 bg-zinc-900 px-1.5 py-0.5 text-center text-rose-300"
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
