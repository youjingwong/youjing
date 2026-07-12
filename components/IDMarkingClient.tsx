import { useTranslation } from 'next-i18next/pages';
import { useRouter } from 'next/router';
import { useEffect, useRef, useState } from 'react';
import {
  getNextImageRotationState,
  getRotatedImageDimensions,
  normalizeRotation,
  OUTPUT_CANVAS_WIDTH,
  type ImageDimensions,
  type RotationDirection,
} from '../lib/imageRotation';
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

interface DragState {
  isDragging: boolean;
  startX: number;
  startY: number;
  startRotation: number;
  startSize: number;
  type: 'move' | 'rotate' | 'resize' | null;
}

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
  textSize: 48,
  rotation: -45,
  xPosition: 400,
  yPosition: 300,
  imageScale: 1.0,  // 100%
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
      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-gray-700 bg-gray-800 text-gray-300 transition-colors hover:border-gray-600 hover:bg-gray-700 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400 disabled:cursor-not-allowed disabled:opacity-50 sm:h-8 sm:w-8"
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

export default function IDMarkingClient() {
  const { t, i18n } = useTranslation('common');
  const router = useRouter();
  const initialWatermarkText = getDefaultText(t('defaultWatermarkText'));
  const [frontImage, setFrontImage] = useState<File | null>(null);
  const [backImage, setBackImage] = useState<File | null>(null);
  const [frontImageDimensions, setFrontImageDimensions] = useState<ImageDimensions | null>(null);
  const [backImageDimensions, setBackImageDimensions] = useState<ImageDimensions | null>(null);
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
  const frontFileInputRef = useRef<HTMLInputElement>(null);
  const backFileInputRef = useRef<HTMLInputElement>(null);
  const frontUploadGenerationRef = useRef(0);
  const backUploadGenerationRef = useRef(0);
  const [isDraggingFront, setIsDraggingFront] = useState<boolean>(false);
  const [isDraggingBack, setIsDraggingBack] = useState<boolean>(false);
  const [isProcessingFront, setIsProcessingFront] = useState<boolean>(false);
  const [isProcessingBack, setIsProcessingBack] = useState<boolean>(false);
  const dragStateRef = useRef<DragState>({
    isDragging: false,
    startX: 0,
    startY: 0,
    startRotation: 0,
    startSize: 0,
    type: null,
  });
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

  const handleImageUpload = async (file: File, isFront: boolean) => {
    if (!file || !isSupportedImage(file)) return;

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
        setFrontImageDimensions(null);
        setFrontSettings(prev => ({
          ...prev,
          imageRotation: 0,
          xPosition: defaultSettings.xPosition,
          yPosition: defaultSettings.yPosition,
        }));
        setFrontImage(imageFile);
      } else {
        setBackImageDimensions(null);
        setBackSettings(prev => ({
          ...prev,
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
    setFrontImageDimensions(null);
    setBackImageDimensions(null);
    setIsDraggingFront(false);
    setIsDraggingBack(false);
    setIsProcessingFront(false);
    setIsProcessingBack(false);
    setDebugInfo([]);
    setFrontSettings(prev => ({
      ...prev,
      imageRotation: 0,
      xPosition: defaultSettings.xPosition,
      yPosition: defaultSettings.yPosition,
    }));
    setBackSettings(prev => ({
      ...prev,
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

  const getCanvasPosition = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    let clientX, clientY;

    if ('touches' in e) {
      // Touch event
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      // Mouse event
      clientX = e.clientX;
      clientY = e.clientY;
    }

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  };

  const handleStart = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>, isFront: boolean) => {
    e.preventDefault();
    const canvas = isFront ? frontEditCanvasRef.current : backEditCanvasRef.current;
    const settings = isFront ? frontSettings : backSettings;
    if (!canvas) return;

    const { x, y } = getCanvasPosition(e, canvas);

    // Transform click/touch coordinates to account for watermark rotation
    const centerX = settings.xPosition;
    const centerY = settings.yPosition;
    const angle = (settings.rotation * Math.PI) / 180;

    // Translate point to origin
    const dx = x - centerX;
    const dy = y - centerY;

    // Rotate point
    const rotatedX = dx * Math.cos(-angle) - dy * Math.sin(-angle);
    const rotatedY = dx * Math.sin(-angle) + dy * Math.cos(-angle);

    // Get text metrics for accurate hitbox
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    ctx.font = `${settings.textSize}px "Outfit"`;
    const textMetrics = ctx.measureText(settings.text);
    const textWidth = textMetrics.width;
    const textHeight = textMetrics.actualBoundingBoxAscent + textMetrics.actualBoundingBoxDescent;
    const lineExtension = 50; // Extra length beyond text on each side
    const lineSpacing = textHeight * 1.2; // Space between text and lines
    ctx.restore();

    // Calculate hitbox dimensions based on text metrics
    const hitboxWidth = textWidth + (lineExtension * 2); // Text width plus line extensions
    const hitboxHeight = (lineSpacing * 2) + textHeight; // Height including lines and text

    // Check if point is within watermark bounds
    const isInBox =
      rotatedX >= -hitboxWidth / 2 && // left bound
      rotatedX <= hitboxWidth / 2 && // right bound
      rotatedY >= -hitboxHeight / 2 && // top bound
      rotatedY <= hitboxHeight / 2; // bottom bound

    if (isInBox) {
      dragStateRef.current = {
        isDragging: true,
        startX: x,
        startY: y,
        startRotation: settings.rotation,
        startSize: settings.textSize,
        type: 'move',
      };
    }
  };

  const handleMove = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>, isFront: boolean) => {
    e.preventDefault();
    const canvas = isFront ? frontEditCanvasRef.current : backEditCanvasRef.current;
    const settings = isFront ? frontSettings : backSettings;
    const setSettings = isFront ? setFrontSettings : setBackSettings;
    if (!canvas) return;

    const { x, y } = getCanvasPosition(e, canvas);

    // Transform coordinates to check hover state
    const dx = x - settings.xPosition;
    const dy = y - settings.yPosition;
    const angle = (settings.rotation * Math.PI) / 180;
    const rotatedX = dx * Math.cos(-angle) - dy * Math.sin(-angle);
    const rotatedY = dx * Math.sin(-angle) + dy * Math.cos(-angle);

    // Get text metrics for accurate hitbox
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    ctx.font = `${settings.textSize}px "Outfit"`;
    const textMetrics = ctx.measureText(settings.text);
    const textWidth = textMetrics.width;
    const textHeight = textMetrics.actualBoundingBoxAscent + textMetrics.actualBoundingBoxDescent;
    const lineExtension = 50;
    const lineSpacing = textHeight * 1.2;
    ctx.restore();

    // Calculate hitbox dimensions based on text metrics
    const hitboxWidth = textWidth + (lineExtension * 2);
    const hitboxHeight = (lineSpacing * 2) + textHeight;

    const isInBox =
      rotatedX >= -hitboxWidth / 2 &&
      rotatedX <= hitboxWidth / 2 &&
      rotatedY >= -hitboxHeight / 2 &&
      rotatedY <= hitboxHeight / 2;

    // Update debug info
    setDebugInfo([
      `Mouse: (${Math.round(x)}, ${Math.round(y)})`,
      `Rotated: (${Math.round(rotatedX)}, ${Math.round(rotatedY)})`,
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
    if (!dragStateRef.current.isDragging && !('touches' in e)) {
      canvas.style.cursor = isInBox ? 'move' : 'default';
      return;
    }

    if (dragStateRef.current.type === 'move') {
      const dx = x - dragStateRef.current.startX;
      const dy = y - dragStateRef.current.startY;
      setSettings((prev) => ({
        ...prev,
        xPosition: prev.xPosition + dx,
        yPosition: prev.yPosition + dy,
      }));
      dragStateRef.current.startX = x;
      dragStateRef.current.startY = y;
    }
  };

  const handleEnd = () => {
    dragStateRef.current.isDragging = false;
  };

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

  const processImage = (
    canvas: HTMLCanvasElement,
    image: HTMLImageElement,
    settings: ProcessingSettings,
    showControls = false
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

    // Set canvas dimensions based on the rotated image orientation.
    canvas.width = OUTPUT_CANVAS_WIDTH;
    canvas.height = OUTPUT_CANVAS_WIDTH * (rotatedDimensions.height / rotatedDimensions.width);

    // Clear canvas
    ctx.fillStyle = '#FFFFFF'; // White background
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw the scaled image around the canvas center so quarter turns remain uncropped.
    const baseScale = canvas.width / rotatedDimensions.width;
    const width = sourceWidth * baseScale * settings.imageScale;
    const height = sourceHeight * baseScale * settings.imageScale;

    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((imageRotation * Math.PI) / 180);
    ctx.drawImage(image, -width / 2, -height / 2, width, height);
    ctx.restore();

    // Save context state
    ctx.save();

    // Transform context for rotated text and lines
    ctx.translate(settings.xPosition, settings.yPosition);
    ctx.rotate((settings.rotation * Math.PI) / 180);

    // Set up text properties
    ctx.font = `${settings.textSize}px "Outfit"`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Measure text to position lines
    const textMetrics = ctx.measureText(settings.text);
    const textWidth = textMetrics.width;
    const textHeight = textMetrics.actualBoundingBoxAscent + textMetrics.actualBoundingBoxDescent;
    const lineExtension = 50; // Extra length beyond text on each side
    const lineSpacing = textHeight * 1.2; // Space between text and lines
    const lineStart = -textWidth / 2 - lineExtension;
    const lineEnd = textWidth / 2 + lineExtension;

    // Draw lines
    ctx.beginPath();
    ctx.lineWidth = settings.lineWidth;
    ctx.strokeStyle = settings.color;

    // First line (top)
    ctx.moveTo(lineStart, -lineSpacing);
    ctx.lineTo(lineEnd, -lineSpacing);
    ctx.stroke();

    // Second line (bottom)
    ctx.moveTo(lineStart, lineSpacing);
    ctx.lineTo(lineEnd, lineSpacing);
    ctx.stroke();

    // Draw text
    ctx.fillStyle = settings.color;
    ctx.fillText(settings.text, 0, 0);

    // Restore context state
    ctx.restore();
  };

  useEffect(() => {
    let cancelled = false;
    const objectUrls = new Set<string>();
    const cancelImageLoads = new Set<() => void>();

    const updateCanvas = async (
      image: File,
      editCanvas: HTMLCanvasElement | null,
      settings: ProcessingSettings,
      setImageDimensions: (dimensions: ImageDimensions) => void
    ) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(image);
      objectUrls.add(objectUrl);

      try {
        await new Promise<void>((resolve, reject) => {
          const clearHandlers = () => {
            img.onload = null;
            img.onerror = null;
          };
          const cancelLoad = () => {
            clearHandlers();
            img.src = '';
            reject(new DOMException('Image load cancelled', 'AbortError'));
          };

          cancelImageLoads.add(cancelLoad);
          img.onload = () => {
            cancelImageLoads.delete(cancelLoad);
            clearHandlers();
            resolve();
          };
          img.onerror = () => {
            cancelImageLoads.delete(cancelLoad);
            clearHandlers();
            reject(new Error('Unable to decode the selected image'));
          };
          img.src = objectUrl;
        });

        if (!cancelled) {
          setImageDimensions({
            width: img.naturalWidth || img.width,
            height: img.naturalHeight || img.height,
          });

          if (editCanvas) {
            processImage(editCanvas, img, settings, true);
          }
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Error loading image:', error);
        }
      } finally {
        if (objectUrls.delete(objectUrl)) {
          URL.revokeObjectURL(objectUrl);
        }
      }
    };

    if (frontImage) {
      updateCanvas(
        frontImage,
        frontEditCanvasRef.current,
        frontSettings,
        setFrontImageDimensions
      );
    }

    if (backImage) {
      updateCanvas(
        backImage,
        backEditCanvasRef.current,
        backSettings,
        setBackImageDimensions
      );
    }

    return () => {
      cancelled = true;
      cancelImageLoads.forEach((cancelLoad) => cancelLoad());
      cancelImageLoads.clear();
      objectUrls.forEach((objectUrl) => URL.revokeObjectURL(objectUrl));
      objectUrls.clear();
    };
  }, [frontImage, backImage, frontSettings, backSettings]);

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
                  <h2 className="text-xl font-semibold mb-4">{t('frontImageSettings')}</h2>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      {t('imageScale')}: {(frontSettings.imageScale * 100).toFixed(0)}%
                    </label>
                    <input
                      type="range"
                      min="0.5"
                      max="1.0"
                      step="0.05"
                      value={frontSettings.imageScale}
                      onChange={(e) => setFrontSettings({ ...frontSettings, imageScale: parseFloat(e.target.value) })}
                      className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer mb-4"
                    />
                  </div>
                </div>

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
                      min="12"
                      max="200"
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
                  <div className="mb-4 flex items-center gap-2">
                    <h2 className="text-xl font-semibold">{t('editFrontWatermark')}</h2>
                    <div className="flex shrink-0 items-center gap-1">
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
                    </div>
                  </div>
                  <div className="relative">
                    <canvas
                      ref={frontEditCanvasRef}
                      className="w-full rounded-lg touch-none bg-white"
                      onMouseDown={(e) => handleStart(e, true)}
                      onMouseMove={(e) => handleMove(e, true)}
                      onMouseUp={handleEnd}
                      onMouseLeave={handleEnd}
                      onTouchStart={(e) => handleStart(e, true)}
                      onTouchMove={(e) => handleMove(e, true)}
                      onTouchEnd={handleEnd}
                    />
                    {!frontImage && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <p className="text-gray-400">{t('uploadImageToEdit')}</p>
                      </div>
                    )}
                  </div>
                  <div className="flex justify-center mt-4">
                    <button
                      onClick={() => frontEditCanvasRef.current && handleDownload(frontEditCanvasRef.current, 'front')}
                      className="px-4 py-2 bg-gray-800 text-white rounded-sm hover:bg-gray-700 border border-gray-600"
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
                  <h2 className="text-xl font-semibold mb-4">{t('backImageSettings')}</h2>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      {t('imageScale')}: {(backSettings.imageScale * 100).toFixed(0)}%
                    </label>
                    <input
                      type="range"
                      min="0.5"
                      max="1.0"
                      step="0.05"
                      value={backSettings.imageScale}
                      onChange={(e) => setBackSettings({ ...backSettings, imageScale: parseFloat(e.target.value) })}
                      className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer mb-4"
                    />
                  </div>
                </div>

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
                      min="12"
                      max="200"
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
                  <div className="mb-4 flex items-center gap-2">
                    <h2 className="text-xl font-semibold">{t('editBackWatermark')}</h2>
                    <div className="flex shrink-0 items-center gap-1">
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
                    </div>
                  </div>
                  <div className="relative">
                    <canvas
                      ref={backEditCanvasRef}
                      className="w-full rounded-lg touch-none bg-white"
                      onMouseDown={(e) => handleStart(e, false)}
                      onMouseMove={(e) => handleMove(e, false)}
                      onMouseUp={handleEnd}
                      onMouseLeave={handleEnd}
                      onTouchStart={(e) => handleStart(e, false)}
                      onTouchMove={(e) => handleMove(e, false)}
                      onTouchEnd={handleEnd}
                    />
                    {!backImage && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <p className="text-gray-400">{t('uploadImageToEdit')}</p>
                      </div>
                    )}
                  </div>
                  <div className="flex justify-center mt-4">
                    <button
                      onClick={() => backEditCanvasRef.current && handleDownload(backEditCanvasRef.current, 'back')}
                      className="px-4 py-2 bg-gray-800 text-white rounded-sm hover:bg-gray-700 border border-gray-600"
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
        {frontImage && backImage && (
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
