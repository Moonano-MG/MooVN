import type { FlowNode, Project, ScriptLang } from '../common/types';
import type { GameState } from './states';

export interface ScriptCtx {
  vars: Record<string, unknown>;
  state: GameState;
  project: Project;
}

export interface ScriptNotice {
  lang: string;
  message: string;
}

let luaFactory: ((code: string, glb: Record<string, unknown>) => Promise<void>) | null = null;

/** 懒加载 wasmoon（Lua 5.4 WASM），只在第一次执行 Lua/Teal 脚本时加载 */
async function getLuaRunner(): Promise<(code: string, glb: Record<string, unknown>) => Promise<void>> {
  if (luaFactory) return luaFactory;
  const { LuaFactory } = await import('wasmoon');
  const factory = new LuaFactory();
  luaFactory = async (code: string, glb: Record<string, unknown>) => {
    const lua = await factory.createEngine();
    try {
      lua.global.set('moovn', glb);
      await lua.doString(code);
    } finally {
      lua.global.close();
    }
  };
  return luaFactory;
}

/**
 * 执行脚本节点。
 * - JavaScript：浏览器沙盒执行（可用 moovn.vars / moovn.state）
 * - Lua / Teal：wasmoon 执行（Teal 仅支持纯 Lua 子集，类型标注会被忽略）
 * - TypeScript / Python：Web 运行时不内置解释器，桌面端（Tauri）通过 sidecar 执行；
 *   此处返回提示事件。
 */
export async function runScriptNode(
  node: FlowNode,
  ctx: ScriptCtx
): Promise<ScriptNotice | null> {
  const lang: ScriptLang = node.lang ?? 'javascript';
  const code = node.code ?? '';
  if (!code.trim()) return null;

  const glb = {
    vars: ctx.vars,
    state: ctx.state,
    project: ctx.project,
    log: (...args: unknown[]) => console.log('[MooVN script]', ...args)
  };

  switch (lang) {
    case 'javascript': {
      try {
        // eslint-disable-next-line @typescript-eslint/no-implied-eval
        const fn = new Function('moovn', `"use strict";\n${code}`);
        fn(glb);
      } catch (err) {
        console.warn('[MooVN] JS 脚本执行失败:', err);
        return { lang, message: `JS 脚本执行失败: ${String(err)}` };
      }
      return null;
    }

    case 'lua':
    case 'teal': {
      try {
        const run = await getLuaRunner();
        await run(code, glb);
      } catch (err) {
        console.warn('[MooVN] Lua 脚本执行失败:', err);
        return { lang, message: `Lua 脚本执行失败: ${String(err)}` };
      }
      return lang === 'teal'
        ? { lang, message: 'Teal 已按 Lua 子集执行（类型标注在运行期被忽略）' }
        : null;
    }

    case 'typescript':
      return {
        lang,
        message: 'TypeScript 脚本需编译后由 JS 引擎执行；桌面端构建时会通过 esbuild 预编译执行。'
      };

    case 'python':
      return {
        lang,
        message: 'Python 脚本在桌面端通过 Tauri sidecar（内嵌 Python 运行时）执行，Web 预览不支持。'
      };

    default:
      return { lang, message: `未知脚本语言: ${lang}` };
  }
}
