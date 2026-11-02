import test from 'node:test';
import assert from 'node:assert/strict';
import { checkApp, requireDisposableWindowsRunner, runInstaller } from '../scripts/windows-startup-smoke.mjs';

const runningProgram = ['-e', 'setInterval(() => {}, 1000)'];

test('real installation is restricted to disposable GitHub-hosted Windows runners', () => {
  assert.throws(() => requireDisposableWindowsRunner('linux', {}), /must run on Windows/);
  assert.throws(() => requireDisposableWindowsRunner('win32', {}), /disposable GitHub-hosted/);
  assert.throws(() => requireDisposableWindowsRunner('win32', { GITHUB_ACTIONS: 'true', RUNNER_ENVIRONMENT: 'self-hosted' }), /disposable GitHub-hosted/);
  assert.doesNotThrow(() => requireDisposableWindowsRunner('win32', { GITHUB_ACTIONS: 'true', RUNNER_ENVIRONMENT: 'github-hosted' }));
});

test('installer gate accepts exit zero and rejects a nonzero exit', async () => {
  await runInstaller(process.execPath, ['-e', 'process.exit(0)'], { timeoutMs: 10000 });
  await assert.rejects(
    runInstaller(process.execPath, ['-e', 'process.exit(19)'], { timeoutMs: 10000 }),
    /Installer failed: exit=19/,
  );
});

test('installer gate fails rather than hanging when the process times out', async () => {
  await assert.rejects(
    runInstaller(process.execPath, runningProgram, { timeoutMs: 150 }),
    /Installer timed out/,
  );
});

test('startup gate requires launcher and stable workbench probes', async () => {
  const calls: string[] = [];
  await checkApp(process.execPath, {
    args: runningProgram,
    probe: async (_pid: number, phase: string) => { calls.push(phase); return true; },
    timeoutMs: 10000,
    pollMs: 20,
    stableMs: 50,
  });
  assert.deepEqual(calls, ['launcher', 'workbench', 'workbench']);
});

test('startup gate rejects an early process exit', async () => {
  await assert.rejects(
    checkApp(process.execPath, {
      args: ['-e', 'setTimeout(() => process.exit(7), 40)'],
      probe: async () => false,
      timeoutMs: 10000,
      pollMs: 20,
      stableMs: 0,
    }),
    /Editor exited: exit=7/,
  );
});

test('startup gate rejects a live process without a real launcher', async () => {
  await assert.rejects(
    checkApp(process.execPath, {
      args: runningProgram,
      probe: async () => false,
      timeoutMs: 160,
      pollMs: 20,
      stableMs: 0,
    }),
    /Timed out waiting for launcher/,
  );
});

test('startup gate propagates automation errors and rejects a disappearing workbench', async () => {
  await assert.rejects(
    checkApp(process.execPath, {
      args: runningProgram,
      probe: async () => { throw new Error('automation unavailable'); },
      timeoutMs: 10000,
      pollMs: 20,
      stableMs: 0,
    }),
    /automation unavailable/,
  );
  let workbenchChecks = 0;
  await assert.rejects(
    checkApp(process.execPath, {
      args: runningProgram,
      probe: async (_pid: number, phase: string) => phase === 'launcher' || ++workbenchChecks === 1,
      timeoutMs: 10000,
      pollMs: 20,
      stableMs: 40,
    }),
    /Workbench disappeared after startup/,
  );
});
