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

/** Strict legacy same-origin check. No privileged dev-server endpoint is enabled by default. */
export function validateSameOriginDevRequest(
  headers: Record<string, string | string[] | undefined> | undefined
): SameOriginValidationResult {
  const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;
  const host = first(headers?.host)?.toLowerCase();
  const origin = first(headers?.origin);
  const site = first(headers?.['sec-fetch-site']);
  if (!host || !origin || origin === 'null') {
    return { ok: false, code: 'ERR_CSRF_MISSING_ORIGIN', error: 'A Host and Origin are required.' };
  }
  if (site && site !== 'same-origin') {
    return { ok: false, code: 'ERR_CSRF_SEC_FETCH_SITE', error: 'Cross-site request blocked.' };
  }
  try {
    // Vite's default local development server uses HTTP; do not infer TLS from client headers.
    const expected = new URL(`http://${host}`).origin;
    if (new URL(origin).origin !== expected) {
      return { ok: false, code: 'ERR_CSRF_CROSS_ORIGIN', error: 'Origin does not match the server.' };
    }
    const referer = first(headers?.referer);
    if (referer && new URL(referer).origin !== expected) {
      return { ok: false, code: 'ERR_CSRF_CROSS_ORIGIN', error: 'Referer does not match the server.' };
    }
    return { ok: true };
  } catch {
    return { ok: false, code: 'ERR_CSRF_INVALID_ORIGIN', error: 'Invalid origin or host.' };
  }
}
