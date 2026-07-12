import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getNextImageRotationState,
  getOutputCanvasHeight,
  normalizeRotation,
} from './imageRotation.ts';

const landscapeImage = { width: 400, height: 200 };

const assertNear = (actual, expected) => {
  assert.ok(
    Math.abs(actual - expected) < Number.EPSILON * 10,
    `Expected ${actual} to be near ${expected}`
  );
};

test('normalizes rotations to the 0–359 degree range', () => {
  assert.equal(normalizeRotation(-90), 270);
  assert.equal(normalizeRotation(360), 0);
  assert.equal(normalizeRotation(450), 90);
});

test('rotate right completes a clockwise four-step cycle', () => {
  let state = { imageRotation: 0, yPosition: 300 };

  for (const expectedRotation of [90, 180, 270, 0]) {
    state = getNextImageRotationState(
      landscapeImage,
      state.imageRotation,
      state.yPosition,
      'right'
    );
    assert.equal(state.imageRotation, expectedRotation);
  }

  assertNear(state.yPosition, 300);
});

test('rotate left completes a counterclockwise four-step cycle', () => {
  let state = { imageRotation: 0, yPosition: 300 };

  for (const expectedRotation of [270, 180, 90, 0]) {
    state = getNextImageRotationState(
      landscapeImage,
      state.imageRotation,
      state.yPosition,
      'left'
    );
    assert.equal(state.imageRotation, expectedRotation);
  }

  assertNear(state.yPosition, 300);
});

test('left and right are inverse operations', () => {
  const left = getNextImageRotationState(landscapeImage, 0, 300, 'left');
  const restored = getNextImageRotationState(
    landscapeImage,
    left.imageRotation,
    left.yPosition,
    'right'
  );

  assert.deepEqual(restored, { imageRotation: 0, yPosition: 300 });
});

test('quarter turns swap canvas orientation and preserve relative watermark position', () => {
  const originalHeight = getOutputCanvasHeight(landscapeImage, 0);
  const rotated = getNextImageRotationState(landscapeImage, 0, 300, 'left');
  const rotatedHeight = getOutputCanvasHeight(landscapeImage, rotated.imageRotation);

  assert.equal(originalHeight, 750);
  assert.equal(rotatedHeight, 3000);
  assertNear(300 / originalHeight, rotated.yPosition / rotatedHeight);
});
