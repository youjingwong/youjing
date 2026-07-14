import { describe, expect, it } from "vitest";
import { defaultPresets, defaultSettings } from "./defaults";
import {
  initials,
  sanitizeFilename,
  validateProfileEditorState,
  validateVaultUpdate,
} from "./validation";

describe("filename sanitization", () => {
  it("removes platform-invalid characters and caps length", () => {
    expect(sanitizeFilename("You Jing / ABC:Bank?")).toBe("You-Jing-ABC-Bank");
    expect(sanitizeFilename("x".repeat(200))).toHaveLength(120);
  });

  it("never returns an empty filename", () =>
    expect(sanitizeFilename("...")).toBe("palang-ic"));
});

describe("profile initials", () => {
  it("uses at most two words and supports Unicode", () => {
    expect(initials("You Jing Wong")).toBe("YJ");
    expect(initials("陈 小明")).toBe("陈小");
  });
});

describe("vault IPC validation", () => {
  it("accepts bounded settings and presets", () =>
    expect(
      validateVaultUpdate({
        settings: defaultSettings,
        presets: defaultPresets,
      }).presets,
    ).toHaveLength(defaultPresets.length));

  it("rejects unknown fields and off-canvas preset positions", () => {
    expect(() => validateVaultUpdate({ arbitrary: true })).toThrow();
    expect(() =>
      validateVaultUpdate({ presets: [{ ...defaultPresets[0], x: 4 }] }),
    ).toThrow();
  });

  it("accepts supported themes and rejects unknown appearances", () => {
    expect(
      validateVaultUpdate({
        settings: { ...defaultSettings, theme: "dark" },
      }).settings?.theme,
    ).toBe("dark");
    expect(() =>
      validateVaultUpdate({
        settings: { ...defaultSettings, theme: "neon" },
      }),
    ).toThrow();
  });

  it("validates persisted per-side editor state", () => {
    const state = validateProfileEditorState({
      front: {
        watermark: {
          ...defaultSettings.defaultWatermark,
          id: "preset-metadata",
          name: "Preset metadata",
        },
        imageScale: 1.4,
        imageRotation: 90,
      },
    });
    expect(state.front.imageScale).toBe(1.4);
    expect(state.front.imageRotation).toBe(90);
    expect(state.front.watermark).not.toHaveProperty("id");
    expect(state.front.watermark).not.toHaveProperty("name");
    expect(() =>
      validateProfileEditorState({
        front: { watermark: defaultSettings.defaultWatermark, imageScale: 8 },
      }),
    ).toThrow();
    expect(() =>
      validateProfileEditorState({
        front: {
          watermark: defaultSettings.defaultWatermark,
          imageScale: 1,
          imageRotation: 45,
        },
      }),
    ).toThrow();
  });

  it("defaults legacy editor states to an unrotated image", () => {
    expect(
      validateProfileEditorState({
        front: {
          watermark: defaultSettings.defaultWatermark,
          imageScale: 1,
        },
      }).front.imageRotation,
    ).toBe(0);
  });
});
