import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import fs from 'node:fs';
import path from 'node:path';
import {
  validateSafeWorkspaceWrite,
  validateSafeAiProxyEndpoint,
} from '../MooVN Studio/src/lib/devServerSecurity';

const WORKSPACE_ROOT = path.resolve(process.cwd(), 'MooVN_Workspace');
const STUDIO_PUBLIC_DIR = path.resolve(__dirname, '../MooVN Studio/public');
const MAX_AI_BODY_BYTES = 256 * 1024;
const MAX_FS_WRITE_BYTES = 8 * 1024 * 1024;
const AI_UPSTREAM_TIMEOUT_MS = 20_000;

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
}

function isSameOriginOrLocalRequest(req: any): boolean {
  const secFetchSite = req.headers?.['sec-fetch-site'];
  if (secFetchSite && secFetchSite !== 'same-origin' && secFetchSite !== 'none') {
    return false;
  }
  return true;
}

export default defineConfig({
  publicDir: fs.existsSync(STUDIO_PUBLIC_DIR) ? STUDIO_PUBLIC_DIR : 'public',
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

        server.middlewares.use('/api/moovn-fs', (req, res, next) => {
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          if (!isSameOriginOrLocalRequest(req)) {
            res.statusCode = 403;
            res.end(JSON.stringify({ ok: false, code: 'ERR_CSRF_BLOCKED', error: 'Cross-site request blocked.' }));
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
                res.end(JSON.stringify({ ok: false, code: 'ERR_FS_WRITE_FAILED', error: err?.message || 'write error' }));
              }
            });
            return;
          }

          next();
        });
      },
    },
  ],
  resolve: {
    alias: {
      react: path.resolve(__dirname, 'node_modules/react'),
      'react-dom': path.resolve(__dirname, 'node_modules/react-dom'),
      'lucide-react': path.resolve(__dirname, 'node_modules/lucide-react'),
      yaml: path.resolve(__dirname, 'node_modules/yaml'),
    },
  },
  server: {
    host: '0.0.0.0',
    allowedHosts: true,
    fs: {
      allow: ['..'],
    },
  },
});
