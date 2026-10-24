import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import fs from 'node:fs';
import path from 'node:path';

const WORKSPACE_ROOT = path.resolve(process.cwd(), 'MooVN_Workspace');

// Per-IP Rate Limiter store for Dev Server (mirrors Web/api/rate-limit.js on Vercel)
const ipRateStore = new Map<
  string,
  { windowStart: number; downloadHits: number; checkHits: number; blockedUntil: number }
>();
const RATE_WINDOW_MS = 10 * 60 * 1000;
const MAX_DOWNLOADS_PER_IP = 6;

function getClientIp(req: any): string {
  const realIp =
    req.headers?.['x-vercel-forwarded-for'] ||
    req.headers?.['x-real-ip'] ||
    req.headers?.['cf-connecting-ip'];
  if (typeof realIp === 'string' && realIp.trim()) {
    return realIp.split(',')[0].trim();
  }
  const xff = req.headers?.['x-forwarded-for'];
  if (typeof xff === 'string' && xff.trim()) {
    const hops = xff.split(',').map((s: string) => s.trim()).filter(Boolean);
    return hops[hops.length - 1] || '127.0.0.1';
  }
  return req.socket?.remoteAddress || '127.0.0.1';
}

function maskIp(ip: string): string {
  if (ip.includes('.')) {
    const parts = ip.split('.');
    if (parts.length === 4) return `${parts[0]}.${parts[1]}.***.${parts[3]}`;
  }
  return ip;
}

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
  resolve: {
    preserveSymlinks: true,
  },
  define: {
    'import.meta.env.VITE_EDITION': JSON.stringify('web'),
  },
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(process.cwd(), 'index.html'),
        studio: path.resolve(process.cwd(), 'studio.html'),
      },
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'moovn-real-workspace-and-ai-proxy',
      configureServer(server) {
        ensureWorkspaceDirs();

        // 0. Per-IP Rate Limiter (/api/rate-limit)
        server.middlewares.use('/api/rate-limit', (req, res) => {
          const now = Date.now();
          const clientIp = getClientIp(req);
          const masked = maskIp(clientIp);
          const urlObj = new URL(req.url || '/api/rate-limit', 'http://localhost');
          const action =
            urlObj.searchParams.get('action') || (req.method === 'POST' ? 'download' : 'status');
          const target = urlObj.searchParams.get('target') || 'default';

          let record = ipRateStore.get(clientIp);
          if (
            !record ||
            (now - record.windowStart > RATE_WINDOW_MS && now > record.blockedUntil)
          ) {
            record = {
              windowStart: now,
              downloadHits: 0,
              checkHits: 0,
              blockedUntil: 0,
            };
          }

          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

          if (now < record.blockedUntil) {
            const retryAfterSec = Math.max(1, Math.ceil((record.blockedUntil - now) / 1000));
            res.statusCode = 429;
            res.end(
              JSON.stringify({
                ok: false,
                allowed: false,
                ipMasked: masked,
                action,
                downloadRemaining: 0,
                downloadLimit: MAX_DOWNLOADS_PER_IP,
                resetInSeconds: retryAfterSec,
                error: `当前 IP (${masked}) 请求过于频繁，请在 ${retryAfterSec} 秒后重试。`,
              })
            );
            return;
          }

          if (action === 'download') {
            record.downloadHits += 1;
            if (record.downloadHits > MAX_DOWNLOADS_PER_IP) {
              record.blockedUntil = now + RATE_WINDOW_MS;
              ipRateStore.set(clientIp, record);
              const retryAfterSec = Math.ceil(RATE_WINDOW_MS / 1000);
              res.statusCode = 429;
              res.end(
                JSON.stringify({
                  ok: false,
                  allowed: false,
                  ipMasked: masked,
                  action,
                  downloadRemaining: 0,
                  downloadLimit: MAX_DOWNLOADS_PER_IP,
                  resetInSeconds: retryAfterSec,
                  error: `当前 IP (${masked}) 在 10 分钟内下载次数已超过上限 (${MAX_DOWNLOADS_PER_IP} 次)。`,
                })
              );
              return;
            }
          } else {
            record.checkHits += 1;
          }

          ipRateStore.set(clientIp, record);
          const remaining = Math.max(0, MAX_DOWNLOADS_PER_IP - record.downloadHits);
          const resetInSeconds = Math.max(
            1,
            Math.ceil((record.windowStart + RATE_WINDOW_MS - now) / 1000)
          );

          res.statusCode = 200;
          res.end(
            JSON.stringify({
              ok: true,
              allowed: true,
              ipMasked: masked,
              action,
              target,
              downloadRemaining: remaining,
              downloadLimit: MAX_DOWNLOADS_PER_IP,
              resetInSeconds,
            })
          );
        });

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
