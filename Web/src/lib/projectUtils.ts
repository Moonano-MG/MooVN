import { VNProject } from '../types';
import { getNodeMeta } from '../data/nodeRegistry';

export function generateChapterYaml(project: VNProject, chapterId: string): string {
  const chapter =
    project.chapters.find((c) => c.id === chapterId) || project.chapters[0];
  const chapterNodes = project.nodes.filter((n) => n.chapterId === chapter.id);

  const lines: string[] = [
    `# ============================================================================`,
    `# ${project.title} — ${chapter.title}`,
    `# File: chapters/${chapter.yamlFileName}`,
    `# 一个章节 YAML 文件包含该章节下的全部场景节点`,
    `# ============================================================================`,
    `chapter:`,
    `  id: "${chapter.id}"`,
    `  index: ${chapter.index}`,
    `  title: "${chapter.title}"`,
    `  subtitle: "${chapter.subtitle}"`,
    `  scenes_count: ${chapterNodes.length}`,
    ``,
    `scenes:`,
  ];

  chapterNodes.forEach((node) => {
    const meta = getNodeMeta(node.type);
    lines.push(`  - id: "${node.id}"`);
    lines.push(`    category: "${meta.categoryLabel}"`);
    lines.push(`    type: "${node.type}"`);
    lines.push(`    title: "${node.title}"`);
    lines.push(`    background: "${node.backgroundId}"`);
    lines.push(`    bgm: "${node.bgmId}"`);
    if (node.screenTextConfig) {
      lines.push(`    screen_text:`);
      lines.push(`      text: ${JSON.stringify(node.screenTextConfig.text)}`);
      lines.push(`      x: ${node.screenTextConfig.x}`);
      lines.push(`      y: ${node.screenTextConfig.y}`);
      lines.push(`      fontSize: ${node.screenTextConfig.fontSize}`);
    }
    if (node.characters.length > 0) {
      lines.push(`    characters:`);
      node.characters.forEach((ch) => {
        lines.push(
          `      - character_id: "${ch.characterId}" # ${ch.name} (${ch.spriteId}, x=${ch.x}%, y=${ch.y}%)`
        );
      });
    }
    if (node.dialogues.length > 0) {
      lines.push(`    dialogues:`);
      node.dialogues.forEach((d) => {
        lines.push(`      - speaker: "${d.speakerName}"`);
        if (d.expressionSpriteId) {
          lines.push(`        expression: "${d.expressionSpriteId}"`);
        }
        lines.push(`        text: ${JSON.stringify(d.text)}`);
      });
    }
    if (node.choices.length > 0) {
      lines.push(`    choices:`);
      node.choices.forEach((c) => {
        lines.push(`      - text: ${JSON.stringify(c.text)}`);
        lines.push(`        target: "${c.targetNodeId}"`);
        if (c.affectionDelta) {
          lines.push(`        affection_delta: ${c.affectionDelta}`);
        }
      });
    }
    if (node.nextNodeId) {
      lines.push(`    next: "${node.nextNodeId}"`);
    }
    lines.push(``);
  });

  return lines.join('\n');
}

export function generateTypeScriptEngineCode(project: VNProject): string {
  const lines: string[] = [
    `/**`,
    ` * ${project.title} — MooVN TypeScript Runtime (@moovn/sdk)`,
    ` * 底层由 TypeScript/JavaScript 驱动，支持通过 ScriptBridge 调度 Lua / Teal / Python`,
    ` */`,
    `import { createVNRuntime, ScriptBridge } from '@moovn/sdk';`,
    ``,
    `export const engine = createVNRuntime({`,
    `  projectId: '${project.id}',`,
    `  title: '${project.title}',`,
    `  resolution: { width: ${project.resolution.width}, height: ${project.resolution.height} },`,
    `  startNodeId: '${project.startNodeId}',`,
    `});`,
    ``,
    `// 注册跨语言桥接器 (Lua / Teal / Python -> TypeScript Host)`,
    `export const bridge = new ScriptBridge(engine);`,
    ``,
  ];

  project.nodes.forEach((node) => {
    const meta = getNodeMeta(node.type);
    lines.push(`// [${meta.categoryLabel}] ${node.title} (${node.id})`);
    lines.push(`engine.registerNode('${node.id}', async (ctx) => {`);
    lines.push(`  await ctx.scene.setBackground('${node.backgroundId}', '${node.transition}');`);
    if (node.screenTextConfig) {
      lines.push(
        `  await ctx.ui.showScreenText(${JSON.stringify(node.screenTextConfig.text)}, { x: ${
          node.screenTextConfig.x
        }, y: ${node.screenTextConfig.y}, fontSize: ${node.screenTextConfig.fontSize} });`
      );
    }
    node.dialogues.forEach((d) => {
      lines.push(
        `  await ctx.dialogue.say('${d.speakerName}', ${JSON.stringify(d.text)}, '${
          d.expressionSpriteId || ''
        }');`
      );
    });
    if (node.nextNodeId) {
      lines.push(`  return ctx.jump('${node.nextNodeId}');`);
    }
    lines.push(`});`);
    lines.push(``);
  });

  return lines.join('\n');
}

export function exportProjectJson(project: VNProject) {
  const blob = new Blob([JSON.stringify(project, null, 2)], {
    type: 'application/json;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${project.id}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportChapterYaml(project: VNProject, chapterId: string) {
  const ch = project.chapters.find((c) => c.id === chapterId) || project.chapters[0];
  const yaml = generateChapterYaml(project, ch.id);
  const blob = new Blob([yaml], { type: 'text/yaml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = ch.yamlFileName;
  a.click();
  URL.revokeObjectURL(url);
}

export function generateLuaScript(project: VNProject): string {
  const lines: string[] = [
    `-- ============================================================================`,
    `-- ${project.title} — Lua 5.4 脚本 (由 MooVN TypeScript/JavaScript Bridge 驱动)`,
    `-- ============================================================================`,
    `local moovn = require("moovn.bridge")`,
    `local M = {}`,
    ``,
  ];
  project.nodes.forEach((node) => {
    const fnName = node.id.replace(/[^a-zA-Z0-9_]/g, '_');
    lines.push(`--- [${node.type}] ${node.title}`);
    lines.push(`function M.${fnName}(ctx)`);
    lines.push(`  moovn.set_background("${node.backgroundId}", "${node.transition}")`);
    node.dialogues.forEach((d) => {
      lines.push(
        `  moovn.say(${JSON.stringify(d.speakerName)}, ${JSON.stringify(d.text)}, "${
          d.expressionSpriteId || ''
        }")`
      );
    });
    if (node.nextNodeId) {
      lines.push(`  return moovn.jump("${node.nextNodeId}")`);
    }
    lines.push(`end`);
    lines.push(``);
  });
  lines.push(`return M`);
  return lines.join('\n');
}

export function generateTealScript(project: VNProject): string {
  const lines: string[] = [
    `-- ============================================================================`,
    `-- ${project.title} — Teal 类型化 Lua 脚本 (由 TypeScript/JavaScript Bridge 驱动)`,
    `-- ============================================================================`,
    `local record Context`,
    `  vars: {string: any}`,
    `  affection: {string: integer}`,
    `end`,
    `local M = {}`,
    ``,
  ];
  project.nodes.forEach((node) => {
    const fnName = node.id.replace(/[^a-zA-Z0-9_]/g, '_');
    lines.push(`function M.${fnName}(ctx: Context): string`);
    node.dialogues.forEach((d) => {
      lines.push(
        `  -- ${d.speakerName}: ${d.text.replace(/\n/g, ' ')}`
      );
    });
    lines.push(`  return "${node.nextNodeId || ''}"`);
    lines.push(`end`);
    lines.push(``);
  });
  lines.push(`return M`);
  return lines.join('\n');
}

export function generatePythonScript(project: VNProject): string {
  const lines: string[] = [
    `# ============================================================================`,
    `# ${project.title} — Python 3.12 脚本 (由 MooVN TypeScript/JavaScript Bridge 驱动)`,
    `# ============================================================================`,
    `from moovn_bridge import VNContext, register_node`,
    ``,
  ];
  project.nodes.forEach((node) => {
    const fnName = node.id.replace(/[^a-zA-Z0-9_]/g, '_');
    lines.push(`@register_node("${node.id}")`);
    lines.push(`async def ${fnName}(ctx: VNContext):`);
    lines.push(`    await ctx.set_background("${node.backgroundId}", "${node.transition}")`);
    node.dialogues.forEach((d) => {
      lines.push(
        `    await ctx.say(${JSON.stringify(d.speakerName)}, ${JSON.stringify(d.text)})`
      );
    });
    if (node.nextNodeId) {
      lines.push(`    return await ctx.jump("${node.nextNodeId}")`);
    } else {
      lines.push(`    return None`);
    }
    lines.push(``);
  });
  return lines.join('\n');
}

