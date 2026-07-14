import { useCallback, useEffect, useRef, useState } from "react";
import type { MessageKey } from "./localization";

interface Props {
  dataUrl: string;
  t: (key: MessageKey) => string;
  onCancel: () => void;
  onConfirm: (dataUrl: string) => Promise<void>;
}

export default function ImagePreparationDialog({
  dataUrl,
  t,
  onCancel,
  onConfirm,
}: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const image = useRef<HTMLImageElement | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0, width: 1, height: 1 });
  const [rotation, setRotation] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [busy, setBusy] = useState(false);
  const [imageRevision, setImageRevision] = useState(0);

  const drawPreview = useCallback(() => {
    const target = canvas.current,
      source = image.current;
    if (!target || !source) return;
    drawTransformed(target, source, rotation, flipped);
    const ctx = target.getContext("2d")!;
    const mapped = cropRect(target.width, target.height, crop);
    ctx.fillStyle = "rgba(9, 18, 13, .58)";
    ctx.fillRect(0, 0, target.width, mapped.y);
    ctx.fillRect(
      0,
      mapped.y + mapped.height,
      target.width,
      target.height - mapped.y - mapped.height,
    );
    ctx.fillRect(0, mapped.y, mapped.x, mapped.height);
    ctx.fillRect(
      mapped.x + mapped.width,
      mapped.y,
      target.width - mapped.x - mapped.width,
      mapped.height,
    );
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = Math.max(3, target.width / 400);
    ctx.setLineDash([target.width / 80, target.width / 120]);
    ctx.strokeRect(mapped.x, mapped.y, mapped.width, mapped.height);
  }, [crop, flipped, rotation]);

  useEffect(() => {
    image.current = null;
    const next = new Image();
    next.onload = () => {
      image.current = next;
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
    drawPreview();
  }, [drawPreview, imageRevision]);

  function setIdentityRatio() {
    const target = canvas.current;
    if (!target) return;
    const desired = 1.586;
    const availableRatio = target.width / target.height;
    if (availableRatio > desired) {
      const width = desired / availableRatio;
      setCrop({ x: (1 - width) / 2, y: 0, width, height: 1 });
    } else {
      const height = availableRatio / desired;
      setCrop({ x: 0, y: (1 - height) / 2, width: 1, height });
    }
  }

  async function confirm() {
    const preview = canvas.current,
      source = image.current;
    if (!preview || !source) return;
    setBusy(true);
    try {
      const clean = document.createElement("canvas");
      drawTransformed(clean, source, rotation, flipped);
      const rect = cropRect(clean.width, clean.height, crop);
      const output = document.createElement("canvas");
      output.width = rect.width;
      output.height = rect.height;
      output
        .getContext("2d")!
        .drawImage(
          clean,
          rect.x,
          rect.y,
          rect.width,
          rect.height,
          0,
          0,
          rect.width,
          rect.height,
        );
      await onConfirm(output.toDataURL("image/png"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop">
      <div
        className="modal image-prep-modal"
        role="dialog"
        aria-modal="true"
        aria-label={t("prepareImage")}
      >
        <div className="modal-header">
          <h2>{t("prepareImage")}</h2>
          <button onClick={onCancel} aria-label={t("close")}>
            ×
          </button>
        </div>
        <div className="image-prep-body">
          <div className="prep-canvas">
            <canvas ref={canvas} />
          </div>
          <div className="prep-actions">
            <button onClick={() => setRotation((value) => value - 90)}>
              ↶ {t("rotateLeft")}
            </button>
            <button onClick={() => setRotation((value) => value + 90)}>
              ↷ {t("rotateRight")}
            </button>
            <button
              className={flipped ? "active" : ""}
              onClick={() => setFlipped((value) => !value)}
            >
              ↔ {t("flipHorizontal")}
            </button>
            <button onClick={setIdentityRatio}>▭ {t("idRatio")}</button>
            <button
              onClick={() => {
                setCrop({ x: 0, y: 0, width: 1, height: 1 });
                setRotation(0);
                setFlipped(false);
              }}
            >
              ↺ {t("reset")}
            </button>
          </div>
          <div className="crop-controls">
            <CropRange
              label={t("cropLeft")}
              value={crop.x}
              max={Math.max(0, 1 - crop.width)}
              onChange={(x) => setCrop((value) => ({ ...value, x }))}
            />
            <CropRange
              label={t("cropTop")}
              value={crop.y}
              max={Math.max(0, 1 - crop.height)}
              onChange={(y) => setCrop((value) => ({ ...value, y }))}
            />
            <CropRange
              label={t("cropWidth")}
              value={crop.width}
              min={0.2}
              max={1 - crop.x}
              onChange={(width) => setCrop((value) => ({ ...value, width }))}
            />
            <CropRange
              label={t("cropHeight")}
              value={crop.height}
              min={0.2}
              max={1 - crop.y}
              onChange={(height) => setCrop((value) => ({ ...value, height }))}
            />
          </div>
        </div>
        <div className="dialog-actions prep-footer">
          <button onClick={onCancel}>{t("cancel")}</button>
          <button
            className="primary"
            disabled={busy}
            onClick={() => void confirm()}
          >
            {busy ? "…" : t("confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}

function CropRange({
  label,
  value,
  min = 0,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <label>
      {label}
      <div className="range-row">
        <input
          type="range"
          min={min}
          max={max}
          step="0.005"
          value={Math.min(value, max)}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        <output>{Math.round(value * 100)}%</output>
      </div>
    </label>
  );
}

function cropRect(
  width: number,
  height: number,
  crop: { x: number; y: number; width: number; height: number },
) {
  return {
    x: Math.round(crop.x * width),
    y: Math.round(crop.y * height),
    width: Math.max(1, Math.round(crop.width * width)),
    height: Math.max(1, Math.round(crop.height * height)),
  };
}

function drawTransformed(
  target: HTMLCanvasElement,
  source: HTMLImageElement,
  rotation: number,
  flipped: boolean,
) {
  const quarterTurn = Math.abs(rotation % 180) === 90;
  target.width = quarterTurn ? source.naturalHeight : source.naturalWidth;
  target.height = quarterTurn ? source.naturalWidth : source.naturalHeight;
  const ctx = target.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, target.width, target.height);
  ctx.save();
  ctx.translate(target.width / 2, target.height / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.scale(flipped ? -1 : 1, 1);
  ctx.drawImage(source, -source.naturalWidth / 2, -source.naturalHeight / 2);
  ctx.restore();
}
