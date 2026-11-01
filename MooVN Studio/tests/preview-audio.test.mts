import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PROJECT } from '../src/data/defaultProject.ts';
import { getUnsupportedPreviewIssue } from '../src/lib/previewSupport.ts';
import { createPreviewPlayback, enterPreviewNode, restorePreviewSlot } from '../src/lib/previewState.ts';
import { inspectPreviewSaves } from '../src/lib/previewSaves.ts';
import type { SaveSlotData } from '../src/types.ts';

function project() { return structuredClone(DEFAULT_PROJECT); }

test('preview rejects unsupported voice, wrong audio categories and missing audio before entry effects', () => {
  const p = project();
  const node = p.nodes[0];
  node.unlockedClueTitle = 'not-applied';
  node.type = 'voice_play';
  assert.equal(getUnsupportedPreviewIssue(node)?.code, 'ERR_PREVIEW_AUDIO_UNSUPPORTED');
  assert.deepEqual(createPreviewPlayback(p, node.id).current.clues, []);
  node.type = 'dialogue'; node.dialogues[0].voiceAudioId = 'sfx-school-bell';
  assert.equal(getUnsupportedPreviewIssue(node)?.code, 'ERR_PREVIEW_AUDIO_UNSUPPORTED');
  delete node.dialogues[0].voiceAudioId;
  node.type = 'sfx_play';
  assert.equal(getUnsupportedPreviewIssue(node)?.code, 'ERR_PREVIEW_AUDIO_UNSUPPORTED');
  node.sfxId = 'bgm-spring-breeze';
  assert.equal(getUnsupportedPreviewIssue(node)?.code, 'ERR_PREVIEW_AUDIO_UNSUPPORTED');
  node.sfxId = 'sfx-school-bell';
  assert.equal(getUnsupportedPreviewIssue(node), null);
  node.type = 'bgm_play'; node.sfxId = undefined; node.bgmId = 'sfx-school-bell';
  assert.equal(getUnsupportedPreviewIssue(node)?.code, 'ERR_PREVIEW_AUDIO_UNSUPPORTED');
  node.bgmId = 'bgm-spring-breeze';
  assert.equal(getUnsupportedPreviewIssue(node), null);
  node.type = 'bgm_stop'; node.bgmId = 'sfx-school-bell';
  assert.equal(getUnsupportedPreviewIssue(node), null, 'stop does not play or replace its stored asset');
});

test('unsupported or out-of-range settings actions stop before changing preview state', () => {
  const p = project(); const node = p.nodes[0]; node.type = 'game_settings_modify';
  node.settingsActionConfig = { textSpeedMs: 40, bgmVolumePercent: 20 };
  const playback = createPreviewPlayback(p, node.id, true, 0, 78);
  assert.equal(getUnsupportedPreviewIssue(node)?.code, 'ERR_PREVIEW_SETTINGS_UNSUPPORTED');
  assert.equal(playback.current.textSpeedMs, 78);
  node.settingsActionConfig = { textSpeedMs: 81 };
  assert.equal(getUnsupportedPreviewIssue(node)?.code, 'ERR_PREVIEW_SETTINGS_UNSUPPORTED');
  node.settingsActionConfig = { textSpeedMs: 40, openSettingsPanel: true };
  assert.equal(getUnsupportedPreviewIssue(node), null);
  assert.equal(enterPreviewNode(playback, p, node.id).current.textSpeedMs, 40);
});

test('preview uses the configured initial speed and legacy saves use that fallback', () => {
  const p = project();
  const playback = createPreviewPlayback(p, p.startNodeId, true, 0, 79);
  assert.equal(playback.current.textSpeedMs, 79);
  const slot: SaveSlotData = { slotKey: '1-1', tabId: '1', slotIndex: 1, savedAt: 'time', chapterTitle: 'chapter',
    nodeId: p.startNodeId, nodeTitle: 'title', dialogueIndex: 0, speakerName: 'narrator', textPreview: 'line',
    backgroundId: '', affectionSnapshot: {}, customAttrSnapshot: {}, variablesSnapshot: {} };
  assert.equal(restorePreviewSlot(playback, p, slot, 79).current.textSpeedMs, 79);
  const corrupted = { ...slot, previewSnapshotVersion: 1, clueSnapshot: [], textSpeedSnapshot: 9999, timedRemainingSnapshot: null };
  assert.deepEqual(inspectPreviewSaves({ '1-1': corrupted }).invalidKeys, ['1-1']);
});
