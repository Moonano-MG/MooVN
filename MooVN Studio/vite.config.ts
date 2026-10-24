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
  define: {
    'import.meta.env.VITE_EDITION': JSON.stringify('studio'),
  },
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'moovn-real-workspace-and-ai-proxy',
      configureServer(server) {
        ensureWorkspaceDirs();

        // 1. Real AI API Proxy (eliminates browser CORS when calling OpenAI / DeepSeek / Claude / Gemini / Ollama)
        server.middlewares.use('/api/ai/chat', (req, res, next) => {
          if (req.method !== 'POST') {
            next();
            return;
          }
          let rawBody = '';
          req.on('data', (chunk) => {
            rawBody += chunk;
          });
          req.on('end', async () => {
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            try {
              const payload = JSON.parse(rawBody || '{}');
              const {
                providerType,
                endpoint,
                apiKey,
                model,
                systemPrompt,
                messages,
              } = payload;

              if (!endpoint) {
                res.statusCode = 400;
                res.end(JSON.stringify({ ok: false, error: '未配置接口地址 (endpoint)' }));
                return;
              }

              const startMs = Date.now();
              let fetchUrl = endpoint;
              let headers: Record<string, string> = {
                'Content-Type': 'application/json',
              };
              let bodyObj: Record<string, unknown> = {};

              if (providerType === 'google_studio') {
                const base = endpoint.replace(/\/$/, '');
                fetchUrl = `${base}/${model || 'gemini-2.5-flash'}:generateContent?key=${encodeURIComponent(
                  apiKey || ''
                )}`;
                bodyObj = {
                  systemInstruction: systemPrompt
                    ? { parts: [{ text: systemPrompt }] }
                    : undefined,
                  contents: (messages || []).map((m: any) => ({
                    role: m.role === 'assistant' ? 'model' : 'user',
                    parts: [{ text: String(m.content || '') }],
                  })),
                };
              } else if (providerType === 'anthropic_claude') {
                headers['x-api-key'] = apiKey || '';
                headers['anthropic-version'] = '2023-06-01';
                bodyObj = {
                  model: model || 'claude-3-5-sonnet-latest',
                  max_tokens: 2048,
                  system: systemPrompt,
                  messages: (messages || []).map((m: any) => ({
                    role: m.role === 'assistant' ? 'assistant' : 'user',
                    content: String(m.content || ''),
                  })),
                };
              } else if (providerType === 'ollama_local') {
                bodyObj = {
                  model: model || 'qwen2.5-coder:7b',
                  stream: false,
                  messages: [
                    ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
                    ...(messages || []),
                  ],
                };
              } else {
                // OpenAI / DeepSeek / SiliconFlow / OpenRouter compatible
                if (apiKey) {
                  headers['Authorization'] = `Bearer ${apiKey}`;
                }
                bodyObj = {
                  model: model || 'gpt-4o-mini',
                  messages: [
                    ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
                    ...(messages || []),
                  ],
                  temperature: 0.4,
                };
              }

              const upstream = await fetch(fetchUrl, {
                method: 'POST',
                headers,
                body: JSON.stringify(bodyObj),
              });

              const text = await upstream.text();
              const latencyMs = Date.now() - startMs;

              if (!upstream.ok) {
                res.statusCode = upstream.status;
                res.end(
                  JSON.stringify({
                    ok: false,
                    status: upstream.status,
                    latencyMs,
                    error: `上游接口返回 HTTP ${upstream.status}: ${text.slice(0, 300)}`,
                  })
                );
                return;
              }

              const data = JSON.parse(text);
              let replyText = '';
              if (providerType === 'google_studio') {
                replyText =
                  data?.candidates?.[0]?.content?.parts
                    ?.map((p: any) => p.text || '')
                    .join('') || '';
              } else if (providerType === 'anthropic_claude') {
                replyText =
                  data?.content?.map((c: any) => c.text || '').join('') || '';
              } else if (providerType === 'ollama_local') {
                replyText = data?.message?.content || data?.response || '';
              } else {
                replyText = data?.choices?.[0]?.message?.content || '';
              }

              res.end(
                JSON.stringify({
                  ok: true,
                  latencyMs,
                  reply: replyText,
                })
              );
            } catch (err: any) {
              res.statusCode = 500;
              res.end(
                JSON.stringify({
                  ok: false,
                  error: err?.message || '请求外部模型接口失败（请检查网络或 API Key）',
                })
              );
            }
          });
        });

        // 2. Real File System Middleware (/api/moovn-fs)
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
                ensureWorkspaceDirs();
                const parsed = JSON.parse(body || '{}');
                const subFolder = parsed.subFolder || 'Projects';
                const fileName = path.basename(parsed.fileName || 'project.moovn.json');
                const content =
                  typeof parsed.content === 'string'
                    ? parsed.content
                    : JSON.stringify(parsed.content, null, 2);

                const targetDir = parsed.customDir
                  ? path.resolve(WORKSPACE_ROOT, parsed.customDir)
                  : subFolder === ''
                  ? WORKSPACE_ROOT
                  : path.join(WORKSPACE_ROOT, subFolder);

                if (!fs.existsSync(targetDir)) {
                  fs.mkdirSync(targetDir, { recursive: true });
                }
                const fullPath = path.join(targetDir, fileName);
                fs.writeFileSync(fullPath, content, 'utf-8');
                res.end(
                  JSON.stringify({
                    ok: true,
                    savedPath: fullPath,
                    bytes: Buffer.byteLength(content, 'utf-8'),
                  })
                );
              } catch (err: any) {
                res.statusCode = 500;
                res.end(JSON.stringify({ ok: false, error: err?.message || 'write error' }));
              }
            });
            return;
          }

          if (req.method === 'GET' && req.url?.startsWith('/download-export')) {
            const urlObj = new URL(req.url, 'http://localhost');
            const fileName = path.basename(
              urlObj.searchParams.get('file') ||
                'MooVN-v0.1.0-Web-PC-Mobile-LocalBuild.zip'
            );
            const fullPath = path.join(WORKSPACE_ROOT, 'Exports', fileName);
            if (!fs.existsSync(fullPath)) {
              res.statusCode = 404;
              res.end(JSON.stringify({ ok: false, error: `File not found: ${fileName}` }));
              return;
            }
            const stat = fs.statSync(fullPath);
            res.setHeader('Content-Type', 'application/zip');
            res.setHeader(
              'Content-Disposition',
              `attachment; filename="${fileName}"`
            );
            res.setHeader('Content-Length', String(stat.size));
            fs.createReadStream(fullPath).pipe(res);
            return;
          }

          next();
        });
      },
    },
  ],
  server: {
    host: '0.0.0.0',
    allowedHosts: true,
  },
});
