import test from 'node:test';
import assert from 'node:assert/strict';
import { SAMPLE_PROJECT } from '../src/data/defaultProject.ts';
import { characterPlacementStyle, draggedPlacement, placementGrabOffset, pointerPercent } from '../src/lib/characterPlacement.ts';

const sample = SAMPLE_PROJECT.nodes[0].characters[0];

test('all placement coordinates, scales and flips share a bottom-center anchor', () => {
  for (const y of [0, 5, 69, 70, 71, 88, 92, 100]) {
    for (const scale of [0.5, 1, 2]) {
      for (const flipX of [false, true]) {
        const style = characterPlacementStyle({ ...sample, y, scale, flipX });
        assert.equal(style.top, `${y}%`);
        assert.equal(style.left, `${sample.x}%`);
        assert.equal(style.width, '22%');
        assert.equal(style.height, undefined); // intrinsic aspect ratio determines height
        assert.equal(style.transformOrigin, 'bottom center');
        assert.equal(style.transform, `translate(-50%, -100%) scale(${scale})${flipX ? ' scaleX(-1)' : ''}`);
      }
    }
  }
});

test('dragging preserves the grab offset and can move continuously across the full stage', () => {
  const rect = { left: 100, top: 50, width: 400, height: 225 };
  const grabPoint = pointerPercent(220, 140, rect); // x=30%, y=40%
  const offset = placementGrabOffset({ ...sample, x: 50, y: 70 }, grabPoint);
  assert.deepEqual(draggedPlacement(grabPoint, offset), { x: 50, y: 70 });
  const positions = [];
  for (let y = 5; y <= 100; y++) {
    const pointer = { x: 30, y: y - offset.y };
    positions.push(draggedPlacement(pointer, offset).y);
  }
  assert.deepEqual(positions, Array.from({ length: 96 }, (_, index) => index + 5));
  assert.deepEqual(draggedPlacement({ x: -100, y: 200 }, offset), { x: 0, y: 100 });
});
