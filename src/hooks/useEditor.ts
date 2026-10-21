import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  Character,
  CharacterAttribute,
  ChoiceOption,
  DialogueLine,
  EdgeRef,
  NodeType,
  Project,
  StageCharacterPlacement,
  StoryNode,
} from "../types";
import { defaultProject } from "../data/defaultProject";
import { CHARACTER_COLORS } from "../data/assets";
import { loadLocal, persistLocal } from "../lib/tauriBridge";
import { nodeById, uid } from "../lib/projectUtils";

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

export function blankProject(): Project {
  const startId = uid("scene");
  const chapId = "ch-1";
  return {
    id: uid("proj"),
    name: "未命名工程",
    author: "",
    version: "0.1.0",
    startNodeId: startId,
    chapters: [{ id: chapId, title: "第一章 · 序幕", order: 1 }],
    characters: [
      {
        id: uid("char"),
        name: "主角",
        color: "#38bdf8",
        spriteId: null,
        description: "",
        initialAffection: 0,
        affection: 0,
        attributes: [],
      },
    ],
    nodes: [
      {
        id: startId,
        chapterId: chapId,
        type: "dialogue",
        title: "场景 1 · 序幕",
        x: 100,
        y: 180,
        backgroundId: "bg-classroom",
        stageCharacters: [],
        lines: [{ id: uid("line"), characterId: null, text: "故事，从这里开始。" }],
        choices: [],
        nextNodeId: null,
      },
    ],
    updatedAt: new Date().toISOString(),
  };
}

const NODE_DEFAULT_TITLES: Record<NodeType, string> = {
  dialogue: "新对话场景",
  choice: "新分支选择",
  character: "角色登场节点",
  background: "场景背景切换",
  audio: "音效与音乐节点",
  script: "自定义脚本节点",
  end: "新结局",
};

export function useEditor() {
  const [project, setProjectState] = useState<Project>(() => {
    const saved = loadLocal();
    return saved ?? clone(defaultProject);
  });
  const projectRef = useRef(project);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(project.startNodeId || null);
  const [selectedEdge, setSelectedEdge] = useState<EdgeRef | null>(null);
  const [dirty, setDirty] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [, setHistoryTick] = useState(0);

  const pastRef = useRef<Project[]>([]);
  const futureRef = useRef<Project[]>([]);
  const lastPushRef = useRef(0);
  const firstRunRef = useRef(true);

  const pushHistory = useCallback((snapshot: Project, force = false) => {
    const now = Date.now();
    if (!force && now - lastPushRef.current < 700) return;
    lastPushRef.current = now;
    pastRef.current.push(clone(snapshot));
    if (pastRef.current.length > 80) pastRef.current.shift();
    futureRef.current = [];
    setHistoryTick((t) => t + 1);
  }, []);

  const applyProject = useCallback(
    (next: Project, forceHistory = false) => {
      pushHistory(projectRef.current, forceHistory);
      projectRef.current = next;
      setProjectState(next);
      setDirty(true);
    },
    [pushHistory],
  );

  const update = useCallback(
    (fn: (p: Project) => Project, forceHistory = false) => {
      applyProject(fn(clone(projectRef.current)), forceHistory);
    },
    [applyProject],
  );

  useEffect(() => {
    if (firstRunRef.current) {
      firstRunRef.current = false;
      return;
    }
    const t = setTimeout(() => {
      persistLocal(projectRef.current);
      setLastSavedAt(new Date());
      setDirty(false);
    }, 900);
    return () => clearTimeout(t);
  }, [project]);

  const undo = useCallback(() => {
    const prev = pastRef.current.pop();
    if (!prev) return;
    futureRef.current.push(clone(projectRef.current));
    projectRef.current = prev;
    setProjectState(prev);
    setDirty(true);
    lastPushRef.current = Date.now();
    setHistoryTick((t) => t + 1);
  }, []);

  const redo = useCallback(() => {
    const next = futureRef.current.pop();
    if (!next) return;
    pastRef.current.push(clone(projectRef.current));
    projectRef.current = next;
    setProjectState(next);
    setDirty(true);
    lastPushRef.current = Date.now();
    setHistoryTick((t) => t + 1);
  }, []);

  const selectNode = useCallback((id: string | null) => {
    setSelectedNodeId(id);
    setSelectedEdge(null);
  }, []);

  const selectEdge = useCallback((edge: EdgeRef | null) => {
    setSelectedEdge(edge);
    if (edge) setSelectedNodeId(null);
  }, []);

  useEffect(() => {
    if (selectedNodeId && !nodeById(project, selectedNodeId)) {
      setSelectedNodeId(project.startNodeId || project.nodes[0]?.id || null);
    }
    if (selectedEdge && !nodeById(project, selectedEdge.fromNodeId)) {
      setSelectedEdge(null);
    }
  }, [project, selectedNodeId, selectedEdge]);

  /* ---------------- 章节管理 ---------------- */
  const addChapter = useCallback(
    (title?: string) => {
      const id = uid("ch");
      update((p) => {
        const num = p.chapters.length + 1;
        p.chapters.push({
          id,
          title: title || `第 ${num} 章 · 新章节`,
          order: num,
        });
        return p;
      }, true);
      return id;
    },
    [update],
  );

  const renameChapter = useCallback(
    (chapterId: string, title: string) => {
      update((p) => {
        const ch = p.chapters.find((c) => c.id === chapterId);
        if (ch) ch.title = title;
        return p;
      });
    },
    [update],
  );

  const deleteChapter = useCallback(
    (chapterId: string) => {
      update((p) => {
        if (p.chapters.length <= 1) return p;
        const fallbackId = p.chapters.find((c) => c.id !== chapterId)?.id ?? "ch-1";
        p.chapters = p.chapters.filter((c) => c.id !== chapterId);
        p.nodes.forEach((n) => {
          if (n.chapterId === chapterId) n.chapterId = fallbackId;
        });
        return p;
      }, true);
    },
    [update],
  );

  /* ---------------- 节点 / 场景管理 ---------------- */
  const addNode = useCallback(
    (type: NodeType, x: number, y: number, chapterId?: string): string => {
      const id = uid("n");
      update((p) => {
        const activeNode = p.nodes.find((n) => n.id === selectedNodeId);
        const targetChapterId = chapterId || activeNode?.chapterId || p.chapters[0]?.id || "ch-1";
        const sceneNum = p.nodes.length + 1;
        const node: StoryNode = {
          id,
          chapterId: targetChapterId,
          type,
          title: `场景 ${sceneNum} · ${NODE_DEFAULT_TITLES[type]}`,
          x: Math.round(x),
          y: Math.round(y),
          backgroundId: activeNode?.backgroundId ?? "bg-classroom",
          bgmId: activeNode?.bgmId ?? null,
          sfxId: null,
          stageCharacters: activeNode ? clone(activeNode.stageCharacters) : [],
          lines:
            type === "end"
              ? []
              : [{ id: uid("line"), characterId: null, text: type === "choice" ? "作出你的选择：" : "在这里输入场景台词……" }],
          choices:
            type === "choice"
              ? [
                  { id: uid("choice"), text: "选项一", targetNodeId: null },
                  { id: uid("choice"), text: "选项二", targetNodeId: null },
                ]
              : [],
          nextNodeId: null,
          endingKind: type === "end" ? "normal" : undefined,
          endingDescription: type === "end" ? "" : undefined,
          scriptLang: "lua",
          scriptCode: `-- 场景 ${sceneNum} 脚本\nmoovn.say("旁白", "新场景已就绪")`,
        };
        p.nodes.push(node);
        if (p.nodes.length === 1) p.startNodeId = id;
        return p;
      }, true);
      setSelectedNodeId(id);
      setSelectedEdge(null);
      return id;
    },
    [update, selectedNodeId],
  );

  const updateNode = useCallback(
    (id: string, patch: Partial<StoryNode>) => {
      update((p) => {
        const n = p.nodes.find((node) => node.id === id);
        if (n) Object.assign(n, patch);
        return p;
      });
    },
    [update],
  );

  const moveNode = useCallback(
    (id: string, x: number, y: number) => {
      update((p) => {
        const n = p.nodes.find((node) => node.id === id);
        if (n) {
          n.x = Math.round(x);
          n.y = Math.round(y);
        }
        return p;
      });
    },
    [update],
  );

  const deleteNode = useCallback(
    (id: string) => {
      update((p) => {
        p.nodes = p.nodes.filter((n) => n.id !== id);
        for (const n of p.nodes) {
          if (n.nextNodeId === id) n.nextNodeId = null;
          n.choices.forEach((c) => {
            if (c.targetNodeId === id) c.targetNodeId = null;
          });
        }
        if (p.startNodeId === id) p.startNodeId = p.nodes[0]?.id ?? "";
        return p;
      }, true);
      setSelectedNodeId((cur) => (cur === id ? null : cur));
      setSelectedEdge(null);
    },
    [update],
  );

  const duplicateNode = useCallback(
    (id: string) => {
      const src = nodeById(projectRef.current, id);
      if (!src) return;
      const copy = clone(src);
      copy.id = uid("n");
      copy.title = `${src.title}（续）`;
      copy.x += 280;
      copy.lines = copy.lines.map((l) => ({ ...l, id: uid("line") }));
      copy.choices = copy.choices.map((c) => ({ ...c, id: uid("choice") }));
      update((p) => {
        const orig = p.nodes.find((n) => n.id === id);
        if (orig && !orig.nextNodeId && orig.type !== "choice" && orig.type !== "end") {
          orig.nextNodeId = copy.id;
        }
        p.nodes.push(copy);
        return p;
      }, true);
      setSelectedNodeId(copy.id);
      setSelectedEdge(null);
    },
    [update],
  );

  const setStartNode = useCallback(
    (id: string) => {
      update((p) => {
        p.startNodeId = id;
        return p;
      }, true);
    },
    [update],
  );

  /* ---------------- 舞台角色位置操作 ---------------- */
  const upsertStageCharacter = useCallback(
    (nodeId: string, characterId: string, patch: Partial<StageCharacterPlacement>) => {
      update((p) => {
        const n = p.nodes.find((node) => node.id === nodeId);
        if (!n) return p;
        const existing = n.stageCharacters.find((sc) => sc.characterId === characterId);
        if (existing) {
          Object.assign(existing, patch);
        } else {
          n.stageCharacters.push({
            characterId,
            x: patch.x ?? 50,
            y: patch.y ?? 50,
            scale: patch.scale ?? 1,
            opacity: patch.opacity ?? 1,
            flipX: patch.flipX ?? false,
          });
        }
        return p;
      });
    },
    [update],
  );

  const removeStageCharacter = useCallback(
    (nodeId: string, characterId: string) => {
      update((p) => {
        const n = p.nodes.find((node) => node.id === nodeId);
        if (n) {
          n.stageCharacters = n.stageCharacters.filter((sc) => sc.characterId !== characterId);
        }
        return p;
      }, true);
    },
    [update],
  );

  /* ---------------- 连线 ---------------- */
  const connect = useCallback(
    (edge: EdgeRef, targetNodeId: string | null) => {
      if (targetNodeId === edge.fromNodeId) return;
      update((p) => {
        const from = p.nodes.find((n) => n.id === edge.fromNodeId);
        if (!from) return p;
        if (edge.port < 0) from.nextNodeId = targetNodeId;
        else if (from.choices[edge.port]) from.choices[edge.port].targetNodeId = targetNodeId;
        return p;
      }, true);
    },
    [update],
  );

  /* ---------------- 台词 / 选项 ---------------- */
  const addLine = useCallback(
    (nodeId: string) => {
      update((p) => {
        const n = p.nodes.find((node) => node.id === nodeId);
        if (n) n.lines.push({ id: uid("line"), characterId: null, text: "" });
        return p;
      }, true);
    },
    [update],
  );

  const updateLine = useCallback(
    (nodeId: string, lineId: string, patch: Partial<DialogueLine>) => {
      update((p) => {
        const line = p.nodes.find((n) => n.id === nodeId)?.lines.find((l) => l.id === lineId);
        if (line) Object.assign(line, patch);
        return p;
      });
    },
    [update],
  );

  const removeLine = useCallback(
    (nodeId: string, lineId: string) => {
      update((p) => {
        const n = p.nodes.find((node) => node.id === nodeId);
        if (n) n.lines = n.lines.filter((l) => l.id !== lineId);
        return p;
      }, true);
    },
    [update],
  );

  const moveLine = useCallback(
    (nodeId: string, lineId: string, dir: -1 | 1) => {
      update((p) => {
        const n = p.nodes.find((node) => node.id === nodeId);
        if (!n) return p;
        const idx = n.lines.findIndex((l) => l.id === lineId);
        const swap = idx + dir;
        if (idx < 0 || swap < 0 || swap >= n.lines.length) return p;
        [n.lines[idx], n.lines[swap]] = [n.lines[swap], n.lines[idx]];
        return p;
      }, true);
    },
    [update],
  );

  const addChoice = useCallback(
    (nodeId: string) => {
      update((p) => {
        const n = p.nodes.find((node) => node.id === nodeId);
        if (n) n.choices.push({ id: uid("choice"), text: `选项 ${n.choices.length + 1}`, targetNodeId: null });
        return p;
      }, true);
    },
    [update],
  );

  const updateChoice = useCallback(
    (nodeId: string, choiceId: string, patch: Partial<ChoiceOption>) => {
      update((p) => {
        const choice = p.nodes.find((n) => n.id === nodeId)?.choices.find((c) => c.id === choiceId);
        if (choice) Object.assign(choice, patch);
        return p;
      });
    },
    [update],
  );

  const removeChoice = useCallback(
    (nodeId: string, choiceId: string) => {
      update((p) => {
        const n = p.nodes.find((node) => node.id === nodeId);
        if (n) n.choices = n.choices.filter((c) => c.id !== choiceId);
        return p;
      }, true);
    },
    [update],
  );

  /* ---------------- 角色与好感度/属性 ---------------- */
  const addCharacter = useCallback(() => {
    const id = uid("char");
    update((p) => {
      const color = CHARACTER_COLORS[p.characters.length % CHARACTER_COLORS.length];
      p.characters.push({
        id,
        name: `新角色 ${p.characters.length + 1}`,
        color,
        spriteId: "sp-yuki",
        description: "",
        initialAffection: 20,
        affection: 20,
        attributes: [{ key: "trust", label: "信赖度", value: 50 }],
      });
      return p;
    }, true);
    return id;
  }, [update]);

  const updateCharacter = useCallback(
    (id: string, patch: Partial<Character>) => {
      update((p) => {
        const c = p.characters.find((ch) => ch.id === id);
        if (c) Object.assign(c, patch);
        return p;
      });
    },
    [update],
  );

  const addCharacterAttribute = useCallback(
    (charId: string, attr: CharacterAttribute) => {
      update((p) => {
        const c = p.characters.find((ch) => ch.id === charId);
        if (c) c.attributes.push(attr);
        return p;
      }, true);
    },
    [update],
  );

  const removeCharacterAttribute = useCallback(
    (charId: string, key: string) => {
      update((p) => {
        const c = p.characters.find((ch) => ch.id === charId);
        if (c) c.attributes = c.attributes.filter((a) => a.key !== key);
        return p;
      }, true);
    },
    [update],
  );

  const deleteCharacter = useCallback(
    (id: string) => {
      update((p) => {
        p.characters = p.characters.filter((c) => c.id !== id);
        for (const n of p.nodes) {
          n.lines.forEach((l) => {
            if (l.characterId === id) l.characterId = null;
          });
          n.stageCharacters = n.stageCharacters.filter((sc) => sc.characterId !== id);
        }
        return p;
      }, true);
    },
    [update],
  );

  const replaceProject = useCallback(
    (next: Project) => {
      applyProject(clone(next), true);
      setSelectedNodeId(next.startNodeId || next.nodes[0]?.id || null);
      setSelectedEdge(null);
    },
    [applyProject],
  );

  const markSaved = useCallback(() => {
    persistLocal(projectRef.current);
    setLastSavedAt(new Date());
    setDirty(false);
  }, []);

  const selectedNode = useMemo(() => nodeById(project, selectedNodeId) ?? null, [project, selectedNodeId]);

  return {
    project,
    selectedNodeId,
    selectedNode,
    selectedEdge,
    dirty,
    lastSavedAt,
    canUndo: pastRef.current.length > 0,
    canRedo: futureRef.current.length > 0,
    update,
    replaceProject,
    markSaved,
    undo,
    redo,
    selectNode,
    selectEdge,
    addChapter,
    renameChapter,
    deleteChapter,
    addNode,
    updateNode,
    moveNode,
    deleteNode,
    duplicateNode,
    setStartNode,
    upsertStageCharacter,
    removeStageCharacter,
    connect,
    addLine,
    updateLine,
    removeLine,
    moveLine,
    addChoice,
    updateChoice,
    removeChoice,
    addCharacter,
    updateCharacter,
    addCharacterAttribute,
    removeCharacterAttribute,
    deleteCharacter,
  };
}

export type Editor = ReturnType<typeof useEditor>;
