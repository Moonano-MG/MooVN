import { z } from 'zod';
import type { MooVNSystemSettings } from '../types.ts';
import { validateObjectSafety } from './projectSchema.ts';

/** Settings are small; reject large files before reading or parsing them. */
export const MAX_SETTINGS_BYTES = 256 * 1024;

const platform = z.enum(['windows', 'android', 'ios', 'macos', 'web']);
const path = z.string().min(1).max(4096).refine((value) => !value.includes('\0'));
const scriptLanguage = z.enum(['typescript', 'javascript', 'csharp', 'cpp', 'rust']);
const editor = z.object({
  autoSaveIntervalSec: z.number().int().min(5).max(120),
  coloredNodeCategories: z.boolean(),
  defaultScriptLang: scriptLanguage,
}).strict();
const game = z.object({
  textSpeedMs: z.number().int().min(10).max(80),
  autoPlayDelayMs: z.number().int().min(600).max(4000),
  bgmVolume: z.number().int().min(0).max(100),
  sfxVolume: z.number().int().min(0).max(100),
  motionLevel: z.enum(['off', 'subtle', 'full']).optional(),
}).strict();
const performance = z.object({
  compressionFormat: z.enum(['moovn_lz77', 'xz', '7z', 'brotli']),
  compressionLevel: z.number().int().min(0).max(9),
  // Older settings can contain these fields. They do not enable a runtime loader.
  skipAlreadyCompressedPng: z.boolean().optional(),
  preloadSceneDistance: z.number().int().min(0).max(10000).optional(),
  unloadSceneDistance: z.number().int().min(0).max(10000).optional(),
  streamPreloadScenes: z.number().int().min(0).max(10000).optional(),
  decompressTarget: z.enum(['memory', 'cache_file']).optional(),
  workerCpuBudgetPercent: z.number().int().min(0).max(100).optional(),
  modularMsvnEnabled: z.boolean().optional(),
}).strict();

const settings = z.object({
  platform,
  workspaceRootPath: path,
  projectsDirectoryPath: path,
  exportOutputDirectoryPath: path,
  cacheDirectoryPath: path,
  settingsFilePath: path,
  webMountedFolderName: z.string().max(255).optional(),
  editorConfig: editor,
  defaultGameSettings: game,
  performanceConfig: performance,
}).strict();

// Existing local records may predate some fields. Only missing known legacy
// fields are defaulted; invalid, unknown and incomplete core sections are not
// silently discarded. Imported files use the full schema above.
const storedSettings = settings.partial().extend({
  editorConfig: editor.extend({ defaultScriptLang: scriptLanguage.optional() }).strict(),
  defaultGameSettings: game,
});

export type SettingsValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

type StoredSettings = z.infer<typeof storedSettings>;

function boundedJson(raw: string): SettingsValidationResult<unknown> {
  if (raw.length > MAX_SETTINGS_BYTES || new TextEncoder().encode(raw).byteLength > MAX_SETTINGS_BYTES) {
    return { ok: false, error: 'ERR_SETTINGS_TOO_LARGE: 设置文件超过 256 KiB' };
  }
  let input: unknown;
  try {
    input = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'ERR_SETTINGS_JSON: 设置文件不是有效的 JSON' };
  }
  const safetyError = validateObjectSafety(input);
  if (safetyError) return { ok: false, error: `ERR_SETTINGS_VALIDATION: ${safetyError}` };
  return { ok: true, value: input };
}

function issueMessage(issues: readonly { path: PropertyKey[] }[]): string {
  const field = issues[0]?.path.map(String).join('.') || '根对象';
  return `ERR_SETTINGS_VALIDATION: ${field} 缺失、类型或数值无效，或包含未知字段`;
}

/** Full file imports must contain all required settings; nothing is coerced or stripped. */
export function parseSettingsImportJson(raw: string): SettingsValidationResult<MooVNSystemSettings> {
  const decoded = boundedJson(raw);
  if (!decoded.ok) return decoded;
  const result = settings.safeParse(decoded.value);
  if (!result.success) return { ok: false, error: issueMessage(result.error.issues) };
  return { ok: true, value: result.data };
}

export function parseStoredSettingsJson(raw: string): SettingsValidationResult<StoredSettings> {
  const decoded = boundedJson(raw);
  if (!decoded.ok) return decoded;
  const result = storedSettings.safeParse(decoded.value);
  if (!result.success) return { ok: false, error: issueMessage(result.error.issues) };
  return { ok: true, value: result.data };
}

export function validateSystemSettings(value: unknown): SettingsValidationResult<MooVNSystemSettings> {
  const safetyError = validateObjectSafety(value);
  if (safetyError) return { ok: false, error: `ERR_SETTINGS_VALIDATION: ${safetyError}` };
  const result = settings.safeParse(value);
  if (!result.success) return { ok: false, error: issueMessage(result.error.issues) };
  return { ok: true, value: result.data };
}
