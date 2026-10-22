import { NodeCategory, NodeTypeMeta, WorkflowNodeType } from '../types';

export interface NodeCategoryInfo {
  id: NodeCategory;
  label: string; // 类型标
}

export const NODE_CATEGORIES: NodeCategoryInfo[] = [
  { id: 'control', label: '控制' },
  { id: 'narrative', label: '叙事' },
  { id: 'screen_text', label: '屏幕字' },
  { id: 'character', label: '角色' },
  { id: 'visual', label: '视觉' },
  { id: 'audio', label: '音频' },
  { id: 'ui', label: '界面' },
  { id: 'script', label: '脚本' },
];

const UNIFIED_BADGE = {
  accentColor: '#71717a',
  badgeBg: '#27272a',
  badgeText: '#d4d4d8',
};

export const NODE_REGISTRY: NodeTypeMeta[] = [
  // ==================== 1. 控制 (8) ====================
  {
    type: 'choice',
    category: 'control',
    categoryLabel: '控制',
    title: '分支选项',
    description: '玩家多选一跳转',
    ...UNIFIED_BADGE,
  },
  {
    type: 'timed_choice',
    category: 'control',
    categoryLabel: '控制',
    title: '限时抉择',
    description: '倒计时选项',
    ...UNIFIED_BADGE,
  },
  {
    type: 'condition',
    category: 'control',
    categoryLabel: '控制',
    title: '条件判断',
    description: '好感/变量 If 分流',
    ...UNIFIED_BADGE,
  },
  {
    type: 'switch_branch',
    category: 'control',
    categoryLabel: '控制',
    title: '多路路由',
    description: 'Switch 多出口分流',
    ...UNIFIED_BADGE,
  },
  {
    type: 'wait_timer',
    category: 'control',
    categoryLabel: '控制',
    title: '延时等待',
    description: '暂停指定毫秒',
    ...UNIFIED_BADGE,
  },
  {
    type: 'jump_chapter',
    category: 'control',
    categoryLabel: '控制',
    title: '章节跳转',
    description: '跳至指定章节',
    ...UNIFIED_BADGE,
  },
  {
    type: 'random_branch',
    category: 'control',
    categoryLabel: '控制',
    title: '随机分支',
    description: '按权重随机流转',
    ...UNIFIED_BADGE,
  },
  {
    type: 'end',
    category: 'control',
    categoryLabel: '控制',
    title: '结局终点',
    description: '触发结局画面',
    ...UNIFIED_BADGE,
  },

  // ==================== 2. 叙事 (4) ====================
  {
    type: 'dialogue',
    category: 'narrative',
    categoryLabel: '叙事',
    title: '标准对话',
    description: '角色发言与台词序列',
    ...UNIFIED_BADGE,
  },
  {
    type: 'narration',
    category: 'narrative',
    categoryLabel: '叙事',
    title: '环境旁白',
    description: '第三人称叙述',
    ...UNIFIED_BADGE,
  },
  {
    type: 'inner_monologue',
    category: 'narrative',
    categoryLabel: '叙事',
    title: '内心独白',
    description: '第一人称心理活动',
    ...UNIFIED_BADGE,
  },
  {
    type: 'cg_caption',
    category: 'narrative',
    categoryLabel: '叙事',
    title: 'CG 台词',
    description: '全屏特写精简字幕',
    ...UNIFIED_BADGE,
  },

  // ==================== 3. 屏幕字 (4) ====================
  {
    type: 'screen_text',
    category: 'screen_text',
    categoryLabel: '屏幕字',
    title: '屏幕文字',
    description: '画面任意坐标自由显示文字',
    ...UNIFIED_BADGE,
  },
  {
    type: 'chapter_title',
    category: 'screen_text',
    categoryLabel: '屏幕字',
    title: '章节幕布',
    description: '全屏章节标题转场',
    ...UNIFIED_BADGE,
  },
  {
    type: 'floating_subtitle',
    category: 'screen_text',
    categoryLabel: '屏幕字',
    title: '电影字幕',
    description: '上下黑边无框字幕',
    ...UNIFIED_BADGE,
  },
  {
    type: 'banner_notice',
    category: 'screen_text',
    categoryLabel: '屏幕字',
    title: '地点横幅',
    description: '左上角时间与地点角标',
    ...UNIFIED_BADGE,
  },

  // ==================== 4. 角色 (7) ====================
  {
    type: 'char_enter',
    category: 'character',
    categoryLabel: '角色',
    title: '角色登场',
    description: '立绘进入舞台',
    ...UNIFIED_BADGE,
  },
  {
    type: 'char_expression',
    category: 'character',
    categoryLabel: '角色',
    title: '切换表情',
    description: '切换角色差分立绘',
    ...UNIFIED_BADGE,
  },
  {
    type: 'char_move',
    category: 'character',
    categoryLabel: '角色',
    title: '平滑位移',
    description: '立绘位置与缩放补间',
    ...UNIFIED_BADGE,
  },
  {
    type: 'char_action',
    category: 'character',
    categoryLabel: '角色',
    title: '动作演出',
    description: '跳跃/点头/颤抖',
    ...UNIFIED_BADGE,
  },
  {
    type: 'char_highlight',
    category: 'character',
    categoryLabel: '角色',
    title: '焦点聚光',
    description: '高亮说话人',
    ...UNIFIED_BADGE,
  },
  {
    type: 'char_exit',
    category: 'character',
    categoryLabel: '角色',
    title: '角色退场',
    description: '立绘淡出舞台',
    ...UNIFIED_BADGE,
  },
  {
    type: 'affection_change',
    category: 'character',
    categoryLabel: '角色',
    title: '好感变更',
    description: '增减角色好感度',
    ...UNIFIED_BADGE,
  },

  // ==================== 5. 视觉 (8) ====================
  {
    type: 'bg_switch',
    category: 'visual',
    categoryLabel: '视觉',
    title: '切换背景',
    description: '更换场景背景图',
    ...UNIFIED_BADGE,
  },
  {
    type: 'fade',
    category: 'visual',
    categoryLabel: '视觉',
    title: '淡入淡出',
    description: '画面/角色/背景渐变',
    ...UNIFIED_BADGE,
  },
  {
    type: 'camera_pan_zoom',
    category: 'visual',
    categoryLabel: '视觉',
    title: '镜头推拉',
    description: '缩放与焦点偏移',
    ...UNIFIED_BADGE,
  },
  {
    type: 'camera_shake',
    category: 'visual',
    categoryLabel: '视觉',
    title: '屏幕震动',
    description: '镜头震动特效',
    ...UNIFIED_BADGE,
  },
  {
    type: 'screen_flash',
    category: 'visual',
    categoryLabel: '视觉',
    title: '屏幕闪光',
    description: '瞬时白闪/红闪',
    ...UNIFIED_BADGE,
  },
  {
    type: 'weather_particles',
    category: 'visual',
    categoryLabel: '视觉',
    title: '天气粒子',
    description: '樱花/雨/雪/萤火',
    ...UNIFIED_BADGE,
  },
  {
    type: 'color_filter',
    category: 'visual',
    categoryLabel: '视觉',
    title: '色调滤镜',
    description: '怀旧/黑白/夜色',
    ...UNIFIED_BADGE,
  },
  {
    type: 'frame_animation',
    category: 'visual',
    categoryLabel: '视觉',
    title: '序列动画',
    description: '多图帧动画与视频',
    ...UNIFIED_BADGE,
  },

  // ==================== 6. 音频 (4) ====================
  {
    type: 'bgm_play',
    category: 'audio',
    categoryLabel: '音频',
    title: '播放音乐',
    description: '切换背景音乐',
    ...UNIFIED_BADGE,
  },
  {
    type: 'bgm_stop',
    category: 'audio',
    categoryLabel: '音频',
    title: '停止音乐',
    description: '淡出当前音乐',
    ...UNIFIED_BADGE,
  },
  {
    type: 'sfx_play',
    category: 'audio',
    categoryLabel: '音频',
    title: '播放音效',
    description: '单次环境音效',
    ...UNIFIED_BADGE,
  },
  {
    type: 'voice_play',
    category: 'audio',
    categoryLabel: '音频',
    title: '角色语音',
    description: '播放配音通道',
    ...UNIFIED_BADGE,
  },

  // ==================== 7. 界面 (4) ====================
  {
    type: 'ui_visibility',
    category: 'ui',
    categoryLabel: '界面',
    title: '显隐界面',
    description: '隐藏或恢复对话框',
    ...UNIFIED_BADGE,
  },
  {
    type: 'popup_toast',
    category: 'ui',
    categoryLabel: '界面',
    title: '顶部提示',
    description: '弹出轻量通知',
    ...UNIFIED_BADGE,
  },
  {
    type: 'clue_unlock',
    category: 'ui',
    categoryLabel: '界面',
    title: '解锁词条',
    description: '记录推理线索',
    ...UNIFIED_BADGE,
  },
  {
    type: 'ui_theme_switch',
    category: 'ui',
    categoryLabel: '界面',
    title: '切换主题',
    description: '更换对话框配色',
    ...UNIFIED_BADGE,
  },

  // ==================== 8. 脚本 (2) ====================
  {
    type: 'set_variable',
    category: 'script',
    categoryLabel: '数据',
    title: '变量赋值',
    description: '修改变量或属性',
    ...UNIFIED_BADGE,
  },
  {
    type: 'script',
    category: 'script',
    categoryLabel: '脚本',
    title: '代码脚本',
    description: 'TS / Lua / Python',
    ...UNIFIED_BADGE,
  },
];

export function getNodeMeta(type: WorkflowNodeType): NodeTypeMeta {
  return (
    NODE_REGISTRY.find((n) => n.type === type) || {
      type,
      category: 'narrative',
      categoryLabel: '叙事',
      title: type,
      description: '',
      ...UNIFIED_BADGE,
    }
  );
}
