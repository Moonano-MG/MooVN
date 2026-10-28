# MooVN AI Agent 当前接口说明（v0.1.0-dev）

此文件只描述已接线的部分，不是完整引擎规范。项目与节点字段以 Studio 的 `src/types.ts`、`src/lib/projectSchema.ts` 为准；章节 YAML 的可用示例见 `scenes/scene_01.yaml`，读取与生成以 `src/lib/projectUtils.ts` 为准。不要臆造项目路径或将示例视为完整运行时能力。

## Agent 与纯对话

AI 面板的 Agent 模式可以提出 `moovn-agent` JSON 动作列表。当前可申请的动作类型是 `update_dialogue`、`add_dialogue`、`set_expression`、`update_script` 和 `create_node`；操作前应由用户检查并确认。纯对话模式只回答，不应自动创建或修改节点。Agent 只能使用界面当前传入的工程摘要与操作能力，不能假设拥有任意磁盘或终端权限。

## 脚本与运行边界

- `moovn.*` API 行语法改写是实验功能，只改变被识别的独立调用名称，不是通用编译器，也不保证目标语言或绑定可执行。项目没有 `@moovn/sdk` 包，TypeScript 绑定尚未实现。
- Python、Lua/Teal 运行时或桥接器尚未实现，不得生成 `moovn.bridge.runPython` / `runLua` / `runTeal` 并声称可以执行。
- HTML 导出只支持很小的基础节点子集，遇到未支持的节点或设置会阻止导出；切勿建议用户用当前 HTML 播放器运行脚本、条件分支、音频或分层动画。
- 没有 Live2D/Spine SDK，且没有可用的局部遮罩呼吸；平面立绘不能通过整图缩放伪造呼吸。
- 用户 API Key 仅保存在当前会话内存；请求由客户端直接发往允许的服务商。系统钥匙串、原生代理未实现。
