import {
  Play,
  Flag,
  Copy,
  Trash2,
  Plus,
  ArrowUp,
  ArrowDown,
  Link2Off,
  FileCode2,
} from "lucide-react";
import type { Editor } from "../hooks/useEditor";
import type { EndingKind, NodeType, ScriptLanguage } from "../types";
import { ENDING_LABELS, NODE_TYPE_LABELS } from "../types";
import { BACKGROUNDS, AUDIO_TRACKS, backgroundById } from "../data/assets";
import { charById, nodeById } from "../lib/projectUtils";

interface InspectorProps {
  editor: Editor;
  onPreviewFrom: (nodeId: string) => void;
  onExportSceneYaml: () => void;
  notify: (msg: string) => void;
}

export default function Inspector({
  editor,
  onPreviewFrom,
  onExportSceneYaml,
  notify,
}: InspectorProps) {
  const { project, selectedNode, selectedEdge } = editor;

  if (selectedEdge) {
    const from = nodeById(project, selectedEdge.fromNodeId);
    const toId =
      selectedEdge.port < 0 ? from?.nextNodeId : from?.choices[selectedEdge.port]?.targetNodeId;
    const to = nodeById(project, toId);
    return (
      <aside className="flex w-[328px] shrink-0 flex-col border-l border-white/[0.06] bg-[#0e0e11]">
        <div className="flex h-11 items-center justify-between border-b border-white/[0.06] px-3.5">
          <span className="text-[12.5px] font-semibold text-zinc-200">连线属性</span>
        </div>
        <div className="flex flex-col gap-3 p-4 text-[12.5px]">
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
            <div className="text-[11px] text-zinc-500">起点场景</div>
            <div className="mt-0.5 font-medium text-zinc-100">{from?.title ?? "—"}</div>
            {selectedEdge.port >= 0 && (
              <div className="mt-1 text-[11.5px] text-amber-300">
                分支：{from?.choices[selectedEdge.port]?.text}
              </div>
            )}
            <div className="mt-3 text-[11px] text-zinc-500">目标场景</div>
            <div className="mt-0.5 font-medium text-zinc-100">{to?.title ?? "—"}</div>
          </div>
          <button
            onClick={() => {
              editor.connect(selectedEdge, null);
              editor.selectEdge(null);
              notify("已断开连线");
            }}
            className="flex h-9 items-center justify-center gap-1.5 rounded-xl bg-rose-500/15 text-[12.5px] font-medium text-rose-200 transition hover:bg-rose-500/25"
          >
            <Link2Off size={14} /> 断开此连线
          </button>
        </div>
      </aside>
    );
  }

  if (!selectedNode) {
    return (
      <aside className="flex w-[328px] shrink-0 flex-col border-l border-white/[0.06] bg-[#0e0e11]">
        <div className="flex h-11 items-center border-b border-white/[0.06] px-3.5">
          <span className="text-[12.5px] font-semibold text-zinc-200">属性检查器</span>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
          <p className="text-[13px] font-medium text-zinc-300">未选择任何场景</p>
          <p className="mt-1.5 text-[12px] leading-relaxed text-zinc-500">
            点击画布中的场景卡片，或在左侧「章节场景」中选择一幕以编辑台词、角色与分支。
          </p>
        </div>
      </aside>
    );
  }

  const bg = backgroundById(selectedNode.backgroundId);
  const firstSpeaker = selectedNode.lines[0]?.characterId
    ? charById(project, selectedNode.lines[0].characterId)
    : null;
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
    <aside className="flex w-[328px] shrink-0 flex-col border-l border-white/[0.06] bg-[#0e0e11]">
      {/* 头部操作栏 */}
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-white/[0.06] px-3.5">
        <span className="text-[12.5px] font-semibold text-zinc-200">场景检查器</span>
        <div className="flex items-center gap-1">
          <button
            onClick={onExportSceneYaml}
            title="导出当前场景 YAML"
            className="flex h-7 items-center gap-1 rounded-md border border-white/10 bg-white/[0.04] px-2 text-[11.5px] text-zinc-200 hover:bg-white/[0.08]"
          >
            <FileCode2 size={11} /> YAML
          </button>
          <button
            onClick={() => onPreviewFrom(selectedNode.id)}
            title="从此场景试玩"
            className="flex h-7 items-center gap-1 rounded-md bg-sky-500/15 px-2 text-[11.5px] font-medium text-sky-300 hover:bg-sky-500 hover:text-white"
          >
            <Play size={11} /> 试玩
          </button>
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
            title="复制场景"
            className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 hover:bg-white/[0.07] hover:text-zinc-100"
          >
            <Copy size={13} />
          </button>
          <button
            onClick={() => editor.deleteNode(selectedNode.id)}
            title="删除场景"
            className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 hover:bg-rose-500/20 hover:text-rose-300"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* 主体滚动区 */}
      <div className="editor-scroll min-h-0 flex-1 overflow-y-auto p-3.5">
        {/* 小舞台缩略图 */}
        <div className="relative mb-3.5 aspect-[16/9] w-full overflow-hidden rounded-xl border border-white/10 bg-zinc-950">
          {bg && <img src={bg.url} alt={bg.name} className="h-full w-full object-cover" />}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/15 to-transparent" />
          <div className="absolute inset-x-2.5 bottom-2 rounded-lg border border-sky-500/40 bg-black/80 px-2.5 py-1.5 backdrop-blur-md">
            <div
              className="text-[10.5px] font-semibold"
              style={{ color: firstSpeaker?.color ?? "#93c5fd" }}
            >
              {selectedNode.type === "end"
                ? ENDING_LABELS[selectedNode.endingKind ?? "normal"]
                : firstSpeaker
                  ? firstSpeaker.name
                  : "旁白"}
            </div>
            <div className="line-clamp-2 text-[11px] leading-snug text-zinc-100">
              {selectedNode.type === "end"
                ? selectedNode.endingDescription || "故事在此落下帷幕"
                : selectedNode.lines[0]?.text || "（暂无台词）"}
            </div>
          </div>
        </div>

        {/* 场景标题 */}
        <label className="mb-1 block text-[11px] font-medium text-zinc-400">场景标题</label>
        <input
          value={selectedNode.title}
          onChange={(e) => editor.updateNode(selectedNode.id, { title: e.target.value })}
          className="field mb-3 w-full rounded-lg border border-white/10 bg-zinc-900/80 px-2.5 py-1.5 text-[13px] font-medium text-zinc-100"
        />

        {/* 所属章节 & 节点类型 */}
        <div className="mb-3 grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-[11px] font-medium text-zinc-400">所属章节</label>
            <select
              value={selectedNode.chapterId}
              onChange={(e) => editor.updateNode(selectedNode.id, { chapterId: e.target.value })}
              className="field w-full rounded-lg border border-white/10 bg-zinc-900/80 px-2 py-1.5 text-[12px] text-zinc-100"
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
              className="field w-full rounded-lg border border-white/10 bg-zinc-900/80 px-2 py-1.5 text-[12px] text-zinc-100"
            >
              {(["dialogue", "choice", "character", "background", "audio", "script", "end"] as NodeType[]).map((t) => (
                <option key={t} value={t}>
                  {NODE_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* 场景背景 & 背景音乐 */}
        <div className="mb-3.5 grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-[11px] font-medium text-zinc-400">场景背景</label>
            <select
              value={selectedNode.backgroundId ?? ""}
              onChange={(e) =>
                editor.updateNode(selectedNode.id, { backgroundId: e.target.value || null })
              }
              className="field w-full rounded-lg border border-white/10 bg-zinc-900/80 px-2 py-1.5 text-[12px] text-zinc-100"
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
              className="field w-full rounded-lg border border-white/10 bg-zinc-900/80 px-2 py-1.5 text-[12px] text-zinc-100"
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

        {/* 结局专用设置 */}
        {selectedNode.type === "end" && (
          <div className="flex flex-col gap-3">
            <div>
              <label className="mb-1 block text-[11px] font-medium text-zinc-400">结局性质</label>
              <div className="grid grid-cols-2 gap-1.5">
                {(["good", "true", "normal", "bad"] as EndingKind[]).map((k) => (
                  <button
                    key={k}
                    onClick={() => editor.updateNode(selectedNode.id, { endingKind: k })}
                    className={`rounded-lg border py-1.5 text-[12px] font-medium transition ${
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
                placeholder="输入结局画面展示的文字……"
                className="field w-full resize-none rounded-lg border border-white/10 bg-zinc-900/80 p-2.5 text-[12.5px] leading-relaxed text-zinc-100"
              />
            </div>
          </div>
        )}

        {/* 自定义脚本节点专属编辑 */}
        {selectedNode.type === "script" && (
          <div className="mb-4 rounded-xl border border-indigo-400/25 bg-indigo-500/[0.05] p-2.5">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] font-semibold text-indigo-300">节点内嵌脚本</span>
              <select
                value={selectedNode.scriptLang ?? "lua"}
                onChange={(e) =>
                  editor.updateNode(selectedNode.id, { scriptLang: e.target.value as ScriptLanguage })
                }
                className="rounded border border-white/10 bg-zinc-900 px-2 py-0.5 text-[11px] text-zinc-200"
              >
                <option value="lua">Lua</option>
                <option value="teal">Teal</option>
                <option value="python">Python</option>
                <option value="typescript">TypeScript</option>
              </select>
            </div>
            <textarea
              rows={5}
              value={selectedNode.scriptCode ?? ""}
              onChange={(e) => editor.updateNode(selectedNode.id, { scriptCode: e.target.value })}
              spellCheck={false}
              className="field w-full resize-none rounded-lg border border-white/10 bg-zinc-950 p-2 font-mono text-[11.5px] text-indigo-200"
            />
          </div>
        )}

        {/* 台词列表 */}
        {selectedNode.type !== "end" && (
          <div className="mb-4">
            <div className="mb-2 flex items-center justify-between">
              <label className="text-[11px] font-semibold tracking-wider text-zinc-400 uppercase">
                场景台词 ({selectedNode.lines.length})
              </label>
              <button
                onClick={() => editor.addLine(selectedNode.id)}
                className="flex items-center gap-1 rounded-md bg-white/[0.06] px-2 py-0.5 text-[11.5px] text-zinc-200 hover:bg-sky-500 hover:text-white"
              >
                <Plus size={12} /> 添加台词
              </button>
            </div>

            <div className="flex flex-col gap-2">
              {selectedNode.lines.map((line, idx) => (
                <div
                  key={line.id}
                  className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-2.5"
                >
                  <div className="mb-1.5 flex items-center gap-1.5">
                    <span className="font-mono text-[10.5px] text-zinc-500">#{idx + 1}</span>
                    <select
                      value={line.characterId ?? ""}
                      onChange={(e) =>
                        editor.updateLine(selectedNode.id, line.id, {
                          characterId: e.target.value || null,
                        })
                      }
                      className="field min-w-0 flex-1 rounded-md border border-white/10 bg-zinc-900 px-2 py-1 text-[12px] text-zinc-100"
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
                      title="上移"
                      className="rounded p-1 text-zinc-500 hover:bg-white/[0.07] hover:text-zinc-200 disabled:opacity-25"
                    >
                      <ArrowUp size={12} />
                    </button>
                    <button
                      onClick={() => editor.moveLine(selectedNode.id, line.id, 1)}
                      disabled={idx === selectedNode.lines.length - 1}
                      title="下移"
                      className="rounded p-1 text-zinc-500 hover:bg-white/[0.07] hover:text-zinc-200 disabled:opacity-25"
                    >
                      <ArrowDown size={12} />
                    </button>
                    <button
                      onClick={() => editor.removeLine(selectedNode.id, line.id)}
                      title="删除本句"
                      className="rounded p-1 text-zinc-500 hover:bg-rose-500/20 hover:text-rose-300"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                  <textarea
                    rows={2}
                    value={line.text}
                    onChange={(e) =>
                      editor.updateLine(selectedNode.id, line.id, { text: e.target.value })
                    }
                    placeholder="在此输入角色对白或旁白描写……"
                    className="field w-full resize-none rounded-lg border border-white/[0.08] bg-zinc-900/70 p-2 text-[12.5px] leading-relaxed text-zinc-100"
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
              className="field w-full rounded-lg border border-white/10 bg-zinc-900/80 px-2.5 py-2 text-[12.5px] text-zinc-100"
            >
              <option value="">（未连接 — 结束或稍后连线）</option>
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
              <label className="text-[11px] font-semibold tracking-wider text-zinc-400 uppercase">
                玩家分支选项 ({selectedNode.choices.length})
              </label>
              <button
                onClick={() => editor.addChoice(selectedNode.id)}
                className="flex items-center gap-1 rounded-md bg-amber-400/15 px-2 py-0.5 text-[11.5px] text-amber-200 hover:bg-amber-400 hover:text-zinc-950"
              >
                <Plus size={12} /> 添加分支
              </button>
            </div>

            <div className="flex flex-col gap-2">
              {selectedNode.choices.map((c, idx) => (
                <div
                  key={c.id}
                  className="rounded-xl border border-amber-400/20 bg-amber-400/[0.04] p-2.5"
                >
                  <div className="mb-1.5 flex items-center gap-1.5">
                    <span className="font-mono text-[11px] font-bold text-amber-300">
                      选项 {idx + 1}
                    </span>
                    <input
                      value={c.text}
                      onChange={(e) =>
                        editor.updateChoice(selectedNode.id, c.id, { text: e.target.value })
                      }
                      placeholder="选项文字"
                      className="field min-w-0 flex-1 rounded-md border border-white/10 bg-zinc-900 px-2 py-1 text-[12px] text-zinc-100"
                    />
                    <button
                      onClick={() => editor.removeChoice(selectedNode.id, c.id)}
                      className="rounded p-1 text-zinc-500 hover:bg-rose-500/20 hover:text-rose-300"
                    >
                      <Trash2 size={12} />
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
                    className="field mb-1.5 w-full rounded-md border border-white/10 bg-zinc-900 px-2 py-1 text-[11.5px] text-zinc-200"
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

                  {/* 好感度增减设定 */}
                  <div className="flex items-center gap-1.5 text-[11px] text-zinc-400">
                    <span>好感变化:</span>
                    <select
                      value={c.affectionCharacterId ?? ""}
                      onChange={(e) =>
                        editor.updateChoice(selectedNode.id, c.id, {
                          affectionCharacterId: e.target.value || null,
                        })
                      }
                      className="field rounded border border-white/10 bg-zinc-900 px-1.5 py-0.5 text-[11px] text-zinc-200"
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
                        className="field w-14 rounded border border-white/10 bg-zinc-900 px-1.5 py-0.5 text-center text-[11px] text-rose-300"
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
