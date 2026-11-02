import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

interface Step {
  name?: string;
  uses?: string;
  run?: string;
  if?: string;
  'continue-on-error'?: boolean;
  with?: Record<string, unknown>;
}
interface Job {
  if?: string;
  steps: Step[];
}
interface Workflow {
  on: Record<string, unknown>;
  jobs: Record<string, Job>;
}

const workflowDir = fileURLToPath(new URL('../../.github/workflows/', import.meta.url));
const workflow = (name: string): Workflow =>
  parse(readFileSync(`${workflowDir}/${name}`, 'utf8'));

test('every checked-in GitHub workflow is manually triggered only', () => {
  const names = readdirSync(workflowDir).filter((name) => /\.ya?ml$/i.test(name));
  assert.ok(names.includes('build.yml') && names.includes('ci.yml'));
  for (const name of names) {
    const config = workflow(name);
    assert.ok(config.on && typeof config.on === 'object', `${name} must declare triggers`);
    assert.deepEqual(Object.keys(config.on), ['workflow_dispatch'], `${name} must have no automatic triggers`);
  }
});

test('release build jobs are restricted to v0.1.0-dev', () => {
  const config = workflow('build.yml');
  assert.ok(Object.keys(config.jobs).length > 0);
  for (const [name, job] of Object.entries(config.jobs)) {
    assert.match(job.if ?? '', /github\.ref\s*==\s*['"]refs\/heads\/v0\.1\.0-dev['"]/, name);
  }
});

test('manual platform builds fail if required artifacts are missing', () => {
  const config = workflow('build.yml');
  for (const name of ['build-engine', 'build-web', 'build-linux', 'build-windows', 'build-macos', 'build-android', 'build-ios']) {
    const job = config.jobs[name];
    assert.ok(job, `missing ${name}`);
    const upload = job.steps.find((step) => step.uses?.startsWith('actions/upload-artifact@'));
    assert.ok(upload, `${name} must upload an artifact`);
    assert.equal(upload.with?.['if-no-files-found'], 'error', `${name} cannot succeed without output`);
    assert.ok(!job.steps.some((step) => /\|\|\s*true/.test(step.run ?? '')), `${name} cannot swallow a missing output`);
  }
  const commands = (jobName: string) => config.jobs[jobName].steps.map((step) => step.run ?? '').join('\n');
  assert.match(commands('build-engine'), /test -s target\/release\/moovn-engine-cli/);
  assert.match(commands('build-linux'), /AppImage/);
  assert.match(commands('build-linux'), /\.deb/);
  assert.match(commands('build-windows'), /Expected both MSI and NSIS/);
  assert.match(commands('build-macos'), /Expected a DMG and exactly one/);
  assert.match(commands('build-ios'), /No iOS app or IPA was produced/);
});

test('Windows release artifacts are gated on installing and opening the actual NSIS package', () => {
  const steps = workflow('build.yml').jobs['build-windows'].steps;
  const smokeIndex = steps.findIndex((step) => /node scripts\/windows-startup-smoke\.mjs/.test(step.run ?? ''));
  const uploadIndex = steps.findIndex((step) => step.uses?.startsWith('actions/upload-artifact@'));
  assert.ok(smokeIndex >= 0 && uploadIndex > smokeIndex, 'startup gate must precede artifact upload');
  assert.notEqual(steps[smokeIndex]['continue-on-error'], true);
  assert.equal(steps[smokeIndex].if, undefined, 'startup gate must not be conditional');
  const paths = String(steps[uploadIndex].with?.path ?? '');
  assert.match(paths, /bundle\/nsis\/\*\.exe/);
  assert.match(paths, /bundle\/msi\/\*\.msi/);
  assert.doesNotMatch(paths, /release\/moovn\.exe/, 'a raw executable is not an installer');
  const qualitySteps = workflow('ci.yml').jobs['windows-tauri'].steps;
  assert.ok(qualitySteps.some((step) => /node scripts\/windows-startup-smoke\.mjs/.test(step.run ?? '')),
    'manual quality checks must be able to exercise a branch installer too');
});

test('manual Web builds also run isolated dependency and production browser regressions', () => {
  const build = workflow('build.yml').jobs['build-web'].steps;
  const quality = workflow('ci.yml').jobs.frontend.steps;
  for (const steps of [build, quality]) {
    assert.ok(steps.some((step) => /npm run test:isolated-build/.test(step.run ?? '')));
    assert.ok(steps.some((step) => /npm run test:web-production:e2e/.test(step.run ?? '')));
  }
});
