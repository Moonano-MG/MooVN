//! # MooVN Engine (Rust Core)
//!
//! 视觉小说核心引擎，提供：
//! 1. **跨语言 API 转换层 (`translator`)**：
//!    将 JavaScript/TypeScript (`moovn.save.create(NAME)`)、C# (`Moovn.Save.Create(NAME)`)、
//!    C++/Rust (`moovn::save::create(NAME)`) 的视觉小说 API 调用转换为中间指令 `EngineOp`。
//! 2. **存档与世界状态管理 (`save`, `runtime`)**：
//!    支持多槽位存档与 FNV-1a 意外损坏自检；它不能验证人为篡改，也不是全字段认证。
//! 3. **C++ 软件合成渲染桥接 (`renderer`)**：
//!    定义 Rust `MooVNRendererBackend` Trait 与 C-ABI `CppRendererVTable` 桥接结构。
//! 4. **跨语言 C-ABI 导出层 (`ffi`)**：
//!    供本机宿主集成；C++、C# 与 JS/TS 的完整绑定尚未交付或验收。

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
