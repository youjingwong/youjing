import { useEffect, useRef, useState } from 'react';

interface ProcessingSettings {
  text: string;
  lineWidth: number;
  textSize: number;
  rotation: number;
  xPosition: number;
  yPosition: number;
  imageScale: number;
}

interface DragState {
  isDragging: boolean;
  startX: number;
  startY: number;
  startRotation: number;
  startSize: number;
  type: 'move' | 'rotate' | 'resize' | null;
}

const defaultSettings: ProcessingSettings = {
  text: 'FOR PRIVATE USE ONLY',
  lineWidth: 5,
  textSize: 48,
  rotation: -45,
  xPosition: 400,
  yPosition: 300,
  imageScale: 1.0,  // 100%
};

export default function IDMarkingClient() {
  const [frontImage, setFrontImage] = useState<File | null>(null);
  const [backImage, setBackImage] = useState<File | null>(null);
  const [frontSettings, setFrontSettings] = useState<ProcessingSettings>(defaultSettings);
  const [backSettings, setBackSettings] = useState<ProcessingSettings>(defaultSettings);
  const [processedFrontUrl, setProcessedFrontUrl] = useState<string>('');
  const [processedBackUrl, setProcessedBackUrl] = useState<string>('');
  const frontCanvasRef = useRef<HTMLCanvasElement>(null);
  const backCanvasRef = useRef<HTMLCanvasElement>(null);
  const frontEditCanvasRef = useRef<HTMLCanvasElement>(null);
  const backEditCanvasRef = useRef<HTMLCanvasElement>(null);
  const dragStateRef = useRef<DragState>({
    isDragging: false,
    startX: 0,
    startY: 0,
    startRotation: 0,
    startSize: 0,
    type: null,
  });
  const [debugInfo, setDebugInfo] = useState<string[]>([]);

  const handleImageUpload = async (file: File, isFront: boolean) => {
    if (!file) return;

    let imageFile = file;
    // Convert HEIC to JPEG if needed
    if (file.type === 'image/heic' || file.type === 'image/heif') {
      try {
        const heic2any = (await import('heic2any')).default;
        const blob = await heic2any({
          blob: file,
          toType: 'image/jpeg',
          quality: 1.0,
        });
        imageFile = new File([blob as Blob], file.name.replace(/\.[^/.]+$/, '.jpg'), {
          type: 'image/jpeg',
        });
      } catch (error) {
        console.error('Error converting HEIC image:', error);
        return;
      }
    }

    if (isFront) {
      setFrontImage(imageFile);
    } else {
      setBackImage(imageFile);
    }
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

    // Check if point is within watermark bounds
    const boxWidth = 400;
    const boxHeight = 100;
    const isInBox =
      rotatedX >= -100 && // left bound
      rotatedX <= boxWidth - 100 && // right bound
      rotatedY >= -50 && // top bound
      rotatedY <= boxHeight - 50; // bottom bound

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

    // Update cursor style based on hover position (mouse only)
    if (!dragStateRef.current.isDragging && !('touches' in e)) {
      // Transform coordinates to check hover state
      const dx = x - settings.xPosition;
      const dy = y - settings.yPosition;
      const angle = (settings.rotation * Math.PI) / 180;
      const rotatedX = dx * Math.cos(-angle) - dy * Math.sin(-angle);
      const rotatedY = dx * Math.sin(-angle) + dy * Math.cos(-angle);

      const boxWidth = 400;
      const boxHeight = 100;

      const isInBox =
        rotatedX >= -100 &&
        rotatedX <= boxWidth - 100 &&
        rotatedY >= -50 &&
        rotatedY <= boxHeight - 50;

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

  const handleDownload = (url: string, suffix: string) => {
    // For iOS Chrome compatibility
    const filename = `ic-${suffix}-crossed.jpg`;

    // Try the traditional approach first
    try {
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;

      // iOS Chrome workaround: open in new tab if download attribute is not supported
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      const isChrome = /CriOS/.test(navigator.userAgent); // Chrome on iOS

      if (isIOS && isChrome) {
        // Convert base64 to blob for better compatibility
        fetch(url)
          .then(res => res.blob())
          .then(blob => {
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
          });
      } else {
        // For other browsers, use the normal approach
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch (error) {
      console.error('Download error:', error);
      // Fallback: open in new tab
      window.open(url, '_blank');
    }
  };

  const handleCombinedDownload = () => {
    if (!processedFrontUrl || !processedBackUrl) return;

    // Create temporary images to get dimensions
    const frontImg = new Image();
    const backImg = new Image();

    frontImg.src = processedFrontUrl;
    backImg.src = processedBackUrl;

    // Wait for both images to load
    Promise.all([
      new Promise(resolve => frontImg.onload = resolve),
      new Promise(resolve => backImg.onload = resolve)
    ]).then(() => {
      // Create a canvas to combine images
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Set canvas size to fit both images vertically
      canvas.width = Math.max(frontImg.width, backImg.width);
      canvas.height = frontImg.height + backImg.height;

      // Fill with white background
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw front image at the top
      ctx.drawImage(frontImg, 0, 0);
      // Draw back image below front image
      ctx.drawImage(backImg, 0, frontImg.height);

      // Convert to JPEG and handle download with the same iOS Chrome compatibility
      const combinedUrl = canvas.toDataURL('image/jpeg', 1.0);
      handleDownload(combinedUrl, 'combined');
    });
  };

  const processImage = (
    canvas: HTMLCanvasElement,
    image: HTMLImageElement,
    settings: ProcessingSettings,
    showControls = false
  ) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas dimensions
    canvas.width = 1500; // Fixed canvas size
    canvas.height = 1500 * (image.height / image.width); // Maintain aspect ratio

    // Clear canvas
    ctx.fillStyle = '#FFFFFF'; // White background
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Calculate dimensions to fill width at 100% scale
    const width = canvas.width * settings.imageScale;
    const height = (canvas.width * (image.height / image.width)) * settings.imageScale;

    // Center the scaled image
    const x = (canvas.width - width) / 2;
    const y = (canvas.height - height) / 2;

    // Draw image
    ctx.drawImage(image, x, y, width, height);

    // Save context state
    ctx.save();

    // Transform context for rotated text and lines
    ctx.translate(settings.xPosition, settings.yPosition);
    ctx.rotate((settings.rotation * Math.PI) / 180);

    // Draw bounding box first (behind everything)
    ctx.strokeStyle = 'rgba(33, 150, 243, 0.5)';  // Semi-transparent blue
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    const boxWidth = 400;
    const boxHeight = 100;
    ctx.strokeRect(-100, -50, boxWidth, boxHeight);
    ctx.setLineDash([]);

    // Set up text properties
    ctx.font = `${settings.textSize}px Arial`;
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
    ctx.strokeStyle = 'black';

    // First line (top)
    ctx.moveTo(lineStart, -lineSpacing);
    ctx.lineTo(lineEnd, -lineSpacing);
    ctx.stroke();

    // Second line (bottom)
    ctx.moveTo(lineStart, lineSpacing);
    ctx.lineTo(lineEnd, lineSpacing);
    ctx.stroke();

    // Draw text
    ctx.fillStyle = 'black';
    ctx.fillText(settings.text, 0, 0);

    // Restore context state
    ctx.restore();
  };

  useEffect(() => {
    const updateCanvases = async (
      image: File,
      editCanvas: HTMLCanvasElement | null,
      previewCanvas: HTMLCanvasElement | null,
      settings: ProcessingSettings,
      setPreviewUrl: (url: string) => void,
      isNearResizeHandle = false
    ) => {
      const img = new Image();
      img.src = URL.createObjectURL(image);
      await new Promise((resolve) => (img.onload = resolve));

      if (previewCanvas) {
        processImage(previewCanvas, img, settings, false);
        setPreviewUrl(previewCanvas.toDataURL('image/jpeg', 1.0));
      }
      if (editCanvas) {
        processImage(editCanvas, img, settings, true);
      }
    };

    if (frontImage) {
      updateCanvases(
        frontImage,
        frontEditCanvasRef.current,
        frontCanvasRef.current,
        frontSettings,
        setProcessedFrontUrl
      );
    }

    if (backImage) {
      updateCanvases(
        backImage,
        backEditCanvasRef.current,
        backCanvasRef.current,
        backSettings,
        setProcessedBackUrl
      );
    }
  }, [frontImage, backImage, frontSettings, backSettings]);

  return (
    <div className="min-h-screen bg-black text-white py-8">
      {/* Debug info overlay */}
      <div className="fixed top-4 right-4 bg-black bg-opacity-75 p-4 rounded-lg font-mono text-sm z-50">
        {debugInfo.map((text, i) => (
          <div key={i} className="whitespace-pre">{text}</div>
        ))}
      </div>

      <div className="max-w-7xl mx-auto px-4">
        <h1 className="text-3xl font-bold text-center mb-8">MyKad Cross Out & Watermark Tool</h1>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Front ID Section */}
          <div>
            <div className="bg-gray-900 rounded-lg shadow p-6 mb-8">
              <h2 className="text-xl font-semibold mb-4">Front ID</h2>
              <div className="border-2 border-dashed border-gray-700 rounded-lg p-6 text-center">
                <input
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
                  {frontImage ? frontImage.name : 'Upload Front ID Image'}
                </label>
              </div>
            </div>

            {frontImage && (
              <>
                <div className="bg-gray-900 rounded-lg shadow p-6 mb-8">
                  <h2 className="text-xl font-semibold mb-4">Front Image Settings</h2>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Image Scale: {(frontSettings.imageScale * 100).toFixed(0)}%
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

                <div className="bg-gray-900 rounded-lg shadow p-6 mb-8">
                  <h2 className="text-xl font-semibold mb-4">Front Watermark Text</h2>
                  <input
                    type="text"
                    value={frontSettings.text}
                    onChange={(e) => setFrontSettings({ ...frontSettings, text: e.target.value })}
                    className="block w-full rounded-md border-gray-600 bg-gray-800 text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 mb-4"
                  />
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Watermark Size: {frontSettings.textSize}px
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
                      Rotation: {frontSettings.rotation}°
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

                <div className="bg-gray-900 rounded-lg shadow p-6 mb-8">
                  <h2 className="text-xl font-semibold mb-4">Edit Front Watermark</h2>
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
                        <p className="text-gray-400">Upload an image to edit watermark</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="bg-gray-900 rounded-lg shadow p-6 mb-8">
                  <h2 className="text-xl font-semibold mb-4">Front Preview</h2>
                  <canvas ref={frontCanvasRef} className="hidden" />
                  {processedFrontUrl && (
                    <div className="relative">
                      <img src={processedFrontUrl} alt="Processed Front IC" className="w-full rounded-lg mb-4" />
                      <div className="flex justify-center">
                        <button
                          onClick={() => handleDownload(processedFrontUrl, 'front')}
                          className="px-4 py-2 bg-gray-800 text-white rounded hover:bg-gray-700 border border-gray-600"
                        >
                          Download Front
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Back ID Section */}
          <div>
            <div className="bg-gray-900 rounded-lg shadow p-6 mb-8">
              <h2 className="text-xl font-semibold mb-4">Back ID</h2>
              <div className="border-2 border-dashed border-gray-700 rounded-lg p-6 text-center">
                <input
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
                  {backImage ? backImage.name : 'Upload Back ID Image'}
                </label>
              </div>
            </div>

            {backImage && (
              <>
                <div className="bg-gray-900 rounded-lg shadow p-6 mb-8">
                  <h2 className="text-xl font-semibold mb-4">Back Image Settings</h2>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Image Scale: {(backSettings.imageScale * 100).toFixed(0)}%
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

                <div className="bg-gray-900 rounded-lg shadow p-6 mb-8">
                  <h2 className="text-xl font-semibold mb-4">Back Watermark Text</h2>
                  <input
                    type="text"
                    value={backSettings.text}
                    onChange={(e) => setBackSettings({ ...backSettings, text: e.target.value })}
                    className="block w-full rounded-md border-gray-600 bg-gray-800 text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 mb-4"
                  />
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Watermark Size: {backSettings.textSize}px
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
                      Rotation: {backSettings.rotation}°
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

                <div className="bg-gray-900 rounded-lg shadow p-6 mb-8">
                  <h2 className="text-xl font-semibold mb-4">Edit Back Watermark</h2>
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
                        <p className="text-gray-400">Upload an image to edit watermark</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="bg-gray-900 rounded-lg shadow p-6 mb-8">
                  <h2 className="text-xl font-semibold mb-4">Back Preview</h2>
                  <canvas ref={backCanvasRef} className="hidden" />
                  {processedBackUrl && (
                    <div className="relative">
                      <img src={processedBackUrl} alt="Processed Back IC" className="w-full rounded-lg mb-4" />
                      <div className="flex justify-center">
                        <button
                          onClick={() => handleDownload(processedBackUrl, 'back')}
                          className="px-4 py-2 bg-gray-800 text-white rounded hover:bg-gray-700 border border-gray-600"
                        >
                          Download Back
                        </button>
                      </div>
                    </div>
                  )}
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
              Download Combined Image
            </button>
          </div>
        )}
      </div>
    </div>
  );
} 