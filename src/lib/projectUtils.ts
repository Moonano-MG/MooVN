import YAML from "yaml";
import type {
  Character,
  Project,
  ScratchBlock,
  ScriptLang,
  StoryNode,
  ValidationIssue,
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
    if (n.screenTexts) {
      for (const st of n.screenTexts) total += st.text.length;
    }
  }
  return total;
}

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
    issues.push({ id: "no-start", nodeId: null, level: "error", message: "尚未设置故事起点场景" });
  }

  for (const node of project.nodes) {
    if (node.type !== "choice" && node.type !== "end" && !node.nextNodeId) {
      issues.push({
        id: `${node.id}-nonext`,
        nodeId: node.id,
        level: "error",
        message: `「${node.title}」未连接下一场景`,
      });
    }
    if (node.type === "choice") {
      node.choices.forEach((c, i) => {
        if (!c.targetNodeId) {
          issues.push({
            id: `${node.id}-c${i}`,
            nodeId: node.id,
            level: "error",
            message: `「${node.title}」的选项 ${i + 1} 未连接目标场景`,
          });
        }
      });
    }
    if (!reachable.has(node.id) && node.id !== project.startNodeId) {
      issues.push({
        id: `${node.id}-unreached`,
        nodeId: node.id,
        level: "warning",
        message: `「${node.title}」从起点不可达`,
      });
    }
  }
  return issues;
}

/* ------------------------------------------------------------------ */
/* 章节级 YAML 序列化（一个章节一个 YAML，包含该章节全部场景）             */
/* ------------------------------------------------------------------ */

function serializeSceneForYaml(project: Project, node: StoryNode) {
  return {
    id: node.id,
    title: node.title,
    type: node.type,
    position: { x: node.x, y: node.y },
    background: {
      id: node.backgroundId || null,
      media_kind: node.backgroundMediaKind || "static",
      fps: node.backgroundFps || 6,
    },
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
        media_kind: sc.mediaKind || "static",
        tween: sc.tween || "none",
      };
    }),
    fade: node.fadeConfig
      ? {
          target: node.fadeConfig.target,
          character_id: node.fadeConfig.characterId || null,
          direction: node.fadeConfig.direction,
          duration_ms: node.fadeConfig.durationMs,
          target_opacity: node.fadeConfig.targetOpacity,
        }
      : null,
    screen_texts: (node.screenTexts ?? []).map((st) => ({
      id: st.id,
      text: st.text,
      x: st.x,
      y: st.y,
      font_size: st.fontSize,
      color: st.color,
      align: st.align || "center",
    })),
    blocks: (node.blocks ?? []).map((b) => ({
      id: b.id,
      kind: b.kind,
      params: b.params,
    })),
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
  };
}

/** 生成指定章节的完整 YAML（包含该章节下全部场景） */
export function chapterToYaml(project: Project, chapterId: string): string {
  const chapter = project.chapters.find((c) => c.id === chapterId) ?? project.chapters[0];
  if (!chapter) return "";
  const scenes = project.nodes
    .filter((n) => n.chapterId === chapter.id)
    .map((n) => serializeSceneForYaml(project, n));

  return YAML.stringify(
    {
      chapter: {
        id: chapter.id,
        title: chapter.title,
        order: chapter.order,
        scene_count: scenes.length,
        scenes,
      },
    },
    { indent: 2 },
  );
}

/** 将章节 YAML 应用回工程中对应章节的所有场景 */
export function applyChapterYamlToProject(
  project: Project,
  chapterId: string,
  yamlStr: string,
): Project | null {
  try {
    const parsed = YAML.parse(yamlStr);
    const chData = parsed?.chapter ?? parsed;
    if (!chData || !Array.isArray(chData.scenes)) return null;

    const nextProject: Project = JSON.parse(JSON.stringify(project));
    const chap = nextProject.chapters.find((c) => c.id === chapterId);
    if (chap && typeof chData.title === "string") {
      chap.title = chData.title;
    }

    const updatedChapterScenes: StoryNode[] = chData.scenes.map((s: any, idx: number) => {
      const existing = nextProject.nodes.find((n) => n.id === s.id);
      return {
        id: String(s.id || existing?.id || uid("s")),
        chapterId,
        type: s.type || existing?.type || "dialogue",
        title: String(s.title || existing?.title || `场景 ${idx + 1}`),
        x: Number(s.position?.x ?? existing?.x ?? 100 + idx * 280),
        y: Number(s.position?.y ?? existing?.y ?? 180),
        backgroundId:
          typeof s.background === "object"
            ? (s.background?.id ?? null)
            : (s.background ?? existing?.backgroundId ?? "bg-classroom"),
        backgroundMediaKind: s.background?.media_kind ?? existing?.backgroundMediaKind ?? "static",
        backgroundFps: Number(s.background?.fps ?? existing?.backgroundFps ?? 6),
        bgmId: s.audio?.bgm !== undefined ? s.audio.bgm : existing?.bgmId,
        sfxId: s.audio?.sfx !== undefined ? s.audio.sfx : existing?.sfxId,
        stageCharacters: Array.isArray(s.stage_characters)
          ? s.stage_characters.map((sc: any) => ({
              characterId: String(sc.character_id ?? "c-yuki"),
              x: Number(sc.position?.x ?? sc.x ?? 50),
              y: Number(sc.position?.y ?? sc.y ?? 54),
              scale: Number(sc.scale ?? 1),
              opacity: Number(sc.opacity ?? 1),
              flipX: Boolean(sc.flip_x),
              mediaKind: sc.media_kind ?? "static",
              tween: sc.tween ?? "none",
            }))
          : (existing?.stageCharacters ?? []),
        fadeConfig: s.fade
          ? {
              target: s.fade.target ?? "character",
              characterId: s.fade.character_id ?? null,
              direction: s.fade.direction ?? "out",
              durationMs: Number(s.fade.duration_ms ?? 600),
              targetOpacity: Number(s.fade.target_opacity ?? 0),
            }
          : (existing?.fadeConfig ?? null),
        screenTexts: Array.isArray(s.screen_texts)
          ? s.screen_texts.map((st: any) => ({
              id: String(st.id || uid("st")),
              text: String(st.text ?? ""),
              x: Number(st.x ?? 50),
              y: Number(st.y ?? 25),
              fontSize: Number(st.font_size ?? 26),
              color: String(st.color ?? "#ffffff"),
              align: st.align ?? "center",
            }))
          : (existing?.screenTexts ?? []),
        blocks: Array.isArray(s.blocks)
          ? s.blocks.map((b: any) => ({
              id: String(b.id || uid("b")),
              kind: b.kind || "say",
              params: b.params || {},
            }))
          : (existing?.blocks ?? []),
        lines: Array.isArray(s.dialogue)
          ? s.dialogue.map((d: any, i: number) => ({
              id: existing?.lines[i]?.id ?? uid("line"),
              characterId: d.speaker_id ?? null,
              text: String(d.text ?? ""),
            }))
          : (existing?.lines ?? []),
        choices: Array.isArray(s.choices)
          ? s.choices.map((c: any, i: number) => ({
              id: existing?.choices[i]?.id ?? uid("choice"),
              text: String(c.text ?? ""),
              targetNodeId: c.target_scene ?? null,
              affectionCharacterId: c.affection_change?.character_id ?? null,
              affectionDelta: Number(c.affection_change?.delta ?? 0),
            }))
          : (existing?.choices ?? []),
        nextNodeId: s.next_scene !== undefined ? s.next_scene : (existing?.nextNodeId ?? null),
        endingKind: s.ending?.kind ?? existing?.endingKind,
        endingDescription: s.ending?.description ?? existing?.endingDescription,
        scriptLang: existing?.scriptLang ?? "typescript",
        scriptCode: existing?.scriptCode,
      };
    });

    const otherNodes = nextProject.nodes.filter((n) => n.chapterId !== chapterId);
    nextProject.nodes = [...otherNodes, ...updatedChapterScenes];
    return nextProject;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Scratch 积木块 -> TypeScript/JavaScript 编译与跨语言桥接代码生成       */
/* ------------------------------------------------------------------ */

export function scratchBlockToTsLine(block: ScratchBlock): string {
  const p = block.params || {};
  switch (block.kind) {
    case "say":
      return `await moovn.say(${JSON.stringify(p.speaker || "旁白")}, ${JSON.stringify(p.text || "")});`;
    case "bg":
      return `await moovn.bg(${JSON.stringify(p.backgroundId || "bg-classroom")}, { mediaKind: ${JSON.stringify(p.mediaKind || "static")}, fps: ${Number(p.fps || 6)} });`;
    case "char":
      return `await moovn.char(${JSON.stringify(p.characterId || "c-yuki")}, { x: ${Number(p.x ?? 50)}, y: ${Number(p.y ?? 54)}, scale: ${Number(p.scale ?? 1)}, tween: ${JSON.stringify(p.tween || "breathe")} });`;
    case "fade":
      return `await moovn.fade({ target: ${JSON.stringify(p.target || "character")}, characterId: ${JSON.stringify(p.characterId || null)}, direction: ${JSON.stringify(p.direction || "out")}, durationMs: ${Number(p.durationMs ?? 600)}, targetOpacity: ${Number(p.targetOpacity ?? 0)} });`;
    case "screen_text":
      return `await moovn.screenText({ text: ${JSON.stringify(p.text || "屏幕文字")}, x: ${Number(p.x ?? 50)}, y: ${Number(p.y ?? 25)}, fontSize: ${Number(p.fontSize ?? 28)}, color: ${JSON.stringify(p.color || "#ffffff")} });`;
    case "animate":
      return `await moovn.animate({ targetId: ${JSON.stringify(p.targetId || "c-yuki")}, kind: ${JSON.stringify(p.kind || "frame_sequence")}, tween: ${JSON.stringify(p.tween || "breathe")}, fps: ${Number(p.fps ?? 6)} });`;
    case "affection":
      return `await moovn.addAffection(${JSON.stringify(p.characterId || "c-yuki")}, ${Number(p.delta ?? 10)});`;
    case "ts_code":
      return String(p.code || "// 自定义 TypeScript 逻辑");
    case "bridge_call": {
      const lang = p.bridgeLang || "lua";
      const fn =
        lang === "python" ? "runPython" : lang === "teal" ? "runTeal" : "runLua";
      return `await moovn.bridge.${fn}(${JSON.stringify(p.code || "return true")});`;
    }
    default:
      return `// 未知积木块`;
  }
}

export function compileNodeToTypeScript(project: Project, node: StoryNode): string {
  const fnName = node.id.replace(/[^a-zA-Z0-9_]/g, "_");
  const lines: string[] = [];
  lines.push(`export async function scene_${fnName}() { // ${node.title}`);

  if (node.backgroundId) {
    const bg = backgroundById(node.backgroundId);
    lines.push(
      `  await moovn.bg("${node.backgroundId}", { mediaKind: "${node.backgroundMediaKind || bg?.mediaKind || "static"}", fps: ${node.backgroundFps || bg?.fps || 6} });`,
    );
  }
  if (node.bgmId) {
    const audio = audioById(node.bgmId);
    lines.push(`  await moovn.bgm("${node.bgmId}"); // ${audio?.name ?? ""}`);
  }
  if (node.fadeConfig) {
    lines.push(
      `  await moovn.fade({ target: "${node.fadeConfig.target}", characterId: ${JSON.stringify(node.fadeConfig.characterId ?? null)}, direction: "${node.fadeConfig.direction}", durationMs: ${node.fadeConfig.durationMs}, targetOpacity: ${node.fadeConfig.targetOpacity} });`,
    );
  }
  for (const sc of node.stageCharacters) {
    lines.push(
      `  await moovn.char("${sc.characterId}", { x: ${sc.x}, y: ${sc.y}, scale: ${sc.scale}, opacity: ${sc.opacity}, tween: "${sc.tween || "none"}" });`,
    );
  }
  for (const st of node.screenTexts ?? []) {
    lines.push(
      `  await moovn.screenText({ text: ${JSON.stringify(st.text)}, x: ${st.x}, y: ${st.y}, fontSize: ${st.fontSize}, color: "${st.color}" });`,
    );
  }
  for (const b of node.blocks ?? []) {
    lines.push(`  ${scratchBlockToTsLine(b)}`);
  }
  for (const l of node.lines) {
    const ch = characterById(project, l.characterId);
    lines.push(`  await moovn.say(${JSON.stringify(ch ? ch.name : "旁白")}, ${JSON.stringify(l.text)});`);
  }
  if (node.type === "choice") {
    for (const c of node.choices) {
      lines.push(
        `  moovn.choice(${JSON.stringify(c.text)}, { target: ${JSON.stringify(c.targetNodeId)}, affectionDelta: ${c.affectionDelta ?? 0} });`,
      );
    }
  } else if (node.type === "end") {
    lines.push(
      `  await moovn.ending("${node.endingKind ?? "normal"}", ${JSON.stringify(node.endingDescription ?? "")});`,
    );
  } else if (node.nextNodeId) {
    lines.push(`  await moovn.jump("${node.nextNodeId}");`);
  }

  lines.push(`}`);
  return lines.join("\n");
}

/**
 * 生成工程脚本代码：
 * - TypeScript / JavaScript 为原生主语言，直接调用 `@moovn/sdk`
 * - Lua / Teal / Python 通过 TypeScript Bridge (`moovn.bridge`) 作为桥梁接入
 */
export function generateProjectScript(project: Project, lang: ScriptLang = "typescript"): string {
  if (lang === "typescript" || lang === "javascript") {
    const isTs = lang === "typescript";
    const out: string[] = [
      `/**`,
      ` * 《${project.name}》 — MooVN ${isTs ? "TypeScript" : "JavaScript"} 核心脚本`,
      ` * 所有可视化节点与 Scratch 积木块均直接编译为 @moovn/sdk 原生 API 调用`,
      ` */`,
      isTs
        ? `import { moovn, type SceneContext } from "@moovn/sdk";`
        : `import { moovn } from "@moovn/sdk";`,
      ``,
    ];

    for (const ch of project.chapters) {
      out.push(`// ==================== ${ch.title} ====================`);
      const scenes = project.nodes.filter((n) => n.chapterId === ch.id);
      for (const s of scenes) {
        out.push(compileNodeToTypeScript(project, s));
        out.push(``);
      }
    }
    return out.join("\n");
  }

  // 其他语言（Lua / Teal / Python）：以 TypeScript/JavaScript 作为桥梁 (Bridge)
  const bridgeFn =
    lang === "python" ? "runPython" : lang === "teal" ? "runTeal" : "runLua";

  const foreignLines: string[] = [];
  if (lang === "python") {
    foreignLines.push(`# Python 扩展脚本（由 TypeScript moovn.bridge.runPython 桥接执行）`);
    for (const s of project.nodes) {
      foreignLines.push(`def on_${s.id.replace(/[^a-zA-Z0-9_]/g, "_")}(ctx):`);
      foreignLines.push(`    ctx.log("执行场景: ${s.title}")`);
      if (s.fadeConfig) {
        foreignLines.push(`    ctx.fade("${s.fadeConfig.target}", "${s.fadeConfig.direction}", ${s.fadeConfig.durationMs})`);
      }
      for (const l of s.lines) {
        foreignLines.push(`    ctx.say("${characterById(project, l.characterId)?.name ?? "旁白"}", "${l.text}")`);
      }
    }
  } else if (lang === "teal") {
    foreignLines.push(`-- Teal 强类型脚本（由 TypeScript moovn.bridge.runTeal 桥接执行）`);
    foreignLines.push(`local record BridgeCtx`);
    foreignLines.push(`  scene_id: string`);
    foreignLines.push(`  say: function(string, string)`);
    foreignLines.push(`  fade: function(string, string, integer)`);
    foreignLines.push(`end`);
    for (const s of project.nodes) {
      foreignLines.push(`local function on_${s.id.replace(/[^a-zA-Z0-9_]/g, "_")}(ctx: BridgeCtx)`);
      for (const l of s.lines) {
        foreignLines.push(`  ctx.say("${characterById(project, l.characterId)?.name ?? "旁白"}", "${l.text}")`);
      }
      foreignLines.push(`end`);
    }
  } else {
    foreignLines.push(`-- Lua 扩展脚本（由 TypeScript moovn.bridge.runLua 桥接执行）`);
    for (const s of project.nodes) {
      foreignLines.push(`function on_${s.id.replace(/[^a-zA-Z0-9_]/g, "_")}(ctx)`);
      for (const l of s.lines) {
        foreignLines.push(`  ctx.say("${characterById(project, l.characterId)?.name ?? "旁白"}", "${l.text}")`);
      }
      foreignLines.push(`end`);
    }
  }

  return [
    `/**`,
    ` * 跨语言桥接器 (scripts/bridge.ts)`,
    ` * MooVN 以 TypeScript/JavaScript 为核心运行时，通过 moovn.bridge 桥接 ${lang.toUpperCase()}`,
    ` */`,
    `import { moovn } from "@moovn/sdk";`,
    ``,
    `export async function executeBridged_${lang}Module() {`,
    `  return await moovn.bridge.${bridgeFn}(\`\\`,
    ...foreignLines.map((l) => `  ${l.replace(/`/g, "\\`")}`),
    `  \`);`,
    `}`,
  ].join("\n");
}
