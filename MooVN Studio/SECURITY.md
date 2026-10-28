# MooVN Studio security boundaries and outstanding work

This is a description of the present implementation, not a security audit or a
promise that untrusted projects are safe to open or distribute.

## Local project files

The desktop workspace commands resolve an application-owned root, accept only
`Projects`, `Exports`, `Cache`, and `Assets`, validate a single file name and
extension, and check canonical directories and existing target symlinks. These
checks are not a proven defence against every filesystem race, junction, or
platform-specific behaviour. The browser filesystem proxy endpoints are not
registered.

Desktop project saves write a unique same-directory temporary file, flush it,
then rename it into place. If a previous project exists, the previous contents
are first copied through the same writer into a `.bak`; this is not an atomic
two-file transaction. The Rust Engine has a separate save implementation. Crash
recovery and replacement behaviour, particularly on Windows, still require
platform tests; failed operations must be reported to the user. Engine save,
backup and delete failures now return errors without updating in-memory slots;
this does not prove cross-process race resistance or backup durability.

`.mpvn` is a JSON project package with size, dangerous-key and shape checks on
its parsing path. New version 2 envelopes carry an unkeyed SHA-256 checksum of
the JSON payload: it detects accidental changes but anyone can recompute or
remove it. Legacy project files have no checksum and are opened with a warning.
New `.msvn` chapter envelopes use the same unkeyed SHA-256 check over metadata
and compressed nodes. The chapter parser returns `legacy-unchecked` for older
packages; no UI or HTML runtime currently loads them. Neither format authenticates
the author or prevents deliberate tampering.
The Rust Engine's save-slot FNV check detects some corruption only: anyone who
changes a save can recompute it. The TypeScript v2 helper is not wired into the
Studio preview or standalone HTML save paths, which currently have no save-slot
checksum. Rust and TypeScript v2 canonicalization do not match for all inputs,
and no cross-language v3 has been established.

## CSP and HTML exports

The configured desktop CSP restricts script sources, disallows objects and
limits `connect-src` to the origins in `ai-endpoints.json`; inline CSS is still
permitted. The CSP is generated from that allowlist at build time. It has not
been verified against all desktop targets, providers or redirects.

The standalone HTML generator escapes project JSON before embedding it in a
script element, validates interpolated CSS colors/numbers, and uses DOM text
nodes for dialogue, choices, save-slot summaries and backlog entries. It rejects
known unsupported project capabilities rather than silently omitting them.
This does not make arbitrary media, project files, or exported games formally
security-audited. Import and runtime paths still need adversarial testing.

## AI requests and credentials

The AI UI keeps newly entered API keys in the current application session's
memory rather than writing them to project files or browser `localStorage`.
Requests use an `Authorization` header, an allowlisted endpoint and reject
redirects. Requests run in the renderer/browser, not a trusted native proxy;
provider CORS or desktop CSP can prevent them. An OS keychain integration and
native AI proxy are **not implemented**. Session memory is not protection from
other code executing in the same renderer; do not use untrusted content there.
