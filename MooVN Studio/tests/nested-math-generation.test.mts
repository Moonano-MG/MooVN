import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PROJECT } from '../src/data/defaultProject.ts';
import { generateSingleNodeCode } from '../src/lib/nodeCodeCompiler.ts';
import type { LogicOperationConfig, NestedChildNode, SceneNode } from '../src/types.ts';

async function runNode(node: SceneNode, current = 50) {
  const source = generateSingleNodeCode(node, 'javascript');
  const module = await import(`data:text/javascript,${encodeURIComponent(source)}`);
  const run = module[Object.keys(module)[0]] as (ctx: unknown) => Promise<unknown>;
  const vars = { x: current } as Record<string, number>;
  await run({ vars, getVar: (key: string) => vars[key], setVar: (key: string, value: number) => { vars[key] = value; } });
  return vars.x;
}

async function runChild(params: NestedChildNode['params'], current = 50) {
  const node = structuredClone(DEFAULT_PROJECT.nodes[0]);
  node.type = 'repeat_loop';
  node.loopConfig = { repeatCount: 1 };
  node.childrenNodes = [{ id: 'child-math', type: 'math_operation', title: 'math', params }];
  return runNode(node, current);
}

async function runTop(config: LogicOperationConfig, current = 50) {
  const node = structuredClone(DEFAULT_PROJECT.nodes[0]);
  node.type = 'math_operation';
  node.logicConfig = config;
  return runNode(node, current);
}

test('nested clamp is valid JavaScript and uses its explicit bounds', async () => {
  assert.equal(await runChild({ targetVar: 'x', mathOp: 'clamp', operandValue: 1, clampMin: 2, clampMax: 10 }), 10);
  assert.equal(await runChild({ targetVar: 'x', mathOp: 'clamp', operandValue: 1, clampMin: 2, clampMax: 10 }, -4), 2);
});

test('nested unsupported operators and zero divisors fail rather than emitting invalid or infinite math', async () => {
  await assert.rejects(runChild({ targetVar: 'x', mathOp: 'not_an_operator', operandValue: 1 }), /ERR_MATH/);
  await assert.rejects(runChild({ targetVar: 'x', mathOp: '/=', operandValue: 0 }), /ERR_MATH/);
  await assert.rejects(runChild({ targetVar: 'x', mathOp: 'random', operandValue: 0 }), /ERR_MATH/);
  await assert.rejects(runChild({ targetVar: 'x', mathOp: 'clamp', operandValue: 1, clampMin: 11, clampMax: 10 }), /ERR_MATH/);
});

test('top-level and nested JS use identical math for each non-random operation', async () => {
  const cases = [
    { mathOp: '+=' as const, value: 52 }, { mathOp: '-=' as const, value: 48 },
    { mathOp: '*=' as const, value: 100 }, { mathOp: '/=' as const, value: 25 },
    { mathOp: '%=' as const, value: 0 }, { mathOp: '=' as const, value: 2 },
    { mathOp: 'clamp' as const, value: 10 },
  ];
  for (const item of cases) {
    const config = { targetVar: 'x', mathOp: item.mathOp, operandValue: 2, clampMin: 1, clampMax: 10 };
    assert.equal(await runTop(config), item.value, `top ${item.mathOp}`);
    assert.equal(await runChild(config), item.value, `nested ${item.mathOp}`);
  }
});
