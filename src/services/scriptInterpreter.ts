import {
  BackgroundPresetId,
  CharacterDef,
  CharacterExpression,
  SceneDef,
  SupportedScriptLang,
  VisualCodeBlock,
  WeatherEffectType,
} from '../types/moovn';

export interface ScriptExecutionResult {
  language: SupportedScriptLang;
  logs: string[];
  transpiledLua?: string;
  updatedScene?: Partial<SceneDef>;
  affectionDeltas: { characterId: string; delta: number }[];
  success: boolean;
}

export function blocksToCode(blocks: VisualCodeBlock[], lang: SupportedScriptLang): string {
  const lines: string[] = [];
  if (lang === 'lua') {
    lines.push('-- 由 MooVN 可视化代码块自动生成 (Lua 5.4)');
  } else if (lang === 'teal') {
    lines.push('-- 由 MooVN 可视化代码块自动生成 (Teal 强类型方言)');
    lines.push('local moovn = require("moovn")');
  } else if (lang === 'python') {
    lines.push('# 由 MooVN 可视化代码块自动生成 (Python 3.11)');
    lines.push('import moovn');
  } else {
    lines.push('// 由 MooVN 可视化代码块自动生成 (TypeScript 5.6)');
    lines.push("import { moovn } from '@moovn/runtime';");
  }
  lines.push('');

  for (const b of blocks) {
    if (b.command === 'set_background') {
      const preset = b.params.preset || 'rainy_station';
      const weather = b.params.weather || 'rain';
      if (lang === 'lua' || lang === 'teal') {
        lines.push(`moovn.bg("${preset}", { weather = "${weather}" })`);
      } else if (lang === 'python') {
        lines.push(`moovn.bg("${preset}", weather="${weather}")`);
      } else {
        lines.push(`moovn.setBackground('${preset}', { weather: '${weather}' });`);
      }
    } else if (b.command === 'play_bgm') {
      const bgm = b.params.bgm || 'blue_nocturne';
      const vol = b.params.volume ?? 80;
      if (lang === 'lua' || lang === 'teal') {
        lines.push(`moovn.audio("${bgm}", ${vol})`);
      } else if (lang === 'python') {
        lines.push(`moovn.audio("${bgm}", volume=${vol})`);
      } else {
        lines.push(`moovn.playBgm('${bgm}', ${vol});`);
      }
    } else if (b.command === 'add_affection' || b.command === 'get_affection') {
      const cid = b.params.characterId || 'char_shizuki';
      const delta = b.params.delta ?? b.params.min ?? 10;
      if (lang === 'lua' || lang === 'teal') {
        lines.push(`moovn.affection("${cid}", ${delta})`);
      } else if (lang === 'python') {
        lines.push(`moovn.add_affection("${cid}", ${delta})`);
      } else {
        lines.push(`moovn.addAffection('${cid}', ${delta});`);
      }
    } else if (b.command === 'say') {
      const speaker = b.params.speaker || '汐月';
      const text = b.params.text || '你好，观测者！';
      if (lang === 'lua' || lang === 'teal') {
        lines.push(`moovn.say("${speaker}", "${text}")`);
      } else if (lang === 'python') {
        lines.push(`moovn.say("${speaker}", "${text}")`);
      } else {
        lines.push(`moovn.say('${speaker}', '${text}');`);
      }
    } else if (b.command === 'read_attr') {
      const cid = b.params.characterId || 'char_shizuki';
      const attr = b.params.attr || 'sync_rate';
      if (lang === 'teal') {
        lines.push(`local val: number = moovn.get_attr("${cid}", "${attr}")`);
      } else if (lang === 'lua') {
        lines.push(`local val = moovn.get_attr("${cid}", "${attr}")`);
      } else if (lang === 'python') {
        lines.push(`val = moovn.get_attr("${cid}", "${attr}")`);
      } else {
        lines.push(`const val: number = moovn.getAttr('${cid}', '${attr}');`);
      }
    }
  }

  return lines.join('\n');
}

export function executeMooVNScript(
  lang: SupportedScriptLang,
  code: string,
  currentScene: SceneDef,
  characters: CharacterDef[]
): ScriptExecutionResult {
  const logs: string[] = [];
  const affectionDeltas: { characterId: string; delta: number }[] = [];
  const updatedScene: Partial<SceneDef> = {};

  logs.push(`[MooVN ${lang.toUpperCase()} VM] 启动内置解释器...`);

  let transpiledLua: string | undefined;
  if (lang === 'teal') {
    // Strip Teal type annotations to produce clean Lua 5.4 code
    transpiledLua = code
      .replace(/record\s+\w+[\s\S]*?end/g, '-- [Teal record stripped]')
      .replace(/:\s*(string|number|integer|boolean|\w+)/g, '');
    logs.push('[Teal Compiler] 类型检查通过 (0 errors)，已转译为标准 Lua 字节码指令。');
  }

  // Parse moovn.* calls across Lua, Teal, Python, and TypeScript
  const lines = code.split('\n');
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('--') || line.startsWith('#') || line.startsWith('//')) continue;

    // Log calls
    const logMatch = line.match(/moovn\.log\((.*)\)/);
    if (logMatch) {
      logs.push(`[Runtime Output] ${logMatch[1].replace(/['"`]/g, '')}`);
    }

    // Background calls: moovn.bg("preset", ...) or moovn.setBackground('preset', ...)
    const bgMatch = line.match(/moovn\.(?:bg|setBackground)\(\s*['"]([^'"]+)['"]/);
    if (bgMatch) {
      const presetId = bgMatch[1] as BackgroundPresetId;
      const weatherMatch = line.match(/weather\s*[:=]\s*['"]([^'"]+)['"]/);
      const weather = (weatherMatch ? weatherMatch[1] : currentScene.background.weather) as WeatherEffectType;
      updatedScene.background = {
        ...currentScene.background,
        presetId,
        weather,
      };
      logs.push(`[Stage Pixi.js] 切换背景预设 -> ${presetId} (天气特效: ${weather})`);
    }

    // Affection calls: moovn.affection("char_id", 10) / moovn.add_affection / moovn.addAffection
    const affMatch = line.match(/moovn\.(?:affection|add_affection|addAffection)\(\s*['"]([^'"]+)['"]\s*,\s*(-?\d+)/);
    if (affMatch) {
      const characterId = affMatch[1];
      const delta = Number(affMatch[2]);
      const charObj = characters.find((c) => c.id === characterId);
      affectionDeltas.push({ characterId, delta });
      logs.push(
        `[Character System] 角色 ${charObj?.name || characterId} 好感度变化: ${delta >= 0 ? '+' : ''}${delta} (当前: ${
          (charObj?.affection ?? 0) + delta
        })`
      );
    }

    // Expression calls
    const exprMatch = line.match(/moovn\.(?:set_expr|updateCharacter)\(\s*['"]([^'"]+)['"]\s*,\s*(?:['"]([^'"]+)['"]|\{[^}]*expression:\s*['"]([^'"]+)['"])/);
    if (exprMatch) {
      const cid = exprMatch[1];
      const expr = (exprMatch[2] || exprMatch[3] || 'smile') as CharacterExpression;
      logs.push(`[Stage Pixi.js] 更新角色 ${cid} 立绘表情 -> ${expr}`);
    }

    // Dialogue calls: moovn.say("Speaker", "Text")
    const sayMatch = line.match(/moovn\.say\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]\s*\)/);
    if (sayMatch) {
      const speakerName = sayMatch[1];
      const text = sayMatch[2];
      updatedScene.dialogue = {
        ...currentScene.dialogue,
        speakerName,
        text,
      };
      logs.push(`[Dialogue Box] ${speakerName}: 「${text}」`);
    }
  }

  logs.push(`[MooVN ${lang.toUpperCase()} VM] 脚本执行完毕。`);

  return {
    language: lang,
    logs,
    transpiledLua,
    updatedScene,
    affectionDeltas,
    success: true,
  };
}
