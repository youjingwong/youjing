import type { ImageDimensions } from './imageRotation';

export const DEFAULT_WATERMARK_TEXT_SIZE = 48;
export const DEFAULT_WATERMARK_ROTATION = -45;
export const DEFAULT_WATERMARK_X_POSITION = 400;
export const DEFAULT_WATERMARK_Y_POSITION = 300;

export interface WatermarkTransformSettings {
  textSize: number;
  rotation: number;
  xPosition: number;
  yPosition: number;
  imageRotation: number;
}

export const getResetWatermarkYPosition = (
  dimensions: ImageDimensions,
  imageRotation: number
) => {
  const normalizedRotation = ((imageRotation % 360) + 360) % 360;
  const isQuarterTurn = normalizedRotation % 180 !== 0;
  const defaultAspectRatio = dimensions.height / dimensions.width;
  const rotatedAspectRatio = isQuarterTurn
    ? dimensions.width / dimensions.height
    : defaultAspectRatio;

  return DEFAULT_WATERMARK_Y_POSITION *
    (rotatedAspectRatio / defaultAspectRatio);
};

export const resetWatermarkTransform = <T extends WatermarkTransformSettings>(
  settings: T,
  dimensions: ImageDimensions
): T => ({
  ...settings,
  textSize: DEFAULT_WATERMARK_TEXT_SIZE,
  rotation: DEFAULT_WATERMARK_ROTATION,
  xPosition: DEFAULT_WATERMARK_X_POSITION,
  yPosition: getResetWatermarkYPosition(dimensions, settings.imageRotation),
});
