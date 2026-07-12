import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createIdleWatermarkDragState,
  getPointInRotatedSpace,
  isPointInWatermarkBounds,
  moveWatermarkDrag,
  startWatermarkDrag,
} from './watermarkHitTest.ts';

const center = { x: 400, y: 300 };

test('only activates the watermark hit area for presses inside its bounds', () => {
  assert.equal(
    isPointInWatermarkBounds(center, center, 0, 400, 120),
    true
  );
  assert.equal(
    isPointInWatermarkBounds({ x: 601, y: 300 }, center, 0, 400, 120),
    false
  );
  assert.equal(
    isPointInWatermarkBounds({ x: 400, y: 361 }, center, 0, 400, 120),
    false
  );
});

test('hit testing follows the watermark rotation', () => {
  const rotatedPoint = getPointInRotatedSpace(
    { x: 400, y: 490 },
    center,
    90
  );

  assert.ok(Math.abs(rotatedPoint.x - 190) < Number.EPSILON * 1000);
  assert.ok(Math.abs(rotatedPoint.y) < Number.EPSILON * 1000);
  assert.equal(
    isPointInWatermarkBounds({ x: 400, y: 490 }, center, 90, 400, 120),
    true
  );
  assert.equal(
    isPointInWatermarkBounds({ x: 400, y: 510 }, center, 90, 400, 120),
    false
  );
});

test('an off-watermark press stays idle through later moves', () => {
  const started = startWatermarkDrag(
    { x: 50, y: 50 },
    center,
    -45,
    500,
    160,
    'front',
    'touch',
    7
  );
  const moved = moveWatermarkDrag(
    started,
    center,
    'front',
    'touch',
    7
  );

  assert.deepEqual(started, createIdleWatermarkDragState());
  assert.equal(moved.delta, null);
});

test('an on-watermark press moves only for its initiating touch', () => {
  const started = startWatermarkDrag(
    center,
    center,
    -45,
    500,
    160,
    'front',
    'touch',
    7
  );
  const moved = moveWatermarkDrag(
    started,
    { x: 425, y: 290 },
    'front',
    'touch',
    7
  );

  assert.equal(started.isDragging, true);
  assert.deepEqual(moved.delta, { x: 25, y: -10 });
});

test('the wrong side, input, or touch identifier cannot consume a drag', () => {
  const started = startWatermarkDrag(
    center,
    center,
    0,
    500,
    160,
    'front',
    'touch',
    7
  );

  assert.equal(
    moveWatermarkDrag(started, { x: 450, y: 300 }, 'back', 'touch', 7).delta,
    null
  );
  assert.equal(
    moveWatermarkDrag(started, { x: 450, y: 300 }, 'front', 'touch', 8).delta,
    null
  );
  assert.equal(
    moveWatermarkDrag(started, { x: 450, y: 300 }, 'front', 'mouse', null).delta,
    null
  );
});

test('an ended drag cannot restart from a later move', () => {
  const moved = moveWatermarkDrag(
    createIdleWatermarkDragState(),
    center,
    'front',
    'touch',
    7
  );

  assert.equal(moved.delta, null);
});
