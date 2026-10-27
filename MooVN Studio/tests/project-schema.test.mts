import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PROJECT, SAMPLE_PROJECT } from '../src/data/defaultProject.ts';
import { parseMpvnProject, serializeMpvnProject } from '../src/lib/mpvnFormat.ts';
import { validateVNProjectShape } from '../src/lib/projectSchema.ts';

test('blank and example projects satisfy the same runtime schema', () => {
  for (const project of [DEFAULT_PROJECT, SAMPLE_PROJECT]) {
    assert.equal(validateVNProjectShape(project).ok, true);
    const result = parseMpvnProject(serializeMpvnProject(project));
    assert.equal(result.ok, true, !result.ok ? result.error : undefined);
  }
});

test('invalid enums and duplicated ids are rejected with a location', () => {
  const ending = { ...structuredClone(SAMPLE_PROJECT), nodes: SAMPLE_PROJECT.nodes.map((node, i) => i === 1 ? { ...node, type: 'ending' } : node) };
  const wrongType = validateVNProjectShape(ending);
  assert.equal(wrongType.ok, false);
  if (!wrongType.ok) assert.match(wrongType.error, /nodes\.1\.type/);
  const duplicate = structuredClone(SAMPLE_PROJECT);
  duplicate.nodes[1].id = duplicate.nodes[0].id;
  const duplicateResult = validateVNProjectShape(duplicate);
  assert.equal(duplicateResult.ok, false);
  if (!duplicateResult.ok) assert.match(duplicateResult.error, /ERR_DUPLICATE_ID.*nodes\[1\]/);
  const badFilter = { ...structuredClone(SAMPLE_PROJECT), nodes: SAMPLE_PROJECT.nodes.map((node, i) => i === 0 ? { ...node, colorFilter: 'sunset' } : node) };
  assert.equal(validateVNProjectShape(badFilter).ok, false);
});

test('dangling speakers, placements, choices, chapter and sprite references fail', () => {
  const cases: Array<(project: typeof SAMPLE_PROJECT) => void> = [
    (p) => { p.nodes[0].dialogues[0].speakerId = 'missing-character'; },
    (p) => { p.nodes[0].characters[0].characterId = 'missing-character'; },
    (p) => { p.nodes[0].choices[0].targetNodeId = 'missing-node'; },
    (p) => { p.nodes[0].chapterId = 'missing-chapter'; },
    (p) => { p.nodes[0].characters[0].spriteId = 'missing-sprite'; },
  ];
  for (const mutate of cases) {
    const project = structuredClone(SAMPLE_PROJECT);
    mutate(project);
    const result = validateVNProjectShape(project);
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /ERR_DANGLING_REFERENCE/);
  }
});

test('validation never repairs or modifies malformed input', () => {
  const { dialogues: _discarded, ...nodeWithoutDialogues } = structuredClone(DEFAULT_PROJECT.nodes[0]);
  const project = { ...structuredClone(DEFAULT_PROJECT), startNodeId: 'missing', nodes: [nodeWithoutDialogues] };
  const before = structuredClone(project);
  assert.equal(validateVNProjectShape(project).ok, false);
  assert.deepEqual(project, before);
  assert.equal('dialogues' in project.nodes[0], false);
});

test('deep prototype pollution, cyclic values, and unsupported versions are rejected', () => {
  const project: Record<string, unknown> = { ...structuredClone(DEFAULT_PROJECT) };
  let cursor: Record<string, unknown> = project;
  for (let i = 0; i < 20; i++) {
    const next: Record<string, unknown> = {};
    cursor.extra = next;
    cursor = next;
  }
  Object.defineProperty(cursor, '__proto__', { value: {}, enumerable: true });
  const polluted = validateVNProjectShape(project);
  assert.equal(polluted.ok, false);
  if (!polluted.ok) assert.match(polluted.error, /ERR_PROTOTYPE_POLLUTION/);
  const cycle: Record<string, unknown> = { ...structuredClone(DEFAULT_PROJECT) };
  cycle.self = cycle;
  const cyclic = validateVNProjectShape(cycle);
  assert.equal(cyclic.ok, false);
  if (!cyclic.ok) assert.match(cyclic.error, /ERR_SCHEMA_CYCLE/);
  const future = JSON.parse(serializeMpvnProject(DEFAULT_PROJECT));
  future.schemaVersion = '99.0.0';
  const parsed = parseMpvnProject(JSON.stringify(future));
  assert.equal(parsed.ok, false);
  if (!parsed.ok) assert.match(parsed.error!, /ERR_SCHEMA_VERSION/);
});

test('strict nested fields, types, ids and asset references are validated', () => {
  const badCamera = { ...structuredClone(SAMPLE_PROJECT), nodes: SAMPLE_PROJECT.nodes.map((node, i) => i === 0
    ? { ...node, cameraConfig: { zoom: 1, offsetX: 0, offsetY: 0, durationMs: 100, shakeIntensity: 'wild' } }
    : node) };
  assert.equal(validateVNProjectShape(badCamera).ok, false);
  const unknownField = { ...structuredClone(SAMPLE_PROJECT), arbitraryExtension: { hidden: true } };
  assert.equal(validateVNProjectShape(unknownField).ok, false);
  const badVariable = { ...structuredClone(SAMPLE_PROJECT), variables: [{ key: 'v', label: 'V', type: 'number', value: 'not a number' }] };
  assert.equal(validateVNProjectShape(badVariable).ok, false);
  const invalidBackground = structuredClone(SAMPLE_PROJECT);
  invalidBackground.nodes[0].backgroundId = 'missing-background';
  assert.equal(validateVNProjectShape(invalidBackground).ok, false);
  const duplicateLines = structuredClone(SAMPLE_PROJECT);
  duplicateLines.nodes[1].dialogues[0].id = duplicateLines.nodes[0].dialogues[0].id;
  assert.equal(validateVNProjectShape(duplicateLines).ok, false);
  const unsafeMedia = structuredClone(SAMPLE_PROJECT);
  unsafeMedia.characters[0].mediaUrl = 'javascript:alert(1)';
  assert.equal(validateVNProjectShape(unsafeMedia).ok, false);
  const blobMedia = structuredClone(SAMPLE_PROJECT);
  blobMedia.characters[0].mediaUrl = 'blob:https://example.invalid/temporary';
  assert.equal(validateVNProjectShape(blobMedia).ok, false);
});

test('legitimate custom sprite references are accepted when a media source is present', () => {
  const project = structuredClone(SAMPLE_PROJECT);
  const reference = `moovn-asset://${'a'.repeat(64)}.png`;
  project.characters[0].spriteId = 'user-sprite';
  project.characters[0].mediaUrl = reference;
  project.nodes[0].characters[0].spriteId = 'user-sprite';
  project.nodes[0].dialogues[0].expressionSpriteId = 'user-sprite';
  assert.equal(validateVNProjectShape(project).ok, true);
});
