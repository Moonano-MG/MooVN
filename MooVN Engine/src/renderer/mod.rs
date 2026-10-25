//! Reserved Hybrid Rust + C++ Renderer Interface (`MooVNRendererBackend` & `CppRendererVTable`).
//!
//! This module defines the rendering abstraction layer and C-ABI vtable bridge
//! for the in-development Rust + C++ visual novel renderer.

use std::ffi::c_void;
use std::os::raw::c_char;

#[repr(C)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RendererBackendKind {
    /// Reserved native Rust + C++ hybrid hardware renderer (under active development)
    HybridRustCpp = 0,
    /// C++ Vulkan backend via FFI vtable
    CppVulkan = 1,
    /// C++ DirectX 12 backend via FFI vtable
    CppDirectX12 = 2,
    /// Rust WGPU backend
    RustWgpu = 3,
    /// Headless / Studio preview bridge
    StudioBridge = 4,
}

#[derive(Debug, Clone)]
pub enum RenderLayerCommand {
    ClearScreen { r: f32, g: f32, b: f32, a: f32 },
    DrawBackground { bg_id: String, transition: String },
    DrawCharacterSprite {
        char_id: String,
        sprite_id: String,
        x_norm: f32,
        y_norm: f32,
        scale: f32,
        opacity: f32,
    },
    ApplyWeatherParticles { effect: String, intensity: u8 },
    ApplyColorFilter { filter_name: String, intensity: u8 },
    ApplyCameraTransform {
        zoom: f32,
        offset_x: f32,
        offset_y: f32,
    },
    CustomShaderPass { pass_name: String, payload: String },
}

#[derive(Debug, Clone)]
pub struct RenderFramePacket {
    pub frame_index: u64,
    pub viewport_width: u32,
    pub viewport_height: u32,
    pub commands: Vec<RenderLayerCommand>,
}

/// Rust trait for any renderer backend implementation.
pub trait MooVNRendererBackend: Send {
    fn backend_kind(&self) -> RendererBackendKind;
    fn initialize(&mut self, width: u32, height: u32) -> bool;
    fn resize(&mut self, width: u32, height: u32);
    fn submit_frame(&mut self, packet: &RenderFramePacket);
    fn shutdown(&mut self);
}

/// C-ABI VTable for attaching the C++ Renderer implementation (`cpp/include/moovn_renderer.hpp`).
#[repr(C)]
#[derive(Clone, Copy)]
pub struct CppRendererVTable {
    pub user_data: *mut c_void,
    pub on_init: Option<extern "C" fn(user_data: *mut c_void, width: u32, height: u32) -> bool>,
    pub on_resize: Option<extern "C" fn(user_data: *mut c_void, width: u32, height: u32)>,
    pub on_begin_frame: Option<extern "C" fn(user_data: *mut c_void, frame_index: u64)>,
    pub on_draw_background: Option<
        extern "C" fn(user_data: *mut c_void, bg_id: *const c_char, transition: *const c_char),
    >,
    pub on_draw_character: Option<
        extern "C" fn(
            user_data: *mut c_void,
            char_id: *const c_char,
            sprite_id: *const c_char,
            x_norm: f32,
            y_norm: f32,
            scale: f32,
            opacity: f32,
        ),
    >,
    pub on_present_frame: Option<extern "C" fn(user_data: *mut c_void, frame_index: u64)>,
    pub on_shutdown: Option<extern "C" fn(user_data: *mut c_void)>,
}

unsafe impl Send for CppRendererVTable {}

/// Hybrid Rust/C++ Renderer Bridge.
pub struct RendererBridge {
    backend_kind: RendererBackendKind,
    viewport: (u32, u32),
    frame_counter: u64,
    cpp_vtable: Option<CppRendererVTable>,
    pending_commands: Vec<RenderLayerCommand>,
}

impl Default for RendererBridge {
    fn default() -> Self {
        Self::new()
    }
}

impl RendererBridge {
    pub fn new() -> Self {
        Self {
            backend_kind: RendererBackendKind::HybridRustCpp,
            viewport: (1920, 1080),
            frame_counter: 0,
            cpp_vtable: None,
            pending_commands: Vec::new(),
        }
    }

    pub fn attach_cpp_vtable(&mut self, vtable: CppRendererVTable) {
        self.backend_kind = RendererBackendKind::HybridRustCpp;
        if let Some(init_fn) = vtable.on_init {
            let _ = init_fn(vtable.user_data, self.viewport.0, self.viewport.1);
        }
        self.cpp_vtable = Some(vtable);
    }

    pub fn push_command(&mut self, cmd: RenderLayerCommand) {
        self.pending_commands.push(cmd);
    }

    pub fn flush_frame(&mut self) -> RenderFramePacket {
        self.frame_counter += 1;
        let packet = RenderFramePacket {
            frame_index: self.frame_counter,
            viewport_width: self.viewport.0,
            viewport_height: self.viewport.1,
            commands: std::mem::take(&mut self.pending_commands),
        };

        if let Some(vt) = &self.cpp_vtable {
            if let Some(begin) = vt.on_begin_frame {
                begin(vt.user_data, packet.frame_index);
            }
            for cmd in &packet.commands {
                match cmd {
                    RenderLayerCommand::DrawBackground { bg_id, transition } => {
                        if let Some(draw_bg) = vt.on_draw_background {
                            if let (Ok(c_bg), Ok(c_tr)) = (
                                std::ffi::CString::new(bg_id.as_str()),
                                std::ffi::CString::new(transition.as_str()),
                            ) {
                                draw_bg(vt.user_data, c_bg.as_ptr(), c_tr.as_ptr());
                            }
                        }
                    }
                    RenderLayerCommand::DrawCharacterSprite {
                        char_id,
                        sprite_id,
                        x_norm,
                        y_norm,
                        scale,
                        opacity,
                    } => {
                        if let Some(draw_char) = vt.on_draw_character {
                            if let (Ok(c_id), Ok(s_id)) = (
                                std::ffi::CString::new(char_id.as_str()),
                                std::ffi::CString::new(sprite_id.as_str()),
                            ) {
                                draw_char(
                                    vt.user_data,
                                    c_id.as_ptr(),
                                    s_id.as_ptr(),
                                    *x_norm,
                                    *y_norm,
                                    *scale,
                                    *opacity,
                                );
                            }
                        }
                    }
                    _ => {}
                }
            }
            if let Some(present) = vt.on_present_frame {
                present(vt.user_data, packet.frame_index);
            }
        }

        packet
    }

    pub fn backend_kind(&self) -> RendererBackendKind {
        self.backend_kind
    }
}
