import {
  ChapterDef,
  CharacterDef,
  EndingDef,
  GameSettings,
  GodotNode2D,
  SceneDef,
  ScriptFile,
  StorylineDef,
  WorkflowEdge,
  WorkflowNode,
} from '../types/moovn';

export const INITIAL_CHARACTERS: CharacterDef[] = [
  {
    id: 'char_shizuki',
    name: '汐月 (Shizuki)',
    roleTitle: '深海观测所·首席记录官',
    themeColor: '#38bdf8',
    hairColor: '#bae6fd',
    eyeColor: '#0284c7',
    outfitColor: '#0f294a',
    bio: '驻守在零度深海观测站的少女，手中总是握着一枚停留在23:59的蔚蓝怀表。',
    initialAffection: 30,
    affection: 30,
    maxAffection: 100,
    expressions: ['normal', 'smile', 'shy', 'surprised', 'sad', 'serious'],
    customAttributes: [
      { key: 'sync_rate', label: '深海同步率', type: 'number', value: 78 },
      { key: 'sanity', label: '理智值 (SAN)', type: 'number', value: 92 },
      { key: 'relic', label: '持有信物', type: 'string', value: '蔚蓝怀表' },
      { key: 'awakened', label: '记忆共鸣', type: 'boolean', value: true },
    ],
  },
  {
    id: 'char_rinne',
    name: '凛音 (Rinne)',
    roleTitle: '深蓝夜行线·列车长',
    themeColor: '#60a5fa',
    hairColor: '#1e3a8a',
    eyeColor: '#60a5fa',
    outfitColor: '#172554',
    bio: '驾驶穿梭于雨夜与记忆夹缝列车的神秘少女，知晓前往不同结局的月台编号。',
    initialAffection: 20,
    affection: 20,
    maxAffection: 100,
    expressions: ['normal', 'smile', 'shy', 'surprised', 'sad', 'serious'],
    customAttributes: [
      { key: 'ticket_count', label: '回溯车票数', type: 'number', value: 3 },
      { key: 'trust_level', label: '信赖等级', type: 'number', value: 65 },
      { key: 'station_key', label: '零号月台钥匙', type: 'boolean', value: false },
    ],
  },
  {
    id: 'char_souma',
    name: '苍真 (Souma)',
    roleTitle: '星航档案馆·守密人',
    themeColor: '#818cf8',
    hairColor: '#312e81',
    eyeColor: '#818cf8',
    outfitColor: '#1e1b4b',
    bio: '负责整理旧世界记忆磁带的青年学者，理性冷静，却始终在寻找遗失的第13号档案。',
    initialAffection: 15,
    affection: 15,
    maxAffection: 100,
    expressions: ['normal', 'smile', 'shy', 'surprised', 'sad', 'serious'],
    customAttributes: [
      { key: 'clue_count', label: '掌握线索数', type: 'number', value: 4 },
      { key: 'clearance', label: '档案权限', type: 'string', value: 'Level-3' },
    ],
  },
];

export const INITIAL_STORYLINES: StorylineDef[] = [
  {
    id: 'line_main_blue',
    name: '蔚蓝序曲·主线剧情',
    color: '#38bdf8',
    description: '从雨夜终电车站启程，逐步揭开深海观测所与时间回溯之谜的核心主线。',
    unlockCondition: '默认开启（第一章自动进入）',
  },
  {
    id: 'line_deep_truth',
    name: '深海回响·真相线',
    color: '#2dd4bf',
    description: '与汐月建立深层羁绊，潜入深海零号档案室改写观测结局。',
    unlockCondition: '汐月好感度 >= 45 或 深海同步率 >= 85',
  },
  {
    id: 'line_starlight_train',
    name: '星轨夜行·凛音线',
    color: '#818cf8',
    description: '跟随列车长凛音登上开往星海尽头的零点列车。',
    unlockCondition: '在场景 6 / 场景 10 选择登上夜行列车，且凛音好感度 >= 30',
  },
];

export const INITIAL_ENDINGS: EndingDef[] = [
  {
    id: 'end_true_dawn',
    code: 'TRUE END · 01',
    title: '跨越深海的蔚蓝黎明',
    type: 'TRUE',
    storylineId: 'line_deep_truth',
    conditionText: '汐月好感度 >= 50 且 深海同步率 >= 80',
    description: '怀表的指针终于跨越了午夜零点，深海与星空交汇之处迎来了真正的破晓。',
    bgPreset: 'dawn_harbor',
  },
  {
    id: 'end_good_star',
    code: 'GOOD END · 02',
    title: '银河铁道的守望者',
    type: 'GOOD',
    storylineId: 'line_starlight_train',
    conditionText: '凛音好感度 >= 35 且 选择「与凛音一同鸣响汽笛」',
    description: '列车穿过雨幕驶向无垠星海，你们成为了守望无数平行世界的故事记录者。',
    bgPreset: 'starlight_deck',
  },
  {
    id: 'end_normal_station',
    code: 'NORMAL END · 03',
    title: '雨停之后的重逢站台',
    type: 'NORMAL',
    storylineId: 'line_main_blue',
    conditionText: '完成主线但未满足真结局好感度阈值',
    description: '漫长的雨季终于结束，虽然深海的秘密仍未完全揭晓，但日常的温柔依然延续。',
    bgPreset: 'rainy_station',
  },
  {
    id: 'end_bad_abyss',
    code: 'BAD END · 04',
    title: '沉没于零度深蓝',
    type: 'BAD',
    storylineId: 'line_main_blue',
    conditionText: '理智值 < 60 或 在关键抉择中放弃观测核心',
    description: '观测站的灯光在深海重压下逐一熄灭，时间永远凝固在了那场滂沱大雨之中。',
    bgPreset: 'deep_sea_observatory',
  },
];

export const INITIAL_CHAPTERS: ChapterDef[] = [
  {
    id: 'chap_1',
    number: 1,
    title: '第一章：雨夜终电与蔚蓝怀表',
    subtitle: 'Chapter 01 · Rainy Station & Azure Watch',
    storylineId: 'line_main_blue',
    description: '午夜23:59的潮汐车站，停滞的怀表与突然到访的深海观测官汐月。',
  },
  {
    id: 'chap_2',
    number: 2,
    title: '第二章：零度深海观测所',
    subtitle: 'Chapter 02 · Zero-Degree Abyss Observatory',
    storylineId: 'line_deep_truth',
    description: '潜入海底三千米的玻璃穹顶，每一句对话都将改变观测者的同步率与命运。',
  },
  {
    id: 'chap_3',
    number: 3,
    title: '第三章：星海分歧与终局抉择',
    subtitle: 'Chapter 03 · Divergence of Starlight & Finale',
    storylineId: 'line_deep_truth',
    description: '当第10号观测节点抵达，过往的记忆与好感度将决定通往哪一个结局。',
  },
];

export const INITIAL_SCENES: SceneDef[] = [
  // ==================== 第一章 (场景 1 ~ 场景 4) ====================
  {
    id: 'scene_01',
    chapterId: 'chap_1',
    globalNumber: 1,
    title: '场景 1：序幕·雨夜潮汐站',
    storylineId: 'line_main_blue',
    background: {
      presetId: 'rainy_station',
      weather: 'rain',
      tint: '#0d2240',
      blur: 0,
      isAnimated: true,
    },
    audio: {
      bgmId: 'rain_echo',
      bgmVolume: 75,
      sfxId: 'rain_ambience',
    },
    characters: [
      {
        characterId: 'char_shizuki',
        expression: 'normal',
        x: 50,
        y: 56,
        scale: 1.0,
        alpha: 1.0,
        flipX: false,
        zIndex: 2,
        animation: 'fade_in',
        speakingHighlight: true,
      },
    ],
    dialogue: {
      speakerId: 'char_shizuki',
      speakerName: '汐月',
      text: '「终于找到你了……在这座被雨水浸透的潮汐车站。你看，怀表上的指针已经停在 23:59 整整七个小时了。」',
      affectionDelta: { characterId: 'char_shizuki', delta: 2 },
    },
    choices: [],
    nextSceneId: 'scene_02',
    scriptBinding: {
      language: 'lua',
      code: `-- 场景 1 初始化脚本 (Lua)\nmoovn.bg("rainy_station", { weather = "rain", animated = true })\nmoovn.char("char_shizuki", { expr = "normal", x = 50, y = 56 })\nmoovn.say("汐月", "终于找到你了……在这座被雨水浸透的潮汐车站。")`,
    },
  },
  {
    id: 'scene_02',
    chapterId: 'chap_1',
    globalNumber: 2,
    title: '场景 2：怀表的低语（仅改对话同布景）',
    storylineId: 'line_main_blue',
    background: {
      presetId: 'rainy_station',
      weather: 'rain',
      tint: '#0d2240',
      blur: 0,
      isAnimated: true,
    },
    audio: {
      bgmId: 'rain_echo',
      bgmVolume: 75,
      sfxId: 'chime',
    },
    characters: [
      {
        characterId: 'char_shizuki',
        expression: 'serious',
        x: 50,
        y: 56,
        scale: 1.0,
        alpha: 1.0,
        flipX: false,
        zIndex: 2,
        animation: 'breathe',
        speakingHighlight: true,
      },
    ],
    dialogue: {
      speakerId: 'char_shizuki',
      speakerName: '汐月',
      text: '「即使周围的风景和站台没有丝毫变化，只要我们的对话继续向前推进，时间就会在观测记录中生成新的场景节点。」',
    },
    choices: [],
    nextSceneId: 'scene_03',
  },
  {
    id: 'scene_03',
    chapterId: 'chap_1',
    globalNumber: 3,
    title: '场景 3：列车长的现身',
    storylineId: 'line_main_blue',
    background: {
      presetId: 'rainy_station',
      weather: 'rain',
      tint: '#0a1c38',
      blur: 0,
      isAnimated: true,
    },
    audio: {
      bgmId: 'rain_echo',
      bgmVolume: 80,
      sfxId: 'train_bell',
    },
    characters: [
      {
        characterId: 'char_shizuki',
        expression: 'surprised',
        x: 32,
        y: 56,
        scale: 0.96,
        alpha: 0.92,
        flipX: false,
        zIndex: 2,
        animation: 'slide_left',
        speakingHighlight: false,
      },
      {
        characterId: 'char_rinne',
        expression: 'smile',
        x: 68,
        y: 56,
        scale: 1.0,
        alpha: 1.0,
        flipX: true,
        zIndex: 3,
        animation: 'slide_right',
        speakingHighlight: true,
      },
    ],
    dialogue: {
      speakerId: 'char_rinne',
      speakerName: '凛音',
      text: '「叮铃——各位乘客请注意，开往『零度深海观测所』的深蓝夜行列车即将进站，请拿好您手中的记忆车票。」',
      affectionDelta: { characterId: 'char_rinne', delta: 3 },
    },
    choices: [],
    nextSceneId: 'scene_04',
  },
  {
    id: 'scene_04',
    chapterId: 'chap_1',
    globalNumber: 4,
    title: '场景 4：月台上的第一次抉择',
    storylineId: 'line_main_blue',
    background: {
      presetId: 'rainy_station',
      weather: 'rain',
      tint: '#0a1c38',
      blur: 0,
      isAnimated: true,
    },
    audio: {
      bgmId: 'blue_nocturne',
      bgmVolume: 80,
      sfxId: 'heartbeat',
    },
    characters: [
      {
        characterId: 'char_shizuki',
        expression: 'shy',
        x: 32,
        y: 56,
        scale: 1.0,
        alpha: 1.0,
        flipX: false,
        zIndex: 3,
        animation: 'breathe',
        speakingHighlight: true,
      },
      {
        characterId: 'char_rinne',
        expression: 'normal',
        x: 68,
        y: 56,
        scale: 0.95,
        alpha: 0.9,
        flipX: true,
        zIndex: 2,
        animation: 'none',
        speakingHighlight: false,
      },
    ],
    dialogue: {
      speakerId: 'char_shizuki',
      speakerName: '汐月',
      text: '「车门已经打开了。在登上列车之前……你愿意先握住我的手，与深海观测仪进行一次记忆同步吗？」',
    },
    choices: [
      {
        id: 'c_04_1',
        text: '握住汐月的手，启动深海记忆同步（汐月好感度 +15，深海同步率 +10）',
        targetSceneId: 'scene_05',
        affectionChanges: [{ characterId: 'char_shizuki', delta: 15 }],
        attributeChanges: [{ characterId: 'char_shizuki', key: 'sync_rate', deltaOrValue: 88 }],
      },
      {
        id: 'c_04_2',
        text: '向列车长凛音询问零号月台的秘密车票（凛音好感度 +15，获得车票线索）',
        targetSceneId: 'scene_05',
        affectionChanges: [{ characterId: 'char_rinne', delta: 15 }],
        attributeChanges: [{ characterId: 'char_rinne', key: 'station_key', deltaOrValue: true }],
      },
      {
        id: 'c_04_3',
        text: '保持冷静，独自检视站台上的时间裂缝记录',
        targetSceneId: 'scene_05',
        affectionChanges: [{ characterId: 'char_souma', delta: 10 }],
      },
    ],
    nextSceneId: 'scene_05',
  },

  // ==================== 第二章 (场景 5 ~ 场景 9) ====================
  {
    id: 'scene_05',
    chapterId: 'chap_2',
    globalNumber: 5,
    title: '场景 5：潜入·零度深海观测所',
    storylineId: 'line_deep_truth',
    background: {
      presetId: 'deep_sea_observatory',
      weather: 'bubbles',
      tint: '#071e3d',
      blur: 0,
      isAnimated: true,
    },
    audio: {
      bgmId: 'blue_nocturne',
      bgmVolume: 85,
      sfxId: 'wave_crash',
    },
    characters: [
      {
        characterId: 'char_shizuki',
        expression: 'smile',
        x: 50,
        y: 56,
        scale: 1.02,
        alpha: 1.0,
        flipX: false,
        zIndex: 2,
        animation: 'fade_in',
        speakingHighlight: true,
      },
    ],
    dialogue: {
      speakerId: 'char_shizuki',
      speakerName: '汐月',
      text: '「欢迎来到海底三千米的『零度深海观测所』。透过这面巨大的强化玻璃穹顶，你可以看见发光的深海冥水母正在巡游。」',
    },
    choices: [],
    nextSceneId: 'scene_06',
  },
  {
    id: 'scene_06',
    chapterId: 'chap_2',
    globalNumber: 6,
    title: '场景 6：穹顶下的观测日志（仅改对话）',
    storylineId: 'line_deep_truth',
    background: {
      presetId: 'deep_sea_observatory',
      weather: 'bubbles',
      tint: '#071e3d',
      blur: 0,
      isAnimated: true,
    },
    audio: {
      bgmId: 'blue_nocturne',
      bgmVolume: 85,
      sfxId: 'page_turn',
    },
    characters: [
      {
        characterId: 'char_shizuki',
        expression: 'normal',
        x: 50,
        y: 56,
        scale: 1.02,
        alpha: 1.0,
        flipX: false,
        zIndex: 2,
        animation: 'none',
        speakingHighlight: true,
      },
    ],
    dialogue: {
      speakerId: 'char_shizuki',
      speakerName: '汐月',
      text: '「这里的每一份 YAML 观测档案，都忠实记录着角色的位置、表情与心意的变化。哪怕只是多说一句话，也是一段独立的场景记忆。」',
    },
    choices: [],
    nextSceneId: 'scene_07',
  },
  {
    id: 'scene_07',
    chapterId: 'chap_2',
    globalNumber: 7,
    title: '场景 7：守密人苍真的警告',
    storylineId: 'line_deep_truth',
    background: {
      presetId: 'cyber_archive',
      weather: 'starlight',
      tint: '#0b1933',
      blur: 0,
      isAnimated: true,
    },
    audio: {
      bgmId: 'tension_pulse',
      bgmVolume: 80,
      sfxId: 'page_turn',
    },
    characters: [
      {
        characterId: 'char_shizuki',
        expression: 'serious',
        x: 30,
        y: 56,
        scale: 0.96,
        alpha: 0.92,
        flipX: false,
        zIndex: 2,
        animation: 'none',
        speakingHighlight: false,
      },
      {
        characterId: 'char_souma',
        expression: 'serious',
        x: 70,
        y: 56,
        scale: 1.0,
        alpha: 1.0,
        flipX: true,
        zIndex: 3,
        animation: 'fade_in',
        speakingHighlight: true,
      },
    ],
    dialogue: {
      speakerId: 'char_souma',
      speakerName: '苍真',
      text: '「第 10 号临界场景即将到来。根据星航档案馆的推演，只有已观测过的场景才能使用『快进』跨越，未知的未来必须亲自抉择。」',
    },
    choices: [],
    nextSceneId: 'scene_08',
  },
  {
    id: 'scene_08',
    chapterId: 'chap_2',
    globalNumber: 8,
    title: '场景 8：档案室的暗号确认',
    storylineId: 'line_deep_truth',
    background: {
      presetId: 'cyber_archive',
      weather: 'starlight',
      tint: '#0b1933',
      blur: 0,
      isAnimated: true,
    },
    audio: {
      bgmId: 'tension_pulse',
      bgmVolume: 80,
      sfxId: 'chime',
    },
    characters: [
      {
        characterId: 'char_shizuki',
        expression: 'shy',
        x: 30,
        y: 56,
        scale: 1.0,
        alpha: 1.0,
        flipX: false,
        zIndex: 3,
        animation: 'bounce',
        speakingHighlight: true,
      },
      {
        characterId: 'char_souma',
        expression: 'smile',
        x: 70,
        y: 56,
        scale: 0.95,
        alpha: 0.9,
        flipX: true,
        zIndex: 2,
        animation: 'none',
        speakingHighlight: false,
      },
    ],
    dialogue: {
      speakerId: 'char_shizuki',
      speakerName: '汐月',
      text: '「别担心，无论重复多少次轮回，我都会在观测站的终端前等待你的信号。」',
      affectionDelta: { characterId: 'char_shizuki', delta: 5 },
    },
    choices: [],
    nextSceneId: 'scene_09',
  },

  // ==================== 第三章 (场景 9 ~ 场景 12) ====================
  {
    id: 'scene_09',
    chapterId: 'chap_3',
    globalNumber: 9,
    title: '场景 9：星光甲板上的夜风',
    storylineId: 'line_deep_truth',
    background: {
      presetId: 'starlight_deck',
      weather: 'starlight',
      tint: '#081b38',
      blur: 0,
      isAnimated: true,
    },
    audio: {
      bgmId: 'starlight_waltz',
      bgmVolume: 85,
      sfxId: 'wave_crash',
    },
    characters: [
      {
        characterId: 'char_shizuki',
        expression: 'smile',
        x: 38,
        y: 56,
        scale: 1.0,
        alpha: 1.0,
        flipX: false,
        zIndex: 3,
        animation: 'fade_in',
        speakingHighlight: true,
      },
      {
        characterId: 'char_rinne',
        expression: 'smile',
        x: 66,
        y: 56,
        scale: 0.98,
        alpha: 0.95,
        flipX: true,
        zIndex: 2,
        animation: 'fade_in',
        speakingHighlight: false,
      },
    ],
    dialogue: {
      speakerId: 'char_shizuki',
      speakerName: '汐月',
      text: '「我们浮上海面了！看呐，漫天星河倒映在深蓝色的海面上，就像无数条交织的剧情线。」',
    },
    choices: [],
    nextSceneId: 'scene_10',
  },
  {
    id: 'scene_10',
    chapterId: 'chap_3',
    globalNumber: 10,
    title: '场景 10：第十号观测奇点（快进校验节点）',
    storylineId: 'line_deep_truth',
    background: {
      presetId: 'starlight_deck',
      weather: 'starlight',
      tint: '#081b38',
      blur: 0,
      isAnimated: true,
    },
    audio: {
      bgmId: 'starlight_waltz',
      bgmVolume: 90,
      sfxId: 'heartbeat',
    },
    characters: [
      {
        characterId: 'char_shizuki',
        expression: 'serious',
        x: 35,
        y: 56,
        scale: 1.0,
        alpha: 1.0,
        flipX: false,
        zIndex: 3,
        animation: 'breathe',
        speakingHighlight: true,
      },
      {
        characterId: 'char_rinne',
        expression: 'normal',
        x: 67,
        y: 56,
        scale: 1.0,
        alpha: 1.0,
        flipX: true,
        zIndex: 2,
        animation: 'none',
        speakingHighlight: false,
      },
    ],
    dialogue: {
      speakerId: 'char_shizuki',
      speakerName: '汐月',
      text: '「这里就是『场景 10：第十号观测奇点』。如果你曾游玩到这里并重新开启新游戏，快进功能会精准停在场景 10，等待你探索之后的未知结局！」',
    },
    choices: [
      {
        id: 'c_10_true',
        text: '将蔚蓝怀表拨向 00:00，与汐月共赴深海黎明（进入场景 11 · 真结局线）',
        targetSceneId: 'scene_11',
        affectionChanges: [{ characterId: 'char_shizuki', delta: 15 }],
      },
      {
        id: 'c_10_star',
        text: '接过凛音的银河列车车票，鸣响星海汽笛（进入场景 12 · 星轨结局线）',
        targetSceneId: 'scene_12',
        affectionChanges: [{ characterId: 'char_rinne', delta: 15 }],
      },
    ],
    nextSceneId: 'scene_11',
  },
  {
    id: 'scene_11',
    chapterId: 'chap_3',
    globalNumber: 11,
    title: '场景 11：终章·跨越深海的蔚蓝黎明 (TRUE END)',
    storylineId: 'line_deep_truth',
    background: {
      presetId: 'dawn_harbor',
      weather: 'fireflies',
      tint: '#0c2d57',
      blur: 0,
      isAnimated: true,
    },
    audio: {
      bgmId: 'dawn_promise',
      bgmVolume: 95,
      sfxId: 'chime',
    },
    characters: [
      {
        characterId: 'char_shizuki',
        expression: 'smile',
        x: 50,
        y: 56,
        scale: 1.05,
        alpha: 1.0,
        flipX: false,
        zIndex: 3,
        animation: 'bounce',
        speakingHighlight: true,
      },
    ],
    dialogue: {
      speakerId: 'char_shizuki',
      speakerName: '汐月',
      text: '「天亮了……怀表的秒针重新开始跳动了！谢谢你跨越十个场景的时间回廊来到我身边——这是属于我们的蔚蓝黎明。【达成结局：TRUE END · 跨越深海的蔚蓝黎明】」',
    },
    choices: [],
    nextSceneId: null,
    endingId: 'end_true_dawn',
  },
  {
    id: 'scene_12',
    chapterId: 'chap_3',
    globalNumber: 12,
    title: '场景 12：终章·银河铁道的守望者 (GOOD END)',
    storylineId: 'line_starlight_train',
    background: {
      presetId: 'starlight_deck',
      weather: 'starlight',
      tint: '#0d1b42',
      blur: 0,
      isAnimated: true,
    },
    audio: {
      bgmId: 'starlight_waltz',
      bgmVolume: 95,
      sfxId: 'train_bell',
    },
    characters: [
      {
        characterId: 'char_rinne',
        expression: 'smile',
        x: 50,
        y: 56,
        scale: 1.05,
        alpha: 1.0,
        flipX: false,
        zIndex: 3,
        animation: 'bounce',
        speakingHighlight: true,
      },
    ],
    dialogue: {
      speakerId: 'char_rinne',
      speakerName: '凛音',
      text: '「前方到站——无垠星海终点站！只要有你在列车长室陪伴，无论多少条世界线我们都能抵达。【达成结局：GOOD END · 银河铁道的守望者】」',
    },
    choices: [],
    nextSceneId: null,
    endingId: 'end_good_star',
  },
];

export const INITIAL_WORKFLOW_NODES: WorkflowNode[] = [
  {
    id: 'wf_start',
    type: 'start',
    title: '开始触发器 (Start)',
    subtitle: '游戏入口 · 第一章初始化',
    x: 60,
    y: 180,
    config: { entryChapter: 'chap_1', entryScene: 'scene_01' },
  },
  {
    id: 'wf_bg_station',
    type: 'background',
    title: '背景节点 · 雨夜潮汐站',
    subtitle: 'preset: rainy_station | 天气: rain',
    x: 320,
    y: 80,
    sceneId: 'scene_01',
    config: { presetId: 'rainy_station', weather: 'rain', animated: true },
  },
  {
    id: 'wf_audio_bgm',
    type: 'audio',
    title: '音效/BGM节点 · 雨声回响',
    subtitle: 'BGM: rain_echo | SFX: rain_ambience',
    x: 320,
    y: 280,
    sceneId: 'scene_01',
    config: { bgmId: 'rain_echo', sfxId: 'rain_ambience', volume: 75 },
  },
  {
    id: 'wf_char_shizuki',
    type: 'character',
    title: '角色节点 · 汐月登场',
    subtitle: '位置(50%, 56%) | 表情: normal | 好感度+2',
    x: 610,
    y: 180,
    sceneId: 'scene_01',
    config: { characterId: 'char_shizuki', expression: 'normal', x: 50, y: 56, affectionDelta: 2 },
  },
  {
    id: 'wf_dlg_01',
    type: 'dialogue',
    title: '对话节点 · 场景1~3 连续台词',
    subtitle: '汐月 & 凛音 对话流 -> 自动映射为独立场景',
    x: 900,
    y: 180,
    sceneId: 'scene_03',
    config: { speaker: '汐月 / 凛音', scenes: ['scene_01', 'scene_02', 'scene_03'] },
  },
  {
    id: 'wf_choice_04',
    type: 'choice',
    title: '分支选项 · 场景4 月台抉择',
    subtitle: '3个分支选项 · 动态修改好感度与自定义属性',
    x: 1190,
    y: 180,
    sceneId: 'scene_04',
    config: { choiceCount: 3, targetScene: 'scene_05' },
  },
  {
    id: 'wf_script_teal',
    type: 'script',
    title: '脚本节点 · Teal/Lua 好感度判定',
    subtitle: '校验 汐月好感度 >= 45 & 同步率 >= 80',
    x: 1480,
    y: 100,
    sceneId: 'scene_10',
    config: {
      language: 'teal',
      code: `local affection: number = moovn.get_affection("char_shizuki")\nif affection >= 45 then\n  moovn.route("scene_11")\nelse\n  moovn.route("scene_12")\nend`,
    },
  },
  {
    id: 'wf_end_true',
    type: 'ending',
    title: '结局节点 · 蔚蓝黎明 / 星海铁道',
    subtitle: 'TRUE END (场景11) / GOOD END (场景12)',
    x: 1770,
    y: 180,
    sceneId: 'scene_11',
    config: { endings: ['end_true_dawn', 'end_good_star'] },
  },
];

export const INITIAL_WORKFLOW_EDGES: WorkflowEdge[] = [
  { id: 'e1', source: 'wf_start', target: 'wf_bg_station', label: '初始化背景' },
  { id: 'e2', source: 'wf_start', target: 'wf_audio_bgm', label: '加载音频' },
  { id: 'e3', source: 'wf_bg_station', target: 'wf_char_shizuki', label: '舞台就绪' },
  { id: 'e4', source: 'wf_audio_bgm', target: 'wf_char_shizuki', label: '音轨同步' },
  { id: 'e5', source: 'wf_char_shizuki', target: 'wf_dlg_01', label: '触发台词' },
  { id: 'e6', source: 'wf_dlg_01', target: 'wf_choice_04', label: '进入抉择' },
  { id: 'e7', source: 'wf_choice_04', target: 'wf_script_teal', label: '深海线校验' },
  { id: 'e8', source: 'wf_script_teal', target: 'wf_end_true', label: '结局分流' },
];

export const INITIAL_SCRIPTS: ScriptFile[] = [
  {
    id: 'script_teal',
    name: 'story_router.tl',
    path: 'scripts/story_router.tl',
    language: 'teal',
    content: `-- MooVN Teal 强类型视觉小说脚本 (Teal -> Lua)
record CharacterState
  id: string
  affection: integer
  sync_rate: number
end

local function check_ending_route(shizuki: CharacterState): string
  moovn.log("正在使用 Teal 类型安全脚本评估结局分支...")
  if shizuki.affection >= 45 and shizuki.sync_rate >= 80.0 then
    moovn.bg("dawn_harbor", { weather = "fireflies" })
    moovn.say("汐月", "怀表的指针终于跨越了零点，欢迎来到蔚蓝黎明！")
    return "end_true_dawn"
  else
    moovn.bg("starlight_deck", { weather = "starlight" })
    moovn.say("凛音", "登上星海列车吧，下一站是银河终点！")
    return "end_good_star"
  end
end

return {
  check_ending_route = check_ending_route
}`,
    visualBlocks: [
      { id: 'vb_1', category: 'character', command: 'get_affection', params: { characterId: 'char_shizuki', min: 45 } },
      { id: 'vb_2', category: 'scene', command: 'set_background', params: { preset: 'dawn_harbor', weather: 'fireflies' } },
      { id: 'vb_3', category: 'dialogue', command: 'say', params: { speaker: '汐月', text: '怀表的指针终于跨越了零点，欢迎来到蔚蓝黎明！' } },
    ],
  },
  {
    id: 'script_lua',
    name: 'scene_controller.lua',
    path: 'scripts/scene_controller.lua',
    language: 'lua',
    content: `-- MooVN Lua 原生工作流脚本
function on_enter_scene(scene_id)
  moovn.log("Lua 引擎切入场景: " .. tostring(scene_id))
  moovn.bg("rainy_station", { weather = "rain" })
  moovn.audio("rain_echo", 80)
  moovn.char("char_shizuki", { expr = "smile", x = 50, y = 56 })
  moovn.affection("char_shizuki", 5)
  moovn.say("汐月", "通过 Lua 脚本，我们可以直接操控 Pixi.js 舞台上的立绘与好感度。")
end

on_enter_scene("scene_01")`,
    visualBlocks: [
      { id: 'vb_lua_1', category: 'scene', command: 'set_background', params: { preset: 'rainy_station', weather: 'rain' } },
      { id: 'vb_lua_2', category: 'audio', command: 'play_bgm', params: { bgm: 'rain_echo', volume: 80 } },
      { id: 'vb_lua_3', category: 'character', command: 'add_affection', params: { characterId: 'char_shizuki', delta: 5 } },
      { id: 'vb_lua_4', category: 'dialogue', command: 'say', params: { speaker: '汐月', text: '通过 Lua 脚本，我们可以直接操控 Pixi.js 舞台上的立绘与好感度。' } },
    ],
  },
  {
    id: 'script_python',
    name: 'affection_ai.py',
    path: 'scripts/affection_ai.py',
    language: 'python',
    content: `# MooVN Python 剧情逻辑与角色属性脚本
import moovn

def evaluate_character_bond(char_id: str = "char_shizuki"):
    affection = moovn.get_affection(char_id)
    sync_rate = moovn.get_attr(char_id, "sync_rate")
    moovn.log(f"[Python Runtime] 当前角色 {char_id} 好感度={affection}, 同步率={sync_rate}")

    if affection >= 30:
        moovn.set_expr(char_id, "smile")
        moovn.add_affection(char_id, 10)
        moovn.say("汐月", "Python 脚本已执行：检测到深海同步率提升，好感度 +10！")
    else:
        moovn.set_expr(char_id, "serious")
        moovn.say("汐月", "还需要收集更多观测记忆才能解锁深海档案。")

evaluate_character_bond("char_shizuki")`,
    visualBlocks: [
      { id: 'vb_py_1', category: 'variable', command: 'read_attr', params: { characterId: 'char_shizuki', attr: 'sync_rate' } },
      { id: 'vb_py_2', category: 'character', command: 'add_affection', params: { characterId: 'char_shizuki', delta: 10 } },
      { id: 'vb_py_3', category: 'dialogue', command: 'say', params: { speaker: '汐月', text: 'Python 脚本已执行：检测到深海同步率提升，好感度 +10！' } },
    ],
  },
  {
    id: 'script_ts',
    name: 'custom_mechanic.ts',
    path: 'scripts/custom_mechanic.ts',
    language: 'typescript',
    content: `// MooVN TypeScript / JavaScript 扩展脚本
import { moovn } from '@moovn/runtime';

export function triggerTimeRewind(): void {
  moovn.log('[TS Runtime] 触发蔚蓝怀表时间回溯特效');
  moovn.setBackground('deep_sea_observatory', { weather: 'bubbles' });
  moovn.updateCharacter('char_shizuki', { expression: 'surprised', x: 48, y: 56 });
  moovn.addAffection('char_shizuki', 8);
  moovn.say('汐月', 'TypeScript 扩展模块已生效：舞台滤镜与好感度已实时更新！');
}

triggerTimeRewind();`,
    visualBlocks: [
      { id: 'vb_ts_1', category: 'scene', command: 'set_background', params: { preset: 'deep_sea_observatory', weather: 'bubbles' } },
      { id: 'vb_ts_2', category: 'character', command: 'add_affection', params: { characterId: 'char_shizuki', delta: 8 } },
      { id: 'vb_ts_3', category: 'dialogue', command: 'say', params: { speaker: '汐月', text: 'TypeScript 扩展模块已生效：舞台滤镜与好感度已实时更新！' } },
    ],
  },
];

export const DEFAULT_GAME_SETTINGS: GameSettings = {
  textSpeed: 45,
  autoPlayDelayMs: 1800,
  bgmVolume: 80,
  sfxVolume: 85,
  voiceVolume: 90,
  fullscreen: false,
  skipMode: 'played_only',
  transitionEffect: 'fade',
  particleQuality: 'high',
  showAffectionToast: true,
  dialogueBoxOpacity: 90,
  hardwareAcceleration: true,
  targetPlatformPreview: 'desktop_16_9',
};

export const INITIAL_GODOT_NODES: GodotNode2D[] = [
  {
    id: 'node_root',
    name: 'MainStage (Node2D)',
    type: 'Node2D',
    parentId: null,
    x: 0,
    y: 0,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    visible: true,
    color: '#38bdf8',
    scriptLang: 'typescript',
    scriptCode: `// Godot-Style Root Node2D Script\nexport function _ready() {\n  console.log("MainStage Node2D initialized");\n}`,
  },
  {
    id: 'node_cam',
    name: 'MainCamera (Camera2D)',
    type: 'Camera2D',
    parentId: 'node_root',
    x: 640,
    y: 360,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    visible: true,
    color: '#a855f7',
  },
  {
    id: 'node_bg_sprite',
    name: 'BackgroundSprite (Sprite2D)',
    type: 'Sprite2D',
    parentId: 'node_root',
    x: 640,
    y: 360,
    rotation: 0,
    scaleX: 1.2,
    scaleY: 1.2,
    visible: true,
    color: '#0ea5e9',
  },
  {
    id: 'node_particles',
    name: 'WeatherParticles (ParticleEmitter2D)',
    type: 'ParticleEmitter2D',
    parentId: 'node_root',
    x: 640,
    y: 100,
    rotation: 12,
    scaleX: 1,
    scaleY: 1,
    visible: true,
    color: '#2dd4bf',
  },
  {
    id: 'node_hero_sprite',
    name: 'HeroEntity (Sprite2D)',
    type: 'Sprite2D',
    parentId: 'node_root',
    x: 520,
    y: 410,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    visible: true,
    color: '#f43f5e',
    scriptLang: 'lua',
    scriptCode: `function _process(delta)\n  -- 自由 2D 实体帧更新 (Lua)\n  self.x = self.x + math.sin(os.clock()) * 0.5\nend`,
  },
  {
    id: 'node_bgm',
    name: 'AmbientAudio (AudioStreamPlayer)',
    type: 'AudioStreamPlayer',
    parentId: 'node_root',
    x: 100,
    y: 100,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    visible: true,
    color: '#f59e0b',
  },
];
