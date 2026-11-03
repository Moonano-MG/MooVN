import test from 'node:test';
import assert from 'node:assert/strict';
import { storeAssetViaTauri } from '../src/lib/tauriBridge.ts';

test('native asset upload preserves both the operation and cleanup errors', async () => {
  const previous = globalThis.window;
  const calls: string[] = [];
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { __TAURI_INTERNALS__: {
    invoke: async (command: string) => {
      calls.push(command);
      if (command === 'begin_asset_upload') return 'token';
      if (command === 'append_asset_upload') throw new Error('ERR_ASSET_WRITE: disk full');
      if (command === 'abort_asset_upload') throw new Error('ERR_ASSET_CLEANUP: access denied');
      throw new Error(`Unexpected command ${command}`);
    },
  } } });
  try {
    await assert.rejects(storeAssetViaTauri('name.png', new Uint8Array([1])), /ERR_ASSET_WRITE: disk full.*ERR_ASSET_CLEANUP: access denied/);
    assert.deepEqual(calls, ['begin_asset_upload', 'append_asset_upload', 'abort_asset_upload']);
  } finally {
    if (previous === undefined) Reflect.deleteProperty(globalThis, 'window');
    else Object.defineProperty(globalThis, 'window', { configurable: true, value: previous });
  }
});

test('a native commit conflict propagates without claiming import success', async () => {
  const previous = globalThis.window;
  const calls: string[] = [];
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { __TAURI_INTERNALS__: {
    invoke: async (command: string) => {
      calls.push(command);
      if (command === 'begin_asset_upload') return 'token';
      if (command === 'finish_asset_upload') throw new Error('ERR_ASSET_CONFLICT: original retained');
      if (command === 'append_asset_upload' || command === 'abort_asset_upload') return null;
      throw new Error(`Unexpected command ${command}`);
    },
  } } });
  try {
    await assert.rejects(storeAssetViaTauri('name.png', new Uint8Array([1])), /ERR_ASSET_CONFLICT: original retained/);
    assert.deepEqual(calls, ['begin_asset_upload', 'append_asset_upload', 'finish_asset_upload', 'abort_asset_upload']);
  } finally {
    if (previous === undefined) Reflect.deleteProperty(globalThis, 'window');
    else Object.defineProperty(globalThis, 'window', { configurable: true, value: previous });
  }
});
