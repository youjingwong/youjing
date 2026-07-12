import { useTranslation } from 'next-i18next/pages';
import { useRouter } from 'next/router';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  clampImageScale,
  DEFAULT_IMAGE_SCALE,
  endPinchGesture,
  IMAGE_SCALE_STEP,
  MAX_IMAGE_SCALE,
  MIN_IMAGE_SCALE,
  startPinchGesture,
  updatePinchGesture,
  type PinchGestureState,
  type PinchSide,
  type PinchTouch,
} from '../lib/imageScale';
import {
  getCurrentImageLoadState,
  type ImageLoadState,
} from '../lib/imageLoadState';
import {
  getNextImageRotationState,
  getRotatedImageDimensions,
  normalizeRotation,
  OUTPUT_CANVAS_WIDTH,
  type ImageDimensions,
  type RotationDirection,
} from '../lib/imageRotation';
import {
  createIdleWatermarkDragState,
  endWatermarkTransform,
  getPointInRotatedSpace,
  isPointInWatermarkBounds,
  moveWatermarkDrag,
  shouldStartWatermarkTransform,
  startWatermarkDrag,
  startWatermarkTransform,
  updateWatermarkTransform,
  MAX_WATERMARK_TEXT_SIZE,
  MIN_WATERMARK_TEXT_SIZE,
  type WatermarkDragInput,
  type WatermarkDragSide,
  type WatermarkDragState,
  type WatermarkTransformState,
} from '../lib/watermarkHitTest';
import {
  DEFAULT_WATERMARK_ROTATION,
  DEFAULT_WATERMARK_TEXT_SIZE,
  DEFAULT_WATERMARK_X_POSITION,
  DEFAULT_WATERMARK_Y_POSITION,
  resetWatermarkTransform,
} from '../lib/watermarkSettings';
import LanguageSwitcher from './LanguageSwitcher';

interface ProcessingSettings {
  text: string;
  color: string;
  lineWidth: number;
  textSize: number;
  rotation: number;
  xPosition: number;
  yPosition: number;
  imageScale: number;
  imageRotation: number;
}

interface CanvasTouchHandlers {
  start: (event: TouchEvent) => void;
  move: (event: TouchEvent) => void;
  end: (event: TouchEvent) => void;
  cancel: () => void;
}

type MultiTouchGesture =
  | { kind: 'idle' }
  | { kind: 'image'; state: PinchGestureState }
  | { kind: 'watermark'; state: WatermarkTransformState };

// Get default text from URL parameter or use fallback
const getDefaultText = (defaultText: string) => {
  if (typeof window !== 'undefined') {
    const hashParams = new URLSearchParams(window.location.hash.slice(1));
    const urlParams = new URLSearchParams(window.location.search);
    const textParam = hashParams.get('text') || urlParams.get('text');
    return textParam || defaultText;
  }
  return defaultText;
};

const isHeicImage = (file: File) =>
  file.type === 'image/heic' ||
  file.type === 'image/heif' ||
  /\.(heic|heif)$/i.test(file.name);

const isSupportedImage = (file: File) =>
  file.type.startsWith('image/') || isHeicImage(file);

const defaultSettings: ProcessingSettings = {
  text: 'FOR PRIVATE USE ONLY',
  color: '#000000',
  lineWidth: 5,
  textSize: DEFAULT_WATERMARK_TEXT_SIZE,
  rotation: DEFAULT_WATERMARK_ROTATION,
  xPosition: DEFAULT_WATERMARK_X_POSITION,
  yPosition: DEFAULT_WATERMARK_Y_POSITION,
  imageScale: DEFAULT_IMAGE_SCALE,
  imageRotation: 0,
};

interface RotateImageButtonProps {
  direction: RotationDirection;
  disabled: boolean;
  label: string;
  onClick: () => void;
}

function RotateImageButton({
  direction,
  disabled,
  label,
  onClick,
}: RotateImageButtonProps) {
  const isLeft = direction === 'left';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-gray-700 bg-gray-800 text-gray-300 transition-colors hover:border-gray-600 hover:bg-gray-700 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400 disabled:cursor-not-allowed disabled:opacity-50 sm:h-8 sm:w-8"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-4 w-4"
      >
        <path d={isLeft ? 'M3 12a9 9 0 1 0 2.64-6.36L3 8' : 'M21 12a9 9 0 1 1-2.64-6.36L21 8'} />
        <path d={isLeft ? 'M3 3v5h5' : 'M21 3v5h-5'} />
      </svg>
    </button>
  );
}

interface ZoomImageButtonProps {
  direction: 'in' | 'out';
  disabled: boolean;
  label: string;
  onClick: () => void;
}

function ZoomImageButton({
  direction,
  disabled,
  label,
  onClick,
}: ZoomImageButtonProps) {
  const isZoomIn = direction === 'in';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-gray-700 bg-gray-800 text-gray-300 transition-colors hover:border-gray-600 hover:bg-gray-700 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400 disabled:cursor-not-allowed disabled:opacity-50 sm:h-8 sm:w-8"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-4 w-4"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-4-4" />
        <path d="M8 11h6" />
        {isZoomIn && <path d="M11 8v6" />}
      </svg>
    </button>
  );
}

interface ResetWatermarkButtonProps {
  disabled: boolean;
  label: string;
  description: string;
  onClick: () => void;
}

function ResetWatermarkButton({
  disabled,
  label,
  description,
  onClick,
}: ResetWatermarkButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={description}
      title={description}
      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-gray-700 bg-gray-800 px-3 text-sm text-gray-300 transition-colors hover:border-gray-600 hover:bg-gray-700 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400 disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-8"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-4 w-4"
      >
        <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
        <path d="M3 3v5h5" />
      </svg>
      <span>{label}</span>
    </button>
  );
}

function useLoadedImage(file: File | null) {
  const [loadState, setLoadState] = useState<ImageLoadState<File, HTMLImageElement> | null>(null);

  useEffect(() => {
    if (!file) return;

    let cancelled = false;
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);

    image.onload = () => {
      image.onload = null;
      image.onerror = null;

      if (!cancelled) {
        setLoadState({ file, image, hasError: false });
      }
    };
    image.onerror = () => {
      image.onload = null;
      image.onerror = null;

      if (!cancelled) {
        setLoadState({ file, image: null, hasError: true });
        console.error('Unable to decode the selected image');
      }
    };
    image.src = objectUrl;

    return () => {
      cancelled = true;
      image.onload = null;
      image.onerror = null;
      image.src = '';
      URL.revokeObjectURL(objectUrl);
      queueMicrotask(() => {
        setLoadState(currentState => currentState?.file === file ? null : currentState);
      });
    };
  }, [file]);

  const currentLoadState = getCurrentImageLoadState(file, loadState);

  return {
    image: currentLoadState?.image ?? null,
    isLoading: Boolean(file) && !currentLoadState,
    hasError: currentLoadState?.hasError ?? false,
  };
}

const getImageDimensions = (image: HTMLImageElement | null): ImageDimensions | null =>
  image
    ? {
        width: image.naturalWidth || image.width,
        height: image.naturalHeight || image.height,
      }
    : null;

const getPinchTouches = (touches: TouchList): PinchTouch[] =>
  Array.from(touches, touch => ({
    identifier: touch.identifier,
    x: touch.clientX,
    y: touch.clientY,
  }));

const clearCanvas = (canvas: HTMLCanvasElement) => {
  canvas.width = 300;
  canvas.height = 150;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
};

interface WatermarkLayout {
  textWidth: number;
  textHeight: number;
  lineExtension: number;
  lineSpacing: number;
  hitboxWidth: number;
  hitboxHeight: number;
}

const getWatermarkLayout = (
  ctx: CanvasRenderingContext2D,
  settings: Pick<ProcessingSettings, 'text' | 'textSize'>
): WatermarkLayout => {
  ctx.save();
  ctx.font = `${settings.textSize}px "Outfit"`;
  const textMetrics = ctx.measureText(settings.text);
  const textWidth = textMetrics.width;
  const textHeight =
    textMetrics.actualBoundingBoxAscent +
    textMetrics.actualBoundingBoxDescent;
  const lineExtension = 50;
  const lineSpacing = textHeight * 1.2;
  ctx.restore();

  return {
    textWidth,
    textHeight,
    lineExtension,
    lineSpacing,
    hitboxWidth: textWidth + (lineExtension * 2),
    hitboxHeight: (lineSpacing * 2) + textHeight,
  };
};

const processImage = (
  canvas: HTMLCanvasElement,
  image: HTMLImageElement,
  settings: ProcessingSettings
) => {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const imageRotation = normalizeRotation(settings.imageRotation);
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  const rotatedDimensions = getRotatedImageDimensions(
    { width: sourceWidth, height: sourceHeight },
    imageRotation
  );

  canvas.width = OUTPUT_CANVAS_WIDTH;
  canvas.height = OUTPUT_CANVAS_WIDTH * (rotatedDimensions.height / rotatedDimensions.width);

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const baseScale = canvas.width / rotatedDimensions.width;
  const width = sourceWidth * baseScale * settings.imageScale;
  const height = sourceHeight * baseScale * settings.imageScale;

  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((imageRotation * Math.PI) / 180);
  ctx.drawImage(image, -width / 2, -height / 2, width, height);
  ctx.restore();

  ctx.save();
  ctx.translate(settings.xPosition, settings.yPosition);
  ctx.rotate((settings.rotation * Math.PI) / 180);
  ctx.font = `${settings.textSize}px "Outfit"`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const {
    textWidth,
    lineExtension,
    lineSpacing,
  } = getWatermarkLayout(ctx, settings);
  const lineStart = -textWidth / 2 - lineExtension;
  const lineEnd = textWidth / 2 + lineExtension;

  ctx.beginPath();
  ctx.lineWidth = settings.lineWidth;
  ctx.strokeStyle = settings.color;
  ctx.moveTo(lineStart, -lineSpacing);
  ctx.lineTo(lineEnd, -lineSpacing);
  ctx.stroke();
  ctx.moveTo(lineStart, lineSpacing);
  ctx.lineTo(lineEnd, lineSpacing);
  ctx.stroke();

  ctx.fillStyle = settings.color;
  ctx.fillText(settings.text, 0, 0);
  ctx.restore();
};

const drawWatermarkSelection = (
  overlayCanvas: HTMLCanvasElement,
  sourceCanvas: HTMLCanvasElement,
  settings: ProcessingSettings,
  isVisible: boolean
) => {
  if (
    overlayCanvas.width !== sourceCanvas.width ||
    overlayCanvas.height !== sourceCanvas.height
  ) {
    overlayCanvas.width = sourceCanvas.width;
    overlayCanvas.height = sourceCanvas.height;
  }

  const ctx = overlayCanvas.getContext('2d');
  if (!ctx) return;

  ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
  if (!isVisible) return;

  const { hitboxWidth, hitboxHeight } = getWatermarkLayout(ctx, settings);
  const padding = 8;

  ctx.save();
  ctx.translate(settings.xPosition, settings.yPosition);
  ctx.rotate((settings.rotation * Math.PI) / 180);
  ctx.setLineDash([12, 8]);
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(96, 165, 250, 0.85)';
  ctx.strokeRect(
    -(hitboxWidth / 2) - padding,
    -(hitboxHeight / 2) - padding,
    hitboxWidth + (padding * 2),
    hitboxHeight + (padding * 2)
  );
  ctx.restore();
};

export default function IDMarkingClient() {
  const { t, i18n } = useTranslation('common');
  const router = useRouter();
  const initialWatermarkText = getDefaultText(t('defaultWatermarkText'));
  const [frontImage, setFrontImage] = useState<File | null>(null);
  const [backImage, setBackImage] = useState<File | null>(null);
  const {
    image: frontLoadedImage,
    isLoading: isFrontImageLoading,
    hasError: hasFrontImageError,
  } = useLoadedImage(frontImage);
  const {
    image: backLoadedImage,
    isLoading: isBackImageLoading,
    hasError: hasBackImageError,
  } = useLoadedImage(backImage);
  const frontImageDimensions = getImageDimensions(frontLoadedImage);
  const backImageDimensions = getImageDimensions(backLoadedImage);
  const [frontSettings, setFrontSettings] = useState<ProcessingSettings>(() => ({
    ...defaultSettings,
    text: initialWatermarkText,
  }));
  const [backSettings, setBackSettings] = useState<ProcessingSettings>(() => ({
    ...defaultSettings,
    text: initialWatermarkText,
  }));
  const frontEditCanvasRef = useRef<HTMLCanvasElement>(null);
  const backEditCanvasRef = useRef<HTMLCanvasElement>(null);
  const frontSelectionCanvasRef = useRef<HTMLCanvasElement>(null);
  const backSelectionCanvasRef = useRef<HTMLCanvasElement>(null);
  const frontFileInputRef = useRef<HTMLInputElement>(null);
  const backFileInputRef = useRef<HTMLInputElement>(null);
  const frontTouchHandlersRef = useRef<CanvasTouchHandlers | null>(null);
  const backTouchHandlersRef = useRef<CanvasTouchHandlers | null>(null);
  const frontUploadGenerationRef = useRef(0);
  const backUploadGenerationRef = useRef(0);
  const [isDraggingFront, setIsDraggingFront] = useState<boolean>(false);
  const [isDraggingBack, setIsDraggingBack] = useState<boolean>(false);
  const [isProcessingFront, setIsProcessingFront] = useState<boolean>(false);
  const [isProcessingBack, setIsProcessingBack] = useState<boolean>(false);
  const dragStateRef = useRef<WatermarkDragState>(createIdleWatermarkDragState());
  const multiTouchGestureRef = useRef<MultiTouchGesture>({ kind: 'idle' });
  const [activeWatermarkSide, setActiveWatermarkSide] =
    useState<WatermarkDragSide | null>(null);
  const [debugInfo, setDebugInfo] = useState<string[]>([]);

  useEffect(() => {
    const url = new URL(window.location.href);
    const legacyText = url.searchParams.get('text');

    if (!legacyText) return;

    const hashParams = new URLSearchParams(url.hash.slice(1));
    if (!hashParams.has('text')) {
      hashParams.set('text', legacyText);
    }

    url.searchParams.delete('text');
    const search = url.searchParams.toString();
    const hash = hashParams.toString();
    window.history.replaceState(
      window.history.state,
      '',
      `${url.pathname}${search ? `?${search}` : ''}${hash ? `#${hash}` : ''}`
    );
  }, []);

  useEffect(() => {
    const syncLocalizedWatermarkText = () => {
      const locale = router.locale || 'en';
      const localizedText = i18n.getFixedT(locale, 'common')('defaultWatermarkText');
      const defaultText = getDefaultText(localizedText);

      setFrontSettings(prev => ({ ...prev, text: defaultText }));
      setBackSettings(prev => ({ ...prev, text: defaultText }));
    };

    router.events.on('routeChangeComplete', syncLocalizedWatermarkText);
    return () => {
      router.events.off('routeChangeComplete', syncLocalizedWatermarkText);
    };
  }, [i18n, router]);

  const resetDragState = () => {
    dragStateRef.current = createIdleWatermarkDragState();
  };

  const resetMultiTouchGesture = () => {
    multiTouchGestureRef.current = { kind: 'idle' };
  };

  const beginImagePinch = (
    touches: TouchList,
    isFront: boolean,
    startScale: number
  ) => {
    if (touches.length < 2) return false;

    const side: PinchSide = isFront ? 'front' : 'back';
    multiTouchGestureRef.current = {
      kind: 'image',
      state: startPinchGesture(getPinchTouches(touches), side, startScale),
    };
    setActiveWatermarkSide(null);

    return true;
  };

  const beginWatermarkTransform = (
    touches: TouchList,
    isFront: boolean,
    textSize: number,
    rotation: number,
    preferredTouchIdentifier: number | null = null
  ) => {
    if (touches.length < 2) return false;

    const side: WatermarkDragSide = isFront ? 'front' : 'back';
    const transformTouches = getPinchTouches(touches);
    const preferredTouch = preferredTouchIdentifier === null
      ? null
      : transformTouches.find(
          touch => touch.identifier === preferredTouchIdentifier
        );
    const orderedTouches = preferredTouch
      ? [
          preferredTouch,
          ...transformTouches.filter(
            touch => touch.identifier !== preferredTouchIdentifier
          ),
        ]
      : transformTouches;

    multiTouchGestureRef.current = {
      kind: 'watermark',
      state: startWatermarkTransform(
        orderedTouches,
        side,
        textSize,
        rotation
      ),
    };
    setActiveWatermarkSide(side);

    return true;
  };

  const handleImageUpload = async (file: File, isFront: boolean) => {
    if (!file || !isSupportedImage(file)) return;

    resetDragState();
    resetMultiTouchGesture();
    setActiveWatermarkSide(null);

    const uploadGenerationRef = isFront ? frontUploadGenerationRef : backUploadGenerationRef;
    const setIsProcessing = isFront ? setIsProcessingFront : setIsProcessingBack;
    const requestId = ++uploadGenerationRef.current;
    setIsProcessing(true);

    try {
      let imageFile = file;
      // Convert HEIC to JPEG if needed
      if (isHeicImage(file)) {
        const heic2any = (await import('heic2any')).default;
        const blob = await heic2any({
          blob: file,
          toType: 'image/jpeg',
          quality: 1.0,
        });
        imageFile = new File([blob as Blob], file.name.replace(/\.[^/.]+$/, '.jpg'), {
          type: 'image/jpeg',
        });
      }

      if (uploadGenerationRef.current !== requestId) return;

      if (isFront) {
        setFrontSettings(prev => ({
          ...prev,
          imageScale: DEFAULT_IMAGE_SCALE,
          imageRotation: 0,
          xPosition: defaultSettings.xPosition,
          yPosition: defaultSettings.yPosition,
        }));
        setFrontImage(imageFile);
      } else {
        setBackSettings(prev => ({
          ...prev,
          imageScale: DEFAULT_IMAGE_SCALE,
          imageRotation: 0,
          xPosition: defaultSettings.xPosition,
          yPosition: defaultSettings.yPosition,
        }));
        setBackImage(imageFile);
      }
    } catch (error) {
      if (uploadGenerationRef.current === requestId) {
        const fileInput = isFront ? frontFileInputRef.current : backFileInputRef.current;
        if (fileInput) {
          fileInput.value = '';
        }
        console.error('Error processing image:', error);
      }
    } finally {
      if (uploadGenerationRef.current === requestId) {
        setIsProcessing(false);
      }
    }
  };

  const handleClearImages = () => {
    frontUploadGenerationRef.current += 1;
    backUploadGenerationRef.current += 1;
    setFrontImage(null);
    setBackImage(null);
    setIsDraggingFront(false);
    setIsDraggingBack(false);
    setIsProcessingFront(false);
    setIsProcessingBack(false);
    setDebugInfo([]);
    resetDragState();
    resetMultiTouchGesture();
    setActiveWatermarkSide(null);
    setFrontSettings(prev => ({
      ...prev,
      imageScale: DEFAULT_IMAGE_SCALE,
      imageRotation: 0,
      xPosition: defaultSettings.xPosition,
      yPosition: defaultSettings.yPosition,
    }));
    setBackSettings(prev => ({
      ...prev,
      imageScale: DEFAULT_IMAGE_SCALE,
      imageRotation: 0,
      xPosition: defaultSettings.xPosition,
      yPosition: defaultSettings.yPosition,
    }));

    if (frontFileInputRef.current) {
      frontFileInputRef.current.value = '';
    }
    if (backFileInputRef.current) {
      backFileInputRef.current.value = '';
    }
  };

  const handleRotateImage = (isFront: boolean, direction: RotationDirection) => {
    const setSettings = isFront ? setFrontSettings : setBackSettings;
    const imageDimensions = isFront ? frontImageDimensions : backImageDimensions;

    if (!imageDimensions) return;

    resetDragState();
    resetMultiTouchGesture();
    setActiveWatermarkSide(null);

    setSettings(prev => ({
      ...prev,
      ...getNextImageRotationState(
        imageDimensions,
        prev.imageRotation,
        prev.yPosition,
        direction
      ),
    }));
  };

  const handleResetWatermark = (isFront: boolean) => {
    const imageDimensions = isFront
      ? frontImageDimensions
      : backImageDimensions;
    const setSettings = isFront ? setFrontSettings : setBackSettings;

    if (!imageDimensions) return;

    resetDragState();
    resetMultiTouchGesture();
    setActiveWatermarkSide(null);
    setSettings(prev => resetWatermarkTransform(prev, imageDimensions));
  };

  const getCanvasPointer = (
    e: React.MouseEvent<HTMLCanvasElement> | TouchEvent,
    canvas: HTMLCanvasElement,
    expectedTouchIdentifier: number | null = null
  ) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    let clientX: number;
    let clientY: number;
    let input: WatermarkDragInput;
    let touchIdentifier: number | null = null;

    if ('touches' in e) {
      const targetTouches = Array.from(e.targetTouches);
      const touch = expectedTouchIdentifier === null
        ? targetTouches[0]
        : targetTouches.find(item => item.identifier === expectedTouchIdentifier);

      if (!touch) return null;

      clientX = touch.clientX;
      clientY = touch.clientY;
      input = 'touch';
      touchIdentifier = touch.identifier;
    } else {
      // Mouse event
      clientX = e.clientX;
      clientY = e.clientY;
      input = 'mouse';
    }

    return {
      point: {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY,
      },
      input,
      touchIdentifier,
    };
  };

  const handleStart = (e: React.MouseEvent<HTMLCanvasElement> | TouchEvent, isFront: boolean) => {
    const canvas = isFront ? frontEditCanvasRef.current : backEditCanvasRef.current;
    const settings = isFront ? frontSettings : backSettings;
    if (!canvas) return;

    resetDragState();

    const pointer = getCanvasPointer(e, canvas);
    if (!pointer) return;
    const { x, y } = pointer.point;

    // Get text metrics for accurate hitbox
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { hitboxWidth, hitboxHeight } = getWatermarkLayout(ctx, settings);

    const side: WatermarkDragSide = isFront ? 'front' : 'back';
    const dragState = startWatermarkDrag(
      pointer.point,
      { x: settings.xPosition, y: settings.yPosition },
      settings.rotation,
      hitboxWidth,
      hitboxHeight,
      side,
      pointer.input,
      pointer.touchIdentifier
    );
    dragStateRef.current = dragState;

    if (dragState.isDragging) {
      setActiveWatermarkSide(side);
      e.preventDefault();
    } else {
      setActiveWatermarkSide(currentSide =>
        currentSide === side ? null : currentSide
      );
    }
  };

  const handleMove = (e: React.MouseEvent<HTMLCanvasElement> | TouchEvent, isFront: boolean) => {
    const isTouchEvent = 'touches' in e;

    if (isTouchEvent && !dragStateRef.current.isDragging) return;

    const canvas = isFront ? frontEditCanvasRef.current : backEditCanvasRef.current;
    const settings = isFront ? frontSettings : backSettings;
    const setSettings = isFront ? setFrontSettings : setBackSettings;
    if (!canvas) return;

    const side: WatermarkDragSide = isFront ? 'front' : 'back';
    const expectedTouchIdentifier =
      dragStateRef.current.isDragging &&
      dragStateRef.current.side === side &&
      dragStateRef.current.input === 'touch'
        ? dragStateRef.current.touchIdentifier
        : null;
    const pointer = getCanvasPointer(e, canvas, expectedTouchIdentifier);
    if (!pointer) return;
    const { x, y } = pointer.point;

    const rotatedPoint = getPointInRotatedSpace(
      { x, y },
      { x: settings.xPosition, y: settings.yPosition },
      settings.rotation
    );

    // Get text metrics for accurate hitbox
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const {
      textWidth,
      textHeight,
      hitboxWidth,
      hitboxHeight,
    } = getWatermarkLayout(ctx, settings);

    const isInBox = isPointInWatermarkBounds(
      { x, y },
      { x: settings.xPosition, y: settings.yPosition },
      settings.rotation,
      hitboxWidth,
      hitboxHeight
    );

    // Update debug info
    setDebugInfo([
      `Mouse: (${Math.round(x)}, ${Math.round(y)})`,
      `Rotated: (${Math.round(rotatedPoint.x)}, ${Math.round(rotatedPoint.y)})`,
      `Text Center: (${Math.round(settings.xPosition)}, ${Math.round(settings.yPosition)})`,
      `Text Size: ${settings.textSize}px`,
      `Text Width: ${Math.round(textWidth)}px`,
      `Text Height: ${Math.round(textHeight)}px`,
      `Hit Box: ${Math.round(hitboxWidth)}x${Math.round(hitboxHeight)}`,
      `Hit Box X: ${Math.round(-hitboxWidth / 2)} to ${Math.round(hitboxWidth / 2)}`,
      `Hit Box Y: ${Math.round(-hitboxHeight / 2)} to ${Math.round(hitboxHeight / 2)}`,
      `In Box: ${isInBox}`,
      `Rotation: ${settings.rotation}°`,
    ]);

    // Update cursor style based on hover position (mouse only)
    if (!dragStateRef.current.isDragging && !isTouchEvent) {
      canvas.style.cursor = isInBox ? 'move' : 'default';
      return;
    }

    const dragMove = moveWatermarkDrag(
      dragStateRef.current,
      pointer.point,
      side,
      pointer.input,
      pointer.touchIdentifier
    );
    const dragDelta = dragMove.delta;

    if (dragDelta) {
      e.preventDefault();
      setSettings((prev) => ({
        ...prev,
        xPosition: prev.xPosition + dragDelta.x,
        yPosition: prev.yPosition + dragDelta.y,
      }));
      dragStateRef.current = dragMove.state;
    }
  };

  const handleEnd = () => {
    resetDragState();
    setActiveWatermarkSide(null);
  };

  const handleTouchStart = (
    e: TouchEvent,
    isFront: boolean
  ) => {
    const side: WatermarkDragSide = isFront ? 'front' : 'back';
    const activeGesture = multiTouchGestureRef.current;

    if (
      activeGesture.kind !== 'idle' &&
      activeGesture.state.side !== side
    ) {
      return;
    }

    if (e.targetTouches.length >= 2) {
      if (activeGesture.kind !== 'idle') {
        e.preventDefault();
        return;
      }

      const settings = isFront ? frontSettings : backSettings;
      const activeTouchIdentifiers = getPinchTouches(e.targetTouches).map(
        touch => touch.identifier
      );
      const shouldTransformWatermark = shouldStartWatermarkTransform(
        dragStateRef.current,
        side,
        activeTouchIdentifiers
      );
      const initiatingTouchIdentifier = dragStateRef.current.touchIdentifier;

      e.preventDefault();
      resetDragState();
      if (shouldTransformWatermark) {
        beginWatermarkTransform(
          e.targetTouches,
          isFront,
          settings.textSize,
          settings.rotation,
          initiatingTouchIdentifier
        );
      } else {
        beginImagePinch(e.targetTouches, isFront, settings.imageScale);
      }
      return;
    }

    resetMultiTouchGesture();
    handleStart(e, isFront);
  };

  const handleTouchMove = (
    e: TouchEvent,
    isFront: boolean
  ) => {
    const activeGesture = multiTouchGestureRef.current;
    const side: WatermarkDragSide = isFront ? 'front' : 'back';

    if (
      activeGesture.kind === 'watermark' &&
      activeGesture.state.side === side
    ) {
      e.preventDefault();
      const transformUpdate = updateWatermarkTransform(
        activeGesture.state,
        getPinchTouches(e.targetTouches),
        side
      );
      multiTouchGestureRef.current = {
        kind: 'watermark',
        state: transformUpdate.state,
      };

      if (
        transformUpdate.textSize !== null &&
        transformUpdate.rotation !== null
      ) {
        const textSize = transformUpdate.textSize;
        const rotation = transformUpdate.rotation;
        const setSettings = isFront ? setFrontSettings : setBackSettings;
        setSettings(prev => ({
          ...prev,
          textSize,
          rotation,
        }));
      }
      return;
    }

    if (activeGesture.kind === 'image' && activeGesture.state.side === side) {
      e.preventDefault();

      const pinchUpdate = updatePinchGesture(
        activeGesture.state,
        getPinchTouches(e.targetTouches),
        side
      );
      multiTouchGestureRef.current = {
        kind: 'image',
        state: pinchUpdate.state,
      };
      const imageScale = pinchUpdate.imageScale;

      if (imageScale !== null) {
        const setSettings = isFront ? setFrontSettings : setBackSettings;
        setSettings(prev => prev.imageScale === imageScale
          ? prev
          : { ...prev, imageScale });
      }
      return;
    }

    if (activeGesture.kind !== 'idle') return;

    if (e.targetTouches.length >= 2) {
      e.preventDefault();
      const settings = isFront ? frontSettings : backSettings;
      const activeTouchIdentifiers = getPinchTouches(e.targetTouches).map(
        touch => touch.identifier
      );
      const shouldTransformWatermark = shouldStartWatermarkTransform(
        dragStateRef.current,
        side,
        activeTouchIdentifiers
      );
      const initiatingTouchIdentifier = dragStateRef.current.touchIdentifier;

      resetDragState();
      if (shouldTransformWatermark) {
        beginWatermarkTransform(
          e.targetTouches,
          isFront,
          settings.textSize,
          settings.rotation,
          initiatingTouchIdentifier
        );
      } else {
        beginImagePinch(e.targetTouches, isFront, settings.imageScale);
      }
      return;
    }

    if (e.targetTouches.length === 1) {
      handleMove(e, isFront);
    }
  };

  const handleTouchEnd = (
    e: TouchEvent,
    isFront: boolean
  ) => {
    const activeGesture = multiTouchGestureRef.current;
    const side: WatermarkDragSide = isFront ? 'front' : 'back';

    if (
      activeGesture.kind === 'watermark' &&
      activeGesture.state.side === side
    ) {
      const nextState = endWatermarkTransform(
        activeGesture.state,
        getPinchTouches(e.targetTouches),
        side
      );
      multiTouchGestureRef.current = nextState.isTransforming
        ? { kind: 'watermark', state: nextState }
        : { kind: 'idle' };
      if (!nextState.isTransforming) {
        setActiveWatermarkSide(null);
      }
      resetDragState();
      return;
    }

    if (activeGesture.kind === 'image' && activeGesture.state.side === side) {
      const nextState = endPinchGesture(
        activeGesture.state,
        getPinchTouches(e.targetTouches),
        side
      );
      multiTouchGestureRef.current = nextState.isPinching
        ? { kind: 'image', state: nextState }
        : { kind: 'idle' };
      setActiveWatermarkSide(null);
      resetDragState();
      return;
    }

    if (activeGesture.kind !== 'idle') return;

    resetMultiTouchGesture();
    resetDragState();
    setActiveWatermarkSide(null);
  };

  const handleTouchCancel = (isFront: boolean) => {
    const activeGesture = multiTouchGestureRef.current;
    const side: WatermarkDragSide = isFront ? 'front' : 'back';

    if (
      activeGesture.kind !== 'idle' &&
      activeGesture.state.side !== side
    ) {
      return;
    }

    resetMultiTouchGesture();
    resetDragState();
    setActiveWatermarkSide(null);
  };

  useLayoutEffect(() => {
    frontTouchHandlersRef.current = {
      start: event => handleTouchStart(event, true),
      move: event => handleTouchMove(event, true),
      end: event => handleTouchEnd(event, true),
      cancel: () => handleTouchCancel(true),
    };
    backTouchHandlersRef.current = {
      start: event => handleTouchStart(event, false),
      move: event => handleTouchMove(event, false),
      end: event => handleTouchEnd(event, false),
      cancel: () => handleTouchCancel(false),
    };
  });

  useLayoutEffect(() => {
    const canvas = frontEditCanvasRef.current;
    if (!canvas) return;

    const handleNativeTouchStart = (event: TouchEvent) =>
      frontTouchHandlersRef.current?.start(event);
    const handleNativeTouchMove = (event: TouchEvent) =>
      frontTouchHandlersRef.current?.move(event);
    const handleNativeTouchEnd = (event: TouchEvent) =>
      frontTouchHandlersRef.current?.end(event);
    const handleNativeTouchCancel = () =>
      frontTouchHandlersRef.current?.cancel();
    const options: AddEventListenerOptions = { passive: false };

    canvas.addEventListener('touchstart', handleNativeTouchStart, options);
    canvas.addEventListener('touchmove', handleNativeTouchMove, options);
    canvas.addEventListener('touchend', handleNativeTouchEnd, options);
    canvas.addEventListener('touchcancel', handleNativeTouchCancel, options);

    return () => {
      canvas.removeEventListener('touchstart', handleNativeTouchStart);
      canvas.removeEventListener('touchmove', handleNativeTouchMove);
      canvas.removeEventListener('touchend', handleNativeTouchEnd);
      canvas.removeEventListener('touchcancel', handleNativeTouchCancel);
    };
  }, [frontImage]);

  useLayoutEffect(() => {
    const canvas = backEditCanvasRef.current;
    if (!canvas) return;

    const handleNativeTouchStart = (event: TouchEvent) =>
      backTouchHandlersRef.current?.start(event);
    const handleNativeTouchMove = (event: TouchEvent) =>
      backTouchHandlersRef.current?.move(event);
    const handleNativeTouchEnd = (event: TouchEvent) =>
      backTouchHandlersRef.current?.end(event);
    const handleNativeTouchCancel = () =>
      backTouchHandlersRef.current?.cancel();
    const options: AddEventListenerOptions = { passive: false };

    canvas.addEventListener('touchstart', handleNativeTouchStart, options);
    canvas.addEventListener('touchmove', handleNativeTouchMove, options);
    canvas.addEventListener('touchend', handleNativeTouchEnd, options);
    canvas.addEventListener('touchcancel', handleNativeTouchCancel, options);

    return () => {
      canvas.removeEventListener('touchstart', handleNativeTouchStart);
      canvas.removeEventListener('touchmove', handleNativeTouchMove);
      canvas.removeEventListener('touchend', handleNativeTouchEnd);
      canvas.removeEventListener('touchcancel', handleNativeTouchCancel);
    };
  }, [backImage]);

  const handleDownload = (canvas: HTMLCanvasElement, suffix: string) => {
    // For iOS Chrome compatibility
    const filename = `ic-${suffix}-crossed.jpg`;

    try {
      // Get data URL directly from the canvas
      const url = canvas.toDataURL('image/jpeg', 1.0);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;

      // iOS Chrome workaround: open in new tab if download attribute is not supported
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      const isChrome = /CriOS/.test(navigator.userAgent); // Chrome on iOS

      if (isIOS && isChrome) {
        // Convert canvas data to blob for better compatibility
        canvas.toBlob((blob) => {
          if (!blob) return;
          const blobUrl = window.URL.createObjectURL(blob);
          // Create new link with blob URL
          const newLink = document.createElement('a');
          newLink.href = blobUrl;
          newLink.download = filename;

          // Try download attribute first
          newLink.click();

          // Fallback: open in new tab
          setTimeout(() => {
            window.open(blobUrl, '_blank');
            // Clean up the blob URL
            window.URL.revokeObjectURL(blobUrl);
          }, 100);
        }, 'image/jpeg', 1.0);
      } else {
        // For other browsers, use the normal approach
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch (error) {
      console.error('Download error:', error);
      // Fallback: open in new tab with data URL
      const url = canvas.toDataURL('image/jpeg', 1.0);
      window.open(url, '_blank');
    }
  };

  const handleCombinedDownload = () => {
    if (!frontEditCanvasRef.current || !backEditCanvasRef.current) return;

    // Create a canvas to combine images
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size to fit both images vertically
    canvas.width = Math.max(frontEditCanvasRef.current.width, backEditCanvasRef.current.width);
    canvas.height = frontEditCanvasRef.current.height + backEditCanvasRef.current.height;

    // Fill with white background
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw front image at the top
    ctx.drawImage(frontEditCanvasRef.current, 0, 0);
    // Draw back image below front image
    ctx.drawImage(backEditCanvasRef.current, 0, frontEditCanvasRef.current.height);

    // Download the combined image
    handleDownload(canvas, 'combined');
  };

  useLayoutEffect(() => {
    if (frontLoadedImage && frontEditCanvasRef.current) {
      processImage(frontEditCanvasRef.current, frontLoadedImage, frontSettings);
    } else if (frontImage && frontEditCanvasRef.current) {
      clearCanvas(frontEditCanvasRef.current);
    }
  }, [frontImage, frontLoadedImage, frontSettings]);

  useLayoutEffect(() => {
    if (backLoadedImage && backEditCanvasRef.current) {
      processImage(backEditCanvasRef.current, backLoadedImage, backSettings);
    } else if (backImage && backEditCanvasRef.current) {
      clearCanvas(backEditCanvasRef.current);
    }
  }, [backImage, backLoadedImage, backSettings]);

  useLayoutEffect(() => {
    if (!frontSelectionCanvasRef.current || !frontEditCanvasRef.current) return;

    drawWatermarkSelection(
      frontSelectionCanvasRef.current,
      frontEditCanvasRef.current,
      frontSettings,
      activeWatermarkSide === 'front' && Boolean(frontLoadedImage)
    );
  }, [activeWatermarkSide, frontLoadedImage, frontSettings]);

  useLayoutEffect(() => {
    if (!backSelectionCanvasRef.current || !backEditCanvasRef.current) return;

    drawWatermarkSelection(
      backSelectionCanvasRef.current,
      backEditCanvasRef.current,
      backSettings,
      activeWatermarkSide === 'back' && Boolean(backLoadedImage)
    );
  }, [activeWatermarkSide, backLoadedImage, backSettings]);

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>, isFront: boolean) => {
    e.preventDefault();
    e.stopPropagation();
    if (isFront) {
      setIsDraggingFront(true);
    } else {
      setIsDraggingBack(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>, isFront: boolean) => {
    e.preventDefault();
    e.stopPropagation();
    if (isFront) {
      setIsDraggingFront(false);
    } else {
      setIsDraggingBack(false);
    }
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>, isFront: boolean) => {
    e.preventDefault();
    e.stopPropagation();

    if (isFront) {
      setIsDraggingFront(false);
    } else {
      setIsDraggingBack(false);
    }

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (isSupportedImage(file)) {
        await handleImageUpload(file, isFront);
      }
    }
  };

  return (
    <div className="min-h-screen bg-black text-white py-8">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-center mb-8">
          <h1 className="text-3xl font-bold text-center sm:text-left">{t('title')}</h1>
          <LanguageSwitcher />
        </div>

        <section
          aria-labelledby="privacy-title"
          className="mb-8 rounded-xl border border-emerald-800/70 bg-emerald-950/40 p-5 shadow-sm sm:p-6"
        >
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="max-w-3xl">
              <div className="inline-flex rounded-full border border-emerald-700 bg-emerald-950 px-3 py-1 text-xs font-semibold text-emerald-300">
                {t('privacyBadge')}
              </div>
              <h2 id="privacy-title" className="mt-3 text-2xl text-emerald-100">
                {t('privacyTitle')}
              </h2>
              <div className="mt-2 text-sm leading-6 text-gray-200">
                {t('privacySummary')}
              </div>
            </div>
            {(frontImage || backImage || isProcessingFront || isProcessingBack) && (
              <button
                type="button"
                onClick={handleClearImages}
                className="shrink-0 rounded-md border border-emerald-700 px-4 py-2 text-sm font-medium text-emerald-200 hover:bg-emerald-900/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
              >
                {t('clearImages')}
              </button>
            )}
          </div>
          <ul className="mt-5 grid grid-cols-3 gap-2 text-center text-xs leading-4 text-emerald-100 sm:text-sm">
            <li className="flex min-h-12 items-center justify-center rounded-md bg-emerald-950/70 px-2 py-2"><span aria-hidden="true">✓</span>&nbsp;{t('privacyPointLocal')}</li>
            <li className="flex min-h-12 items-center justify-center rounded-md bg-emerald-950/70 px-2 py-2"><span aria-hidden="true">✓</span>&nbsp;{t('privacyPointNoUpload')}</li>
            <li className="flex min-h-12 items-center justify-center rounded-md bg-emerald-950/70 px-2 py-2"><span aria-hidden="true">✓</span>&nbsp;{t('privacyPointNoStorage')}</li>
          </ul>
          <div className="mt-4 text-xs leading-5 text-gray-400">
            {t('privacySession')}
          </div>
        </section>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Front ID Section */}
          <div>
            <div className="bg-gray-900 rounded-lg shadow-sm p-6 mb-8">
              <h2 className="text-xl font-semibold mb-4">{t('frontID')}</h2>
              <div
                className={`border-2 border-dashed ${isDraggingFront ? 'border-blue-500 bg-gray-800' : 'border-gray-700'} rounded-lg p-6 text-center transition-colors duration-200`}
                onDragOver={(e) => handleDragOver(e, true)}
                onDragLeave={(e) => handleDragLeave(e, true)}
                onDrop={(e) => handleDrop(e, true)}
              >
                <input
                  ref={frontFileInputRef}
                  type="file"
                  accept="image/*,.heic,.heif"
                  onChange={(e) => handleImageUpload(e.target.files?.[0] as File, true)}
                  className="hidden"
                  id="front-upload"
                />
                <label
                  htmlFor="front-upload"
                  className="cursor-pointer block p-4 text-gray-400 hover:text-gray-200"
                >
                  <span className="block">
                    {isProcessingFront ? t('processingImage') : frontImage ? frontImage.name : isDraggingFront ? t('dropImageHere') : t('uploadFrontID')}
                  </span>
                  <span className="mt-2 block text-xs text-emerald-300">
                    {t('privacyUploadHint')}
                  </span>
                </label>
              </div>
            </div>

            {frontImage && (
              <>
                <div className="bg-gray-900 rounded-lg shadow-sm p-6 mb-8">
                  <h2 className="text-xl font-semibold mb-4">{t('frontWatermarkText')}</h2>
                  <input
                    type="text"
                    value={frontSettings.text}
                    onChange={(e) => setFrontSettings({ ...frontSettings, text: e.target.value })}
                    className="block w-full rounded-md border-gray-600 bg-gray-800 text-white shadow-xs focus:border-blue-500 focus:ring-blue-500 mb-4"
                  />
                  <div>
                    <label htmlFor="front-watermark-color" className="block text-sm font-medium text-gray-300 mb-2">
                      {t('watermarkColor')}: {frontSettings.color.toUpperCase()}
                    </label>
                    <input
                      id="front-watermark-color"
                      type="color"
                      value={frontSettings.color}
                      onChange={(e) => setFrontSettings({ ...frontSettings, color: e.target.value })}
                      className="block w-full h-10 rounded-md border border-gray-600 bg-gray-800 p-1 cursor-pointer mb-4"
                    />
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      {t('watermarkSize')}: {frontSettings.textSize}px
                    </label>
                    <input
                      type="range"
                      min={MIN_WATERMARK_TEXT_SIZE}
                      max={MAX_WATERMARK_TEXT_SIZE}
                      step="1"
                      value={frontSettings.textSize}
                      onChange={(e) => setFrontSettings({ ...frontSettings, textSize: parseInt(e.target.value) })}
                      className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer mb-4"
                    />
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      {t('rotation')}: {frontSettings.rotation}°
                    </label>
                    <input
                      type="range"
                      min="-180"
                      max="180"
                      step="1"
                      value={frontSettings.rotation}
                      onChange={(e) => setFrontSettings({ ...frontSettings, rotation: parseInt(e.target.value) })}
                      className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                    />
                  </div>
                </div>

                <div className="bg-gray-900 rounded-lg shadow-sm p-6 mb-8">
                  <div className="mb-4">
                    <h2 className="text-xl font-semibold">{t('editFrontWatermark')}</h2>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <RotateImageButton
                        direction="left"
                        disabled={!frontImageDimensions || isProcessingFront}
                        label={t('rotateImageLeft', { side: t('frontID') })}
                        onClick={() => handleRotateImage(true, 'left')}
                      />
                      <RotateImageButton
                        direction="right"
                        disabled={!frontImageDimensions || isProcessingFront}
                        label={t('rotateImageRight', { side: t('frontID') })}
                        onClick={() => handleRotateImage(true, 'right')}
                      />
                      <div className="flex items-center gap-2" role="group" aria-label={t('imageScale')}>
                        <ZoomImageButton
                          direction="out"
                          disabled={isProcessingFront || frontSettings.imageScale <= MIN_IMAGE_SCALE}
                          label={t('zoomOut', { side: t('frontID') })}
                          onClick={() => setFrontSettings((settings) => ({
                            ...settings,
                            imageScale: clampImageScale(settings.imageScale - IMAGE_SCALE_STEP),
                          }))}
                        />
                        <output className="min-w-12 text-center text-sm tabular-nums text-gray-300" aria-live="polite">
                          {(frontSettings.imageScale * 100).toFixed(0)}%
                        </output>
                        <ZoomImageButton
                          direction="in"
                          disabled={isProcessingFront || frontSettings.imageScale >= MAX_IMAGE_SCALE}
                          label={t('zoomIn', { side: t('frontID') })}
                          onClick={() => setFrontSettings((settings) => ({
                            ...settings,
                            imageScale: clampImageScale(settings.imageScale + IMAGE_SCALE_STEP),
                          }))}
                        />
                      </div>
                      <ResetWatermarkButton
                        disabled={!frontImageDimensions || isProcessingFront}
                        label={t('resetWatermark')}
                        description={t('resetWatermarkForSide', { side: t('frontID') })}
                        onClick={() => handleResetWatermark(true)}
                      />
                    </div>
                    <p id="front-touch-hint" className="mt-2 mb-0 text-xs leading-5 text-gray-400 sm:hidden">
                      {t('touchGesturesHint', { scale: (frontSettings.imageScale * 100).toFixed(0) })}
                    </p>
                  </div>
                  <div className="relative">
                    <canvas
                      ref={frontEditCanvasRef}
                      aria-label={t('editFrontWatermark')}
                      aria-describedby="front-touch-hint"
                      className="block w-full rounded-lg touch-pan-y bg-white"
                      onMouseDown={(e) => handleStart(e, true)}
                      onMouseMove={(e) => handleMove(e, true)}
                      onMouseUp={handleEnd}
                      onMouseLeave={handleEnd}
                    />
                    <canvas
                      ref={frontSelectionCanvasRef}
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 h-full w-full rounded-lg"
                    />
                    {(isFrontImageLoading || hasFrontImageError) && (
                      <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg bg-white/90 px-4 text-center">
                        <p className="text-sm text-gray-700">
                          {hasFrontImageError ? t('imageLoadError') : t('processingImage')}
                        </p>
                      </div>
                    )}
                  </div>
                  <div className="flex justify-center mt-4">
                    <button
                      type="button"
                      disabled={!frontLoadedImage}
                      onClick={() => frontLoadedImage && frontEditCanvasRef.current && handleDownload(frontEditCanvasRef.current, 'front')}
                      className="px-4 py-2 bg-gray-800 text-white rounded-sm hover:bg-gray-700 border border-gray-600 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {t('downloadFront')}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Back ID Section */}
          <div>
            <div className="bg-gray-900 rounded-lg shadow-sm p-6 mb-8">
              <h2 className="text-xl font-semibold mb-4">{t('backID')}</h2>
              <div
                className={`border-2 border-dashed ${isDraggingBack ? 'border-blue-500 bg-gray-800' : 'border-gray-700'} rounded-lg p-6 text-center transition-colors duration-200`}
                onDragOver={(e) => handleDragOver(e, false)}
                onDragLeave={(e) => handleDragLeave(e, false)}
                onDrop={(e) => handleDrop(e, false)}
              >
                <input
                  ref={backFileInputRef}
                  type="file"
                  accept="image/*,.heic,.heif"
                  onChange={(e) => handleImageUpload(e.target.files?.[0] as File, false)}
                  className="hidden"
                  id="back-upload"
                />
                <label
                  htmlFor="back-upload"
                  className="cursor-pointer block p-4 text-gray-400 hover:text-gray-200"
                >
                  <span className="block">
                    {isProcessingBack ? t('processingImage') : backImage ? backImage.name : isDraggingBack ? t('dropImageHere') : t('uploadBackID')}
                  </span>
                  <span className="mt-2 block text-xs text-emerald-300">
                    {t('privacyUploadHint')}
                  </span>
                </label>
              </div>
            </div>

            {backImage && (
              <>
                <div className="bg-gray-900 rounded-lg shadow-sm p-6 mb-8">
                  <h2 className="text-xl font-semibold mb-4">{t('backWatermarkText')}</h2>
                  <input
                    type="text"
                    value={backSettings.text}
                    onChange={(e) => setBackSettings({ ...backSettings, text: e.target.value })}
                    className="block w-full rounded-md border-gray-600 bg-gray-800 text-white shadow-xs focus:border-blue-500 focus:ring-blue-500 mb-4"
                  />
                  <div>
                    <label htmlFor="back-watermark-color" className="block text-sm font-medium text-gray-300 mb-2">
                      {t('watermarkColor')}: {backSettings.color.toUpperCase()}
                    </label>
                    <input
                      id="back-watermark-color"
                      type="color"
                      value={backSettings.color}
                      onChange={(e) => setBackSettings({ ...backSettings, color: e.target.value })}
                      className="block w-full h-10 rounded-md border border-gray-600 bg-gray-800 p-1 cursor-pointer mb-4"
                    />
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      {t('watermarkSize')}: {backSettings.textSize}px
                    </label>
                    <input
                      type="range"
                      min={MIN_WATERMARK_TEXT_SIZE}
                      max={MAX_WATERMARK_TEXT_SIZE}
                      step="1"
                      value={backSettings.textSize}
                      onChange={(e) => setBackSettings({ ...backSettings, textSize: parseInt(e.target.value) })}
                      className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer mb-4"
                    />
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      {t('rotation')}: {backSettings.rotation}°
                    </label>
                    <input
                      type="range"
                      min="-180"
                      max="180"
                      step="1"
                      value={backSettings.rotation}
                      onChange={(e) => setBackSettings({ ...backSettings, rotation: parseInt(e.target.value) })}
                      className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                    />
                  </div>
                </div>

                <div className="bg-gray-900 rounded-lg shadow-sm p-6 mb-8">
                  <div className="mb-4">
                    <h2 className="text-xl font-semibold">{t('editBackWatermark')}</h2>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <RotateImageButton
                        direction="left"
                        disabled={!backImageDimensions || isProcessingBack}
                        label={t('rotateImageLeft', { side: t('backID') })}
                        onClick={() => handleRotateImage(false, 'left')}
                      />
                      <RotateImageButton
                        direction="right"
                        disabled={!backImageDimensions || isProcessingBack}
                        label={t('rotateImageRight', { side: t('backID') })}
                        onClick={() => handleRotateImage(false, 'right')}
                      />
                      <div className="flex items-center gap-2" role="group" aria-label={t('imageScale')}>
                        <ZoomImageButton
                          direction="out"
                          disabled={isProcessingBack || backSettings.imageScale <= MIN_IMAGE_SCALE}
                          label={t('zoomOut', { side: t('backID') })}
                          onClick={() => setBackSettings((settings) => ({
                            ...settings,
                            imageScale: clampImageScale(settings.imageScale - IMAGE_SCALE_STEP),
                          }))}
                        />
                        <output className="min-w-12 text-center text-sm tabular-nums text-gray-300" aria-live="polite">
                          {(backSettings.imageScale * 100).toFixed(0)}%
                        </output>
                        <ZoomImageButton
                          direction="in"
                          disabled={isProcessingBack || backSettings.imageScale >= MAX_IMAGE_SCALE}
                          label={t('zoomIn', { side: t('backID') })}
                          onClick={() => setBackSettings((settings) => ({
                            ...settings,
                            imageScale: clampImageScale(settings.imageScale + IMAGE_SCALE_STEP),
                          }))}
                        />
                      </div>
                      <ResetWatermarkButton
                        disabled={!backImageDimensions || isProcessingBack}
                        label={t('resetWatermark')}
                        description={t('resetWatermarkForSide', { side: t('backID') })}
                        onClick={() => handleResetWatermark(false)}
                      />
                    </div>
                    <p id="back-touch-hint" className="mt-2 mb-0 text-xs leading-5 text-gray-400 sm:hidden">
                      {t('touchGesturesHint', { scale: (backSettings.imageScale * 100).toFixed(0) })}
                    </p>
                  </div>
                  <div className="relative">
                    <canvas
                      ref={backEditCanvasRef}
                      aria-label={t('editBackWatermark')}
                      aria-describedby="back-touch-hint"
                      className="block w-full rounded-lg touch-pan-y bg-white"
                      onMouseDown={(e) => handleStart(e, false)}
                      onMouseMove={(e) => handleMove(e, false)}
                      onMouseUp={handleEnd}
                      onMouseLeave={handleEnd}
                    />
                    <canvas
                      ref={backSelectionCanvasRef}
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 h-full w-full rounded-lg"
                    />
                    {(isBackImageLoading || hasBackImageError) && (
                      <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg bg-white/90 px-4 text-center">
                        <p className="text-sm text-gray-700">
                          {hasBackImageError ? t('imageLoadError') : t('processingImage')}
                        </p>
                      </div>
                    )}
                  </div>
                  <div className="flex justify-center mt-4">
                    <button
                      type="button"
                      disabled={!backLoadedImage}
                      onClick={() => backLoadedImage && backEditCanvasRef.current && handleDownload(backEditCanvasRef.current, 'back')}
                      className="px-4 py-2 bg-gray-800 text-white rounded-sm hover:bg-gray-700 border border-gray-600 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {t('downloadBack')}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Combined Download Button */}
        {frontLoadedImage && backLoadedImage && (
          <div className="text-center mt-8">
            <button
              onClick={handleCombinedDownload}
              className="px-6 py-3 bg-gray-800 text-white rounded-lg hover:bg-gray-700 border border-gray-600 font-semibold"
            >
              {t('downloadCombined')}
            </button>
          </div>
        )}

        {/* Help Section */}
        <div className="mt-12 bg-gray-900 rounded-lg shadow-sm p-6">
          <h2 className="text-xl font-semibold mb-4">{t('tips')}</h2>
          <div className="text-gray-300 space-y-2">
            <p>• {t('tipDragDrop')}</p>
            <p>• {t('tipDrag')}</p>
            <p>• {t('tipSliders')}</p>
            <p>• {t('tipCustomize')} <code className="bg-gray-800 px-2 py-1 rounded-sm">#text=YOUR_TEXT</code> {t('example')}</p>
            <p className="text-sm text-gray-400">{t('example')}: {typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}#text=SAMPLE%20ONLY` : 'https://youjing.dev/palang-ic#text=SAMPLE%20ONLY'}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
