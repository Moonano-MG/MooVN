import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { DEFAULT_PROJECT } from '../src/data/defaultProject.ts';
import { parseMpvnProject, serializeMpvnProject } from '../src/lib/mpvnFormat.ts';
import { getProjectSnapshot } from '../src/lib/projectStorage.ts';
import { makeImportedProjectCopy, saveProjectToWorkspace } from '../src/lib/workspaceManager.ts';

function memoryStorage() {
  const entries = new Map<string, string>();
  return {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => { entries.set(key, String(value)); },
    removeItem: (key: string) => { entries.delete(key); },
    clear: () => { entries.clear(); },
  };
}

test('imported copies use new identities and cannot replace the original browser snapshot', async () => {
  const store = memoryStorage();
  Object.defineProperty(globalThis, 'localStorage', { value: store, configurable: true });
  Object.defineProperty(globalThis, 'window', { value: { localStorage: store }, configurable: true });

  const original = structuredClone(DEFAULT_PROJECT);
  original.id = `original-${crypto.randomUUID()}`;
  original.title = 'ORIGINAL';
  const savedOriginal = await saveProjectToWorkspace(original);
  assert.equal(savedOriginal.ok, true);

  const parsed = parseMpvnProject(serializeMpvnProject(original));
  assert.equal(parsed.ok, true);
  if (!parsed.project) throw new Error('fixture could not be parsed');
  const imported = makeImportedProjectCopy(parsed.project);
  const importedAgain = makeImportedProjectCopy(parsed.project);
  assert.notEqual(imported.id, original.id);
  assert.notEqual(imported.id, importedAgain.id);
  assert.equal(imported.projectPath, undefined);
  assert.equal(imported.nodes[0].id, original.nodes[0].id, 'internal references must stay intact');
  imported.title = 'IMPORTED-COPY';
  const copySave = await saveProjectToWorkspace(imported);
  assert.equal(copySave.ok, true);

  const originalSnapshot = await getProjectSnapshot(`saved:${original.id}`);
  const copySnapshot = await getProjectSnapshot(`saved:${imported.id}`);
  assert.equal(originalSnapshot?.project.title, 'ORIGINAL');
  assert.equal(copySnapshot?.project.title, 'IMPORTED-COPY');
  const recent = JSON.parse(store.getItem('moovn_studio_projects_v3') || '[]') as { id: string }[];
  assert.ok(recent.some((item) => item.id === original.id));
  assert.ok(recent.some((item) => item.id === imported.id));
});
