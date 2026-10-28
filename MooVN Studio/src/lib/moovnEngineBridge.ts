/**
 * MooVN Script API Formatter & IR Bridge (`moovnEngineBridge.ts`)
 *
 * Parses and formats `moovn.*` API calls into syntactically valid target-language calls:
 * - JavaScript / TypeScript: `moovn.save.create("Slot_01");`
 * - C#:                      `Moovn.Save.Create("Slot_01");`
 * - C++ / Rust:              `moovn::save::create("Slot_01");`
 *
 * Non-API lines (comments, imports, control flow, host declarations) are never silently
 * dropped during conversion; they are preserved and reported in `TranslationReport`.
 */

import type { SceneNode, VNProject } from '../types.ts';
import { evalScriptViaTauriEngine, isTauriEnvironment } from './tauriBridge.ts';

export type EnginePolyglotLanguage =
  | 'javascript'
  | 'typescript'
  | 'csharp'
  | 'cpp'
  | 'rust';

export interface EngineIRInstruction {
  module:
    | 'save'
    | 'scene'
    | 'bg'
    | 'char'
    | 'text'
    | 'choice'
    | 'audio'
    | 'camera'
    | 'var'
    | 'clue'
    | 'stream'
    | 'renderer';
  action: string;
  args: string[];
  rawLine: string;
}

export interface TranslationReport {
  output: string;
  code: string;
  convertedCount: number;
  preservedCount: number;
  unrecognizedLines: Array<{ line: number; content: string }>;
  warnings: string[];
}

function toPascalCase(snake: string): string {
  return snake
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join('');
}

function toCamelCase(snake: string): string {
  const pascal = toPascalCase(snake);
  return pascal ? pascal.charAt(0).toLowerCase() + pascal.slice(1) : '';
}

function toSnakeCase(ident: string): string {
  return ident
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[-\s]+/g, '_')
    .toLowerCase();
}

/**
 * Parses a single `moovn.*` / `Moovn.*` / `moovn::*` API call line into a canonical `EngineIRInstruction`.
 */
export function parsePolyglotFastApiLine(line: string): EngineIRInstruction | null {
  const clean = line.trim().replace(/;+$/, '').trim();
  if (
    !clean ||
    clean.startsWith('//') ||
    clean.startsWith('#') ||
    clean.startsWith('--') ||
    clean.startsWith('/*') ||
    clean.startsWith('*')
  ) {
    return null;
  }

  const openIdx = clean.indexOf('(');
  const closeIdx = clean.lastIndexOf(')');
  if (openIdx === -1 || closeIdx === -1 || closeIdx < openIdx) return null;

  const head = clean.slice(0, openIdx).trim();
  const argsRaw = clean.slice(openIdx + 1, closeIdx);

  const parts = head
    .replace(/::/g, '.')
    .replace(/->/g, '.')
    .replace(/:/g, '.')
    .split('.')
    .map((s) => s.trim())
    .filter(Boolean);

  if (parts.length < 2) return null;

  const root = parts[0].toLowerCase();
  if (root !== 'moovn') return null;

  let rawMod = parts.length >= 3 ? parts[1].toLowerCase() : 'core';
  let rawAct = parts.length >= 3 ? toSnakeCase(parts[2]) : parts[1];

  if (parts.length === 2) {
    const legacyMap: Record<string, [string, string]> = {
      setBg: ['bg', 'show'],
      weather: ['bg', 'weather'],
      colorFilter: ['bg', 'filter'],
      enterChar: ['char', 'enter'],
      exitChar: ['char', 'exit'],
      setExpression: ['char', 'expr'],
      moveChar: ['char', 'move'],
      addAffection: ['char', 'affection'],
      dialogue: ['text', 'say'],
      say: ['text', 'say'],
      narration: ['text', 'narrate'],
      playBgm: ['audio', 'bgm_play'],
      stopBgm: ['audio', 'bgm_stop'],
      playSfx: ['audio', 'sfx'],
      playVoice: ['audio', 'voice'],
      cameraPanZoom: ['camera', 'pan_zoom'],
      cameraShake: ['camera', 'shake'],
      setVar: ['var', 'set'],
      unlockClue: ['clue', 'unlock'],
      preloadScenes: ['stream', 'preload'],
      unloadScenes: ['stream', 'unload'],
    };
    if (legacyMap[rawAct]) {
      [rawMod, rawAct] = legacyMap[rawAct];
    } else {
      rawAct = toSnakeCase(rawAct);
    }
  }

  const modAliases: Record<string, EngineIRInstruction['module']> = {
    save: 'save',
    saves: 'save',
    scene: 'scene',
    chapter: 'scene',
    bg: 'bg',
    background: 'bg',
    char: 'char',
    character: 'char',
    actor: 'char',
    text: 'text',
    dialogue: 'text',
    say: 'text',
    choice: 'choice',
    branch: 'choice',
    audio: 'audio',
    sound: 'audio',
    bgm: 'audio',
    camera: 'camera',
    cam: 'camera',
    var: 'var',
    vars: 'var',
    state: 'var',
    clue: 'clue',
    clues: 'clue',
    stream: 'stream',
    memory: 'stream',
    renderer: 'renderer',
    render: 'renderer',
  };

  const normMod = modAliases[rawMod];
  if (!normMod) return null;
  const normAct = rawAct.toLowerCase();

  const args: string[] = [];
  let cur = '';
  let inQ = false;
  let qChar = '"';
  let escaped = false;

  for (let i = 0; i < argsRaw.length; i++) {
    const ch = argsRaw[i];
    if (escaped) {
      cur += ch;
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (!inQ && (ch === '"' || ch === "'")) {
      inQ = true;
      qChar = ch;
      continue;
    }
    if (inQ && ch === qChar) {
      inQ = false;
      continue;
    }
    if (ch === ',' && !inQ) {
      args.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) args.push(cur.trim());

  return {
    module: normMod,
    action: normAct,
    args,
    rawLine: clean,
  };
}

/**
 * Formats an `EngineIRInstruction` into syntactically valid code for the target language:
 * - JS/TS:   `moovn.save.create("Slot_01");`
 * - C#:      `Moovn.Save.Create("Slot_01");`
 * - C++/Rust:`moovn::save::create("Slot_01");`
 */
export function formatIRInstructionForLanguage(
  inst: EngineIRInstruction,
  target: EnginePolyglotLanguage
): string {
  const formattedArgs = inst.args
    .map((a) => {
      if (a === 'true' || a === 'false' || (!isNaN(Number(a)) && a.trim() !== '')) {
        return a;
      }
      return JSON.stringify(a);
    })
    .join(', ');

  if (target === 'javascript' || target === 'typescript') {
    const method = inst.action.includes('_') ? toCamelCase(inst.action) : inst.action;
    return `moovn.${inst.module}.${method}(${formattedArgs});`;
  }
  if (target === 'csharp') {
    return `Moovn.${toPascalCase(inst.module)}.${toPascalCase(inst.action)}(${formattedArgs});`;
  }
  return `moovn::${inst.module}::${toSnakeCase(inst.action)}(${formattedArgs});`;
}

/**
 * Converts `moovn.*` API calls in a multi-line script into the target language syntax
 * WITHOUT silently dropping comments, imports, or unrecognized host statements.
 */
export function translatePolyglotScriptWithReport(
  source: string,
  target: EnginePolyglotLanguage
): TranslationReport {
  const outLines: string[] = [];
  const unrecognizedLines: Array<{ line: number; content: string }> = [];
  const warnings: string[] = [];
  let convertedCount = 0;
  let preservedCount = 0;

  // Keep each original line terminator and every non-API line verbatim. Track
  // multiline comments and quoted strings so API-looking text inside them is
  // not treated as a call. This is deliberately a conservative line formatter,
  // not a host-language compiler.
  let lexicalState: 'code' | 'block' | 'single' | 'double' | 'template' | 'raw' | 'verbatim' = 'code';
  let rawCloser = '';
  let blockDepth = 0;
  const updateLexicalState = (line: string) => {
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      const next = line[i + 1];
      if (lexicalState === 'raw') {
        if (line.startsWith(rawCloser, i)) { i += rawCloser.length - 1; lexicalState = 'code'; }
      } else if (lexicalState === 'block') {
        if (ch === '/' && next === '*') { blockDepth++; i++; }
        else if (ch === '*' && next === '/') { if (--blockDepth === 0) lexicalState = 'code'; i++; }
      } else if (lexicalState === 'verbatim') {
        if (ch === '"' && next === '"') i++;
        else if (ch === '"') lexicalState = 'code';
      } else if (lexicalState !== 'code') {
        if (ch === '\\') { i++; continue; }
        if ((lexicalState === 'single' && ch === "'") ||
            (lexicalState === 'double' && ch === '"') ||
            (lexicalState === 'template' && ch === '`')) lexicalState = 'code';
      } else {
        const rest = line.slice(i);
        const boundary = i === 0 || !/[A-Za-z0-9_]/.test(line[i - 1]);
        const rustRaw = boundary ? rest.match(/^(?:br|r)(#*)"/) : null;
        const cppRaw = boundary ? rest.match(/^R"([^\s()\\]{0,16})\(/) : null;
        const triple = rest.match(/^("{3,}|'{3})/);
        if (rustRaw) {
          rawCloser = `"${rustRaw[1]}`; lexicalState = 'raw'; i += rustRaw[0].length - 1;
        } else if (cppRaw) {
          rawCloser = `)${cppRaw[1]}"`; lexicalState = 'raw'; i += cppRaw[0].length - 1;
        } else if (triple) {
          rawCloser = triple[0]; lexicalState = 'raw'; i += triple[0].length - 1;
        } else if (ch === '@' && next === '"') {
          lexicalState = 'verbatim'; i++;
        } else if (ch === '/' && next === '*') {
          lexicalState = 'block'; blockDepth = 1; i++;
        } else if ((ch === '/' && next === '/') || (ch === '-' && next === '-') || ch === '#') {
          break;
        } else if (ch === "'") {
          lexicalState = 'single';
        } else if (ch === '"') {
          lexicalState = 'double';
        } else if (ch === '`') {
          lexicalState = 'template';
        }
      }
    }
  };

  const segments = source.split(/(\r\n|\r|\n)/);
  for (let i = 0; i < segments.length; i += 2) {
    const raw = segments[i];
    const lineNumber = i / 2 + 1;
    const trimmed = raw.trim();
    const startedInCode = lexicalState === 'code';
    updateLexicalState(raw);
    // Only an entire, standalone API call is eligible. Arguments and the
    // semicolon are copied verbatim; comments or extra statements cause the
    // line to be left untouched rather than silently discarded.
    const call = startedInCode && lexicalState === 'code'
      ? raw.match(/^([ \t]*)((?:moovn|Moovn)(?:(?:\.|::|:|->)[A-Za-z_]\w*){1,2})(\(.*\))([ \t]*;?[ \t]*)$/)
      : null;
    const parsed = call ? parsePolyglotFastApiLine(`${call[2]}${call[3]}${call[4]}`) : null;
    if (call && parsed) {
      const formatted = formatIRInstructionForLanguage({ ...parsed, args: [] }, target);
      outLines.push(`${call[1]}${formatted.slice(0, formatted.indexOf('('))}${call[3]}${call[4]}`);
      convertedCount++;
    } else {
      outLines.push(raw);
      if (trimmed) {
        preservedCount++;
        const isComment = /^(\/\/|#|--|\/\*|\*|\*\/)/.test(trimmed) || !startedInCode;
        if (!isComment) {
          unrecognizedLines.push({ line: lineNumber, content: trimmed });
          warnings.push(`第 ${lineNumber} 行未作为独立 moovn.* API 调用改写，已原样保留。`);
        }
      }
    }
    if (segments[i + 1]) outLines.push(segments[i + 1]);
  }

  const joined = outLines.join('');
  return {
    output: joined,
    code: joined,
    convertedCount,
    preservedCount,
    unrecognizedLines,
    warnings,
  };
}

export function translatePolyglotScript(
  source: string,
  target: EnginePolyglotLanguage
): string {
  return translatePolyglotScriptWithReport(source, target).output;
}

/**
 * Generates node script calls for the selected target language.
 */
export function generateNodeEngineFastScript(
  node: SceneNode,
  target: EnginePolyglotLanguage
): string {
  const insts: EngineIRInstruction[] = [
    {
      module: 'bg',
      action: 'show',
      args: [node.backgroundId, node.transition || 'fade'],
      rawLine: '',
    },
  ];

  if (node.weatherEffect && node.weatherEffect !== 'none') {
    insts.push({
      module: 'bg',
      action: 'weather',
      args: [node.weatherEffect, '60'],
      rawLine: '',
    });
  }

  for (const ch of node.characters) {
    insts.push({
      module: 'char',
      action: 'enter',
      args: [ch.characterId, `${ch.x},${ch.y}`],
      rawLine: '',
    });
    insts.push({
      module: 'char',
      action: 'expr',
      args: [ch.characterId, ch.spriteId],
      rawLine: '',
    });
  }

  for (const dlg of node.dialogues) {
    if (dlg.speakerId === 'narrator') {
      insts.push({
        module: 'text',
        action: 'narrate',
        args: [dlg.text],
        rawLine: '',
      });
    } else {
      insts.push({
        module: 'text',
        action: 'say',
        args: [dlg.speakerName, dlg.text],
        rawLine: '',
      });
    }
  }

  for (const c of node.choices) {
    insts.push({
      module: 'choice',
      action: 'add',
      args: [c.text, c.targetNodeId],
      rawLine: '',
    });
  }

  return insts.map((i) => formatIRInstructionForLanguage(i, target)).join('\n');
}

export function generateProjectEnginePolyglotScript(
  project: VNProject,
  target: EnginePolyglotLanguage
): string {
  const blocks: string[] = [];
  for (const node of project.nodes) {
    blocks.push(`// ${node.id}: ${node.title}`);
    blocks.push(generateNodeEngineFastScript(node, target));
    blocks.push('');
  }
  return blocks.join('\n').trim();
}

export function evalPolyglotScriptInEngine(
  source: string,
  lang: EnginePolyglotLanguage
): {
  instructions: EngineIRInstruction[];
  unrecognizedLines: Array<{ line: number; content: string }>;
  logs: string[];
} {
  const instructions: EngineIRInstruction[] = [];
  const unrecognizedLines: Array<{ line: number; content: string }> = [];
  const lines = source.split('\n');
  const logs: string[] = [
    `[静态 API 指令检查 (${lang})] 共扫描 ${lines.length} 行源码`,
  ];

  for (let idx = 0; idx < lines.length; idx++) {
    const trimmed = lines[idx].trim();
    if (
      !trimmed ||
      trimmed.startsWith('//') ||
      trimmed.startsWith('#') ||
      trimmed.startsWith('--') ||
      trimmed.startsWith('/*') ||
      trimmed.startsWith('*')
    ) {
      continue;
    }
    const parsed = parsePolyglotFastApiLine(trimmed);
    if (parsed) {
      instructions.push(parsed);
      logs.push(
        `  [第 ${idx + 1} 行] 识别指令 -> ${parsed.module}.${parsed.action}(${parsed.args.join(', ')})`
      );
    } else {
      unrecognizedLines.push({ line: idx + 1, content: trimmed });
      logs.push(`  [第 ${idx + 1} 行] 宿主语句 (非 moovn.* 调用): ${trimmed}`);
    }
  }

  logs.push(
    `检查完成：共识别 ${instructions.length} 条 moovn.* 指令，${unrecognizedLines.length} 行宿主语句。`
  );
  return { instructions, unrecognizedLines, logs };
}

/**
 * Evaluates a script in the native Tauri Rust engine (`invoke('eval_engine_script')`)
 * when running in Desktop mode (`GPT-07 / CL-07`), and falls back to explicit static
 * API inspection (`[Web 静态检查]`) when running in browser Web mode.
 */
export async function evalPolyglotScriptInEngineAsync(
  source: string,
  lang: EnginePolyglotLanguage
): Promise<{
  mode: 'tauri_native' | 'web_static';
  instructions: EngineIRInstruction[];
  unrecognizedLines: Array<{ line: number; content: string }>;
  logs: string[];
}> {
  const staticRes = evalPolyglotScriptInEngine(source, lang);
  if (isTauriEnvironment()) {
    const tauriRes = await evalScriptViaTauriEngine(source, lang);
    if (tauriRes.ok && Array.isArray(tauriRes.data)) {
      return {
        mode: 'tauri_native',
        instructions: staticRes.instructions,
        unrecognizedLines: staticRes.unrecognizedLines,
        logs: [
          `[Tauri 引擎 (${lang})] 已处理 ${tauriRes.data.length} 条 API 指令；不执行宿主语言代码`,
          ...tauriRes.data,
        ],
      };
    }
    throw new Error(`原生引擎请求失败，未执行且未自动降级：${tauriRes.error || '响应格式无效'}`);
  }
  return {
    mode: 'web_static',
    instructions: staticRes.instructions,
    unrecognizedLines: staticRes.unrecognizedLines,
    logs: [
      `[静态检查 (${lang})] Web 模式执行静态 API 校验（共识别 ${staticRes.instructions.length} 条 moovn.* 指令）`,
      ...staticRes.logs.slice(1),
    ],
  };
}

