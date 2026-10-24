// Serverless Function: Download Request Rate Limiter (/api/rate-limit)

const WINDOW_MS = 10 * 60 * 1000;
const MAX_DOWNLOADS_PER_IP = 6;
const MAX_CHECKS_PER_IP = 60;

const ipStore = globalThis.__MOOVN_IP_RATE_STORE__ || new Map();
globalThis.__MOOVN_IP_RATE_STORE__ = ipStore;

function getClientIp(req) {
  // Prefer edge-verified headers over client-appendable X-Forwarded-For prefix
  const vercelIp = req.headers['x-vercel-forwarded-for'] || req.headers['x-real-ip'] || req.headers['cf-connecting-ip'];
  if (typeof vercelIp === 'string' && vercelIp.trim().length > 0) {
    const parts = vercelIp.split(',');
    return parts[parts.length - 1].trim();
  }
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.trim().length > 0) {
    const parts = xff.split(',');
    return parts[parts.length - 1].trim();
  }
  if (Array.isArray(xff) && xff.length > 0) {
    return String(xff[xff.length - 1]).trim();
  }
  return req.socket?.remoteAddress || '127.0.0.1';
}

function maskIp(ip) {
  if (!ip) return 'unknown';
  if (ip.includes('.')) {
    const parts = ip.split('.');
    if (parts.length === 4) {
      return `${parts[0]}.${parts[1]}.***.${parts[3]}`;
    }
  }
  if (ip.includes(':')) {
    const parts = ip.split(':').filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0]}:***:${parts[parts.length - 1]}`;
    }
  }
  return ip;
}

export default function handler(req, res) {
  const now = Date.now();

  if (ipStore.size > 2000) {
    for (const [k, v] of ipStore.entries()) {
      if (now - v.windowStart > WINDOW_MS && now > v.blockedUntil) {
        ipStore.delete(k);
      }
    }
  }

  const clientIp = getClientIp(req);
  const masked = maskIp(clientIp);

  const urlObj = new URL(req.url || '/api/rate-limit', 'http://localhost');
  const action = urlObj.searchParams.get('action') || (req.method === 'POST' ? 'download' : 'status');
  const target = urlObj.searchParams.get('target') || 'default';

  let record = ipStore.get(clientIp);
  if (!record || (now - record.windowStart > WINDOW_MS && now > record.blockedUntil)) {
    record = {
      windowStart: now,
      downloadHits: 0,
      checkHits: 0,
      blockedUntil: 0,
      lastTarget: '',
    };
  }

  if (now < record.blockedUntil) {
    const retryAfterSec = Math.max(1, Math.ceil((record.blockedUntil - now) / 1000));
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Retry-After', String(retryAfterSec));
    res.setHeader('X-RateLimit-Limit', String(MAX_DOWNLOADS_PER_IP));
    res.setHeader('X-RateLimit-Remaining', '0');
    res.setHeader('X-RateLimit-Reset', String(retryAfterSec));
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
        error: `请求较为频繁，请在 ${retryAfterSec} 秒后重试。`,
      })
    );
    return;
  }

  if (action === 'download') {
    record.downloadHits += 1;
    record.lastTarget = target;
    if (record.downloadHits > MAX_DOWNLOADS_PER_IP) {
      record.blockedUntil = now + WINDOW_MS;
      ipStore.set(clientIp, record);
      const retryAfterSec = Math.ceil(WINDOW_MS / 1000);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.setHeader('Retry-After', String(retryAfterSec));
      res.setHeader('X-RateLimit-Limit', String(MAX_DOWNLOADS_PER_IP));
      res.setHeader('X-RateLimit-Remaining', '0');
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
          error: `短时间内下载请求次数较多，请稍后再试。`,
        })
      );
      return;
    }
  } else {
    record.checkHits += 1;
    if (record.checkHits > MAX_CHECKS_PER_IP) {
      record.blockedUntil = now + 5 * 60 * 1000;
      ipStore.set(clientIp, record);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.statusCode = 429;
      res.end(
        JSON.stringify({
          ok: false,
          allowed: false,
          ipMasked: masked,
          action,
          downloadRemaining: 0,
          downloadLimit: MAX_DOWNLOADS_PER_IP,
          resetInSeconds: 300,
          error: `请求频率过高，请稍后再试。`,
        })
      );
      return;
    }
  }

  ipStore.set(clientIp, record);

  const remaining = Math.max(0, MAX_DOWNLOADS_PER_IP - record.downloadHits);
  const resetInSeconds = Math.max(1, Math.ceil((record.windowStart + WINDOW_MS - now) / 1000));

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('X-RateLimit-Limit', String(MAX_DOWNLOADS_PER_IP));
  res.setHeader('X-RateLimit-Remaining', String(remaining));
  res.setHeader('X-RateLimit-Reset', String(resetInSeconds));

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
}
