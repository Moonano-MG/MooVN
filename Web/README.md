# MooVN Studio — Web 门户端 (`Web/`)

本目录对应 `v0.1.0-dev` 分支中的 **Web 官方门户与第三方 GitHub Release 客户端** 模块（部署于 Vercel）。

## 网站两部分架构
1. **第一部分（默认进入 Vercel 首页）**：
   - **引导与版本下载中心**：实时请求 `https://api.github.com/repos/Moonano-MG/MooVN/releases`，动态解析并生成：
     - `最新稳定版本(推荐)`（含 `>Windows: ARMx64、x64、x32`、`>Android...`、`>macOS...`、`>Linux...`、`>iOS...` 及源代码直链）
     - `最新Beta与Alpha`（左右分栏展示最新 `Beta` 与 `Alpha` 构建及源码包）
     - `历史版本`（按 `Stable`、`Beta`、`Alpha`、`Dev` 四通道归档）
   - **零 Vercel 带宽占用**：所有二进制安装包与 `Source code (zip / tar.gz)` 均直连 GitHub 官方地址下载。
   - **GitHub Issues 客服与工单系统**：用 GitHub Issues 代替传统客服，支持在网页端检索问题并一键发起带环境信息的 Issue。
2. **第二部分（网页版 MooVN Studio）**：
   - 点击顶部「进入网页版 MooVN Studio」或导入 `.mpvn` 工程即可在浏览器中直接运行完整 IDE。
