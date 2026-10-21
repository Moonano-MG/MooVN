import { useMemo, useState } from "react";
import {
  FolderTree,
  Users,
  Images,
  Search,
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
  Folder,
  FileCode2,
  FileText,
  Sparkles,
  Type,
  Film,
} from "lucide-react";
import type { Editor } from "../hooks/useEditor";
import type { NodeType, ScriptLang, ValidationIssue } from "../types";
import { NODE_TYPE_LABELS } from "../types";
import { BACKGROUNDS, SPRITES, AUDIO_TRACKS, CHARACTER_COLORS, spriteById } from "../data/assets";

export type LeftTab = "outline" | "chars" | "assets";

interface LeftPanelProps {
  editor: Editor;
  issues: ValidationIssue[];
  activeTab: LeftTab;
  onTabChange: (t: LeftTab) => void;
  onLocateNode: (id: string) => void;
  onOpenChapterYaml: (chapterId: string) => void;
  onOpenScriptLang: (lang: ScriptLang) => void;
  onOpenAiSpec: () => void;
  notify: (msg: string) => void;
}

const TABS: { id: LeftTab; label: string; icon: typeof FolderTree }[] = [
  { id: "outline", label: "文件总管", icon: FolderTree },
  { id: "chars", label: "角色", icon: Users },
  { id: "assets", label: "资源", icon: Images },
];

export default function LeftPanel(props: LeftPanelProps) {
  const { activeTab, onTabChange } = props;
  return (
    <aside className="flex h-full w-full flex-col bg-[#0e0e11] select-none">
      <div className="flex shrink-0 gap-1 border-b border-white/[0.06] p-2">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`flex h-7 flex-1 items-center justify-center gap-1.5 rounded-lg text-[12px] font-medium transition ${
                active ? "bg-white/[0.09] text-white" : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
              }`}
            >
              <Icon size={13} />
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
        {activeTab === "outline" && <FileExplorerTab {...props} />}
        {activeTab === "chars" && <CharsTab {...props} />}
        {activeTab === "assets" && <AssetsTab {...props} />}
      </div>
    </aside>
  );
}

/* ---------------- 文件总管（支持「章节 > 场景」与「标准根目录文件树」一键切换） ---------------- */

function nodeIcon(type: NodeType) {
  switch (type) {
    case "choice":
      return <GitBranch size={11} />;
    case "end":
      return <Flag size={11} />;
    case "fade":
      return <Sparkles size={11} />;
    case "screen_text":
      return <Type size={11} />;
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
    case "fade":
      return "bg-cyan-400/15 text-cyan-300";
    case "screen_text":
      return "bg-pink-400/15 text-pink-300";
    case "script":
      return "bg-indigo-400/15 text-indigo-300";
    default:
      return "bg-sky-500/15 text-sky-300";
  }
}

function FileExplorerTab({
  editor,
  issues,
  onLocateNode,
  onOpenChapterYaml,
  onOpenScriptLang,
  onOpenAiSpec,
  notify,
}: LeftPanelProps) {
  const { project, selectedNodeId } = editor;
  const [rootMode, setRootMode] = useState(false);
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [editingChapId, setEditingChapId] = useState<string | null>(null);
  const [chapDraft, setChapDraft] = useState("");
  const [dragOverChapId, setDragOverChapId] = useState<string | null>(null);

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
      {/* 顶部模式开关：章节 > 场景 vs 标准项目根目录 */}
      <div className="flex items-center justify-between gap-1.5 border-b border-white/[0.05] px-2.5 py-2">
        <div className="flex flex-1 items-center rounded-lg border border-white/[0.08] bg-zinc-900/80 p-0.5 text-[11px]">
          <button
            onClick={() => setRootMode(false)}
            className={`flex-1 rounded-md py-1 font-medium transition ${
              !rootMode ? "bg-sky-500 text-white" : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            章节 &gt; 场景
          </button>
          <button
            onClick={() => setRootMode(true)}
            className={`flex-1 rounded-md py-1 font-medium transition ${
              rootMode ? "bg-sky-500 text-white" : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            项目根目录
          </button>
        </div>

        {!rootMode && (
          <button
            onClick={() => {
              editor.addChapter();
              notify("已新建章节");
            }}
            title="新建章节"
            className="flex h-7 shrink-0 items-center gap-1 rounded-lg border border-white/10 bg-white/[0.04] px-2 text-[11px] text-zinc-300 hover:bg-white/[0.09]"
          >
            <Plus size={12} /> 章节
          </button>
        )}
      </div>

      {/* 搜索框 */}
      <div className="px-2.5 pt-2 pb-1">
        <div className="relative">
          <Search size={12} className="absolute top-1/2 left-2.5 -translate-y-1/2 text-zinc-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={rootMode ? "搜索项目文件…" : "搜索章节或场景…"}
            className="field w-full rounded-lg border border-white/[0.08] bg-zinc-900/70 py-1 pr-2 pl-7 text-[11.5px] text-zinc-100 placeholder:text-zinc-600"
          />
        </div>
      </div>

      {/* 模式 A：标准根目录文件树 */}
      {rootMode ? (
        <div className="flex flex-col gap-1 px-2.5 py-2 font-mono text-[11.5px]">
          <div className="flex items-center gap-1.5 px-1.5 py-1 font-sans text-[12px] font-semibold text-zinc-200">
            <Folder size={13} className="text-sky-400" /> / ({project.name})
          </div>

          {/* /chapters 目录（一章一 YAML） */}
          <div className="pl-3">
            <div className="flex items-center gap-1.5 py-1 text-zinc-300">
              <Folder size={13} className="text-amber-400" /> chapters/
            </div>
            <div className="flex flex-col gap-0.5 pl-4">
              {project.chapters.map((ch, idx) => {
                const fileName = `chapter_${idx + 1}.yaml`;
                if (q && !fileName.includes(q) && !ch.title.toLowerCase().includes(q)) return null;
                return (
                  <button
                    key={ch.id}
                    onClick={() => onOpenChapterYaml(ch.id)}
                    className="flex items-center justify-between rounded-md px-2 py-1 text-left text-zinc-300 hover:bg-white/[0.06] hover:text-sky-300"
                  >
                    <span className="flex items-center gap-1.5 truncate">
                      <FileCode2 size={12} className="text-sky-400" />
                      {fileName}
                    </span>
                    <span className="font-sans text-[10px] text-zinc-500 truncate max-w-24">
                      {ch.title.split("·")[0]}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* /scripts 目录（TS 主支持 + 跨语言桥接） */}
          <div className="pl-3">
            <div className="flex items-center gap-1.5 py-1 text-zinc-300">
              <Folder size={13} className="text-amber-400" /> scripts/
            </div>
            <div className="flex flex-col gap-0.5 pl-4">
              {[
                { name: "main.ts", desc: "TS 核心引擎入口", lang: "typescript" as ScriptLang },
                { name: "runtime.js", desc: "JS 编译产物", lang: "javascript" as ScriptLang },
                { name: "bridge_lua.ts", desc: "TS->Lua 桥接", lang: "lua" as ScriptLang },
                { name: "bridge_teal.ts", desc: "TS->Teal 桥接", lang: "teal" as ScriptLang },
                { name: "bridge_py.ts", desc: "TS->Python 桥接", lang: "python" as ScriptLang },
              ].map((f) => {
                if (q && !f.name.includes(q)) return null;
                return (
                  <button
                    key={f.name}
                    onClick={() => onOpenScriptLang(f.lang)}
                    className="flex items-center justify-between rounded-md px-2 py-1 text-left text-zinc-300 hover:bg-white/[0.06] hover:text-sky-300"
                  >
                    <span className="flex items-center gap-1.5">
                      <Code2 size={12} className="text-indigo-400" />
                      {f.name}
                    </span>
                    <span className="font-sans text-[10px] text-zinc-500">{f.desc}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* /assets 目录 */}
          <div className="pl-3">
            <div className="flex items-center gap-1.5 py-1 text-zinc-300">
              <Folder size={13} className="text-amber-400" /> assets/
            </div>
            <div className="flex flex-col gap-0.5 pl-4">
              {BACKGROUNDS.map((b) => (
                <div
                  key={b.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("application/moovn-asset", JSON.stringify({ type: "bg", id: b.id }));
                  }}
                  className="flex cursor-grab items-center justify-between rounded-md px-2 py-1 text-zinc-400 hover:bg-white/[0.05] hover:text-zinc-200"
                >
                  <span className="flex items-center gap-1.5 truncate">
                    <ImageIcon size={12} className="text-emerald-400" />
                    {b.url.replace("/images/", "")}
                  </span>
                  <span className="text-[9.5px] text-zinc-600">{b.mediaKind}</span>
                </div>
              ))}
              {SPRITES.map((s) => (
                <div
                  key={s.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("application/moovn-asset", JSON.stringify({ type: "sprite", id: s.id }));
                  }}
                  className="flex cursor-grab items-center justify-between rounded-md px-2 py-1 text-zinc-400 hover:bg-white/[0.05] hover:text-zinc-200"
                >
                  <span className="flex items-center gap-1.5 truncate">
                    <UserCheck size={12} className="text-pink-400" />
                    {s.url.replace("/images/", "")}
                  </span>
                  <span className="text-[9.5px] text-zinc-600">RGBA</span>
                </div>
              ))}
            </div>
          </div>

          {/* /ai 目录 */}
          <div className="pl-3">
            <div className="flex items-center gap-1.5 py-1 text-zinc-300">
              <Folder size={13} className="text-amber-400" /> ai/
            </div>
            <div className="pl-4">
              <button
                onClick={onOpenAiSpec}
                className="flex w-full items-center justify-between rounded-md px-2 py-1 text-left text-zinc-300 hover:bg-white/[0.06] hover:text-sky-300"
              >
                <span className="flex items-center gap-1.5">
                  <FileText size={12} className="text-amber-300" />
                  MOOVN_AI_SPEC.md
                </span>
                <span className="font-sans text-[10px] text-zinc-500">AI 规范</span>
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* 模式 B：章节 > 场景 树（支持拖拽场景跨章节移动） */
        <div className="flex flex-col gap-2 px-2.5 py-1.5">
          {project.chapters.map((chapter) => {
            const isCollapsed = Boolean(collapsed[chapter.id]);
            const scenes = project.nodes
              .filter((n) => n.chapterId === chapter.id)
              .filter((n) => !q || n.title.toLowerCase().includes(q) || chapter.title.toLowerCase().includes(q));

            return (
              <div
                key={chapter.id}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOverChapId(chapter.id);
                }}
                onDragLeave={() => setDragOverChapId(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOverChapId(null);
                  const draggedNodeId = e.dataTransfer.getData("text/moovn-node-id");
                  if (draggedNodeId) {
                    editor.updateNode(draggedNodeId, { chapterId: chapter.id });
                    notify(`已将场景移动至「${chapter.title}」`);
                  }
                }}
                className={`overflow-hidden rounded-xl border transition ${
                  dragOverChapId === chapter.id
                    ? "border-sky-400 bg-sky-500/10"
                    : "border-white/[0.06] bg-white/[0.015]"
                }`}
              >
                {/* 章节标题行 */}
                <div className="flex items-center gap-1.5 bg-white/[0.025] px-2.5 py-1.5">
                  <button
                    onClick={() => setCollapsed((prev) => ({ ...prev, [chapter.id]: !isCollapsed }))}
                    className="text-zinc-400 hover:text-zinc-200"
                  >
                    {isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
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
                      className="min-w-0 flex-1 cursor-pointer truncate text-[12px] font-semibold text-zinc-200"
                    >
                      {chapter.title}
                    </span>
                  )}

                  <button
                    onClick={() => onOpenChapterYaml(chapter.id)}
                    title="查看本章 YAML（包含本章全部场景）"
                    className="rounded px-1.5 py-0.5 font-mono text-[10px] text-zinc-400 hover:bg-white/[0.08] hover:text-sky-300"
                  >
                    YAML
                  </button>

                  <button
                    onClick={() => {
                      const lastInChap = scenes[scenes.length - 1];
                      const x = lastInChap ? lastInChap.x + 280 : 120;
                      const y = lastInChap ? lastInChap.y : 200;
                      const newId = editor.addNode("dialogue", x, y, chapter.id);
                      if (lastInChap && !lastInChap.nextNodeId && lastInChap.type !== "choice" && lastInChap.type !== "end") {
                        editor.connect({ fromNodeId: lastInChap.id, port: -1 }, newId);
                      }
                    }}
                    title="在此章节下新增场景"
                    className="rounded p-1 text-zinc-400 hover:bg-sky-500/20 hover:text-sky-300"
                  >
                    <Plus size={12} />
                  </button>
                </div>

                {/* 场景列表（可拖拽排序或跨章节拖放） */}
                {!isCollapsed && (
                  <div className="flex flex-col gap-0.5 p-1.5">
                    {scenes.map((node) => {
                      const selected = selectedNodeId === node.id;
                      const warn = issueCountByNode.get(node.id) ?? 0;
                      return (
                        <div
                          key={node.id}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData("text/moovn-node-id", node.id);
                          }}
                          onClick={() => onLocateNode(node.id)}
                          className={`group flex cursor-grab items-center gap-2 rounded-lg border px-2 py-1.5 transition active:cursor-grabbing ${
                            selected
                              ? "border-sky-400/35 bg-sky-400/[0.09]"
                              : "border-transparent hover:border-white/[0.07] hover:bg-white/[0.04]"
                          }`}
                        >
                          <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md ${nodeChipClass(node.type)}`}>
                            {nodeIcon(node.type)}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-zinc-100">
                            {node.title}
                          </span>
                          {project.startNodeId === node.id && <Flag size={11} className="shrink-0 text-emerald-300" />}
                          {warn > 0 && (
                            <span className="flex shrink-0 items-center gap-0.5 text-[10px] font-semibold text-amber-300">
                              <AlertTriangle size={10} />
                              {warn}
                            </span>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              editor.deleteNode(node.id);
                            }}
                            title="删除场景"
                            className="rounded p-1 text-zinc-500 opacity-0 transition group-hover:opacity-100 hover:bg-rose-500 hover:text-white"
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      );
                    })}
                    {scenes.length === 0 && (
                      <p className="py-2 text-center text-[11px] text-zinc-600">暂无场景</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 结构检查 */}
      {issues.length > 0 && (
        <div className="mt-2 border-t border-white/[0.06] p-2.5">
          <div className="flex flex-col gap-1">
            {issues.slice(0, 5).map((issue) => (
              <button
                key={issue.id}
                onClick={() => issue.nodeId && onLocateNode(issue.nodeId)}
                className={`rounded-lg px-2.5 py-1.5 text-left text-[11px] leading-snug transition hover:bg-white/[0.05] ${
                  issue.level === "error" ? "bg-rose-500/[0.08] text-rose-200" : "bg-amber-400/[0.06] text-amber-100/90"
                }`}
              >
                {issue.message}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- 角色系统（透明立绘 + 好感度 + 自定义属性） ---------------- */

function CharsTab({ editor, notify }: LeftPanelProps) {
  const { project } = editor;
  const [newAttrLabel, setNewAttrLabel] = useState<Record<string, string>>({});
  const [newAttrVal, setNewAttrVal] = useState<Record<string, string>>({});

  return (
    <div className="flex flex-col gap-2.5 p-2.5">
      {project.characters.map((ch) => {
        const sprite = spriteById(ch.spriteId);
        return (
          <div
            key={ch.id}
            draggable={Boolean(ch.spriteId)}
            onDragStart={(e) => {
              e.dataTransfer.setData(
                "application/moovn-asset",
                JSON.stringify({ type: "character", id: ch.id }),
              );
            }}
            className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-2.5"
          >
            <div className="flex items-start gap-2.5">
              {sprite ? (
                <img
                  src={sprite.url}
                  alt={ch.name}
                  className="h-14 w-11 shrink-0 rounded-lg border border-white/10 bg-zinc-900/80 object-contain object-top"
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
                  className="field w-full rounded-md border border-transparent bg-transparent px-1 py-0.5 text-[12.5px] font-semibold text-zinc-100 hover:border-white/10"
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
                className="rounded-md p-1 text-zinc-500 hover:bg-rose-500/20 hover:text-rose-300"
              >
                <Trash2 size={12} />
              </button>
            </div>

            <div className="mt-2 grid grid-cols-2 gap-1.5">
              <div>
                <select
                  value={ch.spriteId ?? ""}
                  onChange={(e) => editor.updateCharacter(ch.id, { spriteId: e.target.value || null })}
                  className="field w-full rounded-md border border-white/10 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-200"
                >
                  <option value="">无立绘</option>
                  {SPRITES.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center px-1">
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
                  className="w-full accent-sky-400"
                />
              </div>
            </div>

            <div className="mt-2 flex items-center gap-1">
              {CHARACTER_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => editor.updateCharacter(ch.id, { color: c })}
                  className={`h-3.5 w-3.5 rounded-full border transition ${
                    ch.color === c ? "scale-115 border-white" : "border-transparent opacity-70 hover:opacity-100"
                  }`}
                  style={{ background: c }}
                />
              ))}
            </div>

            {/* 自定义属性 */}
            <div className="mt-2 border-t border-white/[0.06] pt-2">
              <div className="flex flex-col gap-1">
                {ch.attributes.map((attr) => (
                  <div key={attr.key} className="flex items-center gap-1.5 text-[11px]">
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
                      <X size={11} />
                    </button>
                  </div>
                ))}
              </div>
              <div className="mt-1.5 flex items-center gap-1">
                <input
                  placeholder="属性名"
                  value={newAttrLabel[ch.id] ?? ""}
                  onChange={(e) => setNewAttrLabel((p) => ({ ...p, [ch.id]: e.target.value }))}
                  className="field w-18 rounded border border-white/10 bg-zinc-900 px-1.5 py-0.5 text-[10.5px] text-zinc-200"
                />
                <input
                  placeholder="值"
                  value={newAttrVal[ch.id] ?? ""}
                  onChange={(e) => setNewAttrVal((p) => ({ ...p, [ch.id]: e.target.value }))}
                  className="field min-w-0 flex-1 rounded border border-white/10 bg-zinc-900 px-1.5 py-0.5 text-[10.5px] text-zinc-200"
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
        className="flex h-8 items-center justify-center gap-1.5 rounded-xl border border-dashed border-white/15 text-[12px] text-zinc-300 hover:border-sky-400/50 hover:text-sky-200"
      >
        <Plus size={13} /> 添加角色
      </button>
    </div>
  );
}

/* ---------------- 多媒体资源库（支持拖拽到舞台/节点 + 静态图/多图序列帧/视频/动画） ---------------- */

function AssetsTab({ editor, notify }: LeftPanelProps) {
  const { project, selectedNode } = editor;

  const applyBg = (bgId: string) => {
    if (!selectedNode) return;
    editor.updateNode(selectedNode.id, { backgroundId: bgId });
    notify(`已切换背景`);
  };

  return (
    <div className="flex flex-col gap-4 p-2.5">
      <section>
        <p className="mb-2 px-1 text-[11px] font-semibold text-zinc-400">
          场景与动态背景（可拖拽至右侧舞台）
        </p>
        <div className="grid grid-cols-2 gap-2">
          {BACKGROUNDS.map((bg) => {
            const active = selectedNode?.backgroundId === bg.id;
            return (
              <div
                key={bg.id}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(
                    "application/moovn-asset",
                    JSON.stringify({ type: "bg", id: bg.id }),
                  );
                }}
                onClick={() => applyBg(bg.id)}
                className={`group cursor-grab overflow-hidden rounded-xl border text-left transition active:cursor-grabbing ${
                  active ? "border-sky-400 ring-2 ring-sky-400/20" : "border-white/[0.08] hover:border-white/20"
                }`}
              >
                <div className="relative aspect-[16/10] w-full overflow-hidden bg-zinc-900">
                  <img
                    src={bg.url}
                    alt={bg.name}
                    className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                  />
                  <span className="absolute top-1.5 right-1.5 flex items-center gap-0.5 rounded bg-black/75 px-1.5 py-0.5 text-[9.5px] text-sky-300">
                    <Film size={9} />
                    {bg.mediaKind === "frame_sequence"
                      ? "多图动画"
                      : bg.mediaKind === "video"
                        ? "视频流"
                        : bg.mediaKind === "tween"
                          ? "动态粒子"
                          : "静态图"}
                  </span>
                </div>
                <div className="bg-white/[0.02] px-2 py-1.5">
                  <div className="truncate text-[11.5px] font-medium text-zinc-200">{bg.name}</div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <p className="mb-2 px-1 text-[11px] font-semibold text-zinc-400">
          角色透明立绘与序列帧（可拖拽上场）
        </p>
        <div className="flex flex-col gap-1.5">
          {SPRITES.map((sp) => {
            const usedBy = project.characters.find((c) => c.spriteId === sp.id);
            return (
              <div
                key={sp.id}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(
                    "application/moovn-asset",
                    JSON.stringify({
                      type: "character",
                      id: usedBy?.id ?? project.characters[0]?.id,
                      spriteId: sp.id,
                    }),
                  );
                }}
                className="flex cursor-grab items-center gap-2.5 rounded-xl border border-white/[0.07] bg-white/[0.02] p-2 active:cursor-grabbing hover:border-white/20"
              >
                <img
                  src={sp.url}
                  alt={sp.name}
                  className="h-12 w-10 rounded-lg border border-white/10 bg-zinc-900/90 object-contain object-top"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] font-medium text-zinc-200">{sp.name}</p>
                  <p className="truncate text-[10.5px] text-zinc-500">
                    {sp.mediaKind === "frame_sequence" ? "支持多帧动画" : "支持补间动画"}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <p className="mb-2 px-1 text-[11px] font-semibold text-zinc-400">音乐与音效</p>
        <div className="flex flex-col gap-1">
          {AUDIO_TRACKS.map((track) => (
            <div
              key={track.id}
              onClick={() => {
                if (!selectedNode) return;
                if (track.kind === "bgm") editor.updateNode(selectedNode.id, { bgmId: track.id });
                else editor.updateNode(selectedNode.id, { sfxId: track.id });
                notify(`已应用音频「${track.name}」`);
              }}
              className="flex cursor-pointer items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-1.5 text-[11.5px] text-zinc-300 hover:bg-white/[0.06]"
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
