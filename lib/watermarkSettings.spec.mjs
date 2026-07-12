import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_WATERMARK_ROTATION,
  DEFAULT_WATERMARK_TEXT_SIZE,
  DEFAULT_WATERMARK_X_POSITION,
  DEFAULT_WATERMARK_Y_POSITION,
  getResetWatermarkYPosition,
  resetWatermarkTransform,
} from './watermarkSettings.ts';

const dimensions = { width: 1200, height: 800 };

test('reset restores the watermark transform without changing user content or image settings', () => {
  const settings = {
    text: 'FOR BANK USE',
    color: '#123456',
    lineWidth: 8,
    textSize: 120,
    rotation: 73,
    xPosition: 900,
    yPosition: 700,
    imageScale: 1.75,
    imageRotation: 0,
  };
  const reset = resetWatermarkTransform(settings, dimensions);

  assert.deepEqual(reset, {
    ...settings,
    textSize: DEFAULT_WATERMARK_TEXT_SIZE,
    rotation: DEFAULT_WATERMARK_ROTATION,
    xPosition: DEFAULT_WATERMARK_X_POSITION,
    yPosition: DEFAULT_WATERMARK_Y_POSITION,
  });
});

test('reset preserves the relative vertical position after a quarter turn', () => {
  const resetY = getResetWatermarkYPosition(dimensions, 90);
  const expectedRatio = (dimensions.width / dimensions.height) ** 2;

  assert.equal(resetY, DEFAULT_WATERMARK_Y_POSITION * expectedRatio);
  assert.equal(getResetWatermarkYPosition(dimensions, 180), DEFAULT_WATERMARK_Y_POSITION);
});
