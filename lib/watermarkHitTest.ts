export interface WatermarkPoint {
  x: number;
  y: number;
}

export const getPointInRotatedSpace = (
  point: WatermarkPoint,
  center: WatermarkPoint,
  rotation: number
) => {
  const angle = (-rotation * Math.PI) / 180;
  const dx = point.x - center.x;
  const dy = point.y - center.y;

  return {
    x: dx * Math.cos(angle) - dy * Math.sin(angle),
    y: dx * Math.sin(angle) + dy * Math.cos(angle),
  };
};

export const isPointInWatermarkBounds = (
  point: WatermarkPoint,
  center: WatermarkPoint,
  rotation: number,
  width: number,
  height: number
) => {
  const rotatedPoint = getPointInRotatedSpace(point, center, rotation);

  return (
    rotatedPoint.x >= -width / 2 &&
    rotatedPoint.x <= width / 2 &&
    rotatedPoint.y >= -height / 2 &&
    rotatedPoint.y <= height / 2
  );
};

export type WatermarkDragSide = 'front' | 'back';
export type WatermarkDragInput = 'mouse' | 'touch';

export interface WatermarkDragState {
  isDragging: boolean;
  side: WatermarkDragSide | null;
  input: WatermarkDragInput | null;
  touchIdentifier: number | null;
  lastPoint: WatermarkPoint;
}

export const createIdleWatermarkDragState = (): WatermarkDragState => ({
  isDragging: false,
  side: null,
  input: null,
  touchIdentifier: null,
  lastPoint: { x: 0, y: 0 },
});

export const startWatermarkDrag = (
  point: WatermarkPoint,
  center: WatermarkPoint,
  rotation: number,
  width: number,
  height: number,
  side: WatermarkDragSide,
  input: WatermarkDragInput,
  touchIdentifier: number | null
) => {
  const hasValidTouch = input === 'mouse' || touchIdentifier !== null;
  const isInsideWatermark = isPointInWatermarkBounds(
    point,
    center,
    rotation,
    width,
    height
  );

  if (!hasValidTouch || !isInsideWatermark) {
    return createIdleWatermarkDragState();
  }

  return {
    isDragging: true,
    side,
    input,
    touchIdentifier,
    lastPoint: point,
  } satisfies WatermarkDragState;
};

export const moveWatermarkDrag = (
  state: WatermarkDragState,
  point: WatermarkPoint,
  side: WatermarkDragSide,
  input: WatermarkDragInput,
  touchIdentifier: number | null
): {
  state: WatermarkDragState;
  delta: WatermarkPoint | null;
} => {
  const ownsDrag =
    state.isDragging &&
    state.side === side &&
    state.input === input &&
    (input === 'mouse' || state.touchIdentifier === touchIdentifier);

  if (!ownsDrag) return { state, delta: null };

  return {
    state: { ...state, lastPoint: point },
    delta: {
      x: point.x - state.lastPoint.x,
      y: point.y - state.lastPoint.y,
    },
  };
};

export const shouldStartWatermarkTransform = (
  dragState: WatermarkDragState,
  side: WatermarkDragSide,
  activeTouchIdentifiers: readonly number[]
) => (
  dragState.isDragging &&
  dragState.side === side &&
  dragState.input === 'touch' &&
  dragState.touchIdentifier !== null &&
  activeTouchIdentifiers.includes(dragState.touchIdentifier)
);

export const MIN_WATERMARK_TEXT_SIZE = 12;
export const MAX_WATERMARK_TEXT_SIZE = 200;

export interface WatermarkTransformTouch extends WatermarkPoint {
  identifier: number;
}

export interface WatermarkTransformState {
  isTransforming: boolean;
  side: WatermarkDragSide | null;
  touchIdentifiers: [number, number] | null;
  lastDistance: number;
  lastAngle: number;
  currentTextSize: number;
  currentRotation: number;
}

export const normalizeWatermarkRotation = (rotation: number) => {
  if (!Number.isFinite(rotation)) return 0;

  return ((rotation + 180) % 360 + 360) % 360 - 180;
};

export const getWatermarkTouchAngle = (
  firstTouch: WatermarkTransformTouch,
  secondTouch: WatermarkTransformTouch
) => Math.atan2(
  secondTouch.y - firstTouch.y,
  secondTouch.x - firstTouch.x
) * 180 / Math.PI;

const getWatermarkTouchDistance = (
  firstTouch: WatermarkTransformTouch,
  secondTouch: WatermarkTransformTouch
) => Math.hypot(
  secondTouch.x - firstTouch.x,
  secondTouch.y - firstTouch.y
);

const clampWatermarkTextSize = (textSize: number) => {
  if (!Number.isFinite(textSize)) return MIN_WATERMARK_TEXT_SIZE;

  return Math.min(
    MAX_WATERMARK_TEXT_SIZE,
    Math.max(MIN_WATERMARK_TEXT_SIZE, textSize)
  );
};

export const createIdleWatermarkTransformState = (): WatermarkTransformState => ({
  isTransforming: false,
  side: null,
  touchIdentifiers: null,
  lastDistance: 0,
  lastAngle: 0,
  currentTextSize: MIN_WATERMARK_TEXT_SIZE,
  currentRotation: 0,
});

export const startWatermarkTransform = (
  touches: readonly WatermarkTransformTouch[],
  side: WatermarkDragSide,
  textSize: number,
  rotation: number
): WatermarkTransformState => {
  if (touches.length < 2) return createIdleWatermarkTransformState();

  const firstTouch = touches[0];
  const secondTouch = touches[1];
  const safeTextSize = clampWatermarkTextSize(textSize);
  const safeRotation = normalizeWatermarkRotation(rotation);

  return {
    isTransforming: true,
    side,
    touchIdentifiers: [firstTouch.identifier, secondTouch.identifier],
    lastDistance: getWatermarkTouchDistance(firstTouch, secondTouch),
    lastAngle: getWatermarkTouchAngle(firstTouch, secondTouch),
    currentTextSize: safeTextSize,
    currentRotation: safeRotation,
  };
};

export const updateWatermarkTransform = (
  state: WatermarkTransformState,
  touches: readonly WatermarkTransformTouch[],
  side: WatermarkDragSide
): {
  state: WatermarkTransformState;
  textSize: number | null;
  rotation: number | null;
} => {
  if (
    !state.isTransforming ||
    state.side !== side ||
    touches.length < 2 ||
    !state.touchIdentifiers
  ) {
    return { state, textSize: null, rotation: null };
  }

  const firstTouch = touches.find(
    touch => touch.identifier === state.touchIdentifiers?.[0]
  );
  const secondTouch = touches.find(
    touch => touch.identifier === state.touchIdentifiers?.[1]
  );

  if (!firstTouch || !secondTouch) {
    return {
      state: startWatermarkTransform(
        touches,
        side,
        state.currentTextSize,
        state.currentRotation
      ),
      textSize: null,
      rotation: null,
    };
  }

  const currentDistance = getWatermarkTouchDistance(firstTouch, secondTouch);
  const currentAngle = getWatermarkTouchAngle(firstTouch, secondTouch);

  if (!Number.isFinite(currentDistance) || currentDistance <= 0) {
    return { state, textSize: null, rotation: null };
  }

  if (!Number.isFinite(state.lastDistance) || state.lastDistance <= 0) {
    return {
      state: {
        ...state,
        lastDistance: currentDistance,
        lastAngle: currentAngle,
      },
      textSize: null,
      rotation: null,
    };
  }

  const scale = currentDistance / state.lastDistance;
  const nextTextSize = clampWatermarkTextSize(state.currentTextSize * scale);
  const angleDelta = normalizeWatermarkRotation(currentAngle - state.lastAngle);
  const nextRotation = normalizeWatermarkRotation(
    state.currentRotation + angleDelta
  );
  const textSize = Math.round(nextTextSize);
  const rotation = Math.round(nextRotation);

  return {
    state: {
      ...state,
      lastDistance: currentDistance,
      lastAngle: currentAngle,
      currentTextSize: nextTextSize,
      currentRotation: nextRotation,
    },
    textSize,
    rotation,
  };
};

export const endWatermarkTransform = (
  state: WatermarkTransformState,
  remainingTouches: readonly WatermarkTransformTouch[],
  side: WatermarkDragSide
) => {
  if (
    state.isTransforming &&
    state.side === side &&
    remainingTouches.length >= 2
  ) {
    return startWatermarkTransform(
      remainingTouches,
      side,
      state.currentTextSize,
      state.currentRotation
    );
  }

  return createIdleWatermarkTransformState();
};
