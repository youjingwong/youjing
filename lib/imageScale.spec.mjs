import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_IMAGE_SCALE,
  MAX_IMAGE_SCALE,
  MIN_IMAGE_SCALE,
  clampImageScale,
  createIdlePinchGestureState,
  endPinchGesture,
  getDistanceBetweenPoints,
  getPinchImageScale,
  startPinchGesture,
  updatePinchGesture,
} from './imageScale.ts';

test('calculates the distance between two touches', () => {
  assert.equal(
    getDistanceBetweenPoints({ x: 0, y: 0 }, { x: 3, y: 4 }),
    5
  );
});

test('pinch distance zooms the image in and out proportionally', () => {
  assert.equal(getPinchImageScale(1, 100, 200), 2);
  assert.equal(getPinchImageScale(1, 100, 50), 0.5);
  assert.equal(getPinchImageScale(1.5, 100, 100), 1.5);
});

test('pinch zoom stays within the supported scale range', () => {
  assert.equal(getPinchImageScale(2, 100, 1000), MAX_IMAGE_SCALE);
  assert.equal(getPinchImageScale(1, 100, 1), MIN_IMAGE_SCALE);
  assert.equal(clampImageScale(10), MAX_IMAGE_SCALE);
  assert.equal(clampImageScale(0.1), MIN_IMAGE_SCALE);
});

test('invalid pinch measurements keep a safe scale', () => {
  assert.equal(getPinchImageScale(1.5, 0, 200), 1.5);
  assert.equal(getPinchImageScale(1.5, Number.NaN, 200), 1.5);
  assert.equal(getPinchImageScale(Number.NaN, 100, 200), DEFAULT_IMAGE_SCALE);
});

test('pinch state tracks fingers by identifier instead of array order', () => {
  const started = startPinchGesture([
    { identifier: 1, x: 0, y: 0 },
    { identifier: 2, x: 100, y: 0 },
  ], 'front', 1);
  const updated = updatePinchGesture(started, [
    { identifier: 2, x: 200, y: 0 },
    { identifier: 1, x: 0, y: 0 },
  ], 'front');

  assert.equal(updated.imageScale, 2);
  assert.equal(updated.state.currentScale, 2);
});

test('pinch state rebaselines when a tracked finger is replaced', () => {
  const started = startPinchGesture([
    { identifier: 1, x: 0, y: 0 },
    { identifier: 2, x: 100, y: 0 },
  ], 'front', 1.5);
  const updated = updatePinchGesture(started, [
    { identifier: 2, x: 100, y: 0 },
    { identifier: 3, x: 250, y: 0 },
  ], 'front');

  assert.equal(updated.imageScale, null);
  assert.deepEqual(updated.state.touchIdentifiers, [2, 3]);
  assert.equal(updated.state.startScale, 1.5);
  assert.equal(updated.state.startDistance, 150);
});

test('pinch state ignores the other image side and ends below two touches', () => {
  const started = startPinchGesture([
    { identifier: 1, x: 0, y: 0 },
    { identifier: 2, x: 100, y: 0 },
  ], 'front', 1);
  const otherSide = updatePinchGesture(started, [
    { identifier: 1, x: 0, y: 0 },
    { identifier: 2, x: 200, y: 0 },
  ], 'back');
  const ended = endPinchGesture(started, [
    { identifier: 1, x: 0, y: 0 },
  ], 'front');

  assert.equal(otherSide.imageScale, null);
  assert.equal(otherSide.state, started);
  assert.deepEqual(ended, createIdlePinchGestureState());
});
