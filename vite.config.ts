import { defineConfig } from 'vite';
import { resolve } from 'path';

// base 使用相对路径，产物可直接部署在任意子路径（含沙盒 /moovn/ 预览）
export default defineConfig({
  base: './',
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
      }
    }
  },
  server: { port: 5173, strictPort: true }
});
