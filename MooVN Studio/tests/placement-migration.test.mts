import test from 'node:test';
import assert from 'node:assert/strict';
import { SAMPLE_PROJECT } from '../src/data/defaultProject.ts';
import { parseMpvnProject, serializeMpvnProject } from '../src/lib/mpvnFormat.ts';

function legacyProject() {
  const project = structuredClone(SAMPLE_PROJECT);
  // Version 1.0 workspace snapshots had no schemaVersion inside the project.
  Reflect.deleteProperty(project, 'schemaVersion');
  const original = project.nodes[0].characters[0];
  project.nodes[0].characters = [0, 5, 30, 61, 70, 71, 88, 92, 100].map((y) => ({
    ...original, id: `legacy-${y}`, y,
  }));
  return project;
}
const ys = (project: typeof SAMPLE_PROJECT) => project.nodes[0].characters.map((item) => item.y);

test('1.0 envelope migrates each legacy center anchor exactly once and preserves the source', () => {
  const project = legacyProject();
  const before = structuredClone(project);
  const result = parseMpvnProject(JSON.stringify({
    magic: 'MPVN_STUDIO_PROJECT', format: 'mpvn', schemaVersion: '1.0.0', project,
  }));
  assert.equal(result.ok, true, result.error);
  assert.ok(result.project);
  assert.deepEqual(project, before);
  assert.deepEqual(ys(result.project), [39, 44, 69, 100, 100, 71, 88, 92, 100]);
  assert.equal(result.project.schemaVersion, '1.1.0');
  const exported = JSON.parse(serializeMpvnProject(result.project));
  assert.equal(exported.schemaVersion, '1.1.0');
  assert.equal(exported.project.schemaVersion, '1.1.0');
  const reopened = parseMpvnProject(JSON.stringify(exported));
  assert.equal(reopened.ok, true, reopened.error);
  assert.ok(reopened.project);
  assert.deepEqual(ys(reopened.project), ys(result.project));
});

test('unversioned snapshots and bare files migrate, but a new 1.1 snapshot never migrates again', () => {
  const legacy = legacyProject();
  const bare = parseMpvnProject(JSON.stringify(legacy));
  assert.equal(bare.ok, true, bare.error);
  assert.ok(bare.project);
  assert.deepEqual(ys(bare.project), [39, 44, 69, 100, 100, 71, 88, 92, 100]);
  const current = parseMpvnProject(JSON.stringify(bare.project));
  assert.equal(current.ok, true, current.error);
  assert.ok(current.project);
  assert.deepEqual(ys(current.project), ys(bare.project));
});

test('exporting an unversioned legacy object migrates before stamping the new envelope', () => {
  const project = legacyProject();
  const exported = JSON.parse(serializeMpvnProject(project));
  assert.equal(exported.schemaVersion, '1.1.0');
  assert.deepEqual(ys(exported.project), [39, 44, 69, 100, 100, 71, 88, 92, 100]);
  assert.deepEqual(ys(project), [0, 5, 30, 61, 70, 71, 88, 92, 100]);
});

test('1.1 envelope alone marks coordinates as current and unsupported or conflicting versions fail', () => {
  const project = legacyProject();
  const current = parseMpvnProject(JSON.stringify({ schemaVersion: '1.1', project }));
  assert.equal(current.ok, true, current.error);
  assert.ok(current.project);
  assert.equal(current.project.schemaVersion, '1.1.0');
  assert.deepEqual(ys(current.project), ys(project));
  const mismatch = parseMpvnProject(JSON.stringify({ schemaVersion: '1.0.0', project: current.project }));
  assert.equal(mismatch.ok, false);
  assert.match(mismatch.error || '', /ERR_SCHEMA_VERSION/);
  const future = parseMpvnProject(JSON.stringify({ schemaVersion: '1.2.0', project }));
  assert.equal(future.ok, false);
  assert.match(future.error || '', /ERR_SCHEMA_VERSION/);
});
