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
export const WATERMARK_ROTATION_SNAP_ANGLES = [-90, -45, 0, 45, 90] as const;
export const WATERMARK_ROTATION_SNAP_ENTER_THRESHOLD = 4;
export const WATERMARK_ROTATION_SNAP_RELEASE_THRESHOLD = 8;

export type WatermarkRotationSnapAngle =
  (typeof WATERMARK_ROTATION_SNAP_ANGLES)[number];

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
  unsnappedRotation: number;
  snappedRotation: WatermarkRotationSnapAngle | null;
}

export const normalizeWatermarkRotation = (rotation: number) => {
  if (!Number.isFinite(rotation)) return 0;

  return ((rotation + 180) % 360 + 360) % 360 - 180;
};

const getWatermarkRotationDistance = (rotation: number, target: number) =>
  Math.abs(normalizeWatermarkRotation(rotation - target));

export const resolveWatermarkRotationSnap = (
  unsnappedRotation: number,
  snappedRotation: WatermarkRotationSnapAngle | null
): {
  rotation: number;
  snappedRotation: WatermarkRotationSnapAngle | null;
} => {
  const rotation = normalizeWatermarkRotation(unsnappedRotation);

  if (
    snappedRotation !== null &&
    getWatermarkRotationDistance(rotation, snappedRotation) <=
      WATERMARK_ROTATION_SNAP_RELEASE_THRESHOLD
  ) {
    return { rotation: snappedRotation, snappedRotation };
  }

  const nearestSnap = WATERMARK_ROTATION_SNAP_ANGLES.reduce<{
    angle: WatermarkRotationSnapAngle;
    distance: number;
  } | null>((nearest, angle) => {
    const distance = getWatermarkRotationDistance(rotation, angle);

    if (!nearest || distance < nearest.distance) {
      return { angle, distance };
    }

    return nearest;
  }, null);

  if (
    nearestSnap &&
    nearestSnap.distance <= WATERMARK_ROTATION_SNAP_ENTER_THRESHOLD
  ) {
    return {
      rotation: nearestSnap.angle,
      snappedRotation: nearestSnap.angle,
    };
  }

  return { rotation, snappedRotation: null };
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
  unsnappedRotation: 0,
  snappedRotation: null,
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
  const initialSnap = resolveWatermarkRotationSnap(safeRotation, null);

  return {
    isTransforming: true,
    side,
    touchIdentifiers: [firstTouch.identifier, secondTouch.identifier],
    lastDistance: getWatermarkTouchDistance(firstTouch, secondTouch),
    lastAngle: getWatermarkTouchAngle(firstTouch, secondTouch),
    currentTextSize: safeTextSize,
    currentRotation: initialSnap.rotation,
    unsnappedRotation: safeRotation,
    snappedRotation: initialSnap.snappedRotation,
  };
};

const rebaselineWatermarkTransform = (
  state: WatermarkTransformState,
  touches: readonly WatermarkTransformTouch[],
  side: WatermarkDragSide
): WatermarkTransformState => {
  if (touches.length < 2) return createIdleWatermarkTransformState();

  const firstTouch = touches[0];
  const secondTouch = touches[1];

  return {
    ...state,
    isTransforming: true,
    side,
    touchIdentifiers: [firstTouch.identifier, secondTouch.identifier],
    lastDistance: getWatermarkTouchDistance(firstTouch, secondTouch),
    lastAngle: getWatermarkTouchAngle(firstTouch, secondTouch),
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
      state: rebaselineWatermarkTransform(state, touches, side),
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
  const nextUnsnappedRotation = normalizeWatermarkRotation(
    state.unsnappedRotation + angleDelta
  );
  const rotationSnap = resolveWatermarkRotationSnap(
    nextUnsnappedRotation,
    state.snappedRotation
  );
  const textSize = Math.round(nextTextSize);
  const rotation = Math.round(rotationSnap.rotation);

  return {
    state: {
      ...state,
      lastDistance: currentDistance,
      lastAngle: currentAngle,
      currentTextSize: nextTextSize,
      currentRotation: rotationSnap.rotation,
      unsnappedRotation: nextUnsnappedRotation,
      snappedRotation: rotationSnap.snappedRotation,
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
    return rebaselineWatermarkTransform(state, remainingTouches, side);
  }

  return createIdleWatermarkTransformState();
};
