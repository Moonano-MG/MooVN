import type { NestedChildNode, SceneNode } from '../types.ts';

/** Until the probability model and all runtimes agree, old random nodes must not run as effects. */
export const RANDOM_BRANCH_UNSUPPORTED = {
  code: 'ERR_RANDOM_BRANCH_UNSUPPORTED',
  message: '随机分支的概率、权重和跨端执行尚未实现；未执行随机跳转。',
} as const;

export const SWITCH_BRANCH_UNSUPPORTED = {
  code: 'ERR_SWITCH_BRANCH_UNSUPPORTED',
  message: '多路路由的 switch-case 自动分发尚未实现；未执行分支。',
} as const;

export type BranchSupportIssue = {
  code: 'ERR_RANDOM_BRANCH_UNSUPPORTED' | 'ERR_SWITCH_BRANCH_UNSUPPORTED' | 'ERR_CHOICE_CONDITION_UNSUPPORTED';
  message: string;
};

type BranchNode = Pick<SceneNode, 'type' | 'choices' | 'childrenNodes' | 'elseChildrenNodes'>;

/** Find unsupported branch behavior without modifying an imported project's original fields. */
export function getUnsupportedBranchIssues(node: BranchNode): BranchSupportIssue[] {
  const issues: BranchSupportIssue[] = [];
  if (node.type === 'random_branch') issues.push(RANDOM_BRANCH_UNSUPPORTED);
  if (node.type === 'switch_branch') issues.push(SWITCH_BRANCH_UNSUPPORTED);
  for (const choice of node.choices) {
    if (!choice.conditionExpr?.trim()) continue;
    issues.push({
      code: 'ERR_CHOICE_CONDITION_UNSUPPORTED',
      message: `选项 ID「${choice.id}」的条件表达式尚未支持；未执行任何分支或限时跳转。`,
    });
  }
  const pending = [...(node.childrenNodes || []), ...(node.elseChildrenNodes || [])];
  const seen = new WeakSet<NestedChildNode>();
  while (pending.length > 0) {
    const child = pending.pop()!;
    if (seen.has(child)) continue;
    seen.add(child);
    const nestedIssue = child.type === 'random_branch' ? RANDOM_BRANCH_UNSUPPORTED :
      child.type === 'switch_branch' ? SWITCH_BRANCH_UNSUPPORTED : null;
    if (nestedIssue) {
      issues.push({ ...nestedIssue, message: `嵌套节点「${child.id}」：${nestedIssue.message}` });
    }
    pending.push(...(child.childrenNodes || []), ...(child.elseChildrenNodes || []));
  }
  return issues;
}

/** The player and generated code stop before applying any effect in a node with unsupported branches. */
export function getUnsupportedBranchIssue(node: BranchNode): BranchSupportIssue | null {
  return getUnsupportedBranchIssues(node)[0] || null;
}
