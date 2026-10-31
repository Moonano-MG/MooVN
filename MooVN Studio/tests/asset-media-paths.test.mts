import test from 'node:test';
import assert from 'node:assert/strict';
import { SAMPLE_PROJECT } from '../src/data/defaultProject.ts';
import { getProjectWorkspaceAssetReferences, hydrateAssetsForHtmlExport, verifyProjectAssets } from '../src/lib/assetStore.ts';

test('ordinary text that resembles an asset reference is not hydrated', async () => {
  const project = structuredClone(SAMPLE_PROJECT);
  project.title = 'moovn-asset://this-is-a-title-not-a-file';
  project.nodes[0].dialogues[0].text = 'moovn-asset://this-is-dialogue-not-a-file';
  project.nodes[0].customScript = 'moovn-asset://this-is-script-not-a-file';
  const result = await hydrateAssetsForHtmlExport(project);
  assert.deepEqual(result, project);
  assert.deepEqual(getProjectWorkspaceAssetReferences(project), []);
  await verifyProjectAssets(project);
});

test('an invalid reference in an actual character media field still fails closed', async () => {
  const project = structuredClone(SAMPLE_PROJECT);
  project.characters[0].mediaUrl = 'moovn-asset://missing';
  assert.deepEqual(getProjectWorkspaceAssetReferences(project), ['moovn-asset://missing']);
  await assert.rejects(verifyProjectAssets(project), /ERR_ASSET_REFERENCE/);
  await assert.rejects(hydrateAssetsForHtmlExport(project), /ERR_ASSET_REFERENCE/);
});
