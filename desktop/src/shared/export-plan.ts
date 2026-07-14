import type { ExportMode, ImageSide } from "./types";

export type ExportPlan =
  | { kind: "single"; side: ImageSide }
  | { kind: "combined"; sides: ["front", "back"] }
  | { kind: "separate"; sides: ["front", "back"] };

export function createExportPlan(
  mode: ExportMode,
  hasBack: boolean,
): ExportPlan {
  if (mode === "front" || !hasBack) return { kind: "single", side: "front" };
  if (mode === "back") return { kind: "single", side: "back" };
  return { kind: mode, sides: ["front", "back"] };
}
