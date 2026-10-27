import { useState, useCallback, useMemo, useEffect } from 'react';
import {
  VNProject,
  SceneNode,
  WorkflowNodeType,
  DialogueLine,
  ChoiceOption,
  CharacterPlacement,
  CharacterProfile,
  StoryChapter,
  VisualScriptBlock,
  GameUIConfig,
} from '../types';
import { DEFAULT_PROJECT } from '../data/defaultProject';
import { CHARACTER_ASSETS, BACKGROUND_ASSETS } from '../data/assets';
import { getNodeMeta } from '../data/nodeRegistry';
import { putProjectSnapshot } from '../lib/projectStorage';
import { newId } from '../lib/ids';

export function useEditor() {
  const [editorState, setEditorState] = useState<{
    project: VNProject;
    history: VNProject[];
    future: VNProject[];
    revision: number;
  }>(() => ({ project: DEFAULT_PROJECT, history: [], future: [], revision: 0 }));

  const [storageWarning, setStorageWarning] = useState<string | null>(null);
  const project = editorState.project;
  const history = editorState.history;
  const future = editorState.future;

  // A crash-recovery draft is separate from the saved project file. Structured cloning
  // happens after the user stops typing, rather than synchronous JSON on every edit.
  useEffect(() => {
    if (editorState.revision === 0) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      putProjectSnapshot(`draft:${project.id}`, project).then(() => {
        if (!cancelled) setStorageWarning(null);
      }).catch((error: unknown) => {
        if (!cancelled) setStorageWarning(`草稿缓存失败：${error instanceof Error ? error.message : String(error)}`);
      });
    }, 1000);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [project, editorState.revision]);

  const setProject = useCallback(
    (updaterOrNext: VNProject | ((prev: VNProject) => VNProject)) => {
      setEditorState((prev) => {
        const next = typeof updaterOrNext === 'function' ? updaterOrNext(prev.project) : updaterOrNext;
        if (next === prev.project) return prev;
        return {
          project: next,
          history: [...prev.history.slice(-23), prev.project],
          future: [],
          revision: prev.revision + 1,
        };
      });
    },
    []
  );

  const adoptSavedProject = useCallback((previous: VNProject, saved: VNProject) => {
    setEditorState((state) => state.project === previous ? { ...state, project: saved } : state);
  }, []);

  const replaceProject = useCallback((next: VNProject) => {
    setEditorState({ project: next, history: [], future: [], revision: 0 });
  }, []);

  const [selectedChapterId, setSelectedChapterId] = useState<string>(
    project.chapters[0]?.id || 'chapter-1'
  );
  const [selectedNodeId, setSelectedNodeId] = useState<string>(project.startNodeId);
  const [selectedDialogueIndex, setSelectedDialogueIndex] = useState<number>(0);
  const [selectedCharacterPlacementId, setSelectedCharacterPlacementId] = useState<string | null>(null);

  const commitProject = useCallback(
    (updater: (prev: VNProject) => VNProject) => {
      setProject(updater);
    },
    [setProject]
  );

  const undo = useCallback(() => {
    setEditorState((prev) => {
      if (prev.history.length === 0) return prev;
      return {
        project: prev.history[prev.history.length - 1],
        history: prev.history.slice(0, -1),
        future: [prev.project, ...prev.future],
        revision: prev.revision + 1,
      };
    });
  }, []);

  const redo = useCallback(() => {
    setEditorState((prev) => {
      if (prev.future.length === 0) return prev;
      return {
        project: prev.future[0],
        history: [...prev.history.slice(-23), prev.project],
        future: prev.future.slice(1),
        revision: prev.revision + 1,
      };
    });
  }, []);

  const selectedNode = useMemo(() => {
    return (
      project.nodes.find((n) => n.id === selectedNodeId) ||
      project.nodes[0]
    );
  }, [project.nodes, selectedNodeId]);

  const selectedChapter = useMemo(() => {
    const chId = selectedNode?.chapterId || selectedChapterId;
    return project.chapters.find((c) => c.id === chId) || project.chapters[0];
  }, [project.chapters, selectedNode, selectedChapterId]);

  const selectNode = useCallback((id: string) => {
    setSelectedNodeId(id);
    setSelectedDialogueIndex(0);
    setSelectedCharacterPlacementId(null);
  }, []);

  const updateUIConfig = useCallback(
    (updater: (prev: GameUIConfig) => GameUIConfig) => {
      commitProject((prev) => ({
        ...prev,
        uiConfig: updater(prev.uiConfig),
      }));
    },
    [commitProject]
  );

  const updateNode = useCallback(
    (nodeId: string, updater: (node: SceneNode) => SceneNode) => {
      commitProject((prev) => ({
        ...prev,
        nodes: prev.nodes.map((n) => (n.id === nodeId ? updater(n) : n)),
      }));
    },
    [commitProject]
  );

  const addChapter = useCallback(() => {
    const nextIdx = project.chapters.length + 1;
    const newChapter: StoryChapter = {
      id: newId('chapter'),
      index: nextIdx,
      title: `第${nextIdx}章：新篇章`,
      subtitle: `Chapter 0${nextIdx}`,
      yamlFileName: `chapter_0${nextIdx}.yaml`,
      description: '章节大纲描述',
    };
    commitProject((prev) => ({
      ...prev,
      chapters: [...prev.chapters, newChapter],
    }));
    setSelectedChapterId(newChapter.id);
  }, [project.chapters.length, commitProject]);

  const updateChapter = useCallback(
    (chapterId: string, updater: (ch: StoryChapter) => StoryChapter) => {
      commitProject((prev) => ({
        ...prev,
        chapters: prev.chapters.map((c) => (c.id === chapterId ? updater(c) : c)),
      }));
    },
    [commitProject]
  );

  const addCharacterProfile = useCallback(() => {
    const newChar: CharacterProfile = {
      id: newId('char'),
      name: '新登场角色',
      titleRole: '',
      color: '#38bdf8',
      spriteId: '',
      expressions: [],
      initialAffection: 20,
      maxAffection: 100,
      bio: '角色人物设定小传',
      customAttributes: [],
    };
    commitProject((prev) => ({
      ...prev,
      characters: [...prev.characters, newChar],
    }));
  }, [commitProject]);

  const updateCharacterProfile = useCallback(
    (charId: string, updater: (c: CharacterProfile) => CharacterProfile) => {
      commitProject((prev) => ({
        ...prev,
        characters: prev.characters.map((c) => (c.id === charId ? updater(c) : c)),
      }));
    },
    [commitProject]
  );

  const addNode = useCallback(
    (type: WorkflowNodeType, customPosition?: { x: number; y: number }) => {
      const id = newId('node');
      const count = project.nodes.length + 1;
      const activeChapterId = selectedNode?.chapterId || selectedChapterId || project.chapters[0].id;
      const meta = getNodeMeta(type);

      const newNode: SceneNode = {
        id,
        type,
        title: `${meta.title} ${count}`,
        chapterId: activeChapterId,
        position: customPosition || {
          x: (selectedNode?.position.x ?? 200) + 310,
          y: (selectedNode?.position.y ?? 160) + (count % 2 === 0 ? 40 : -20),
        },
        backgroundId: selectedNode?.backgroundId ?? '',
        bgmId: selectedNode?.bgmId ?? '',
        transition: 'fade',
        weatherEffect: type === 'weather_particles' ? 'sakura' : 'none',
        colorFilter: type === 'color_filter' ? 'sepia' : 'none',
        characters:
          selectedNode?.characters.map((c) => ({ ...c, id: newId('pl') })) || [],
        dialogues:
          type === 'dialogue' ||
          type === 'narration' ||
          type === 'inner_monologue' ||
          type === 'cg_caption'
            ? [
                {
                  id: newId('dlg'),
                  speakerId:
                    type === 'narration' || type === 'inner_monologue'
                      ? 'narrator'
                      : project.characters[0]?.id || 'narrator',
                  speakerName:
                    type === 'narration'
                      ? '旁白'
                      : type === 'inner_monologue'
                      ? '内心独白'
                      : project.characters[0]?.name || '旁白',
                  speakerColor:
                    type === 'narration' || type === 'inner_monologue'
                      ? '#94a3b8'
                      : project.characters[0]?.color || '#60a5fa',
                  text: '在此输入当前节点的剧情台词……',
                },
              ]
            : [],
        choices:
          type === 'choice' || type === 'timed_choice' || type === 'switch_branch' || type === 'random_branch'
            ? [
                {
                  id: newId('opt'),
                  text: '分支选项一',
                  targetNodeId: '',
                  affectionCharacterId: project.characters[0]?.id,
                  affectionDelta: 5,
                },
                {
                  id: newId('opt'),
                  text: '分支选项二',
                  targetNodeId: '',
                  affectionCharacterId: project.characters[0]?.id,
                  affectionDelta: 0,
                },
              ]
            : [],
        timedChoiceSeconds: type === 'timed_choice' ? 12 : undefined,
        defaultTimeoutTargetId: undefined,
        conditionRule:
          type === 'condition'
            ? {
                variableType: 'affection',
                characterId: project.characters[0]?.id,
                attributeKey: 'affection',
                operator: '>=',
                compareValue: 50,
                trueTargetNodeId: '',
                falseTargetNodeId: '',
              }
            : undefined,
        fadeConfig:
          type === 'fade'
            ? {
                targetType: 'screen',
                direction: 'in',
                characterId: project.characters[0]?.id,
                backgroundId: selectedNode?.backgroundId || '',
                durationMs: 800,
                easing: 'ease-in-out',
                tintColor: '#000000',
              }
            : undefined,
        screenTextConfig:
          type === 'screen_text' ||
          type === 'chapter_title' ||
          type === 'floating_subtitle' ||
          type === 'banner_notice'
            ? {
                text:
                  type === 'chapter_title'
                    ? '新章节标题'
                    : type === 'banner_notice'
                    ? '场景地点与时间提示'
                    : '在此输入全屏字幕内容',
                subText:
                  type === 'chapter_title'
                    ? 'NEW CHAPTER'
                    : '',
                x: type === 'banner_notice' ? 22 : 50,
                y: type === 'floating_subtitle' ? 84 : type === 'banner_notice' ? 14 : 46,
                fontSize: type === 'chapter_title' ? 36 : type === 'banner_notice' ? 20 : 28,
                color: '#ffffff',
                strokeColor: '#020617',
                align: type === 'banner_notice' ? 'left' : 'center',
                bgOverlay:
                  type === 'floating_subtitle'
                    ? 'cinematic_bars'
                    : type === 'chapter_title'
                    ? 'dim'
                    : 'none',
                animation: 'fade',
                durationMs: 2200,
              }
            : undefined,
        cameraConfig:
          type === 'camera_pan_zoom' || type === 'camera_shake' || type === 'screen_flash'
            ? {
                zoom: type === 'camera_pan_zoom' ? 1.25 : 1.0,
                offsetX: 0,
                offsetY: 0,
                shakeIntensity: type === 'camera_shake' ? 'medium' : 'none',
                flashColor: type === 'screen_flash' ? '#ffffff' : undefined,
                durationMs: 700,
              }
            : undefined,
        waitDurationMs: type === 'wait_timer' ? 1500 : undefined,
        toastMessage:
          type === 'popup_toast'
            ? '系统提示：获得新道具'
            : type === 'clue_unlock'
            ? '已解锁新档案词条！'
            : undefined,
        unlockedClueTitle: type === 'clue_unlock' ? '新档案词条' : undefined,
        unlockedClueDesc: type === 'clue_unlock' ? '在此填写解锁线索的详细说明。' : undefined,
        targetExpressionCharId:
          type === 'char_expression' ? project.characters[0]?.id : undefined,
        targetExpressionSpriteId:
          type === 'char_expression' ? project.characters[0]?.spriteId || undefined : undefined,
        affectionTargetCharId:
          type === 'affection_change' ? project.characters[0]?.id : undefined,
        affectionDelta: type === 'affection_change' ? 10 : undefined,
        variableKey: type === 'set_variable' ? 'chapterIndex' : undefined,
        variableValue: type === 'set_variable' ? 1 : undefined,
        loopConfig:
          type === 'repeat_loop' ||
          type === 'while_loop' ||
          type === 'for_each_loop' ||
          type === 'if_else_container' ||
          type === 'break_continue'
            ? {
                repeatCount: type === 'repeat_loop' ? 3 : undefined,
                conditionExpr:
                  type === 'while_loop'
                    ? 'ctx.vars.chapterIndex < 5'
                    : type === 'if_else_container'
                    ? 'ctx.vars.chapterIndex >= 1'
                    : undefined,
                iteratorVar: type === 'for_each_loop' ? 'char' : undefined,
                collectionTarget: type === 'for_each_loop' ? 'characters' : undefined,
                breakMode: type === 'break_continue' ? 'break' : undefined,
              }
            : undefined,
        logicConfig:
          type === 'math_operation' ||
          type === 'string_format' ||
          type === 'array_operation' ||
          type === 'function_call'
            ? {
                targetVar: 'chapterIndex',
                mathOp: type === 'math_operation' ? '+=' : undefined,
                operandValue: type === 'math_operation' ? 1 : '新记录项',
                clampMin: 0,
                clampMax: 100,
                formatTemplate:
                  type === 'string_format' ? '当前进度：第 ${chapterIndex} 章' : undefined,
                arrayAction: type === 'array_operation' ? 'push' : undefined,
                functionName: type === 'function_call' ? 'onCustomEvent' : undefined,
                functionArgs: type === 'function_call' ? 'ctx' : undefined,
              }
            : undefined,
        childrenNodes:
          type === 'repeat_loop' ||
          type === 'while_loop' ||
          type === 'for_each_loop' ||
          type === 'if_else_container' ||
          type === 'parallel_container' ||
          type === 'try_catch_container'
            ? [
                {
                  id: newId('child'),
                  type: 'camera_shake',
                  title: '镜头震动',
                  params: { intensity: 'medium', durationMs: 400 },
                },
                {
                  id: newId('child'),
                  type: 'dialogue',
                  title: '子块对白',
                  params: {
                    speaker: project.characters[0]?.name || '旁白',
                    text: '在此输入容器内部子块台词……',
                  },
                },
              ]
            : undefined,
        elseChildrenNodes:
          type === 'if_else_container' || type === 'try_catch_container'
            ? [
                {
                  id: newId('else'),
                  type: 'dialogue',
                  title: '否则分支对白',
                  params: { speaker: '旁白', text: '在此输入条件未满足时的分支台词。' },
                },
              ]
            : undefined,
        visualBlocks: [],
        nextNodeId: null,
        endingType: type === 'end' ? 'good' : undefined,
        endingTitle: type === 'end' ? '结局' : undefined,
        scriptLanguage: 'typescript',
        customScript:
          type === 'script'
            ? `// MooVN 节点自定义脚本\nmoovn.text.say("旁白", "执行自定义脚本节点");\nmoovn.save.create("Auto_Slot");\n`
            : undefined,
      };

      commitProject((prev) => ({
        ...prev,
        nodes: [...prev.nodes, newNode],
      }));
      setSelectedNodeId(id);
      setSelectedDialogueIndex(0);
      return id;
    },
    [project.nodes.length, project.startNodeId, project.characters, selectedNode, selectedChapterId, commitProject]
  );

  const deleteNode = useCallback(
    (nodeId: string) => {
      if (project.nodes.length <= 1) return;
      commitProject((prev) => {
        const filtered = prev.nodes.filter((n) => n.id !== nodeId);
        const fallbackStartId = filtered[0].id;
        return {
          ...prev,
          startNodeId:
            prev.startNodeId === nodeId ? fallbackStartId : prev.startNodeId,
          nodes: filtered.map((n) => ({
            ...n,
            nextNodeId: n.nextNodeId === nodeId ? null : n.nextNodeId,
            defaultTimeoutTargetId:
              n.defaultTimeoutTargetId === nodeId
                ? undefined
                : n.defaultTimeoutTargetId,
            conditionRule: n.conditionRule
              ? {
                  ...n.conditionRule,
                  trueTargetNodeId:
                    n.conditionRule.trueTargetNodeId === nodeId
                      ? ''
                      : n.conditionRule.trueTargetNodeId,
                  falseTargetNodeId:
                    n.conditionRule.falseTargetNodeId === nodeId
                      ? ''
                      : n.conditionRule.falseTargetNodeId,
                }
              : undefined,
            choices: n.choices.map((c) =>
              c.targetNodeId === nodeId ? { ...c, targetNodeId: '' } : c
            ),
          })),
        };
      });
      if (selectedNodeId === nodeId) {
        const remaining = project.nodes.filter((n) => n.id !== nodeId);
        if (remaining[0]) setSelectedNodeId(remaining[0].id);
      }
    },
    [project.nodes, selectedNodeId, commitProject]
  );

  const addDialogueLine = useCallback(
    (nodeId: string) => {
      const defaultChar = project.characters[0];
      const newLine: DialogueLine = {
        id: newId('dlg'),
        speakerId: defaultChar?.id || 'narrator',
        speakerName: defaultChar?.name || '旁白',
        speakerColor: defaultChar?.color || '#60a5fa',
        text: '请输入新的角色对白……',
        expressionSpriteId: defaultChar?.spriteId || undefined,
      };
      updateNode(nodeId, (node) => ({
        ...node,
        dialogues: [...node.dialogues, newLine],
      }));
    },
    [project.characters, updateNode]
  );

  const updateDialogueLine = useCallback(
    (nodeId: string, lineId: string, patch: Partial<DialogueLine>) => {
      updateNode(nodeId, (node) => ({
        ...node,
        dialogues: node.dialogues.map((d) => (d.id === lineId ? { ...d, ...patch } : d)),
      }));
    },
    [updateNode]
  );

  const deleteDialogueLine = useCallback(
    (nodeId: string, lineId: string) => {
      updateNode(nodeId, (node) => {
        if (node.dialogues.length <= 1) return node;
        return {
          ...node,
          dialogues: node.dialogues.filter((d) => d.id !== lineId),
        };
      });
      setSelectedDialogueIndex(0);
    },
    [updateNode]
  );

  const addChoiceOption = useCallback(
    (nodeId: string) => {
      const opt: ChoiceOption = {
        id: newId('opt'),
        text: '新增分支选项',
        targetNodeId: project.startNodeId,
        affectionCharacterId: project.characters[0]?.id,
        affectionDelta: 5,
      };
      updateNode(nodeId, (node) => ({
        ...node,
        choices: [...node.choices, opt],
      }));
    },
    [project.startNodeId, project.characters, updateNode]
  );

  const updateChoiceOption = useCallback(
    (nodeId: string, choiceId: string, patch: Partial<ChoiceOption>) => {
      updateNode(nodeId, (node) => ({
        ...node,
        choices: node.choices.map((c) => (c.id === choiceId ? { ...c, ...patch } : c)),
      }));
    },
    [updateNode]
  );

  const deleteChoiceOption = useCallback(
    (nodeId: string, choiceId: string) => {
      updateNode(nodeId, (node) => ({
        ...node,
        choices: node.choices.filter((c) => c.id !== choiceId),
      }));
    },
    [updateNode]
  );

  const addCharacterToStage = useCallback(
    (nodeId: string, characterId: string) => {
      const profile = project.characters.find((c) => c.id === characterId);
      if (!profile) return;
      const spriteAsset = CHARACTER_ASSETS.find((a) => a.id === profile.spriteId);

      const placement: CharacterPlacement = {
        id: newId('pl'),
        characterId: profile.id,
        name: profile.name,
        spriteId: profile.spriteId,
        expressionLabel: spriteAsset?.expressionLabel || '默认',
        x: 50,
        y: 92,
        scale: 1,
        opacity: 1,
        enterAnimation: 'fade',
      };
      updateNode(nodeId, (node) => ({
        ...node,
        characters: [...node.characters, placement],
      }));
      setSelectedCharacterPlacementId(placement.id);
    },
    [project.characters, updateNode]
  );

  const updateCharacterPlacement = useCallback(
    (nodeId: string, placementId: string, patch: Partial<CharacterPlacement>) => {
      updateNode(nodeId, (node) => ({
        ...node,
        characters: node.characters.map((c) =>
          c.id === placementId ? { ...c, ...patch } : c
        ),
      }));
    },
    [updateNode]
  );

  const removeCharacterPlacement = useCallback(
    (nodeId: string, placementId: string) => {
      updateNode(nodeId, (node) => ({
        ...node,
        characters: node.characters.filter((c) => c.id !== placementId),
      }));
      if (selectedCharacterPlacementId === placementId) {
        setSelectedCharacterPlacementId(null);
      }
    },
    [updateNode, selectedCharacterPlacementId]
  );

  const addVisualBlock = useCallback(
    (nodeId: string, block: VisualScriptBlock) => {
      updateNode(nodeId, (node) => ({
        ...node,
        visualBlocks: [...(node.visualBlocks || []), block],
      }));
    },
    [updateNode]
  );

  const updateVisualBlock = useCallback(
    (nodeId: string, blockId: string, params: Record<string, string | number | boolean>) => {
      updateNode(nodeId, (node) => ({
        ...node,
        visualBlocks: (node.visualBlocks || []).map((b) =>
          b.id === blockId ? { ...b, params: { ...b.params, ...params } } : b
        ),
      }));
    },
    [updateNode]
  );

  const removeVisualBlock = useCallback(
    (nodeId: string, blockId: string) => {
      updateNode(nodeId, (node) => ({
        ...node,
        visualBlocks: (node.visualBlocks || []).filter((b) => b.id !== blockId),
      }));
    },
    [updateNode]
  );

  const resetToDefault = useCallback(() => {
    localStorage.removeItem('moovn_studio_project_v6');
    setEditorState((prev) => ({
      project: DEFAULT_PROJECT,
      history: [],
      future: [],
      revision: prev.revision + 1,
    }));
    setStorageWarning(null);
    setSelectedChapterId(DEFAULT_PROJECT.chapters[0].id);
    setSelectedNodeId(DEFAULT_PROJECT.startNodeId);
    setSelectedDialogueIndex(0);
  }, []);

  return {
    project,
    setProject,
    adoptSavedProject,
    replaceProject,
    storageWarning,
    selectedChapterId,
    setSelectedChapterId,
    selectedChapter,
    selectedNode,
    selectedNodeId,
    selectNode,
    selectedDialogueIndex,
    setSelectedDialogueIndex,
    selectedCharacterPlacementId,
    setSelectedCharacterPlacementId,
    updateUIConfig,
    updateNode,
    addChapter,
    updateChapter,
    addCharacterProfile,
    updateCharacterProfile,
    addNode,
    deleteNode,
    addDialogueLine,
    updateDialogueLine,
    deleteDialogueLine,
    addChoiceOption,
    updateChoiceOption,
    deleteChoiceOption,
    addCharacterToStage,
    updateCharacterPlacement,
    removeCharacterPlacement,
    addVisualBlock,
    updateVisualBlock,
    removeVisualBlock,
    undo,
    redo,
    canUndo: history.length > 0,
    canRedo: future.length > 0,
    resetToDefault,
  };
}
