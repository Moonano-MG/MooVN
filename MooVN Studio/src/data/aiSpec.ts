export const MOOVN_AI_SPEC_MARKDOWN = `# MooVN AI Agent 视觉小说工程规范 (MOOVN_AI_SPEC.md)
Version: 2.0.0

## 1. 核心架构与节点分类规范
以下是编辑器数据类型示例，不代表所有节点在预览、代码和导出中均已实现。以工程图检查和导出校验为准。
\`random_branch\`（随机分支）和 \`switch_branch\`（多路路由）为旧数据预留，不能新建或执行；选项条件表达式尚不支持。不要声称这些能力已经实现。
- **[控制]**: \`choice\` (分支选择), \`timed_choice\` (限时抉择), \`condition\` (条件判断 If/Else), \`wait_timer\` (延时等待), \`jump_chapter\` (跨章节跳转), \`end\` (结局终点)
- **[屏幕文字]**: \`screen_text\` (屏幕自由文字), \`chapter_title\` (章节标题幕布), \`floating_subtitle\` (电影感悬浮字幕), \`banner_notice\` (顶部地点/时间横幅)
- **[叙事]**: \`dialogue\` (标准对话), \`narration\` (沉浸旁白), \`inner_monologue\` (内心独白), \`cg_caption\` (CG 特写台词)
- **[角色]**: \`char_enter\` (角色登场), \`char_expression\` (表情差分切换), \`char_move\` (平滑位移), \`char_action\` (动作演出), \`char_highlight\` (说话人聚光灯), \`char_exit\` (角色退场), \`affection_change\` (好感度增减)
- **[视觉]**: \`bg_switch\` (背景切换), \`fade\` (淡入淡出控制), \`camera_pan_zoom\` (镜头推拉摇移), \`camera_shake\` (屏幕震动), \`screen_flash\` (屏幕闪光), \`weather_particles\` (天气粒子；尚未实现), \`color_filter\` (色调滤镜), \`frame_animation\` (序列帧与视频动画)
- **[音频]**: \`bgm_play\` (播放BGM), \`bgm_stop\` (停止音乐), \`sfx_play\` (播放环境音效), \`voice_play\` (角色语音)
- **[界面]**: \`ui_visibility\` (对话框显隐), \`popup_toast\` (系统提示横幅), \`clue_unlock\` (解锁档案词条), \`ui_theme_switch\` (界面主题切换)
- **[脚本]**: \`set_variable\` (变量赋值), \`script\` (脚本草稿；跨语言桥接未实现)

## 2. 章节与导出
章节数据保存在工程中；YAML 视图和脚本草稿不代表已经生成或执行了独立章节文件。具体导出能力以当前校验结果为准。
`;
