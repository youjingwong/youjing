export type CropRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type CropHandle =
  | "move"
  | "north"
  | "north-east"
  | "east"
  | "south-east"
  | "south"
  | "south-west"
  | "west"
  | "north-west";

export const FULL_CROP: CropRect = { x: 0, y: 0, width: 1, height: 1 };
export const MIN_CROP_SIZE = 0.02;
export const ID_CARD_RATIO = 1.586;
export const MIN_OUTPUT_WIDTH = 300;
export const MIN_OUTPUT_HEIGHT = 180;
export const MAX_OUTPUT_PIXELS = 3200 * 3200;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));

export function normalizeCrop(
  crop: CropRect,
  minSize = MIN_CROP_SIZE,
): CropRect {
  const width = clamp(crop.width, minSize, 1);
  const height = clamp(crop.height, minSize, 1);
  return {
    x: clamp(crop.x, 0, 1 - width),
    y: clamp(crop.y, 0, 1 - height),
    width,
    height,
  };
}

export function moveCrop(crop: CropRect, dx: number, dy: number): CropRect {
  return normalizeCrop({ ...crop, x: crop.x + dx, y: crop.y + dy });
}

export function resizeCrop(
  crop: CropRect,
  handle: Exclude<CropHandle, "move">,
  dx: number,
  dy: number,
): CropRect {
  let left = crop.x;
  let top = crop.y;
  let right = crop.x + crop.width;
  let bottom = crop.y + crop.height;

  if (handle.includes("west"))
    left = clamp(left + dx, 0, right - MIN_CROP_SIZE);
  if (handle.includes("east"))
    right = clamp(right + dx, left + MIN_CROP_SIZE, 1);
  if (handle.includes("north"))
    top = clamp(top + dy, 0, bottom - MIN_CROP_SIZE);
  if (handle.includes("south"))
    bottom = clamp(bottom + dy, top + MIN_CROP_SIZE, 1);

  return normalizeCrop({
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  });
}

export function scaleCrop(
  crop: CropRect,
  factor: number,
  anchor = {
    x: crop.x + crop.width / 2,
    y: crop.y + crop.height / 2,
  },
): CropRect {
  const safeFactor = Number.isFinite(factor) && factor > 0 ? factor : 1;
  const minimumFactor = Math.max(
    MIN_CROP_SIZE / crop.width,
    MIN_CROP_SIZE / crop.height,
  );
  const maximumFactor = Math.min(1 / crop.width, 1 / crop.height);
  const appliedFactor = clamp(safeFactor, minimumFactor, maximumFactor);
  const width = crop.width * appliedFactor;
  const height = crop.height * appliedFactor;
  const relativeX = clamp((anchor.x - crop.x) / crop.width, 0, 1);
  const relativeY = clamp((anchor.y - crop.y) / crop.height, 0, 1);

  return normalizeCrop({
    x: anchor.x - relativeX * width,
    y: anchor.y - relativeY * height,
    width,
    height,
  });
}

export function rotateCrop(crop: CropRect, clockwise: boolean): CropRect {
  return normalizeCrop(
    clockwise
      ? {
          x: 1 - crop.y - crop.height,
          y: crop.x,
          width: crop.height,
          height: crop.width,
        }
      : {
          x: crop.y,
          y: 1 - crop.x - crop.width,
          width: crop.height,
          height: crop.width,
        },
  );
}

export function flipCrop(crop: CropRect): CropRect {
  return normalizeCrop({ ...crop, x: 1 - crop.x - crop.width });
}

export function identityCardCrop(
  imageWidth: number,
  imageHeight: number,
  center = { x: 0.5, y: 0.5 },
): CropRect {
  const safeWidth = Math.max(1, imageWidth);
  const safeHeight = Math.max(1, imageHeight);
  const imageRatio = safeWidth / safeHeight;
  const width = imageRatio > ID_CARD_RATIO ? ID_CARD_RATIO / imageRatio : 1;
  const height = imageRatio > ID_CARD_RATIO ? 1 : imageRatio / ID_CARD_RATIO;

  return normalizeCrop({
    x: center.x - width / 2,
    y: center.y - height / 2,
    width,
    height,
  });
}

export function pixelCrop(width: number, height: number, crop: CropRect) {
  const safeWidth = Number.isFinite(width) ? Math.max(1, Math.round(width)) : 1;
  const safeHeight = Number.isFinite(height)
    ? Math.max(1, Math.round(height))
    : 1;
  const normalized = normalizeCrop(crop);
  const x = Math.min(
    safeWidth - 1,
    Math.max(0, Math.round(normalized.x * safeWidth)),
  );
  const y = Math.min(
    safeHeight - 1,
    Math.max(0, Math.round(normalized.y * safeHeight)),
  );

  return {
    x,
    y,
    width: Math.max(
      1,
      Math.min(safeWidth - x, Math.round(normalized.width * safeWidth)),
    ),
    height: Math.max(
      1,
      Math.min(safeHeight - y, Math.round(normalized.height * safeHeight)),
    ),
  };
}

export function cropZoomPercent(crop: CropRect) {
  return Math.round(100 / Math.sqrt(crop.width * crop.height));
}

export function rotationAfterVisualTurn(
  rotation: number,
  clockwise: boolean,
  flipped: boolean,
) {
  const visualDirection = clockwise ? 1 : -1;
  const storedDirection = flipped ? -visualDirection : visualDirection;
  return (((rotation + storedDirection * 90) % 360) + 360) % 360;
}

export function cropOutputIsLargeEnough(
  width: number,
  height: number,
  crop: CropRect,
) {
  const source = pixelCrop(width, height, crop);
  const output = boundedOutputDimensions(source.width, source.height);
  return output.width >= MIN_OUTPUT_WIDTH && output.height >= MIN_OUTPUT_HEIGHT;
}

export function boundedOutputDimensions(width: number, height: number) {
  const safeWidth = Number.isFinite(width) ? Math.max(1, Math.round(width)) : 1;
  const safeHeight = Number.isFinite(height)
    ? Math.max(1, Math.round(height))
    : 1;
  const scale = Math.min(
    1,
    Math.sqrt(MAX_OUTPUT_PIXELS / (safeWidth * safeHeight)),
  );
  return {
    width: Math.max(1, Math.round(safeWidth * scale)),
    height: Math.max(1, Math.round(safeHeight * scale)),
  };
}

export function transformedImageSize(
  width: number,
  height: number,
  rotation: number,
) {
  const quarterTurn = Math.abs(rotation % 180) === 90;
  return quarterTurn
    ? { width: Math.max(1, height), height: Math.max(1, width) }
    : { width: Math.max(1, width), height: Math.max(1, height) };
}
