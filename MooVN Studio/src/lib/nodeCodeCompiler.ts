import type {
  NestedChildNode,
  SceneNode,
  VNProject,
  WorkflowNodeType,
} from '../types.ts';
import { getNodeMeta, isUnsupportedNode } from '../data/nodeRegistry.ts';

export interface TsCompilerDiagnostic {
  id: string;
  code: string; // e.g. "TS2322", "TS2304", "TS1005", "MOOVN201"
  severity: 'error' | 'warning' | 'info';
  nodeId: string;
  nodeTitle: string;
  line: number;
  message: string;
}

export interface TsCompileReport {
  ok: boolean;
  errorCount: number;
  warningCount: number;
  durationMs: number;
  elapsedMs: number;
  lineCount: number;
  diagnostics: TsCompilerDiagnostic[];
  compiledTypeScript: string;
  compiledJavaScript: string;
}

export function normalizeConditionForCtx(
  rawExpr: string,
  defaultCharId = 'protagonist'
): string {
  return rawExpr
    .replace(/\b(?<!ctx\.)affection\.([a-zA-Z0-9_]+)/g, 'ctx.affection.$1')
    .replace(/\b(?<!ctx\.)vars\.([a-zA-Z0-9_]+)/g, 'ctx.vars.$1')
    .replace(
      /\b(?<!ctx\.)affection\s*(>=|<=|===|==|!=|>|<)\s*(-?\d+(?:\.\d+)?)/g,
      `(ctx.affection[${JSON.stringify(defaultCharId)}] ?? 0) $1 $2`
    );
}

/**
 * 递归编译容器节点内部的嵌套子节点（支持多重嵌套：如 repeat_loop 内套 if_else_container，再套其他节点）
 */
function compileNestedChildNode(
  child: NestedChildNode,
  lang: 'javascript' | 'typescript',
  indent = '    '
): string {
  const isTs = lang === 'typescript';
  const lines: string[] = [];

  if (child.customCode && child.customCode.trim()) {
    lines.push(`${indent}// [${child.title}] 自定义脚本`);
    for (const l of child.customCode.split('\n')) {
      lines.push(`${indent}${l}`);
    }
    return lines.join('\n');
  }

  switch (child.type) {
    case 'repeat_loop': {
      const count = Number(child.params.repeatCount ?? 3);
      const idxDecl = isTs ? 'let i: number = 0' : 'let i = 0';
      lines.push(`${indent}for (${idxDecl}; i < ${count}; i++) {`);
      const sub = child.childrenNodes || [];
      if (sub.length === 0) {
        lines.push(`${indent}  await ctx.tickFrame();`);
      } else {
        for (const s of sub) {
          lines.push(compileNestedChildNode(s, lang, indent + '  '));
        }
      }
      lines.push(`${indent}}`);
      break;
    }
    case 'while_loop': {
      const expr = normalizeConditionForCtx(
        String(child.params.conditionExpr || 'ctx.vars.day_count < 5')
      );
      lines.push(`${indent}while (${expr}) {`);
      for (const s of child.childrenNodes || []) {
        lines.push(compileNestedChildNode(s, lang, indent + '  '));
      }
      lines.push(`${indent}}`);
      break;
    }
    case 'if_else_container': {
      const expr = normalizeConditionForCtx(
        String(child.params.conditionExpr || 'ctx.affection.character >= 60')
      );
      lines.push(`${indent}if (${expr}) {`);
      for (const s of child.childrenNodes || []) {
        lines.push(compileNestedChildNode(s, lang, indent + '  '));
      }
      if ((child.elseChildrenNodes || []).length > 0) {
        lines.push(`${indent}} else {`);
        for (const s of child.elseChildrenNodes || []) {
          lines.push(compileNestedChildNode(s, lang, indent + '  '));
        }
      }
      lines.push(`${indent}}`);
      break;
    }
    case 'parallel_container': {
      lines.push(`${indent}await Promise.all([`);
      for (const s of child.childrenNodes || []) {
        lines.push(`${indent}  (async () => {`);
        lines.push(compileNestedChildNode(s, lang, indent + '    '));
        lines.push(`${indent}  })(),`);
      }
      lines.push(`${indent}]);`);
      break;
    }
    case 'dialogue':
    case 'narration':
      lines.push(
        `${indent}await ctx.say(${JSON.stringify(
          String(child.params.speaker || '旁白')
        )}, ${JSON.stringify(String(child.params.text || '嵌套演出台词'))});`
      );
      break;
    case 'math_operation':
      lines.push(
        `${indent}ctx.vars[${JSON.stringify(
          String(child.params.targetVar || 'day_count')
        )}] ${String(child.params.mathOp || '+=')} ${Number(child.params.operandValue ?? 1)};`
      );
      break;
    case 'affection_change':
      lines.push(
        `${indent}ctx.addAffection(${JSON.stringify(
          String(child.params.charId || 'character')
        )}, ${Number(child.params.delta ?? 5)});`
      );
      break;
    case 'camera_shake':
      lines.push(
        `${indent}await ctx.cameraShake(${JSON.stringify(
          String(child.params.intensity || 'medium')
        )}, ${Number(child.params.durationMs ?? 500)});`
      );
      break;
    case 'screen_flash':
      lines.push(
        `${indent}await ctx.screenFlash(${JSON.stringify(
          String(child.params.color || '#ffffff')
        )}, ${Number(child.params.durationMs ?? 350)});`
      );
      break;
    case 'wait_timer':
      lines.push(`${indent}await ctx.wait(${Number(child.params.durationMs ?? 800)});`);
      break;
    case 'char_move':
      lines.push(
        `${indent}await ctx.tweenCharacter(${JSON.stringify(
          String(child.params.charId || 'character')
        )}, { x: ${Number(child.params.x ?? 50)}, y: ${Number(child.params.y ?? 55)} });`
      );
      break;
    case 'sfx_play':
      lines.push(
        `${indent}ctx.playSfx(${JSON.stringify(
          String(child.params.sfxId || 'sfx-bell-chime')
        )});`
      );
      break;
    case 'break_continue':
      lines.push(`${indent}${child.params.mode === 'continue' ? 'continue;' : 'break;'}`);
      break;
    default:
      lines.push(
        `${indent}await ctx.execStep(${JSON.stringify(child.type)}, ${JSON.stringify(
          child.params
        )});`
      );
      break;
  }

  return lines.join('\n');
}

/**
 * 为任意单个节点生成对应的 TypeScript 或 JavaScript 脚本代码
 * 每一个节点都代表一段真实的 TS/JS 函数实现。
 */
export function generateSingleNodeCode(
  node: SceneNode,
  lang: 'javascript' | 'typescript',
  project?: VNProject
): string {
  const isTs = lang === 'typescript';
  const meta = getNodeMeta(node.type);
  const fnName = `node_${node.id.replace(/[^a-zA-Z0-9_]/g, '_')}`;
  const sig = isTs
    ? `export async function ${fnName}(ctx: VNRuntimeContext): Promise<string | null>`
    : `export async function ${fnName}(ctx)`;

  const body: string[] = [];
  body.push(`// [${meta.categoryLabel}] ${node.title} (${node.type})`);
  body.push(`${sig} {`);

  // 如果开发者编写了自定义脚本，优先嵌入自定义脚本
  if (node.customScript && node.customScript.trim() && node.type === 'script') {
    for (const line of node.customScript.split('\n')) {
      body.push(`  ${line}`);
    }
    body.push(`  return ${JSON.stringify(node.nextNodeId)};`);
    body.push(`}`);
    return body.join('\n');
  }

  switch (node.type) {
    case 'dialogue':
    case 'narration':
    case 'inner_monologue':
    case 'cg_caption': {
      body.push(`  await ctx.setBackground(${JSON.stringify(node.backgroundId)}, ${JSON.stringify(node.transition)});`);
      for (const d of node.dialogues) {
        body.push(
          `  await ctx.say({ speaker: ${JSON.stringify(d.speakerName)}, text: ${JSON.stringify(
            d.text
          )}, mode: ${JSON.stringify(node.type)} });`
        );
      }
      break;
    }

    case 'screen_text':
    case 'chapter_title':
    case 'floating_subtitle':
    case 'banner_notice': {
      const cfg = node.screenTextConfig || {
        text: node.title,
        x: 50,
        y: 45,
        fontSize: 28,
        color: '#ffffff',
        align: 'center' as const,
        bgOverlay: 'none' as const,
        animation: 'fade' as const,
        durationMs: 2000,
      };
      const varDecl = isTs ? 'const overlay: ScreenTextOptions =' : 'const overlay =';
      body.push(
        `  ${varDecl} { text: ${JSON.stringify(cfg.text)}, x: ${cfg.x}, y: ${cfg.y}, fontSize: ${cfg.fontSize}, animation: ${JSON.stringify(cfg.animation)}, durationMs: ${cfg.durationMs} };`
      );
      body.push(`  await ctx.renderScreenText(overlay);`);
      break;
    }

    case 'choice':
    case 'timed_choice': {
      if (node.type === 'timed_choice') {
        const timeoutSec = node.timedChoiceSeconds ?? 10;
        body.push(
          `  ${isTs ? 'const picked: string | null =' : 'const picked ='} await ctx.promptTimedChoices(${JSON.stringify(
            node.choices.map((c) => ({ text: c.text, target: c.targetNodeId, delta: c.affectionDelta }))
          )}, ${timeoutSec}, ${JSON.stringify(node.defaultTimeoutTargetId || node.nextNodeId)});`
        );
        body.push(`  return picked;`);
        body.push(`}`);
        return body.join('\n');
      } else {
        body.push(
          `  ${isTs ? 'const targetId: string =' : 'const targetId ='} await ctx.promptChoices(${JSON.stringify(
            node.choices.map((c) => ({ text: c.text, target: c.targetNodeId, delta: c.affectionDelta }))
          )});`
        );
        body.push(`  return targetId;`);
        body.push(`}`);
        return body.join('\n');
      }
    }

    case 'condition': {
      const r = node.conditionRule || {
        variableType: 'affection',
        characterId: 'character',
        attributeKey: 'affection',
        operator: '>=',
        compareValue: 60,
        trueTargetNodeId: node.nextNodeId || '',
        falseTargetNodeId: node.nextNodeId || '',
      };
      const leftExpr =
        r.variableType === 'affection'
          ? `ctx.getAffection(${JSON.stringify(r.characterId || 'character')})`
          : `ctx.getVar(${JSON.stringify(r.attributeKey)})`;
      body.push(
        `  ${isTs ? 'const passed: boolean =' : 'const passed ='} ${leftExpr} ${r.operator} ${JSON.stringify(
          r.compareValue
        )};`
      );
      body.push(
        `  return passed ? ${JSON.stringify(r.trueTargetNodeId)} : ${JSON.stringify(
          r.falseTargetNodeId
        )};`
      );
      body.push(`}`);
      return body.join('\n');
    }

    case 'repeat_loop': {
      const count = node.loopConfig?.repeatCount ?? 3;
      body.push(
        `  for (${isTs ? 'let step: number = 0' : 'let step = 0'}; step < ${count}; step++) {`
      );
      for (const child of node.childrenNodes || []) {
        body.push(compileNestedChildNode(child, lang, '    '));
      }
      body.push(`  }`);
      break;
    }

    case 'while_loop': {
      const cond = normalizeConditionForCtx(
        node.loopConfig?.conditionExpr || 'ctx.getVar("loop_flag") === true'
      );
      body.push(`  ${isTs ? 'let guard: number = 0;' : 'let guard = 0;'}`);
      body.push(`  while ((${cond}) && guard++ < 1000) {`);
      for (const child of node.childrenNodes || []) {
        body.push(compileNestedChildNode(child, lang, '    '));
      }
      body.push(`  }`);
      break;
    }

    case 'for_each_loop': {
      const target = node.loopConfig?.collectionTarget || 'characters';
      const iterName = node.loopConfig?.iteratorVar || 'item';
      body.push(
        `  for (const ${iterName}${isTs ? ': any' : ''} of ctx.${target}) {`
      );
      for (const child of node.childrenNodes || []) {
        body.push(compileNestedChildNode(child, lang, '    '));
      }
      body.push(`  }`);
      break;
    }

    case 'if_else_container': {
      const cond = normalizeConditionForCtx(
        node.loopConfig?.conditionExpr || 'ctx.getAffection("character") >= 60'
      );
      body.push(`  if (${cond}) {`);
      for (const child of node.childrenNodes || []) {
        body.push(compileNestedChildNode(child, lang, '    '));
      }
      body.push(`  } else {`);
      for (const child of node.elseChildrenNodes || []) {
        body.push(compileNestedChildNode(child, lang, '    '));
      }
      body.push(`  }`);
      break;
    }

    case 'parallel_container': {
      body.push(`  await Promise.all([`);
      for (const child of node.childrenNodes || []) {
        body.push(`    (async () => {`);
        body.push(compileNestedChildNode(child, lang, '      '));
        body.push(`    })(),`);
      }
      body.push(`  ]);`);
      break;
    }

    case 'try_catch_container': {
      body.push(`  try {`);
      for (const child of node.childrenNodes || []) {
        body.push(compileNestedChildNode(child, lang, '    '));
      }
      body.push(`  } catch (err${isTs ? ': unknown' : ''}) {`);
      for (const child of node.elseChildrenNodes || []) {
        body.push(compileNestedChildNode(child, lang, '    '));
      }
      body.push(`  }`);
      break;
    }

    case 'math_operation': {
      const cfg = node.logicConfig || {
        targetVar: node.variableKey || 'day_count',
        mathOp: '+=',
        operandValue: 1,
      };
      if (cfg.mathOp === 'random') {
        body.push(
          `  ctx.setVar(${JSON.stringify(cfg.targetVar)}, Math.floor(Math.random() * ${Number(
            cfg.operandValue || 100
          )}));`
        );
      } else if (cfg.mathOp === 'clamp') {
        body.push(
          `  ctx.setVar(${JSON.stringify(cfg.targetVar)}, Math.min(${cfg.clampMax ?? 100}, Math.max(${
            cfg.clampMin ?? 0
          }, Number(ctx.getVar(${JSON.stringify(cfg.targetVar)})))));`
        );
      } else {
        body.push(
          `  ctx.vars[${JSON.stringify(cfg.targetVar)}] ${cfg.mathOp || '+='} ${Number(
            cfg.operandValue ?? 1
          )};`
        );
      }
      break;
    }

    case 'string_format': {
      const cfg = node.logicConfig || {
        targetVar: node.variableKey || 'status_text',
        operandValue: '',
        formatTemplate: '第 ${day_count} 日',
      };
      body.push(
        `  ${isTs ? 'const formatted: string =' : 'const formatted ='} ctx.formatTemplate(${JSON.stringify(
          cfg.formatTemplate || ''
        )});`
      );
      body.push(`  ctx.setVar(${JSON.stringify(cfg.targetVar)}, formatted);`);
      break;
    }

    case 'array_operation': {
      const cfg = node.logicConfig || {
        targetVar: 'inventory',
        arrayAction: 'push',
        operandValue: '新值',
      };
      body.push(
        `  ctx.mutateList(${JSON.stringify(cfg.targetVar)}, ${JSON.stringify(
          cfg.arrayAction || 'push'
        )}, ${JSON.stringify(cfg.operandValue)});`
      );
      break;
    }

    case 'char_enter':
    case 'char_move':
    case 'char_expression':
    case 'char_action':
    case 'char_highlight':
    case 'char_exit': {
      body.push(
        `  await ctx.updateStageCharacters(${JSON.stringify(
          node.characters.map((c) => ({
            id: c.characterId,
            sprite: c.spriteId,
            x: c.x,
            y: c.y,
            scale: c.scale,
            anim: c.enterAnimation,
          }))
        )});`
      );
      break;
    }

    case 'affection_change': {
      const targetChar = node.affectionTargetCharId || project?.characters[0]?.id || 'character';
      const delta = node.affectionDelta ?? 10;
      body.push(`  ctx.addAffection(${JSON.stringify(targetChar)}, ${delta});`);
      break;
    }

    case 'bg_switch':
    case 'fade':
    case 'camera_pan_zoom':
    case 'camera_shake':
    case 'screen_flash':
    case 'weather_particles':
    case 'color_filter':
    case 'frame_animation': {
      body.push(
        `  await ctx.applyVisualEffect({ type: ${JSON.stringify(node.type)}, bg: ${JSON.stringify(
          node.backgroundId
        )}, transition: ${JSON.stringify(node.transition)}, camera: ${JSON.stringify(
          node.cameraConfig || null
        )}, fade: ${JSON.stringify(node.fadeConfig || null)} });`
      );
      break;
    }

    case 'bgm_play':
    case 'bgm_stop':
    case 'sfx_play':
    case 'voice_play': {
      body.push(
        `  await ctx.audioControl({ action: ${JSON.stringify(node.type)}, bgmId: ${JSON.stringify(
          node.bgmId
        )}, sfxId: ${JSON.stringify(node.sfxId || '')} });`
      );
      break;
    }

    case 'wait_timer': {
      body.push(`  await ctx.wait(${node.waitDurationMs ?? 1000});`);
      break;
    }

    case 'set_variable': {
      body.push(
        `  ctx.setVar(${JSON.stringify(node.variableKey || 'clue_count')}, ${JSON.stringify(
          node.variableValue ?? 1
        )});`
      );
      break;
    }

    case 'function_call': {
      const fn = node.logicConfig?.functionName || 'onCustomTrigger';
      const args = node.logicConfig?.functionArgs || 'ctx';
      body.push(`  await ${fn}(${args});`);
      break;
    }

    default: {
      body.push(`  await ctx.executeNodeEffect(${JSON.stringify(node.id)}, ${JSON.stringify(node.type)});`);
      break;
    }
  }

  body.push(`  return ${JSON.stringify(node.nextNodeId)};`);
  body.push(`}`);
  return body.join('\n');
}

/**
 * 生成完整工程的 TypeScript 或 JavaScript 源码
 */
export function generateFullProjectCode(
  project: VNProject,
  lang: 'javascript' | 'typescript'
): string {
  const isTs = lang === 'typescript';
  const header: string[] = [];

  header.push(
    `/**\n * MooVN Compiled ${isTs ? 'TypeScript (Strict Release Mode)' : 'JavaScript (Fast Dev Mode)'}\n * Project: ${project.title} (v${project.version})\n * Nodes: ${project.nodes.length} | Chapters: ${project.chapters.length}\n */`
  );

  if (isTs) {
    header.push(`
export interface ScreenTextOptions {
  text: string;
  x: number;
  y: number;
  fontSize: number;
  animation: string;
  durationMs: number;
}

export interface VNRuntimeContext {
  vars: Record<string, number | string | boolean>;
  affection: Record<string, number>;
  characters: Array<{ id: string; name: string }>;
  say(payload: string | Record<string, unknown>, text?: string): Promise<void>;
  setBackground(bgId: string, transition?: string): Promise<void>;
  renderScreenText(opts: ScreenTextOptions): Promise<void>;
  promptChoices(choices: Array<{ text: string; target: string; delta?: number }>): Promise<string>;
  promptTimedChoices(choices: Array<{ text: string; target: string; delta?: number }>, seconds: number, fallback: string | null): Promise<string | null>;
  getAffection(charId: string): number;
  addAffection(charId: string, delta: number): void;
  getVar(key: string): number | string | boolean;
  setVar(key: string, val: number | string | boolean): void;
  formatTemplate(tpl: string): string;
  mutateList(key: string, action: string, item: unknown): void;
  updateStageCharacters(chars: Array<Record<string, unknown>>): Promise<void>;
  applyVisualEffect(effect: Record<string, unknown>): Promise<void>;
  audioControl(cmd: Record<string, unknown>): Promise<void>;
  cameraShake(intensity: string, durationMs: number): Promise<void>;
  screenFlash(color: string, durationMs: number): Promise<void>;
  tweenCharacter(charId: string, target: { x: number; y: number }): Promise<void>;
  playSfx(sfxId: string): void;
  wait(ms: number): Promise<void>;
  tickFrame(): Promise<void>;
  execStep(type: string, params: Record<string, unknown>): Promise<void>;
  executeNodeEffect(nodeId: string, type: string): Promise<void>;
}
`);
  }

  for (const node of project.nodes) {
    header.push(generateSingleNodeCode(node, lang, project));
    header.push('');
  }

  return header.join('\n');
}

/**
 * TypeScript 静态类型与节点图编译器检查
 * 支持在平时用 JavaScript 快速开发，测试或导出前一键用 TypeScript 编译检查是否有语法、类型或节点引用错误！
 */
export function compileAndCheckProjectTypeScript(project: VNProject): TsCompileReport {
  const startTime = performance.now();
  const compiledTypeScript = generateFullProjectCode(project, 'typescript');
  const compiledJavaScript = generateFullProjectCode(project, 'javascript');
  const tsLines = compiledTypeScript.split('\n');

  const findNodeStartLine = (nodeId: string): number => {
    const fnName = `export async function node_${nodeId.replace(/[^a-zA-Z0-9_]/g, '_')}`;
    const idx = tsLines.findIndex((l) => l.startsWith(fnName));
    return idx >= 0 ? idx + 1 : 1;
  };

  const diagnostics: TsCompilerDiagnostic[] = [];
  const nodeIds = new Set(project.nodes.map((n) => n.id));
  const charIds = new Set(project.characters.map((c) => c.id));
  const varMap = new Map(project.variables.map((v) => [v.key, v]));

  project.nodes.forEach((node) => {
    const lineBase = findNodeStartLine(node.id);

    // 1. 检查 nextNodeId 是否指向不存在的节点
    if (node.nextNodeId && !nodeIds.has(node.nextNodeId)) {
      diagnostics.push({
        id: `diag-next-${node.id}`,
        code: 'MVN101',
        severity: 'error',
        nodeId: node.id,
        nodeTitle: node.title,
        line: lineBase,
        message: `找不到下一跳节点 ID "${node.nextNodeId}"（目标节点可能已被删除）。`,
      });
    }

    // 2. 检查分支选项目标
    node.choices.forEach((ch, cIdx) => {
      if (!ch.targetNodeId) {
        diagnostics.push({
          id: `diag-choice-empty-${node.id}-${cIdx}`,
          code: 'MVN102',
          severity: 'warning',
          nodeId: node.id,
          nodeTitle: node.title,
          line: lineBase + 1,
          message: `选项 "${ch.text}" 尚未绑定跳转目标节点。`,
        });
      } else if (!nodeIds.has(ch.targetNodeId)) {
        diagnostics.push({
          id: `diag-choice-${node.id}-${cIdx}`,
          code: 'MVN103',
          severity: 'error',
          nodeId: node.id,
          nodeTitle: node.title,
          line: lineBase + 1,
          message: `选项 "${ch.text}" 的跳转目标 "${ch.targetNodeId}" 不存在。`,
        });
      }
    });

    // 3. 检查变量赋值与数学运算的类型匹配
    if (node.type === 'set_variable' && node.variableKey) {
      const declaredVar = varMap.get(node.variableKey);
      if (declaredVar) {
        const val = node.variableValue;
        if (
          declaredVar.type === 'number' &&
          val !== undefined &&
          Number.isNaN(Number(val))
        ) {
          diagnostics.push({
            id: `diag-type-${node.id}`,
            code: 'MVN104',
            severity: 'error',
            nodeId: node.id,
            nodeTitle: node.title,
            line: lineBase + 1,
            message: `类型不匹配：无法将字符串 "${val}" 赋值给 number 类型的全局变量 "${node.variableKey}"。`,
          });
        }
      } else {
        diagnostics.push({
          id: `diag-var-undeclared-${node.id}`,
          code: 'MVN201',
          severity: 'warning',
          nodeId: node.id,
          nodeTitle: node.title,
          line: lineBase + 1,
          message: `变量 "${node.variableKey}" 未在全局变量表中显式声明类型。`,
        });
      }
    }

    // 4. 检查容器节点是否为空
    const meta = getNodeMeta(node.type);
    if (isUnsupportedNode(node.type)) {
      diagnostics.push({
        id: `diag-unsupported-${node.id}`, code: 'MVN205', severity: 'warning',
        nodeId: node.id, nodeTitle: node.title, line: lineBase + 1,
        message: `节点 [${meta.title}] 尚未实现，预览和 HTML 不会执行此功能。`,
      });
    }
    if (meta.isContainer && (!node.childrenNodes || node.childrenNodes.length === 0)) {
      diagnostics.push({
        id: `diag-empty-container-${node.id}`,
        code: 'MVN204',
        severity: 'warning',
        nodeId: node.id,
        nodeTitle: node.title,
        line: lineBase + 1,
        message: `容器节点 [${meta.title}] 内部尚未添加任何嵌套子节点。`,
      });
    }

    // 5. 检查角色引用
    if (
      node.type === 'affection_change' &&
      node.affectionTargetCharId &&
      !charIds.has(node.affectionTargetCharId)
    ) {
      diagnostics.push({
        id: `diag-char-${node.id}`,
        code: 'MVN105',
        severity: 'error',
        nodeId: node.id,
        nodeTitle: node.title,
        line: lineBase + 1,
        message: `好感度变更节点引用了不存在的角色 ID "${node.affectionTargetCharId}"。`,
      });
    }
  });

  const durationMs = Math.max(0, Math.round(performance.now() - startTime));
  const errorCount = diagnostics.filter((d) => d.severity === 'error').length;
  const warningCount = diagnostics.filter((d) => d.severity === 'warning').length;

  return {
    ok: errorCount === 0,
    errorCount,
    warningCount,
    durationMs,
    elapsedMs: durationMs,
    lineCount: tsLines.length,
    diagnostics,
    compiledTypeScript,
    compiledJavaScript,
  };
}
