export const MOOVN_AI_SPEC_MARKDOWN = `# MooVN AI Agent 视觉小说工程规范 (MOOVN_AI_SPEC.md)
Version: 2.0.0

## 1. 核心架构与节点分类规范
MooVN 视觉小说工程由章节文件 (\`chapters/chapter_XX.yaml\`) 与 TypeScript 核心运行时 (\`src/runtime/storyEngine.ts\`) 驱动。
所有节点均带有明确的类型标 (\`categoryLabel\`)，共分为 8 大类别、40 种标准节点：
- **[控制]**: \`choice\` (分支选择), \`timed_choice\` (限时抉择), \`condition\` (条件判断 If/Else), \`switch_branch\` (多路路由), \`wait_timer\` (延时等待), \`jump_chapter\` (跨章节跳转), \`random_branch\` (随机分支), \`end\` (结局终点)
- **[屏幕文字]**: \`screen_text\` (屏幕自由文字), \`chapter_title\` (章节标题幕布), \`floating_subtitle\` (电影感悬浮字幕), \`banner_notice\` (顶部地点/时间横幅)
- **[叙事]**: \`dialogue\` (标准对话), \`narration\` (沉浸旁白), \`inner_monologue\` (内心独白), \`cg_caption\` (CG 特写台词)
- **[角色]**: \`char_enter\` (角色登场), \`char_expression\` (表情差分切换), \`char_move\` (平滑位移), \`char_action\` (动作演出), \`char_highlight\` (说话人聚光灯), \`char_exit\` (角色退场), \`affection_change\` (好感度增减)
- **[视觉]**: \`bg_switch\` (背景切换), \`fade\` (淡入淡出控制), \`camera_pan_zoom\` (镜头推拉摇移), \`camera_shake\` (屏幕震动), \`screen_flash\` (屏幕闪光), \`weather_particles\` (天气粒子), \`color_filter\` (色调滤镜), \`frame_animation\` (序列帧与视频动画)
- **[音频]**: \`bgm_play\` (播放BGM), \`bgm_stop\` (停止音乐), \`sfx_play\` (播放环境音效), \`voice_play\` (角色语音)
- **[界面]**: \`ui_visibility\` (对话框显隐), \`popup_toast\` (系统提示横幅), \`clue_unlock\` (解锁档案词条), \`ui_theme_switch\` (界面主题切换)
- **[脚本]**: \`set_variable\` (变量赋值), \`script\` (TypeScript 原生逻辑与 Lua/Teal/Python 跨语言桥接)

## 2. 章节 YAML 存储规范
每个章节对应一个独立的 YAML 文件（例如 \`chapter_01.yaml\`），包含该章节下的全部场景与节点序列。
`;
