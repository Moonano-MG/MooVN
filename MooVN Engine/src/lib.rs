//! # MooVN Engine (Rust Core)
//!
//! 视觉小说核心引擎，提供：
//! 1. **多语言快速 API 翻译层 (`translator`)**：
//!    通过语法归一化与 AST/词法翻译技术，将 JavaScript/TypeScript、C++、C#、Rust 的快速视觉小说指令
//!    （例如 JS/TS/C# `moovn.save:create(NAME)`、C++/Rust `moovn::save::create(NAME)`）
//!    统一编译为中间字节码指令 `EngineOp`。
//! 2. **存档与世界状态管理 (`save`, `runtime`)**：
//!    支持多槽位存档创建、读取、删除、自动存档、快速存档与 FNV-1a 64位校验。
//! 3. **预留混合渲染器接口 (`renderer`)**：
//!    定义 Rust `MooVNRendererBackend` Trait 与 C-ABI `CppRendererVTable` 桥接结构，
//!    供正在开发中的 Rust + C++ 原生渲染器无缝接入。
//! 4. **跨语言 C-ABI 导出层 (`ffi`)**：
//!    供 Tauri (MooVN Studio)、C++、C# (P/Invoke) 与 JS/TS (WASM/FFI) 直接调用。

pub mod ffi;
pub mod ir;
pub mod renderer;
pub mod runtime;
pub mod save;
pub mod translator;

pub use ir::{EngineOp, EngineScriptProgram, SourceLanguage};
pub use renderer::{
    CppRendererVTable, MooVNRendererBackend, RenderFramePacket, RenderLayerCommand,
    RendererBackendKind, RendererBridge,
};
pub use runtime::{MooVNEngineRuntime, VNWorldState};
pub use save::{SaveManager, SaveSlotRecord};
pub use translator::{PolyglotTranslator, TranslationDiagnostic};
