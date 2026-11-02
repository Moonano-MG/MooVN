import test from 'node:test';
import assert from 'node:assert/strict';
import { createReadHistory } from '../src/lib/readHistory.ts';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  };
}
const line = { id: 'line-1', speakerId: 'narrator', speakerName: '旁白', text: 'A line' };

test('only explicitly completed matching dialogue is read, including text and position', () => {
  const storage = memoryStorage();
  const tracker = createReadHistory(() => storage, 'project-1');
  assert.deepEqual(tracker.hasRead('node-a', 0, line), { read: false, error: null });
  assert.deepEqual(tracker.markRead('node-a', 0, line), { ok: true, error: null });
  assert.equal(tracker.hasRead('node-a', 0, line).read, true);
  assert.equal(tracker.hasRead('node-b', 0, line).read, false);
  assert.equal(tracker.hasRead('node-a', 1, line).read, false);
  assert.equal(tracker.hasRead('node-a', 0, { ...line, text: 'Edited line' }).read, false);
  assert.equal(tracker.hasRead('node-a', 0, { ...line, speakerName: 'Other' }).read, false);
  assert.equal(createReadHistory(() => storage, 'project-2').hasRead('node-a', 0, line).read, false);
  assert.equal(createReadHistory(() => storage, 'project-1').hasRead('node-a', 0, line).read, true,
    'history must persist when the tracker is recreated');
});

test('corrupt, future, duplicate and oversized records are preserved and disable skip', () => {
  const storage = memoryStorage();
  const tracker = createReadHistory(() => storage, 'history');
  for (const raw of [
    '{bad json', '[]', JSON.stringify({ version: 2, entries: [] }),
    JSON.stringify({ version: 1, entries: [], futureField: true }),
    JSON.stringify({ version: 1, entries: ['not a valid line identity'] }),
    JSON.stringify({ version: 1, entries: [JSON.stringify(['node-a', 0, 'line-1', 'narrator', '旁白', 'A line']), JSON.stringify(['node-a', 0, 'line-1', 'narrator', '旁白', 'A line'])] }),
    'x'.repeat(4 * 1024 * 1024 + 1),
  ]) {
    storage.setItem('history', raw);
    assert.equal(tracker.hasRead('node-a', 0, line).read, false);
    assert.match(tracker.markRead('node-a', 0, line).error || '', /已读记录/);
    assert.equal(storage.getItem('history'), raw);
  }
});

test('storage failures and competing writes fail without claiming history was saved', () => {
  const failedRead = createReadHistory(() => ({
    getItem() { throw new Error('access denied'); },
    setItem() { throw new Error('must not write'); },
  }), 'history');
  assert.equal(failedRead.hasRead('node-a', 0, line).read, false);
  assert.match(failedRead.markRead('node-a', 0, line).error || '', /读取失败/);

  const failedWrite = createReadHistory(() => ({
    getItem() { return null; },
    setItem() { throw new Error('quota'); },
  }), 'history');
  assert.deepEqual(failedWrite.markRead('node-a', 0, line), { ok: false, error: '已读记录写入失败，快进已停用；原记录未覆盖。' });
  assert.equal(failedWrite.hasRead('node-a', 0, line).read, false, 'a failed write must not mutate cached read state');

  let reads = 0;
  let wrote = false;
  const raced = createReadHistory(() => ({
    getItem() { return ++reads === 1 ? null : JSON.stringify({ version: 1, entries: ['newer'] }); },
    setItem() { wrote = true; },
  }), 'history');
  assert.match(raced.markRead('node-a', 0, line).error || '', /其他窗口/);
  assert.equal(wrote, false);
});

test('invalid or oversized lines cannot become read', () => {
  const storage = memoryStorage();
  const tracker = createReadHistory(() => storage, 'history');
  assert.equal(tracker.markRead('node-a', -1, line).ok, false);
  assert.equal(tracker.markRead('node-a', 0, { ...line, text: 'x'.repeat(1_100_001) }).ok, false);
  assert.equal(storage.getItem('history'), null);
});

test('history count and output limits preserve the previous readable record', () => {
  const storage = memoryStorage();
  const entries = Array.from({ length: 20_000 }, (_, index) =>
    JSON.stringify([`node-${Math.floor(index / 10_000)}`, index % 10_000, 'line-1', 'narrator', '旁白', 'A line']));
  const full = JSON.stringify({ version: 1, entries });
  storage.setItem('count', full);
  const countTracker = createReadHistory(() => storage, 'count');
  assert.equal(countTracker.hasRead('node-0', 0, line).read, true);
  assert.match(countTracker.markRead('new-node', 0, line).error || '', /数量已达上限/);
  assert.equal(storage.getItem('count'), full);

  const sizeTracker = createReadHistory(() => storage, 'size');
  const long = { ...line, text: 'x'.repeat(1_000_000) };
  for (let index = 0; index < 4; index++) assert.equal(sizeTracker.markRead('long-node', index, long).ok, true);
  const before = storage.getItem('size');
  assert.match(sizeTracker.markRead('long-node', 4, long).error || '', /过大/);
  assert.equal(storage.getItem('size'), before);
  assert.equal(sizeTracker.hasRead('long-node', 4, long).read, false);
  assert.equal(sizeTracker.hasRead('long-node', 3, long).read, true);
});
