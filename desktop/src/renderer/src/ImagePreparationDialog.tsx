import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import type { MessageKey } from "./localization";
import {
  FULL_CROP,
  MIN_CROP_SIZE,
  boundedOutputDimensions,
  cropOutputIsLargeEnough,
  cropZoomPercent,
  flipCrop,
  identityCardCrop,
  moveCrop,
  pixelCrop,
  resizeCrop,
  rotationAfterVisualTurn,
  rotateCrop,
  scaleCrop,
  transformedImageSize,
  type CropHandle,
  type CropRect,
} from "./image-crop";

interface Props {
  dataUrl: string;
  sideLabel: string;
  initialRotation?: number;
  t: (key: MessageKey) => string;
  onCancel: () => void;
  onConfirm: (bytes: Uint8Array) => Promise<void>;
}

type Point = { x: number; y: number };

type Interaction =
  | {
      kind: "drag";
      pointerId: number;
      handle: CropHandle;
      start: Point;
      startCrop: CropRect;
    }
  | {
      kind: "pinch";
      pointerIds: [number, number];
      startDistance: number;
      anchor: Point;
      startCrop: CropRect;
    };

type RatioMode = "free" | "id" | "original";

const PREVIEW_MAX_WIDTH = 1400;
const PREVIEW_MAX_HEIGHT = 900;

export default function ImagePreparationDialog({
  dataUrl,
  sideLabel,
  initialRotation = 0,
  t,
  onCancel,
  onConfirm,
}: Props) {
  const dialog = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const baseCanvas = useRef<HTMLCanvasElement | null>(null);
  const image = useRef<HTMLImageElement | null>(null);
  const interaction = useRef<Interaction | null>(null);
  const pointers = useRef(new Map<number, Point>());
  const [crop, setCrop] = useState<CropRect>(FULL_CROP);
  const [rotation, setRotation] = useState(normalizeRotation(initialRotation));
  const [flipped, setFlipped] = useState(false);
  const [ratioMode, setRatioMode] = useState<RatioMode>("original");
  const [busy, setBusy] = useState(false);
  const [loadedDataUrl, setLoadedDataUrl] = useState<string | null>(null);
  const [imageRevision, setImageRevision] = useState(0);
  const [previewRevision, setPreviewRevision] = useState(0);
  const [imageSize, setImageSize] = useState({ width: 1, height: 1 });
  const loaded = loadedDataUrl === dataUrl;

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const frame = requestAnimationFrame(() => canvas.current?.focus());
    return () => {
      cancelAnimationFrame(frame);
      previouslyFocused?.focus();
    };
  }, []);

  useEffect(() => {
    image.current = null;
    const next = new Image();
    next.onload = () => {
      image.current = next;
      setImageSize({
        width: Math.max(1, next.naturalWidth),
        height: Math.max(1, next.naturalHeight),
      });
      setLoadedDataUrl(dataUrl);
      setImageRevision((value) => value + 1);
    };
    next.src = dataUrl;
    return () => {
      next.onload = null;
      next.src = "";
      image.current = null;
    };
  }, [dataUrl]);

  useEffect(() => {
    const source = image.current;
    if (!source) return;
    baseCanvas.current ||= document.createElement("canvas");
    drawTransformed(
      baseCanvas.current,
      source,
      rotation,
      flipped,
      PREVIEW_MAX_WIDTH,
      PREVIEW_MAX_HEIGHT,
    );
    setPreviewRevision((value) => value + 1);
  }, [flipped, imageRevision, rotation]);

  const drawPreview = useCallback(() => {
    const target = canvas.current;
    const base = baseCanvas.current;
    if (!target || !base || base.width < 1 || base.height < 1) return;
    if (target.width !== base.width) target.width = base.width;
    if (target.height !== base.height) target.height = base.height;
    const context = target.getContext("2d")!;
    context.drawImage(base, 0, 0);
    drawCropOverlay(context, target.width, target.height, crop);
  }, [crop]);

  useEffect(() => {
    drawPreview();
  }, [drawPreview, previewRevision]);

  function applyCrop(next: CropRect, mode: RatioMode = "free") {
    setCrop(next);
    setRatioMode(mode);
  }

  function transformedSize(nextRotation = rotation) {
    return transformedImageSize(
      imageSize.width,
      imageSize.height,
      nextRotation,
    );
  }

  function applyIdentityRatio() {
    const size = transformedSize();
    applyCrop(
      identityCardCrop(size.width, size.height, {
        x: crop.x + crop.width / 2,
        y: crop.y + crop.height / 2,
      }),
      "id",
    );
  }

  function showOriginal() {
    applyCrop(FULL_CROP, "original");
  }

  function reset() {
    setCrop(FULL_CROP);
    setRotation(normalizeRotation(initialRotation));
    setFlipped(false);
    setRatioMode("original");
  }

  function rotate(clockwise: boolean) {
    if (busy || !loaded) return;
    setCrop((value) => rotateCrop(value, clockwise));
    setRotation((value) => rotationAfterVisualTurn(value, clockwise, flipped));
    setRatioMode("free");
  }

  function flip() {
    if (busy || !loaded) return;
    setCrop((value) => flipCrop(value));
    setFlipped((value) => !value);
    setRatioMode("free");
  }

  function zoom(factor: number, anchor?: Point) {
    if (busy || !loaded) return;
    setCrop((current) => scaleCrop(current, factor, anchor));
    setRatioMode("free");
  }

  async function confirm() {
    const source = image.current;
    const size = transformedSize();
    if (
      !source ||
      busy ||
      !loaded ||
      !cropOutputIsLargeEnough(size.width, size.height, crop)
    )
      return;
    setBusy(true);
    try {
      const output = document.createElement("canvas");
      drawCroppedTransformed(output, source, rotation, flipped, crop);
      const blob = await new Promise<Blob>((resolve, reject) =>
        output.toBlob(
          (value) =>
            value
              ? resolve(value)
              : reject(new Error("Could not encode the cropped image.")),
          "image/png",
        ),
      );
      await onConfirm(new Uint8Array(await blob.arrayBuffer()));
    } finally {
      setBusy(false);
    }
  }

  function pointFromClient(target: HTMLCanvasElement, point: Point): Point {
    const bounds = target.getBoundingClientRect();
    return {
      x: clamp01((point.x - bounds.left) / Math.max(1, bounds.width)),
      y: clamp01((point.y - bounds.top) / Math.max(1, bounds.height)),
    };
  }

  function startPointer(event: ReactPointerEvent<HTMLCanvasElement>) {
    event.currentTarget.focus();
    if (busy || !loaded) return;
    event.preventDefault();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic accessibility/tests events do not always register as active pointers.
    }
    pointers.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });

    if (pointers.current.size >= 2) {
      const entries = [...pointers.current.entries()].slice(0, 2) as [
        [number, Point],
        [number, Point],
      ];
      const [first, second] = entries;
      const midpoint = {
        x: (first[1].x + second[1].x) / 2,
        y: (first[1].y + second[1].y) / 2,
      };
      interaction.current = {
        kind: "pinch",
        pointerIds: [first[0], second[0]],
        startDistance: Math.max(1, distance(first[1], second[1])),
        anchor: pointFromClient(event.currentTarget, midpoint),
        startCrop: crop,
      };
      return;
    }

    const start = pointFromClient(event.currentTarget, {
      x: event.clientX,
      y: event.clientY,
    });
    const handle = hitTestCrop(
      crop,
      start,
      event.currentTarget.getBoundingClientRect(),
    );
    if (!handle) return;
    interaction.current = {
      kind: "drag",
      pointerId: event.pointerId,
      handle,
      start,
      startCrop: crop,
    };
  }

  function movePointer(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (busy || !loaded) return;
    const active = interaction.current;
    if (!pointers.current.has(event.pointerId) || !active) {
      const point = pointFromClient(event.currentTarget, {
        x: event.clientX,
        y: event.clientY,
      });
      event.currentTarget.style.cursor = cursorForHandle(
        hitTestCrop(crop, point, event.currentTarget.getBoundingClientRect()),
      );
      return;
    }
    event.preventDefault();
    pointers.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });

    if (active.kind === "pinch") {
      const first = pointers.current.get(active.pointerIds[0]);
      const second = pointers.current.get(active.pointerIds[1]);
      if (!first || !second) return;
      applyCrop(
        scaleCrop(
          active.startCrop,
          active.startDistance / Math.max(1, distance(first, second)),
          active.anchor,
        ),
      );
      return;
    }

    if (active.pointerId !== event.pointerId) return;
    const point = pointFromClient(event.currentTarget, {
      x: event.clientX,
      y: event.clientY,
    });
    const dx = point.x - active.start.x;
    const dy = point.y - active.start.y;
    applyCrop(
      active.handle === "move"
        ? moveCrop(active.startCrop, dx, dy)
        : resizeCrop(active.startCrop, active.handle, dx, dy),
    );
  }

  function endPointer(event: ReactPointerEvent<HTMLCanvasElement>) {
    pointers.current.delete(event.pointerId);
    interaction.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function handleWheel(event: ReactWheelEvent<HTMLCanvasElement>) {
    if (busy || !loaded) return;
    event.preventDefault();
    const factor = Math.exp(
      Math.max(-0.18, Math.min(0.18, event.deltaY * 0.002)),
    );
    zoom(
      factor,
      pointFromClient(event.currentTarget, {
        x: event.clientX,
        y: event.clientY,
      }),
    );
  }

  function handleCropKeys(event: ReactKeyboardEvent<HTMLCanvasElement>) {
    if (busy || !loaded) return;
    const step = event.shiftKey ? 0.003 : 0.012;
    const movement: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    if (event.altKey && movement[event.key]) {
      event.preventDefault();
      const resizeStep = event.ctrlKey ? 0.003 : 0.012;
      const oppositeEdge = event.shiftKey;
      const resize = {
        ArrowLeft: {
          handle: oppositeEdge ? "east" : "west",
          dx: -resizeStep,
          dy: 0,
        },
        ArrowRight: {
          handle: oppositeEdge ? "east" : "west",
          dx: resizeStep,
          dy: 0,
        },
        ArrowUp: {
          handle: oppositeEdge ? "south" : "north",
          dx: 0,
          dy: -resizeStep,
        },
        ArrowDown: {
          handle: oppositeEdge ? "south" : "north",
          dx: 0,
          dy: resizeStep,
        },
      }[event.key] as {
        handle: Exclude<CropHandle, "move">;
        dx: number;
        dy: number;
      };
      applyCrop(resizeCrop(crop, resize.handle, resize.dx, resize.dy));
      return;
    }
    if (movement[event.key]) {
      event.preventDefault();
      applyCrop(moveCrop(crop, ...movement[event.key]));
      return;
    }
    if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      zoom(0.88);
    } else if (event.key === "-") {
      event.preventDefault();
      zoom(1.12);
    } else if (event.key === "0") {
      event.preventDefault();
      reset();
    }
  }

  function handleDialogKeys(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape" && !busy) {
      event.preventDefault();
      event.stopPropagation();
      onCancel();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = [
      ...(dialog.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), [href], input:not(:disabled), [tabindex]:not([tabindex="-1"])',
      ) || []),
    ].filter((element) => element.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  const zoomPercent = cropZoomPercent(crop);
  const sourceOutputSize = pixelCrop(
    transformedSize().width,
    transformedSize().height,
    crop,
  );
  const outputSize = boundedOutputDimensions(
    sourceOutputSize.width,
    sourceOutputSize.height,
  );
  const outputIsLargeEnough =
    loaded &&
    cropOutputIsLargeEnough(
      transformedSize().width,
      transformedSize().height,
      crop,
    );
  const canZoomOut = crop.width < 0.999 && crop.height < 0.999;
  const controlsDisabled = busy || !loaded;
  const dialogTitle = `${t("cropImage")}: ${sideLabel}`;

  return (
    <div className="modal-backdrop crop-modal-backdrop">
      <div
        ref={dialog}
        className="modal image-prep-modal"
        role="dialog"
        aria-modal="true"
        aria-label={dialogTitle}
        aria-describedby="crop-instructions"
        data-testid="image-crop-dialog"
        aria-busy={busy || !loaded}
        onKeyDown={handleDialogKeys}
      >
        <div className="crop-modal-header">
          <button className="crop-cancel" disabled={busy} onClick={onCancel}>
            {t("cancel")}
          </button>
          <div>
            <span>{sideLabel}</span>
            <h2>{t("cropImage")}</h2>
          </div>
          <button
            className="primary crop-done"
            disabled={busy || !outputIsLargeEnough}
            onClick={() => void confirm()}
          >
            {busy ? "…" : t("done")}
          </button>
        </div>
        <div className="image-prep-body">
          <div className="prep-canvas">
            <canvas
              ref={canvas}
              tabIndex={0}
              role="application"
              aria-label={t("cropArea")}
              aria-describedby="crop-instructions crop-zoom-status crop-resolution"
              aria-busy={!loaded}
              data-ready={loaded ? "true" : "false"}
              data-crop-x={crop.x}
              data-crop-y={crop.y}
              data-crop-width={crop.width}
              data-crop-height={crop.height}
              data-testid="crop-surface"
              onPointerDown={startPointer}
              onPointerMove={movePointer}
              onPointerUp={endPointer}
              onPointerCancel={endPointer}
              onWheel={handleWheel}
              onKeyDown={handleCropKeys}
            />
          </div>
          <p id="crop-instructions" className="crop-instructions">
            {t("cropInstructions")}
          </p>
          <p
            id="crop-resolution"
            className={`crop-resolution ${loaded && !outputIsLargeEnough ? "warning" : ""}`}
            aria-live="polite"
          >
            {loaded && (
              <>
                <span>
                  {t("cropResolution")}: {outputSize.width} ×{" "}
                  {outputSize.height}
                  px
                </span>
                {!outputIsLargeEnough && <strong>{t("cropTooSmall")}</strong>}
              </>
            )}
          </p>
          <div className="crop-toolbar">
            <div
              className="prep-actions"
              role="group"
              aria-label={t("imageAdjustments")}
            >
              <button
                className="crop-tool-button"
                aria-label={t("rotateLeft")}
                title={t("rotateLeft")}
                disabled={controlsDisabled}
                onClick={() => rotate(false)}
              >
                <CropToolIcon name="rotate-left" />
                <span>{t("rotateLeft")}</span>
              </button>
              <button
                className="crop-tool-button"
                aria-label={t("rotateRight")}
                title={t("rotateRight")}
                disabled={controlsDisabled}
                onClick={() => rotate(true)}
              >
                <CropToolIcon name="rotate-right" />
                <span>{t("rotateRight")}</span>
              </button>
              <button
                className={`crop-tool-button ${flipped ? "active" : ""}`}
                aria-label={t("flipHorizontal")}
                aria-pressed={flipped}
                title={t("flipHorizontal")}
                disabled={controlsDisabled}
                onClick={flip}
              >
                <CropToolIcon name="flip" />
                <span>{t("flipHorizontal")}</span>
              </button>
              <button
                className="crop-tool-button"
                aria-label={t("resetCrop")}
                title={t("resetCrop")}
                disabled={controlsDisabled}
                onClick={reset}
              >
                <CropToolIcon name="reset" />
                <span>{t("resetCrop")}</span>
              </button>
            </div>
            <div className="crop-zoom-controls">
              <button
                aria-label={t("cropZoomOut")}
                disabled={controlsDisabled || !canZoomOut}
                onClick={() => zoom(1.12)}
              >
                <CropToolIcon name="zoom-out" />
              </button>
              <output id="crop-zoom-status" aria-live="polite">
                <span>{t("cropZoom")}</span>
                <strong>{zoomPercent}%</strong>
              </output>
              <button
                aria-label={t("cropZoomIn")}
                disabled={
                  controlsDisabled ||
                  crop.width <= MIN_CROP_SIZE + 0.001 ||
                  crop.height <= MIN_CROP_SIZE + 0.001
                }
                onClick={() => zoom(0.88)}
              >
                <CropToolIcon name="zoom-in" />
              </button>
            </div>
          </div>
          <div className="crop-shape-row">
            <span>{t("cropShape")}</span>
            <div className="segmented crop-shapes">
              <button
                aria-pressed={ratioMode === "free"}
                className={ratioMode === "free" ? "active" : ""}
                disabled={controlsDisabled}
                onClick={() => setRatioMode("free")}
              >
                {t("freeCrop")}
              </button>
              <button
                aria-pressed={ratioMode === "id"}
                className={ratioMode === "id" ? "active" : ""}
                disabled={controlsDisabled}
                onClick={applyIdentityRatio}
              >
                {t("idRatio")}
              </button>
              <button
                aria-pressed={ratioMode === "original"}
                className={ratioMode === "original" ? "active" : ""}
                disabled={controlsDisabled}
                onClick={showOriginal}
              >
                {t("originalImage")}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function hitTestCrop(
  crop: CropRect,
  point: Point,
  bounds: DOMRect,
): CropHandle | null {
  const thresholdX = 16 / Math.max(1, bounds.width);
  const thresholdY = 16 / Math.max(1, bounds.height);
  const left = crop.x;
  const right = crop.x + crop.width;
  const top = crop.y;
  const bottom = crop.y + crop.height;
  const nearX = (value: number) => Math.abs(point.x - value) <= thresholdX;
  const nearY = (value: number) => Math.abs(point.y - value) <= thresholdY;
  const withinX = point.x >= left - thresholdX && point.x <= right + thresholdX;
  const withinY = point.y >= top - thresholdY && point.y <= bottom + thresholdY;

  if (nearX(left) && nearY(top)) return "north-west";
  if (nearX(right) && nearY(top)) return "north-east";
  if (nearX(right) && nearY(bottom)) return "south-east";
  if (nearX(left) && nearY(bottom)) return "south-west";
  if (nearY(top) && withinX) return "north";
  if (nearX(right) && withinY) return "east";
  if (nearY(bottom) && withinX) return "south";
  if (nearX(left) && withinY) return "west";
  if (
    point.x >= left &&
    point.x <= right &&
    point.y >= top &&
    point.y <= bottom
  )
    return "move";
  return null;
}

function cursorForHandle(handle: CropHandle | null) {
  if (handle === "move") return "move";
  if (handle === "north" || handle === "south") return "ns-resize";
  if (handle === "east" || handle === "west") return "ew-resize";
  if (handle === "north-east" || handle === "south-west") return "nesw-resize";
  if (handle === "north-west" || handle === "south-east") return "nwse-resize";
  return "default";
}

function distance(first: Point, second: Point) {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function normalizeRotation(value: number) {
  return ((value % 360) + 360) % 360;
}

function drawCropOverlay(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  crop: CropRect,
) {
  const rect = pixelCrop(width, height, crop);
  context.fillStyle = "rgba(4, 10, 8, .64)";
  context.fillRect(0, 0, width, rect.y);
  context.fillRect(
    0,
    rect.y + rect.height,
    width,
    height - rect.y - rect.height,
  );
  context.fillRect(0, rect.y, rect.x, rect.height);
  context.fillRect(
    rect.x + rect.width,
    rect.y,
    width - rect.x - rect.width,
    rect.height,
  );

  const lineWidth = Math.max(2, width / 700);
  context.save();
  context.strokeStyle = "rgba(255, 255, 255, .62)";
  context.lineWidth = lineWidth;
  for (const fraction of [1 / 3, 2 / 3]) {
    context.beginPath();
    context.moveTo(rect.x + rect.width * fraction, rect.y);
    context.lineTo(rect.x + rect.width * fraction, rect.y + rect.height);
    context.stroke();
    context.beginPath();
    context.moveTo(rect.x, rect.y + rect.height * fraction);
    context.lineTo(rect.x + rect.width, rect.y + rect.height * fraction);
    context.stroke();
  }
  context.strokeStyle = "#ffffff";
  context.lineWidth = lineWidth * 2;
  context.strokeRect(rect.x, rect.y, rect.width, rect.height);

  const handleSize = Math.max(10, Math.min(width, height) / 45);
  context.fillStyle = "#ffffff";
  context.strokeStyle = "rgba(5, 15, 11, .72)";
  context.lineWidth = Math.max(1, lineWidth);
  const points = [
    [rect.x, rect.y],
    [rect.x + rect.width / 2, rect.y],
    [rect.x + rect.width, rect.y],
    [rect.x + rect.width, rect.y + rect.height / 2],
    [rect.x + rect.width, rect.y + rect.height],
    [rect.x + rect.width / 2, rect.y + rect.height],
    [rect.x, rect.y + rect.height],
    [rect.x, rect.y + rect.height / 2],
  ];
  for (const [x, y] of points) {
    context.beginPath();
    context.rect(
      x - handleSize / 2,
      y - handleSize / 2,
      handleSize,
      handleSize,
    );
    context.fill();
    context.stroke();
  }
  context.restore();
}

function drawTransformed(
  target: HTMLCanvasElement,
  source: HTMLImageElement,
  rotation: number,
  flipped: boolean,
  maxWidth = Number.POSITIVE_INFINITY,
  maxHeight = Number.POSITIVE_INFINITY,
) {
  const size = transformedImageSize(
    source.naturalWidth,
    source.naturalHeight,
    rotation,
  );
  const scale = Math.min(1, maxWidth / size.width, maxHeight / size.height);
  target.width = Math.max(1, Math.round(size.width * scale));
  target.height = Math.max(1, Math.round(size.height * scale));
  const context = target.getContext("2d")!;
  context.fillStyle = "#fff";
  context.fillRect(0, 0, target.width, target.height);
  context.save();
  context.translate(target.width / 2, target.height / 2);
  context.scale(flipped ? -1 : 1, 1);
  context.rotate((rotation * Math.PI) / 180);
  context.scale(scale, scale);
  context.drawImage(
    source,
    -source.naturalWidth / 2,
    -source.naturalHeight / 2,
  );
  context.restore();
}

function drawCroppedTransformed(
  target: HTMLCanvasElement,
  source: HTMLImageElement,
  rotation: number,
  flipped: boolean,
  crop: CropRect,
) {
  const size = transformedImageSize(
    source.naturalWidth,
    source.naturalHeight,
    rotation,
  );
  const rect = pixelCrop(size.width, size.height, crop);
  const output = boundedOutputDimensions(rect.width, rect.height);
  target.width = output.width;
  target.height = output.height;
  const context = target.getContext("2d")!;
  context.fillStyle = "#fff";
  context.fillRect(0, 0, target.width, target.height);
  context.save();
  context.scale(target.width / rect.width, target.height / rect.height);
  context.translate(-rect.x + size.width / 2, -rect.y + size.height / 2);
  context.scale(flipped ? -1 : 1, 1);
  context.rotate((rotation * Math.PI) / 180);
  context.drawImage(
    source,
    -source.naturalWidth / 2,
    -source.naturalHeight / 2,
  );
  context.restore();
}

function CropToolIcon({
  name,
}: {
  name:
    "rotate-left" | "rotate-right" | "flip" | "reset" | "zoom-in" | "zoom-out";
}) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      {name === "rotate-left" && (
        <>
          <path d="M8 7H3V2" />
          <path d="M4 7a9 9 0 1 1-1 8" />
        </>
      )}
      {name === "rotate-right" && (
        <>
          <path d="M16 7h5V2" />
          <path d="M20 7a9 9 0 1 0 1 8" />
        </>
      )}
      {name === "flip" && (
        <>
          <path d="M12 3v18" />
          <path d="m9 6-6 6 6 6V6Z" />
          <path d="m15 6 6 6-6 6V6Z" />
        </>
      )}
      {name === "reset" && (
        <>
          <path d="M5 8V3h5" />
          <path d="M5 3a9 9 0 1 1-2 9" />
        </>
      )}
      {(name === "zoom-in" || name === "zoom-out") && (
        <>
          <circle cx="10.5" cy="10.5" r="6.5" />
          <path d="m15.5 15.5 5 5M7.5 10.5h6" />
          {name === "zoom-in" && <path d="M10.5 7.5v6" />}
        </>
      )}
    </svg>
  );
}
