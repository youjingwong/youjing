import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createIdleWatermarkDragState,
  createIdleWatermarkTransformState,
  endWatermarkTransform,
  getPointInRotatedSpace,
  getWatermarkTouchAngle,
  isPointInWatermarkBounds,
  MAX_WATERMARK_TEXT_SIZE,
  MIN_WATERMARK_TEXT_SIZE,
  moveWatermarkDrag,
  normalizeWatermarkRotation,
  shouldStartWatermarkTransform,
  startWatermarkDrag,
  startWatermarkTransform,
  updateWatermarkTransform,
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
  assert.equal(shouldStartWatermarkTransform(started, 'front', [7, 8]), true);
  assert.equal(shouldStartWatermarkTransform(started, 'back', [7, 8]), false);
  assert.equal(shouldStartWatermarkTransform(started, 'front', [8, 9]), false);
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

test('watermark transform scales and rotates from the same two touches', () => {
  const started = startWatermarkTransform([
    { identifier: 1, x: 0, y: 0 },
    { identifier: 2, x: 100, y: 0 },
  ], 'front', 50, 10);
  const updated = updateWatermarkTransform(started, [
    { identifier: 1, x: 0, y: 0 },
    { identifier: 2, x: 0, y: 200 },
  ], 'front');

  assert.equal(updated.textSize, 100);
  assert.equal(updated.rotation, 100);
});

test('watermark transform tracks identifiers and rebaselines replacements', () => {
  const started = startWatermarkTransform([
    { identifier: 1, x: 0, y: 0 },
    { identifier: 2, x: 100, y: 0 },
  ], 'front', 50, 0);
  const reordered = updateWatermarkTransform(started, [
    { identifier: 2, x: 200, y: 0 },
    { identifier: 1, x: 0, y: 0 },
  ], 'front');
  const replaced = updateWatermarkTransform(reordered.state, [
    { identifier: 2, x: 200, y: 0 },
    { identifier: 3, x: 200, y: 100 },
  ], 'front');

  assert.equal(reordered.textSize, 100);
  assert.equal(reordered.rotation, 0);
  assert.equal(replaced.textSize, null);
  assert.deepEqual(replaced.state.touchIdentifiers, [2, 3]);
  assert.equal(Math.round(replaced.state.currentTextSize), 100);
});

test('watermark transform clamps size and wraps rotation across 180 degrees', () => {
  const started = startWatermarkTransform([
    { identifier: 1, x: 0, y: 0 },
    { identifier: 2, x: 100, y: 0 },
  ], 'front', 150, 170);
  const updated = updateWatermarkTransform(started, [
    { identifier: 1, x: 0, y: 0 },
    { identifier: 2, x: 866, y: 500 },
  ], 'front');

  assert.equal(updated.textSize, MAX_WATERMARK_TEXT_SIZE);
  assert.equal(updated.rotation, -160);
  assert.equal(normalizeWatermarkRotation(181), -179);
  assert.equal(normalizeWatermarkRotation(-181), 179);
  assert.equal(getWatermarkTouchAngle(
    { identifier: 1, x: 0, y: 0 },
    { identifier: 2, x: 0, y: -100 }
  ), -90);
});

test('watermark transform uses the shortest rotation across the angle boundary', () => {
  const degreesToPoint = (degrees) => ({
    x: Math.cos(degrees * Math.PI / 180) * 100,
    y: Math.sin(degrees * Math.PI / 180) * 100,
  });
  const startPoint = degreesToPoint(179);
  const endPoint = degreesToPoint(-179);
  const started = startWatermarkTransform([
    { identifier: 1, x: 0, y: 0 },
    { identifier: 2, ...startPoint },
  ], 'front', 48, 20);
  const updated = updateWatermarkTransform(started, [
    { identifier: 1, x: 0, y: 0 },
    { identifier: 2, ...endPoint },
  ], 'front');

  assert.equal(updated.textSize, 48);
  assert.equal(updated.rotation, 22);
});

test('watermark transform clamps minimum size and sanitizes invalid settings', () => {
  const invalidStart = startWatermarkTransform([
    { identifier: 1, x: 0, y: 0 },
    { identifier: 2, x: 100, y: 0 },
  ], 'front', Number.NaN, Number.NaN);
  const started = startWatermarkTransform([
    { identifier: 1, x: 0, y: 0 },
    { identifier: 2, x: 100, y: 0 },
  ], 'front', 20, 0);
  const updated = updateWatermarkTransform(started, [
    { identifier: 1, x: 0, y: 0 },
    { identifier: 2, x: 1, y: 0 },
  ], 'front');

  assert.equal(invalidStart.currentTextSize, MIN_WATERMARK_TEXT_SIZE);
  assert.equal(invalidStart.currentRotation, 0);
  assert.equal(updated.textSize, MIN_WATERMARK_TEXT_SIZE);
});

test('watermark transform ignores zero-distance finger overlap', () => {
  const started = startWatermarkTransform([
    { identifier: 1, x: 0, y: 0 },
    { identifier: 2, x: 100, y: 0 },
  ], 'front', 50, 20);
  const updated = updateWatermarkTransform(started, [
    { identifier: 1, x: 25, y: 25 },
    { identifier: 2, x: 25, y: 25 },
  ], 'front');

  assert.equal(updated.textSize, null);
  assert.equal(updated.rotation, null);
  assert.equal(updated.state, started);
});

test('watermark transform ignores other sides and ends below two touches', () => {
  const started = startWatermarkTransform([
    { identifier: 1, x: 0, y: 0 },
    { identifier: 2, x: 100, y: 0 },
  ], 'front', MIN_WATERMARK_TEXT_SIZE, 0);
  const otherSide = updateWatermarkTransform(started, [
    { identifier: 1, x: 0, y: 0 },
    { identifier: 2, x: 200, y: 0 },
  ], 'back');
  const ended = endWatermarkTransform(started, [
    { identifier: 1, x: 0, y: 0 },
  ], 'front');

  assert.equal(otherSide.textSize, null);
  assert.equal(otherSide.rotation, null);
  assert.deepEqual(ended, createIdleWatermarkTransformState());
});
