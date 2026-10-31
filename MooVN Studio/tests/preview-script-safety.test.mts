import test from 'node:test';
import assert from 'node:assert/strict';
import type { NestedChildNode, SceneNode, ScriptLanguage, VNProject } from '../src/types.ts';
import { DEFAULT_PROJECT } from '../src/data/defaultProject.ts';
import { getUnsupportedPreviewIssue } from '../src/lib/previewSupport.ts';
import { backPreview, createPreviewPlayback, enterPreviewNode } from '../src/lib/previewState.ts';
import { validateStandaloneHtmlProject } from '../src/lib/htmlExportValidation.ts';
import { buildStandaloneGameHtml } from '../src/lib/gamePackager.ts';

function node(source: string | undefined = undefined, language: ScriptLanguage = 'typescript'): SceneNode {
  const result = structuredClone(DEFAULT_PROJECT.nodes[0]);
  result.type = 'script';
  result.customScript = source;
  result.scriptLanguage = language;
  return result;
}

test('preview only lets empty scripts and complete comments through, without interpreting their text', () => {
  const examples: Array<[string | undefined, ScriptLanguage]> = [
    [undefined, 'typescript'], ['', 'javascript'], [' \n\t\r\f\v', 'typescript'],
    ['// moovn.save:create("fake")', 'javascript'],
    ['/* moovn::save::create("fake") */\n// other', 'cpp'],
    ['// C#\r\n/* Moovn.Save.Create("fake") */', 'csharp'],
    ['// JS\u2028// another comment', 'javascript'],
    ['// JS U+0085 stays in the comment\u0085moovn.save.create("fake")', 'javascript'],
    ['// C#\u0085// another comment', 'csharp'],
    ['/* outer /* nested moovn::save::create("fake") */ still comment */', 'rust'],
  ];
  for (const [source, language] of examples) {
    const candidate = node(source, language);
    const before = structuredClone(candidate);
    assert.equal(getUnsupportedPreviewIssue(candidate), null, `${language}: ${source}`);
    assert.deepEqual(candidate, before, 'capability check must not alter the original script');
  }
});

test('host statements, strings, valid APIs and malformed comments all fail closed', () => {
  const examples: Array<[string, ScriptLanguage]> = [
    ['moovn.save.create("Auto_Slot");', 'typescript'],
    ['moovn.text.say("旁白", "line");\nmoovn.save.create("A");', 'javascript'],
    ['Moovn.Save.Create("A");', 'csharp'],
    ['moovn::save::create("A");', 'rust'],
    ['const s = "moovn::save::create(fake)";', 'javascript'],
    ['"moovn.save:create(fake)";', 'javascript'],
    ['if (false) moovn::save::create("A");', 'cpp'],
    ['moovn.save.create("A"); // trailing comment', 'typescript'],
    ['/* valid */ moovn.save.create("A");', 'typescript'],
    ['/* not closed moovn.save:create("A")', 'javascript'],
    ['/* /* */ moovn.save.create("A"); */', 'javascript'],
    ['// comment\u2028moovn.save.create("A");', 'javascript'],
    ['// comment\u2029moovn.save.create("A");', 'typescript'],
    ['// comment\u0085Moovn.Save.Create("A");', 'csharp'],
    ['# unsupported directive', 'cpp'],
    ['`moovn.save:create(fake)`', 'typescript'],
    ['moovn.not_supported.anything()', 'typescript'],
  ];
  for (const [source, language] of examples) {
    const issue = getUnsupportedPreviewIssue(node(source, language));
    assert.equal(issue?.code, 'ERR_PREVIEW_SCRIPT_UNSUPPORTED', `${language}: ${source}`);
    assert.match(issue.message, /不执行.*moovn\.save\.create/);
  }
});

test('functions, nested code and visual bridge scripts are blocked without changing project data', () => {
  const call = node();
  call.type = 'function_call';
  assert.equal(getUnsupportedPreviewIssue(call)?.code, 'ERR_PREVIEW_SCRIPT_UNSUPPORTED');

  const container = node('// harmless comment');
  container.type = 'repeat_loop';
  container.elseChildrenNodes = [{
    id: 'outer', type: 'if_else_container', title: 'Outer', params: {},
    childrenNodes: [{ id: 'inner', type: 'dialogue', title: 'Inner', params: {}, customCode: 'moovn.save.create("x")' }],
  }];
  const before = structuredClone(container);
  assert.match(getUnsupportedPreviewIssue(container)?.message || '', /inner/);
  assert.deepEqual(container, before);

  container.elseChildrenNodes![0].childrenNodes![0].customCode = '/* only comments */';
  assert.equal(getUnsupportedPreviewIssue(container), null);
  container.elseChildrenNodes![0].childrenNodes![0].type = 'function_call';
  assert.match(getUnsupportedPreviewIssue(container)?.message || '', /inner/);
  container.elseChildrenNodes![0].childrenNodes![0].type = 'script';
  container.elseChildrenNodes![0].childrenNodes![0].customCode = undefined;
  assert.match(getUnsupportedPreviewIssue(container)?.message || '', /inner/, 'empty nested script action is not silently skipped');
  container.elseChildrenNodes![0].childrenNodes![0].type = 'dialogue';
  container.scriptLanguage = 'rust';
  container.elseChildrenNodes![0].childrenNodes![0].customCode = '/* outer /* inner */ moovn.save.create("x"); */';
  assert.match(getUnsupportedPreviewIssue(container)?.message || '', /inner/, 'nested customCode is emitted as JS/TS, not Rust');

  const visual = node();
  visual.visualBlocks = [{ id: 'bridge-id', category: 'script', kind: 'call_bridge_script', params: {} }];
  assert.match(getUnsupportedPreviewIssue(visual)?.message || '', /bridge-id/);
  // Defensive traversal must also terminate for an in-memory cycle.
  const cycle: NestedChildNode = { id: 'cycle', type: 'repeat_loop', title: 'Cycle', params: {}, childrenNodes: [] };
  cycle.childrenNodes!.push(cycle);
  const cyclicNode = node();
  cyclicNode.childrenNodes = [cycle];
  assert.equal(getUnsupportedPreviewIssue(cyclicNode), null);
});

test('script guard stops entry mutations and timers while preserving earlier state and history', () => {
  const project: VNProject = structuredClone(DEFAULT_PROJECT);
  const root = project.nodes[0];
  root.id = 'root';
  root.type = 'set_variable';
  root.variableKey = 'chapterIndex';
  root.variableValue = 7;
  const blocked = structuredClone(root);
  blocked.id = 'blocked';
  blocked.type = 'math_operation';
  blocked.customScript = 'moovn.save.create("Auto_Slot");';
  blocked.logicConfig = { targetVar: 'chapterIndex', mathOp: '+=', operandValue: 100 };
  blocked.unlockedClueTitle = 'must-not-unlock';
  project.nodes = [root, blocked];
  project.startNodeId = root.id;
  const before = structuredClone(project);

  const initial = createPreviewPlayback(project, root.id);
  const entered = enterPreviewNode(initial, project, blocked.id);
  assert.equal(initial.current.variablesMap.chapterIndex, 7);
  assert.equal(entered.current.variablesMap.chapterIndex, 7);
  assert.deepEqual(entered.current.clues, []);
  assert.deepEqual(backPreview(entered).current, initial.current);
  assert.deepEqual(project, before);

  blocked.type = 'timed_choice';
  blocked.timedChoiceSeconds = 1;
  const timed = enterPreviewNode(initial, project, blocked.id);
  assert.equal(timed.current.timedRemaining, null);

  blocked.type = 'game_settings_modify';
  blocked.settingsActionConfig = { textSpeedMs: 12 };
  const settings = enterPreviewNode(initial, project, blocked.id);
  assert.equal(settings.current.textSpeedMs, initial.current.textSpeedMs);
});

test('existing unsupported-branch precedence is preserved; HTML exporter still rejects scripts', () => {
  const project = structuredClone(DEFAULT_PROJECT);
  const candidate = project.nodes[0];
  candidate.type = 'random_branch';
  candidate.customScript = 'moovn.save.create("A");';
  assert.equal(getUnsupportedPreviewIssue(candidate)?.code, 'ERR_RANDOM_BRANCH_UNSUPPORTED');
  candidate.type = 'dialogue';
  assert(validateStandaloneHtmlProject(project).some((issue) => issue.message.includes('自定义脚本')));
  assert.throws(() => buildStandaloneGameHtml(project), /HTML 导出已阻止/);
  candidate.customScript = '// moovn.save:create("A")';
  assert(validateStandaloneHtmlProject(project).some((issue) => issue.message.includes('自定义脚本')),
    'HTML remains stricter than the preview comment-only exception');
  assert.throws(() => buildStandaloneGameHtml(project), /HTML 导出已阻止/);
});
