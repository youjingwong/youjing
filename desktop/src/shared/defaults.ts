import type { AppSettings, WatermarkPreset, WatermarkSettings } from "./types";

export const defaultWatermark: WatermarkSettings = {
  text: "FOR PRIVATE USE ONLY",
  color: "#111827",
  opacity: 0.72,
  fontSize: 52,
  rotation: -35,
  x: 4 / 15,
  y: 0.3,
  align: "center",
  lineHeight: 1.18,
  uppercase: true,
  dateEnabled: false,
  crossingLines: {
    enabled: true,
    color: "#111827",
    opacity: 0.72,
    thickness: 5,
    scale: 0.42,
  },
};

export const defaultPresets: WatermarkPreset[] = [
  {
    ...defaultWatermark,
    id: "default-employment",
    name: "Employment application",
    text: "FOR EMPLOYMENT APPLICATION ONLY",
  },
  {
    ...defaultWatermark,
    id: "default-bank",
    name: "Bank application",
    text: "FOR BANK APPLICATION ONLY",
  },
  {
    ...defaultWatermark,
    id: "default-rental",
    name: "Property rental",
    text: "FOR PROPERTY RENTAL ONLY",
  },
];

export const defaultSettings: AppSettings = {
  language: "en",
  theme: "system",
  defaultExportFormat: "png",
  defaultExportQuality: "high",
  rememberRecentText: true,
  lockEnabled: false,
  lockWhenMinimized: true,
  autoLockMinutes: 5,
  defaultWatermark,
};
