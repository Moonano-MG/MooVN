import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_PROJECT } from '../src/data/defaultProject.ts';
import { parseMpvnProject } from '../src/lib/mpvnFormat.ts';
import { makeImportedProjectCopy, saveProjectToWorkspace } from '../src/lib/workspaceManager.ts';

// Real temporary files through a mocked IPC boundary; this is not a Windows/Tauri acceptance test.
test('desktop save path for an imported copy differs from the original', async () => {
  const root = await mkdtemp(join(tmpdir(), 'moovn-import-'));
  const projects = join(root, 'Projects');
  await mkdir(projects);
  const records = new Map<string, string>();
  const storage = { getItem: (key: string) => records.get(key) ?? null, setItem: (key: string, value: string) => records.set(key, value) };
  const previousWindow = globalThis.window;
  const previousStorage = globalThis.localStorage;
  const writes: string[] = [];
  const paths = {
    workspaceRootPath: root, projectsDirectoryPath: projects,
    exportOutputDirectoryPath: join(root, 'Exports'), cacheDirectoryPath: join(root, 'Cache'),
    settingsFilePath: join(root, 'Cache', 'settings.json'),
  };
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { __TAURI_INTERNALS__: {
    invoke: async (cmd: string, args: { fileName?: string; payload?: string }) => {
      if (cmd === 'get_workspace_paths') return paths;
      if (cmd !== 'save_project_json' || !args.fileName || !args.payload) throw new Error(`Unexpected command ${cmd}`);
      const filename = join(projects, args.fileName);
      writes.push(filename);
      await writeFile(filename, args.payload, 'utf8');
      return { ok: true, path: filename, backup_path: '', bytes_written: Buffer.byteLength(args.payload), saved_at_epoch_ms: 1 };
    },
  } } });
  try {
    const original = structuredClone(DEFAULT_PROJECT);
    original.id = `original-${crypto.randomUUID()}`;
    original.title = 'Original disk file';
    original.projectPath = join(projects, 'original.mpvn');
    const saved = await saveProjectToWorkspace(original);
    assert.equal(saved.ok, true);
    const before = await readFile(original.projectPath, 'utf8');
    const copy = makeImportedProjectCopy(original);
    copy.title = 'Imported copy';
    const copyResult = await saveProjectToWorkspace(copy);
    assert.equal(copyResult.ok, true);
    if (!copyResult.ok) return;
    assert.notEqual(copyResult.path, original.projectPath);
    assert.equal(await readFile(original.projectPath, 'utf8'), before);
    const originalData = parseMpvnProject(before);
    const copyData = parseMpvnProject(await readFile(copyResult.path, 'utf8'));
    assert.equal(originalData.project?.title, 'Original disk file');
    assert.equal(copyData.project?.title, 'Imported copy');
    assert.notEqual(originalData.project?.id, copyData.project?.id);
    assert.equal(writes.length, 2);
  } finally {
    if (previousWindow === undefined) Reflect.deleteProperty(globalThis, 'window');
    else Object.defineProperty(globalThis, 'window', { value: previousWindow, configurable: true });
    if (previousStorage === undefined) Reflect.deleteProperty(globalThis, 'localStorage');
    else Object.defineProperty(globalThis, 'localStorage', { value: previousStorage, configurable: true });
    await rm(root, { recursive: true, force: true });
  }
});
