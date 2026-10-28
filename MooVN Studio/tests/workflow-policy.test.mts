import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

interface Step {
  name?: string;
  run?: string;
  if?: string;
}
interface Job {
  if?: string;
  steps?: Step[];
}
interface Workflow {
  on: Record<string, unknown>;
  jobs: Record<string, Job>;
}

const workflow = (name: string): Workflow =>
  parse(readFileSync(fileURLToPath(new URL(`../../.github/workflows/${name}.yml`, import.meta.url)), 'utf8'));
const manualOnly = (condition?: string): boolean => {
  if (typeof condition !== 'string') return false;
  const expression = condition.replace(/\s/g, '').replace(/"/g, "'");
  return expression === "${{github.event_name=='workflow_dispatch'}}" ||
    expression === "${{always()&&github.event_name=='workflow_dispatch'}}";
};

test('release build is manual-only and every job is restricted to v0.1.0-dev', () => {
  const config = workflow('build');
  assert.deepEqual(Object.keys(config.on), ['workflow_dispatch']);
  assert.ok(Object.keys(config.jobs).length > 0);
  for (const [name, job] of Object.entries(config.jobs)) {
    assert.match(job.if ?? '', /github\.ref\s*==\s*['"]refs\/heads\/v0\.1\.0-dev['"]/, name);
  }
});

test('push/PR quality checks cannot run compiler, build or native/browser test commands', () => {
  const config = workflow('ci');
  assert.ok('push' in config.on && 'pull_request' in config.on && 'workflow_dispatch' in config.on);
  const frontend = config.jobs.frontend;
  assert.ok(frontend?.steps);
  const autoCommands = frontend.steps
    .filter((step) => step.run && !manualOnly(step.if))
    .map((step) => step.run?.trim());
  assert.deepEqual(autoCommands, ['npm ci', 'npm ci', 'npm test', 'npm test']);
  for (const [name, job] of Object.entries(config.jobs)) {
    if (name !== 'frontend') assert.ok(manualOnly(job.if), `${name} must only run on workflow_dispatch`);
  }
  const manualSteps = frontend.steps.filter((step) => step.name?.includes('(manual)'));
  assert.ok(manualSteps.length >= 5);
  for (const step of manualSteps) assert.ok(manualOnly(step.if), `${step.name} must be manual-only`);
});
