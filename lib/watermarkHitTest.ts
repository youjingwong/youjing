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
