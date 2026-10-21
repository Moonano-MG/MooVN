import React, { useEffect, useMemo, useState } from 'react';
import {
  BackgroundPresetId,
  ChapterDef,
  CharacterDef,
  CharacterExpression,
  EditorTheme,
  EndingDef,
  GodotNode2D,
  ProjectTemplateMode,
  SceneChoice,
  SceneDef,
  ScriptFile,
  StageCharacterPlacement,
  StorylineDef,
  WeatherEffectType,
  WorkflowEdge,
  WorkflowNode,
} from './types/moovn';
import {
  INITIAL_CHAPTERS,
  INITIAL_CHARACTERS,
  INITIAL_ENDINGS,
  INITIAL_GODOT_NODES,
  INITIAL_SCENES,
  INITIAL_SCRIPTS,
  INITIAL_STORYLINES,
  INITIAL_WORKFLOW_EDGES,
  INITIAL_WORKFLOW_NODES,
} from './data/blueTemplateProject';
import { PixiStageCanvas } from './components/PixiStageCanvas';
import { BlueTemplateGameRunner } from './components/BlueTemplateGameRunner';
import { DifyWorkflowCanvas } from './components/DifyWorkflowCanvas';
import { MultiLangScriptEditor } from './components/MultiLangScriptEditor';
import { CharacterAndStorySystem } from './components/CharacterAndStorySystem';
import { GodotFreeEditor } from './components/GodotFreeEditor';
import {
  downloadTextFile,
  projectToYaml,
  sceneToYaml,
  yamlToScene,
} from './services/yamlService';
import { BACKGROUND_PRESET_META } from './services/thumbnailGenerator';

type EditorWorkspaceTab =
  | 'scene_editor'
  | 'dify_workflow'
  | 'polyglot_code'
  | 'character_story'
  | 'play_game'
  | 'platform_build';

export const App: React.FC = () => {
  // 1. Theme: 黑 (dark) 和 白 (light) 2种风格
  const [theme, setTheme] = useState<EditorTheme>('dark');
  const isDark = theme === 'dark';

  // 2. Project Template Mode: 蓝色模板 vs 无模板 Godot 式通用可视化编辑器
  const [templateMode, setTemplateMode] = useState<ProjectTemplateMode>('blue_template');

  // 3. Active Workspace Tab
  const [activeTab, setActiveTab] = useState<EditorWorkspaceTab>('scene_editor');

  // 4. Core Project State
  const [chapters, setChapters] = useState<ChapterDef[]>(INITIAL_CHAPTERS);
  const [scenes, setScenes] = useState<SceneDef[]>(INITIAL_SCENES);
  const [characters, setCharacters] = useState<CharacterDef[]>(INITIAL_CHARACTERS);
  const [storylines, setStorylines] = useState<StorylineDef[]>(INITIAL_STORYLINES);
  const [endings, setEndings] = useState<EndingDef[]>(INITIAL_ENDINGS);
  const [workflowNodes, setWorkflowNodes] = useState<WorkflowNode[]>(INITIAL_WORKFLOW_NODES);
  const [workflowEdges, setWorkflowEdges] = useState<WorkflowEdge[]>(INITIAL_WORKFLOW_EDGES);
  const [scripts, setScripts] = useState<ScriptFile[]>(INITIAL_SCRIPTS);
  const [godotNodes, setGodotNodes] = useState<GodotNode2D[]>(INITIAL_GODOT_NODES);

  // 5. Scene Editor Selection State
  const [selectedSceneId, setSelectedSceneId] = useState<string>(INITIAL_SCENES[0].id);
  const [selectedStageCharId, setSelectedStageCharId] = useState<string | null>(
    INITIAL_SCENES[0].characters[0]?.characterId || null
  );
  const [expandedChapters, setExpandedChapters] = useState<Record<string, boolean>>({
    chap_1: true,
    chap_2: true,
    chap_3: true,
  });
  const [yamlText, setYamlText] = useState<string>('');
  const [yamlError, setYamlError] = useState<string | null>(null);
  const [showYamlDrawer, setShowYamlDrawer] = useState<boolean>(true);
  const [gameStartInMenu, setGameStartInMenu] = useState<boolean>(true);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  const notify = (msg: string) => {
    setStatusNotice(msg);
    window.setTimeout(() => {
      setStatusNotice((prev) => (prev === msg ? null : prev));
    }, 3200);
  };

  const selectedScene = useMemo(
    () => scenes.find((s) => s.id === selectedSceneId) || scenes[0],
    [scenes, selectedSceneId]
  );

  const selectedChapter = useMemo(
    () => chapters.find((c) => c.id === selectedScene?.chapterId) || chapters[0],
    [chapters, selectedScene]
  );

  // Sync live YAML whenever selectedScene changes
  useEffect(() => {
    if (!selectedScene) return;
    setYamlText(sceneToYaml(selectedScene, selectedChapter));
    setYamlError(null);
  }, [selectedScene, selectedChapter]);

  // Update a specific scene
  const updateSelectedScene = (patch: Partial<SceneDef>) => {
    setScenes((prev) =>
      prev.map((s) => (s.id === selectedScene.id ? { ...s, ...patch } : s))
    );
  };

  // Update character placement on stage (e.g. via drag-and-drop on Pixi stage or inspector sliders)
  const handleUpdateCharacterPlacement = (
    characterId: string,
    patch: Partial<StageCharacterPlacement>
  ) => {
    setScenes((prev) =>
      prev.map((s) => {
        if (s.id !== selectedScene.id) return s;
        return {
          ...s,
          characters: s.characters.map((c) =>
            c.characterId === characterId ? { ...c, ...patch } : c
          ),
        };
      })
    );
  };

  // Create a new scene in a chapter (even if only dialogue changes, it counts as a new scene!)
  const handleCreateDialogueContinuationScene = (chapterId: string, baseScene?: SceneDef) => {
    const source =
      baseScene ||
      scenes.filter((s) => s.chapterId === chapterId).slice(-1)[0] ||
      selectedScene;
    const newGlobalNum = scenes.length + 1;
    const newId = `scene_${String(newGlobalNum).padStart(2, '0')}`;

    const newScene: SceneDef = {
      ...JSON.parse(JSON.stringify(source)),
      id: newId,
      chapterId,
      globalNumber: newGlobalNum,
      title: `场景 ${newGlobalNum}：续接对话场景（同布景新台词）`,
      dialogue: {
        speakerId: source.dialogue.speakerId,
        speakerName: source.dialogue.speakerName,
        text: `「这是新建的场景 ${newGlobalNum}。即使未修改背景与人物位置、只修改了台词，在章节树中也作为一个独立场景并拥有独立的 YAML 配置。」`,
      },
      choices: [],
      nextSceneId: null,
      endingId: undefined,
    };

    // Link previous scene's nextSceneId if it had none
    setScenes((prev) => {
      const updated = prev.map((s) =>
        s.id === source.id && !s.nextSceneId ? { ...s, nextSceneId: newId } : s
      );
      return [...updated, newScene];
    });
    setSelectedSceneId(newId);
    notify(`已在章节下新建「${newScene.title}」并生成对应 YAML 配置`);
  };

  // Apply raw YAML edits back to the visual scene editor
  const handleApplyYamlEdit = () => {
    try {
      const parsedScene = yamlToScene(yamlText, selectedScene);
      setScenes((prev) =>
        prev.map((s) => (s.id === selectedScene.id ? parsedScene : s))
      );
      setYamlError(null);
      notify('YAML 配置已成功解析并同步至可视化舞台！');
    } catch (err: any) {
      setYamlError(err?.message || 'YAML 解析错误，请检查缩进与语法');
    }
  };

  const selectedPlacement = useMemo(
    () =>
      selectedScene?.characters.find(
        (c) => c.characterId === selectedStageCharId
      ) || selectedScene?.characters[0] || null,
    [selectedScene, selectedStageCharId]
  );

  // Palette colors for Dark & Light (Black & White) editor styles
  const bgMain = isDark ? '#090d16' : '#f1f5f9';
  const bgPanel = isDark ? '#0f172a' : '#ffffff';
  const bgSub = isDark ? '#111827' : '#f8fafc';
  const borderCol = isDark ? '#1e293b' : '#cbd5e1';
  const textPrimary = isDark ? '#f8fafc' : '#0f172a';
  const textMuted = isDark ? '#94a3b8' : '#475569';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100vw',
        height: '100vh',
        backgroundColor: bgMain,
        color: textPrimary,
        fontFamily: '"Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif',
        overflow: 'hidden',
      }}
    >
      {/* ===================================================================
          TOP IDE HEADER BAR
          - 品牌标识 (MooVN: TypeScript + Tauri 2 + Pixi.js + YAML)
          - 中央工作区模式切换 (场景可视化编辑器 / Dify工作流 / 多语言IDE / 角色与章节 / 运行蓝色模板游戏 / 跨平台打包)
          - 模板模式切换 (蓝色视觉小说模板 vs Godot式无模板自由编辑器)
          - 界面风格切换 (黑 Dark / 白 Light 2种风格)
      =================================================================== */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 16px',
          backgroundColor: bgPanel,
          borderBottom: `1px solid ${borderCol}`,
          gap: 12,
          flexShrink: 0,
        }}
      >
        {/* Left: Brand & Template Switch */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div
              style={{
                width: 30,
                height: 30,
                borderRadius: 7,
                background: 'linear-gradient(135deg, #0284c7, #1e3a8a)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontWeight: 900,
                fontSize: 15,
                boxShadow: '0 2px 10px rgba(2, 132, 199, 0.4)',
              }}
            >
              M
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: 0.5 }}>
                MooVN <span style={{ fontSize: 11, color: '#38bdf8', fontWeight: 600 }}>v0.1.0</span>
              </div>
              <div style={{ fontSize: 10, color: textMuted }}>
                TS + Tauri 2 + Pixi.js + YAML
              </div>
            </div>
          </div>

          {/* Template Mode Switcher: Blue Template vs Blank Godot Mode */}
          <select
            value={templateMode}
            onChange={(e) => setTemplateMode(e.target.value as ProjectTemplateMode)}
            style={{
              padding: '5px 10px',
              borderRadius: 6,
              border: '1.5px solid #0284c7',
              background: isDark ? '#0b1528' : '#e0f2fe',
              color: isDark ? '#e0f2fe' : '#0369a1',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            <option value="blue_template">📘 工程模式：蓝色视觉小说模板 (Blue Template)</option>
            <option value="godot_blank">⚙️ 工程模式：无模板 · Godot式通用2D可视化编辑器</option>
          </select>
        </div>

        {/* Center: Workspace Mode Tabs (when in Blue Template mode) */}
        {templateMode === 'blue_template' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {[
              { id: 'scene_editor' as const, label: '🎨 章节场景与YAML编辑器' },
              { id: 'dify_workflow' as const, label: '🔗 Dify工作流编程' },
              { id: 'polyglot_code' as const, label: '💻 多语言代码块/纯代码 (Py/TS/Lua/Teal)' },
              { id: 'character_story' as const, label: '👤 角色好感·章节·多结局' },
              { id: 'play_game' as const, label: '▶ 运行蓝色模板游戏' },
              { id: 'platform_build' as const, label: '📦 跨平台构建 (Win/Android/iOS/Mac)' },
            ].map((tab) => {
              const active = activeTab === tab.id;
              const isPlayBtn = tab.id === 'play_game';
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    if (isPlayBtn) {
                      setGameStartInMenu(true);
                    }
                    setActiveTab(tab.id);
                  }}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 6,
                    border: active
                      ? '1.5px solid #38bdf8'
                      : isPlayBtn
                      ? '1.5px solid #10b981'
                      : `1px solid ${borderCol}`,
                    background: active
                      ? 'linear-gradient(135deg, #0284c7, #1d4ed8)'
                      : isPlayBtn
                      ? 'rgba(16, 185, 129, 0.16)'
                      : 'transparent',
                    color: active
                      ? '#ffffff'
                      : isPlayBtn
                      ? '#10b981'
                      : textPrimary,
                    fontSize: 12,
                    fontWeight: active || isPlayBtn ? 700 : 500,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        )}

        {/* Right: Black / White Theme Toggle & YAML Export */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Black / White Theme Switch (界面风格: 有黑和白2种风格) */}
          <div
            style={{
              display: 'inline-flex',
              borderRadius: 6,
              overflow: 'hidden',
              border: `1px solid ${borderCol}`,
            }}
          >
            <button
              onClick={() => setTheme('dark')}
              style={{
                padding: '5px 10px',
                background: isDark ? '#0284c7' : 'transparent',
                color: isDark ? '#ffffff' : textMuted,
                border: 'none',
                fontSize: 11.5,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              🌙 黑色风格
            </button>
            <button
              onClick={() => setTheme('light')}
              style={{
                padding: '5px 10px',
                background: !isDark ? '#0284c7' : 'transparent',
                color: !isDark ? '#ffffff' : textMuted,
                border: 'none',
                fontSize: 11.5,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              ☀️ 白色风格
            </button>
          </div>

          <button
            onClick={() => {
              downloadTextFile(
                `${selectedScene.id}.yaml`,
                sceneToYaml(selectedScene, selectedChapter)
              );
              notify(`已导出场景配置文件 ${selectedScene.id}.yaml`);
            }}
            style={{
              padding: '5px 11px',
              background: isDark ? '#1e293b' : '#e2e8f0',
              color: textPrimary,
              border: `1px solid ${borderCol}`,
              borderRadius: 6,
              fontSize: 11.5,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            ⬇ 导出场景 YAML
          </button>
        </div>
      </header>

      {/* Floating Status Toast */}
      {statusNotice && (
        <div
          style={{
            position: 'fixed',
            bottom: 18,
            right: 22,
            zIndex: 100,
            background: '#0284c7',
            color: '#fff',
            padding: '8px 16px',
            borderRadius: 8,
            fontSize: 12.5,
            fontWeight: 600,
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          }}
        >
          {statusNotice}
        </div>
      )}

      {/* ===================================================================
          MAIN WORKSPACE BODY
      =================================================================== */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {/* MODE A: GODOT-STYLE BLANK 2D VISUAL EDITOR */}
        {templateMode === 'godot_blank' ? (
          <GodotFreeEditor
            theme={theme}
            nodes={godotNodes}
            onChangeNodes={setGodotNodes}
            onSwitchToBlueTemplate={() => setTemplateMode('blue_template')}
          />
        ) : (
          <>
            {/* TAB 1: VISUAL SCENE EDITOR & FILE MANAGER (章节 > 场景 + 可视化编辑器 + YAML) */}
            {activeTab === 'scene_editor' && (
              <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
                {/* LEFT FILE MANAGER: 章节 > 场景 层级结构 */}
                <aside
                  style={{
                    width: 285,
                    backgroundColor: bgPanel,
                    borderRight: `1px solid ${borderCol}`,
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    flexShrink: 0,
                  }}
                >
                  <div
                    style={{
                      padding: '10px 12px',
                      borderBottom: `1px solid ${borderCol}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#38bdf8' }}>
                        📁 文件管理器 (章节 &gt; 场景)
                      </div>
                      <div style={{ fontSize: 10.5, color: textMuted }}>
                        仅改对话也独立算作一个 YAML 场景
                      </div>
                    </div>
                    <button
                      onClick={() =>
                        handleCreateDialogueContinuationScene(
                          selectedScene.chapterId,
                          selectedScene
                        )
                      }
                      title="复制当前场景布景并新建下一个对话场景"
                      style={{
                        padding: '4px 8px',
                        background: '#0284c7',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 5,
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      + 新场景
                    </button>
                  </div>

                  {/* Chapter > Scene Tree */}
                  <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
                    {chapters.map((chap) => {
                      const isExpanded = expandedChapters[chap.id] ?? true;
                      const chapScenes = scenes.filter((s) => s.chapterId === chap.id);

                      return (
                        <div key={chap.id} style={{ marginBottom: 8 }}>
                          {/* Chapter Folder Header */}
                          <div
                            onClick={() =>
                              setExpandedChapters((prev) => ({
                                ...prev,
                                [chap.id]: !isExpanded,
                              }))
                            }
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '7px 8px',
                              borderRadius: 6,
                              background: isDark ? '#162033' : '#e2e8f0',
                              cursor: 'pointer',
                              fontSize: 12,
                              fontWeight: 700,
                            }}
                          >
                            <span>
                              {isExpanded ? '📂' : '📁'} {chap.title}
                            </span>
                            <span style={{ fontSize: 10.5, color: '#38bdf8' }}>
                              {chapScenes.length} 场景
                            </span>
                          </div>

                          {/* Scenes inside Chapter */}
                          {isExpanded && (
                            <div
                              style={{
                                marginLeft: 10,
                                marginTop: 4,
                                paddingLeft: 8,
                                borderLeft: `1.5px solid ${borderCol}`,
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 4,
                              }}
                            >
                              {chapScenes.map((sc) => {
                                const isSel = sc.id === selectedScene.id;
                                return (
                                  <div
                                    key={sc.id}
                                    onClick={() => setSelectedSceneId(sc.id)}
                                    style={{
                                      padding: '6px 8px',
                                      borderRadius: 6,
                                      background: isSel
                                        ? isDark
                                          ? 'rgba(2, 132, 199, 0.24)'
                                          : '#bae6fd'
                                        : 'transparent',
                                      border: `1px solid ${
                                        isSel ? '#38bdf8' : 'transparent'
                                      }`,
                                      cursor: 'pointer',
                                    }}
                                  >
                                    <div
                                      style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        fontSize: 11.5,
                                        fontWeight: isSel ? 700 : 500,
                                      }}
                                    >
                                      <span>📄 {sc.title}</span>
                                    </div>
                                    <div
                                      style={{
                                        fontSize: 10,
                                        color: textMuted,
                                        marginTop: 2,
                                        whiteSpace: 'nowrap',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                      }}
                                    >
                                      <code>scenes/{sc.id}.yaml</code> · {sc.dialogue.speakerName}:{' '}
                                      {sc.dialogue.text}
                                    </div>
                                  </div>
                                );
                              })}

                              <button
                                onClick={() =>
                                  handleCreateDialogueContinuationScene(chap.id)
                                }
                                style={{
                                  marginTop: 2,
                                  padding: '4px 8px',
                                  background: 'transparent',
                                  border: `1px dashed ${borderCol}`,
                                  borderRadius: 5,
                                  color: '#38bdf8',
                                  fontSize: 11,
                                  cursor: 'pointer',
                                  textAlign: 'left',
                                }}
                              >
                                + 在本章追加场景 (仅改对话也算一场景)
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </aside>

                {/* CENTER: VISUAL SCENE EDITOR (Pixi.js 可视化舞台 + 实时 YAML 面板) */}
                <main
                  style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    minWidth: 0,
                    overflow: 'hidden',
                  }}
                >
                  {/* Scene Editor Sub-Toolbar */}
                  <div
                    style={{
                      padding: '8px 14px',
                      backgroundColor: bgSub,
                      borderBottom: `1px solid ${borderCol}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 10,
                      flexWrap: 'wrap',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 13, fontWeight: 700 }}>
                        正在可视化编辑：{selectedScene.title}
                      </span>
                      <code
                        style={{
                          fontSize: 11,
                          padding: '2px 6px',
                          borderRadius: 4,
                          background: isDark ? '#1e293b' : '#e2e8f0',
                          color: '#38bdf8',
                        }}
                      >
                        scenes/{selectedScene.id}.yaml
                      </code>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button
                        onClick={() =>
                          handleCreateDialogueContinuationScene(
                            selectedScene.chapterId,
                            selectedScene
                          )
                        }
                        style={{
                          padding: '5px 10px',
                          background: 'rgba(56, 189, 248, 0.15)',
                          color: '#38bdf8',
                          border: '1px solid #0284c7',
                          borderRadius: 5,
                          fontSize: 11.5,
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        + 复制当前布景新建下一句对话场景
                      </button>

                      <button
                        onClick={() => setShowYamlDrawer((v) => !v)}
                        style={{
                          padding: '5px 10px',
                          background: showYamlDrawer ? '#0284c7' : 'transparent',
                          color: showYamlDrawer ? '#fff' : textPrimary,
                          border: `1px solid ${borderCol}`,
                          borderRadius: 5,
                          fontSize: 11.5,
                          cursor: 'pointer',
                        }}
                      >
                        {showYamlDrawer ? '隐藏实时 YAML 源码' : '显示实时 YAML 源码'}
                      </button>

                      <button
                        onClick={() => {
                          setGameStartInMenu(false);
                          setActiveTab('play_game');
                        }}
                        style={{
                          padding: '5px 12px',
                          background: '#10b981',
                          color: '#fff',
                          border: 'none',
                          borderRadius: 5,
                          fontSize: 11.5,
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        ▶ 从当前场景试玩
                      </button>
                    </div>
                  </div>

                  {/* Visual Stage Canvas + Preview Dialogue Overlay */}
                  <div
                    style={{
                      position: 'relative',
                      flex: 1,
                      minHeight: 300,
                      overflow: 'hidden',
                    }}
                  >
                    <PixiStageCanvas
                      scene={selectedScene}
                      characters={characters}
                      interactiveEditor={true}
                      selectedCharacterId={selectedStageCharId}
                      onSelectCharacter={setSelectedStageCharId}
                      onUpdateCharacterPlacement={handleUpdateCharacterPlacement}
                    />

                    {/* Preview of Blue Template Choices & Dialogue Box inside Visual Scene Editor */}
                    <div
                      style={{
                        position: 'absolute',
                        left: '4%',
                        right: '4%',
                        bottom: 14,
                        zIndex: 20,
                        pointerEvents: 'none',
                      }}
                    >
                      {/* Choices above left of dialogue box */}
                      {selectedScene.choices.length > 0 && (
                        <div
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'flex-start',
                            gap: 6,
                            marginBottom: 8,
                          }}
                        >
                          {selectedScene.choices.map((ch) => (
                            <div
                              key={ch.id}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                padding: '6px 16px',
                                background: '#04060c',
                                border: '1.5px solid #153e75',
                                borderRadius: 5,
                                color: '#e2e8f0',
                                fontSize: 12.5,
                                whiteSpace: 'nowrap',
                              }}
                            >
                              <span
                                style={{
                                  width: 3,
                                  height: 14,
                                  background: '#5cc8ff',
                                  marginRight: 8,
                                  borderRadius: 2,
                                }}
                              />
                              <span>{ch.text}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Black Dialogue Box with Deep Blue Border */}
                      <div
                        style={{
                          background: 'rgba(3, 5, 10, 0.9)',
                          border: '2px solid #153e75',
                          borderRadius: 8,
                          padding: '12px 18px',
                        }}
                      >
                        <div
                          style={{
                            fontSize: 14,
                            fontWeight: 700,
                            color: '#60a5fa',
                            marginBottom: 4,
                          }}
                        >
                          {selectedScene.dialogue.speakerName || '旁白'}
                        </div>
                        <div style={{ fontSize: 13.5, color: '#f1f5f9', lineHeight: 1.5 }}>
                          {selectedScene.dialogue.text}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Bottom Live Bidirectional YAML Drawer */}
                  {showYamlDrawer && (
                    <div
                      style={{
                        height: 215,
                        backgroundColor: '#050811',
                        borderTop: `1px solid ${borderCol}`,
                        display: 'flex',
                        flexDirection: 'column',
                      }}
                    >
                      <div
                        style={{
                          padding: '6px 14px',
                          background: '#0b1324',
                          borderBottom: '1px solid #1e293b',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          fontSize: 11.5,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ color: '#38bdf8', fontWeight: 700 }}>
                            📄 场景 YAML 实时配置 (scenes/{selectedScene.id}.yaml)
                          </span>
                          {yamlError && (
                            <span style={{ color: '#f87171' }}>⚠ {yamlError}</span>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            onClick={handleApplyYamlEdit}
                            style={{
                              padding: '3px 10px',
                              background: '#0284c7',
                              color: '#fff',
                              border: 'none',
                              borderRadius: 4,
                              fontSize: 11,
                              fontWeight: 600,
                              cursor: 'pointer',
                            }}
                          >
                            将 YAML 修改应用到舞台
                          </button>
                          <button
                            onClick={() =>
                              downloadTextFile(`${selectedScene.id}.yaml`, yamlText)
                            }
                            style={{
                              padding: '3px 10px',
                              background: '#1e293b',
                              color: '#bae6fd',
                              border: '1px solid #334155',
                              borderRadius: 4,
                              fontSize: 11,
                              cursor: 'pointer',
                            }}
                          >
                            导出此 YAML 文件
                          </button>
                        </div>
                      </div>
                      <textarea
                        value={yamlText}
                        onChange={(e) => setYamlText(e.target.value)}
                        spellCheck={false}
                        style={{
                          flex: 1,
                          width: '100%',
                          padding: '10px 14px',
                          background: '#040710',
                          color: '#7dd3fc',
                          border: 'none',
                          outline: 'none',
                          fontFamily: '"JetBrains Mono", monospace',
                          fontSize: 12,
                          lineHeight: 1.55,
                          resize: 'none',
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>
                  )}
                </main>

                {/* RIGHT INSPECTOR: 场景背景、音效、角色位置属性、对话与分支选项配置 */}
                <aside
                  style={{
                    width: 350,
                    backgroundColor: bgPanel,
                    borderLeft: `1px solid ${borderCol}`,
                    padding: 14,
                    overflowY: 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 14,
                    flexShrink: 0,
                  }}
                >
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: '#38bdf8' }}>
                    🛠 场景可视化属性检查器
                  </div>

                  {/* 1. Scene Title & Storyline */}
                  <div
                    style={{
                      padding: 10,
                      borderRadius: 8,
                      background: bgSub,
                      border: `1px solid ${borderCol}`,
                    }}
                  >
                    <label style={{ fontSize: 11, color: textMuted, display: 'block', marginBottom: 4 }}>
                      场景标题 (Scene Title)
                    </label>
                    <input
                      type="text"
                      value={selectedScene.title}
                      onChange={(e) => updateSelectedScene({ title: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '6px 8px',
                        borderRadius: 5,
                        border: `1px solid ${borderCol}`,
                        background: bgPanel,
                        color: textPrimary,
                        fontSize: 12,
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>

                  {/* 2. Background & Weather & Audio */}
                  <div
                    style={{
                      padding: 10,
                      borderRadius: 8,
                      background: bgSub,
                      border: `1px solid ${borderCol}`,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#38bdf8' }}>
                      🏞 背景与天气粒子 / 音效
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <div>
                        <label style={{ fontSize: 10.5, color: textMuted, display: 'block', marginBottom: 2 }}>
                          背景预设
                        </label>
                        <select
                          value={selectedScene.background.presetId}
                          onChange={(e) =>
                            updateSelectedScene({
                              background: {
                                ...selectedScene.background,
                                presetId: e.target.value as BackgroundPresetId,
                              },
                            })
                          }
                          style={{
                            width: '100%',
                            padding: '5px 6px',
                            borderRadius: 5,
                            border: `1px solid ${borderCol}`,
                            background: bgPanel,
                            color: textPrimary,
                            fontSize: 11.5,
                          }}
                        >
                          {Object.entries(BACKGROUND_PRESET_META).map(([id, meta]) => (
                            <option key={id} value={id}>
                              {meta.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label style={{ fontSize: 10.5, color: textMuted, display: 'block', marginBottom: 2 }}>
                          动态天气特效
                        </label>
                        <select
                          value={selectedScene.background.weather}
                          onChange={(e) =>
                            updateSelectedScene({
                              background: {
                                ...selectedScene.background,
                                weather: e.target.value as WeatherEffectType,
                              },
                            })
                          }
                          style={{
                            width: '100%',
                            padding: '5px 6px',
                            borderRadius: 5,
                            border: `1px solid ${borderCol}`,
                            background: bgPanel,
                            color: textPrimary,
                            fontSize: 11.5,
                          }}
                        >
                          <option value="rain">🌧 暴雨 (Rain)</option>
                          <option value="bubbles">🫧 深海微光气泡 (Bubbles)</option>
                          <option value="starlight">✨ 星海微粒 (Starlight)</option>
                          <option value="fireflies">🌟 黎明萤火 (Fireflies)</option>
                          <option value="snow">❄ 飘雪 (Snow)</option>
                          <option value="none">无特效</option>
                        </select>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <div>
                        <label style={{ fontSize: 10.5, color: textMuted, display: 'block', marginBottom: 2 }}>
                          背景音乐 (BGM)
                        </label>
                        <select
                          value={selectedScene.audio.bgmId}
                          onChange={(e) =>
                            updateSelectedScene({
                              audio: {
                                ...selectedScene.audio,
                                bgmId: e.target.value as any,
                              },
                            })
                          }
                          style={{
                            width: '100%',
                            padding: '5px 6px',
                            borderRadius: 5,
                            border: `1px solid ${borderCol}`,
                            background: bgPanel,
                            color: textPrimary,
                            fontSize: 11.5,
                          }}
                        >
                          <option value="rain_echo">雨夜回响 (rain_echo)</option>
                          <option value="blue_nocturne">蔚蓝夜曲 (blue_nocturne)</option>
                          <option value="starlight_waltz">星光圆舞曲 (starlight_waltz)</option>
                          <option value="tension_pulse">深海脉动 (tension_pulse)</option>
                          <option value="dawn_promise">黎明之约 (dawn_promise)</option>
                          <option value="none">静音</option>
                        </select>
                      </div>

                      <div>
                        <label style={{ fontSize: 10.5, color: textMuted, display: 'block', marginBottom: 2 }}>
                          触发音效 (SFX)
                        </label>
                        <select
                          value={selectedScene.audio.sfxId}
                          onChange={(e) =>
                            updateSelectedScene({
                              audio: {
                                ...selectedScene.audio,
                                sfxId: e.target.value as any,
                              },
                            })
                          }
                          style={{
                            width: '100%',
                            padding: '5px 6px',
                            borderRadius: 5,
                            border: `1px solid ${borderCol}`,
                            background: bgPanel,
                            color: textPrimary,
                            fontSize: 11.5,
                          }}
                        >
                          <option value="rain_ambience">雨声环境音</option>
                          <option value="train_bell">列车进站铃</option>
                          <option value="heartbeat">心跳共鸣</option>
                          <option value="chime">怀表清脆鸣响</option>
                          <option value="page_turn">翻页记录音</option>
                          <option value="wave_crash">潮汐涌动</option>
                          <option value="none">无</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* 3. Stage Characters Placement & Attributes */}
                  <div
                    style={{
                      padding: 10,
                      borderRadius: 8,
                      background: bgSub,
                      border: `1px solid ${borderCol}`,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#ec4899' }}>
                        👤 舞台登场角色位置与属性
                      </span>
                      <select
                        value=""
                        onChange={(e) => {
                          const cid = e.target.value;
                          if (!cid) return;
                          if (selectedScene.characters.some((c) => c.characterId === cid)) {
                            setSelectedStageCharId(cid);
                            return;
                          }
                          const newPlacement: StageCharacterPlacement = {
                            characterId: cid,
                            expression: 'normal',
                            x: 50,
                            y: 56,
                            scale: 1,
                            alpha: 1,
                            flipX: false,
                            zIndex: selectedScene.characters.length + 2,
                            animation: 'fade_in',
                            speakingHighlight: true,
                          };
                          updateSelectedScene({
                            characters: [...selectedScene.characters, newPlacement],
                          });
                          setSelectedStageCharId(cid);
                        }}
                        style={{
                          padding: '3px 6px',
                          borderRadius: 4,
                          border: `1px solid ${borderCol}`,
                          background: bgPanel,
                          color: textPrimary,
                          fontSize: 11,
                        }}
                      >
                        <option value="">+ 添加角色上台</option>
                        {characters.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Character Pills on Stage */}
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {selectedScene.characters.map((pl) => {
                        const cDef = characters.find((c) => c.id === pl.characterId);
                        const isSel = selectedPlacement?.characterId === pl.characterId;
                        return (
                          <button
                            key={pl.characterId}
                            onClick={() => setSelectedStageCharId(pl.characterId)}
                            style={{
                              padding: '4px 8px',
                              borderRadius: 5,
                              background: isSel ? '#0284c7' : bgPanel,
                              color: isSel ? '#fff' : textPrimary,
                              border: `1px solid ${isSel ? '#38bdf8' : borderCol}`,
                              fontSize: 11,
                              cursor: 'pointer',
                            }}
                          >
                            {cDef?.name.split(' ')[0] || pl.characterId} ({pl.x}%, {pl.y}%)
                          </button>
                        );
                      })}
                    </div>

                    {selectedPlacement && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                          <div>
                            <label style={{ fontSize: 10.5, color: textMuted }}>
                              水平位置 X ({selectedPlacement.x}%)
                            </label>
                            <input
                              type="range"
                              min={10}
                              max={90}
                              value={selectedPlacement.x}
                              onChange={(e) =>
                                handleUpdateCharacterPlacement(
                                  selectedPlacement.characterId,
                                  { x: Number(e.target.value) }
                                )
                              }
                              style={{ width: '100%' }}
                            />
                          </div>
                          <div>
                            <label style={{ fontSize: 10.5, color: textMuted }}>
                              垂直位置 Y ({selectedPlacement.y}%)
                            </label>
                            <input
                              type="range"
                              min={25}
                              max={85}
                              value={selectedPlacement.y}
                              onChange={(e) =>
                                handleUpdateCharacterPlacement(
                                  selectedPlacement.characterId,
                                  { y: Number(e.target.value) }
                                )
                              }
                              style={{ width: '100%' }}
                            />
                          </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                          <div>
                            <label style={{ fontSize: 10.5, color: textMuted, display: 'block', marginBottom: 2 }}>
                              表情差分
                            </label>
                            <select
                              value={selectedPlacement.expression}
                              onChange={(e) =>
                                handleUpdateCharacterPlacement(
                                  selectedPlacement.characterId,
                                  { expression: e.target.value as CharacterExpression }
                                )
                              }
                              style={{
                                width: '100%',
                                padding: '4px 6px',
                                borderRadius: 4,
                                border: `1px solid ${borderCol}`,
                                background: bgPanel,
                                color: textPrimary,
                                fontSize: 11,
                              }}
                            >
                              <option value="normal">默认 (normal)</option>
                              <option value="smile">微笑 (smile)</option>
                              <option value="shy">害羞 (shy)</option>
                              <option value="surprised">惊讶 (surprised)</option>
                              <option value="sad">悲伤 (sad)</option>
                              <option value="serious">严肃 (serious)</option>
                            </select>
                          </div>

                          <div>
                            <label style={{ fontSize: 10.5, color: textMuted, display: 'block', marginBottom: 2 }}>
                              缩放比例 ({selectedPlacement.scale.toFixed(2)}x)
                            </label>
                            <input
                              type="range"
                              min={0.6}
                              max={1.4}
                              step={0.02}
                              value={selectedPlacement.scale}
                              onChange={(e) =>
                                handleUpdateCharacterPlacement(
                                  selectedPlacement.characterId,
                                  { scale: Number(e.target.value) }
                                )
                              }
                              style={{ width: '100%' }}
                            />
                          </div>
                        </div>

                        <button
                          onClick={() =>
                            updateSelectedScene({
                              characters: selectedScene.characters.filter(
                                (c) => c.characterId !== selectedPlacement.characterId
                              ),
                            })
                          }
                          style={{
                            padding: '4px 8px',
                            background: 'rgba(239, 68, 68, 0.14)',
                            color: '#f87171',
                            border: '1px solid #ef4444',
                            borderRadius: 4,
                            fontSize: 11,
                            cursor: 'pointer',
                          }}
                        >
                          将该角色移出当前场景舞台
                        </button>
                      </div>
                    )}
                  </div>

                  {/* 4. Dialogue & Choices Editor */}
                  <div
                    style={{
                      padding: 10,
                      borderRadius: 8,
                      background: bgSub,
                      border: `1px solid ${borderCol}`,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#38bdf8' }}>
                      💬 对话框台词与分支选项
                    </div>

                    <div>
                      <label style={{ fontSize: 10.5, color: textMuted, display: 'block', marginBottom: 2 }}>
                        说话人姓名
                      </label>
                      <input
                        type="text"
                        value={selectedScene.dialogue.speakerName}
                        onChange={(e) =>
                          updateSelectedScene({
                            dialogue: {
                              ...selectedScene.dialogue,
                              speakerName: e.target.value,
                            },
                          })
                        }
                        style={{
                          width: '100%',
                          padding: '5px 8px',
                          borderRadius: 5,
                          border: `1px solid ${borderCol}`,
                          background: bgPanel,
                          color: textPrimary,
                          fontSize: 12,
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ fontSize: 10.5, color: textMuted, display: 'block', marginBottom: 2 }}>
                        台词内容
                      </label>
                      <textarea
                        rows={3}
                        value={selectedScene.dialogue.text}
                        onChange={(e) =>
                          updateSelectedScene({
                            dialogue: {
                              ...selectedScene.dialogue,
                              text: e.target.value,
                            },
                          })
                        }
                        style={{
                          width: '100%',
                          padding: '6px 8px',
                          borderRadius: 5,
                          border: `1px solid ${borderCol}`,
                          background: bgPanel,
                          color: textPrimary,
                          fontSize: 12,
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>

                    {/* Choices List */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                      <span style={{ fontSize: 11, fontWeight: 700 }}>
                        当前场景分支选项 ({selectedScene.choices.length})
                      </span>
                      <button
                        onClick={() => {
                          const newChoice: SceneChoice = {
                            id: `ch_${Date.now().toString().slice(-4)}`,
                            text: '新分支选项（好感度 +10）',
                            targetSceneId:
                              selectedScene.nextSceneId || scenes[0]?.id || 'scene_01',
                            affectionChanges: [
                              { characterId: 'char_shizuki', delta: 10 },
                            ],
                          };
                          updateSelectedScene({
                            choices: [...selectedScene.choices, newChoice],
                          });
                        }}
                        style={{
                          padding: '3px 8px',
                          background: '#0284c7',
                          color: '#fff',
                          border: 'none',
                          borderRadius: 4,
                          fontSize: 11,
                          cursor: 'pointer',
                        }}
                      >
                        + 添加选项
                      </button>
                    </div>

                    {selectedScene.choices.map((ch, idx) => (
                      <div
                        key={ch.id}
                        style={{
                          padding: 8,
                          borderRadius: 6,
                          background: bgPanel,
                          border: `1px solid ${borderCol}`,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 6,
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 11, color: '#38bdf8', fontWeight: 700 }}>
                            选项 #{idx + 1}
                          </span>
                          <button
                            onClick={() =>
                              updateSelectedScene({
                                choices: selectedScene.choices.filter(
                                  (item) => item.id !== ch.id
                                ),
                              })
                            }
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: '#ef4444',
                              fontSize: 11,
                              cursor: 'pointer',
                            }}
                          >
                            删除
                          </button>
                        </div>
                        <input
                          type="text"
                          value={ch.text}
                          onChange={(e) =>
                            updateSelectedScene({
                              choices: selectedScene.choices.map((item) =>
                                item.id === ch.id ? { ...item, text: e.target.value } : item
                              ),
                            })
                          }
                          style={{
                            width: '100%',
                            padding: '4px 6px',
                            borderRadius: 4,
                            border: `1px solid ${borderCol}`,
                            background: bgSub,
                            color: textPrimary,
                            fontSize: 11.5,
                            boxSizing: 'border-box',
                          }}
                        />
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                          <span style={{ color: textMuted }}>跳转至:</span>
                          <select
                            value={ch.targetSceneId}
                            onChange={(e) =>
                              updateSelectedScene({
                                choices: selectedScene.choices.map((item) =>
                                  item.id === ch.id
                                    ? { ...item, targetSceneId: e.target.value }
                                    : item
                                ),
                              })
                            }
                            style={{
                              flex: 1,
                              padding: '3px 6px',
                              borderRadius: 4,
                              border: `1px solid ${borderCol}`,
                              background: bgSub,
                              color: textPrimary,
                              fontSize: 11,
                            }}
                          >
                            {scenes.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.title}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    ))}
                  </div>
                </aside>
              </div>
            )}

            {/* TAB 2: DIFY-STYLE WORKFLOW GRAPH */}
            {activeTab === 'dify_workflow' && (
              <DifyWorkflowCanvas
                theme={theme}
                nodes={workflowNodes}
                edges={workflowEdges}
                scenes={scenes}
                onChangeNodes={setWorkflowNodes}
                onChangeEdges={setWorkflowEdges}
                onJumpToScene={(sceneId) => {
                  setSelectedSceneId(sceneId);
                  setActiveTab('scene_editor');
                }}
                onSyncNodeToScene={(node) => {
                  if (node.sceneId) {
                    setSelectedSceneId(node.sceneId);
                  }
                  notify(`已将工作流节点「${node.title}」同步至场景 YAML 配置！`);
                }}
              />
            )}

            {/* TAB 3: POLYGLOT SCRIPT & VISUAL CODE BLOCK IDE */}
            {activeTab === 'polyglot_code' && (
              <MultiLangScriptEditor
                theme={theme}
                scripts={scripts}
                currentScene={selectedScene}
                characters={characters}
                onChangeScripts={setScripts}
                onApplyScriptToScene={(scenePatch, affectionDeltas) => {
                  updateSelectedScene(scenePatch);
                  if (affectionDeltas.length > 0) {
                    setCharacters((prev) =>
                      prev.map((c) => {
                        const found = affectionDeltas.find((d) => d.characterId === c.id);
                        if (!found) return c;
                        return {
                          ...c,
                          affection: Math.max(
                            0,
                            Math.min(c.maxAffection, c.affection + found.delta)
                          ),
                        };
                      })
                    );
                  }
                  notify('脚本执行完毕，舞台背景/立绘与角色好感度已实时更新！');
                }}
              />
            )}

            {/* TAB 4: CHARACTER SYSTEM, CHAPTERS & STORYLINES/ENDINGS */}
            {activeTab === 'character_story' && (
              <CharacterAndStorySystem
                theme={theme}
                characters={characters}
                chapters={chapters}
                scenes={scenes}
                storylines={storylines}
                endings={endings}
                onChangeCharacters={setCharacters}
                onChangeChapters={setChapters}
                onChangeStorylines={setStorylines}
                onChangeEndings={setEndings}
                onJumpToScene={(sceneId) => {
                  setSelectedSceneId(sceneId);
                  setActiveTab('scene_editor');
                }}
              />
            )}

            {/* TAB 5: PLAY BLUE TEMPLATE GAME (完整的蓝色模板游戏运行环境) */}
            {activeTab === 'play_game' && (
              <div style={{ flex: 1, width: '100%', height: '100%', overflow: 'hidden' }}>
                <BlueTemplateGameRunner
                  chapters={chapters}
                  scenes={scenes}
                  characters={characters}
                  endings={endings}
                  initialSceneId={selectedScene.id}
                  startInMenu={gameStartInMenu}
                  onExitToEditor={() => setActiveTab('scene_editor')}
                />
              </div>
            )}

            {/* TAB 6: CROSS-PLATFORM BUILD & TAURI 2 TARGETS */}
            {activeTab === 'platform_build' && (
              <div
                style={{
                  flex: 1,
                  padding: 24,
                  overflowY: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 20,
                }}
              >
                <div
                  style={{
                    background: bgPanel,
                    border: `1px solid ${borderCol}`,
                    borderRadius: 10,
                    padding: 20,
                  }}
                >
                  <h2 style={{ margin: '0 0 8px 0', color: '#38bdf8' }}>
                    📦 Tauri 2 跨平台构建与全工程 YAML 导出中心
                  </h2>
                  <p style={{ margin: 0, fontSize: 13, color: textMuted }}>
                    MooVN 采用 <strong>TypeScript + Tauri 2 + Pixi.js + YAML</strong> 架构，必选支持{' '}
                    <strong>Windows</strong> 与 <strong>Android</strong>，同时完整配置了{' '}
                    <strong>iOS</strong> 与 <strong>macOS</strong> 可选构建目标。
                  </p>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(4, 1fr)',
                      gap: 14,
                      marginTop: 18,
                    }}
                  >
                    {[
                      {
                        platform: 'Windows (必选支持)',
                        targets: 'x64 / ARM64 · .msi / NSIS .exe',
                        cmd: 'npm run tauri:build',
                        status: '已就绪 (WebView2)',
                        color: '#38bdf8',
                      },
                      {
                        platform: 'Android (必选支持)',
                        targets: 'API 24+ · .apk / .aab',
                        cmd: 'npm run tauri:android:init && npm run tauri:android:dev',
                        status: '已就绪 (Tauri 2 Mobile)',
                        color: '#10b981',
                      },
                      {
                        platform: 'iOS (可选支持)',
                        targets: 'iOS 13.0+ · .ipa / Xcode',
                        cmd: 'npm run tauri:ios:init',
                        status: '已配置可选支持',
                        color: '#a855f7',
                      },
                      {
                        platform: 'macOS (可选支持)',
                        targets: 'Universal Binary · .app / .dmg',
                        cmd: 'npm run tauri:build -- --target universal-apple-darwin',
                        status: '已配置可选支持',
                        color: '#f59e0b',
                      },
                    ].map((item) => (
                      <div
                        key={item.platform}
                        style={{
                          padding: 16,
                          borderRadius: 8,
                          background: bgSub,
                          border: `1.5px solid ${item.color}`,
                        }}
                      >
                        <div style={{ fontSize: 15, fontWeight: 800, color: item.color }}>
                          {item.platform}
                        </div>
                        <div style={{ fontSize: 12, color: textPrimary, margin: '6px 0' }}>
                          产物格式：{item.targets}
                        </div>
                        <div style={{ fontSize: 11, color: '#10b981', marginBottom: 8 }}>
                          ● {item.status}
                        </div>
                        <code
                          style={{
                            display: 'block',
                            padding: 6,
                            borderRadius: 4,
                            background: '#050811',
                            color: '#93c5fd',
                            fontSize: 10.5,
                          }}
                        >
                          {item.cmd}
                        </code>
                      </div>
                    ))}
                  </div>

                  <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
                    <button
                      onClick={() => {
                        const fullYaml = projectToYaml({
                          chapters,
                          scenes,
                          characters,
                          storylines,
                          endings,
                        });
                        downloadTextFile('moovn_project_bundle.yaml', fullYaml);
                        notify('已导出完整工程 YAML 配置文件 moovn_project_bundle.yaml');
                      }}
                      style={{
                        padding: '10px 20px',
                        background: 'linear-gradient(135deg, #0284c7, #1d4ed8)',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 6,
                        fontSize: 13,
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      ⬇ 导出全工程 YAML 包 (moovn_project_bundle.yaml)
                    </button>

                    <button
                      onClick={() => {
                        setGameStartInMenu(true);
                        setActiveTab('play_game');
                      }}
                      style={{
                        padding: '10px 20px',
                        background: '#10b981',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 6,
                        fontSize: 13,
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      ▶ 立即启动蓝色模板游戏完整预览
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
