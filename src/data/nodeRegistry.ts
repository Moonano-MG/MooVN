import { NodeCategory, NodeTypeMeta, WorkflowNodeType } from '../types';

export const NODE_CATEGORIES: {
  id: NodeCategory;
  label: string;
  color: string;
}[] = [
  { id: 'control', label: '控制', color: '#f59e0b' },
  { id: 'narrative', label: '叙事', color: '#38bdf8' },
  { id: 'screen_text', label: '屏幕字', color: '#c084fc' },
  { id: 'character', label: '角色', color: '#f472b6' },
  { id: 'visual', label: '视觉', color: '#2dd4bf' },
  { id: 'audio', label: '音频', color: '#fb923c' },
  { id: 'ui', label: '界面', color: '#60a5fa' },
  { id: 'script', label: '脚本', color: '#a3e635' },
];

const CAT_STYLE: Record<
  NodeCategory,
  { accentColor: string; badgeBg: string; badgeText: string }
> = {
  control: {
    accentColor: '#f59e0b',
    badgeBg: 'rgba(245, 158, 11, 0.16)',
    badgeText: '#fcd34d',
  },
  narrative: {
    accentColor: '#38bdf8',
    badgeBg: 'rgba(56, 189, 248, 0.16)',
    badgeText: '#7dd3fc',
  },
  screen_text: {
    accentColor: '#c084fc',
    badgeBg: 'rgba(192, 132, 252, 0.16)',
    badgeText: '#d8b4fe',
  },
  character: {
    accentColor: '#f472b6',
    badgeBg: 'rgba(244, 114, 182, 0.16)',
    badgeText: '#f9a8d4',
  },
  visual: {
    accentColor: '#2dd4bf',
    badgeBg: 'rgba(45, 212, 191, 0.16)',
    badgeText: '#5eead4',
  },
  audio: {
    accentColor: '#fb923c',
    badgeBg: 'rgba(251, 146, 60, 0.16)',
    badgeText: '#fdba74',
  },
  ui: {
    accentColor: '#60a5fa',
    badgeBg: 'rgba(96, 165, 250, 0.16)',
    badgeText: '#93c5fd',
  },
  script: {
    accentColor: '#a3e635',
    badgeBg: 'rgba(163, 230, 53, 0.16)',
    badgeText: '#bef264',
  },
};

export const NODE_REGISTRY: NodeTypeMeta[] = [
  // ==================== 1. 控制 (Control) ====================
  {
    type: 'choice',
    category: 'control',
    categoryLabel: '控制',
    title: '玩家选项',
    description: '多分支剧情选择',
    ...CAT_STYLE.control,
  },
  {
    type: 'timed_choice',
    category: 'control',
    categoryLabel: '控制',
    title: '限时选项',
    description: '倒计时抉择与超时跳转',
    ...CAT_STYLE.control,
  },
  {
    type: 'condition',
    category: 'control',
    categoryLabel: '控制',
    title: '条件分支',
    description: '按好感或变量自动分流',
    ...CAT_STYLE.control,
  },
  {
    type: 'switch_branch',
    category: 'control',
    categoryLabel: '控制',
    title: '多路路由',
    description: '按变量值分发多个出口',
    ...CAT_STYLE.control,
  },
  {
    type: 'wait_timer',
    category: 'control',
    categoryLabel: '控制',
    title: '延时等待',
    description: '暂停指定毫秒后继续',
    ...CAT_STYLE.control,
  },
  {
    type: 'jump_chapter',
    category: 'control',
    categoryLabel: '控制',
    title: '跨章跳转',
    description: '跳转至指定章节节点',
    ...CAT_STYLE.control,
  },
  {
    type: 'random_branch',
    category: 'control',
    categoryLabel: '控制',
    title: '随机分支',
    description: '按权重随机走向分支',
    ...CAT_STYLE.control,
  },
  {
    type: 'stream_preload_hint',
    category: 'control',
    categoryLabel: '控制',
    title: '流式预载',
    description: '提前流式解压后续场景并释放旧内存',
    ...CAT_STYLE.control,
  },
  {
    type: 'msvn_chapter_load',
    category: 'control',
    categoryLabel: '控制',
    title: '章节加载',
    description: '挂载 .msvn 章节包并应用最低保底好感',
    ...CAT_STYLE.control,
  },
  {
    type: 'end',
    category: 'control',
    categoryLabel: '控制',
    title: '结局终点',
    description: '触发结局画面与演职员表',
    ...CAT_STYLE.control,
  },

  // ==================== 2. 叙事 (Narrative) ====================
  {
    type: 'dialogue',
    category: 'narrative',
    categoryLabel: '叙事',
    title: '角色对白',
    description: '标准角色对话与语音演出',
    ...CAT_STYLE.narrative,
  },
  {
    type: 'narration',
    category: 'narrative',
    categoryLabel: '叙事',
    title: '全屏独白',
    description: 'NVL 小说式叙事段落',
    ...CAT_STYLE.narrative,
  },
  {
    type: 'inner_monologue',
    category: 'narrative',
    categoryLabel: '叙事',
    title: '内心活动',
    description: '第一人称心理描写',
    ...CAT_STYLE.narrative,
  },
  {
    type: 'cg_caption',
    category: 'narrative',
    categoryLabel: '叙事',
    title: 'CG特写',
    description: '全屏事件插画配底部字幕',
    ...CAT_STYLE.narrative,
  },

  // ==================== 3. 屏幕字 (Screen Text) ====================
  {
    type: 'screen_text',
    category: 'screen_text',
    categoryLabel: '屏幕字',
    title: '屏幕文字',
    description: '任意坐标显示演出文字',
    ...CAT_STYLE.screen_text,
  },
  {
    type: 'chapter_title',
    category: 'screen_text',
    categoryLabel: '屏幕字',
    title: '章节大字',
    description: '章节序幕主副标题卡',
    ...CAT_STYLE.screen_text,
  },
  {
    type: 'floating_subtitle',
    category: 'screen_text',
    categoryLabel: '屏幕字',
    title: '电影字幕',
    description: '宽银幕黑边配居中台词',
    ...CAT_STYLE.screen_text,
  },
  {
    type: 'banner_notice',
    category: 'screen_text',
    categoryLabel: '屏幕字',
    title: '地点横幅',
    description: '显示时间与场景地点角标',
    ...CAT_STYLE.screen_text,
  },

  // ==================== 4. 角色 (Character) ====================
  {
    type: 'char_enter',
    category: 'character',
    categoryLabel: '角色',
    title: '角色入场',
    description: '角色立绘登场与过渡',
    ...CAT_STYLE.character,
  },
  {
    type: 'char_exit',
    category: 'character',
    categoryLabel: '角色',
    title: '角色退场',
    description: '角色立绘淡出离场',
    ...CAT_STYLE.character,
  },
  {
    type: 'char_expression',
    category: 'character',
    categoryLabel: '角色',
    title: '切换表情',
    description: '切换角色差分表情姿态',
    ...CAT_STYLE.character,
  },
  {
    type: 'char_move',
    category: 'character',
    categoryLabel: '角色',
    title: '角色移动',
    description: '立绘平滑位移与缩放',
    ...CAT_STYLE.character,
  },
  {
    type: 'char_action',
    category: 'character',
    categoryLabel: '角色',
    title: '立绘动作',
    description: '点头、跳跃或颤抖反馈',
    ...CAT_STYLE.character,
  },
  {
    type: 'char_highlight',
    category: 'character',
    categoryLabel: '角色',
    title: '聚焦高亮',
    description: '提亮说话者并压暗其余立绘',
    ...CAT_STYLE.character,
  },
  {
    type: 'affection_change',
    category: 'character',
    categoryLabel: '角色',
    title: '好感变更',
    description: '增减指定角色好感度',
    ...CAT_STYLE.character,
  },

  // ==================== 5. 视觉 (Visual) ====================
  {
    type: 'bg_switch',
    category: 'visual',
    categoryLabel: '视觉',
    title: '切换背景',
    description: '更换场景背景与转场',
    ...CAT_STYLE.visual,
  },
  {
    type: 'fade',
    category: 'visual',
    categoryLabel: '视觉',
    title: '淡入淡出',
    description: '画面、背景或立绘渐变',
    ...CAT_STYLE.visual,
  },
  {
    type: 'camera_pan_zoom',
    category: 'visual',
    categoryLabel: '视觉',
    title: '镜头推拉',
    description: '平滑缩放与焦点平移',
    ...CAT_STYLE.visual,
  },
  {
    type: 'camera_shake',
    category: 'visual',
    categoryLabel: '视觉',
    title: '镜头震动',
    description: '受击或惊愕震屏效果',
    ...CAT_STYLE.visual,
  },
  {
    type: 'screen_flash',
    category: 'visual',
    categoryLabel: '视觉',
    title: '画面闪光',
    description: '瞬间闪白或快门闪烁',
    ...CAT_STYLE.visual,
  },
  {
    type: 'weather_particles',
    category: 'visual',
    categoryLabel: '视觉',
    title: '天气粒子',
    description: '樱花、雨雪或萤火虫',
    ...CAT_STYLE.visual,
  },
  {
    type: 'color_filter',
    category: 'visual',
    categoryLabel: '视觉',
    title: '色彩滤镜',
    description: '怀旧、黑白或夜色滤镜',
    ...CAT_STYLE.visual,
  },
  {
    type: 'frame_animation',
    category: 'visual',
    categoryLabel: '视觉',
    title: '序列动画',
    description: '播放多图序列帧或视频',
    ...CAT_STYLE.visual,
  },

  // ==================== 6. 音频 (Audio) ====================
  {
    type: 'bgm_play',
    category: 'audio',
    categoryLabel: '音频',
    title: '播放音乐',
    description: '切换并循环背景音乐',
    ...CAT_STYLE.audio,
  },
  {
    type: 'bgm_stop',
    category: 'audio',
    categoryLabel: '音频',
    title: '停止音乐',
    description: '淡出停止当前背景音乐',
    ...CAT_STYLE.audio,
  },
  {
    type: 'sfx_play',
    category: 'audio',
    categoryLabel: '音频',
    title: '播放音效',
    description: '触发环境或动作音效',
    ...CAT_STYLE.audio,
  },
  {
    type: 'voice_play',
    category: 'audio',
    categoryLabel: '音频',
    title: '播放语音',
    description: '播放角色台词配音',
    ...CAT_STYLE.audio,
  },

  // ==================== 7. 界面与设置 (In-Game UI & Settings) ====================
  {
    type: 'ui_visibility',
    category: 'ui',
    categoryLabel: '界面',
    title: '显隐界面',
    description: '隐藏或恢复对话框界面',
    ...CAT_STYLE.ui,
  },
  {
    type: 'popup_toast',
    category: 'ui',
    categoryLabel: '界面',
    title: '弹窗提示',
    description: '顶部弹出道具或状态提示',
    ...CAT_STYLE.ui,
  },
  {
    type: 'clue_unlock',
    category: 'ui',
    categoryLabel: '界面',
    title: '解锁词条',
    description: '解锁情报或设定集词条',
    ...CAT_STYLE.ui,
  },
  {
    type: 'ui_theme_switch',
    category: 'ui',
    categoryLabel: '界面',
    title: '主题预设',
    description: '切换对话框整体预设风格',
    ...CAT_STYLE.ui,
  },
  {
    type: 'ui_style_switch',
    category: 'ui',
    categoryLabel: '界面',
    title: '界面样式',
    description: '动态修改对话框底色与透明度',
    ...CAT_STYLE.ui,
  },
  {
    type: 'game_settings_modify',
    category: 'ui',
    categoryLabel: '界面',
    title: '游戏设置',
    description: '调整语速音量或唤起设置页',
    ...CAT_STYLE.ui,
  },

  // ==================== 8. 脚本 (Script) ====================
  {
    type: 'set_variable',
    category: 'script',
    categoryLabel: '脚本',
    title: '变量赋值',
    description: '修改全局变量或标记',
    ...CAT_STYLE.script,
  },
  {
    type: 'script',
    category: 'script',
    categoryLabel: '脚本',
    title: '脚本桥接',
    description: '执行 TS / Lua / Python 逻辑',
    ...CAT_STYLE.script,
  },
];

export function getNodeMeta(type: WorkflowNodeType): NodeTypeMeta {
  return (
    NODE_REGISTRY.find((n) => n.type === type) || {
      type,
      category: 'narrative',
      categoryLabel: '叙事',
      title: '剧情节点',
      description: '基础视觉小说节点',
      ...CAT_STYLE.narrative,
    }
  );
}
