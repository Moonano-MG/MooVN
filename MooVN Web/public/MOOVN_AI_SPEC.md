# MooVN 视觉小说引擎与编辑器 — AI Agent 开发规范 (MOOVN_AI_SPEC.md)

本文件用于指导 AI Agent 理解并操作 **MooVN** 项目结构、章节 YAML 格式、Dify+Scratch 可视化工作流积木块，以及以 **TypeScript / JavaScript** 为核心的编程接口与跨语言桥接层。

---

## 1. 标准项目根目录结构

```text
/
├── project.moovn.json          # 项目总配置与工作流图元数据
├── chapters/                   # 章节配置目录（一个章节对应一个 YAML 文件，包含该章节全部场景）
│   ├── chapter_1.yaml
│   ├── chapter_2.yaml
│   └── chapter_3.yaml
├── scripts/                    # 脚本目录（以 TypeScript / JavaScript 为主语言）
│   ├── main.ts                 # 主剧情与自定义逻辑入口 (TypeScript)
│   ├── bridge.ts               # 跨语言桥接层（通过 TS/JS 桥接调用 Lua / Teal / Python）
│   ├── hooks.lua               # 由 bridge.ts 调度的 Lua 扩展脚本
│   └── hooks.py                # 由 bridge.ts 调度的 Python 扩展脚本
├── assets/                     # 多媒体资源目录
│   ├── backgrounds/            # 静态背景、多图序列帧背景、视频背景
│   ├── characters/             # 透明通道 PNG 角色立绘与多帧表情动画
│   └── audio/                  # BGM 与音效
└── ai/
    └── MOOVN_AI_SPEC.md        # AI Agent 规范描述文件（本文件）
```

---

## 2. 章节 YAML 规范（一章一 YAML）

每个章节对应一个独立的 `.yaml` 文件，包含该章节下的**所有场景（`scenes`）**：

```yaml
chapter:
  id: ch-1
  title: 第一章 · 樱道初遇
  order: 1
  scenes:
    - id: s-1
      title: 场景 1 · 坡道上的风
      type: dialogue            # dialogue | choice | fade | screen_text | character | background | audio | script | end
      background:
        id: bg-classroom
        media_kind: static      # static | frame_sequence | video | tween
      audio:
        bgm: bgm-spring
        sfx: null
      stage_characters:
        - character_id: c-yuki
          position: { x: 50, y: 54 }
          scale: 1
          opacity: 1
          tween: breathe        # none | breathe | bounce | shake | float | slide_in
      fade:                     # 淡入淡出角色、背景或整屏
        target: character       # character | background | screen
        character_id: c-yuki
        direction: in           # in | out
        duration_ms: 600
        target_opacity: 1
      screen_texts:             # 屏幕自由文字（可自定义大小、颜色、位置）
        - id: st-1
          text: 四月，樱花飘落的清晨
          x: 50
          y: 22
          font_size: 28
          color: "#ffffff"
          align: center
      blocks:                   # Dify + Scratch 节点内积木块（底层编译为 TypeScript）
        - type: fade
          params: { target: "screen", direction: "in", durationMs: 500 }
        - type: screen_text
          params: { text: "第一章 · 樱道初遇", x: 50, y: 20, fontSize: 32, color: "#e0f2fe" }
        - type: say
          params: { speaker: "苏雨晴", text: "早安，今天也一起走吧。" }
      dialogue:
        - speaker_id: c-yuki
          text: 早安，今天也一起走吧。
      choices: []
      next_scene: s-2
```

---

## 3. TypeScript / JavaScript 核心 API 与跨语言桥接

MooVN 以 **TypeScript / JavaScript** 为唯一原生主语言，所有可视化积木块均直接编译为 `@moovn/sdk` 的 TypeScript 调用：

```typescript
import { moovn } from "@moovn/sdk";

// 1. 基础舞台与对白 API
await moovn.bg("bg-rooftop", { mediaKind: "frame_sequence", fps: 12 });
await moovn.char("c-yuki", { x: 50, y: 52, scale: 1.0, tween: "breathe" });
await moovn.say("c-yuki", "看到那棵樱花树了吗？");

// 2. 淡入淡出 API（支持角色、场景背景、整屏画面）
await moovn.fade({
  target: "character", // "character" | "background" | "screen"
  characterId: "c-yuki",
  direction: "out",    // "in" | "out"
  durationMs: 800,
  targetOpacity: 0,
});

// 3. 屏幕自定义文字 API（任意位置、字号、颜色）
await moovn.screenText({
  text: "—— 记忆中的那一天 ——",
  x: 50,
  y: 30,
  fontSize: 30,
  color: "#38bdf8",
  align: "center",
  fadeDurationMs: 600,
});

// 4. 多图片序列帧 / 视频 / 补间动画 API
await moovn.animate({
  targetId: "c-yuki",
  kind: "frame_sequence", // "static" | "frame_sequence" | "video" | "tween"
  tween: "bounce",
  fps: 8,
});

// 5. 跨语言桥接 API（其他语言必须通过 TypeScript/JavaScript Bridge 调用）
const bonus = await moovn.bridge.runLua<number>(`
  local base = moovn_ctx.affection["c-yuki"] or 0
  return base + 10
`);
await moovn.bridge.runPython(`
  state["visited_shrine"] = True
`);
await moovn.bridge.runTeal(`
  local delta: integer = 5
  return delta
`);
```

---

## 4. AI Agent 操作指令协议 (Agent Actions)

当用户在 AI 编辑器中下达自然语言指令时，Agent 可返回如下 JSON Action 指令块以直接修改工程：

- `ADD_SCENE`: 在指定章节新增场景节点（支持 `dialogue`, `choice`, `fade`, `screen_text`, `end` 等类型）
- `UPDATE_SCENE`: 修改当前场景的台词、角色坐标、淡入淡出 (`fade`)、屏幕文字 (`screenTexts`) 或动画模式
- `ADD_BLOCK`: 向当前选中节点插入 Scratch 代码块（底层生成 TypeScript）
- `WRITE_TS_SCRIPT`: 生成或更新节点的 TypeScript 代码或 `moovn.bridge` 跨语言桥接代码
