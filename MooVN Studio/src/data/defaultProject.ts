import type { VNProject } from '../types.ts';

/**
 * MooVN Studio 真正的默认空白起始项目 (`GPT-18 / CL-18`):
 * - `characters: []` (0 预置角色)
 * - `nodes.length === 1` (1 个空白起始节点，无预置 BGM/天气/立绘)
 * - 无宣传副标题
 */
export const DEFAULT_PROJECT: VNProject = {
  schemaVersion: '1.1.0',
  id: 'moovn-blank-project',
  title: '未命名视觉小说项目',
  author: 'MooVN Studio Developer',
  version: '0.1.0',
  resolution: { width: 1920, height: 1080 },
  defaultLanguage: 'typescript',
  startNodeId: 'scene-start-01',
  uiConfig: {
    presetId: 'classic_blue',
    dialogueBox: {
      bottomOffset: 24,
      widthPercent: 92,
      heightPx: 176,
      paddingPx: 24,
      bgColor: '#040c1f',
      bgOpacity: 0.88,
      borderColor: '#1e3a8a',
      borderWidth: 1,
      borderRadius: 12,
      backdropBlur: true,
      speakerFontSize: 20,
      speakerTagMode: 'inside',
      textFontSize: 18,
      textColor: '#f1f5f9',
      lineHeight: 1.75,
      controlPosition: 'bottom_right',
      visibleControls: {
        back: true,
        auto: true,
        skip: true,
        hide: true,
        settings: true,
      },
    },
    choiceBox: {
      position: 'above_left',
      bgColor: '#020617',
      bgOpacity: 0.92,
      borderColor: '#1e3a8a',
      hoverAccentColor: '#38bdf8',
      textColor: '#f8fafc',
      fontSize: 15,
      borderRadius: 8,
    },
    mainMenu: {
      layout: 'left_panel',
      panelColor: '#040c1f',
      accentColor: '#38bdf8',
      titleColor: '#ffffff',
      backgroundId: '',
      showHeroCharacter: false,
      heroCharacterSpriteId: '',
      subtitleText: '',
    },
  },
  chapters: [
    {
      id: 'chapter-1',
      index: 1,
      title: '第一章：序章',
      subtitle: 'Chapter 01',
      yamlFileName: 'chapter_01.yaml',
      description: '新建章节（可在左侧章节面板新增章节或导入 .mpvn 项目文件）',
      minCharacterAffection: {},
    },
  ],
  characters: [],
  variables: [
    {
      key: 'chapterIndex',
      label: '当前章节序号',
      type: 'number',
      value: 1,
    },
  ],
  nodes: [
    {
      id: 'scene-start-01',
      chapterId: 'chapter-1',
      type: 'dialogue',
      title: '初始场景 01',
      position: { x: 120, y: 140 },
      backgroundId: '',
      bgmId: '',
      transition: 'fade',
      weatherEffect: 'none',
      colorFilter: 'none',
      characters: [],
      dialogues: [
        {
          id: 'line-init-1',
          speakerId: 'narrator',
          speakerName: '旁白',
          speakerColor: '#94a3b8',
          text: '请在此输入第一句台词，或在右侧检查器中添加登场角色与背景。',
        },
      ],
      choices: [],
      visualBlocks: [],
      childrenNodes: [],
      nextNodeId: null,
    },
  ],
};

export const BLANK_PROJECT: VNProject = DEFAULT_PROJECT;

/**
 * 独立于空白工程之外的入门示例项目 (`SAMPLE_PROJECT`, `GPT-18 / CL-18`)，
 * 仅在启动器点击「打开入门示例工程」时按需创建，绝不混入默认空白项目。
 */
export const SAMPLE_PROJECT: VNProject = {
  ...DEFAULT_PROJECT,
  id: 'moovn-sample-project',
  title: '入门示例工程：放学后的教室',
  isTemplatePreset: true,
  characters: [
    {
      id: 'char-sample-1',
      name: '示例角色',
      titleRole: '主角',
      color: '#38bdf8',
      spriteId: 'char-yukina-1',
      initialAffection: 50,
      maxAffection: 100,
      bio: '用于演示角色立绘差分与好感度分支的示例角色。',
      customAttributes: [],
      expressions: [
        { id: 'expr-default', label: '微笑', spriteId: 'char-yukina-1' },
        { id: 'expr-shy', label: '害羞', spriteId: 'char-yukina-2' },
      ],
    },
  ],
  nodes: [
    {
      id: 'scene-start-01',
      chapterId: 'chapter-1',
      type: 'dialogue',
      title: '序幕：夕阳教室',
      position: { x: 120, y: 140 },
      backgroundId: 'bg-classroom-day',
      bgmId: 'bgm-spring-breeze',
      transition: 'fade',
      weatherEffect: 'none',
      colorFilter: 'none',
      characters: [
        {
          id: 'place-sample-1',
          characterId: 'char-sample-1',
          name: '示例角色',
          spriteId: 'char-yukina-1',
          expressionLabel: '微笑',
          x: 50,
          y: 88,
          scale: 1,
          enterAnimation: 'fade',
        },
      ],
      dialogues: [
        {
          id: 'line-sample-1',
          speakerId: 'char-sample-1',
          speakerName: '示例角色',
          speakerColor: '#38bdf8',
          text: '这是一个入门示例工程，演示如何布置场景立绘、对白与分支选项。',
        },
      ],
      choices: [
        {
          id: 'choice-sample-1',
          text: '继续前进',
          targetNodeId: 'scene-start-02',
        },
      ],
      visualBlocks: [],
      childrenNodes: [],
      nextNodeId: 'scene-start-02',
    },
    {
      id: 'scene-start-02',
      chapterId: 'chapter-1',
      type: 'end',
      title: '尾声：放学铃声',
      position: { x: 460, y: 140 },
      backgroundId: 'bg-classroom-sunset',
      bgmId: 'bgm-spring-breeze',
      transition: 'fade',
      weatherEffect: 'none',
      colorFilter: 'none',
      characters: [],
      dialogues: [
        {
          id: 'line-sample-2',
          speakerId: 'narrator',
          speakerName: '旁白',
          speakerColor: '#94a3b8',
          text: '演示章节到此结束。',
        },
      ],
      choices: [],
      visualBlocks: [],
      childrenNodes: [],
      nextNodeId: null,
    },
  ],
};
