export const DEFAULT_MOOVN_AI_SPEC = `# MooVN 视觉小说引擎与编辑器 — AI Agent 开发规范 (MOOVN_AI_SPEC.md)

本文件用于指导 AI Agent 理解并操作 **MooVN** 项目结构、章节 YAML 格式、Dify+Scratch 可视化工作流积木块，以及以 **TypeScript / JavaScript** 为核心的编程接口与跨语言桥接层。

## 1. 标准项目根目录结构
- /project.moovn.json          (工程总配置)
- /chapters/chapter_1.yaml     (一章一 YAML：包含该章节下全部场景配置)
- /scripts/main.ts             (TypeScript 主逻辑入口)
- /scripts/bridge.ts           (TS/JS 跨语言桥接器，用于调度 Lua / Teal / Python)
- /assets/                     (静态图、多图序列帧动画、视频、音频资源)
- /ai/MOOVN_AI_SPEC.md         (本 AI 规范描述文件)

## 2. Dify + Scratch 可视化工作流与积木块
- 工作流节点类型：
  - dialogue (对话场景)
  - choice (分支选择)
  - fade (淡入淡出节点：可淡入/淡出角色、背景或整屏)
  - screen_text (屏幕文字节点：可在任意坐标显示自定义大小、颜色、对齐方式的文字)
  - character / background / audio / script / end
- 节点内 Scratch 积木块（底层统一编译为 TypeScript / JavaScript）：
  - moovn.say(speaker, text)
  - moovn.bg(bgId, { mediaKind, fps })
  - moovn.char(charId, { x, y, scale, tween })
  - moovn.fade({ target, characterId, direction, durationMs, targetOpacity })
  - moovn.screenText({ text, x, y, fontSize, color, align })
  - moovn.animate({ targetId, kind, tween, fps })
  - moovn.addAffection(charId, delta)
  - moovn.bridge.runLua(code) / moovn.bridge.runTeal(code) / moovn.bridge.runPython(code)
`;
