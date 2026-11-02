import test from 'node:test';
import assert from 'node:assert/strict';
import type { MooVNSystemSettings } from '../src/types.ts';
import { MAX_SETTINGS_BYTES, parseSettingsImportJson, parseStoredSettingsJson, validateSystemSettings } from '../src/lib/systemSettingsSchema.ts';
import { inspectSystemSettings, readSystemSettingsRaw, resetSystemSettings, saveSystemSettingsDetailed, SYSTEM_SETTINGS_STORAGE_KEY as key } from '../src/lib/workspaceManager.ts';

const valid: MooVNSystemSettings = {
  platform: 'windows', workspaceRootPath: 'C:/MooVN', projectsDirectoryPath: 'C:/MooVN/Projects',
  exportOutputDirectoryPath: 'C:/MooVN/Exports', cacheDirectoryPath: 'C:/MooVN/Cache', settingsFilePath: 'C:/MooVN/Cache/settings.moovn.json',
  editorConfig: { autoSaveIntervalSec: 25, coloredNodeCategories: false, defaultScriptLang: 'typescript' },
  defaultGameSettings: { textSpeedMs: 44, autoPlayDelayMs: 2100, bgmVolume: 32, sfxVolume: 61, motionLevel: 'off' },
  performanceConfig: { compressionFormat: 'moovn_lz77', compressionLevel: 5 },
};
function memoryStorage(options: { failGet?: boolean; failBackup?: boolean; failMainWrite?: boolean } = {}) {
  const records = new Map<string, string>();
  const storage = {
    getItem(name: string) { if (options.failGet && name === key) throw new Error('read failure'); return records.get(name) ?? null; },
    setItem(name: string, value: string) {
      if ((options.failBackup && name.startsWith(`${key}.backup.`)) || (options.failMainWrite && name === key)) throw new Error('write failure');
      records.set(name, value);
    },
    removeItem(name: string) { records.delete(name); },
  };
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true, writable: true });
  return records;
}

test('complete settings and valid boundary values round-trip', () => {
  const lower = structuredClone(valid);
  lower.editorConfig.autoSaveIntervalSec = 5;
  lower.defaultGameSettings = { textSpeedMs: 10, autoPlayDelayMs: 600, bgmVolume: 0, sfxVolume: 0 };
  lower.performanceConfig = { compressionFormat: 'xz', compressionLevel: 0, workerCpuBudgetPercent: 0 };
  const upper = structuredClone(valid);
  upper.editorConfig.autoSaveIntervalSec = 120;
  upper.defaultGameSettings = { textSpeedMs: 80, autoPlayDelayMs: 4000, bgmVolume: 100, sfxVolume: 100, motionLevel: 'full' };
  upper.performanceConfig = { compressionFormat: 'moovn_lz77', compressionLevel: 9, workerCpuBudgetPercent: 100, preloadSceneDistance: 10000 };
  for (const input of [valid, lower, upper]) {
    const result = parseSettingsImportJson(JSON.stringify(input));
    assert.equal(result.ok, true);
    if (result.ok) assert.deepEqual(result.value, input);
  }
  const raw = JSON.stringify(valid);
  assert.equal(parseSettingsImportJson(raw + ' '.repeat(MAX_SETTINGS_BYTES - raw.length)).ok, true);
});

test('malformed, missing, unknown, polluted, extreme and oversized imports fail closed', () => {
  const cases = [
    '{', '{"workspaceRootPath":"x"}', 'null',
    JSON.stringify({ ...valid, editorConfig: null }),
    JSON.stringify({ ...valid, editorConfig: { autoSaveIntervalSec: 15, coloredNodeCategories: true } }),
    JSON.stringify({ ...valid, unexpected: true }),
    JSON.stringify({ ...valid, editorConfig: { ...valid.editorConfig, extra: true } }),
    JSON.stringify(valid).replace('{"platform"', '{"__proto__":{"polluted":true},"platform"'),
    JSON.stringify({ ...valid, editorConfig: { ...valid.editorConfig, defaultScriptLang: 'lua' } }),
    JSON.stringify({ ...valid, editorConfig: { ...valid.editorConfig, autoSaveIntervalSec: -1 } }),
    JSON.stringify({ ...valid, editorConfig: { ...valid.editorConfig, autoSaveIntervalSec: 121 } }),
    JSON.stringify({ ...valid, editorConfig: { ...valid.editorConfig, autoSaveIntervalSec: 15.5 } }),
    JSON.stringify({ ...valid, defaultGameSettings: { ...valid.defaultGameSettings, textSpeedMs: 9 } }),
    JSON.stringify({ ...valid, defaultGameSettings: { ...valid.defaultGameSettings, autoPlayDelayMs: 4001 } }),
    JSON.stringify({ ...valid, defaultGameSettings: { ...valid.defaultGameSettings, bgmVolume: 101 } }),
    JSON.stringify({ ...valid, defaultGameSettings: { ...valid.defaultGameSettings, sfxVolume: -1 } }),
    JSON.stringify(valid).replace('"bgmVolume":32', '"bgmVolume":1e309'),
    JSON.stringify({ ...valid, performanceConfig: { ...valid.performanceConfig, compressionLevel: 10 } }),
    JSON.stringify({ ...valid, workspaceRootPath: 'C:\0bad' }),
    JSON.stringify({ ...valid, workspaceRootPath: '汉'.repeat(100_000) }),
    JSON.stringify(valid) + ' '.repeat(MAX_SETTINGS_BYTES),
  ];
  for (const raw of cases) assert.equal(parseSettingsImportJson(raw).ok, false, raw.slice(0, 100));
  assert.equal(({} as { polluted?: boolean }).polluted, undefined);
  assert.equal(validateSystemSettings({ ...valid, editorConfig: { ...valid.editorConfig, autoSaveIntervalSec: Infinity } }).ok, false);
});

test('known older local records receive defaults, but incomplete or unknown records do not', () => {
  const records = memoryStorage();
  const legacy = { editorConfig: { autoSaveIntervalSec: 30, coloredNodeCategories: false }, defaultGameSettings: { textSpeedMs: 40, autoPlayDelayMs: 2000, bgmVolume: 70, sfxVolume: 60 } };
  records.set(key, JSON.stringify(legacy));
  const loaded = inspectSystemSettings();
  assert.equal(loaded.warning, null);
  assert.equal(loaded.settings.editorConfig.autoSaveIntervalSec, 30);
  assert.equal(loaded.settings.editorConfig.defaultScriptLang, 'typescript');
  assert.equal(loaded.settings.performanceConfig.compressionFormat, 'moovn_lz77');
  assert.equal(loaded.settings.defaultGameSettings.motionLevel, 'subtle');
  assert.equal(parseStoredSettingsJson('{"workspaceRootPath":"x"}').ok, false);
  assert.equal(parseStoredSettingsJson(JSON.stringify({ ...legacy, future: 1 })).ok, false);
});

test('corrupt, empty or unreadable stored records remain unchanged on save', () => {
  const raw = JSON.stringify({ ...valid, editorConfig: { ...valid.editorConfig, autoSaveIntervalSec: -99999 } });
  const records = memoryStorage(); records.set(key, raw);
  const inspected = inspectSystemSettings();
  assert.match(inspected.warning || '', /ERR_SETTINGS_CORRUPT/);
  assert.equal(inspected.invalidRaw, raw);
  assert.equal(inspected.settings.editorConfig.autoSaveIntervalSec, 15);
  assert.equal(saveSystemSettingsDetailed(valid).ok, false);
  assert.equal(records.get(key), raw);
  records.set(key, '');
  assert.match(inspectSystemSettings().warning || '', /ERR_SETTINGS_CORRUPT/);
  assert.equal(saveSystemSettingsDetailed(valid).ok, false);
  assert.equal(records.get(key), '');
  const inaccessible = memoryStorage({ failGet: true }); inaccessible.set(key, JSON.stringify(valid));
  assert.equal(readSystemSettingsRaw().ok, false);
  assert.equal(saveSystemSettingsDetailed(valid).ok, false);
  assert.equal(inaccessible.get(key), JSON.stringify(valid));
});

test('quota failure and changed-during-import never replace the prior record', () => {
  const original = JSON.stringify(valid);
  const changed = JSON.stringify({ ...valid, defaultGameSettings: { ...valid.defaultGameSettings, bgmVolume: 17 } });
  const records = memoryStorage({ failMainWrite: true }); records.set(key, original);
  assert.equal(saveSystemSettingsDetailed(valid, original).ok, false);
  assert.equal(records.get(key), original);
  records.set(key, changed);
  const stale = saveSystemSettingsDetailed(valid, original);
  assert.equal(stale.ok, false);
  if (!stale.ok) assert.match(stale.error, /ERR_SETTINGS_CHANGED/);
  assert.equal(records.get(key), changed);
});

test('reset verifies an exact backup and preserves original on backup or write failure', () => {
  const raw = '{"workspaceRootPath":"broken"}';
  let records = memoryStorage({ failBackup: true }); records.set(key, raw);
  let result = resetSystemSettings(); assert.equal(result.ok, false); assert.equal(records.get(key), raw);
  records = memoryStorage({ failMainWrite: true }); records.set(key, raw);
  result = resetSystemSettings(); assert.equal(result.ok, false); assert.equal(records.get(key), raw);
  assert([...records].some(([name, value]) => name.startsWith(`${key}.backup.`) && value === raw));
  records = memoryStorage(); records.set(key, raw);
  result = resetSystemSettings(); assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.ok(result.backupKey); assert.equal(records.get(result.backupKey), raw);
  assert.equal(JSON.parse(records.get(key) || '{}').editorConfig.autoSaveIntervalSec, 15);
});

test('reset refuses to overwrite a record changed during backup', () => {
  const oldRaw = JSON.stringify(valid);
  const newRaw = JSON.stringify({ ...valid, defaultGameSettings: { ...valid.defaultGameSettings, bgmVolume: 1 } });
  const records = new Map([[key, oldRaw]]);
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (name: string) => records.get(name) ?? null,
    setItem: (name: string, value: string) => { records.set(name, value); if (name.startsWith(`${key}.backup.`)) records.set(key, newRaw); },
  } });
  const result = resetSystemSettings(); assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /ERR_SETTINGS_CHANGED/);
  assert.equal(records.get(key), newRaw);
  assert([...records].some(([name, value]) => name.startsWith(`${key}.backup.`) && value === oldRaw));
});
