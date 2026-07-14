import type {
  AppSettings,
  DocumentEditorState,
  ImageInfo,
  Profile,
  ProfileEditorStateUpdate,
  VaultData,
  WatermarkPreset,
  WatermarkSettings,
} from "./types";

const INVALID_FILENAME = /[<>:"/\\|?*\u0000-\u001f]/g;

export function sanitizeFilename(
  value: string,
  fallback = "palang-ic",
): string {
  const cleaned = value
    .normalize("NFKC")
    .replace(INVALID_FILENAME, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[. -]+|[. -]+$/g, "");
  return (cleaned || fallback).slice(0, 120);
}

export function assertString(
  value: unknown,
  field: string,
  max = 200,
): asserts value is string {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    throw new Error(`Invalid ${field}`);
}

export function assertId(value: unknown): asserts value is string {
  if (typeof value !== "string" || !/^[a-f0-9-]{20,50}$/i.test(value))
    throw new Error("Invalid identifier");
}

export function initials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => Array.from(part)[0]?.toUpperCase())
      .join("") || "?"
  );
}

export function validateVaultUpdate(
  value: unknown,
): Partial<
  Pick<
    VaultData,
    "settings" | "presets" | "recentRecipients" | "recentPurposes"
  >
> {
  if (!isRecord(value)) throw new Error("Invalid vault update");
  const allowed = new Set([
    "settings",
    "presets",
    "recentRecipients",
    "recentPurposes",
  ]);
  if (Object.keys(value).some((key) => !allowed.has(key)))
    throw new Error("Unsupported vault update");
  const result: Partial<
    Pick<
      VaultData,
      "settings" | "presets" | "recentRecipients" | "recentPurposes"
    >
  > = {};
  if (value.settings !== undefined)
    result.settings = validateSettings(value.settings);
  if (value.presets !== undefined) {
    if (!Array.isArray(value.presets) || value.presets.length > 100)
      throw new Error("Invalid presets");
    result.presets = value.presets.map(validatePreset);
  }
  if (value.recentRecipients !== undefined)
    result.recentRecipients = validateRecent(value.recentRecipients);
  if (value.recentPurposes !== undefined)
    result.recentPurposes = validateRecent(value.recentPurposes);
  return result;
}

export function validateVaultData(value: unknown): VaultData {
  if (
    !isRecord(value) ||
    value.version !== 2 ||
    !Array.isArray(value.profiles) ||
    !Array.isArray(value.images) ||
    !Array.isArray(value.presets) ||
    !Array.isArray(value.recentRecipients) ||
    !Array.isArray(value.recentPurposes)
  )
    throw new Error("Vault metadata is damaged");
  if (value.profiles.length > 10_000 || value.images.length > 20_000)
    throw new Error("Vault metadata is too large");
  const profiles = value.profiles.map(validateProfile);
  const images = value.images.map(validateImageInfo);
  assertUnique(
    profiles.map((profile) => profile.id),
    "profile identifiers",
  );
  assertUnique(
    images.map((image) => image.id),
    "image identifiers",
  );
  const imageIds = new Set(images.map((image) => image.id));
  const referencedImageIds: string[] = [];
  for (const profile of profiles)
    for (const imageId of [profile.frontImageId, profile.backImageId])
      if (imageId) {
        if (!imageIds.has(imageId))
          throw new Error("Vault contains a missing image reference");
        referencedImageIds.push(imageId);
      }
  assertUnique(referencedImageIds, "image references");
  if (referencedImageIds.length !== images.length)
    throw new Error("Vault contains unreferenced image metadata");
  return {
    version: 2,
    profiles,
    images,
    presets: validateVaultUpdate({ presets: value.presets }).presets!,
    recentRecipients: validateRecent(value.recentRecipients),
    recentPurposes: validateRecent(value.recentPurposes),
    settings: validateSettings(value.settings),
  };
}

function validateProfile(value: unknown): Profile {
  if (!isRecord(value)) throw new Error("Invalid profile");
  assertId(value.id);
  assertString(value.name, "profile name", 100);
  if (
    (value.documentLabel !== undefined &&
      (typeof value.documentLabel !== "string" ||
        value.documentLabel.length > 100)) ||
    typeof value.frontImageId !== "string" ||
    !Number.isInteger(value.order) ||
    Number(value.order) < 0 ||
    !isDate(value.createdAt) ||
    !isDate(value.updatedAt)
  )
    throw new Error("Invalid profile");
  if (value.frontImageId) assertId(value.frontImageId);
  if (value.backImageId !== undefined) assertId(value.backImageId);
  if (value.backImageId && !value.frontImageId)
    throw new Error("A back image requires a front image");
  return {
    id: value.id,
    name: value.name,
    documentLabel: value.documentLabel as string | undefined,
    frontImageId: value.frontImageId,
    backImageId: value.backImageId as string | undefined,
    frontEditorState:
      value.frontEditorState === undefined
        ? undefined
        : validateDocumentEditorState(value.frontEditorState),
    backEditorState:
      value.backEditorState === undefined
        ? undefined
        : validateDocumentEditorState(value.backEditorState),
    order: value.order as number,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

function validateImageInfo(value: unknown): ImageInfo {
  if (!isRecord(value)) throw new Error("Invalid image metadata");
  assertId(value.id);
  if (
    ![
      "image/png",
      "image/jpeg",
      "image/webp",
      "image/heic",
      "image/heif",
    ].includes(String(value.mimeType)) ||
    !Number.isInteger(value.width) ||
    !Number.isInteger(value.height) ||
    Number(value.width) < 1 ||
    Number(value.height) < 1 ||
    Number(value.width) > 50_000 ||
    Number(value.height) > 50_000 ||
    !isDate(value.createdAt) ||
    !isDate(value.updatedAt) ||
    (value.qualityWarning !== undefined &&
      !["low-resolution", "possibly-blurry"].includes(
        String(value.qualityWarning),
      ))
  )
    throw new Error("Invalid image metadata");
  return {
    id: value.id,
    mimeType: value.mimeType as string,
    width: value.width as number,
    height: value.height as number,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    qualityWarning: value.qualityWarning as ImageInfo["qualityWarning"],
  };
}

function validateSettings(value: unknown): AppSettings {
  if (
    !isRecord(value) ||
    !["en", "ms"].includes(String(value.language)) ||
    (value.theme !== undefined &&
      !["system", "light", "dark"].includes(String(value.theme))) ||
    !["jpeg", "png", "pdf"].includes(String(value.defaultExportFormat)) ||
    !["standard", "high", "maximum"].includes(
      String(value.defaultExportQuality),
    ) ||
    typeof value.rememberRecentText !== "boolean" ||
    typeof value.lockEnabled !== "boolean" ||
    typeof value.lockWhenMinimized !== "boolean" ||
    ![0, 1, 5, 15, 30].includes(Number(value.autoLockMinutes))
  )
    throw new Error("Invalid settings");
  if (
    value.defaultExportFolder !== undefined &&
    (typeof value.defaultExportFolder !== "string" ||
      value.defaultExportFolder.length > 1000)
  )
    throw new Error("Invalid export folder");
  if (
    value.lastBackupAt !== undefined &&
    (typeof value.lastBackupAt !== "string" ||
      !Number.isFinite(Date.parse(value.lastBackupAt)))
  )
    throw new Error("Invalid backup date");
  return {
    language: value.language as AppSettings["language"],
    theme: value.theme as AppSettings["theme"],
    defaultExportFormat:
      value.defaultExportFormat as AppSettings["defaultExportFormat"],
    defaultExportQuality:
      value.defaultExportQuality as AppSettings["defaultExportQuality"],
    defaultExportFolder: value.defaultExportFolder as string | undefined,
    rememberRecentText: value.rememberRecentText,
    lockEnabled: value.lockEnabled,
    lockWhenMinimized: value.lockWhenMinimized,
    autoLockMinutes: value.autoLockMinutes as AppSettings["autoLockMinutes"],
    lastBackupAt: value.lastBackupAt as string | undefined,
    defaultWatermark: validateWatermark(value.defaultWatermark),
  };
}

function validatePreset(value: unknown): WatermarkPreset {
  if (!isRecord(value)) throw new Error("Invalid preset");
  assertString(value.id, "preset id", 100);
  assertString(value.name, "preset name", 100);
  return {
    id: value.id,
    name: value.name,
    ...validateWatermark(value),
  };
}

function validateWatermark(value: unknown): WatermarkSettings {
  if (!isRecord(value)) throw new Error("Invalid watermark settings");
  if (
    typeof value.text !== "string" ||
    value.text.length > 1000 ||
    !isColor(value.color) ||
    !within(value.opacity, 0.05, 1) ||
    !within(value.fontSize, 8, 300) ||
    !within(value.rotation, -180, 180) ||
    !within(value.x, 0, 1) ||
    !within(value.y, 0, 1) ||
    !["left", "center", "right"].includes(String(value.align)) ||
    !within(value.lineHeight, 0.5, 3) ||
    typeof value.uppercase !== "boolean" ||
    typeof value.dateEnabled !== "boolean" ||
    !isRecord(value.crossingLines)
  )
    throw new Error("Invalid watermark settings");
  const lines = value.crossingLines;
  if (
    typeof lines.enabled !== "boolean" ||
    !isColor(lines.color) ||
    !within(lines.opacity, 0.05, 1) ||
    !within(lines.thickness, 0.5, 40) ||
    !within(lines.scale, 0.1, 1.5)
  )
    throw new Error("Invalid crossing lines");
  return {
    text: value.text,
    color: value.color,
    opacity: value.opacity,
    fontSize: value.fontSize,
    rotation: value.rotation,
    x: value.x,
    y: value.y,
    align: value.align as WatermarkSettings["align"],
    lineHeight: value.lineHeight,
    uppercase: value.uppercase,
    dateEnabled: value.dateEnabled,
    crossingLines: {
      enabled: lines.enabled,
      color: lines.color,
      opacity: lines.opacity,
      thickness: lines.thickness,
      scale: lines.scale,
    },
  };
}

export function validateProfileEditorState(
  value: unknown,
): ProfileEditorStateUpdate {
  if (!isRecord(value) || !isRecord(value.front))
    throw new Error("Invalid editor state");
  const front = validateDocumentEditorState(value.front);
  const back =
    value.back === undefined
      ? undefined
      : validateDocumentEditorState(value.back);
  return { front, back };
}

function validateDocumentEditorState(value: unknown): DocumentEditorState {
  const imageRotation = isRecord(value) ? (value.imageRotation ?? 0) : 0;
  if (
    !isRecord(value) ||
    !within(value.imageScale, 0.5, 3) ||
    ![0, 90, 180, 270].includes(Number(imageRotation)) ||
    !isRecord(value.watermark)
  )
    throw new Error("Invalid editor state");
  return {
    imageScale: value.imageScale,
    imageRotation: imageRotation as DocumentEditorState["imageRotation"],
    watermark: validateWatermark(value.watermark),
  };
}

function validateRecent(value: unknown): string[] {
  if (
    !Array.isArray(value) ||
    value.length > 20 ||
    value.some((item) => typeof item !== "string" || item.length > 200)
  )
    throw new Error("Invalid recent entries");
  return value as string[];
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function within(value: unknown, min: number, max: number): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= min &&
    value <= max
  );
}
function isColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}
function isDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}
function assertUnique(values: string[], field: string): void {
  if (new Set(values).size !== values.length)
    throw new Error(`Duplicate ${field}`);
}
