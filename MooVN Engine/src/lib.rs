//! # MooVN Engine (Rust Core)
//!
//! 视觉小说核心引擎，提供：
//! 1. **跨语言 API 转换层 (`translator`)**：
//!    将 JavaScript/TypeScript (`moovn.save.create(NAME)`)、C# (`Moovn.Save.Create(NAME)`)、
//!    C++/Rust (`moovn::save::create(NAME)`) 的视觉小说 API 调用转换为中间指令 `EngineOp`。
//! 2. **存档与世界状态管理 (`save`, `runtime`)**：
//!    支持多槽位存档创建、读取、删除、自动存档、快速存档与全字段 FNV-1a 64位完整性校验。
//! 3. **C++ 软件合成渲染桥接 (`renderer`)**：
//!    定义 Rust `MooVNRendererBackend` Trait 与 C-ABI `CppRendererVTable` 桥接结构。
//! 4. **跨语言 C-ABI 导出层 (`ffi`)**：
//!    供 Tauri (MooVN Studio)、C++、C# (P/Invoke) 与 JS/TS 调用。

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

pub mod prelude {
    pub use crate::ir::{EngineOp, EngineScriptProgram, SourceLanguage};
    pub use crate::renderer::{
        CppRendererVTable, MooVNRendererBackend, RenderFramePacket, RenderLayerCommand,
        RendererBackendKind, RendererBridge,
    };
    pub use crate::runtime::{MooVNEngineRuntime, VNWorldState};
    pub use crate::save::{SaveManager, SaveSlotRecord};
    pub use crate::translator::{PolyglotTranslator, TranslationDiagnostic};
}
