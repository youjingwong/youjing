export interface ImageDimensions {
  width: number;
  height: number;
}

export type RotationDirection = 'left' | 'right';

export const OUTPUT_CANVAS_WIDTH = 1500;

export const normalizeRotation = (rotation: number) =>
  ((rotation % 360) + 360) % 360;

export const getRotatedImageDimensions = (
  dimensions: ImageDimensions,
  rotation: number
) => {
  const isQuarterTurn = normalizeRotation(rotation) % 180 !== 0;

  return isQuarterTurn
    ? { width: dimensions.height, height: dimensions.width }
    : dimensions;
};

export const getOutputCanvasHeight = (
  dimensions: ImageDimensions,
  rotation: number
) => {
  const rotatedDimensions = getRotatedImageDimensions(dimensions, rotation);
  return OUTPUT_CANVAS_WIDTH * (rotatedDimensions.height / rotatedDimensions.width);
};

export const getNextImageRotationState = (
  dimensions: ImageDimensions,
  currentRotation: number,
  currentYPosition: number,
  direction: RotationDirection
) => {
  const rotationDelta = direction === 'left' ? -90 : 90;
  const imageRotation = normalizeRotation(currentRotation + rotationDelta);
  const currentCanvasHeight = getOutputCanvasHeight(dimensions, currentRotation);
  const nextCanvasHeight = getOutputCanvasHeight(dimensions, imageRotation);

  return {
    imageRotation,
    yPosition: currentYPosition * (nextCanvasHeight / currentCanvasHeight),
  };
};
