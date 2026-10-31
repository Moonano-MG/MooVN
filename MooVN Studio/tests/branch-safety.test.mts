import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { DEFAULT_PROJECT } from '../src/data/defaultProject.ts';
import { isUnsupportedNode } from '../src/data/nodeRegistry.ts';
import { checkProjectGraph, generateFullProjectCode, generateSingleNodeCode } from '../src/lib/nodeCodeCompiler.ts';
import { parseMpvnProject, serializeMpvnProject } from '../src/lib/mpvnFormat.ts';
import { validateStandaloneHtmlProject } from '../src/lib/htmlExportValidation.ts';
import type { SceneNode, VNProject } from '../src/types.ts';

function fixture(type: SceneNode['type'], conditionExpr?: string): VNProject {
  const project = structuredClone(DEFAULT_PROJECT);
  const node = project.nodes[0];
  node.type = type;
  node.choices = [{ id: 'choice-conditional', text: '条件选项', targetNodeId: 'target', conditionExpr }];
  const target = structuredClone(DEFAULT_PROJECT.nodes[0]);
  target.id = 'target';
  target.dialogues[0].id = 'target-line';
  project.nodes.push(target);
  return project;
}

async function generatedFunction(node: SceneNode, lang: 'javascript' | 'typescript' = 'javascript') {
  const source = generateSingleNodeCode(node, lang);
  const transpiled = lang === 'typescript' ? ts.transpileModule(source, {
    reportDiagnostics: true, compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext },
  }) : null;
  assert.equal(transpiled?.diagnostics?.length ?? 0, 0, 'generated TypeScript must be syntactically valid');
  const module = await import(`data:text/javascript,${encodeURIComponent(transpiled?.outputText || source)}`);
  return module[Object.keys(module)[0]] as (ctx: unknown) => Promise<unknown>;
}

test('unimplemented random branches are rejected rather than emitted as generic effects', async () => {
  const project = fixture('random_branch');
  assert.equal(isUnsupportedNode('random_branch'), true);
  const report = checkProjectGraph(project);
  assert.equal(report.ok, false, 'the graph must not report unsupported random branching as ready');
  assert(report.diagnostics.some((d) => d.nodeId === project.nodes[0].id && d.severity === 'error' && /随机分支/.test(d.message)));
  assert(validateStandaloneHtmlProject(project).length > 0);
  for (const lang of ['javascript', 'typescript'] as const) {
    const run = await generatedFunction(project.nodes[0], lang);
    let effectCalled = false;
    await assert.rejects(run({ executeNodeEffect: () => { effectCalled = true; } }), /ERR_RANDOM_BRANCH_UNSUPPORTED/);
    assert.equal(effectCalled, false);
  }
  const parsed = parseMpvnProject(serializeMpvnProject(project));
  assert.equal(parsed.ok, true);
  assert.equal(parsed.project?.nodes[0].type, 'random_branch', 'old projects remain readable without dropping the node');
  assert.equal(parsed.project?.nodes[0].choices[0].targetNodeId, 'target');
});

test('unimplemented switch routing is rejected instead of emitting a generic effect', async () => {
  const project = fixture('switch_branch');
  assert.equal(isUnsupportedNode('switch_branch'), true);
  for (const lang of ['javascript', 'typescript'] as const) {
    const run = await generatedFunction(project.nodes[0], lang);
    let called = false;
    await assert.rejects(run({ executeNodeEffect: () => { called = true; } }), /ERR_SWITCH_BRANCH_UNSUPPORTED/);
    assert.equal(called, false);
  }
  assert(checkProjectGraph(project).diagnostics.some((diagnostic) =>
    diagnostic.severity === 'error' && diagnostic.message.includes('ERR_SWITCH_BRANCH_UNSUPPORTED')));
  assert(validateStandaloneHtmlProject(project).some((issue) => issue.message.includes('switch_branch')));
  project.nodes[0].choices[0].conditionExpr = 'true';
  const messages = checkProjectGraph(project).diagnostics.map((diagnostic) => diagnostic.message);
  assert(messages.some((message) => message.includes('ERR_SWITCH_BRANCH_UNSUPPORTED')));
  assert(messages.some((message) => message.includes('ERR_CHOICE_CONDITION_UNSUPPORTED')));
  const parsed = parseMpvnProject(serializeMpvnProject(project));
  assert.equal(parsed.ok, true);
  assert.equal(parsed.project?.nodes[0].type, 'switch_branch');
  assert.equal(parsed.project?.nodes[0].choices[0].conditionExpr, 'true');
});

test('unimplemented choice conditions fail closed in generated JS and graph diagnostics', async () => {
  for (const [type, expression] of [
    ['choice', 'chapterIndex > 5'], ['choice', 'true'], ['choice', 'false'],
    ['choice', 'invalid ??? expression'], ['timed_choice', 'false'],
    ['dialogue', 'legacy_condition'],
  ] as const) {
    const project = fixture(type, expression);
    const report = checkProjectGraph(project);
    assert.equal(report.ok, false, `${type} should not pass a graph check`);
    assert(report.diagnostics.some((d) => d.nodeId === project.nodes[0].id && d.severity === 'error' && /条件/.test(d.message)));
    assert(validateStandaloneHtmlProject(project).some((issue) => issue.message.includes('条件表达式')));
    for (const lang of ['javascript', 'typescript'] as const) {
      const run = await generatedFunction(project.nodes[0], lang);
      let called = false;
      const ctx = {
        promptChoices: () => { called = true; return 'target'; },
        promptTimedChoices: () => { called = true; return 'target'; },
        executeNodeEffect: () => { called = true; },
      };
      await assert.rejects(run(ctx), /ERR_CHOICE_CONDITION_UNSUPPORTED/);
      assert.equal(called, false, `${type} must not use a route that ignores the condition`);
    }
    const parsed = parseMpvnProject(serializeMpvnProject(project));
    assert.equal(parsed.ok, true);
    assert.equal(parsed.project?.nodes[0].choices[0].conditionExpr, expression);
  }
});

test('graph diagnostics list every unsupported condition and retain their choice IDs', () => {
  const project = fixture('choice', 'false');
  project.nodes[0].choices.push({ id: 'another-choice', text: '另一个', targetNodeId: 'target', conditionExpr: 'true' });
  const errors = checkProjectGraph(project).diagnostics.filter((diagnostic) => diagnostic.code === 'MVN106');
  assert.equal(errors.length, 2);
  assert(errors.some((diagnostic) => diagnostic.message.includes('choice-conditional')));
  assert(errors.some((diagnostic) => diagnostic.message.includes('another-choice')));
});

test('unconditional choice code still invokes the choice handler', async () => {
  for (const conditionExpr of [undefined, '', '  ']) {
    const project = fixture('choice', conditionExpr);
    const report = checkProjectGraph(project);
    assert(!report.diagnostics.some((d) => /条件表达式尚未支持/.test(d.message)));
    const run = await generatedFunction(project.nodes[0]);
    let prompted = false;
    const target = await run({ promptChoices: async () => { prompted = true; return 'target'; } });
    assert.equal(target, 'target');
    assert.equal(prompted, true);
  }
});

test('a nested random branch does not compile to a successful generic execStep', async () => {
  const project = fixture('repeat_loop');
  project.nodes[0].choices = [];
  project.nodes[0].loopConfig = { repeatCount: 1 };
  project.nodes[0].childrenNodes = [
    { id: 'nested-speech', type: 'dialogue', title: '前置对白', params: { text: 'must not execute' } },
    { id: 'nested-if', type: 'if_else_container', title: '嵌套条件', params: { conditionExpr: 'true' },
      childrenNodes: [], elseChildrenNodes: [{ id: 'nested-random', type: 'random_branch', title: '嵌套随机分支', params: {} }] },
  ];
  for (const lang of ['javascript', 'typescript'] as const) {
    const run = await generatedFunction(project.nodes[0], lang);
    let called = false;
    await assert.rejects(run({ say: () => { called = true; }, execStep: () => { called = true; } }), /ERR_RANDOM_BRANCH_UNSUPPORTED/);
    assert.equal(called, false);
  }
  const report = checkProjectGraph(project);
  assert(report.diagnostics.some((d) => d.severity === 'error' && d.nodeId === project.nodes[0].id && /nested-random/.test(d.message)));
});

test('nested switch routing stops before any preceding effects', async () => {
  const project = fixture('repeat_loop');
  project.nodes[0].choices = [];
  project.nodes[0].loopConfig = { repeatCount: 1 };
  project.nodes[0].childrenNodes = [
    { id: 'nested-speech', type: 'dialogue', title: '前置对白', params: { text: 'must not execute' } },
    { id: 'nested-if', type: 'if_else_container', title: '嵌套条件', params: { conditionExpr: 'true' },
      childrenNodes: [], elseChildrenNodes: [{ id: 'nested-switch', type: 'switch_branch', title: '嵌套路由', params: {} }] },
  ];
  for (const lang of ['javascript', 'typescript'] as const) {
    const run = await generatedFunction(project.nodes[0], lang);
    let called = false;
    await assert.rejects(run({ say: () => { called = true; }, execStep: () => { called = true; } }), /ERR_SWITCH_BRANCH_UNSUPPORTED/);
    assert.equal(called, false);
  }
  assert(checkProjectGraph(project).diagnostics.some((d) => d.severity === 'error' && d.message.includes('nested-switch')));
});

test('an imported node title cannot inject code before the unsupported-branch error', async () => {
  for (const separator of ['\n', '\r', '\u2028', '\u2029']) {
    for (const lang of ['javascript', 'typescript'] as const) {
      const project = fixture('random_branch');
      project.nodes[0].title = `Branch${separator}globalThis.__moovnBranchTitleExecuted = true; //`;
      delete (globalThis as { __moovnBranchTitleExecuted?: boolean }).__moovnBranchTitleExecuted;
      const run = await generatedFunction(project.nodes[0], lang);
      assert.equal((globalThis as { __moovnBranchTitleExecuted?: boolean }).__moovnBranchTitleExecuted, undefined);
      await assert.rejects(run({}), /ERR_RANDOM_BRANCH_UNSUPPORTED/);
    }
  }
});

test('nested titles remain comments when custom code is generated', async () => {
  const project = fixture('repeat_loop');
  project.nodes[0].choices = [];
  project.nodes[0].loopConfig = { repeatCount: 1 };
  project.nodes[0].childrenNodes = [{
    id: 'child', type: 'dialogue', title: 'Child\nglobalThis.__moovnChildTitleExecuted = true; //',
    params: {}, customCode: 'void 0;',
  }];
  for (const lang of ['javascript', 'typescript'] as const) {
    delete (globalThis as { __moovnChildTitleExecuted?: boolean }).__moovnChildTitleExecuted;
    const run = await generatedFunction(project.nodes[0], lang);
    await run({});
    assert.equal((globalThis as { __moovnChildTitleExecuted?: boolean }).__moovnChildTitleExecuted, undefined);
  }
});

test('full-project headers cannot execute code before unsupported nodes stop', async () => {
  for (const field of ['title', 'version'] as const) {
    for (const lang of ['javascript', 'typescript'] as const) {
      const project = fixture('random_branch');
      project[field] = '*/\nglobalThis.__moovnHeaderExecuted = true;\n/*';
      delete (globalThis as { __moovnHeaderExecuted?: boolean }).__moovnHeaderExecuted;
      const source = generateFullProjectCode(project, lang);
      const transpiled = lang === 'typescript' ? ts.transpileModule(source, {
        reportDiagnostics: true, compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext },
      }) : null;
      assert.equal(transpiled?.diagnostics?.length ?? 0, 0);
      const module = await import(`data:text/javascript,${encodeURIComponent(transpiled?.outputText || source)}`);
      assert.equal((globalThis as { __moovnHeaderExecuted?: boolean }).__moovnHeaderExecuted, undefined);
      await assert.rejects(module.node_scene_start_01({}), /ERR_RANDOM_BRANCH_UNSUPPORTED/);
    }
  }
});
