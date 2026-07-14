export type ImageSide = "front" | "back";
export type ExportFormat = "jpeg" | "png" | "pdf";
export type ExportQuality = "standard" | "high" | "maximum";
export type ThemePreference = "system" | "light" | "dark";
export type ImageRotation = 0 | 90 | 180 | 270;

export interface Profile {
  id: string;
  name: string;
  documentLabel?: string;
  frontImageId: string;
  backImageId?: string;
  frontEditorState?: DocumentEditorState;
  backEditorState?: DocumentEditorState;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface ImageInfo {
  id: string;
  mimeType: string;
  width: number;
  height: number;
  createdAt: string;
  updatedAt: string;
  qualityWarning?: "low-resolution" | "possibly-blurry";
}

export interface CrossingLines {
  enabled: boolean;
  color: string;
  opacity: number;
  thickness: number;
  scale: number;
}

export type ExportMode = "front" | "back" | "combined" | "separate";

export interface WatermarkSettings {
  text: string;
  color: string;
  opacity: number;
  fontSize: number;
  rotation: number;
  x: number;
  y: number;
  align: "left" | "center" | "right";
  lineHeight: number;
  uppercase: boolean;
  dateEnabled: boolean;
  crossingLines: CrossingLines;
}

export interface DocumentEditorState {
  watermark: WatermarkSettings;
  imageScale: number;
  imageRotation: ImageRotation;
}

export interface ProfileEditorStateUpdate {
  front: DocumentEditorState;
  back?: DocumentEditorState;
}

export interface WatermarkPreset extends WatermarkSettings {
  id: string;
  name: string;
}

export interface AppSettings {
  language: "en" | "ms";
  theme?: ThemePreference;
  defaultExportFormat: ExportFormat;
  defaultExportQuality: ExportQuality;
  defaultExportFolder?: string;
  rememberRecentText: boolean;
  lockEnabled: boolean;
  lockWhenMinimized: boolean;
  autoLockMinutes: 0 | 1 | 5 | 15 | 30;
  lastBackupAt?: string;
  defaultWatermark: WatermarkSettings;
}

export interface VaultData {
  version: 2;
  profiles: Profile[];
  images: ImageInfo[];
  presets: WatermarkPreset[];
  recentRecipients: string[];
  recentPurposes: string[];
  settings: AppSettings;
}

export interface ProfileWithImages extends Profile {
  frontDataUrl: string;
  backDataUrl?: string;
  frontError?: boolean;
  backError?: boolean;
}

export interface BackupPreview {
  version: number;
  profiles: Array<Pick<Profile, "id" | "name" | "documentLabel" | "updatedAt">>;
}

export interface ExportRequest {
  dataUrl: string;
  suggestedName: string;
  format: ExportFormat;
  defaultFolder?: string;
}

export type RestoreConflict = "keep" | "replace" | "copy";
