export const ALLOWED_WORKSPACE_SUBFOLDERS = new Set([
  'Projects',
  'Exports',
  'Cache',
  'Assets',
]);

export const ALLOWED_WRITE_EXTENSIONS = new Set([
  '.json',
  '.mpvn',
  '.msvn',
  '.yaml',
  '.yml',
  '.ts',
  '.js',
  '.cs',
  '.cpp',
  '.rs',
  '.html',
  '.txt',
]);

export const ALLOWED_AI_UPSTREAM_HOSTS = new Set([
  'api.openai.com',
  'api.deepseek.com',
  'api.anthropic.com',
  'generativelanguage.googleapis.com',
  'openrouter.ai',
  'api.siliconflow.cn',
  'dashscope.aliyuncs.com',
]);

export interface SafeWriteValidationResult {
  ok: boolean;
  targetDir?: string;
  fullPath?: string;
  code?: string;
  error?: string;
}

/**
 * Validates a workspace write request and blocks path traversal (`..`), `customDir` overrides,
 * unapproved subdirectories, and unapproved file extensions (`GPT-02` / `Kimi 1A`).
 */
export function validateSafeWorkspaceWrite(
  workspaceRoot: string,
  subFolder: unknown,
  rawFileName: unknown,
  customDir?: unknown
): SafeWriteValidationResult {
  if (customDir !== undefined && customDir !== null && customDir !== '') {
    return {
      ok: false,
      code: 'ERR_CUSTOM_DIR_FORBIDDEN',
      error: 'Custom directory overrides are forbidden for security reasons.',
    };
  }

  const folder = typeof subFolder === 'string' && subFolder.trim() ? subFolder.trim() : 'Projects';
  if (!ALLOWED_WORKSPACE_SUBFOLDERS.has(folder)) {
    return {
      ok: false,
      code: 'ERR_SUBFOLDER_NOT_ALLOWED',
      error: `Subfolder '${folder}' is not in the allowed workspace directories.`,
    };
  }

  const name = typeof rawFileName === 'string' ? rawFileName.trim() : '';
  if (
    !name ||
    name.includes('..') ||
    name.includes('/') ||
    name.includes('\\') ||
    name.includes(':') ||
    name.includes('\0') ||
    name.startsWith('.')
  ) {
    return {
      ok: false,
      code: 'ERR_PATH_TRAVERSAL_REJECTED',
      error: 'Invalid file name: path traversal or directory separators are forbidden.',
    };
  }

  const lastDotIdx = name.lastIndexOf('.');
  const ext = lastDotIdx >= 0 ? name.slice(lastDotIdx).toLowerCase() : '';
  if (!ALLOWED_WRITE_EXTENSIONS.has(ext)) {
    return {
      ok: false,
      code: 'ERR_EXTENSION_NOT_ALLOWED',
      error: `File extension '${ext || '(none)'}' is not permitted.`,
    };
  }

  const cleanRoot = String(workspaceRoot || '/tmp').replace(/[\\/]+$/, '');
  const sep = cleanRoot.includes('\\') ? '\\' : '/';
  const targetDir = `${cleanRoot}${sep}${folder}`;
  const fullPath = `${targetDir}${sep}${name}`;

  return {
    ok: true,
    targetDir,
    fullPath,
  };
}

export interface SafeAiEndpointValidationResult {
  ok: boolean;
  normalizedUrl?: string;
  code?: string;
  error?: string;
}

function isPrivateOrLoopbackHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (
    h === 'localhost' ||
    h === '127.0.0.1' ||
    h === '0.0.0.0' ||
    h === '[::1]' ||
    h === '::1' ||
    h.endsWith('.local') ||
    h.endsWith('.internal')
  ) {
    return true;
  }
  if (/^10\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h) || /^127\./.test(h)) {
    return true;
  }
  const m172 = h.match(/^172\.(\d+)\./);
  if (m172) {
    const second = Number(m172[1]);
    if (second >= 16 && second <= 31) return true;
  }
  return false;
}

/**
 * Validates an AI upstream URL against SSRF (`GPT-03` / `Kimi 1B`):
 * - Only allows known HTTPS AI provider hosts, or `http://127.0.0.1:11434` / `http://localhost:11434`
 *   specifically when `providerType === 'ollama_local'`.
 * - Blocks arbitrary internal/private network addresses and query-string credentials.
 */
export function validateSafeAiProxyEndpoint(
  providerType: string,
  rawEndpoint: unknown
): SafeAiEndpointValidationResult {
  if (typeof rawEndpoint !== 'string' || !rawEndpoint.trim()) {
    return {
      ok: false,
      code: 'ERR_EMPTY_ENDPOINT',
      error: 'Endpoint URL is required.',
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(rawEndpoint.trim());
  } catch {
    return {
      ok: false,
      code: 'ERR_INVALID_URL',
      error: 'Endpoint is not a valid URL.',
    };
  }

  if (parsed.username || parsed.password) {
    return {
      ok: false,
      code: 'ERR_URL_CREDENTIALS_FORBIDDEN',
      error: 'Credentials in URL are forbidden.',
    };
  }

  const host = parsed.hostname.toLowerCase();

  if (providerType === 'ollama_local') {
    const isLocalOllama =
      (host === '127.0.0.1' || host === 'localhost') &&
      (parsed.port === '11434' || parsed.port === '') &&
      (parsed.protocol === 'http:' || parsed.protocol === 'https:');
    if (!isLocalOllama) {
      return {
        ok: false,
        code: 'ERR_OLLAMA_HOST_RESTRICTED',
        error: 'Local Ollama proxy only permits 127.0.0.1:11434 or localhost:11434.',
      };
    }
    return { ok: true, normalizedUrl: parsed.toString() };
  }

  if (parsed.protocol !== 'https:') {
    return {
      ok: false,
      code: 'ERR_HTTPS_REQUIRED',
      error: 'External AI provider endpoint must use HTTPS.',
    };
  }

  if (isPrivateOrLoopbackHost(host)) {
    return {
      ok: false,
      code: 'ERR_SSRF_PRIVATE_HOST_BLOCKED',
      error: 'Requests to private, loopback, or link-local addresses are blocked.',
    };
  }

  if (!ALLOWED_AI_UPSTREAM_HOSTS.has(host)) {
    return {
      ok: false,
      code: 'ERR_UPSTREAM_HOST_NOT_ALLOWED',
      error: `Upstream host '${host}' is not in the approved AI provider allowlist.`,
    };
  }

  return { ok: true, normalizedUrl: parsed.toString() };
}

export interface SameOriginValidationResult {
  ok: boolean;
  code?: string;
  error?: string;
}

/**
 * Validates that a dev-server mutation request (`/api/moovn-fs/write`, `/api/ai/chat`)
 * originates from the same origin or local loopback (`GPT-02`, `GPT-03`, `CL-02`, `CL-03`),
 * rejecting cross-site CSRF requests from untrusted pages.
 */
export function validateSameOriginDevRequest(
  headers: Record<string, string | string[] | undefined> | undefined
): SameOriginValidationResult {
  if (!headers) {
    return { ok: true };
  }

  const secFetchSiteRaw = headers['sec-fetch-site'];
  const secFetchSite = Array.isArray(secFetchSiteRaw) ? secFetchSiteRaw[0] : secFetchSiteRaw;
  if (
    secFetchSite &&
    secFetchSite !== 'same-origin' &&
    secFetchSite !== 'same-site' &&
    secFetchSite !== 'none'
  ) {
    return {
      ok: false,
      code: 'ERR_CSRF_SEC_FETCH_SITE',
      error: `Cross-site request blocked (Sec-Fetch-Site: ${secFetchSite}).`,
    };
  }

  const hostRaw = headers['host'];
  const hostHeader = (Array.isArray(hostRaw) ? hostRaw[0] : hostRaw || '').toLowerCase();
  const hostHostname = hostHeader.split(':')[0];

  const checkOriginUrl = (rawUrl: string, label: string): SameOriginValidationResult => {
    try {
      const parsed = new URL(rawUrl);
      const originHost = parsed.host.toLowerCase();
      const originHostname = parsed.hostname.toLowerCase();
      const isLoopback =
        originHostname === 'localhost' ||
        originHostname === '127.0.0.1' ||
        originHostname === '[::1]' ||
        originHostname.endsWith('.e2b.app');
      if (isLoopback) {
        return { ok: true };
      }
      if (hostHeader && (originHost === hostHeader || originHostname === hostHostname)) {
        return { ok: true };
      }
      return {
        ok: false,
        code: 'ERR_CSRF_CROSS_ORIGIN',
        error: `Cross-origin request blocked (${label}: ${parsed.origin}).`,
      };
    } catch {
      return {
        ok: false,
        code: 'ERR_CSRF_INVALID_ORIGIN',
        error: `Invalid ${label} header.`,
      };
    }
  };

  const originRaw = headers['origin'];
  const origin = Array.isArray(originRaw) ? originRaw[0] : originRaw;
  if (origin && origin !== 'null') {
    const res = checkOriginUrl(origin, 'Origin');
    if (!res.ok) return res;
  }

  const refererRaw = headers['referer'];
  const referer = Array.isArray(refererRaw) ? refererRaw[0] : refererRaw;
  if (referer) {
    const res = checkOriginUrl(referer, 'Referer');
    if (!res.ok) return res;
  }

  return { ok: true };
}

