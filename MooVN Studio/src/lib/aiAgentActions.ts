import type { SceneNode, VNProject, WorkflowNodeType } from '../types.ts';
import { NODE_REGISTRY, isUnsupportedNode } from '../data/nodeRegistry.ts';
import { newId } from './ids.ts';

export interface AgentProposedAction {
  type: 'update_dialogue' | 'add_dialogue' | 'set_expression' | 'update_script' | 'create_node';
  summary: string;
  speakerName?: string;
  text?: string;
  dialogueId?: string;
  characterId?: string;
  placementId?: string;
  spriteId?: string;
  scriptCode?: string;
  nodeTitle?: string;
  nodeType?: WorkflowNodeType;
}

type Preview = { ok: true; target: string; before: string; after: string } | { ok: false; reason: string };

/** Parse untrusted assistant output into known action types, without executing it. */
export function parseAgentActionsFromContent(content: string): { actions: AgentProposedAction[]; parseErrors: string[] } {
  const actions: AgentProposedAction[] = [];
  const parseErrors: string[] = [];
  const regex = /```(?:moovn-agent|json)\s*([\s\S]*?)```/gi;
  const allowed = new Set<AgentProposedAction['type']>([
    'update_dialogue', 'add_dialogue', 'set_expression', 'update_script', 'create_node',
  ]);
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    const explicit = match[0].toLowerCase().startsWith('```moovn-agent');
    try {
      const parsed: unknown = JSON.parse(match[1].trim());
      const container = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed as Record<string, unknown> : null;
      const list: unknown[] = Array.isArray(parsed) ? parsed
        : Array.isArray(container?.actions) ? container.actions : [parsed];
      for (const value of list) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
        const item = value as Record<string, unknown>;
        if (typeof item.type !== 'string' || !allowed.has(item.type as AgentProposedAction['type'])) {
          if (explicit) parseErrors.push('Agent 动作类型无效，未创建操作卡片');
          continue;
        }
        const str = (key: string) => typeof item[key] === 'string' ? item[key] as string : undefined;
        const nodeType = NODE_REGISTRY.find((meta) => meta.type === item.nodeType)?.type;
        if (item.nodeType !== undefined && !nodeType) {
          if (explicit) parseErrors.push('Agent 节点类型无效，未创建操作卡片');
          continue;
        }
        actions.push({
          type: item.type as AgentProposedAction['type'], summary: str('summary') || item.type,
          speakerName: str('speakerName'), text: str('text'), dialogueId: str('dialogueId'),
          characterId: str('characterId'), placementId: str('placementId'), spriteId: str('spriteId'),
          scriptCode: str('scriptCode'), nodeTitle: str('nodeTitle'), nodeType,
        });
      }
    } catch {
      if (explicit) parseErrors.push('Agent 动作块 JSON 格式无效');
    }
  }
  return { actions, parseErrors };
}

function expressionTarget(action: AgentProposedAction, node: SceneNode, project: VNProject) {
  if (!action.characterId || !action.spriteId) return null;
  const candidates = node.characters.filter((entry) => entry.characterId === action.characterId &&
    (!action.placementId || entry.id === action.placementId));
  if (candidates.length !== 1) return null;
  const profile = project.characters.find((entry) => entry.id === action.characterId);
  if (!profile) return null;
  const variant = profile.expressions?.find((entry) => entry.spriteId === action.spriteId);
  if (!variant && profile.spriteId !== action.spriteId) return null;
  const placement = candidates[0];
  const isDefault = profile.spriteId === action.spriteId && !variant;
  const next = {
    ...placement,
    spriteId: action.spriteId,
    expressionLabel: variant?.label || (isDefault ? '默认' : placement.expressionLabel),
    mediaType: variant?.mediaType || (isDefault ? profile.mediaType : undefined) || 'image' as const,
    mediaUrl: variant?.mediaUrl ?? (isDefault ? profile.mediaUrl : undefined),
  };
  return { placement, next };
}

/** Preview exactly what will be changed; ambiguous or absent targets fail closed. */
export function previewAgentAction(action: AgentProposedAction, node: SceneNode | undefined, project: VNProject): Preview {
  if (action.type === 'create_node') {
    const type = action.nodeType || 'dialogue';
    if (!NODE_REGISTRY.some((entry) => entry.type === type) || isUnsupportedNode(type) ||
        (type !== 'dialogue' && type !== 'narration')) {
      return { ok: false, reason: 'Agent 暂只创建对白或旁白节点，其他类型请在节点库手动创建' };
    }
    if (action.characterId && action.characterId !== 'narrator' && !project.characters.some((c) => c.id === action.characterId)) {
      return { ok: false, reason: '说话角色不存在' };
    }
    return {
      ok: true, target: `章节 ${node?.chapterId || project.chapters[0]?.id || '未指定'}：新增独立节点（不改动现有连线）`, before: '无',
      after: JSON.stringify({
        id: '自动生成', type, title: action.nodeTitle || 'Agent 新增节点',
        backgroundId: '', bgmId: '', characters: [], choices: [], nextNodeId: null,
        dialogues: action.text ? [{ speakerId: action.characterId || 'narrator', speakerName: action.speakerName || '旁白', text: action.text }] : [],
      }, null, 2),
    };
  }
  if (!node) return { ok: false, reason: '没有选中目标节点' };
  if (action.type === 'update_dialogue') {
    if (!action.dialogueId || typeof action.text !== 'string') return { ok: false, reason: '必须指定唯一 dialogueId 和新台词' };
    const matches = node.dialogues.filter((line) => line.id === action.dialogueId);
    if (matches.length !== 1) return { ok: false, reason: '台词 ID 不存在或不唯一' };
    const line = matches[0];
    return {
      ok: true, target: `台词 ${line.id}（${line.speakerName}）`,
      before: JSON.stringify({ speakerName: line.speakerName, text: line.text }, null, 2),
      after: JSON.stringify({ speakerName: action.speakerName || line.speakerName, text: action.text }, null, 2),
    };
  }
  if (action.type === 'add_dialogue') {
    if (!action.text?.trim()) return { ok: false, reason: '新增台词不能为空' };
    if (action.characterId && action.characterId !== 'narrator' && !project.characters.some((c) => c.id === action.characterId)) {
      return { ok: false, reason: '说话角色不存在' };
    }
    return {
      ok: true, target: `节点 ${node.id}：新增台词`, before: '无',
      after: JSON.stringify({ speakerId: action.characterId || 'narrator', speakerName: action.speakerName || '旁白', text: action.text }, null, 2),
    };
  }
  if (action.type === 'set_expression') {
    const target = expressionTarget(action, node, project);
    if (!target) return { ok: false, reason: '需指定唯一角色／立绘位置及该角色已有的差分' };
    const fields = (entry: typeof target.placement) => ({
      spriteId: entry.spriteId, expressionLabel: entry.expressionLabel ?? null,
      mediaType: entry.mediaType ?? null, mediaUrl: entry.mediaUrl ?? null,
    });
    return {
      ok: true, target: `角色 ${target.placement.name}（${target.placement.characterId}；位置 ${target.placement.id}）`,
      before: JSON.stringify(fields(target.placement), null, 2), after: JSON.stringify(fields(target.next), null, 2),
    };
  }
  if (action.type === 'update_script') {
    if (typeof action.scriptCode !== 'string') return { ok: false, reason: '缺少脚本内容' };
    return { ok: true, target: `节点 ${node.id} 的脚本`, before: node.customScript || '', after: action.scriptCode };
  }
  return { ok: false, reason: '动作不支持' };
}

/** Return a new node without mutating the original. The caller must check the project revision. */
export function applyAgentNodeAction(action: AgentProposedAction, node: SceneNode, project: VNProject): SceneNode | null {
  if (!previewAgentAction(action, node, project).ok) return null;
  if (action.type === 'update_dialogue') {
    return {
      ...node,
      dialogues: node.dialogues.map((line) => line.id === action.dialogueId
        ? { ...line, speakerName: action.speakerName || line.speakerName, text: action.text! } : line),
    };
  }
  if (action.type === 'add_dialogue') {
    return {
      ...node,
      dialogues: [...node.dialogues, {
        id: newId('dlg'), speakerId: action.characterId || 'narrator', speakerName: action.speakerName || '旁白',
        speakerColor: '#38bdf8', text: action.text!,
      }],
    };
  }
  if (action.type === 'set_expression') {
    const target = expressionTarget(action, node, project);
    if (!target) return null;
    return { ...node, characters: node.characters.map((entry) => entry.id === target.placement.id ? target.next : entry) };
  }
  if (action.type === 'update_script') return { ...node, customScript: action.scriptCode };
  return null;
}
