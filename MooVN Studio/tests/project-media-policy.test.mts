import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PROJECT, SAMPLE_PROJECT } from '../src/data/defaultProject.ts';
import { CHARACTER_ASSETS } from '../src/data/assets.ts';
import { hydrateAssetsForHtmlExport } from '../src/lib/assetStore.ts';
import { classifyProjectMedia, fetchConsentedProjectMedia, MAX_REMOTE_MEDIA_BYTES } from '../src/lib/projectMediaPolicy.ts';

test('project media classification is an exact, conservative boundary', () => {
  assert.equal(classifyProjectMedia('').kind, 'empty');
  assert.equal(classifyProjectMedia(CHARACTER_ASSETS[0].path).kind, 'bundled');
  assert.equal(classifyProjectMedia('data:image/png;base64,aGVsbG8=').kind, 'embedded');
  assert.equal(classifyProjectMedia(`moovn-asset://${'a'.repeat(64)}.png`).kind, 'workspace');
  for (const value of [
    '/images/../../redirect', '/images/custom.png', '//tracker.invalid/a.png',
    'blob:https://tracker.invalid/abc', 'data:image/svg+xml;base64,PHN2Zz4=',
    'https://user:password@tracker.invalid/a.png', 'https://tracker.invalid/a.png\n',
    `https://tracker.invalid/${'a'.repeat(4096)}`,
  ]) assert.equal(classifyProjectMedia(value).kind, 'invalid', value);
  const reference = classifyProjectMedia('HTTPS://tracker.invalid/a.png?secret=123#fragment');
  assert.equal(reference.kind, 'remote');
  if (reference.kind === 'remote') {
    assert.equal(reference.display, 'https://tracker.invalid/a.png（含查询参数，已隐藏）');
    assert.equal(reference.insecure, false);
  }
  const insecure = classifyProjectMedia('http://tracker.invalid/a.png');
  assert.equal(insecure.kind, 'remote');
  assert(insecure.kind === 'remote' && insecure.insecure);
});

test('approved fetch omits credentials/referrer, refuses redirects and returns only a bounded media blob', async () => {
  const original = globalThis.fetch;
  let captured: RequestInit | undefined;
  globalThis.fetch = async (_url, init) => {
    captured = init;
    return new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'image/png' } });
  };
  try {
    const signal = new AbortController().signal;
    const blob = await fetchConsentedProjectMedia('https://tracker.invalid/image.png', signal);
    assert.equal(blob.type, 'image/png');
    assert.deepEqual([...new Uint8Array(await blob.arrayBuffer())], [1, 2, 3]);
    assert.equal(captured?.credentials, 'omit');
    assert.equal(captured?.redirect, 'error');
    assert.equal(captured?.referrerPolicy, 'no-referrer');
    assert.equal(captured?.mode, 'cors');
    assert.equal(captured?.signal, signal);
    // A later item in the same approved set receives only the unused budget.
    await assert.rejects(fetchConsentedProjectMedia('https://tracker.invalid/second.png', signal, 2), /ERR_REMOTE_MEDIA_SIZE/);
  } finally { globalThis.fetch = original; }
});

test('rejects unsupported types and declared or streamed oversized data, cancelling the body', async () => {
  const original = globalThis.fetch;
  let cancelled = 0;
  const stream = (parts: Uint8Array[]) => new ReadableStream<Uint8Array>({
    start(controller) { for (const part of parts) controller.enqueue(part); },
    cancel() { cancelled++; },
  });
  try {
    globalThis.fetch = async () => new Response(stream([new Uint8Array([1])]), { headers: { 'content-type': 'image/svg+xml' } });
    await assert.rejects(fetchConsentedProjectMedia('https://tracker.invalid/x', new AbortController().signal), /ERR_REMOTE_MEDIA_TYPE/);
    assert.equal(cancelled, 1);

    globalThis.fetch = async () => new Response(stream([new Uint8Array([1])]), {
      headers: { 'content-type': 'image/png', 'content-length': String(MAX_REMOTE_MEDIA_BYTES + 1) },
    });
    await assert.rejects(fetchConsentedProjectMedia('https://tracker.invalid/x', new AbortController().signal), /ERR_REMOTE_MEDIA_SIZE/);
    assert.equal(cancelled, 2);

    globalThis.fetch = async () => new Response(stream([new Uint8Array(3), new Uint8Array(3)]), { headers: { 'content-type': 'image/png' } });
    await assert.rejects(fetchConsentedProjectMedia('https://tracker.invalid/x', new AbortController().signal, 5), /ERR_REMOTE_MEDIA_SIZE/);
    assert.equal(cancelled, 3);
    await assert.rejects(fetchConsentedProjectMedia('https://tracker.invalid/x', new AbortController().signal, 0), /ERR_REMOTE_MEDIA_SIZE/);
  } finally { globalThis.fetch = original; }
});

test('export preflights every project media reference before any asset fetch', async () => {
  const project = structuredClone(DEFAULT_PROJECT);
  project.characters = structuredClone(SAMPLE_PROJECT.characters);
  project.characters[0].mediaUrl = CHARACTER_ASSETS[0].path;
  project.characters[0].layerTextures = { hair_front: 'https://tracker.invalid/tracking.png' };
  const snapshot = structuredClone(project);
  const original = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => { requests++; throw new Error('unexpected network'); };
  try {
    await assert.rejects(hydrateAssetsForHtmlExport(project), /ERR_EXPORT_EXTERNAL_MEDIA/);
    assert.equal(requests, 0);
    assert.deepEqual(project, snapshot, 'preflight must not rewrite the original project');
    project.characters[0].layerTextures = { hair_front: '/images/../redirect' };
    await assert.rejects(hydrateAssetsForHtmlExport(project), /ERR_EXPORT_MEDIA_REFERENCE/);
    assert.equal(requests, 0);
  } finally { globalThis.fetch = original; }
});
