import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import fs from 'node:fs';
import path from 'node:path';

const STUDIO_PUBLIC_DIR = path.resolve(__dirname, '../MooVN Studio/public');
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


export default defineConfig({
  publicDir: fs.existsSync(STUDIO_PUBLIC_DIR) ? STUDIO_PUBLIC_DIR : 'public',
  define: { 'import.meta.env.VITE_EDITION': JSON.stringify('web') },
  build: {
    rollupOptions: { input: {
      main: path.resolve(process.cwd(), 'index.html'),
      studio: path.resolve(process.cwd(), 'studio.html'),
    } },
  },
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'moovn-development-rate-limit',
      configureServer(server) {
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
  server: { host: '127.0.0.1', allowedHosts: [], fs: { allow: ['..'] } },
});
