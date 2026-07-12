export interface Point {
  x: number;
  y: number;
}

export const MIN_IMAGE_SCALE = 0.5;
export const MAX_IMAGE_SCALE = 3;
export const DEFAULT_IMAGE_SCALE = 1;
export const IMAGE_SCALE_STEP = 0.05;

export const clampImageScale = (scale: number) => {
  if (!Number.isFinite(scale)) return DEFAULT_IMAGE_SCALE;
  return Math.min(MAX_IMAGE_SCALE, Math.max(MIN_IMAGE_SCALE, scale));
};

export const getDistanceBetweenPoints = (first: Point, second: Point) =>
  Math.hypot(second.x - first.x, second.y - first.y);

export const getPinchImageScale = (
  startScale: number,
  startDistance: number,
  currentDistance: number
) => {
  if (!Number.isFinite(startScale)) return DEFAULT_IMAGE_SCALE;

  const safeStartScale = clampImageScale(startScale);

  if (
    !Number.isFinite(startDistance) ||
    !Number.isFinite(currentDistance) ||
    startDistance <= 0 ||
    currentDistance < 0
  ) {
    return safeStartScale;
  }

  return clampImageScale(safeStartScale * (currentDistance / startDistance));
};

export type PinchSide = 'front' | 'back';

export interface PinchTouch extends Point {
  identifier: number;
}

export interface PinchGestureState {
  isPinching: boolean;
  side: PinchSide | null;
  touchIdentifiers: [number, number] | null;
  startDistance: number;
  startScale: number;
  currentScale: number;
}

export const createIdlePinchGestureState = (): PinchGestureState => ({
  isPinching: false,
  side: null,
  touchIdentifiers: null,
  startDistance: 0,
  startScale: DEFAULT_IMAGE_SCALE,
  currentScale: DEFAULT_IMAGE_SCALE,
});

export const startPinchGesture = (
  touches: readonly PinchTouch[],
  side: PinchSide,
  startScale: number
): PinchGestureState => {
  if (touches.length < 2) return createIdlePinchGestureState();

  const firstTouch = touches[0];
  const secondTouch = touches[1];
  const safeStartScale = clampImageScale(startScale);

  return {
    isPinching: true,
    side,
    touchIdentifiers: [firstTouch.identifier, secondTouch.identifier],
    startDistance: getDistanceBetweenPoints(firstTouch, secondTouch),
    startScale: safeStartScale,
    currentScale: safeStartScale,
  };
};

export const updatePinchGesture = (
  state: PinchGestureState,
  touches: readonly PinchTouch[],
  side: PinchSide
): { state: PinchGestureState; imageScale: number | null } => {
  if (
    !state.isPinching ||
    state.side !== side ||
    touches.length < 2 ||
    !state.touchIdentifiers
  ) {
    return { state, imageScale: null };
  }

  const firstTouch = touches.find(
    touch => touch.identifier === state.touchIdentifiers?.[0]
  );
  const secondTouch = touches.find(
    touch => touch.identifier === state.touchIdentifiers?.[1]
  );

  if (!firstTouch || !secondTouch) {
    return {
      state: startPinchGesture(touches, side, state.currentScale),
      imageScale: null,
    };
  }

  const currentDistance = getDistanceBetweenPoints(firstTouch, secondTouch);

  if (!Number.isFinite(state.startDistance) || state.startDistance <= 0) {
    return {
      state: {
        ...state,
        startDistance: currentDistance,
        startScale: state.currentScale,
      },
      imageScale: null,
    };
  }

  const imageScale = getPinchImageScale(
    state.startScale,
    state.startDistance,
    currentDistance
  );

  return {
    state: { ...state, currentScale: imageScale },
    imageScale,
  };
};

export const endPinchGesture = (
  state: PinchGestureState,
  remainingTouches: readonly PinchTouch[],
  side: PinchSide
) => {
  if (state.isPinching && state.side === side && remainingTouches.length >= 2) {
    return startPinchGesture(remainingTouches, side, state.currentScale);
  }

  return createIdlePinchGestureState();
};
