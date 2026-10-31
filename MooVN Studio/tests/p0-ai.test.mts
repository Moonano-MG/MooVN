import test from 'node:test';
import assert from 'node:assert/strict';
import { SAMPLE_PROJECT } from '../src/data/defaultProject.ts';
import {
  AI_CONFIG_STORAGE_KEY, DEFAULT_AI_CONFIG, loadAiEndpointConfig, saveAiEndpointConfig,
  buildAiProjectContext, aiHttpFailureMessage, redactKnownSecret,
} from '../src/lib/aiEndpointConfig.ts';
import { applyAgentNodeAction, previewAgentAction } from '../src/lib/aiAgentActions.ts';

function storage(initial?: string, fail = false) {
  const entries = new Map<string, string>();
  if (initial !== undefined) entries.set(AI_CONFIG_STORAGE_KEY, initial);
  return {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => { if (fail) throw new Error('quota'); entries.set(key, value); },
  };
}

test('legacy keys and credential-bearing URLs are scrubbed; a failed scrub is reported', () => {
  const secret = 'sk-legacy-FAKE-SECRET';
  const raw = JSON.stringify({ apiKey: secret, baseUrl: `https://api.openai.com/v1?key=${secret}`, modelName: 'test', customSystemPrompt: `Do not leak ${secret}` });
  const store = storage(raw);
  const result = loadAiEndpointConfig(store, '');
  assert.equal(result.config.baseUrl, DEFAULT_AI_CONFIG.baseUrl);
  assert.equal(result.config.apiKey, '');
  assert.equal(result.needsScrubbing, true);
  assert.ok(result.warning);
  assert.equal(saveAiEndpointConfig(store, result.config), null);
  assert.ok(!store.getItem(AI_CONFIG_STORAGE_KEY)!.includes(secret));
  assert.ok(!store.getItem(AI_CONFIG_STORAGE_KEY)!.includes('?key='));
  const readonly = storage(raw, true);
  const failed = loadAiEndpointConfig(readonly, '');
  assert.match(saveAiEndpointConfig(readonly, failed.config) || '', /无法|失败/);
  assert.equal(readonly.getItem(AI_CONFIG_STORAGE_KEY), raw);
  const malformed = storage('{"apiKey":"sk-partial-secret');
  const damaged = loadAiEndpointConfig(malformed, '');
  assert.equal(damaged.needsScrubbing, true);
  assert.equal(saveAiEndpointConfig(malformed, damaged.config), null);
  assert.ok(!malformed.getItem(AI_CONFIG_STORAGE_KEY)!.includes('sk-partial-secret'));
});

test('invalid URL cannot overwrite a safe saved address or persist an API key', () => {
  const store = storage();
  const safe = { ...DEFAULT_AI_CONFIG, apiKey: 'sk-FAKE-SESSION' };
  assert.equal(saveAiEndpointConfig(store, safe), null);
  const before = store.getItem(AI_CONFIG_STORAGE_KEY);
  assert.ok(before && !before.includes(safe.apiKey));
  for (const url of [
    'https://name:sk-FAKE-SESSION@api.openai.com/v1',
    'https://api.openai.com/v1?key=sk-FAKE-SESSION',
    'https://api.openai.com/v1#sk-FAKE-SESSION',
  ]) {
    assert.ok(saveAiEndpointConfig(store, { ...safe, baseUrl: url }));
    assert.equal(store.getItem(AI_CONFIG_STORAGE_KEY), before);
  }
  const encodedSecret = { ...safe, apiKey: 'private/key+value', baseUrl: 'https://api.openai.com/v1/private%2Fkey%2Bvalue' };
  for (const path of ['private%2Fkey%2Bvalue', 'private%252Fkey%252Bvalue', 'private%2Fkey%2Bvalue/%ZZ']) {
    assert.ok(saveAiEndpointConfig(store, { ...encodedSecret, baseUrl: `https://api.openai.com/v1/${path}` }), 'URL-encoded session key must not be saved');
    assert.equal(store.getItem(AI_CONFIG_STORAGE_KEY), before);
  }
  const oldEncoded = storage(JSON.stringify({ apiKey: encodedSecret.apiKey, baseUrl: encodedSecret.baseUrl }));
  const loadedEncoded = loadAiEndpointConfig(oldEncoded, '');
  assert.equal(loadedEncoded.config.baseUrl, DEFAULT_AI_CONFIG.baseUrl);
  assert.equal(loadedEncoded.needsScrubbing, true);
  assert.equal(redactKnownSecret('raw private/key+value and private%2fkey%2bvalue', [encodedSecret.apiKey]), 'raw [已隐藏] and [已隐藏]');
  assert.equal(redactKnownSecret('bad surrogate: \ud800', ['\ud800']), 'bad surrogate: [已隐藏]');
  const withKeyInOtherField = { ...safe, customSystemPrompt: `secret=${safe.apiKey}` };
  assert.ok(saveAiEndpointConfig(store, withKeyInOtherField));
  assert.ok(!store.getItem(AI_CONFIG_STORAGE_KEY)!.includes(safe.apiKey));
  assert.equal(aiHttpFailureMessage(401), 'HTTP 401：服务商拒绝请求，请检查服务地址、模型和密钥。');
});

test('pure chat never implicitly includes project metadata; Agent context is explicit opt-in', () => {
  const project = structuredClone(SAMPLE_PROJECT);
  const node = project.nodes[0];
  assert.equal(buildAiProjectContext(project, node, 'chat', true), '');
  assert.equal(buildAiProjectContext(project, node, 'agent', false), '');
  const disclosed = buildAiProjectContext(project, node, 'agent', true);
  assert.ok(disclosed.includes(project.title));
  assert.ok(disclosed.includes(node.id));
  assert.ok(disclosed.includes(node.dialogues[0].id));
  assert.ok(disclosed.includes(node.characters[0].id));
});

test('dialogue edits require one exact ID, preserve other lines and show the actual diff', () => {
  const project = structuredClone(SAMPLE_PROJECT);
  const node = project.nodes[0];
  node.dialogues.push({ ...node.dialogues[0], id: 'line-two', text: 'second original' });
  const missing = { type: 'update_dialogue' as const, summary: 'missing ID', text: 'new' };
  assert.equal(previewAgentAction(missing, node, project).ok, false);
  assert.equal(applyAgentNodeAction(missing, node, project), null);
  const action = { ...missing, dialogueId: 'line-two' };
  const preview = previewAgentAction(action, node, project);
  assert.equal(preview.ok, true);
  if (preview.ok) {
    assert.equal(JSON.parse(preview.before).text, 'second original');
    assert.equal(JSON.parse(preview.after).text, 'new');
    assert.ok(preview.target.includes('line-two'));
  }
  const updated = applyAgentNodeAction(action, node, project);
  assert.equal(updated?.dialogues[0].text, node.dialogues[0].text);
  assert.equal(updated?.dialogues[1].text, 'new');
  assert.equal(node.dialogues[1].text, 'second original');
  const ambiguous = { ...node, dialogues: [...node.dialogues, { ...node.dialogues[1] }] };
  assert.equal(previewAgentAction(action, ambiguous, project).ok, false);
});

test('expression changes require one character/placement and cannot affect other roles', () => {
  const project = structuredClone(SAMPLE_PROJECT);
  const node = project.nodes[0];
  const characterId = node.characters[0].characterId;
  node.characters.push({ ...node.characters[0], id: 'place-two', characterId: 'other-role', spriteId: 'other-sprite' });
  const missing = { type: 'set_expression' as const, summary: 'change', spriteId: 'char-yukina-2' };
  assert.equal(previewAgentAction(missing, node, project).ok, false);
  const action = { ...missing, characterId };
  const updated = applyAgentNodeAction(action, node, project);
  assert.equal(updated?.characters[0].spriteId, 'char-yukina-2');
  assert.equal(updated?.characters[1].spriteId, 'other-sprite');
  const duplicated = { ...node, characters: [...node.characters, { ...node.characters[0], id: 'third-placement' }] };
  assert.equal(previewAgentAction(action, duplicated, project).ok, false);
  const exact = { ...action, placementId: 'third-placement' };
  const exactResult = applyAgentNodeAction(exact, duplicated, project);
  assert.equal(exactResult?.characters[0].spriteId, node.characters[0].spriteId);
  assert.equal(exactResult?.characters[2].spriteId, 'char-yukina-2');
  assert.equal(previewAgentAction({ ...action, spriteId: 'not-in-character' }, node, project).ok, false);
});
