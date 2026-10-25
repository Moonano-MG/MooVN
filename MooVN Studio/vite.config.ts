import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import fs from 'node:fs';
import path from 'node:path';
import {
  validateSafeWorkspaceWrite,
  validateSafeAiProxyEndpoint,
} from './src/lib/devServerSecurity';

const WORKSPACE_ROOT = path.resolve(process.cwd(), 'MooVN_Workspace');
const MAX_AI_BODY_BYTES = 256 * 1024; // 256 KiB
const MAX_FS_WRITE_BYTES = 8 * 1024 * 1024; // 8 MiB
const AI_UPSTREAM_TIMEOUT_MS = 20_000;

function ensureWorkspaceDirs() {
  const subdirs = ['Projects', 'Exports', 'Cache', 'Assets'];
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
        showStreamMonitorInPreview: false,
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

function isSameOriginOrLocalRequest(req: any): boolean {
  const secFetchSite = req.headers?.['sec-fetch-site'];
  if (secFetchSite && secFetchSite !== 'same-origin' && secFetchSite !== 'none') {
    return false;
  }
  return true;
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

        // 1. Hardened AI API Proxy (SSRF allowlist + timeout + header-only auth)
        server.middlewares.use('/api/ai/chat', (req, res, next) => {
          if (req.method !== 'POST') {
            next();
            return;
          }
          if (!isSameOriginOrLocalRequest(req)) {
            res.statusCode = 403;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ ok: false, code: 'ERR_CSRF_BLOCKED', error: 'Cross-site request blocked.' }));
            return;
          }

          let rawBody = '';
          let aborted = false;
          req.on('data', (chunk) => {
            rawBody += chunk;
            if (Buffer.byteLength(rawBody, 'utf-8') > MAX_AI_BODY_BYTES) {
              aborted = true;
              res.statusCode = 413;
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.end(JSON.stringify({ ok: false, code: 'ERR_PAYLOAD_TOO_LARGE', error: 'AI request payload exceeds 256KB.' }));
              req.destroy();
            }
          });

          req.on('end', async () => {
            if (aborted) return;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            try {
              const payload = JSON.parse(rawBody || '{}');
              const {
                providerType = 'openai_compatible',
                endpoint,
                apiKey,
                model,
                systemPrompt,
                messages,
              } = payload;

              const validation = validateSafeAiProxyEndpoint(String(providerType), endpoint);
              if (!validation.ok || !validation.normalizedUrl) {
                res.statusCode = 400;
                res.end(
                  JSON.stringify({
                    ok: false,
                    code: validation.code || 'ERR_INVALID_ENDPOINT',
                    error: validation.error || 'Endpoint rejected by SSRF policy.',
                  })
                );
                return;
              }

              const startMs = Date.now();
              let fetchUrl = validation.normalizedUrl;
              const headers: Record<string, string> = {
                'Content-Type': 'application/json',
              };
              let bodyObj: Record<string, unknown> = {};

              if (providerType === 'google_studio' || providerType === 'gemini') {
                const base = fetchUrl.replace(/\/$/, '');
                const safeModel = encodeURIComponent(String(model || 'gemini-2.5-flash'));
                fetchUrl = `${base}/${safeModel}:generateContent`;
                if (apiKey) {
                  // Never put API key in URL query string
                  headers['x-goog-api-key'] = String(apiKey);
                }
                bodyObj = {
                  systemInstruction: systemPrompt
                    ? { parts: [{ text: String(systemPrompt) }] }
                    : undefined,
                  contents: (Array.isArray(messages) ? messages : []).map((m: any) => ({
                    role: m.role === 'assistant' ? 'model' : 'user',
                    parts: [{ text: String(m.content || '') }],
                  })),
                };
              } else if (providerType === 'anthropic_claude' || providerType === 'anthropic') {
                if (apiKey) {
                  headers['x-api-key'] = String(apiKey);
                }
                headers['anthropic-version'] = '2023-06-01';
                bodyObj = {
                  model: model || 'claude-3-5-sonnet-latest',
                  max_tokens: 2048,
                  system: systemPrompt,
                  messages: (Array.isArray(messages) ? messages : []).map((m: any) => ({
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
                    ...(Array.isArray(messages) ? messages : []),
                  ],
                };
              } else {
                if (apiKey) {
                  headers['Authorization'] = `Bearer ${String(apiKey)}`;
                }
                bodyObj = {
                  model: model || 'gpt-4o-mini',
                  messages: [
                    ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
                    ...(Array.isArray(messages) ? messages : []),
                  ],
                  temperature: 0.4,
                };
              }

              const controller = new AbortController();
              const timer = setTimeout(() => controller.abort(), AI_UPSTREAM_TIMEOUT_MS);

              let upstream: Response;
              try {
                upstream = await fetch(fetchUrl, {
                  method: 'POST',
                  headers,
                  body: JSON.stringify(bodyObj),
                  redirect: 'error',
                  signal: controller.signal,
                });
              } finally {
                clearTimeout(timer);
              }

              const text = await upstream.text();
              const latencyMs = Date.now() - startMs;

              if (!upstream.ok) {
                res.statusCode = upstream.status;
                res.end(
                  JSON.stringify({
                    ok: false,
                    code: `ERR_UPSTREAM_HTTP_${upstream.status}`,
                    status: upstream.status,
                    latencyMs,
                    error: `上游接口返回 HTTP ${upstream.status}: ${text.slice(0, 240)}`,
                  })
                );
                return;
              }

              const data = JSON.parse(text);
              let replyText = '';
              if (providerType === 'google_studio' || providerType === 'gemini') {
                replyText =
                  data?.candidates?.[0]?.content?.parts
                    ?.map((p: any) => p.text || '')
                    .join('') || '';
              } else if (providerType === 'anthropic_claude' || providerType === 'anthropic') {
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
                  code: err?.name === 'AbortError' ? 'ERR_UPSTREAM_TIMEOUT' : 'ERR_PROXY_FAILED',
                  error:
                    err?.name === 'AbortError'
                      ? '上游模型响应超时（20s），请检查网络连接。'
                      : err?.message || '请求模型接口失败。',
                })
              );
            }
          });
        });

        // 2. Hardened Workspace File System Middleware (/api/moovn-fs)
        server.middlewares.use('/api/moovn-fs', (req, res, next) => {
          res.setHeader('Content-Type', 'application/json; charset=utf-8');

          if (!isSameOriginOrLocalRequest(req)) {
            res.statusCode = 403;
            res.end(JSON.stringify({ ok: false, code: 'ERR_CSRF_BLOCKED', error: 'Cross-site request blocked.' }));
            return;
          }

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
                settingsFile: path.join(WORKSPACE_ROOT, 'settings.moovn.json'),
                rootFiles: listDir(WORKSPACE_ROOT),
                projectFiles: listDir(path.join(WORKSPACE_ROOT, 'Projects')),
                exportFiles: listDir(path.join(WORKSPACE_ROOT, 'Exports')),
              })
            );
            return;
          }

          if (req.method === 'POST' && req.url?.startsWith('/write')) {
            let body = '';
            let aborted = false;
            req.on('data', (chunk) => {
              body += chunk;
              if (Buffer.byteLength(body, 'utf-8') > MAX_FS_WRITE_BYTES) {
                aborted = true;
                res.statusCode = 413;
                res.end(JSON.stringify({ ok: false, code: 'ERR_PAYLOAD_TOO_LARGE', error: 'Write payload exceeds 8MB limit.' }));
                req.destroy();
              }
            });
            req.on('end', () => {
              if (aborted) return;
              try {
                ensureWorkspaceDirs();
                const parsed = JSON.parse(body || '{}');
                const validation = validateSafeWorkspaceWrite(
                  WORKSPACE_ROOT,
                  parsed.subFolder || 'Projects',
                  parsed.fileName || 'project.moovn.json',
                  parsed.customDir
                );

                if (!validation.ok || !validation.fullPath || !validation.targetDir) {
                  res.statusCode = 403;
                  res.end(
                    JSON.stringify({
                      ok: false,
                      code: validation.code || 'ERR_WRITE_DENIED',
                      error: validation.error || 'Unsafe file write rejected.',
                    })
                  );
                  return;
                }

                const content =
                  typeof parsed.content === 'string'
                    ? parsed.content
                    : JSON.stringify(parsed.content, null, 2);

                if (!fs.existsSync(validation.targetDir)) {
                  fs.mkdirSync(validation.targetDir, { recursive: true });
                }

                // Atomic write: temp -> fsync -> rename
                const tmpPath = `${validation.fullPath}.tmp.${process.pid}`;
                const fd = fs.openSync(tmpPath, 'w');
                try {
                  fs.writeFileSync(fd, content, 'utf-8');
                  fs.fsyncSync(fd);
                } finally {
                  fs.closeSync(fd);
                }
                fs.renameSync(tmpPath, validation.fullPath);

                res.end(
                  JSON.stringify({
                    ok: true,
                    savedPath: validation.fullPath,
                    bytes: Buffer.byteLength(content, 'utf-8'),
                  })
                );
              } catch (err: any) {
                res.statusCode = 500;
                res.end(
                  JSON.stringify({
                    ok: false,
                    code: 'ERR_FS_WRITE_FAILED',
                    error: err?.message || 'write error',
                  })
                );
              }
            });
            return;
          }

          if (req.method === 'GET' && req.url?.startsWith('/download-export')) {
            const urlObj = new URL(req.url, 'http://localhost');
            const rawName = urlObj.searchParams.get('file') || 'MooVN-Export.html';
            const validation = validateSafeWorkspaceWrite(WORKSPACE_ROOT, 'Exports', rawName);
            if (!validation.ok || !validation.fullPath || !fs.existsSync(validation.fullPath)) {
              res.statusCode = 404;
              res.end(JSON.stringify({ ok: false, code: 'ERR_EXPORT_NOT_FOUND', error: 'Export file not found.' }));
              return;
            }
            const stat = fs.statSync(validation.fullPath);
            res.setHeader('Content-Type', 'application/octet-stream');
            res.setHeader(
              'Content-Disposition',
              `attachment; filename="${path.basename(validation.fullPath)}"`
            );
            res.setHeader('Content-Length', String(stat.size));
            fs.createReadStream(validation.fullPath).pipe(res);
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
