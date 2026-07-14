import { describe, expect, it } from "vitest";
import { clampNormalized, normalizeLegacyWatermarkText } from "./watermark";
import { defaultWatermark } from "./defaults";

describe("normalized watermark positions", () => {
  it("keeps the watermark reachable on the canvas", () => {
    expect(clampNormalized(-5)).toBe(0.04);
    expect(clampNormalized(2)).toBe(0.96);
    expect(clampNormalized(Number.NaN)).toBe(0.5);
  });
});

describe("recommended watermark placement", () => {
  it("starts in the upper-left quadrant like the web editor", () => {
    expect(defaultWatermark.x).toBeCloseTo(4 / 15);
    expect(defaultWatermark.y).toBe(0.3);
  });
});

describe("legacy desktop watermark templates", () => {
  it("removes retired recipient and purpose placeholders", () => {
    expect(
      normalizeLegacyWatermarkText("FOR {RECIPIENT}\n{PURPOSE} ONLY"),
    ).toBe("FOR PRIVATE USE ONLY");
    expect(
      normalizeLegacyWatermarkText(
        "FOR {RECIPIENT}\nEMPLOYMENT APPLICATION ONLY",
      ),
    ).toBe("FOR EMPLOYMENT APPLICATION ONLY");
  });
});
