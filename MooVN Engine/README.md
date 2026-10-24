# MooVN Engine (`v0.1.0-dev`)

`MooVN Engine` 是 MooVN 的视觉小说核心运行时与中间指令（IR）库（许可证：**GPL-3.0**）。

## 核心指令与存档 API

| 功能 | JavaScript / TypeScript / C# 语法 | C++ / Rust 语法 |
| --- | --- | --- |
| **创建存档** | `moovn.save:create(NAME)` | `moovn::save::create(NAME)` |
| **读取存档** | `moovn.save:load(NAME)` | `moovn::save::load(NAME)` |
| **删除存档** | `moovn.save:delete(NAME)` | `moovn::save::delete(NAME)` |
| **快速存档** | `moovn.save:quick_save()` | `moovn::save::quick_save()` |
| **显示背景** | `moovn.bg:show(BG_ID, TRANSITION)` | `moovn::bg::show(BG_ID, TRANSITION)` |
| **角色入场** | `moovn.char:enter(CHAR_ID, POS)` | `moovn::char::enter(CHAR_ID, POS)` |
| **表情切换** | `moovn.char:expr(CHAR_ID, SPRITE_ID)` | `moovn::char::expr(CHAR_ID, SPRITE_ID)` |
| **台词输出** | `moovn.text:say(SPEAKER, TEXT)` | `moovn::text::say(SPEAKER, TEXT)` |
| **设置变量** | `moovn.var:set(KEY, VALUE)` | `moovn::var::set(KEY, VALUE)` |

## 目录结构

- `src/ir.rs` — 视觉小说中间指令定义 (`EngineOp`)
- `src/translator.rs` — 脚本解析与指令生成
- `src/save.rs` — FNV-1a 64-bit 校验和存档管理器 (`SaveManager`)
- `src/runtime.rs` — 场景图状态机与条件表达式求值器 (`MooVNEngineRuntime`)
- `src/ffi.rs` — C ABI 外部函数接口
- `cpp/` — C++20 软件帧缓冲合成实现 (`SoftwareCompositorDevice`)
