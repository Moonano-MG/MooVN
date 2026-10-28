import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SAMPLE_PROJECT } from '../src/data/defaultProject.ts';
import { parseMpvnProject, serializeMpvnProject } from '../src/lib/mpvnFormat.ts';
import { buildChapterMsvnPackage, MooVNBuiltInCodec, parseAndDecompressMsvnPackage, type MsvnChapterPackage } from '../src/lib/assetCompressionEngine.ts';

const rechecksum = (pkg: MsvnChapterPackage): MsvnChapterPackage => {
  const { integrity: _excluded, ...payload } = pkg;
  return { ...payload, integrity: { algorithm: 'sha256', digest: createHash('sha256').update(JSON.stringify(payload), 'utf8').digest('hex') } };
};

const fixture = () => {
  const project = structuredClone(SAMPLE_PROJECT);
  project.title = '格式测试 · 中文 / Emoji 📖';
  project.nodes[0].dialogues[0].text = '第一行，带逗号 (括号) 和 "引号"\nSecond line 🚀';
  return project;
};

test('MPVN disk export and import preserves a real project and rejects a modified field', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'moovn-mpvn-'));
  try {
    const project = fixture();
    const filename = join(dir, 'story.mpvn');
    await writeFile(filename, serializeMpvnProject(project), 'utf8');
    const content = await readFile(filename, 'utf8');
    const restored = parseMpvnProject(content);
    assert.equal(restored.ok, true, restored.error);
    assert.deepEqual(restored.project, project);
    const tampered = JSON.parse(content);
    tampered.project.nodes[0].dialogues[0].text += '!';
    const damaged = parseMpvnProject(JSON.stringify(tampered));
    assert.equal(damaged.ok, false, 'modified exported project must fail its checksum');
    assert.match(damaged.error ?? '', /ERR_MPVN_CHECKSUM/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('MPVN preserves legacy imports, rejects missing v2 checksum and identifies MSVN', () => {
  const project = fixture();
  const legacy = { magic: 'MPVN_STUDIO_PROJECT', format: 'mpvn', schemaVersion: '1.1.0', project };
  const old = parseMpvnProject(JSON.stringify(legacy));
  assert.equal(old.ok, true, old.error);
  assert.equal(old.integrity, 'legacy-unchecked');
  const current = JSON.parse(serializeMpvnProject(project));
  delete current.integrity;
  const missing = parseMpvnProject(JSON.stringify(current));
  assert.equal(missing.ok, false);
  assert.match(missing.error ?? '', /ERR_MPVN_CHECKSUM/);
  const chapter = buildChapterMsvnPackage(project, project.chapters[0].id);
  const wrongKind = parseMpvnProject(JSON.stringify(chapter));
  assert.equal(wrongKind.ok, false);
  assert.match(wrongKind.error ?? '', /ERR_MSVN_NOT_PROJECT/);
});

test('MSVN chapter export to disk round-trips levels 0, 5 and 9 and reports actual codec', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'moovn-msvn-'));
  try {
    const project = fixture();
    const chapterId = project.chapters[0].id;
    for (const level of [0, 5, 9]) {
      const pkg = buildChapterMsvnPackage(project, chapterId, { compressionFormat: 'moovn_lz77', compressionLevel: level });
      const filename = join(dir, `chapter-${level}.msvn`);
      await writeFile(filename, JSON.stringify(pkg, null, 2), 'utf8');
      const parsed = await parseAndDecompressMsvnPackage(await readFile(filename, 'utf8'));
      assert.deepEqual(parsed.nodes, project.nodes.filter((node) => node.chapterId === chapterId));
      assert.equal(parsed.integrity, 'sha256');
      assert.equal(parsed.pkg.compressionFormat, parsed.pkg.compressedNodesEnvelope.format);
      if (level === 0) assert.equal(parsed.pkg.compressionFormat, 'raw_passthrough');
      assert.ok(Array.isArray(parsed.pkg.assetManifest));
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('MSVN rejects bad magic, corrupt content, non-node payloads and chapter mismatch', async () => {
  const project = fixture();
  const pkg = buildChapterMsvnPackage(project, project.chapters[0].id);
  await assert.rejects(parseAndDecompressMsvnPackage(JSON.stringify({ ...pkg, magic: 'MPVN_STUDIO_PROJECT' })), /msvn|MSVN/i);
  await assert.rejects(parseAndDecompressMsvnPackage(JSON.stringify(rechecksum({
    ...pkg, compressedNodesEnvelope: { ...pkg.compressedNodesEnvelope, checksum: '0000000000000000' },
  }))), /ERR_COMPRESSION_CHECKSUM/);
  const nonNodes = MooVNBuiltInCodec.compressTextPayload('{"not":"nodes"}', 0);
  await assert.rejects(parseAndDecompressMsvnPackage(JSON.stringify(rechecksum({
    ...pkg, compressionFormat: nonNodes.format, compressionLevel: nonNodes.level, compressedNodesEnvelope: nonNodes,
  }))), /ERR_MSVN_NODES/);
  const mismatch = structuredClone(pkg);
  mismatch.chapter.id = 'another-chapter';
  await assert.rejects(parseAndDecompressMsvnPackage(JSON.stringify(rechecksum(mismatch))), /ERR_MSVN_CHAPTER/);
});


test('MPVN hash covers the envelope and is not an authentication mechanism', () => {
  const payload = JSON.parse(serializeMpvnProject(fixture()));
  const { integrity, ...unsigned } = payload;
  assert.equal(integrity.digest, createHash('sha256').update(JSON.stringify(unsigned), 'utf8').digest('hex'));
  assert.equal(parseMpvnProject(JSON.stringify(payload, null, 8)).ok, true, 'indentation alone is not hashed');
  const changedMeta = structuredClone(payload);
  changedMeta.projectMeta.title += 'changed';
  assert.match(parseMpvnProject(JSON.stringify(changedMeta)).error ?? '', /ERR_MPVN_CHECKSUM/);
  // An unkeyed digest can be recomputed; never advertise this as authentication.
  const changed = structuredClone(payload);
  changed.project.title = 'recomputed';
  const { integrity: _excluded, ...modified } = changed;
  changed.integrity.digest = createHash('sha256').update(JSON.stringify(modified), 'utf8').digest('hex');
  assert.equal(parseMpvnProject(JSON.stringify(changed)).ok, true);
  delete changed.integrity; delete changed.envelopeVersion;
  assert.equal(parseMpvnProject(JSON.stringify(changed)).integrity, 'legacy-unchecked');
});

test('MSVN validates metadata, IDs, compression and old codec labels', async () => {
  const project = fixture();
  const pkg = buildChapterMsvnPackage(project, project.chapters[0].id, { compressionFormat: 'moovn_lz77', compressionLevel: 5 });
  assert.equal(pkg.compressionFormat, 'moovn_lz77');
  const legacy = structuredClone(pkg);
  delete legacy.envelopeVersion; delete legacy.integrity;
  legacy.compressionFormat = '7z'; legacy.compressedNodesEnvelope.format = '7z';
  const old = await parseAndDecompressMsvnPackage(JSON.stringify(legacy));
  assert.deepEqual(old.nodes, project.nodes);
  assert.equal(old.integrity, 'legacy-unchecked');
  const incorrectLabel = structuredClone(pkg);
  incorrectLabel.compressionFormat = 'brotli';
  await assert.rejects(parseAndDecompressMsvnPackage(JSON.stringify(rechecksum(incorrectLabel))), /ERR_MSVN_FORMAT/);
  const unlockMismatch = structuredClone(pkg);
  unlockMismatch.minVariables = { route: 3 };
  await assert.rejects(parseAndDecompressMsvnPackage(JSON.stringify(rechecksum(unlockMismatch))), /ERR_MSVN_CHAPTER/);
  const duplicate = structuredClone(project.nodes);
  duplicate.push(structuredClone(duplicate[0]));
  const duplicateEnvelope = MooVNBuiltInCodec.compressTextPayload(JSON.stringify(duplicate), 5);
  await assert.rejects(parseAndDecompressMsvnPackage(JSON.stringify(rechecksum({ ...pkg,
    compressionFormat: duplicateEnvelope.format, compressionLevel: duplicateEnvelope.level, compressedNodesEnvelope: duplicateEnvelope,
  }))), /ERR_MSVN_NODES/);
  const badLength = structuredClone(pkg);
  badLength.compressedNodesEnvelope.compressedBytes += 1;
  await assert.rejects(parseAndDecompressMsvnPackage(JSON.stringify(rechecksum(badLength))), /ERR_COMPRESSION_SIZE/);
  const badLevel = structuredClone(pkg);
  badLevel.compressionLevel = 12; badLevel.compressedNodesEnvelope.level = 12;
  await assert.rejects(parseAndDecompressMsvnPackage(JSON.stringify(rechecksum(badLevel))), /ERR_COMPRESSION_LEVEL/);
  assert.throws(() => MooVNBuiltInCodec.compressTextPayload('data', -1), /ERR_COMPRESSION_LEVEL/);
  const badExport = structuredClone(project);
  badExport.chapters[0].minVariables = { ['x'.repeat(201)]: 1 };
  assert.throws(() => buildChapterMsvnPackage(badExport, badExport.chapters[0].id), /ERR_MSVN_FORMAT/);
  const duplicateAssets = structuredClone(pkg);
  duplicateAssets.assetManifest = [{ id: 'duplicate', path: '/images/example.png' }, { id: 'duplicate', path: '/images/other.png' }];
  await assert.rejects(parseAndDecompressMsvnPackage(JSON.stringify(rechecksum(duplicateAssets))), /ERR_MSVN_FORMAT/);
  const unsafe = JSON.stringify(pkg).replace('"magic":', '"__proto__":{"polluted":true},"magic":');
  await assert.rejects(parseAndDecompressMsvnPackage(unsafe), /ERR_PROTOTYPE_POLLUTION/);
  assert.equal(Reflect.get(Object.prototype, 'polluted'), undefined);
});


test('MSVN checksum covers chapter metadata and detects missing v2 checksum', async () => {
  const project = fixture();
  const pkg = buildChapterMsvnPackage(project, project.chapters[0].id);
  const { integrity, ...payload } = pkg;
  assert.equal(integrity?.digest, createHash('sha256').update(JSON.stringify(payload), 'utf8').digest('hex'));
  const changed = structuredClone(pkg);
  changed.chapter.title += ' changed';
  await assert.rejects(parseAndDecompressMsvnPackage(JSON.stringify(changed)), /ERR_MSVN_CHECKSUM/);
  const missing = structuredClone(pkg);
  delete missing.integrity;
  await assert.rejects(parseAndDecompressMsvnPackage(JSON.stringify(missing)), /ERR_MSVN_CHECKSUM/);
  // Recomputing an unkeyed digest is possible; it is not an authenticity check.
  assert.equal((await parseAndDecompressMsvnPackage(JSON.stringify(rechecksum(changed)))).pkg.chapter.title, changed.chapter.title);
  delete changed.envelopeVersion; delete changed.integrity;
  assert.equal((await parseAndDecompressMsvnPackage(JSON.stringify(changed))).integrity, 'legacy-unchecked');
});
