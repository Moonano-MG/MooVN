# MooVN Studio Security Architecture & Boundaries (`SECURITY.md`)

## 1. Local File System Confinement & Atomic Persistence (`GPT-01`, `GPT-02`, `GPT-04`)

- **Workspace Confinement**: Both the Tauri v2 desktop backend (`src-tauri/src/lib.rs`) and the Vite development middleware (`src/lib/devServerSecurity.ts`) restrict all file read/write operations to approved subdirectories (`Projects`, `Exports`, `Cache`, `Assets`) inside the canonical `MooVN_Workspace` directory.
- **Path Traversal & Extension Guards**: File names containing `..`, path separators (`/`, `\`), drive colons (`:`), null bytes, or unapproved extensions are rejected with explicit `ERR_*` error codes before touching the file system. Arbitrary `customDir` overrides from browser requests are forbidden.
- **Atomic File Writes**: Project saves (`save_project_json`) and engine save slots (`SaveManager`) write to a process-scoped temporary file, invoke `sync_all()` (`fsync`), rotate the previous file to `.bak`, and atomically rename the temporary file into place.

## 2. Content Security Policy (CSP) & XSS Prevention (`GPT-04`, `Kimi 1C`)

- **Tauri Desktop CSP**: `src-tauri/tauri.conf.json` enforces a strict Content Security Policy (`default-src 'self'`, `script-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`) instead of `csp: null`.
- **HTML Export Escaping**: `src/lib/gamePackager.ts` escapes all script, dialogue, speaker, and choice strings (`escapeHtmlText`, `escapeJsonForHtmlScript`) and renders runtime text via `textContent` / DOM nodes rather than unescaped `innerHTML`.
- **`.mpvn` Deserialization Hardening**: `src/lib/mpvnFormat.ts` enforces a 16 MB payload ceiling, strips `__proto__` / `constructor` / `prototype` keys during JSON parsing, and validates schema fields before loading a project.

## 3. AI Proxy SSRF, CSRF & Session-Only API Keys (`GPT-03`, `Kimi 1B`)

- **Session-Only API Keys**: User API keys entered in `AiAssistantPanel` are held strictly in volatile session memory (`inMemorySessionApiKey`) and are never written to `localStorage` or project `.mpvn` files.
- **Header-Only Authentication**: API credentials are transmitted via HTTP request headers (`Authorization`, `x-api-key`, `x-goog-api-key`) and never appended to URL query strings.
- **SSRF & Same-Origin Enforcement**: `/api/ai/chat` validates `Origin`, `Referer`, and `Sec-Fetch-Site` headers against cross-origin CSRF requests, blocks private/loopback/link-local IP ranges, and restricts outbound requests to the approved HTTPS AI provider allowlist (plus `127.0.0.1:11434` solely when `providerType === 'ollama_local'`).
