import test from 'node:test';
import assert from 'node:assert/strict';
import { parseWorkspaceLayout, saveWorkspaceLayout, WORKSPACE_LAYOUT_KEY } from '../src/lib/workspaceLayout.ts';
import type { PanelId } from '../src/types.ts';

const panels: PanelId[] = ['canvas', 'inspector', 'stage', 'ai_agent'];
const leaf = (id: string, panel: PanelId) => ({ kind: 'leaf', id, tabs: [panel], activeTab: panel });
const layout = {
  splitRoot: { kind: 'branch', id: 'root', direction: 'horizontal', ratio: 0.7, first: leaf('a', 'canvas'), second: leaf('b', 'inspector') },
  floatingWindows: [{ id: 'stage', x: -50, y: 20, width: 400, height: 300, zIndex: 102 }],
};
function storage(initial?: string, failBackup = false) {
  const entries = new Map<string, string>();
  if (initial !== undefined) entries.set(WORKSPACE_LAYOUT_KEY, initial);
  return {
    entries,
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (failBackup && key !== WORKSPACE_LAYOUT_KEY) throw new Error('quota');
      entries.set(key, String(value));
    },
  };
}

test('valid legacy workspace tree loads, including negative floating coordinates', () => {
  const parsed = parseWorkspaceLayout(JSON.stringify(layout), panels);
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.value.splitRoot?.kind, 'branch');
    assert.equal(parsed.value.floatingWindows[0].x, -50);
  }
  assert.equal(parseWorkspaceLayout(JSON.stringify({ splitRoot: null, floatingWindows: [] }), panels).ok, true);
});

test('broken trees, duplicate panels or IDs, bad geometry and deep nesting cannot enter the renderer', () => {
  const invalid = [
    '',
    '{',
    JSON.stringify({ splitRoot: { kind: 'leaf', id: 'bad', tabs: null, activeTab: 'canvas' }, floatingWindows: [] }),
    JSON.stringify({ splitRoot: leaf('a', 'canvas'), floatingWindows: [{ id: 'canvas', x: 0, y: 0, width: 100, height: 100, zIndex: 1 }] }),
    JSON.stringify({ splitRoot: { ...layout.splitRoot, second: leaf('a', 'inspector') }, floatingWindows: [] }),
    JSON.stringify({ splitRoot: { ...layout.splitRoot, direction: 'diagonal' }, floatingWindows: [] }),
    JSON.stringify({ splitRoot: { ...layout.splitRoot, ratio: -1 }, floatingWindows: [] }),
    JSON.stringify({ splitRoot: leaf('a', 'canvas'), floatingWindows: [{ id: 'stage', x: 'bad', y: 0, width: 100, height: 100, zIndex: 1 }] }),
    JSON.stringify({ splitRoot: leaf('a', 'unknown' as PanelId), floatingWindows: [] }),
  ];
  let deep: unknown = leaf('last', 'canvas');
  for (let i = 0; i < 40; i++) deep = { kind: 'branch', id: `depth-${i}`, direction: 'horizontal', ratio: 0.5, first: deep, second: leaf(`extra-${i}`, 'stage') };
  invalid.push(JSON.stringify({ splitRoot: deep, floatingWindows: [] }));
  for (const raw of invalid) assert.equal(parseWorkspaceLayout(raw, panels).ok, false, raw.slice(0, 150));
});

test('an invalid layout is backed up before defaults overwrite it; backup failure preserves the original', () => {
  const original = '{"splitRoot":{"kind":"leaf","tabs":null}}';
  const good = storage(original);
  const result = saveWorkspaceLayout(good, layout, original);
  assert.equal(result.ok, true);
  assert.ok(result.backupKey);
  assert.equal(good.getItem(result.backupKey!), original);
  assert.notEqual(good.getItem(WORKSPACE_LAYOUT_KEY), original);
  assert.equal(parseWorkspaceLayout(good.getItem(WORKSPACE_LAYOUT_KEY)!, panels).ok, true);

  const empty = storage('');
  const restoredEmpty = saveWorkspaceLayout(empty, layout, '');
  assert.equal(restoredEmpty.ok, true);
  assert.ok(restoredEmpty.backupKey);
  assert.equal(empty.getItem(restoredEmpty.backupKey!), '');

  const full = storage(original, true);
  const failed = saveWorkspaceLayout(full, layout, original);
  assert.equal(failed.ok, false);
  assert.equal(full.getItem(WORKSPACE_LAYOUT_KEY), original);

  const changed = storage('{"newer":true}');
  assert.equal(saveWorkspaceLayout(changed, layout, original).ok, false, 'do not overwrite another tab’s newer data');
  assert.equal(changed.getItem(WORKSPACE_LAYOUT_KEY), '{"newer":true}');
});
