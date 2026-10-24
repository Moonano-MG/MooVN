/**
 * MooVN Script IR Bridge (`moovnEngineBridge.ts`)
 *
 * Normalizes script API calls into canonical `EngineIRInstruction` records
 * and formats instructions using the unified `moovn.*` namespace (`moovn.save:create(NAME)`).
 * Legacy `moobn.sava` input is accepted one-way during parsing for backward compatibility
 * and is never generated.
 */

import type { SceneNode, VNProject } from '../types';

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

/**
 * Parses a script API call line into a canonical `EngineIRInstruction`.
 * Canonical syntax:
 * - JS/TS/C#: `moovn.save:create("Slot_01")`
 * - C++/Rust: `moovn::save::create("Slot_01")`
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
  // Accept legacy typo `moobn` only during parsing; never emit it
  if (root !== 'moovn' && root !== 'moobn') return null;

  let rawMod = parts.length >= 3 ? parts[1].toLowerCase() : 'core';
  let rawAct = parts.length >= 3 ? parts[2].toLowerCase() : parts[1];

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
    }
  }

  const modAliases: Record<string, EngineIRInstruction['module']> = {
    save: 'save',
    sava: 'save', // one-way legacy compatibility only
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

  const normMod = modAliases[rawMod] || 'scene';
  const normAct = rawAct.toLowerCase();

  const args: string[] = [];
  let cur = '';
  let inQ = false;
  let qChar = '"';
  for (let i = 0; i < argsRaw.length; i++) {
    const ch = argsRaw[i];
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
 * Formats an `EngineIRInstruction` into the canonical `moovn.*` API syntax:
 * - JS/TS/C#: `moovn.save:create("Slot_01");`
 * - C++/Rust: `moovn::save::create("Slot_01");`
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

  if (target === 'javascript' || target === 'typescript' || target === 'csharp') {
    return `moovn.${inst.module}:${inst.action}(${formattedArgs});`;
  }
  return `moovn::${inst.module}::${inst.action}(${formattedArgs});`;
}

/**
 * Normalizes a multi-line script into the target syntax (`moovn.*`).
 */
export function translatePolyglotScript(
  source: string,
  target: EnginePolyglotLanguage
): string {
  const outLines: string[] = [];
  for (const line of source.split('\n')) {
    const parsed = parsePolyglotFastApiLine(line);
    if (parsed) {
      outLines.push(formatIRInstructionForLanguage(parsed, target));
    }
  }
  return outLines.join('\n');
}

/**
 * Generates clean node script code without promotional comments.
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

/**
 * Generates a full project script in the selected language.
 */
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
  logs: string[];
} {
  const instructions: EngineIRInstruction[] = [];
  const logs: string[] = [
    `[${lang}] 解析脚本 (${source.split('\n').length} 行)`,
  ];
  for (const line of source.split('\n')) {
    const parsed = parsePolyglotFastApiLine(line);
    if (parsed) {
      instructions.push(parsed);
      logs.push(
        `  -> ${parsed.module}:${parsed.action}(${parsed.args.join(', ')})`
      );
    }
  }
  logs.push(`共解析 ${instructions.length} 条指令`);
  return { instructions, logs };
}
