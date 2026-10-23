import { useState, useCallback, useMemo } from 'react';
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
import { CHARACTER_ASSETS, BACKGROUND_ASSETS, AUDIO_ASSETS } from '../data/assets';
import { getNodeMeta } from '../data/nodeRegistry';

export function useEditor() {
  const [project, setProject] = useState<VNProject>(() => {
    try {
      const saved = localStorage.getItem('moovn_project_v5');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && Array.isArray(parsed.chapters) && Array.isArray(parsed.nodes) && parsed.uiConfig) {
          return parsed;
        }
      }
    } catch {
      // ignore
    }
    return DEFAULT_PROJECT;
  });

  const [history, setHistory] = useState<VNProject[]>([]);
  const [future, setFuture] = useState<VNProject[]>([]);

  const [selectedChapterId, setSelectedChapterId] = useState<string>(
    project.chapters[0]?.id || 'chapter-1'
  );
  const [selectedNodeId, setSelectedNodeId] = useState<string>(project.startNodeId);
  const [selectedDialogueIndex, setSelectedDialogueIndex] = useState<number>(0);
  const [selectedCharacterPlacementId, setSelectedCharacterPlacementId] = useState<string | null>(null);

  const commitProject = useCallback((updater: (prev: VNProject) => VNProject) => {
    setProject((prev) => {
      const next = updater(prev);
      setHistory((h) => [...h.slice(-24), prev]);
      setFuture([]);
      try {
        localStorage.setItem('moovn_project_v5', JSON.stringify(next));
      } catch {
        // ignore quota error
      }
      return next;
    });
  }, []);

  const undo = useCallback(() => {
    setHistory((h) => {
      if (h.length === 0) return h;
      const previous = h[h.length - 1];
      setFuture((f) => [project, ...f]);
      setProject(previous);
      return h.slice(0, -1);
    });
  }, [project]);

  const redo = useCallback(() => {
    setFuture((f) => {
      if (f.length === 0) return f;
      const next = f[0];
      setHistory((h) => [...h, project]);
      setProject(next);
      return f.slice(1);
    });
  }, [project]);

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
      id: `chapter-${Date.now().toString().slice(-4)}`,
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
      id: `char_${Date.now().toString().slice(-4)}`,
      name: '新登场角色',
      titleRole: '神秘转校生',
      color: '#38bdf8',
      spriteId: CHARACTER_ASSETS[0].id,
      expressions: [
        { id: '微笑', label: '微笑', spriteId: CHARACTER_ASSETS[0].id },
      ],
      initialAffection: 20,
      maxAffection: 100,
      bio: '角色人物设定小传',
      customAttributes: [
        { id: `attr_${Date.now()}`, key: 'courage', label: '勇气', value: 10 },
      ],
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
      const id = `node-${Date.now().toString().slice(-5)}`;
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
        backgroundId: selectedNode?.backgroundId || BACKGROUND_ASSETS[0].id,
        bgmId: selectedNode?.bgmId || AUDIO_ASSETS[0].id,
        transition: 'fade',
        weatherEffect: type === 'weather_particles' ? 'sakura' : 'none',
        colorFilter: type === 'color_filter' ? 'sepia' : 'none',
        characters:
          selectedNode?.characters.map((c) => ({ ...c, id: `pl-${Date.now()}-${Math.random().toString(36).slice(2, 5)}` })) || [],
        dialogues:
          type === 'dialogue' ||
          type === 'narration' ||
          type === 'inner_monologue' ||
          type === 'cg_caption'
            ? [
                {
                  id: `dlg-${Date.now()}`,
                  speakerId:
                    type === 'narration' || type === 'inner_monologue'
                      ? 'narrator'
                      : project.characters[0]?.id || 'yukina',
                  speakerName:
                    type === 'narration'
                      ? '旁白'
                      : type === 'inner_monologue'
                      ? '内心独白'
                      : project.characters[0]?.name || '星野雪奈',
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
                  id: `opt-${Date.now()}-1`,
                  text: '选项一：深入调查钟塔怀表（星野雪奈好感 +10）',
                  targetNodeId: project.startNodeId,
                  affectionCharacterId: project.characters[0]?.id || 'yukina',
                  affectionDelta: 10,
                },
                {
                  id: `opt-${Date.now()}-2`,
                  text: '选项二：前往海湾石阶寻找浅浅（雾岛浅浅好感 +10）',
                  targetNodeId: project.startNodeId,
                  affectionCharacterId: 'qianqian',
                  affectionDelta: 10,
                },
              ]
            : [],
        timedChoiceSeconds: type === 'timed_choice' ? 12 : undefined,
        defaultTimeoutTargetId: type === 'timed_choice' ? project.startNodeId : undefined,
        conditionRule:
          type === 'condition'
            ? {
                variableType: 'affection',
                characterId: project.characters[0]?.id || 'yukina',
                attributeKey: 'affection',
                operator: '>=',
                compareValue: 50,
                trueTargetNodeId: project.startNodeId,
                falseTargetNodeId: project.startNodeId,
              }
            : undefined,
        fadeConfig:
          type === 'fade'
            ? {
                targetType: 'screen',
                direction: 'in',
                characterId: project.characters[0]?.id || 'yukina',
                backgroundId: BACKGROUND_ASSETS[0].id,
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
                    ? '新章节 · 命运交汇的黄昏'
                    : type === 'banner_notice'
                    ? '4月14日 17:45 · 星海学园第三图书室'
                    : '「在第十三声钟鸣落下之前，握紧我的手。」',
                subText:
                  type === 'chapter_title'
                    ? 'NEW CHAPTER — TWILIGHT OF DESTINY'
                    : 'SHIOMI CHRONICLE',
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
            ? '系统提示：获得关键道具【旧校舍黄铜钥匙】'
            : type === 'clue_unlock'
            ? '已解锁新档案词条！'
            : undefined,
        unlockedClueTitle: type === 'clue_unlock' ? '档案词条：钟塔第13格齿轮' : undefined,
        unlockedClueDesc: type === 'clue_unlock' ? '记载于《潮汐历》卷末的时间回溯核心机制。' : undefined,
        targetExpressionCharId:
          type === 'char_expression' ? project.characters[0]?.id || 'yukina' : undefined,
        targetExpressionSpriteId:
          type === 'char_expression' ? 'char-yukina-3' : undefined,
        affectionTargetCharId:
          type === 'affection_change' ? project.characters[0]?.id || 'yukina' : undefined,
        affectionDelta: type === 'affection_change' ? 10 : undefined,
        variableKey: type === 'set_variable' ? 'clueCount' : undefined,
        variableValue: type === 'set_variable' ? 3 : undefined,
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
                    ? 'ctx.vars.clueCount < 5'
                    : type === 'if_else_container'
                    ? 'ctx.affection.yukina >= 60'
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
                targetVar: 'clueCount',
                mathOp: type === 'math_operation' ? '+=' : undefined,
                operandValue: type === 'math_operation' ? 1 : '钟塔星盘碎片',
                clampMin: 0,
                clampMax: 100,
                formatTemplate:
                  type === 'string_format' ? '第 ${day_count} 日 · 已收集 ${clueCount} 枚线索' : undefined,
                arrayAction: type === 'array_operation' ? 'push' : undefined,
                functionName: type === 'function_call' ? 'onClocktowerChime' : undefined,
                functionArgs: type === 'function_call' ? 'ctx, 13' : undefined,
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
                  id: `child-${Date.now()}-1`,
                  type: 'camera_shake',
                  title: '镜头震动',
                  params: { intensity: 'medium', durationMs: 400 },
                },
                {
                  id: `child-${Date.now()}-2`,
                  type: 'dialogue',
                  title: '角色对白',
                  params: { speaker: '星野 雪奈', text: '钟塔的齿轮正在回转……' },
                },
              ]
            : undefined,
        elseChildrenNodes:
          type === 'if_else_container' || type === 'try_catch_container'
            ? [
                {
                  id: `else-${Date.now()}-1`,
                  type: 'dialogue',
                  title: '否则分支对白',
                  params: { speaker: '旁白', text: '条件尚未满足，钟声渐渐远去。' },
                },
              ]
            : undefined,
        visualBlocks: [],
        nextNodeId: null,
        endingType: type === 'end' ? 'good' : undefined,
        endingTitle: type === 'end' ? '结局：未完的约定' : undefined,
        scriptLanguage: 'typescript',
        customScript:
          type === 'script'
            ? `// @moovn/sdk 原生 TypeScript 节点逻辑\nimport { runtime } from '@moovn/sdk';\n\nexport async function onExecute() {\n  runtime.addAffection('yukina', 5);\n}\n`
            : undefined,
      };

      commitProject((prev) => ({
        ...prev,
        nodes: [...prev.nodes, newNode],
      }));
      setSelectedNodeId(id);
      setSelectedDialogueIndex(0);
    },
    [project.nodes.length, project.startNodeId, project.characters, selectedNode, selectedChapterId, commitProject]
  );

  const deleteNode = useCallback(
    (nodeId: string) => {
      if (project.nodes.length <= 1) return;
      commitProject((prev) => {
        const filtered = prev.nodes.filter((n) => n.id !== nodeId);
        const fallbackId = filtered[0].id;
        return {
          ...prev,
          startNodeId: prev.startNodeId === nodeId ? fallbackId : prev.startNodeId,
          nodes: filtered.map((n) => ({
            ...n,
            nextNodeId: n.nextNodeId === nodeId ? null : n.nextNodeId,
            choices: n.choices.map((c) =>
              c.targetNodeId === nodeId ? { ...c, targetNodeId: fallbackId } : c
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
        id: `dlg-${Date.now()}`,
        speakerId: defaultChar?.id || 'yukina',
        speakerName: defaultChar?.name || '星野雪奈',
        speakerColor: defaultChar?.color || '#60a5fa',
        text: '请输入新的角色对白……',
        expressionSpriteId: defaultChar?.spriteId || 'char-yukina-1',
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
        id: `opt-${Date.now()}`,
        text: '新增分支选项',
        targetNodeId: project.startNodeId,
        affectionCharacterId: project.characters[0]?.id || 'yukina',
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
      const profile = project.characters.find((c) => c.id === characterId) || project.characters[0];
      const spriteAsset =
        CHARACTER_ASSETS.find((a) => a.id === characterId) ||
        CHARACTER_ASSETS.find((a) => a.id === profile?.spriteId) ||
        CHARACTER_ASSETS[0];

      const placement: CharacterPlacement = {
        id: `pl-${Date.now()}`,
        characterId: profile?.id || spriteAsset.id,
        name: profile?.name || spriteAsset.characterGroup,
        spriteId: spriteAsset.id,
        expressionLabel: spriteAsset.expressionLabel,
        x: 50,
        y: 56,
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
    localStorage.removeItem('moovn_project_v5');
    setProject(DEFAULT_PROJECT);
    setSelectedChapterId(DEFAULT_PROJECT.chapters[0].id);
    setSelectedNodeId(DEFAULT_PROJECT.startNodeId);
    setSelectedDialogueIndex(0);
    setHistory([]);
    setFuture([]);
  }, []);

  return {
    project,
    setProject,
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
