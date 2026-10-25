# MooVN Engine (`v0.1.0-dev`)

`MooVN Engine` 是 MooVN 的视觉小说核心运行时与中间指令（IR）库（许可证：**GPL-3.0-only**）。

## 核心指令与各语言合法 API 语法

| 功能 | JavaScript / TypeScript | C# | C++20 / Rust |
| --- | --- | --- | --- |
| **创建存档** | `moovn.save.create("Slot_01");` | `Moovn.Save.Create("Slot_01");` | `moovn::save::create("Slot_01");` |
| **读取存档** | `moovn.save.load("Slot_01");` | `Moovn.Save.Load("Slot_01");` | `moovn::save::load("Slot_01");` |
| **删除存档** | `moovn.save.delete("Slot_01");` | `Moovn.Save.Delete("Slot_01");` | `moovn::save::delete("Slot_01");` |
| **快速存档** | `moovn.save.quick_save();` | `Moovn.Save.QuickSave();` | `moovn::save::quick_save();` |
| **显示背景** | `moovn.bg.show("bg_id", "fade");` | `Moovn.Bg.Show("bg_id", "fade");` | `moovn::bg::show("bg_id", "fade");` |
| **角色入场** | `moovn.char.enter("char_id", "50,85");` | `Moovn.Char.Enter("char_id", "50,85");` | `moovn::char::enter("char_id", "50,85");` |
| **表情切换** | `moovn.char.expr("char_id", "sprite_id");` | `Moovn.Char.Expr("char_id", "sprite_id");` | `moovn::char::expr("char_id", "sprite_id");` |
| **台词输出** | `moovn.text.say("Speaker", "Text");` | `Moovn.Text.Say("Speaker", "Text");` | `moovn::text::say("Speaker", "Text");` |
| **设置变量** | `moovn.var.set("key", "value");` | `Moovn.Var.Set("key", "value");` | `moovn::var::set("key", "value");` |

## 能力矩阵（Capability Matrix）

| 模块 / 特性 | 状态 | 说明 |
| --- | --- | --- |
| **IR 指令集 (`src/ir.rs`)** | 稳定 | 定义场景、角色、对白、分支、存档、相机与变量操作 |
| **存档与 64-bit FNV-1a 校验 (`src/save.rs`)** | 稳定 | 全字段（含排序后的 `variables` 与 `affection`）完整性校验 |
| **`moovn.*` API 调用格式化 (`src/translator.rs`)** | 实验 | 转换 `moovn.*` / `Moovn.*` / `moovn::*` API 调用并保留注释与宿主语句 |
| **C++20 软件帧缓冲合成桥接 (`cpp/`)** | 实验 | `SoftwareCompositorDevice` RGBA 矩形合成、色度键抠像与四种滤镜 |
| **Live2D Cubism / Spine 骨骼运行时** | 未实现 | 需用户自行接入官方授权 Cubism Web SDK，未配置时界面显式禁用 |

## 目录结构

- `src/lib.rs` — 库入口与 `moovn_engine::prelude`
- `src/ir.rs` — 视觉小说中间指令定义 (`EngineOp`)
- `src/translator.rs` — 跨语言 `moovn.*` API 解析与代码生成
- `src/save.rs` — 全字段 FNV-1a 64-bit 校验和存档管理器 (`SaveManager`)
- `src/runtime.rs` — 场景图状态机与条件表达式求值器 (`MooVNEngineRuntime`)
- `src/ffi.rs` — C ABI 外部函数接口
- `cpp/` — C++20 软件帧缓冲合成实现 (`SoftwareCompositorDevice`)
