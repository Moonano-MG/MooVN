# MooVN (`v0.1.0-dev`)

MooVN 是一套开源视觉小说（Visual Novel）开发工具链，采用 **GNU GPL v3.0** 协议（含导出游戏作品豁免条款），仓库包含以下三个核心模块：

- **`MooVN Studio/`**：基于 **Tauri v2 + React + TypeScript** 的视觉小说桌面与移动端集成开发环境（节点画布、分层动态立绘舞台、脚本编辑器、AI Agent 辅助与游戏导出）。
- **`MooVN Engine/`**：基于 **Rust** 编写的视觉小说核心运行时与中间指令（IR）库，提供统一的存档校验（`moovn.save:create(NAME)`）、变量条件求值与剧本解析接口。
- **`MooVN Web/`**：MooVN 官方网站与在线版 Web 编辑器入口（与 `MooVN Studio` 共享同一套前端组件与资源源码，通过构建目标区分本地版与 Web 版）。

## 许可证 (License)

本项目采用 **GNU General Public License v3.0 (`GPL-3.0`)** 授权，详见 [LICENSE](./LICENSE)。使用 MooVN 导出的独立视觉小说游戏包及创作者自有的剧本、立绘、音频资源归创作者本人所有，不受 GPL 传染性约束。
