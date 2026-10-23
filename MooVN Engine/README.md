# MooVN Engine

**MooVN Engine** 是基于 **Rust** 编写的视觉小说核心运行引擎，通过内置的多语言翻译器（Polyglot Translator）与跨语言 FFI 桥接技术，支持 **JavaScript / TypeScript、C++、C#、Rust** 调用同一套底层视觉小说快速 API，并预留了 **Rust + C++ 混合渲染器接口**。

## 1. 多语言视觉小说快速 API 对照表

不同语言可使用各自习惯的快速指令语法，引擎翻译层会将其统一编译为相同的 `EngineOp` 中间指令：

| 功能 | C# 快速语法 | JavaScript / TypeScript 快速语法 | C++ / Rust 快速语法 |
| :--- | :--- | :--- | :--- |
| **创建存档** | `moovn.save:create(NAME)` | `moobn.sava:create(NAME)` | `moovn::save::create(NAME)` |
| **读取存档** | `moovn.save:load(NAME)` | `moobn.sava:load(NAME)` | `moovn::save::load(NAME)` |
| **删除存档** | `moovn.save:delete(NAME)` | `moobn.sava:delete(NAME)` | `moovn::save::delete(NAME)` |
| **快速存档** | `moovn.save:quick_save()` | `moobn.sava:quick_save()` | `moovn::save::quick_save()` |
| **切换背景** | `moovn.bg:show(BG_ID, "fade")` | `moovn.bg:show(BG_ID, "fade")` | `moovn::bg::show(BG_ID, "fade")` |
| **角色登场** | `moovn.char:enter(CHAR_ID, "center")` | `moovn.char:enter(CHAR_ID, "center")` | `moovn::char::enter(CHAR_ID, "center")` |
| **角色神态** | `moovn.char:expr(CHAR_ID, SPRITE_ID)` | `moovn.char:expr(CHAR_ID, SPRITE_ID)` | `moovn::char::expr(CHAR_ID, SPRITE_ID)` |
| **好感变更** | `moovn.char:affection(CHAR_ID, 5)` | `moovn.char:affection(CHAR_ID, 5)` | `moovn::char::affection(CHAR_ID, 5)` |
| **台词输出** | `moovn.text:say(SPEAKER, TEXT)` | `moovn.text:say(SPEAKER, TEXT)` | `moovn::text::say(SPEAKER, TEXT)` |
| **镜头推拉** | `moovn.camera:pan_zoom(1.08, 0, -10, 500)` | `moovn.camera:pan_zoom(1.08, 0, -10, 500)` | `moovn::camera::pan_zoom(1.08, 0, -10, 500)` |
| **流式预载** | `moovn.stream:preload(6)` | `moovn.stream:preload(6)` | `moovn::stream::preload(6)` |

## 2. 预留渲染器接口 (Rust & C++)

渲染器采用 **Rust + C++** 混合架构设计（开发中）：
- **Rust 侧接口**：`src/renderer/mod.rs` 中的 `MooVNRendererBackend` Trait 与 `#[repr(C)] pub struct CppRendererVTable`
- **C++ 侧接口**：`cpp/include/moovn_renderer.hpp` 与 `cpp/src/moovn_renderer_bridge.cpp` 中的 `moovn::renderer::IRendererDevice`
