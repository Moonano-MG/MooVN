import type { Project } from "../types";
import { DEFAULT_MOOVN_AI_SPEC } from "./aiSpec";

export const defaultProject: Project = {
  id: "proj-sakura-promise",
  name: "樱花树下的约定",
  author: "MooVN Studio",
  version: "0.2.0",
  startNodeId: "s-1",
  aiSpecContent: DEFAULT_MOOVN_AI_SPEC,
  chapters: [
    { id: "ch-1", title: "第一章 · 樱道初遇", order: 1 },
    { id: "ch-2", title: "第二章 · 社团分歧", order: 2 },
    { id: "ch-3", title: "第三章 · 约定之夜", order: 3 },
  ],
  characters: [
    {
      id: "c-me",
      name: "陆星河",
      color: "#38bdf8",
      spriteId: null,
      description: "高二学生，男主角。",
      initialAffection: 0,
      affection: 0,
      attributes: [
        { key: "courage", label: "勇气", value: 15 },
        { key: "literacy", label: "文学素养", value: 25 },
      ],
    },
    {
      id: "c-yuki",
      name: "苏雨晴",
      color: "#f472b6",
      spriteId: "sp-yuki",
      description: "文学社社长，青梅竹马。",
      initialAffection: 60,
      affection: 60,
      attributes: [
        { key: "mood", label: "心情", value: "期待" },
        { key: "trust", label: "信赖度", value: 80 },
      ],
    },
    {
      id: "c-chen",
      name: "陈默",
      color: "#fbbf24",
      spriteId: "sp-chen",
      description: "摄影部主将，热血挚友。",
      initialAffection: 50,
      affection: 50,
      attributes: [
        { key: "camera", label: "机身型号", value: "FE-M3" },
        { key: "friendship", label: "默契值", value: 75 },
      ],
    },
    {
      id: "c-shiratori",
      name: "白鸟凛",
      color: "#c084fc",
      spriteId: "sp-shiratori",
      description: "旧馆图书委员，神秘学姐。",
      initialAffection: 40,
      affection: 40,
      attributes: [
        { key: "mystery", label: "神秘感", value: 90 },
        { key: "book_key", label: "古籍钥匙", value: "已持有" },
      ],
    },
  ],
  nodes: [
    /* ================== 第一章 ================== */
    {
      id: "s-1",
      chapterId: "ch-1",
      type: "dialogue",
      title: "场景 1 · 坡道上的风",
      x: 60,
      y: 180,
      backgroundId: "bg-classroom",
      backgroundMediaKind: "tween",
      bgmId: "bgm-spring",
      stageCharacters: [
        {
          characterId: "c-yuki",
          x: 50,
          y: 54,
          scale: 1,
          opacity: 1,
          mediaKind: "tween",
          tween: "breathe",
        },
      ],
      fadeConfig: {
        target: "screen",
        direction: "in",
        durationMs: 700,
        targetOpacity: 1,
      },
      screenTexts: [
        {
          id: "st-ch1",
          text: "第一章 · 樱道初遇",
          x: 50,
          y: 16,
          fontSize: 28,
          color: "#e0f2fe",
          fontWeight: "bold",
          align: "center",
          fadeDurationMs: 800,
        },
      ],
      blocks: [
        {
          id: "b-1",
          kind: "fade",
          params: { target: "screen", direction: "in", durationMs: 700, targetOpacity: 1 },
        },
        {
          id: "b-2",
          kind: "screen_text",
          params: { text: "第一章 · 樱道初遇", x: 50, y: 16, fontSize: 28, color: "#e0f2fe" },
        },
        {
          id: "b-3",
          kind: "char",
          params: { characterId: "c-yuki", x: 50, y: 54, scale: 1, tween: "breathe" },
        },
        {
          id: "b-4",
          kind: "say",
          params: { speaker: "苏雨晴", text: "早安，星河。你盯着窗外看了好久，又在想那封没有署名的信吗？" },
        },
      ],
      lines: [
        { id: "l-101", characterId: null, text: "四月的风拂过窗台，把飘落的樱花瓣吹进午后的教室。" },
        { id: "l-102", characterId: "c-yuki", text: "早安，星河。你盯着窗外看了好久，又在想那封没有署名的信吗？" },
      ],
      choices: [],
      nextNodeId: "s-2",
      scriptLang: "typescript",
      scriptCode: `import { moovn } from "@moovn/sdk";

export async function onScene_s_1() {
  await moovn.fade({ target: "screen", direction: "in", durationMs: 700, targetOpacity: 1 });
  await moovn.screenText({ text: "第一章 · 樱道初遇", x: 50, y: 16, fontSize: 28, color: "#e0f2fe" });
  await moovn.char("c-yuki", { x: 50, y: 54, scale: 1, tween: "breathe" });
  await moovn.say("c-yuki", "早安，星河。你盯着窗外看了好久，又在想那封没有署名的信吗？");
}`,
    },
    {
      id: "s-2",
      chapterId: "ch-1",
      type: "fade",
      title: "场景 2 · 好友闯入与淡入效果",
      x: 360,
      y: 180,
      backgroundId: "bg-classroom",
      bgmId: "bgm-spring",
      stageCharacters: [
        { characterId: "c-yuki", x: 32, y: 54, scale: 0.98, opacity: 1, tween: "breathe" },
        { characterId: "c-chen", x: 70, y: 55, scale: 1, opacity: 1, tween: "slide_in" },
      ],
      fadeConfig: {
        target: "character",
        characterId: "c-chen",
        direction: "in",
        durationMs: 600,
        targetOpacity: 1,
      },
      screenTexts: [],
      blocks: [
        {
          id: "b-201",
          kind: "fade",
          params: { target: "character", characterId: "c-chen", direction: "in", durationMs: 600, targetOpacity: 1 },
        },
        {
          id: "b-202",
          kind: "say",
          params: { speaker: "陈默", text: "找到了！摄影部刚洗出来的胶卷，昨晚旧校舍天台上果然有人影！" },
        },
      ],
      lines: [
        { id: "l-201", characterId: "c-chen", text: "找到了！摄影部刚洗出来的胶卷，昨晚旧校舍天台上果然有人影！" },
        { id: "l-202", characterId: "c-yuki", text: "天台在放学后明明是锁着的……难道信里写的「黄昏之约」是真的？" },
      ],
      choices: [],
      nextNodeId: "s-3",
      scriptLang: "typescript",
      scriptCode: `import { moovn } from "@moovn/sdk";

export async function onScene_s_2() {
  await moovn.fade({ target: "character", characterId: "c-chen", direction: "in", durationMs: 600, targetOpacity: 1 });
  await moovn.say("c-chen", "找到了！摄影部刚洗出来的胶卷，昨晚旧校舍天台上果然有人影！");
}`,
    },
    {
      id: "s-3",
      chapterId: "ch-1",
      type: "choice",
      title: "场景 3 · 放学后的去向",
      x: 660,
      y: 180,
      backgroundId: "bg-classroom",
      bgmId: "bgm-spring",
      stageCharacters: [
        { characterId: "c-yuki", x: 32, y: 54, scale: 0.98, opacity: 1, tween: "breathe" },
        { characterId: "c-chen", x: 70, y: 55, scale: 1, opacity: 1, tween: "none" },
      ],
      blocks: [
        {
          id: "b-301",
          kind: "say",
          params: { speaker: "陆星河", text: "下课铃声响起，夕阳将整条走廊染成了琥珀色。" },
        },
      ],
      lines: [
        { id: "l-301", characterId: "c-me", text: "下课铃声响起，夕阳将整条走廊染成了琥珀色。我决定——" },
      ],
      choices: [
        {
          id: "ch-opt-1",
          text: "和苏雨晴一起登上学园天台迎着晚风确认信中线索",
          targetNodeId: "s-4",
          affectionCharacterId: "c-yuki",
          affectionDelta: 15,
        },
        {
          id: "ch-opt-2",
          text: "前往旧校舍图书馆寻找白鸟凛学姐询问古籍记载",
          targetNodeId: "s-5",
          affectionCharacterId: "c-shiratori",
          affectionDelta: 15,
        },
        {
          id: "ch-opt-3",
          text: "跟陈默去街角咖啡馆冲洗剩下的底片放大对比",
          targetNodeId: "s-6",
          affectionCharacterId: "c-chen",
          affectionDelta: 10,
        },
      ],
      nextNodeId: null,
      scriptLang: "typescript",
    },

    /* ================== 第二章 ================== */
    {
      id: "s-4",
      chapterId: "ch-2",
      type: "screen_text",
      title: "场景 4 · 天台上的晚霞与屏幕文字",
      x: 980,
      y: 40,
      backgroundId: "bg-rooftop",
      backgroundMediaKind: "tween",
      bgmId: "bgm-sunset",
      stageCharacters: [
        { characterId: "c-yuki", x: 52, y: 54, scale: 1.02, opacity: 1, tween: "float" },
      ],
      screenTexts: [
        {
          id: "st-rooftop",
          text: "「无论季节流转几次，我都会在樱花树下等你」",
          x: 50,
          y: 22,
          fontSize: 24,
          color: "#fef08a",
          fontWeight: "bold",
          align: "center",
          fadeDurationMs: 600,
        },
      ],
      blocks: [
        {
          id: "b-401",
          kind: "bg",
          params: { backgroundId: "bg-rooftop", mediaKind: "tween" },
        },
        {
          id: "b-402",
          kind: "screen_text",
          params: { text: "「无论季节流转几次，我都会在樱花树下等你」", x: 50, y: 22, fontSize: 24, color: "#fef08a" },
        },
        {
          id: "b-403",
          kind: "say",
          params: { speaker: "苏雨晴", text: "其实……那封信是我夹进你课本里的。" },
        },
      ],
      lines: [
        { id: "l-401", characterId: "c-yuki", text: "其实……那封信是我夹进你课本里的。" },
        { id: "l-402", characterId: "c-yuki", text: "因为如果不这么做的话，总觉得你会离我越来越远。" },
      ],
      choices: [],
      nextNodeId: "s-7",
      scriptLang: "typescript",
    },
    {
      id: "s-5",
      chapterId: "ch-2",
      type: "dialogue",
      title: "场景 5 · 神社古籍的秘密",
      x: 980,
      y: 200,
      backgroundId: "bg-shrine",
      backgroundMediaKind: "frame_sequence",
      backgroundFps: 1,
      bgmId: "bgm-shrine",
      stageCharacters: [
        {
          characterId: "c-shiratori",
          x: 50,
          y: 55,
          scale: 1,
          opacity: 1,
          mediaKind: "frame_sequence",
          tween: "breathe",
          fps: 2,
        },
      ],
      blocks: [
        {
          id: "b-501",
          kind: "animate",
          params: { targetId: "c-shiratori", kind: "frame_sequence", tween: "breathe", fps: 2 },
        },
        {
          id: "b-502",
          kind: "bridge_call",
          params: {
            bridgeLang: "lua",
            code: "local ok = moovn_ctx.affection['c-shiratori'] >= 40\nreturn ok",
          },
        },
      ],
      lines: [
        { id: "l-501", characterId: "c-shiratori", text: "你果然来了。这本手记里夹着十年前文学社留下的神社绘马。" },
        { id: "l-502", characterId: "c-shiratori", text: "只要在今晚满月升起时前往山间神社，就能揭开当年未完成的约定。" },
      ],
      choices: [],
      nextNodeId: "s-7",
      scriptLang: "typescript",
    },
    {
      id: "s-6",
      chapterId: "ch-2",
      type: "dialogue",
      title: "场景 6 · 街角咖啡馆的推理",
      x: 980,
      y: 360,
      backgroundId: "bg-cafe",
      backgroundMediaKind: "video",
      bgmId: "bgm-rain",
      stageCharacters: [
        { characterId: "c-chen", x: 50, y: 55, scale: 1, opacity: 1, tween: "bounce" },
      ],
      blocks: [
        {
          id: "b-601",
          kind: "fade",
          params: { target: "character", characterId: "c-chen", direction: "out", durationMs: 500, targetOpacity: 0.3 },
        },
      ],
      lines: [
        { id: "l-601", characterId: "c-chen", text: "你看这张放大的照片——天台栏杆上挂着文学社纪念书签。" },
        { id: "l-602", characterId: "c-chen", text: "还愣着干什么？快去神社找她们汇合吧！" },
      ],
      choices: [],
      nextNodeId: "s-7",
      scriptLang: "typescript",
    },

    /* ================== 第三章 ================== */
    {
      id: "s-7",
      chapterId: "ch-3",
      type: "choice",
      title: "场景 7 · 神社石阶前的抉择",
      x: 1300,
      y: 200,
      backgroundId: "bg-shrine",
      bgmId: "bgm-shrine",
      stageCharacters: [
        { characterId: "c-yuki", x: 30, y: 54, scale: 0.98, opacity: 1, tween: "breathe" },
        { characterId: "c-shiratori", x: 70, y: 55, scale: 0.98, opacity: 1, tween: "breathe" },
      ],
      lines: [
        { id: "l-701", characterId: null, text: "夜风吹响神社屋檐下的铜铃，漫天樱花如雪般落下。" },
        { id: "l-702", characterId: "c-me", text: "站在石阶尽头的千年樱树下，我向她伸出了手——" },
      ],
      choices: [
        {
          id: "ch-final-1",
          text: "握住苏雨晴的手，许下属于我们两人的未来约定",
          targetNodeId: "s-end-true",
          affectionCharacterId: "c-yuki",
          affectionDelta: 20,
        },
        {
          id: "ch-final-2",
          text: "接过白鸟凛递来的古籍钥匙，共同守护旧馆的记忆",
          targetNodeId: "s-end-good",
          affectionCharacterId: "c-shiratori",
          affectionDelta: 20,
        },
        {
          id: "ch-final-3",
          text: "将绘马挂上枝头，把这份心意留在青春的回忆里",
          targetNodeId: "s-end-normal",
        },
      ],
      nextNodeId: null,
      scriptLang: "typescript",
    },
    {
      id: "s-end-true",
      chapterId: "ch-3",
      type: "end",
      title: "结局一 · 樱花树下的永恒约定",
      x: 1620,
      y: 40,
      backgroundId: "bg-rooftop",
      bgmId: "bgm-sunset",
      stageCharacters: [{ characterId: "c-yuki", x: 50, y: 54, scale: 1.05, opacity: 1, tween: "float" }],
      lines: [],
      choices: [],
      nextNodeId: null,
      endingKind: "true",
      endingDescription: "漫天飞舞的樱花瓣中，苏雨晴微笑着握紧了你的手。跨越四季的约定，终于在这一刻化作永恒。",
    },
    {
      id: "s-end-good",
      chapterId: "ch-3",
      type: "end",
      title: "结局二 · 月光与古籍的守望者",
      x: 1620,
      y: 200,
      backgroundId: "bg-shrine",
      bgmId: "bgm-shrine",
      stageCharacters: [{ characterId: "c-shiratori", x: 50, y: 55, scale: 1.05, opacity: 1, tween: "breathe" }],
      lines: [],
      choices: [],
      nextNodeId: null,
      endingKind: "good",
      endingDescription: "白鸟凛轻轻合上羊皮古籍，金色的眼眸里映出温柔的月光。从今往后，旧校舍的黄昏多了一个人的身影。",
    },
    {
      id: "s-end-normal",
      chapterId: "ch-3",
      type: "end",
      title: "结局三 · 春风吹拂的毕业季",
      x: 1620,
      y: 360,
      backgroundId: "bg-classroom",
      bgmId: "bgm-spring",
      stageCharacters: [],
      lines: [],
      choices: [],
      nextNodeId: null,
      endingKind: "normal",
      endingDescription: "木制绘马在夜风中发出清脆的声响。虽然没有说出口，但这段共同追寻秘密的春日时光将永远留在心底。",
    },
  ],
  updatedAt: "2026-10-21T00:00:00.000Z",
};
