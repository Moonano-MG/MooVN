//! C-ABI Foreign Function Interface (`extern "C"`) for MooVN Engine.
//!
//! Exposes MooVN Engine to C++, C# (`DllImport`), JavaScript/TypeScript (FFI/WASM),
//! and the Tauri middleware in `MooVN Studio`.

use std::ffi::CStr;
use std::os::raw::c_char;

use crate::ir::{EngineOp, SourceLanguage};
use crate::renderer::CppRendererVTable;
use crate::runtime::MooVNEngineRuntime;

#[no_mangle]
pub extern "C" fn moovn_engine_create() -> *mut MooVNEngineRuntime {
    Box::into_raw(Box::new(MooVNEngineRuntime::new()))
}

#[no_mangle]
pub unsafe extern "C" fn moovn_engine_destroy(engine: *mut MooVNEngineRuntime) {
    if !engine.is_null() {
        drop(Box::from_raw(engine));
    }
}

/// Executes `moovn.save:create(NAME)` from any FFI host.
#[no_mangle]
pub unsafe extern "C" fn moovn_engine_save_create(
    engine: *mut MooVNEngineRuntime,
    slot_name: *const c_char,
) -> bool {
    if engine.is_null() || slot_name.is_null() {
        return false;
    }
    let rt = &mut *engine;
    let Ok(name) = CStr::from_ptr(slot_name).to_str() else {
        return false;
    };
    rt.execute_op(EngineOp::SaveCreate {
        slot_name: name.to_string(),
    });
    true
}

/// Executes `moovn.save:load(NAME)` from any FFI host.
#[no_mangle]
pub unsafe extern "C" fn moovn_engine_save_load(
    engine: *mut MooVNEngineRuntime,
    slot_name: *const c_char,
) -> bool {
    if engine.is_null() || slot_name.is_null() {
        return false;
    }
    let rt = &mut *engine;
    let Ok(name) = CStr::from_ptr(slot_name).to_str() else {
        return false;
    };
    rt.execute_op(EngineOp::SaveLoad {
        slot_name: name.to_string(),
    });
    true
}

/// Evaluates polyglot script (`js`, `ts`, `cpp`, `csharp`, `rust`) inside the engine runtime.
#[no_mangle]
pub unsafe extern "C" fn moovn_engine_eval_script(
    engine: *mut MooVNEngineRuntime,
    lang_tag: *const c_char,
    script_source: *const c_char,
) -> usize {
    if engine.is_null() || lang_tag.is_null() || script_source.is_null() {
        return 0;
    }
    let rt = &mut *engine;
    let lang_str = CStr::from_ptr(lang_tag).to_str().unwrap_or("ts");
    let src_str = CStr::from_ptr(script_source).to_str().unwrap_or("");
    let logs = rt.eval_polyglot_script(src_str, SourceLanguage::from_tag(lang_str));
    logs.len()
}

/// Attaches the in-development C++ Renderer backend VTable to the Rust engine.
#[no_mangle]
pub unsafe extern "C" fn moovn_engine_attach_cpp_renderer(
    engine: *mut MooVNEngineRuntime,
    vtable: CppRendererVTable,
) -> bool {
    if engine.is_null() {
        return false;
    }
    let rt = &mut *engine;
    rt.renderer.attach_cpp_vtable(vtable);
    true
}
