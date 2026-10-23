# MooVN Studio

轻量、直观的跨平台视觉小说创作工作台与引擎套件。

## 目录结构

- **`MooVN Studio/`**：基于 **Tauri 2** 构建的本地视觉小说开发中间层与跨平台工作台（支持本地工作区路径管理、`.mpvn` 项目文件与多端打包）。
- **`MooVN Engine/`**：基于 **Rust** 编写的视觉小说核心游戏引擎，通过多语言翻译层接入 **JavaScript / TypeScript、C++、C#、Rust** 快速视觉小说 API（如 `C#: moovn.save:create(NAME)`、`JS: moobn.sava:create(NAME)`），并预留 **Rust + C++** 混合渲染器接口。
- **`MooVN Web/`**：官方网站（客户端下载中心）与 **Web 版 MooVN 工作台**（类似 Web 版 VS Code：无需本地路径配置，直接导入本地 `.mpvn` 文件或新建项目）。

## 许可证

详见 [LICENSE](./LICENSE)。
