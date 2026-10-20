<div align="center">

# MooVN 视觉小说编辑器

**工作流式可视化编辑 + 纯代码双模式 · TypeScript + Tauri 2 + Pixi.js + YAML**

编辑器本身可以是像 Godot 那样的纯可视化编辑器（不使用模板时），
但 MooVN 对视觉小说的支持与开发体验更好。

![platform](https://img.shields.io/badge/platform-Windows%20%7C%20Android%20%7C%20macOS%20%7C%20iOS-blue)
![stack](https://img.shields.io/badge/stack-Tauri%202%20%2B%20Pixi.js%20%2B%20YAML-1d4e89)

</div>

---

## ✨ 功能总览

### 1. 编辑方式：Dify 式工作流
- 画布节点编排：**对话 / 旁白 / 选项 / 条件分支 / 角色 / 背景 / BGM / 音效 / 变量 / 脚本 / 跳转 / 结局 / 等待**
- 节点拖拽、连线、平移缩放、自动整理、双击空白添加节点
- 支持纯工作流，也支持 **Lua / Teal / JavaScript / TypeScript / Python** 脚本节点
- 内置代码视图：直接编辑场景 YAML 与全局脚本（CodeMirror 语法高亮）

### 2. 界面风格：黑白双主题
编辑器右上角一键切换 **黑（夜）／白（昼）** 两套主题。

### 3. 文件管理器：章节 → 场景
- `章节 > 场景` 两级管理；**即使只改对话也必须是独立场景**
- 每个场景可独立导出为 YAML（包含背景、BGM、角色站位/属性、流程节点、画布坐标）
- 场景可视化编辑器：实时渲染舞台，**拖拽角色调整站位**（自动吸附 左/中/右）

### 4. 跨平台
| 平台 | 状态 | 说明 |
| --- | --- | --- |
| **Windows** | ✅ 必须 | NSIS 安装包 |
| **Android** | ✅ 必须 | APK（minSdk 24） |
| iOS | ⭕ 可选 | Xcode 构建 |
| macOS | ⭕ 可选 | .app / .dmg |

### 5. 游戏系统
- **角色系统**：好感度（固定）+ 任意自定义属性（数值/文本/布尔）
- **章节系统**、**剧情线 / 多结局**（好感度或选项触发分支）
- **快进** 只跳过 *已读* 场景（进入未读场景自动停止）
- **后退** 回到上一个场景；**自动播放** 按文字速度推进

### 6. 蓝色模板（完整示例游戏《雨夜之约》）
- 主菜单：**左侧选项列，中+右主视觉图，左/中间深蓝→黑模糊过渡层**
  - 选项从上到下：开启新游戏 / 读取存档 / 设置 / 关于 / 退出游戏
- 设置界面：**通用设置、高级设置、读档、存档、退出到菜单**（菜单中只有读档可用）
- 存读档：**Auto / 快速 / 1~0 共 12 个选项卡，每卡 6 档**（3 列 × 2 行）
  - 读档/存档档案互通；空档显示"空档案"，已存档显示场景截图 + 保存时间
  - Auto 选项卡由系统在场景切换时自动轮换写入
- 游戏内：底部对话框（黑底 + 深蓝边框）+ 控制条（后退/自动/快进/隐藏/设置）
- 选项按钮：**未超屏宽绝不换行**；悬浮时文字左侧出现浅蓝条
- 结局收集、结局卡片（关于页查看进度）

---

## 🚀 快速开始（Web / 开发）

```bash
bun install        # 或 npm install / pnpm install
bun run dev        # http://localhost:5173 编辑器
                   # http://localhost:5173/game.html 蓝色模板游戏
bun run build      # 产出 dist/（编辑器 + 游戏运行时）
```

## 🖥️ 桌面端（Windows / macOS / Linux）

```bash
# 1) 生成完整图标集（首次）
bunx tauri icon src-tauri/icons/app-icon.png

# 2) 开发调试
bun tauri dev

# 3) 构建（Windows 产出 NSIS 安装包）
bunx tauri build
```

## 🤖 Android

```bash
bunx tauri android init   # 首次
bunx tauri android dev
bunx tauri android build  # 产出 .apk / .aab
```

## 🍎 iOS / macOS（可选）

```bash
bunx tauri ios init && bunx tauri ios build
bunx tauri build --target universal-apple-darwin   # macOS
```

> CI：`.github/workflows/release.yml` 在推送 `v*` 标签时自动构建
> Windows 安装包与 Android APK（可在 Actions 页下载）。

---

## 📁 项目结构

```
├── index.html                # 编辑器入口
├── game.html                 # 游戏运行时入口（蓝色模板）
├── src/
│   ├── common/               # 类型 / YAML / 表达式 / 存储 / 事件
│   ├── engine/               # 视觉小说运行时（Pixi.js 渲染、流程状态机、存档）
│   │   ├── Engine.ts         # 流程执行 / 自动 / 快进(只跳已读) / 后退
│   │   ├── states.ts         # 存档（12 选项卡×6 档）/ 进度 / 设置
│   │   ├── renderer/Stage.ts # 背景 / 立绘（白底边缘泛洪抠图）/ 过渡
│   │   └── script.ts         # JS / Lua(wasmoon) / Teal 执行器
│   ├── template-blue/        # 蓝色模板 UI（主菜单/存读档/设置/游戏内）
│   ├── editor/               # 编辑器（工作流画布/文件管理器/场景可视化/代码视图）
│   └── game/                 # 游戏启动器
├── template-blue/data/       # 示例游戏《雨夜之约》YAML 剧本
├── public/assets/            # 背景 / 立绘 / 占位音频
├── scripts/                  # 资源生成脚本（音频合成）
└── src-tauri/                # Tauri 2 后端（Rust：KV 存储 / 文件 IO / 对话框）
```

## 📝 场景 YAML 示例

```yaml
format: moovn-scene
version: 1
id: ch1-s1
chapter: ch1
title: 雨夜站台
background: assets/bg/rain-street.png
bgm: assets/audio/bgm-rain.wav
characters:
  - ref: yuki
    position: left        # left / center / right / 0~1 小数
    expression: smile
next: ch1-s2
flow:
  - id: n1
    type: dialogue
    character: yuki
    text: "……你也在等末班车吗？"
    next: n2
  - id: n2
    type: choice
    options:
      - text: 撑伞过去搭话
        next: n3
        effects: { yuki.affection: 1 }
      - text: 默默站在原地
        next: n4
  - id: n5
    type: branch
    condition: "yuki.affection >= 2"
    true: "scene:ch1-s4"    # 剧情线分岔 → 不同结局
    false: "scene:ch1-s5"
```

## 🛠 技术栈

TypeScript 5 · Tauri 2 · Pixi.js 8 · YAML · CodeMirror 6 · wasmoon(Lua 5.4) · Vite 6

## License

MIT
