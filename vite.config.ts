import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import fs from 'node:fs';
import path from 'node:path';

const WORKSPACE_ROOT = path.resolve(process.cwd(), 'MooVN_Workspace');

function ensureWorkspaceDirs() {
  const subdirs = ['Projects', 'Exports', 'Cache', 'Models', 'Assets'];
  if (!fs.existsSync(WORKSPACE_ROOT)) {
    fs.mkdirSync(WORKSPACE_ROOT, { recursive: true });
  }
  for (const sub of subdirs) {
    const p = path.join(WORKSPACE_ROOT, sub);
    if (!fs.existsSync(p)) {
      fs.mkdirSync(p, { recursive: true });
    }
  }
  const settingsPath = path.join(WORKSPACE_ROOT, 'settings.moovn.json');
  if (!fs.existsSync(settingsPath)) {
    const defaultSettings = {
      platform: 'windows',
      workspaceRootPath: WORKSPACE_ROOT,
      projectsDirectoryPath: path.join(WORKSPACE_ROOT, 'Projects'),
      exportOutputDirectoryPath: path.join(WORKSPACE_ROOT, 'Exports'),
      cacheDirectoryPath: path.join(WORKSPACE_ROOT, 'Cache'),
      settingsFilePath: settingsPath,
      editorConfig: {
        autoSaveIntervalSec: 15,
        coloredNodeCategories: true,
        showStreamMonitorInPreview: true,
        defaultScriptLang: 'typescript',
      },
      defaultGameSettings: {
        textSpeedMs: 32,
        autoPlayDelayMs: 2000,
        bgmVolume: 75,
        sfxVolume: 85,
      },
      performanceConfig: {
        compressionFormat: '7z',
        compressionLevel: 5,
        skipAlreadyCompressedPng: true,
        preloadSceneDistance: 3,
        unloadSceneDistance: 5,
        streamPreloadScenes: 4,
        decompressTarget: 'memory',
        workerCpuBudgetPercent: 35,
        modularMsvnEnabled: true,
      },
    };
    fs.writeFileSync(settingsPath, JSON.stringify(defaultSettings, null, 2), 'utf-8');
  }
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'moovn-real-workspace-fs',
      configureServer(server) {
        ensureWorkspaceDirs();
        server.middlewares.use('/api/moovn-fs', (req, res, next) => {
          res.setHeader('Content-Type', 'application/json; charset=utf-8');

          if (req.method === 'GET' && req.url?.startsWith('/status')) {
            ensureWorkspaceDirs();
            const listDir = (dir: string) => {
              try {
                return fs.readdirSync(dir).map((name) => {
                  const full = path.join(dir, name);
                  const stat = fs.statSync(full);
                  return {
                    name,
                    path: full,
                    size: stat.size,
                    isDir: stat.isDirectory(),
                    mtime: stat.mtime.toISOString(),
                  };
                });
              } catch {
                return [];
              }
            };
            res.end(
              JSON.stringify({
                ok: true,
                workspaceRoot: WORKSPACE_ROOT,
                projectsDir: path.join(WORKSPACE_ROOT, 'Projects'),
                exportsDir: path.join(WORKSPACE_ROOT, 'Exports'),
                cacheDir: path.join(WORKSPACE_ROOT, 'Cache'),
                modelsDir: path.join(WORKSPACE_ROOT, 'Models'),
                settingsFile: path.join(WORKSPACE_ROOT, 'settings.moovn.json'),
                rootFiles: listDir(WORKSPACE_ROOT),
                projectFiles: listDir(path.join(WORKSPACE_ROOT, 'Projects')),
                exportFiles: listDir(path.join(WORKSPACE_ROOT, 'Exports')),
                modelFiles: listDir(path.join(WORKSPACE_ROOT, 'Models')),
              })
            );
            return;
          }

          if (req.method === 'POST' && req.url?.startsWith('/write')) {
            let body = '';
            req.on('data', (chunk) => {
              body += chunk;
            });
            req.on('end', () => {
              try {
                const payload = JSON.parse(body);
                const subFolder = payload.subFolder || 'Exports';
                const fileName = path.basename(payload.fileName || 'output.json');
                const customDir = payload.customDir;
                const targetDir =
                  customDir && customDir.startsWith('/')
                    ? customDir
                    : path.join(WORKSPACE_ROOT, subFolder);

                fs.mkdirSync(targetDir, { recursive: true });
                const targetPath = path.join(targetDir, fileName);
                fs.writeFileSync(targetPath, String(payload.content ?? ''), 'utf-8');
                res.end(
                  JSON.stringify({
                    ok: true,
                    savedPath: targetPath,
                    bytes: Buffer.byteLength(String(payload.content ?? ''), 'utf-8'),
                  })
                );
              } catch (err: any) {
                res.statusCode = 500;
                res.end(JSON.stringify({ ok: false, error: err?.message || 'write failed' }));
              }
            });
            return;
          }

          next();
        });
      },
    },
  ],
  clearScreen: false,
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    allowedHosts: true,
    cors: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true,
  },
});
