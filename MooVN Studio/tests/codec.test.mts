import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PROJECT } from '../src/data/defaultProject.ts';
import {
  MooVNBuiltInCodec, buildChapterMsvnPackage, lzDecompressBytes, parseAndDecompressMsvnPackage,
} from '../src/lib/assetCompressionEngine.ts';

test('new chapter output identifies the actual LZ77 codec and legacy labels remain readable', async () => {
  const raw = '章节文本 Chapter text '.repeat(100);
  const envelope = MooVNBuiltInCodec.compressTextPayload(raw, 5);
  assert.equal(envelope.format, 'moovn_lz77');
  assert.equal(MooVNBuiltInCodec.decompressSync(envelope), raw);
  assert.equal(MooVNBuiltInCodec.decompressSync({ ...envelope, format: '7z' }), raw);
  const passthrough = MooVNBuiltInCodec.compressTextPayload(raw, 0);
  assert.equal(passthrough.format, 'raw_passthrough');
  assert.equal(MooVNBuiltInCodec.decompressSync(passthrough), raw);
  const project = structuredClone(DEFAULT_PROJECT);
  const pkg = buildChapterMsvnPackage(project, project.chapters[0].id);
  assert.equal(pkg.compressionFormat, pkg.compressedNodesEnvelope.format);
  assert.deepEqual((await parseAndDecompressMsvnPackage(JSON.stringify(pkg))).nodes, project.nodes);
  assert.throws(() => buildChapterMsvnPackage(project, 'missing'), /ERR_CHAPTER_NOT_FOUND/);
});

test('damaged or oversized compressed data is rejected rather than decoded silently', () => {
  const envelope = MooVNBuiltInCodec.compressTextPayload('data '.repeat(100), 5);
  assert.throws(() => MooVNBuiltInCodec.decompressSync({ ...envelope, checksum: 'corrupt' }), /ERR_COMPRESSION_CHECKSUM/);
  assert.throws(() => MooVNBuiltInCodec.decompressSync({ ...envelope, originalBytes: 17 * 1024 * 1024 }), /ERR_COMPRESSION_SIZE/);
  assert.throws(() => lzDecompressBytes(new Uint8Array([0x80, 0, 1])), /ERR_COMPRESSION_DATA/);
  assert.throws(() => lzDecompressBytes(new Uint8Array([4, 1, 2])), /ERR_COMPRESSION_DATA/);
});
