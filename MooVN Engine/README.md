# MooVN Engine (`v0.1.0-dev`)

Rust runtime and intermediate representation, using [GPL-3.0](../LICENSE) as its base license (see the existing exception and verification caveats in the root README). This is a development version, not a validated game runtime.

- The translator rewrites recognized `moovn.*` API calls; it is not a general-purpose compiler or code migration tool. The Rust and TypeScript implementations have known differences and must not be assumed equivalent.
- The former TypeScript binding used fabricated in-memory snapshots and has been removed. A real TypeScript binding is **not provided**. The C# binding currently exposes only limited save operations; it does not implement the full API dialect.
- The C++ component is an experimental software framebuffer/compositing bridge, not an implemented Vulkan or DirectX renderer.
- FNV-1a on engine save records is a non-cryptographic check for some accidental corruption, **not tamper protection**. Canonical representations are not yet interoperable across all clients.
- Live2D/Spine runtime integration is not provided.

`cargo test` runs the Rust tests. Check the source interfaces before integrating; API syntax recognized by the translator does not imply that a host-language binding exists.
