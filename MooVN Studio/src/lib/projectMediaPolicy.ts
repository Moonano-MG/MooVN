import { BACKGROUND_ASSETS, CHARACTER_ASSETS } from '../data/assets.ts';

// Remote references can occur in older projects. They are data, not permission
// to contact the author or the host. Only bundled paths, embedded media and
// content-addressed workspace assets can be displayed without user consent.
const BUNDLED_PATHS = new Set([...BACKGROUND_ASSETS, ...CHARACTER_ASSETS].map((asset) => asset.path));
const WORKSPACE_REFERENCE = /^moovn-asset:\/\/[a-f0-9]{64}\.(?:png|jpe?g|gif|webp|apng|mp4|webm|mov|ogv)$/;
const EMBEDDED_MEDIA = /^data:(?:image\/(?:png|jpeg|gif|webp|apng)|video\/(?:mp4|webm|quicktime|ogg));base64,/i;
const MAX_REMOTE_URL_LENGTH = 4096;
export const MAX_REMOTE_MEDIA_BYTES = 100 * 1024 * 1024;

export type ProjectMediaReference =
  | { kind: 'empty' | 'bundled' | 'embedded' | 'workspace'; source: string }
  | { kind: 'remote'; source: string; display: string; insecure: boolean }
  | { kind: 'invalid'; source: string; reason: string };

export function isBundledMediaPath(source: string): boolean {
  return BUNDLED_PATHS.has(source);
}

/** Classify before assigning a project-controlled value to img, video or fetch. */
export function classifyProjectMedia(source: string): ProjectMediaReference {
  if (!source) return { kind: 'empty', source };
  if (isBundledMediaPath(source)) return { kind: 'bundled', source };
  if (WORKSPACE_REFERENCE.test(source)) return { kind: 'workspace', source };
  if (EMBEDDED_MEDIA.test(source)) return { kind: 'embedded', source };
  if (/^https?:\/\//i.test(source)) {
    if (source.length > MAX_REMOTE_URL_LENGTH || /[\u0000-\u0020\u007f]/.test(source)) {
      return { kind: 'invalid', source, reason: '远程地址过长或含有空白/控制字符' };
    }
    try {
      const url = new URL(source);
      if (!url.hostname || url.username || url.password || !['http:', 'https:'].includes(url.protocol)) {
        return { kind: 'invalid', source, reason: '远程地址无效或包含用户名/密码' };
      }
      // Hide signed query strings and fragments in the default summary; the
      // user can explicitly reveal the complete address before consenting.
      const display = `${url.origin}${url.pathname}${url.search ? '（含查询参数，已隐藏）' : ''}`;
      return { kind: 'remote', source, display, insecure: url.protocol === 'http:' };
    } catch {
      return { kind: 'invalid', source, reason: '远程地址无效' };
    }
  }
  return { kind: 'invalid', source, reason: '仅允许内置、内嵌或已导入的本地素材；未知路径和临时地址不可直接加载' };
}

const ALLOWED_REMOTE_MIME = new Set([
  'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/apng',
  'video/mp4', 'video/webm', 'video/quicktime', 'video/ogg',
]);

async function rejectResponse(response: Response, message: string): Promise<never> {
  if (response.body) {
    try {
      await response.body.cancel();
    } catch (error: unknown) {
      throw new Error(`${message}；停止接收失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }
  throw new Error(message);
}

/**
 * Called only after the user consents to this exact set of remote addresses.
 * Fetch into a bounded blob rather than putting an untrusted URL in the DOM:
 * no cookies/referrer or redirects, rejects SVG/HTML MIME types, and does not
 * put a remote URL in the DOM for an implicit later fetch.
 * A cross-origin server must opt into CORS; desktop CSP may also block it.
 */
export async function fetchConsentedProjectMedia(
  source: string,
  signal: AbortSignal,
  remainingBytes = MAX_REMOTE_MEDIA_BYTES,
): Promise<Blob> {
  if (classifyProjectMedia(source).kind !== 'remote') {
    throw new Error('ERR_REMOTE_MEDIA_URL: 远程素材地址无效');
  }
  if (!Number.isSafeInteger(remainingBytes) || remainingBytes < 1 || remainingBytes > MAX_REMOTE_MEDIA_BYTES) {
    throw new Error('ERR_REMOTE_MEDIA_SIZE: 本次远程素材已超过 100 MiB 总限制');
  }
  let response: Response;
  try {
    response = await fetch(source, {
      method: 'GET', mode: 'cors', credentials: 'omit', redirect: 'error',
      referrerPolicy: 'no-referrer', cache: 'no-store', signal,
    });
  } catch (error: unknown) {
    if (signal.aborted) throw error;
    throw new Error('ERR_REMOTE_MEDIA_REQUEST: 请求失败、发生重定向，或被跨域/本机安全策略阻止；可先下载并导入本地素材');
  }
  if (!response.ok) await rejectResponse(response, `ERR_REMOTE_MEDIA_HTTP: 远程站点返回 ${response.status}`);
  const mime = (response.headers.get('content-type') || '').split(';', 1)[0].trim().toLowerCase();
  if (!ALLOWED_REMOTE_MIME.has(mime)) {
    await rejectResponse(response, 'ERR_REMOTE_MEDIA_TYPE: 远程响应不是受支持的图片或视频格式');
  }
  const length = response.headers.get('content-length');
  if (length && /^\d+$/.test(length) && Number(length) > remainingBytes) {
    await rejectResponse(response, 'ERR_REMOTE_MEDIA_SIZE: 本次远程素材超过 100 MiB 总限制');
  }
  if (!response.body) throw new Error('ERR_REMOTE_MEDIA_STREAM: 当前环境无法安全地读取远程媒体');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > remainingBytes) throw new Error('ERR_REMOTE_MEDIA_SIZE: 本次远程素材超过 100 MiB 总限制');
      chunks.push(value);
    }
  } catch (error: unknown) {
    try {
      await reader.cancel();
    } catch (cancelError: unknown) {
      throw new Error(`${error instanceof Error ? error.message : String(error)}；停止读取失败：${cancelError instanceof Error ? cancelError.message : String(cancelError)}`);
    }
    throw error;
  } finally {
    reader.releaseLock();
  }
  if (!received) throw new Error('ERR_REMOTE_MEDIA_EMPTY: 远程媒体为空');
  return new Blob(chunks, { type: mime });
}
