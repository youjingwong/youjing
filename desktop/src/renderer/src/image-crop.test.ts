import { describe, expect, it } from "vitest";
import {
  FULL_CROP,
  ID_CARD_RATIO,
  MIN_CROP_SIZE,
  boundedOutputDimensions,
  cropOutputIsLargeEnough,
  cropZoomPercent,
  flipCrop,
  identityCardCrop,
  moveCrop,
  pixelCrop,
  resizeCrop,
  rotationAfterVisualTurn,
  rotateCrop,
  scaleCrop,
  transformedImageSize,
} from "./image-crop";

describe("image crop geometry", () => {
  it("clamps crop movement at every image edge", () => {
    const crop = { x: 0.25, y: 0.25, width: 0.5, height: 0.5 };
    expect(moveCrop(crop, -2, -2)).toEqual({
      x: 0,
      y: 0,
      width: 0.5,
      height: 0.5,
    });
    expect(moveCrop(crop, 2, 2)).toEqual({
      x: 0.5,
      y: 0.5,
      width: 0.5,
      height: 0.5,
    });
  });

  it("resizes every edge without escaping the image or collapsing", () => {
    const crop = { x: 0.2, y: 0.2, width: 0.6, height: 0.6 };
    expect(resizeCrop(crop, "north-west", -1, -1)).toEqual({
      x: 0,
      y: 0,
      width: 0.8,
      height: 0.8,
    });
    const tiny = resizeCrop(crop, "south-east", -1, -1);
    expect(tiny.width).toBeCloseTo(MIN_CROP_SIZE);
    expect(tiny.height).toBeCloseTo(MIN_CROP_SIZE);
  });

  it("clamps all eight resize handles at the crop minimum", () => {
    const crop = { x: 0.2, y: 0.2, width: 0.6, height: 0.6 };
    const inwardMoves = [
      ["north", 0, 1, false, true],
      ["north-east", -1, 1, true, true],
      ["east", -1, 0, true, false],
      ["south-east", -1, -1, true, true],
      ["south", 0, -1, false, true],
      ["south-west", 1, -1, true, true],
      ["west", 1, 0, true, false],
      ["north-west", 1, 1, true, true],
    ] as const;
    for (const [handle, dx, dy, shrinksWidth, shrinksHeight] of inwardMoves) {
      const resized = resizeCrop(crop, handle, dx, dy);
      expect(resized.x).toBeGreaterThanOrEqual(0);
      expect(resized.y).toBeGreaterThanOrEqual(0);
      expect(resized.x + resized.width).toBeLessThanOrEqual(1);
      expect(resized.y + resized.height).toBeLessThanOrEqual(1);
      expect(resized.width).toBeCloseTo(
        shrinksWidth ? MIN_CROP_SIZE : crop.width,
      );
      expect(resized.height).toBeCloseTo(
        shrinksHeight ? MIN_CROP_SIZE : crop.height,
      );
    }
  });

  it("zooms around the pointer while preserving its relative focal point", () => {
    const crop = { x: 0.2, y: 0.2, width: 0.6, height: 0.6 };
    const zoomed = scaleCrop(crop, 0.5, { x: 0.35, y: 0.35 });
    expect(zoomed).toEqual({ x: 0.275, y: 0.275, width: 0.3, height: 0.3 });
    expect(cropZoomPercent(zoomed)).toBe(333);
    expect(scaleCrop(FULL_CROP, 99)).toEqual(FULL_CROP);
  });

  it("rotates and flips the selected pixels reversibly", () => {
    const crop = { x: 0.1, y: 0.2, width: 0.3, height: 0.4 };
    const clockwise = rotateCrop(crop, true);
    expect(clockwise).toEqual({ x: 0.4, y: 0.1, width: 0.4, height: 0.3 });
    const restored = rotateCrop(clockwise, false);
    expect(restored.x).toBeCloseTo(crop.x);
    expect(restored.y).toBeCloseTo(crop.y);
    expect(restored.width).toBeCloseTo(crop.width);
    expect(restored.height).toBeCloseTo(crop.height);
    const flippedTwice = flipCrop(flipCrop(crop));
    expect(flippedTwice.x).toBeCloseTo(crop.x);
    expect(flippedTwice.y).toBeCloseTo(crop.y);
  });

  it("keeps rotate controls visually directional after a horizontal flip", () => {
    expect(rotationAfterVisualTurn(0, true, false)).toBe(90);
    expect(rotationAfterVisualTurn(0, false, false)).toBe(270);
    expect(rotationAfterVisualTurn(0, true, true)).toBe(270);
    expect(rotationAfterVisualTurn(0, false, true)).toBe(90);

    const crop = { x: 0.12, y: 0.2, width: 0.34, height: 0.42 };
    const flipped = flipCrop(crop);
    const visuallyClockwise = rotateCrop(flipped, true);
    const restored = rotateCrop(visuallyClockwise, false);
    expect(restored.x).toBeCloseTo(flipped.x);
    expect(restored.y).toBeCloseTo(flipped.y);
    expect(restored.width).toBeCloseTo(flipped.width);
    expect(restored.height).toBeCloseTo(flipped.height);
  });

  it("creates the largest centered identity-card crop", () => {
    const landscape = identityCardCrop(2000, 1000);
    expect((landscape.width * 2000) / (landscape.height * 1000)).toBeCloseTo(
      ID_CARD_RATIO,
    );
    const portrait = identityCardCrop(1000, 2000);
    expect((portrait.width * 1000) / (portrait.height * 2000)).toBeCloseTo(
      ID_CARD_RATIO,
    );
    expect(landscape.x + landscape.width / 2).toBeCloseTo(0.5);
    expect(portrait.y + portrait.height / 2).toBeCloseTo(0.5);
  });

  it("maps extreme normalized values to finite source pixels", () => {
    expect(pixelCrop(100, 80, { x: -9, y: 9, width: 20, height: 0 })).toEqual({
      x: 0,
      y: 78,
      width: 100,
      height: 2,
    });
    expect(pixelCrop(0, Number.NaN, FULL_CROP)).toEqual({
      x: 0,
      y: 0,
      width: 1,
      height: 1,
    });
  });

  it("matches the vault minimum before enabling a crop", () => {
    expect(
      cropOutputIsLargeEnough(2000, 1000, {
        x: 0,
        y: 0,
        width: 0.15,
        height: 0.18,
      }),
    ).toBe(true);
    expect(
      cropOutputIsLargeEnough(2000, 1000, {
        x: 0,
        y: 0,
        width: 0.12,
        height: 0.12,
      }),
    ).toBe(false);
    expect(cropOutputIsLargeEnough(299, 180, FULL_CROP)).toBe(false);
  });

  it("caps dense output pixels without shrinking narrow images", () => {
    expect(boundedOutputDimensions(5000, 5000)).toEqual({
      width: 3200,
      height: 3200,
    });
    expect(boundedOutputDimensions(5000, 200)).toEqual({
      width: 5000,
      height: 200,
    });
    expect(boundedOutputDimensions(Number.NaN, 0)).toEqual({
      width: 1,
      height: 1,
    });
  });

  it("swaps transformed dimensions for quarter turns", () => {
    expect(transformedImageSize(1200, 800, 90)).toEqual({
      width: 800,
      height: 1200,
    });
    expect(transformedImageSize(1200, 800, 180)).toEqual({
      width: 1200,
      height: 800,
    });
  });
});
