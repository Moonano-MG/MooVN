import { useMemo, useState } from "react";
import {
  FolderTree,
  Users,
  Images,
  Search,
  Play,
  Trash2,
  Flag,
  Plus,
  AlertTriangle,
  MessageSquare,
  GitBranch,
  Check,
  ChevronRight,
  ChevronDown,
  Heart,
  Music,
  Code2,
  Image as ImageIcon,
  UserCheck,
  X,
} from "lucide-react";
import type { Editor } from "../hooks/useEditor";
import type { NodeType, ValidationIssue } from "../types";
import { NODE_TYPE_LABELS } from "../types";
import { BACKGROUNDS, SPRITES, AUDIO_TRACKS, CHARACTER_COLORS, spriteById } from "../data/assets";

export type LeftTab = "outline" | "chars" | "assets";

interface LeftPanelProps {
  editor: Editor;
  issues: ValidationIssue[];
  activeTab: LeftTab;
  onTabChange: (t: LeftTab) => void;
  onLocateNode: (id: string) => void;
  onPreviewFrom: (id: string) => void;
  notify: (msg: string) => void;
}

const TABS: { id: LeftTab; label: string; icon: typeof FolderTree }[] = [
  { id: "outline", label: "章节场景", icon: FolderTree },
  { id: "chars", label: "角色", icon: Users },
  { id: "assets", label: "资源", icon: Images },
];

export default function LeftPanel(props: LeftPanelProps) {
  const { activeTab, onTabChange } = props;
  return (
    <aside className="flex w-[278px] shrink-0 flex-col border-r border-white/[0.06] bg-[#0e0e11]">
      <div className="flex shrink-0 gap-1 border-b border-white/[0.06] p-2">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg text-[12.5px] font-medium transition ${
                active ? "bg-white/[0.09] text-white" : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
              }`}
            >
              <Icon size={14} />
              {tab.label}
              {tab.id === "outline" && props.issues.length > 0 && (
                <span className="rounded-full bg-amber-400/20 px-1.5 text-[10px] font-bold text-amber-300">
                  {props.issues.length}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="editor-scroll min-h-0 flex-1 overflow-y-auto">
        {activeTab === "outline" && <ChapterSceneTab {...props} />}
        {activeTab === "chars" && <CharsTab {...props} />}
        {activeTab === "assets" && <AssetsTab {...props} />}
      </div>
    </aside>
  );
}

/* ---------------- 章节 > 场景 文件管理器 ---------------- */

function nodeIcon(type: NodeType) {
  switch (type) {
    case "choice":
      return <GitBranch size={11} />;
    case "end":
      return <Flag size={11} />;
    case "character":
      return <UserCheck size={11} />;
    case "background":
      return <ImageIcon size={11} />;
    case "audio":
      return <Music size={11} />;
    case "script":
      return <Code2 size={11} />;
    default:
      return <MessageSquare size={11} />;
  }
}

function nodeChipClass(type: NodeType): string {
  switch (type) {
    case "choice":
      return "bg-amber-400/15 text-amber-300";
    case "end":
      return "bg-emerald-400/15 text-emerald-300";
    case "script":
      return "bg-indigo-400/15 text-indigo-300";
    default:
      return "bg-sky-500/15 text-sky-300";
  }
}

function ChapterSceneTab({ editor, issues, onLocateNode, onPreviewFrom, notify }: LeftPanelProps) {
  const { project, selectedNodeId } = editor;
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [editingChapId, setEditingChapId] = useState<string | null>(null);
  const [chapDraft, setChapDraft] = useState("");

  const issueCountByNode = useMemo(() => {
    const map = new Map<string, number>();
    issues.forEach((i) => {
      if (i.nodeId) map.set(i.nodeId, (map.get(i.nodeId) ?? 0) + 1);
    });
    return map;
  }, [issues]);

  const q = query.trim().toLowerCase();

  return (
    <div className="flex flex-col">
      {/* 搜索 + 新建章节 */}
      <div className="flex items-center gap-1.5 p-2.5 pb-1.5">
        <div className="relative flex-1">
          <Search size={13} className="absolute top-1/2 left-2.5 -translate-y-1/2 text-zinc-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索章节或场景…"
            className="field w-full rounded-lg border border-white/[0.08] bg-zinc-900/70 py-[6px] pr-2 pl-8 text-[12px] text-zinc-100 placeholder:text-zinc-600"
          />
        </div>
        <button
          onClick={() => {
            editor.addChapter();
            notify("已新建章节");
          }}
          title="新建章节"
          className="flex h-[31px] shrink-0 items-center gap-1 rounded-lg border border-white/10 bg-white/[0.04] px-2 text-[11.5px] text-zinc-300 transition hover:bg-white/[0.09]"
        >
          <Plus size={12} /> 章节
        </button>
      </div>

      {/* 章节 > 场景 树 */}
      <div className="flex flex-col gap-2 px-2.5 py-1.5">
        {project.chapters.map((chapter) => {
          const isCollapsed = Boolean(collapsed[chapter.id]);
          const scenes = project.nodes
            .filter((n) => n.chapterId === chapter.id)
            .filter((n) => !q || n.title.toLowerCase().includes(q) || chapter.title.toLowerCase().includes(q));

          return (
            <div key={chapter.id} className="rounded-xl border border-white/[0.06] bg-white/[0.015] overflow-hidden">
              {/* 章节头部 */}
              <div className="flex items-center gap-1.5 px-2.5 py-2 bg-white/[0.025]">
                <button
                  onClick={() => setCollapsed((prev) => ({ ...prev, [chapter.id]: !isCollapsed }))}
                  className="text-zinc-400 hover:text-zinc-200"
                >
                  {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                </button>

                {editingChapId === chapter.id ? (
                  <input
                    autoFocus
                    value={chapDraft}
                    onChange={(e) => setChapDraft(e.target.value)}
                    onBlur={() => {
                      if (chapDraft.trim()) editor.renameChapter(chapter.id, chapDraft.trim());
                      setEditingChapId(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        if (chapDraft.trim()) editor.renameChapter(chapter.id, chapDraft.trim());
                        setEditingChapId(null);
                      }
                    }}
                    className="field min-w-0 flex-1 rounded border border-white/15 bg-zinc-900 px-1.5 py-0.5 text-[12px] text-zinc-100"
                  />
                ) : (
                  <span
                    onDoubleClick={() => {
                      setChapDraft(chapter.title);
                      setEditingChapId(chapter.id);
                    }}
                    title="双击重命名章节"
                    className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-zinc-200 cursor-pointer"
                  >
                    {chapter.title}
                  </span>
                )}

                <span className="rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-zinc-400">
                  {scenes.length}
                </span>

                <button
                  onClick={() => {
                    const lastInChap = scenes[scenes.length - 1];
                    const x = lastInChap ? lastInChap.x + 280 : 120;
                    const y = lastInChap ? lastInChap.y : 200;
                    const newId = editor.addNode("dialogue", x, y, chapter.id);
                    if (lastInChap && !lastInChap.nextNodeId && lastInChap.type === "dialogue") {
                      editor.connect({ fromNodeId: lastInChap.id, port: -1 }, newId);
                    }
                    notify(`已在「${chapter.title}」下新建场景`);
                  }}
                  title="在此章节下新增场景"
                  className="rounded p-1 text-zinc-400 transition hover:bg-sky-500/20 hover:text-sky-300"
                >
                  <Plus size={13} />
                </button>
              </div>

              {/* 章节内的场景列表 */}
              {!isCollapsed && (
                <div className="flex flex-col gap-0.5 p-1.5">
                  {scenes.map((node) => {
                    const selected = selectedNodeId === node.id;
                    const warn = issueCountByNode.get(node.id) ?? 0;
                    return (
                      <div
                        key={node.id}
                        onClick={() => onLocateNode(node.id)}
                        className={`group cursor-pointer rounded-lg border px-2 py-1.5 transition ${
                          selected
                            ? "border-sky-400/35 bg-sky-400/[0.09]"
                            : "border-transparent hover:border-white/[0.07] hover:bg-white/[0.04]"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md ${nodeChipClass(node.type)}`}>
                            {nodeIcon(node.type)}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-zinc-100">
                            {node.title}
                          </span>
                          {project.startNodeId === node.id && <Flag size={11} className="shrink-0 text-emerald-300" />}
                          {warn > 0 && (
                            <span className="flex shrink-0 items-center gap-0.5 text-[10px] font-semibold text-amber-300">
                              <AlertTriangle size={10} />
                              {warn}
                            </span>
                          )}
                          <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onPreviewFrom(node.id);
                              }}
                              title="从此处试玩"
                              className="rounded p-1 text-zinc-400 hover:bg-sky-500 hover:text-white"
                            >
                              <Play size={11} />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                editor.deleteNode(node.id);
                              }}
                              title="删除场景"
                              className="rounded p-1 text-zinc-400 hover:bg-rose-500 hover:text-white"
                            >
                              <Trash2 size={11} />
                            </button>
                          </span>
                        </div>
                        <p className="mt-0.5 pl-7 text-[10.5px] text-zinc-500 truncate">
                          {NODE_TYPE_LABELS[node.type]}
                          {node.lines[0]?.text ? ` · ${node.lines[0].text}` : ""}
                        </p>
                      </div>
                    );
                  })}
                  {scenes.length === 0 && (
                    <p className="py-2 text-center text-[11.5px] text-zinc-600">本章暂无场景，点击右上 + 添加</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 结构检查 */}
      <div className="mt-2 border-t border-white/[0.06] p-2.5">
        <p className="mb-1.5 flex items-center gap-1.5 px-1 text-[11px] font-semibold tracking-wider text-zinc-500 uppercase">
          <AlertTriangle size={11} /> 结构检查 · {issues.length}
        </p>
        {issues.length === 0 ? (
          <p className="flex items-center gap-1.5 rounded-lg bg-emerald-400/[0.07] px-2.5 py-2 text-[12px] text-emerald-200">
            <Check size={13} /> 所有场景均可达，分支完整
          </p>
        ) : (
          <div className="flex flex-col gap-1">
            {issues.slice(0, 6).map((issue) => (
              <button
                key={issue.id}
                onClick={() => issue.nodeId && onLocateNode(issue.nodeId)}
                className={`rounded-lg px-2.5 py-[6px] text-left text-[11.5px] leading-snug transition hover:bg-white/[0.05] ${
                  issue.level === "error" ? "bg-rose-500/[0.07] text-rose-200" : "bg-amber-400/[0.05] text-amber-100/90"
                }`}
              >
                {issue.message}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------- 角色系统（含好感度与自定义属性） ---------------- */

function CharsTab({ editor, notify }: LeftPanelProps) {
  const { project } = editor;
  const [newAttrLabel, setNewAttrLabel] = useState<Record<string, string>>({});
  const [newAttrVal, setNewAttrVal] = useState<Record<string, string>>({});

  return (
    <div className="flex flex-col gap-2.5 p-2.5">
      {project.characters.map((ch) => {
        const sprite = spriteById(ch.spriteId);
        return (
          <div key={ch.id} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-2.5">
            <div className="flex items-start gap-2.5">
              {sprite ? (
                <img
                  src={sprite.url}
                  alt={ch.name}
                  className="h-14 w-11 shrink-0 rounded-lg border border-white/10 bg-zinc-800 object-cover object-top"
                />
              ) : (
                <div
                  className="flex h-14 w-11 shrink-0 items-center justify-center rounded-lg border border-white/10 text-[16px] font-bold text-zinc-900"
                  style={{ background: ch.color }}
                >
                  {ch.name.slice(0, 1)}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <input
                  value={ch.name}
                  onChange={(e) => editor.updateCharacter(ch.id, { name: e.target.value })}
                  className="field w-full rounded-md border border-transparent bg-transparent px-1 py-0.5 text-[13px] font-semibold text-zinc-100 hover:border-white/10"
                />
                <div className="mt-1 flex items-center gap-2 px-1 text-[11px] text-zinc-400">
                  <span className="flex items-center gap-1 text-rose-300">
                    <Heart size={11} fill="currentColor" /> 好感 {ch.affection}
                  </span>
                </div>
              </div>
              <button
                onClick={() => {
                  editor.deleteCharacter(ch.id);
                  notify(`角色「${ch.name}」已删除`);
                }}
                title="删除角色"
                className="rounded-md p-1 text-zinc-500 transition hover:bg-rose-500/20 hover:text-rose-300"
              >
                <Trash2 size={13} />
              </button>
            </div>

            {/* 立绘绑定与初始好感度 */}
            <div className="mt-2.5 grid grid-cols-2 gap-1.5">
              <div>
                <label className="mb-1 block text-[10.5px] text-zinc-500">立绘形象</label>
                <select
                  value={ch.spriteId ?? ""}
                  onChange={(e) => editor.updateCharacter(ch.id, { spriteId: e.target.value || null })}
                  className="field w-full rounded-md border border-white/10 bg-zinc-900 px-2 py-1 text-[11.5px] text-zinc-200"
                >
                  <option value="">无立绘</option>
                  {SPRITES.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[10.5px] text-zinc-500">好感度 ({ch.affection})</label>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={ch.affection}
                  onChange={(e) =>
                    editor.updateCharacter(ch.id, {
                      affection: Number(e.target.value),
                      initialAffection: Number(e.target.value),
                    })
                  }
                  className="mt-1.5 w-full accent-sky-400"
                />
              </div>
            </div>

            {/* 配色选择 */}
            <div className="mt-2 flex items-center gap-1">
              {CHARACTER_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => editor.updateCharacter(ch.id, { color: c })}
                  className={`h-4 w-4 rounded-full border transition ${
                    ch.color === c ? "scale-115 border-white" : "border-transparent opacity-70 hover:opacity-100"
                  }`}
                  style={{ background: c }}
                />
              ))}
            </div>

            {/* 自定义属性列表 */}
            <div className="mt-2.5 border-t border-white/[0.06] pt-2">
              <div className="mb-1.5 flex items-center justify-between text-[10.5px] text-zinc-500">
                <span>自定义属性</span>
              </div>
              <div className="flex flex-col gap-1">
                {ch.attributes.map((attr) => (
                  <div key={attr.key} className="flex items-center gap-1.5 text-[11.5px]">
                    <span className="text-zinc-400">{attr.label}:</span>
                    <input
                      value={attr.value}
                      onChange={(e) => {
                        const val = e.target.value;
                        editor.updateCharacter(ch.id, {
                          attributes: ch.attributes.map((a) =>
                            a.key === attr.key ? { ...a, value: isNaN(Number(val)) || val === "" ? val : Number(val) } : a
                          ),
                        });
                      }}
                      className="field min-w-0 flex-1 rounded border border-white/10 bg-zinc-900 px-1.5 py-0.5 text-[11px] text-sky-300"
                    />
                    <button
                      onClick={() => editor.removeCharacterAttribute(ch.id, attr.key)}
                      className="text-zinc-500 hover:text-rose-400"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
              {/* 新增属性行 */}
              <div className="mt-1.5 flex items-center gap-1">
                <input
                  placeholder="属性名"
                  value={newAttrLabel[ch.id] ?? ""}
                  onChange={(e) => setNewAttrLabel((p) => ({ ...p, [ch.id]: e.target.value }))}
                  className="field w-20 rounded border border-white/10 bg-zinc-900 px-1.5 py-0.5 text-[11px] text-zinc-200"
                />
                <input
                  placeholder="初始值"
                  value={newAttrVal[ch.id] ?? ""}
                  onChange={(e) => setNewAttrVal((p) => ({ ...p, [ch.id]: e.target.value }))}
                  className="field min-w-0 flex-1 rounded border border-white/10 bg-zinc-900 px-1.5 py-0.5 text-[11px] text-zinc-200"
                />
                <button
                  onClick={() => {
                    const label = (newAttrLabel[ch.id] ?? "").trim();
                    if (!label) return;
                    const rawVal = (newAttrVal[ch.id] ?? "0").trim();
                    editor.addCharacterAttribute(ch.id, {
                      key: `attr_${Date.now().toString(36)}`,
                      label,
                      value: isNaN(Number(rawVal)) ? rawVal : Number(rawVal),
                    });
                    setNewAttrLabel((p) => ({ ...p, [ch.id]: "" }));
                    setNewAttrVal((p) => ({ ...p, [ch.id]: "" }));
                  }}
                  className="rounded bg-white/[0.07] px-2 py-0.5 text-[11px] text-zinc-200 hover:bg-sky-500 hover:text-white"
                >
                  +
                </button>
              </div>
            </div>
          </div>
        );
      })}

      <button
        onClick={() => {
          editor.addCharacter();
          notify("已添加新角色");
        }}
        className="flex h-9 items-center justify-center gap-1.5 rounded-xl border border-dashed border-white/15 text-[12.5px] text-zinc-300 transition hover:border-sky-400/50 hover:bg-sky-400/[0.06] hover:text-sky-200"
      >
        <Plus size={14} /> 添加角色
      </button>
    </div>
  );
}

/* ---------------- 资源库 ---------------- */

function AssetsTab({ editor, notify }: LeftPanelProps) {
  const { project, selectedNode } = editor;

  const applyBg = (bgId: string) => {
    if (!selectedNode) {
      notify("请先选择一个场景节点");
      return;
    }
    editor.updateNode(selectedNode.id, { backgroundId: bgId });
    notify(`已为「${selectedNode.title}」切换背景`);
  };

  return (
    <div className="flex flex-col gap-4 p-2.5">
      <section>
        <p className="mb-2 px-1 text-[11px] font-semibold tracking-wider text-zinc-500 uppercase">
          场景背景 · {BACKGROUNDS.length}
        </p>
        <div className="grid grid-cols-2 gap-2">
          {BACKGROUNDS.map((bg) => {
            const active = selectedNode?.backgroundId === bg.id;
            return (
              <button
                key={bg.id}
                onClick={() => applyBg(bg.id)}
                className={`group overflow-hidden rounded-xl border text-left transition ${
                  active ? "border-sky-400 ring-2 ring-sky-400/20" : "border-white/[0.08] hover:border-white/20"
                }`}
              >
                <div className="relative aspect-[16/10] w-full overflow-hidden bg-zinc-900">
                  <img
                    src={bg.url}
                    alt={bg.name}
                    className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                  />
                </div>
                <div className="bg-white/[0.02] px-2 py-1.5">
                  <div className="truncate text-[12px] font-medium text-zinc-200">{bg.name}</div>
                  <div className="truncate text-[10.5px] text-zinc-500">{bg.mood}</div>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <p className="mb-2 px-1 text-[11px] font-semibold tracking-wider text-zinc-500 uppercase">
          角色立绘 · {SPRITES.length}
        </p>
        <div className="flex flex-col gap-1.5">
          {SPRITES.map((sp) => {
            const usedBy = project.characters.find((c) => c.spriteId === sp.id);
            return (
              <div
                key={sp.id}
                className="flex items-center gap-2.5 rounded-xl border border-white/[0.07] bg-white/[0.02] p-2"
              >
                <img
                  src={sp.url}
                  alt={sp.name}
                  className="h-12 w-10 rounded-lg border border-white/10 bg-zinc-900 object-cover object-top"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12.5px] font-medium text-zinc-200">{sp.name}</p>
                  <p className="truncate text-[11px] text-zinc-500">
                    {usedBy ? `已绑定：${usedBy.name}` : "未绑定（在「角色」页绑定）"}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <p className="mb-2 px-1 text-[11px] font-semibold tracking-wider text-zinc-500 uppercase">
          音乐与音效 · {AUDIO_TRACKS.length}
        </p>
        <div className="flex flex-col gap-1">
          {AUDIO_TRACKS.map((track) => (
            <div
              key={track.id}
              onClick={() => {
                if (!selectedNode) return;
                if (track.kind === "bgm") editor.updateNode(selectedNode.id, { bgmId: track.id });
                else editor.updateNode(selectedNode.id, { sfxId: track.id });
                notify(`已将「${track.name}」设为当前场景音频`);
              }}
              className="flex cursor-pointer items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-1.5 text-[12px] text-zinc-300 transition hover:bg-white/[0.06]"
            >
              <Music size={12} className="text-sky-400" />
              <span className="flex-1 truncate">{track.name}</span>
              <span className="font-mono text-[10px] text-zinc-500 uppercase">{track.kind}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
