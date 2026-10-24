/**
 * MooVN Engine Bridge (TypeScript <-> Rust Core Engine & Polyglot Translator)
 *
 * Mirrors `MooVN Engine/src/translator.rs`, `save.rs`, and `renderer/mod.rs`.
 * Translates and executes Visual Novel Fast APIs across:
 * - JavaScript (`moobn.sava:create(NAME)` / `moovn.save:create(NAME)`)
 * - TypeScript (`moobn.sava:create(NAME)` / `moovn.save:create(NAME)`)
 * - C# (`moovn.save:create(NAME)`)
 * - C++ (`moovn::save::create(NAME)` / `moovn.save:create(NAME)`)
 * - Rust (`moovn::save::create(NAME)` / `moovn.save:create(NAME)`)
 * And provides the reserved Rust + C++ Renderer Interface descriptor.
 */

import { SceneNode, VNProject } from '../types';

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

export interface RendererInterfaceStatus {
  architecture: 'Rust + C++20 Hybrid FFI (In Development)';
  rustTrait: 'moovn_engine::renderer::MooVNRendererBackend';
  cppHeader: 'MooVN Engine/cpp/include/moovn_renderer.hpp (moovn::renderer::IRendererDevice)';
  cAbiVTable: 'CppRendererVTable (#[repr(C)])';
  activeBackend: 'HybridRustCpp' | 'CppVulkan' | 'CppDirectX12' | 'RustWgpu';
}

export const RESERVED_RENDERER_STATUS: RendererInterfaceStatus = {
  architecture: 'Rust + C++20 Hybrid FFI (In Development)',
  rustTrait: 'moovn_engine::renderer::MooVNRendererBackend',
  cppHeader: 'MooVN Engine/cpp/include/moovn_renderer.hpp (moovn::renderer::IRendererDevice)',
  cAbiVTable: 'CppRendererVTable (#[repr(C)])',
  activeBackend: 'HybridRustCpp',
};

/**
 * Normalizes any fast API call line from JS/TS, C#, C++, or Rust into a canonical `EngineIRInstruction`.
 * Examples accepted:
 * - C#:         `moovn.save:create("Slot_01")`
 * - JavaScript: `moobn.sava:create("Slot_01")`
 * - C++/Rust:   `moovn::save::create("Slot_01")`
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

  const modMap: Record<string, EngineIRInstruction['module']> = {
    save: 'save',
    sava: 'save',
    saves: 'save',
    scene: 'scene',
    chapter: 'scene',
    bg: 'bg',
    background: 'bg',
    char: 'char',
    character: 'char',
    text: 'text',
    dialogue: 'text',
    choice: 'choice',
    audio: 'audio',
    camera: 'camera',
    var: 'var',
    clue: 'clue',
    stream: 'stream',
    renderer: 'renderer',
    render: 'renderer',
  };

  const normMod = modMap[rawMod] || 'scene';
  const actMap: Record<string, string> = {
    create: 'create',
    new: 'create',
    save: 'create',
    load: 'load',
    restore: 'load',
    delete: 'delete',
    remove: 'delete',
    quicksave: 'quick_save',
    quick_save: 'quick_save',
    quickload: 'quick_load',
    quick_load: 'quick_load',
    autosave: 'auto_save',
    auto_save: 'auto_save',
  };
  const normAct = actMap[rawAct.toLowerCase()] || rawAct.toLowerCase();

  const args: string[] = [];
  let cur = '';
  let inQ = false;
  let qCh = '"';
  for (const ch of argsRaw) {
    if ((ch === '"' || ch === "'") && !inQ) {
      inQ = true;
      qCh = ch;
      continue;
    } else if (ch === qCh && inQ) {
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
 * Formats an `EngineIRInstruction` into the target language's idiomatic Fast API syntax:
 * - C#:         `moovn.save:create("Slot_01");`
 * - JavaScript: `moobn.sava:create("Slot_01");`
 * - TypeScript: `moobn.sava:create("Slot_01");`
 * - C++:        `moovn::save::create("Slot_01");`
 * - Rust:       `moovn::save::create("Slot_01");`
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

  if (inst.module === 'save') {
    if (target === 'javascript' || target === 'typescript') {
      return `moobn.sava:${inst.action}(${formattedArgs});`;
    }
    if (target === 'csharp') {
      return `moovn.save:${inst.action}(${formattedArgs});`;
    }
    return `moovn::save::${inst.action}(${formattedArgs});`;
  }

  if (target === 'javascript' || target === 'typescript' || target === 'csharp') {
    return `moovn.${inst.module}:${inst.action}(${formattedArgs});`;
  }
  return `moovn::${inst.module}::${inst.action}(${formattedArgs});`;
}

/**
 * Translates a multi-line script from any supported language into the target language (`javascript`, `typescript`, `csharp`, `cpp`, `rust`).
 */
export function translatePolyglotScript(
  source: string,
  target: EnginePolyglotLanguage
): string {
  const headerMap: Record<EnginePolyglotLanguage, string> = {
    javascript: '// [MooVN Engine · JavaScript 快速 API] 存档语法: moobn.sava:create(NAME)',
    typescript: '// [MooVN Engine · TypeScript 快速 API] 存档语法: moobn.sava:create(NAME)',
    csharp: '// [MooVN Engine · C# 快速 API] 存档语法: moovn.save:create(NAME)',
    cpp: '// [MooVN Engine · C++20 快速 API + 混合渲染器接口] #include "moovn_api.hpp"',
    rust: '// [MooVN Engine · Rust 原生 API + 混合渲染器接口] use moovn_engine::*;',
  };

  const outLines: string[] = [headerMap[target]];
  for (const line of source.split('\n')) {
    const parsed = parsePolyglotFastApiLine(line);
    if (parsed) {
      outLines.push(formatIRInstructionForLanguage(parsed, target));
    }
  }
  return outLines.join('\n');
}

/**
 * Generates MooVN Engine Polyglot Fast API code for a single SceneNode in `javascript`, `typescript`, `csharp`, `cpp`, or `rust`.
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
      args: [node.weatherEffect, '65'],
      rawLine: '',
    });
  }

  for (const ch of node.characters) {
    insts.push({
      module: 'char',
      action: 'enter',
      args: [ch.characterId, ch.x < 40 ? 'left' : ch.x > 60 ? 'right' : 'center'],
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

  // Always include a quick save slot checkpoint call demonstrating the language's save API
  insts.push({
    module: 'save',
    action: 'create',
    args: [`Auto_${node.id}`],
    rawLine: '',
  });

  // Include reserved Rust + C++ renderer pass submission
  insts.push({
    module: 'renderer',
    action: 'submit',
    args: ['vn_composite_pass', `node=${node.id}`],
    rawLine: '',
  });

  const headerMap: Record<EnginePolyglotLanguage, string> = {
    javascript: `// [MooVN Engine · JavaScript] 节点: ${node.title} (${node.id})`,
    typescript: `// [MooVN Engine · TypeScript] 节点: ${node.title} (${node.id})`,
    csharp: `// [MooVN Engine · C#] 节点: ${node.title} (${node.id})`,
    cpp: `// [MooVN Engine · C++20] 节点: ${node.title} (${node.id})\n#include "moovn_api.hpp"\n#include "moovn_renderer.hpp"`,
    rust: `// [MooVN Engine · Rust] 节点: ${node.title} (${node.id})\nuse moovn_engine::{MooVNEngineRuntime, EngineOp};`,
  };

  return [
    headerMap[target],
    ...insts.map((i) => formatIRInstructionForLanguage(i, target)),
  ].join('\n');
}

/**
 * Generates a full project script in C#, C++, or Rust using the MooVN Engine Fast API.
 */
export function generateProjectEnginePolyglotScript(
  project: VNProject,
  target: EnginePolyglotLanguage
): string {
  const blocks: string[] = [
    `// ============================================================================`,
    `// MooVN Engine v0.1.0 (Rust Core + C++ Renderer Interface) — ${target.toUpperCase()}`,
    `// Project: ${project.title} (${project.nodes.length} nodes)`,
    `// Save API Example: ${
      target === 'javascript' || target === 'typescript'
        ? 'moobn.sava:create("Slot_01")'
        : target === 'csharp'
        ? 'moovn.save:create("Slot_01")'
        : 'moovn::save::create("Slot_01")'
    }`,
    `// ============================================================================`,
    '',
  ];

  for (const node of project.nodes.slice(0, 30)) {
    blocks.push(generateNodeEngineFastScript(node, target));
    blocks.push('');
  }
  if (project.nodes.length > 30) {
    blocks.push(
      `// ... 已省略其余 ${project.nodes.length - 30} 个节点的自动翻译指令（可在单节点模式下逐一编辑）`
    );
  }
  return blocks.join('\n');
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
    `[MooVN Engine] Loaded ${lang.toUpperCase()} script (${source.split('\n').length} lines)`,
  ];
  for (const line of source.split('\n')) {
    const parsed = parsePolyglotFastApiLine(line);
    if (parsed) {
      instructions.push(parsed);
      logs.push(
        `  -> Op [${parsed.module}::${parsed.action}] (${parsed.args.join(', ')})`
      );
    }
  }
  logs.push(`[MooVN Engine] Executed ${instructions.length} IR ops OK.`);
  return { instructions, logs };
}

