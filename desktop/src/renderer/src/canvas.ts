import type { ImageRotation, WatermarkSettings } from "../../shared/types";

export function normalizeImageRotation(rotation: number): ImageRotation {
  return (((rotation % 360) + 360) % 360) as ImageRotation;
}

export function getRotatedImageDimensions(
  width: number,
  height: number,
  rotation: ImageRotation,
) {
  return rotation % 180 === 0
    ? { width, height }
    : { width: height, height: width };
}

export async function renderDocument(
  dataUrl: string,
  settings: WatermarkSettings,
  quality: "standard" | "high" | "maximum" = "high",
  imageScale = 1,
  imageRotation: ImageRotation = 0,
): Promise<HTMLCanvasElement> {
  const image = await loadImage(dataUrl);
  const normalizedRotation = normalizeImageRotation(imageRotation);
  const rotatedDimensions = getRotatedImageDimensions(
    image.naturalWidth,
    image.naturalHeight,
    normalizedRotation,
  );
  const maxWidth =
    quality === "standard" ? 1400 : quality === "maximum" ? 3200 : 2200;
  const scale = Math.min(1, maxWidth / rotatedDimensions.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(rotatedDimensions.width * scale);
  canvas.height = Math.round(rotatedDimensions.height * scale);
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("Canvas is unavailable");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const safeImageScale = Math.min(3, Math.max(0.5, imageScale));
  const sourceWidth = image.naturalWidth * scale;
  const sourceHeight = image.naturalHeight * scale;
  if (safeImageScale < 1) {
    const backdropScale = 1.15;
    const backdropWidth = sourceWidth * backdropScale;
    const backdropHeight = sourceHeight * backdropScale;
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((normalizedRotation * Math.PI) / 180);
    ctx.filter = `blur(${Math.max(16, (48 * canvas.width) / 1500)}px)`;
    ctx.drawImage(
      image,
      -backdropWidth / 2,
      -backdropHeight / 2,
      backdropWidth,
      backdropHeight,
    );
    ctx.restore();
    ctx.fillStyle = "rgba(0, 0, 0, 0.18)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  const imageWidth = sourceWidth * safeImageScale;
  const imageHeight = sourceHeight * safeImageScale;
  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((normalizedRotation * Math.PI) / 180);
  ctx.drawImage(
    image,
    -imageWidth / 2,
    -imageHeight / 2,
    imageWidth,
    imageHeight,
  );
  ctx.restore();
  drawWatermark(ctx, canvas, settings);
  return canvas;
}

export interface WatermarkBounds {
  width: number;
  height: number;
  centerX: number;
}

const BASE_WATERMARK_FONT_SIZE = 52;

function getCrossingLineGeometry(
  canvas: HTMLCanvasElement,
  settings: WatermarkSettings,
  renderedTextSize: number,
  lineCount: number,
) {
  const itemScale = settings.fontSize / BASE_WATERMARK_FONT_SIZE;
  return {
    halfWidth: ((canvas.width * settings.crossingLines.scale) / 2) * itemScale,
    gap: Math.max(
      renderedTextSize * lineCount * settings.lineHeight * 0.7,
      canvas.height * 0.09 * itemScale,
    ),
    thickness:
      ((settings.crossingLines.thickness * canvas.width) / 1200) * itemScale,
  };
}

export function getWatermarkBounds(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  settings: WatermarkSettings,
): WatermarkBounds {
  const text = settings.dateEnabled
    ? `${settings.text}\n${new Intl.DateTimeFormat("en-CA").format(new Date())}`
    : settings.text;
  const lines = (settings.uppercase ? text.toLocaleUpperCase() : text).split(
    "\n",
  );
  const size = settings.fontSize * (canvas.width / 1200);
  ctx.save();
  ctx.font = `700 ${size}px Arial, sans-serif`;
  const textWidth = Math.max(
    ...lines.map((line) => ctx.measureText(line).width),
  );
  ctx.restore();
  const lineHeight = size * settings.lineHeight;
  const textHeight = Math.max(size, lines.length * lineHeight);
  const lineGeometry = settings.crossingLines.enabled
    ? getCrossingLineGeometry(canvas, settings, size, lines.length)
    : null;
  const lineHalfWidth = lineGeometry?.halfWidth || 0;
  const lineGap = lineGeometry?.gap || 0;
  const padding = Math.max(12, size * 0.22);
  const textMinX =
    settings.align === "left"
      ? 0
      : settings.align === "right"
        ? -textWidth
        : -textWidth / 2;
  const textMaxX =
    settings.align === "left"
      ? textWidth
      : settings.align === "right"
        ? 0
        : textWidth / 2;
  const minX = Math.min(textMinX, -lineHalfWidth) - padding;
  const maxX = Math.max(textMaxX, lineHalfWidth) + padding;
  return {
    width: maxX - minX,
    height: Math.max(textHeight, lineGap * 2) + padding * 2,
    centerX: (minX + maxX) / 2,
  };
}

export function isPointInWatermark(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  settings: WatermarkSettings,
  point: { x: number; y: number },
): boolean {
  const center = {
    x: settings.x * canvas.width,
    y: settings.y * canvas.height,
  };
  const angle = (-settings.rotation * Math.PI) / 180;
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  const localX = dx * Math.cos(angle) - dy * Math.sin(angle);
  const localY = dx * Math.sin(angle) + dy * Math.cos(angle);
  const bounds = getWatermarkBounds(ctx, canvas, settings);
  return (
    Math.abs(localX - bounds.centerX) <= bounds.width / 2 &&
    Math.abs(localY) <= bounds.height / 2
  );
}

export function drawWatermarkSelection(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  settings: WatermarkSettings,
): void {
  const bounds = getWatermarkBounds(ctx, canvas, settings);
  ctx.save();
  ctx.translate(settings.x * canvas.width, settings.y * canvas.height);
  ctx.rotate((settings.rotation * Math.PI) / 180);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = "#2563eb";
  ctx.lineWidth = Math.max(2, canvas.width / 600);
  ctx.setLineDash([canvas.width / 120, canvas.width / 180]);
  ctx.strokeRect(
    bounds.centerX - bounds.width / 2,
    -bounds.height / 2,
    bounds.width,
    bounds.height,
  );
  ctx.setLineDash([]);
  ctx.restore();
}

export function drawWatermark(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  settings: WatermarkSettings,
): void {
  const text = settings.dateEnabled
    ? `${settings.text}\n${new Intl.DateTimeFormat("en-CA").format(new Date())}`
    : settings.text;
  const lines = (settings.uppercase ? text.toLocaleUpperCase() : text).split(
    "\n",
  );
  const size = settings.fontSize * (canvas.width / 1200);
  const x = settings.x * canvas.width,
    y = settings.y * canvas.height;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((settings.rotation * Math.PI) / 180);
  ctx.font = `700 ${size}px Arial, sans-serif`;
  ctx.textAlign = settings.align;
  ctx.textBaseline = "middle";
  const lineHeight = size * settings.lineHeight;
  if (settings.crossingLines.enabled) {
    const c = settings.crossingLines;
    const lineGeometry = getCrossingLineGeometry(
      canvas,
      settings,
      size,
      lines.length,
    );
    ctx.save();
    ctx.globalAlpha = c.opacity;
    ctx.strokeStyle = c.color;
    ctx.lineWidth = lineGeometry.thickness;
    const half = lineGeometry.halfWidth;
    const gap = lineGeometry.gap;
    ctx.beginPath();
    ctx.moveTo(-half, -gap);
    ctx.lineTo(half, -gap);
    ctx.moveTo(-half, gap);
    ctx.lineTo(half, gap);
    ctx.stroke();
    ctx.restore();
  }
  ctx.globalAlpha = settings.opacity;
  ctx.fillStyle = settings.color;
  lines.forEach((line, index) =>
    ctx.fillText(
      line,
      0,
      (index - (lines.length - 1) / 2) * lineHeight,
      canvas.width * 0.9,
    ),
  );
  ctx.restore();
}

export async function combineCanvases(
  canvases: HTMLCanvasElement[],
): Promise<HTMLCanvasElement> {
  if (canvases.length === 1) return canvases[0];
  const margin = 80,
    gap = 60,
    width = Math.max(...canvases.map((c) => c.width)) + margin * 2;
  const height =
    canvases.reduce((sum, c) => sum + c.height, 0) +
    margin * 2 +
    gap * (canvases.length - 1);
  const output = document.createElement("canvas");
  output.width = width;
  output.height = height;
  const ctx = output.getContext("2d", { alpha: false })!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);
  let y = margin;
  for (const canvas of canvases) {
    ctx.drawImage(canvas, (width - canvas.width) / 2, y);
    y += canvas.height + gap;
  }
  return output;
}

const imageCache = new Map<string, Promise<HTMLImageElement>>();

function loadImage(src: string): Promise<HTMLImageElement> {
  const cached = imageCache.get(src);
  if (cached) return cached;
  const loading = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new Error("The stored image could not be opened"));
    image.src = src;
  });
  imageCache.set(src, loading);
  void loading.catch(() => imageCache.delete(src));
  if (imageCache.size > 6) {
    const oldest = imageCache.keys().next().value;
    if (oldest && oldest !== src) imageCache.delete(oldest);
  }
  return loading;
}
