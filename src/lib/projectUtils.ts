import YAML from "yaml";
import type {
  Character,
  Project,
  ScriptLang,
  StoryNode,
  ValidationIssue,
  VisualBlock,
} from "../types";
import { backgroundById, audioById } from "../data/assets";

let seq = 1;
export function uid(prefix = "id"): string {
  seq += 1;
  return `${prefix}-${Date.now().toString(36).slice(-4)}${seq.toString(36)}`;
}

export function nodeById(project: Project, id: string | null | undefined): StoryNode | undefined {
  if (!id) return undefined;
  return project.nodes.find((n) => n.id === id);
}

export function characterById(project: Project, id: string | null | undefined): Character | undefined {
  if (!id) return undefined;
  return project.characters.find((c) => c.id === id);
}

export const charById = characterById;

export function countWords(project: Project): number {
  let total = 0;
  for (const n of project.nodes) {
    for (const l of n.lines) total += l.text.length;
    for (const c of n.choices) total += c.text.length;
    if (n.endingDescription) total += n.endingDescription.length;
  }
  return total;
}

/** 从起点 BFS 求所有可达节点 */
export function reachableNodeIds(project: Project): Set<string> {
  const visited = new Set<string>();
  const start = nodeById(project, project.startNodeId);
  if (!start) return visited;
  const queue: string[] = [start.id];
  while (queue.length > 0) {
    const curId = queue.shift()!;
    if (visited.has(curId)) continue;
    visited.add(curId);
    const cur = nodeById(project, curId);
    if (!cur) continue;
    if (cur.nextNodeId && !visited.has(cur.nextNodeId)) {
      queue.push(cur.nextNodeId);
    }
    cur.choices.forEach((c) => {
      if (c.targetNodeId && !visited.has(c.targetNodeId)) {
        queue.push(c.targetNodeId);
      }
    });
  }
  return visited;
}

export function validateProject(project: Project): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const reachable = reachableNodeIds(project);

  if (!nodeById(project, project.startNodeId)) {
    issues.push({ id: "no-start", nodeId: null, level: "error", message: "尚未设置有效的故事起点" });
  }

  for (const node of project.nodes) {
    if (node.type === "dialogue") {
      if (node.lines.length === 0) {
        issues.push({ id: `${node.id}-empty`, nodeId: node.id, level: "warning", message: `「${node.title}」没有任何台词` });
      }
      if (!node.nextNodeId) {
        issues.push({ id: `${node.id}-nonext`, nodeId: node.id, level: "error", message: `「${node.title}」未连接下一场景` });
      }
    }
    if (node.type === "choice") {
      if (node.choices.length < 2) {
        issues.push({ id: `${node.id}-few`, nodeId: node.id, level: "warning", message: `「${node.title}」的选项少于 2 个` });
      }
      node.choices.forEach((c, i) => {
        if (!c.targetNodeId) {
          issues.push({ id: `${node.id}-c${i}`, nodeId: node.id, level: "error", message: `「${node.title}」的选项 ${i + 1} 未连接目标场景` });
        }
      });
    }
    if (!reachable.has(node.id) && node.id !== project.startNodeId) {
      issues.push({ id: `${node.id}-unreached`, nodeId: node.id, level: "warning", message: `「${node.title}」从起点不可达` });
    }
  }
  return issues;
}

/* ------------------------------------------------------------------ */
/* 场景 YAML 序列化与反序列化                                           */
/* ------------------------------------------------------------------ */

export function nodeToYaml(project: Project, node: StoryNode): string {
  const chapter = project.chapters.find((c) => c.id === node.chapterId);
  const obj = {
    scene: {
      id: node.id,
      title: node.title,
      chapter: chapter ? { id: chapter.id, title: chapter.title } : node.chapterId,
      type: node.type,
      storyline: node.storyline || "主线",
      background: node.backgroundId || null,
      audio: {
        bgm: node.bgmId || null,
        sfx: node.sfxId || null,
      },
      stage_characters: node.stageCharacters.map((sc) => {
        const ch = characterById(project, sc.characterId);
        return {
          character_id: sc.characterId,
          name: ch?.name || sc.characterId,
          position: { x: sc.x, y: sc.y },
          scale: sc.scale,
          opacity: sc.opacity,
          flip_x: Boolean(sc.flipX),
        };
      }),
      dialogue: node.lines.map((l) => {
        const ch = characterById(project, l.characterId);
        return {
          speaker_id: l.characterId,
          speaker: ch ? ch.name : "旁白",
          text: l.text,
        };
      }),
      choices: node.choices.map((c) => ({
        text: c.text,
        target_scene: c.targetNodeId,
        affection_change: c.affectionCharacterId
          ? { character_id: c.affectionCharacterId, delta: c.affectionDelta ?? 0 }
          : null,
      })),
      next_scene: node.nextNodeId,
      ending:
        node.type === "end"
          ? { kind: node.endingKind || "normal", description: node.endingDescription || "" }
          : null,
    },
  };
  return YAML.stringify(obj, { indent: 2 });
}

export function yamlToNodePatch(project: Project, yamlStr: string): Partial<StoryNode> | null {
  try {
    const parsed = YAML.parse(yamlStr);
    const s = parsed?.scene ?? parsed;
    if (!s || typeof s !== "object") return null;
    const patch: Partial<StoryNode> = {};
    if (typeof s.title === "string") patch.title = s.title;
    if (s.background !== undefined) patch.backgroundId = s.background;
    if (s.audio?.bgm !== undefined) patch.bgmId = s.audio.bgm;
    if (s.audio?.sfx !== undefined) patch.sfxId = s.audio.sfx;
    if (s.next_scene !== undefined) patch.nextNodeId = s.next_scene;
    if (Array.isArray(s.stage_characters)) {
      patch.stageCharacters = s.stage_characters.map((sc: any) => ({
        characterId: String(sc.character_id ?? project.characters[0]?.id ?? "c-yuki"),
        x: Number(sc.position?.x ?? sc.x ?? 50),
        y: Number(sc.position?.y ?? sc.y ?? 50),
        scale: Number(sc.scale ?? 1),
        opacity: Number(sc.opacity ?? 1),
        flipX: Boolean(sc.flip_x),
      }));
    }
    if (Array.isArray(s.dialogue)) {
      patch.lines = s.dialogue.map((d: any) => ({
        id: uid("line"),
        characterId: d.speaker_id ?? null,
        text: String(d.text ?? ""),
      }));
    }
    return patch;
  } catch {
    return null;
  }
}

export function projectToYaml(project: Project): string {
  return YAML.stringify(
    {
      project: {
        id: project.id,
        name: project.name,
        author: project.author,
        version: project.version,
        start_scene: project.startNodeId,
      },
      characters: project.characters.map((c) => ({
        id: c.id,
        name: c.name,
        color: c.color,
        sprite_id: c.spriteId,
        initial_affection: c.initialAffection,
        affection: c.affection,
        attributes: c.attributes,
      })),
      chapters: project.chapters.map((ch) => ({
        id: ch.id,
        title: ch.title,
        scenes: project.nodes
          .filter((n) => n.chapterId === ch.id)
          .map((n) => YAML.parse(nodeToYaml(project, n)).scene),
      })),
    },
    { indent: 2 }
  );
}

/* ------------------------------------------------------------------ */
/* 多语言脚本生成 (Lua / Teal / Python / TypeScript)                    */
/* ------------------------------------------------------------------ */

export interface ScriptLine {
  text: string;
  nodeId: string | null;
  kind: "comment" | "label" | "scene" | "say" | "narrate" | "menu" | "choice" | "jump" | "ending" | "blank";
}

export function generateScript(project: Project, lang: ScriptLang = "lua"): ScriptLine[] {
  const out: ScriptLine[] = [];
  const cmt = lang === "python" ? "#" : lang === "typescript" ? "//" : "--";

  out.push({ text: `${cmt} 《${project.name}》 — ${lang.toUpperCase()} 脚本`, nodeId: null, kind: "comment" });
  out.push({ text: `${cmt} 作者：${project.author || "佚名"} · 版本：${project.version}`, nodeId: null, kind: "comment" });
  out.push({ text: "", nodeId: null, kind: "blank" });

  if (lang === "teal") {
    out.push({ text: `local record SceneContext`, nodeId: null, kind: "label" });
    out.push({ text: `  scene_id: string`, nodeId: null, kind: "scene" });
    out.push({ text: `  affection: {string: integer}`, nodeId: null, kind: "scene" });
    out.push({ text: `end`, nodeId: null, kind: "label" });
    out.push({ text: "", nodeId: null, kind: "blank" });
  } else if (lang === "python") {
    out.push({ text: `import moovn`, nodeId: null, kind: "label" });
    out.push({ text: "", nodeId: null, kind: "blank" });
  } else if (lang === "typescript") {
    out.push({ text: `import { moovn } from "@moovn/runtime";`, nodeId: null, kind: "label" });
    out.push({ text: "", nodeId: null, kind: "blank" });
  }

  for (const ch of project.chapters) {
    out.push({ text: `${cmt} ==================== ${ch.title} ====================`, nodeId: null, kind: "comment" });
    const chNodes = project.nodes.filter((n) => n.chapterId === ch.id);

    for (const node of chNodes) {
      const fnName = node.id.replace(/[^a-zA-Z0-9_]/g, "_");
      if (lang === "lua") {
        out.push({ text: `function scene_${fnName}() -- ${node.title}`, nodeId: node.id, kind: "label" });
      } else if (lang === "teal") {
        out.push({ text: `local function scene_${fnName}(ctx: SceneContext) -- ${node.title}`, nodeId: node.id, kind: "label" });
      } else if (lang === "python") {
        out.push({ text: `def scene_${fnName}():  # ${node.title}`, nodeId: node.id, kind: "label" });
      } else {
        out.push({ text: `export function scene_${fnName}(): void { // ${node.title}`, nodeId: node.id, kind: "label" });
      }

      if (node.backgroundId) {
        const bg = backgroundById(node.backgroundId);
        out.push({
          text: `    moovn.bg("${node.backgroundId}") ${cmt} ${bg?.name ?? ""}`,
          nodeId: node.id,
          kind: "scene",
        });
      }
      if (node.bgmId) {
        const audio = audioById(node.bgmId);
        out.push({
          text: `    moovn.bgm("${node.bgmId}") ${cmt} ${audio?.name ?? ""}`,
          nodeId: node.id,
          kind: "scene",
        });
      }
      for (const sc of node.stageCharacters) {
        const charObj = characterById(project, sc.characterId);
        out.push({
          text: `    moovn.char("${sc.characterId}", { x = ${sc.x}, y = ${sc.y}, scale = ${sc.scale} }) ${cmt} ${charObj?.name ?? ""}`,
          nodeId: node.id,
          kind: "scene",
        });
      }

      for (const line of node.lines) {
        const chObj = characterById(project, line.characterId);
        if (!chObj) {
          out.push({ text: `    moovn.narrate("${line.text}")`, nodeId: node.id, kind: "narrate" });
        } else {
          out.push({ text: `    moovn.say("${chObj.name}", "${line.text}")`, nodeId: node.id, kind: "say" });
        }
      }

      if (node.type === "choice") {
        for (const c of node.choices) {
          const affNote = c.affectionCharacterId ? `, affection_delta = ${c.affectionDelta ?? 0}` : "";
          out.push({
            text: `    moovn.choice("${c.text}", { target = "${c.targetNodeId ?? ""}"${affNote} })`,
            nodeId: node.id,
            kind: "choice",
          });
        }
      } else if (node.type === "end") {
        out.push({
          text: `    moovn.ending("${node.endingKind ?? "normal"}", "${node.endingDescription ?? ""}")`,
          nodeId: node.id,
          kind: "ending",
        });
      } else if (node.nextNodeId) {
        out.push({ text: `    moovn.jump("${node.nextNodeId}")`, nodeId: node.id, kind: "jump" });
      }

      if (lang === "lua" || lang === "teal") {
        out.push({ text: `end`, nodeId: node.id, kind: "label" });
      } else if (lang === "typescript") {
        out.push({ text: `}`, nodeId: node.id, kind: "label" });
      }
      out.push({ text: "", nodeId: node.id, kind: "blank" });
    }
  }

  return out;
}

export function scriptToText(lines: ScriptLine[]): string {
  return lines.map((l) => l.text).join("\n");
}

export function generateProjectScript(project: Project, lang: ScriptLang = "lua"): string {
  return scriptToText(generateScript(project, lang));
}

export function visualBlocksToCode(blocks: VisualBlock[], lang: ScriptLang): string {
  const cmt = lang === "python" ? "#" : lang === "typescript" ? "//" : "--";
  const lines = [`${cmt} 可视化代码块生成 (${lang.toUpperCase()})`];
  for (const b of blocks) {
    if (b.action === "bg") {
      lines.push(lang === "typescript" ? `moovn.bg("${b.param1}");` : `moovn.bg("${b.param1}")`);
    } else if (b.action === "bgm") {
      lines.push(lang === "typescript" ? `moovn.bgm("${b.param1}", ${b.param2 || 80});` : `moovn.bgm("${b.param1}", ${b.param2 || 80})`);
    } else if (b.action === "char") {
      lines.push(lang === "typescript" ? `moovn.char("${b.param1}", ${b.param2 || 50});` : `moovn.char("${b.param1}", ${b.param2 || 50})`);
    } else if (b.action === "affection") {
      lines.push(lang === "typescript" ? `moovn.addAffection("${b.param1}", ${b.param2 || 10});` : `moovn.add_affection("${b.param1}", ${b.param2 || 10})`);
    } else {
      lines.push(lang === "typescript" ? `moovn.say("${b.param1}", "${b.param2}");` : `moovn.say("${b.param1}", "${b.param2}")`);
    }
  }
  return lines.join("\n");
}
