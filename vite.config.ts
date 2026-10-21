import { defineConfig } from 'vite';
import { resolve } from 'path';

import fs from 'fs';
import type { Plugin } from 'vite';

/**
 * wasmoon 的 UMD 构建内部包含 Node.js 专用分支（require('fs'/'path'/'url')），
 * Vite/Rollup 默认会把它们 externalize 成 __vite-browser-external shim chunk；
 * 该 shim 被主入口静态 import 后，浏览器直接打开 dist/index.html 时会因
 * "shim 不导出 storage 所需符号"而整体加载失败 —— Web 版白屏不可用的根因。
 *
 * 修复策略（不改 node_modules、不加新依赖）：把 UMD 包装成纯 ESM 模块：
 *   1. 用自执行工厂喂入本地 exports 对象（绕开 exports/module/define 检测）
 *   2. 注入全局 stub require()（Node 分支在浏览器永远不会被执行，仅防 ReferenceError）
 *   3. 将 wasm 二进制内联为 base64，并把 LuaFactory.createEngine 的 locateFile
 *      重定向到 data: URL（否则 glue.wasm 既不会被 Vite 复制进 dist，file:// 下也无法 fetch）
 *   4. 显式命名导出（LuaFactory / LuaEngine / LuaType ...），dev(esbuild) 与 build(rollup) 共用
 */
const WASMOON_ENTRY = resolve(__dirname, 'node_modules/wasmoon/dist/index.js');

const WASMOON_EXPORT_NAMES = [
  'Decoration', 'LUAI_MAXSTACK', 'LUA_MULTRET', 'LUA_REGISTRYINDEX', 'LuaEngine',
  'LuaEventCodes', 'LuaEventMasks', 'LuaFactory', 'LuaGlobal', 'LuaLibraries',
  'LuaMultiReturn', 'LuaRawResult', 'LuaReturn', 'LuaThread', 'LuaTimeoutError',
  'LuaType', 'LuaTypeExtension', 'LuaWasm', 'PointerSize', 'decorate',
  'decorateFunction', 'decorateProxy', 'decorateUserdata'
];

function transformWasmoonUmd(code: string): string {
  const wasmPath = resolve(__dirname, 'node_modules/wasmoon/dist/glue.wasm');
  const b64 = fs.readFileSync(wasmPath).toString('base64');
  const aliasDecls = WASMOON_EXPORT_NAMES.map((n) => `${n}=__wm_exports.${n}`).join(',');
  return (
    `var require=(typeof globalThis!=="undefined"&&globalThis.require)||function(n){return globalThis[n];};\n` +
    `var __wm_exports={};\n` +
    `(function(module,exports,define,__wm_self){${code}\n}).call(globalThis,{exports:__wm_exports},__wm_exports,undefined,globalThis);\n` +
    // wasm 内联：包装 createEngine，注入 locateFile -> data:URL
    `try{var __luaFactoryProto=__wm_exports.LuaFactory.prototype;` +
    `var __origCreateEngine=__luaFactoryProto.createEngine;` +
    `__luaFactoryProto.createEngine=function(){` +
    `var args=Array.prototype.slice.call(arguments);` +
    `if(!args[0])args[0]={};` +
    `args[0].locateFile=function(f){return f==="glue.wasm"?"data:application/wasm;base64,${b64}":f;};` +
    `return __origCreateEngine.apply(this,args);};}catch(e){console.warn("[MooVN] wasmoon wasm inline failed:",e);}\n` +
    `var ${aliasDecls};\n` +
    `export { ${WASMOON_EXPORT_NAMES.join(', ')} };\n`
  );
}

function wasmoonBrowserPlugin(): Plugin {
  return {
    name: 'moovn-wasmoon-browser',
    enforce: 'pre',
    apply: 'build',
    async load(id) {
      if (id.replace(/[\\/]/g, '/').endsWith('node_modules/wasmoon/dist/index.js')) {
        return transformWasmoonUmd(await fs.promises.readFile(WASMOON_ENTRY, 'utf8'));
      }
      return null;
    }
  };
}

// base 使用相对路径，产物可直接部署在任意子路径（含沙盒 /moovn/ 预览）
export default defineConfig({
  base: './',
  plugins: [wasmoonBrowserPlugin()],
  optimizeDeps: {
    include: ['wasmoon'],
    esbuildOptions: {
      plugins: [
        {
          name: 'moovn-wasmoon-browser-dev',
          setup(build) {
            build.onLoad({ filter: /wasmoon[/\\]dist[/\\]index\.js$/ }, async (args) => ({
              contents: transformWasmoonUmd(await fs.promises.readFile(args.path, 'utf8')),
              loader: 'js'
            }));
          }
        }
      ]
    }
  },
  build: {
    target: 'es2021',
    chunkSizeWarningLimit: 4096,
    rollupOptions: {
      input: {
        editor: resolve(__dirname, 'index.html'),
        game: resolve(__dirname, 'game.html')
      },
      output: {
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('pixi')) return 'pixi';
          if (id.includes('codemirror') || id.includes('@lezer')) return 'codemirror';
          if (id.includes('wasmoon')) return 'wasmoon';
          return undefined;
        }
      },
      onwarn(warn, defaultHandler) {
        // UMD 包装产生的 this/eval 类警告可安全忽略（保持原行为不变）
        if (warn.code === 'THIS_IS_UNDEFINED' || warn.code === 'EVAL') return;
        defaultHandler(warn);
      }
    }
  },
  server: { port: 5173, strictPort: true }
});
