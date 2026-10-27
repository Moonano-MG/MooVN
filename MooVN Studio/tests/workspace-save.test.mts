import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PROJECT } from '../src/data/defaultProject.ts';
import { saveProjectToWorkspace, writeFileToMountedMooVNFolder } from '../src/lib/workspaceManager.ts';
import { newId } from '../src/lib/ids.ts';
import { loadProjectFromTauri } from '../src/lib/tauriBridge.ts';
import { serializeMpvnProject } from '../src/lib/mpvnFormat.ts';

function storage() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
    removeItem: (key: string) => { data.delete(key); },
  };
}
const paths = {
  workspaceRootPath: '/app-data/MooVN_Workspace',
  projectsDirectoryPath: '/app-data/MooVN_Workspace/Projects',
  exportOutputDirectoryPath: '/app-data/MooVN_Workspace/Exports',
  cacheDirectoryPath: '/app-data/MooVN_Workspace/Cache',
  settingsFilePath: '/app-data/MooVN_Workspace/Cache/settings.moovn.json',
};

function mockTauri(invoke: (command: string, args: Record<string, unknown>) => Promise<unknown>) {
  Object.defineProperty(globalThis, 'window', { value: { __TAURI_INTERNALS__: { invoke } }, configurable: true, writable: true });
  Object.defineProperty(globalThis, 'localStorage', { value: storage(), configurable: true, writable: true });
}

test('desktop save propagates native errors and never attempts a second write', async () => {
  const commands: string[] = [];
  mockTauri(async (cmd) => {
    commands.push(cmd);
    if (cmd === 'get_workspace_paths') return paths;
    if (cmd === 'save_project_json') throw 'ERR_TEMP_CREATE: Permission denied';
    throw new Error(`Unexpected command ${cmd}`);
  });
  const result = await saveProjectToWorkspace(structuredClone(DEFAULT_PROJECT));
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, 'ERR_TEMP_CREATE');
    assert.match(result.error, /Permission denied/);
  }
  assert.deepEqual(commands, ['get_workspace_paths', 'save_project_json']);
  assert.equal(localStorage.getItem('moovn_studio_projects_v3'), null);
});

test('save twice and rename title uses one file and metadata only', async () => {
  const writes: { fileName: string; payload: string }[] = [];
  mockTauri(async (cmd, args) => {
    if (cmd === 'get_workspace_paths') return paths;
    if (cmd === 'save_project_json') {
      const fileName = String(args.fileName);
      const payload = String(args.payload);
      writes.push({ fileName, payload });
      return { ok: true, path: `${paths.projectsDirectoryPath}/${fileName}`, backup_path: '', bytes_written: payload.length, saved_at_epoch_ms: 42 };
    }
    throw new Error(`Unexpected command ${cmd}`);
  });
  const project = { ...structuredClone(DEFAULT_PROJECT), projectPath: '/old/story.mpvn' };
  const first = await saveProjectToWorkspace(project);
  assert.equal(first.ok, true);
  if (!first.ok) return;
  const second = await saveProjectToWorkspace({ ...first.project, title: '新标题' });
  assert.equal(second.ok, true);
  assert.deepEqual(writes.map((item) => item.fileName), ['story.mpvn', 'story.mpvn']);
  const last = JSON.parse(writes[1].payload);
  assert.equal(last.magic, 'MPVN_STUDIO_PROJECT');
  assert.equal(last.project.title, '新标题');
  assert.equal(last.project.projectPath, `${paths.projectsDirectoryPath}/story.mpvn`);
  const recent = JSON.parse(localStorage.getItem('moovn_studio_projects_v3')!);
  assert.equal(recent.length, 1);
  assert.equal('projectData' in recent[0], false);
});

test('oversized project is rejected before invoking a disk write', async () => {
  const commands: string[] = [];
  mockTauri(async (cmd) => {
    commands.push(cmd);
    if (cmd === 'get_workspace_paths') return paths;
    throw new Error('save must not be invoked');
  });
  const project = structuredClone(DEFAULT_PROJECT);
  project.nodes[0].dialogues[0].text = 'x'.repeat(17 * 1024 * 1024);
  const result = await saveProjectToWorkspace(project);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, 'ERR_PAYLOAD_TOO_LARGE');
  assert.deepEqual(commands, ['get_workspace_paths']);
});

test('browser without mounted directory does not report a file write as successful', async () => {
  Reflect.deleteProperty(globalThis, 'window');
  assert.equal(await writeFileToMountedMooVNFolder('story.mpvn', '{}', 'Projects'), false);
  const result = await saveProjectToWorkspace(structuredClone(DEFAULT_PROJECT));
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /ERR_INDEXEDDB_UNAVAILABLE/);
});

test('100,000 generated editor IDs are distinct', () => {
  const ids = new Set<string>();
  for (let i = 0; i < 100_000; i++) ids.add(newId('node'));
  assert.equal(ids.size, 100_000);
});


test('schema-invalid primary falls back to backup and retains that backup on the first save', async () => {
  const calls: { command: string; args: Record<string, unknown> }[] = [];
  const valid = serializeMpvnProject(structuredClone(DEFAULT_PROJECT));
  mockTauri(async (command, args) => {
    calls.push({ command, args });
    if (command === 'get_workspace_paths') return paths;
    if (command === 'load_project_json') return {
      payload: args.preferBackup ? valid : '{"project":{"id":"broken"}}',
      path: `${paths.projectsDirectoryPath}/story.mpvn`,
      recovered_from_backup: Boolean(args.preferBackup),
    };
    if (command === 'save_project_json') return {
      ok: true, path: `${paths.projectsDirectoryPath}/story.mpvn`, backup_path: '',
      bytes_written: String(args.payload).length, saved_at_epoch_ms: 42,
    };
    throw new Error(`Unexpected command ${command}`);
  });
  const loaded = await loadProjectFromTauri('story.mpvn');
  assert.equal(loaded.ok, true);
  assert.equal(loaded.recoveredFromBackup, true);
  assert.deepEqual(calls.filter((item) => item.command === 'load_project_json').map((item) => item.args.preferBackup), [false, true]);
  assert.ok(loaded.data);
  const saved = await saveProjectToWorkspace(loaded.data);
  assert.equal(saved.ok, true);
  const firstSave = calls.find((item) => item.command === 'save_project_json');
  assert.equal(firstSave?.args.retainBackup, true);
  if (saved.ok) await saveProjectToWorkspace(saved.project);
  const saves = calls.filter((item) => item.command === 'save_project_json');
  assert.equal(saves[1]?.args.retainBackup, false);
});

test('overlapping saves are serialized and the newer revision is written last', async () => {
  const writes: string[] = [];
  let releaseFirst!: () => void;
  let firstEntered!: () => void;
  const entered = new Promise<void>((resolve) => { firstEntered = resolve; });
  const block = new Promise<void>((resolve) => { releaseFirst = resolve; });
  mockTauri(async (command, args) => {
    if (command === 'get_workspace_paths') return paths;
    if (command === 'save_project_json') {
      const title = JSON.parse(String(args.payload)).project.title;
      if (title === 'older') { firstEntered(); await block; }
      writes.push(title);
      return { ok: true, path: `${paths.projectsDirectoryPath}/${args.fileName}`, bytes_written: 1 };
    }
    throw new Error(`Unexpected command ${command}`);
  });
  const older = { ...structuredClone(DEFAULT_PROJECT), title: 'older' };
  const newer = { ...structuredClone(DEFAULT_PROJECT), title: 'newer' };
  const first = saveProjectToWorkspace(older);
  await entered;
  const second = saveProjectToWorkspace(newer);
  assert.deepEqual(writes, []);
  releaseFirst();
  assert.equal((await first).ok, true);
  assert.equal((await second).ok, true);
  assert.deepEqual(writes, ['older', 'newer']);
});
