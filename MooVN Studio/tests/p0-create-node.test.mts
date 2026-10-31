import test from 'node:test';
import assert from 'node:assert/strict';
import { SAMPLE_PROJECT } from '../src/data/defaultProject.ts';
import { previewAgentAction } from '../src/lib/aiAgentActions.ts';

test('Agent previews an independent, minimal node and rejects hidden complex defaults', () => {
  const project = structuredClone(SAMPLE_PROJECT);
  const node = project.nodes[0];
  const before = node.nextNodeId;
  const action = { type: 'create_node' as const, summary: 'create', nodeType: 'dialogue' as const, text: 'new line' };
  const preview = previewAgentAction(action, node, project);
  assert.equal(preview.ok, true);
  if (preview.ok) {
    const proposed = JSON.parse(preview.after);
    assert.equal(proposed.nextNodeId, null);
    assert.deepEqual(proposed.characters, []);
    assert.equal(proposed.bgmId, '');
    assert.equal(proposed.dialogues[0].text, 'new line');
  }
  assert.equal(node.nextNodeId, before);
  assert.equal(previewAgentAction({ ...action, nodeType: 'repeat_loop' }, node, project).ok, false);
  assert.equal(previewAgentAction({ ...action, characterId: 'missing-role' }, node, project).ok, false);
});
