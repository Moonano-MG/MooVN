# MooVN Studio 核心工程与 `.mpvn` 格式规范 (`MooVN/`)

本目录对应 `v0.1.0-dev` 分支中的 **MooVN Studio** 核心引擎、编辑器与 `.mpvn` 项目格式定义。

## `.mpvn` 项目文件格式 (`MooVN Studio Project`)
- **扩展名**：`.mpvn`
- **用途**：专用于导入与导出 **MooVN Studio 可编辑项目**（非编译后的游戏运行包 `.msvn`）。
- **内部结构**：
  - `magic`: `"MPVN_STUDIO_PROJECT"`
  - `format`: `"mpvn"`
  - `schemaVersion`: `"1.0.0"`
  - `studioName`: `"MooVN Studio"`
  - `project`: 完整 `VNProject` 数据（含章节、55 类节点图、Scratch C 型凹槽积木树、角色差分与变量表）。
- **纯净分发策略**：原内部研发测试模板已独立提取为本地 `.mpvn` 工程文件，不再内置于公开分发的 MooVN Studio 中。
