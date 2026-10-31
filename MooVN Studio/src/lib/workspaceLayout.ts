import type { PanelId } from '../types.ts';

export const WORKSPACE_LAYOUT_KEY = 'moovn_workspace_layout_v2';
const MAX_TREE_DEPTH = 32;
const MAX_TREE_NODES = 128;

export interface EditorGroupLeaf {
  kind: 'leaf';
  id: string;
  tabs: PanelId[];
  activeTab: PanelId;
}

export interface EditorSplitBranch {
  kind: 'branch';
  id: string;
  direction: 'horizontal' | 'vertical';
  ratio: number;
  first: EditorSplitNode;
  second: EditorSplitNode;
}

export type EditorSplitNode = EditorGroupLeaf | EditorSplitBranch;

export interface FloatingWindowState {
  id: PanelId;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
}

export interface WorkspaceLayout {
  splitRoot: EditorSplitNode | null;
  floatingWindows: FloatingWindowState[];
}

type ParseResult = { ok: true; value: WorkspaceLayout } | { ok: false; error: string };
type LayoutStorage = Pick<Storage, 'getItem' | 'setItem'>;

function objectValue(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

/** Validate the exact tree consumed by the workbench before rendering it. */
export function parseWorkspaceLayout(raw: string, allowedPanels: readonly PanelId[]): ParseResult {
  try {
    const root = objectValue(JSON.parse(raw));
    if (!root || (root.version !== undefined && root.version !== 2) || !('splitRoot' in root)) {
      throw new Error('布局版本或结构无效');
    }
    const allowed = new Set<string>(allowedPanels);
    const nodeIds = new Set<string>();
    const panelIds = new Set<string>();
    let count = 0;
    const panel = (value: unknown): PanelId => {
      if (typeof value !== 'string' || !allowed.has(value) || panelIds.has(value)) {
        throw new Error('布局包含未知或重复面板');
      }
      panelIds.add(value);
      return value as PanelId;
    };
    const visit = (value: unknown, depth: number): EditorSplitNode => {
      if (depth > MAX_TREE_DEPTH || ++count > MAX_TREE_NODES) throw new Error('布局树过深或过大');
      const node = objectValue(value);
      if (!node || typeof node.id !== 'string' || !node.id.trim() || nodeIds.has(node.id)) {
        throw new Error('布局节点 ID 无效或重复');
      }
      nodeIds.add(node.id);
      if (node.kind === 'leaf') {
        if (!Array.isArray(node.tabs) || node.tabs.length === 0 || node.tabs.length > allowed.size) {
          throw new Error('面板标签列表无效');
        }
        const tabs = node.tabs.map(panel);
        if (typeof node.activeTab !== 'string' || !tabs.includes(node.activeTab as PanelId)) {
          throw new Error('活动面板不在标签列表中');
        }
        return { kind: 'leaf', id: node.id, tabs, activeTab: node.activeTab as PanelId };
      }
      if (node.kind !== 'branch' || (node.direction !== 'horizontal' && node.direction !== 'vertical') ||
          typeof node.ratio !== 'number' || !Number.isFinite(node.ratio) || node.ratio <= 0 || node.ratio >= 1) {
        throw new Error('布局分割方向或比例无效');
      }
      return {
        kind: 'branch', id: node.id, direction: node.direction,
        ratio: Math.min(0.82, Math.max(0.18, node.ratio)),
        first: visit(node.first, depth + 1), second: visit(node.second, depth + 1),
      };
    };

    const splitRoot = root.splitRoot === null ? null : visit(root.splitRoot, 0);
    const rawFloating = root.floatingWindows === undefined ? [] : root.floatingWindows;
    if (!Array.isArray(rawFloating) || rawFloating.length > allowed.size) throw new Error('浮窗列表无效');
    const floatingWindows = rawFloating.map((value): FloatingWindowState => {
      const entry = objectValue(value);
      if (!entry) throw new Error('浮窗信息无效');
      const id = panel(entry.id);
      const { x, y, width, height, zIndex } = entry;
      if (typeof x !== 'number' || !Number.isFinite(x) || typeof y !== 'number' || !Number.isFinite(y) ||
          typeof width !== 'number' || !Number.isFinite(width) || width <= 0 ||
          typeof height !== 'number' || !Number.isFinite(height) || height <= 0 ||
          typeof zIndex !== 'number' || !Number.isFinite(zIndex)) {
        throw new Error('浮窗尺寸或坐标无效');
      }
      return { id, x, y, width, height, zIndex };
    });
    return { ok: true, value: { splitRoot, floatingWindows } };
  } catch (error: unknown) {
    return { ok: false, error: error instanceof Error ? error.message : '布局格式无效' };
  }
}

/** Never replace an invalid layout until its exact original is durably backed up. */
export function saveWorkspaceLayout(
  storage: LayoutStorage,
  layout: WorkspaceLayout,
  invalidRaw?: string
): { ok: boolean; backupKey?: string; error?: string } {
  let backupKey: string | undefined;
  try {
    if (invalidRaw !== undefined) {
      if (storage.getItem(WORKSPACE_LAYOUT_KEY) !== invalidRaw) {
        return { ok: false, error: '其他窗口修改了布局；未覆盖新的数据。' };
      }
      const prefix = `${WORKSPACE_LAYOUT_KEY}.invalid.${Date.now()}`;
      backupKey = prefix;
      for (let suffix = 1; storage.getItem(backupKey) !== null; suffix++) backupKey = `${prefix}.${suffix}`;
      storage.setItem(backupKey, invalidRaw);
      if (storage.getItem(backupKey) !== invalidRaw) throw new Error('备份未能读回');
    }
    storage.setItem(WORKSPACE_LAYOUT_KEY, JSON.stringify({ version: 2, ...layout }));
    return { ok: true, backupKey };
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : '存储不可用';
    return { ok: false, backupKey, error: `布局保存失败：${detail}。原布局未主动删除。` };
  }
}
